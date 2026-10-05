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
const { localControl, localText } = require('./citations');

// Drilling, chasing or cutting concrete, masonry or stone is processing a crystalline
// silica substance. These lines go with any step that does it.
const SILICA_FOLLOW_UP = [
  src('Assess in writing before starting whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation.', WHS('s 529CA')),
  src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
  src('Dust and slurry are cleaned up at least at the end of each day or task, with an H class vacuum (M class only where H class is not reasonably practicable) or wet methods. No dry sweeping, compressed air or blowers, including for clothing.', QCODE('Silica', 's 7.4.2, s 8.1, s 8.2, s 8.3')),
];

// The same lines for installed engineered stone, which says the assessment covers removal and repair
// too (Victoria words this line as an engineered stone process, always high risk, r 319C, r 319E).
const ENG_STONE_SILICA = [
  { ...SILICA_FOLLOW_UP[0], text: SILICA_FOLLOW_UP[0].text.replace('whether the processing is high risk.', 'whether the processing is high risk, including where the stone is only removed, repaired or modified.') },
  ...SILICA_FOLLOW_UP.slice(1),
];

// Processing installed engineered stone: allowed only to remove, repair, make minor modifications
// to or dispose of it, and only if it is controlled (s 529B, s 529D, s 529F), with notice to the
// regulator before the work, of any change and after 12 months, each kept for 5 years (s 529G to s 529J).
const ENG_STONE = [
  src('Installed engineered stone is cut, drilled or broken only to remove, repair, make minor modifications to or dispose of it, and only if the processing is controlled: the risks are minimised so far as is reasonably practicable, at least one of isolation from the dust, an enclosed operator cabin with high efficiency air filtration, wet dust suppression, on-tool extraction or local exhaust ventilation is used, and anyone still at risk wears respiratory protective equipment.', WHS('s 529B, s 529D, s 529F')),
  src('Before installed engineered stone is processed, written notice of the work, its type, and its frequency and duration is given to the regulator in the form it requires. Any change is notified within 30 days, work still going 12 months after the last notice is notified again within 30 days, and a copy of each notice is kept for 5 years.', WHS('s 529G, s 529H, s 529I, s 529J')),
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
  { when: 'mineSite', text: 'On a mine or quarry site, the work also follows the site\'s safety and health management system, induction and rules, as the state\'s mining safety law requires.' },
  { when: 'airside', text: 'Work airside follows the airport operator\'s airside permit and rules: airside induction and escort, vehicle and plant permits, and stopping work when aircraft movements require it.' },
  { when: 'bollards', unless: 'footpathWork', text: 'The work area is closed to vehicles with barriers, cones and signs before work starts.' },
  // Services are found before the first hole is drilled or dug for bollards, stops or humps.
  { when: 'bollards', unless: 'coreDrill', text: src('Get the current underground services information before drilling or digging, and work to it.', WHS('s 304')) },
  { when: 'bollardFuel', text: 'At a service station or other fuel site, work follows the site operator\'s permit and hazardous area rules: no ignition sources in the zones around dispensers, vents and tank fill points, and underground tanks and fuel lines are located before any drilling or digging.' },
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
  { when: 'ictWork', unless: 'networkCable', text: src('Cabling work is done by a registered cabling provider whose registration covers the work (an open registration, with the extra units of competency for structured, optical fibre or coaxial cabling notified to the registrar), or by a cabler directly supervised at all times by one who holds that competency and accepts full responsibility for the work. All cabling complies with the Wiring Rules (AS/CA S009), and cabling and equipment comply with the Labelling Notice.', CPR('s 21, s 22, s 23, s 24')) },
  { when: 'ictWork', unless: 'networkCable', text: src('When the cabling work is complete, the registered cabling provider gives a statement that it complies fully with the Wiring Rules to their employer and the customer, and keeps a copy for at least 1 year.', CPR('s 25')) },
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

// Fixing hangers and supports for ducts and pipes, drilled into the slab above.
const HANGERS_STEP = {
  step: 'Fix hangers and supports',
  hazards: [{ unless: 'houseRoofDucts', text: 'Silica dust from drilling hanger anchors.' }, { unless: 'houseRoofDucts', text: 'Cutting a post-tensioning tendon when drilling.' }, { only: 'houseRoofDucts', text: 'Dust from cutting outlet holes in the ceiling.' }, 'Tools and fixings fall onto people below.'],
  controls: [
    { unless: 'houseRoofDucts', text: 'Before drilling into a slab, scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval. Other detected services are isolated and confirmed before drilling near them.' },
    { unless: 'houseRoofDucts', ...src('Drill anchors with on-tool extraction, and wear a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`) },
    { unless: 'houseRoofDucts', ...src('Assess in writing before drilling whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')) },
    { unless: 'houseRoofDucts', ...src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')) },
    { only: 'houseRoofDucts', text: 'Ducts are hung from the roof framing on straps. Outlet holes in the ceiling are cut with a hole saw with dust extraction, from below and after checking for cables.' },
    src('Barricade and sign the area below.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
    'Stop tools and materials falling.',
  ],
};

// Working from ladders: its own step wherever ladders are the likely access.
const LADDER_STEP = {
  step: 'Work from ladders',
  hazards: ['A fall from the ladder.', 'The ladder slips, tips or breaks.', 'Contact with power lines or live electrical parts.'],
  controls: [
    'A platform ladder, EWP or scaffold is used where the work is more than short and light, or needs both hands.',
    src('Ladders are industrial and rated for at least 120 kg.', WHS('s 306M')),
    src('When working from a ladder, keep two feet and one other point of contact with it, and use a tool belt.', MODEL('Managing the risk of falls', 's 9.1')),
    'Single and extension ladders are used for access or short, light work only, set on firm level ground at about 1 in 4, secured top and bottom, and extending 900 mm above the landing.',
    'Near power lines or live electrical parts, ladders are non-conductive and kept outside the approach distances.',
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
        src('The principal contractor manages the risks from traffic near the site.', WHS('s 315')),
        'Where there is no principal contractor, our supervisor puts the traffic management plan in place.',
        'Traffic controllers who hold Queensland traffic controller accreditation direct vehicles, pedestrians and traffic on the footpath and road, as the traffic management plan sets out.',
        'Keep work, plant and materials inside the separated work area.',
        { text: 'Over or next to a railway, work goes ahead only under the rail operator\'s access permit and its protection officer arrangements.', only: 'railCorridor' },
        'Footpath or road closures have written approval from the authority that controls the area.',
        'A physical barrier separates the work area from live traffic, and pedestrians are diverted on a safe, marked route.',
        'Deliveries are unloaded inside the site or the closed work area, not from the live road, where practicable.',
        'A spotter guides trucks reversing into or out of the work area.',
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
          { unless: 'houseWork', ...src('Where the scaffold is next to a street, the principal contractor provides the hoarding, gantry or closure the regulation requires, and lifts over the footpath happen only with the area closed or a gantry in place.', WHS('s 315F, s 315G, s 315L')) },
          src('Exclusion zone below with keep out signs and a person controlling it while erecting and dismantling.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
          { unless: 'scaffoldDismantleOnly', text: 'Check the ground and set out base plates and sole boards to the scaffold design.' },
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
          // A stair tower is its own stair: its flights, handrails and landings go in with each lift.
          { only: 'stairTower', text: 'The stair modules, stair handrails and landing guardrails are fitted as each lift goes up, and the scaffolders climb only by the stair already built and protected below them.' },
          { only: 'stairTower', text: 'The stair tower is tied or braced to the structure, or stands on its own ballast or outriggers, as its design shows, before anyone climbs above the first lift.' },
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
          { only: 'stairTower', text: 'Every flight, handrail, landing and gate is checked at handover, and the stair stays closed to other workers until it is complete to its top landing.' },
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
      step: 'Install and dismantle the hoist',
      unless: 'hoistClimbOnly',
      hazards: ['A fall from the mast or landing.', 'The hoist or mast collapses.', 'Crush between the car and the mast or landing.'],
      controls: [
        { fact: 'systemInstructions' },
        src('Setting up and dismantling a hoist is rigging work: basic rigging for hoists, intermediate rigging for hoists with jibs and self-climbing hoists. Sight each licence before work.', WHS('s 81, s 85, schedule 3')),
        src('A personnel hoist with platform travel over 2.4 m has a registered design, and the registration number is kept at the hoist.', WHS('s 243, s 260, schedule 5')),
        src('Installed, climbed and dismantled by competent people to the manufacturer\'s instructions, stable throughout, and not commissioned until it is without risk so far as reasonably practicable, including inspections.', `${WHS('s 204')}; ${MODEL('Managing the risks of plant in the workplace', 's 3.2, s 3.9')}`),
        src('Exclusion zone below the mast during installation and climbing.', WHS('s 55')),
        src('During installation the car is controlled only from the car top by the person on it, with other controls isolated, as the manufacturer\'s instructions set out.', WHS('s 204')),
        src('Where harnesses are used, anchors are approved by a competent person, no one works alone, and a rescue procedure is set up and tested.', WHS('s 80, s 306I')),
      ],
    }, {
      step: 'Climb the hoist mast',
      hazards: ['A fall from the mast or landing.', 'The hoist or mast collapses.', 'Crush between the car and the mast or landing.'],
      controls: [
        { fact: 'systemInstructions' },
        src('Setting up and dismantling a hoist is rigging work: basic rigging for hoists, intermediate rigging for hoists with jibs and self-climbing hoists. Sight each licence before work.', WHS('s 81, s 85, schedule 3')),
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
        step: 'Set up roof access',
        hazards: ['A fall from the ladder or stair while getting onto the roof.'],
        controls: [
          'Access by a scaffold stair, or a ladder secured top and bottom that extends above the landing.',
          'Fall protection is installed and checked before anyone goes onto the roof.',
        ],
      },
      {
        step: 'Install roof edge protection',
        hazards: ['Falling from the roof edge or through openings.', 'Falling through fragile sheets or skylights.'],
        controls: [
          { fact: 'fallControl' },
          'Fall protection is installed and checked before anyone goes onto the roof.',
          { unless: 'roofStrip', text: 'Safety mesh is run out from the protected edge, and installers work only over bays already meshed or from the edge protection. No one walks on unmeshed purlins.' },
          src('Roof edge protection is erected to the manufacturer\'s instructions: top rail at least 900 mm above the surface, a toe board at least 150 mm high or a bottom rail 150 mm to 250 mm above the surface, and no more than 450 mm between rails, or between the lowest rail and the toe board. On slopes over 26 degrees, mesh or sheeting to 900 mm.', WHS('s 306E')),
          src('Skylights, fibreglass, brittle sheets, membrane panels and any other surface a person could fall through are covered with fixed covers that take a fall, or fenced off. Where safety mesh is used, it does not protect edges or holes, so it is used with edge protection.', `${WHS('s 78, s 306F')}; ${MODEL('Managing the risk of falls', 's 3.1, s 5.3')}`),
          src('Travel restraint may not be practicable on fragile roofing or slopes over 15 degrees, where fall arrest may be more appropriate. Where fall arrest is used near edges, swing down is controlled with guard rails or mobile anchors.', QCODE('Managing the risk of falls', 's 6.1, s 7.3')),
          'Travel restraint is not used on fragile roofing or slopes over 15 degrees.',
          src('Where fall arrest is used, anchors are tested and approved by a competent person before first use and meet the anchor strength in AS/NZS 1891.4, there is enough clearance below that the user cannot hit the ground or another surface, no one uses it alone, at least one other person on site can rescue them, and the rescue procedure is tested.', `${WHS('s 80, s 306I')}; ${QCODE('Managing the risk of falls', 's 7.3, s 10.1')}`),
          src('Anchors are rated for at least 15 kN for one person who could free fall (12 kN where only a limited free fall is possible, 21 kN for two people).', WHS('s 306I')),
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
        unless: 'roofRemoveOnly',
        step: 'Fix new roofing',
        hazards: ['Fall from height.', 'Slipping on wet or dewy roof sheets.', 'Power tool injuries.', 'Noise from cutting.', 'Skin and eye irritation from insulation, where it is installed.', 'Cuts from sheet edges and offcuts.', 'Heat and sun exposure.'],
        controls: [
          'Stay inside the edge protection at all times.',
          'Use tools with guards in place. Keep leads away from edges.',
          'Roof sheets are slippery when wet, dewy or dusty. Do not walk or work on them in those conditions.',
          'Wear cut resistant gloves when handling sheets, flashings and offcuts.',
          { text: 'Where insulation and sarking are installed, handle them with long sleeves and gloves. Wear a P2 respirator where cutting releases fibres or dust.', unless: 'insulation' },
          { unless: 'roofOverDeck', text: 'Before flashing around flues, exhausts or plant on the roof, the trade that owns the plant isolates it, so hot exhaust or moving parts cannot reach the roofer.' },
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
        // The stripping itself, said once here rather than in the set-up step.
        'Old sheets come off bay by bay, and safety mesh is run out over each stripped bay from the protected edge before new sheets go on.',
        { unless: 'brittleRoof', text: 'On the old roof sheeting, walk only on the sheets over the purlin lines, or on safety mesh. No one stands on bare purlins.' },
        { only: 'asbestosRoof', text: 'Asbestos cement sheets are wrapped on the roof and lowered by hoist, crane or by hand down a scaffold, never dropped or slid down.' },
        { only: 'brittleRoof', text: 'No one walks on the old fibre cement sheets. Work is done from roof ladders or crawl boards spanning the purlins, from an EWP, or from the edge protection.' },
        { unless: 'asbestosNamed', text: 'Old roof sheets on a building built before 2004 (asbestos products were used until the national ban at the end of 2003) are checked for asbestos cement before they are disturbed.' },
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
        // A damaged pit is broken out once the ground around it is dug, before anyone works in the trench.
        only: 'pitReplace',
        step: 'Break out the damaged pit',
        hazards: ['Silica dust, noise and vibration from the hydraulic breaker.', 'Broken concrete falls or is swung onto a person.'],
        controls: [
          'The damaged pit is broken out with a hydraulic breaker on water suppression, with a fit tested P2 respirator and hearing protection, and the pieces are lifted out by the excavator.',
          'No one is in the excavation or within reach of the breaker or bucket while the pit is broken out and lifted out.',
        ],
      },
      {
        step: 'Work in the trench',
        hazards: ['Trench collapse buries a worker.', 'Falling into the trench.', 'Water or bad air in the trench.'],
        controls: [
          { only: 'deepTrench', text: 'No one enters the trench until the support is in place and checked.' },
          { only: 'deepTrench', ...src('Work only inside the trench support, with the access ladder secured to it.', QCODE('Excavation work', 's 4.4, s 6.3')) },
          { unless: ['deepTrench', 'tankPit'], ...src('Before anyone enters, check the depth. The trench is kept shallower than 1.5 m. If it must go deeper, work stops and this SWMS is reviewed: a trench deeper than 1.5 m is high risk construction work, and a trench 1.5 m deep or more is shored, benched or battered before anyone enters.', WHS('s 291, s 306')) },
          // The tank pit has its own line in the tank step: here it is the pipe trenches.
          { only: 'tankPit', unless: 'deepTrench', ...src('Before anyone enters, check the depth. The pipe trenches are kept shallower than 1.5 m. If one must go deeper, work stops and this SWMS is reviewed: a trench deeper than 1.5 m is high risk construction work, and a trench 1.5 m deep or more is shored, benched or battered before anyone enters.', WHS('s 291, s 306')) },
          { fact: 'fallControl' },
          src('A competent person checks the trench walls and support at the start of each shift and frequently, including after rain. Any damage is repaired from above before work below continues.', QCODE('Excavation work', 's 6.7')),
          src('Check the air with a gas monitor before entry, with a safety observer at the surface.', MODEL('Excavation work', 's 4.6')),
          src('The emergency plan covers ground slip, flooding, gas leaks and rescue from the trench.', MODEL('Excavation work', 's 3.7')),
        ],
      },
      // Pipes, pits and conduits are each laid only where the task names them; pipes where it names none.
      {
        unless: 'noPipeLaying',
        only: 'trenchPipes',
        step: 'Lay pipes',
        hazards: ['A suspended pipe or pit strikes or crushes a person.', 'Hands crushed between the load and the trench wall.', 'Strain lifting pipe lengths.', { only: 'sewerRepair', text: 'Contact with sewage and sewer gas when the broken pipe is opened.' }],
        controls: [
          // A broken sewer is opened only once the flow in it is stopped.
          { only: 'sewerRepair', text: 'Before the broken pipe is cut out, the flow is stopped: the occupants are told not to use water, and the line is plugged or bypassed upstream. The air at the open pipe is checked with a gas detector before anyone works at it.' },
          { only: 'sewerRepair', text: 'Gloves, eye protection and overalls are worn, cuts are covered, sewage-soaked soil and the old pipe are bagged for disposal, and hands are washed before eating.' },
          'Where pipes or pits are lifted with the excavator, this is done only where it has a rated lifting point, the load is within its lifting chart, and the operator is competent to lift with it.',
          'No one is in the trench under a suspended load. Guide loads with tag lines from outside the trench until they are near the bottom.',
          'Keep hands clear between the load and the trench wall when lowering.',
          'Team lift or use mechanical aids for pipe lengths and small pits.',
        ],
      },
      {
        unless: 'noPipeLaying',
        only: 'trenchPits',
        step: 'Install pits',
        hazards: ['A suspended pipe or pit strikes or crushes a person.', 'Hands crushed between the load and the trench wall.', 'Strain handling pit sections and lids.'],
        controls: [
          'Where pipes or pits are lifted with the excavator, this is done only where it has a rated lifting point, the load is within its lifting chart, and the operator is competent to lift with it.',
          'No one is in the trench under a suspended load. Guide loads with tag lines from outside the trench until they are near the bottom.',
          'Keep hands clear between the load and the trench wall when lowering.',
          'Team lift or use mechanical aids for pipe lengths and small pits.',
          'Pits are set on their prepared base and levelled from outside the trench where possible, and open pits are covered or fenced when no one is working at them.',
        ],
      },
      {
        unless: 'noPipeLaying',
        only: 'trenchConduits',
        step: 'Lay conduits',
        hazards: ['A suspended conduit bundle strikes or crushes a person.', 'Hands crushed between the load and the trench wall.', 'Strain lifting conduit lengths and bundles.'],
        controls: [
          'Where pipes, pits or conduit bundles are lifted with the excavator, this is done only where it has a rated lifting point, the load is within its lifting chart, and the operator is competent to lift with it.',
          'No one is in the trench under a suspended load. Guide loads with tag lines from outside the trench until they are near the bottom.',
          'Keep hands clear between the load and the trench wall when lowering.',
          'Team lift or use mechanical aids for pipe lengths, conduit bundles and small pits.',
        ],
      },
      {
        unless: 'noBackfillStep',
        step: 'Backfill the trench',
        hazards: ['Plant strikes a person.', 'An open trench is left unprotected.', 'Noise and vibration from compaction plant.', 'A roller overturns at a trench edge or slope.'],
        controls: [
          { only: 'deepTrench', text: 'Remove the support as backfilling proceeds, as designed.' },
          'Cover or barricade any open trench overnight.',
          'Where spoil is carted by truck or loader, haul routes are kept apart from people, reversing and tipping are guided by a spotter, and plant stops back from the tip edge.',
          'Plate compactors and rollers are used with guards in place. Ride-on rollers have rollover protection, the seatbelt is worn, and they stay back from trench edges and steep slopes.',
          'Rotate compactor operators to limit hand-arm and whole-body vibration, and wear hearing protection.',
        ],
      },
      {
        unless: 'noBackfillStep',
        only: 'trenchReinstate',
        step: 'Reinstate the surface',
        hazards: ['Plant strikes a person.', 'Noise and vibration from compaction plant.'],
        controls: [
          'The surface is made good over the compacted trench to match what was there, and the area stays barricaded until it is safe to walk or drive on.',
          src('Where concrete or paving is cut to reinstate it, it is cut wet or with on-tool extraction, anyone still at risk wears a fit tested P2 respirator, and the written silica assessment covers the cutting.', `${WHS('s 529B, s 529C, s 529CA')}; ${QCODE('Silica', 's 7.4.1, s 7.4.2, s 7.6.1, s 7.6.2')}`),
          'Plate compactors and rollers are used with guards in place. Ride-on rollers have rollover protection, the seatbelt is worn, and they stay back from trench edges and steep slopes.',
          // A trench cut through a driveway or path is made good once it is backfilled.
          { only: 'pavedReinstate', text: 'The driveway or path is reinstated over the compacted trench: the edges are formed, and the concrete is placed and finished by barrow or chute, with gloves and boots worn and wet concrete washed off the skin straight away.' },
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
        // The demolition crew's part is taking the props out; completing the structure is other trades' work.
        step: 'Remove the props',
        only: 'propping',
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
          'The principal contractor gives the crane company the ground information for the set-up area (geotechnical report, slab or deck capacity, services and excavations below), and the crane is set up only where that confirms the ground can take its outrigger or track loads.',
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
          { fact: 'groundBearing' },
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
        step: 'Install loading platforms',
        only: 'loadPlatformInstall',
        hazards: ['A person falls from the loading platform or slab edge.', 'Materials fall from the floor or the platform.'],
        controls: [
          { fact: 'systemInstructions' },
          'Where edge protection is opened to fit or move a platform, no one is at the gap unless restrained, and the edge protection or the platform gates close it again straight after.',
          'Each loading platform is inspected before use and signed with its rated load.',
        ],
      },
      {
        step: 'Load out the floors',
        unless: 'loadPlatformOnly',
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
        hazards: ['A person is struck by the forklift or its load.', 'The forklift tips over.', { unless: 'noSlab', text: 'A suspended slab is overloaded.' }, { only: 'trailerUnload', text: 'The load shifts or falls when its restraints are released.' }],
        controls: [
          { unless: 'telehandlerOnly', text: 'Forklift operators hold a high risk work licence for forklift trucks. Telehandler operators are trained and assessed for the machine, and hold a crane licence where its set-up needs one.' },
          { only: 'telehandlerOnly', text: 'Telehandler operators are trained and assessed for the machine and its attachments, and hold a crane licence where its set-up needs one. The telehandler works on firm, level ground within its load chart for the reach.' },
          'Separate people from forklift routes with barriers, and use a spotter where people are near.',
          { unless: 'noSlab', text: 'Wheel stops or barriers at slab edges and penetrations on forklift routes.' },
          { unless: 'noSlab', fact: 'loadLimits' },
          { unless: 'noSlab', text: 'Check the slab and the backpropping can take the forklift and its load before it is used on a suspended floor, and keep to the routes and areas the load limits allow.' },
          { only: 'trailerUnload', text: 'Before restraints are released, the load is checked from the ground for shifting. No one stands where a load could fall as straps or chains are released, and the driver waits in a safe place away from the unloading.' },
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
        unless: 'formStripOnly',
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
        unless: 'formStripOnly',
        step: 'Install edge protection',
        hazards: ['A person falls from an open edge of the deck or through gaps in it.', 'Materials fall from the edge.'],
        controls: [
          { fact: 'fallControl' },
          'Edge protection and handrails to parapets are installed from inside the deck, from a working platform, or fixed to the formwork before it is lifted into place. No one works outside them while installing them.',
          src('Where objects could fall on people outside the site, the principal contractor closes the adjoining area or erects perimeter containment screening before formwork is erected or dismantled.', WHS('s 315H, s 315I')),
          src('Where the deck slopes more than 26 degrees, mesh or sheeting extends at least 900 mm up the edge protection.', WHS('s 306E')),
        ],
      },
      {
        unless: 'formStripOnly',
        step: 'Lay the formwork deck',
        hazards: ['A person falls from an open edge of the deck or through gaps in it.', 'Cuts, dust and noise from power saws.', 'Manual handling: carrying and placing ply sheets, often in wind.'],
        controls: [
          { fact: 'fallControl' },
          'Ply sheets are carried by two people or with sheet lifters, and sheet handling stops when wind lifts the sheets.',
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
        unless: 'formStripOnly',
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
        unless: 'formStripOnly',
        step: 'Form penetrations and voids',
        hazards: ['A person falls through a penetration or void.'],
        controls: ['Cover penetrations straight away with fixed covers that can take the load and are marked, or fence them off.'],
      },
      {
        unless: 'formStripOnly',
        step: 'Inspect before the pour',
        hazards: ['Formwork fails during the pour.'],
        controls: ['A competent person checks the formwork and falsework are built to the design, and signs it off, before the pour.'],
      },
      {
        unless: 'formStripOnly',
        step: 'Monitor the formwork during the pour',
        hazards: ['Formwork or falsework fails under the wet concrete.', 'A person under the loaded deck is struck if it fails.'],
        controls: [
          'No one is under the deck or inside the falsework while it carries wet concrete, and the area below is barricaded and signed.',
          'A competent formwork watcher stays in a safe position outside that zone for the whole pour and can stop it at once. Adjustments are made only from outside the zone, and only as the formwork design allows.',
          'The stop-pour signal is agreed with the pump operator and the concreting crew before the pour starts.',
        ],
      },
      {
        step: 'Strip the formwork',
        hazards: ['The slab or falsework collapses.', 'Falling formwork strikes a person.', 'Manual handling: lowering ply and beams from overhead.'],
        controls: [
          { only: 'tableForms', text: 'Table forms are flown out by the crane only from a landing point set up to the supplier\'s procedure, rigged by licensed riggers, with no one under the load and edge protection put back straight after.' },
          'Strip only when the engineer confirms the concrete strength, in the order in the formwork design. For a post-tensioned slab, strip only after stressing is complete and the post-tensioning engineer releases the slab.',
          'Exclusion zone below and around the area being stripped.',
          'Lower components in a controlled way with stripping tools. Do not drop them or catch them from overhead.',
        ],
      },
      {
        step: 'Install backprops',
        hazards: ['The slab or falsework collapses.'],
        controls: [
          'Install backprops progressively as each bay is stripped, to the design, and leave them until the design allows removal.',
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
        step: 'Fix the wall reo from the platforms',
        hazards: ['Overloading the platforms.', 'Impalement on exposed bars.', 'Dropped bars and tools.'],
        controls: [
          'Land materials on the platforms within the supplier\'s rated platform load.',
          'Cap or cover exposed bars.',
          'Keep tools tethered or contained when working near the platform edges.',
        ],
      },
      {
        step: 'Set the wall forms from the platforms',
        hazards: ['Overloading the platforms.', 'A form panel swings or falls while it is moved.', 'Impalement on exposed bars.', 'Dropped bars and tools.'],
        controls: [
          'Land materials on the platforms within the supplier\'s rated platform load.',
          'Wall form panels are moved and closed with the jumpform\'s own gear, as the supplier\'s procedure sets out, and are tied before anyone lets them go.',
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
        unless: 'reoNoDeck',
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
        hazards: ['Hose whip at start-up or when a blockage clears.', 'A burst line.', { unless: 'noDeck', text: 'A person falls from the edge or through the deck.' }, { only: 'noDeck', text: 'A person falls from the pour platform or into the open excavation.' }, 'A reversing concrete truck strikes a person.', 'Electric shock and vibration from vibrators.', 'Exhaust fumes from generators.', { unless: 'noDeck', text: 'Eye injury when blowing out decks with compressed air.' }],
        controls: [
          'Check pipes, clamps and the end hose before pumping.',
          'Keep people clear of the end hose at start-up. Clear blockages only after the pressure is released.',
          src('Start the pump slowly. No metal fittings on the free end of the delivery hose, the hose is never stretched to reach, and no more hose hangs from the boom than the manufacturer allows.', QCODE('Concrete pumping', 's 4.1.4')),
          src('Keep the hopper topped up so air is not drawn in. Where air is in the line, keep people out of an exclusion zone, and purge into a bin before moving the boom over the pour.', QCODE('Concrete pumping', 's 4.1.4, s 4.3.2')),
          src('When opening a coupling, stand to one side, never straddle the line, and never try to restrain the hose. Blockages are not cleared with compressed air. Lines are cleaned with water rather than air, and the pump operator stays at the controls while the line is under pressure.', QCODE('Concrete pumping', 's 4.3.5, s 4.3.6')),
          { unless: 'noDeck', text: 'Stay inside the edge protection.' },
          { unless: 'noDeck', text: 'Place concrete evenly. Do not heap it on the deck beyond what the formwork design allows.' },
          { unless: 'noDeck', text: 'Workers reach the deck only by a stair tower, scaffold stair or secured ladder. Hoses, screeds and tools are lifted up, not carried up ladders, and hose runs and walkways over the reo are kept clear and boarded.' },
          { only: 'noDeck', text: 'Concrete is placed from work platforms with edge protection, or from outside the excavation behind barriers, and no one stands at an unprotected edge.' },
          { only: 'tremiePour', text: 'Concrete is placed through the tremie from the bottom up, with the tremie end kept in the concrete as the pour method sets out. Tremie sections are lifted and handled by crane, slung by licensed doggers. The open panel or bore is covered or barricaded, and support fluid pushed out by the concrete is pumped to storage.' },
          { only: 'concreteConveyor', text: 'The conveyor is guarded, set up on firm ground, and stopped and isolated before anyone cleans it or clears a blockage.' },
          { text: 'The pour starts only once the formwork and props have been inspected and signed off by a competent person, and penetrations and voids are covered and fixed.', unless: 'noFormWatch' },
          { text: 'A competent formwork watcher checks the formwork during the pour and can stop the pour.', unless: 'noFormWatch' },
          'On a slab on ground, concrete trucks stand back from excavation edges, and people keep clear of the chute while it is swung or extended.',
          { text: 'No one works under the deck being poured except the formwork watcher in a safe position, and the area below is barricaded and signed.', unless: 'noUnderDeck' },
          'The hose hand stays in contact with the operator by radio or agreed signals.',
          'Concrete trucks reverse only with a spotter, into a marked area kept clear of people.',
          'Vibrators have their leads checked and tagged and are protected by an RCD. Rotate operators to limit hand-arm vibration.',
          'Generators, petrol trowels and petrol saws run only outdoors or where exhaust cannot collect, and are refuelled only when stopped and cool.',
          { unless: 'noDeck', text: 'Vacuum decks first. Compressed air is used only for loose debris the vacuum cannot reach, never on concrete dust or slurry, with eye protection and a P2 respirator, and others kept clear.' },
        ],
      },
      {
        unless: 'noDeck',
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
        step: 'Cut the tendon tails',
        hazards: ['Cutting disc injuries and noise.'],
        controls: [
          'Cut tendon tails only after the engineer accepts the stressing records.',
          'Use cutting tools with guards in place, with hearing protection.',
        ],
      },
      {
        step: 'Grout the tendon ducts',
        hazards: ['Grout on the skin and in the eyes.', 'Dust from mixing bagged grout.', 'Grout hose bursts or blockages.'],
        controls: [
          'Wear gloves and eye protection when grouting, and a P2 respirator when mixing bagged grout.',
          'Check grout pump hoses and fittings before use. Release the pressure before clearing a blockage.',
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
        { unless: 'civilSite', text: 'Check the slab, working platform or ground can take the platform, and keep it back from edges, penetrations and open excavations.' },
        { only: 'civilSite', text: 'Check the ground, deck or working platform can take the platform, and keep it back from edges, batters and open excavations.' },
        src('Use the platform only on a solid level surface, unless it is designed for rough terrain.', QCODE('Managing the risk of falls', 's 5.1')),
        { unless: 'civilSite', text: 'Sequence trades so they are not working above or below each other.' },
        { only: 'ubiu', text: 'The under-bridge unit works inside a lane closure under the traffic management plan, with its outriggers set and the deck checked for its loads, and is run only by its trained operator.' },
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
      step: 'Grout the base',
      hazards: ['Grout dust, and grout on the skin and in the eyes.'],
      controls: [
        'Mix bagged grout with dust control. Wear a P2 respirator, gloves and eye protection.',
      ],
    }, {
      step: 'Remove the braces',
      hazards: ['An element falls if its braces are removed too early.'],
      controls: [
        'Braces stay in place until the grout reaches strength and the connections are complete, and the engineer approves their removal.',
      ],
    }],
  },
  {
    when: 'tempPower',
    steps: [
      {
        step: 'Install construction power',
        unless: 'tempLightOnly',
        hazards: ['Electric shock from damaged leads or equipment.', 'Leads damaged by plant, water or concrete.', 'Trips over leads.'],
        controls: [
          { fact: 'constructionTesting' },
          src('All construction wiring and electrical equipment complies with AS/NZS 3012.', ESR('s 140, s 192')),
          src('Construction wiring, switchboards and RCDs carry a test tag only if new, or inspected and tested by a competent person and found to comply with AS/NZS 3012, with the retest date and the tester shown.', ESR('s 140(3)-(4)')),
          src('Run leads where they will not be damaged, or protect them. Keep them off the ground on lead stands or insulated hangers, and away from doorways and sharp edges.', `${ESR('s 18')}; ${CODE('s 3')}`),
          src('Circuits have RCD protection as AS/NZS 3012 requires.', ESR('s 140')),
          src('A faulty RCD is disconnected or isolated at once, and is not used again until it is repaired or tested as safe.', ESR('s 17')),
          'If an RCD trips, the circuit stays off until a competent person finds the cause.',
        ],
      },
      {
        step: 'Install temporary lighting',
        hazards: ['Electric shock from damaged leads or equipment.', 'Trips over leads.', 'A fall while installing lighting at height.'],
        controls: [
          { fact: 'constructionTesting' },
          src('All construction wiring and electrical equipment complies with AS/NZS 3012.', ESR('s 140, s 192')),
          src('Construction wiring, switchboards and RCDs carry a test tag only if new, or inspected and tested by a competent person and found to comply with AS/NZS 3012, with the retest date and the tester shown.', ESR('s 140(3)-(4)')),
          src('Run leads where they will not be damaged, or protect them. Keep them off the ground on lead stands or insulated hangers, and away from doorways and sharp edges.', `${ESR('s 18')}; ${CODE('s 3')}`),
          src('Circuits have RCD protection as AS/NZS 3012 requires.', ESR('s 140')),
          'Temporary lighting at height is installed from a non-conductive platform ladder or a mobile scaffold, not from a stepladder near an open edge.',
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
      step: 'Install cable tray and containment',
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
    }, {
      // Cabling laid on the tray is its own step; heavy cables off drums come in the cable pulling step instead.
      step: 'Install cabling',
      only: 'trayCabling',
      unless: 'cablePull',
      hazards: ['A fall from a ladder, platform or elevating work platform.', 'A fall into an open riser or shaft.', 'Dropped tools and materials.', 'Contact with energised parts nearby.', 'Strain from pulling and lifting cable.'],
      controls: [
        src('Use non-conductive ladders for electrical work.', CODE('s 9.2')),
        src('Extension ladders used for electrical work are no longer than 9.2 m.', WHS('s 306M')),
        'Ladders are used for access, and work is done from the platforms set out in the fall controls.',
        'Risers and shafts are screened or covered at each level. Only the section being worked on is opened, and it is fenced.',
        src('Restrain tools with lanyards or holders when working near switchboards or above others.', QCODE('Managing electrical risks', 's 7.1')),
        src('Where an exposed energised part is within 3 m, de-energise it or fit covers, and use a safety observer where needed.', `${ESR('s 193')}; ${QCODE('Managing electrical risks', 's 6.1, s 7.2')}`),
        'Exclusion zone below open risers and work areas for dropped objects.',
        'Cable is paid out from drum stands or dispensers and laid on the tray, with team pulls planned and one person in charge.',
        'In enclosed areas, use battery or electric plant where practical. Otherwise ventilate, and monitor for exhaust fumes.',
      ],
    }],
    ppe: ['p2', 'earPlugs'],
  },
  {
    when: 'cablePull',
    steps: [{
      step: 'Pull cables and handle cable drums',
      hazards: ['A drum rolls or falls.', 'Back strain and crush injuries handling drums and cable.', 'Caught in a winch or struck by a cable under tension.', 'Contact with an existing energised cable.', { only: 'subBoardInstall', text: 'Electric shock at the main switchboard, which stays partly energised.' }],
      controls: [
        'Move drums with a forklift, crane or drum trailer. Forklifts are driven by a forklift licence holder, and crane loads are slung by a licensed dogger. Chock them, and pay out from a drum stand with a spindle.',
        'Use a winch with guards and a stop control. Keep people out of the line of pull and away from pulling points.',
        'Manual handling: team pull, rotate tasks, and keep cable bends and pulling points within reach without twisting.',
        src('Treat existing cables as energised until proved de-energised. Check both ends for isolation before cutting, and use a cable spiking device where it is fit for purpose.', `${ESR('s 196(2)')}; ${CODE('s 5.3')}`),
        src('Run the leads for winches and tools where they will not be damaged, or protect them.', ESR('s 18')),
        src('Helpers without an electrical licence assist only under the direct supervision of a licensed electrical worker, and do not touch energised equipment.', ESA('s 18(2)(g)')),
        'In risers, use cable grips and anti-runback brakes, keep radio contact between levels, and keep an exclusion zone below.',
        // A new sub-board's sub-mains are terminated at the main switchboard, which stays partly energised.
        { only: 'subBoardInstall', text: 'Before termination at the main switchboard, the circuit is isolated, locked and proved de-energised, and live parts nearby are shrouded.' },
        // A new main switchboard is connected to its consumer mains and submains once they are pulled in.
        { only: 'newMainBoard', text: 'Consumer mains and submains are terminated at the new board only once each is proved de-energised at its source, with the terminations made and tightened to the board maker\'s settings and checked before the board is closed up.' },
      ],
    }],
    ppe: ['gloveGeneral'],
  },
  {
    when: 'fitOff',
    // Rough-in and fit-off are done at different stages of the job, so each is its own step.
    steps: [{
      step: 'Rough-in',
      unless: 'fitOffOnly',
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
        { only: 'carParkWork', text: 'The work area in the car park is barricaded and signed, with vehicles kept out of it and a spotter used when plant or materials move across driving aisles.' },
      ],
    }, {
      step: 'Fit off',
      unless: 'roughInOnly',
      hazards: ['Contact with live conductors at fittings and outlets.', { only: 'ceilingFans', text: 'A ceiling fan falls while it is hung.' }, { unless: 'noRoofSpace', text: 'Work in ceiling spaces.' }, 'A fall from a ladder or platform.', { only: 'fitOffOnly', text: 'Swarf entering switchboards and enclosures.' }],
      controls: [
        'Fittings and outlets are connected only to circuits that are isolated and proved de-energised, and their covers are on before the circuit is livened.',
        { ...src('Work in a roof space (between the roof and the top floor ceiling) only when the electrical installation is de-energised. If that is not reasonably practicable, a risk assessment is done, the risks are as low as reasonably practicable, and the work follows a written statement of the controls.', ESR('s 31, s 33, s 34')), only: 'roofSpaceRule', unless: 'noRoofSpace' },
        { text: 'Before work in a roof space, the electrical installation is de-energised where practicable. If it cannot be, cables are treated as energised and the controls are set out in this SWMS.', unless: 'roofSpaceRule', only: 'roofSpaceWork' },
        { only: 'multiLevel', ...src('In ceiling spaces between floors, treat cables as energised until they are proved de-energised.', ESR('s 196(2)')) },
        src('Check for cables before drilling or chasing.', CODE('appendix C')),
        'Use platform ladders or a working platform, not the top steps of a stepladder.',
        { only: 'fitOffOnly', ...src('Cover open switchboards and enclosures to keep swarf out.', CODE('appendix C')) },
        { only: 'carParkWork', text: 'The work area in the car park is barricaded and signed, with vehicles kept out of it and a spotter used when plant or materials move across driving aisles.' },
        { only: 'ceilingFans', text: 'Ceiling fans are hung from a fixing rated for the fan, working from a platform ladder, with a second person for heavy fans.' },
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
          { only: 'hvWork', ...src('High voltage parts are isolated and earthed under the site or network high voltage switching procedure, by an authorised high voltage operator, before anyone works on them.', ESR('s 196')) },
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
              src('Before the work: a competent person\'s recorded risk assessment, this SWMS, clear access and exit, the isolation point labelled and quick to operate, and authorisation after consulting the person with management or control of the workplace, usually the principal contractor.', ESR('s 199, s 200')),
              src('Only authorised people enter the area, and barriers prevent contact with exposed energised parts.', ESR('s 201, s 202')),
              src('A safety observer, assessed in the last 12 months as competent in rescue and resuscitation, watches the work and does no other work.', `${ESR('s 203, schedule 10')}; ${CODE('s 7.3')}`),
              src('Tools, test equipment and PPE are suitable for the work, properly tested and in good working order.', ESR('s 203')),
              src('PPE rated for the energy at the point of work, such as an arc-rated face shield, insulated gloves and flame-resistant clothing.', CODE('s 9.5')),
              src('No watches, jewellery or other metal personal items. Fire extinguishers suitable for electrical fires are at hand.', QCODE('Managing electrical risks', 's 6.3, appendix C')),
              src('Energised work is authorised by: ____________ (position), after consulting ____________ (position) for the person with management or control of the workplace, usually the principal contractor.', `${ESR('s 199(1)(e)')}; ${QCODE('Managing electrical risks', 's 6.2, s 6.3')}`),
              'The principal contractor\'s ____________ (position) signs the permit.',
              src('Keep the risk assessment until at least 28 days after the work and this SWMS until the work is complete, or both for at least 2 years after a serious electrical incident or dangerous electrical event, readily available to the workers.', ESR('s 204')),
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
      // New work is tested before it is connected, then connected and commissioned.
      {
        step: 'Test the new work',
        hazards: ['People exposed while equipment is energised for testing.', 'New work energised before it is safe.'],
        controls: [
          src('Test new work so it is electrically safe before it is connected, and keep people not needed for testing safe while it is energised.', ESR('s 207')),
          src('Issue the certificate of testing and safety, and give the distribution entity the notice of test where it must examine or test the installation.', ESR('s 208, s 228')),
        ],
      },
      {
        step: 'Connect and commission',
        hazards: ['New work energised before it is safe.'],
        controls: [
          'Cable jointing resins are used as their safety data sheets set out, with chemical resistant gloves. Gas torches for heat shrink are used with an extinguisher nearby and flammables cleared.',
          { text: 'Before the main switchboard is first energised, do an arc flash (incident energy) assessment of it, so PPE is rated for the energy at the point of work.', only: 'mainSwitchboard' },
          { ...src('The consumer mains and main switchboard are not connected for the first time until the distribution entity has examined them, confirmed there are no serious defects and tested them.', ESR('s 217, s 218')), only: 'mainSwitchboard' },
          src('The electrical contractor connects only when satisfied the Act and regulation have been complied with.', ESR('s 223')),
          src('After later work, an installation is reconnected only if the work was done by a licensed person and tested as electrically safe and compliant with the wiring rules.', ESR('s 219')),
          src('Where we connect the installation, issue the certificate of testing and compliance.', ESR('s 229')),
          { only: 'hvWork', ...src('Any high voltage electrical installation is not connected until an accredited auditor has inspected and certified it.', ESR('s 221')) },
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
          { unless: 'noFloorBelow', text: 'Each core hole has the structural engineer\'s written approval before drilling. Scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole. Other detected services are isolated and confirmed before drilling near them.' },
          'Keep leads off wet floors and protect them with RCDs. Contain water and slurry.',
        ],
      },
      {
        step: 'Core drill through the slab or wall',
        hazards: ['Silica dust from drilling concrete.', 'Noise and vibration.', { unless: 'noFloorBelow', text: 'The core falls to the floor below.' }, { unless: 'noFloorBelow', text: 'A person falls through the hole.' }],
        controls: [
          { fact: 'silicaControls' },
          src('Drilling concrete is processing a crystalline silica substance. It is controlled by wet drilling, on-tool extraction or local exhaust.', `${WHS('s 529A, s 529B, s 529C')}; ${QCODE('Silica', 's 5.1, s 7.4.1, s 7.4.2')}`),
          src('Anyone still at risk of exposure after these controls wears a fit tested respirator (P2 or better).', `${WHS('s 529B')}; ${QCODE('Silica', 's 7.4.1, s 7.4.2, s 7.6.1, s 7.6.2')}`),
          src('Assess in writing before starting whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation.', WHS('s 529CA')),
          src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
          src('Air monitoring is done where it is not certain the exposure standard is met, and results are kept for 30 years. For high risk processing, results over the exposure standard go to the regulator within 14 days. Workers with a significant risk from ongoing exposure have health monitoring supervised by a registered medical practitioner.', `${WHS('s 50, s 368, s 371, s 529CE, schedule 14')}; ${QCODE('Silica', 's 9.1, s 9.4, s 10.1, s 10.2')}`),
          { unless: 'noFloorBelow', ...src('Barricade and sign the area below, so a falling core cannot hit anyone.', WHS('s 55')) },
          { only: 'wallPenetration', text: 'The wall is checked for cables and pipes before the core is cut, the core is supported on the far side so it cannot drop outside, and the sleeve is sealed into the hole to keep out water.' },
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
        step: 'Install risers and pipework',
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
        { unless: 'steelWeldOnly', ...src('Fit flashback arrestors at the torch and regulator. Keep cylinders upright and secured, valves closed when not in use, and turn the gas off at the valve straight after use. Gases heavier than air collect in pits and basements, so store and use cylinders where leaks can disperse.', `${MODEL('Welding processes', 's 3.4, s 3.6')}`) },
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
    // The pipes are roughed in before the linings go up, and the fixtures fitted off after.
    steps: [{
      step: 'Plumbing rough-in',
      unless: ['fixtureSwap', 'outdoorFixture', 'plumbFitOffOnly'],
      hazards: ['Back strain carrying and fitting fixtures and pipe.', 'Silica dust from chasing or drilling.', 'A fall from a ladder.', { only: 'eyewash', text: 'Contact with chemicals kept or used in the laboratory.' }],
      controls: [
        // An emergency eyewash or safety shower goes into a working laboratory.
        { only: 'eyewash', text: 'Before work starts, the laboratory manager confirms which chemicals are in the work area, and benches and fume cupboards near the work are cleared or closed. No chemical containers are moved by our crew.' },
        src('Use trolleys and lifting aids for heavy items. Plan team lifts with one person in charge. Training alone is not the control.', `${WHS('s 60')}; ${QCODE('Hazardous manual tasks', 's 4.1, s 4.4, s 4.7')}`),
        { unless: 'fixtureSwap', ...src('Chase and drill with water or on-tool extraction. Anyone still at risk of exposure after these controls wears a fit tested respirator (P2 or better).', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.1, s 7.4.2, s 7.6.1, s 7.6.2')}`) },
        { unless: 'fixtureSwap', ...src('Assess in writing before chasing whether the processing is high risk, without counting PPE or administrative controls, and without relying only on the dust controls used for the processing. If it is, prepare a silica risk control plan and give it to workers before they start, and workers have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CA, s 529CB, s 529CC, s 529CD')) },
        { unless: 'fixtureSwap', ...src('Health monitoring is provided for workers at significant risk from crystalline silica.', `${WHS('s 368, schedule 14')}; ${QCODE('Silica', 's 10, s 10.1')}`) },
        { unless: 'fixtureSwap', text: 'Before chasing or drilling a wall, check for live circuits and services in it. If chasing near energised circuits, have them isolated first, or stop and have this SWMS reviewed, as work near energised electrical installations is high risk construction work.' },
        { unless: ['fixtureSwap', 'outdoorFixture'], ...src('No stepladder beside an open penetration or unprotected edge without extra fall protection.', MODEL('Managing the risk of falls', 's 9.1')) },
        { unless: ['fixtureSwap', 'outdoorFixture'], text: 'Before drilling into a slab, scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval. Other detected services are isolated and confirmed before drilling near them.' },
        { unless: 'fixtureSwap', ...src('Use platform ladders. Ladders are industrial and rated for at least 120 kg.', WHS('s 306M')) },
      ],
    }, {
      step: 'Plumbing fit-off',
      unless: 'plumbRoughInOnly',
      hazards: ['Back strain carrying and fitting fixtures and pipe.', 'A fall from a ladder.', { only: 'fixtureSwap', text: 'Sewage, and cuts from broken porcelain, when removing the old fixture.' }, { only: 'eyewashNoRoughIn', text: 'Contact with chemicals kept or used in the laboratory.' }],
      controls: [
        'Fixtures are fixed to the manufacturer\'s details, and each one is connected and checked for leaks before it is handed over.',
        { only: 'eyewashNoRoughIn', text: 'Before work starts, the laboratory manager confirms which chemicals are in the work area, and benches and fume cupboards near the work are cleared or closed. No chemical containers are moved by our crew.' },
        // An emergency eyewash or safety shower goes into a working laboratory and must work when it is handed over.
        { only: 'eyewash', text: 'The eyewash or safety shower is fixed to the manufacturer\'s details, connected to the water supply with any tempering valve the supplier specifies, then flushed and tested for flow before it is handed over.' },
        { only: 'sinkTap', text: 'The benchtop cut-out is marked from the sink template and cut with a jigsaw that has dust extraction, with the offcut supported so it cannot drop. Stone benchtops are cut only by the supplier.' },
        src('Use trolleys and lifting aids for heavy items. Plan team lifts with one person in charge. Training alone is not the control.', `${WHS('s 60')}; ${QCODE('Hazardous manual tasks', 's 4.1, s 4.4, s 4.7')}`),
        // An outdoor shower or tap stands on its own post or pad, with its pipes run underground.
        { only: 'outdoorFixture', text: 'The shower or tap is fixed to its post, pad or wall to the manufacturer\'s details, and its supply and waste pipes are run in the trench and connected as the plumbing approval shows.' },
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
      HANGERS_STEP,
      { ...LADDER_STEP, unless: 'ladderUse' },
      {
        step: 'Install ductwork',
        only: 'ductNamed',
        hazards: [{ only: 'riserWork', text: 'A fall from a platform, ladder or open riser.' }, { unless: 'riserWork', text: 'A fall from a platform or ladder.' }, 'Tools, fixings and duct sections fall onto people below.', 'Cuts from duct edges and strain from lifting duct overhead.'],
        controls: [
          { fact: 'fallControl' },
          src('Work from the floor or a platform where possible. Fall prevention comes before work positioning or fall arrest.', WHS('s 78, s 79')),
          { only: 'riserWork', ...src('Risers and shafts are covered or screened at each level. Covers are strong enough to take anyone who could fall onto them, securely fixed so they cannot be moved or removed by accident, and marked as covering a hole.', `${WHS('s 306F')}; ${QCODE('Managing the risk of falls', 's 4.2')}`) },
          { only: 'riserWork', text: 'Only the section being worked on is opened.' },
          src('Barricade and sign the area below.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
          'Stop tools and materials falling.',
          { unless: 'houseRoofDucts', ...src('Sequence the work so trades are not working above or below each other at the same time.', MODEL('Managing the risk of falls', 's 8.3')) },
          src('Use lifting aids such as duct lifters for overhead duct sections, rather than holding them up by hand.', MODEL('Hazardous manual tasks', 's 4.5')),
        ],
      },
      {
        step: 'Fix the units in place',
        only: 'mechUnits',
        hazards: ['A unit falls while it is lifted into position.', 'Strain from lifting units overhead.'],
        controls: [
          'Units are lifted into position with a material lift or other mechanical aid, and fixed to their supports before they are let go.',
          src('Barricade and sign the area below.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
        ],
      },
    ],
    ppe: ['gloveCut', 'p2'],
  },
  {
    when: 'mechPipework',
    steps: [
      { ...HANGERS_STEP, unless: 'ductwork' },
      {
        step: 'Install mechanical pipework',
        hazards: [{ only: 'riserWork', text: 'A fall from a platform, ladder or open riser.' }, { unless: 'riserWork', text: 'A fall from a platform or ladder.' }, 'Pipe lengths and fittings fall onto people below.', 'Strain from lifting pipe overhead.'],
        controls: [
          { fact: 'fallControl' },
          src('Work from the floor or a platform where possible. Fall prevention comes before work positioning or fall arrest.', WHS('s 78, s 79')),
          { only: 'riserWork', ...src('Risers and shafts are covered or screened at each level. Covers are strong enough to take anyone who could fall onto them, securely fixed so they cannot be moved or removed by accident, and marked as covering a hole.', `${WHS('s 306F')}; ${QCODE('Managing the risk of falls', 's 4.2')}`) },
          src('Barricade and sign the area below.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
          'Stop tools and materials falling.',
          'Use pipe lifters or jacks to hold pipe overhead, rather than holding it up by hand.',
        ],
      },
    ],
    ppe: ['gloveCut'],
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
      step: 'Evacuate and charge the system',
      unless: 'refrigerantRecoverOnly',
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
        src('Close cylinder valves and fit the sealing caps when not in use.', ARC('s 13.6.3')),
      ],
    }, {
      step: 'Recover refrigerant',
      only: 'refrigerantRecover',
      hazards: ['Freeze burns from liquid refrigerant.', 'Asphyxiation from a leak in an enclosed space.', 'A recovery cylinder is overfilled and bursts.'],
      controls: [
        src('Read the refrigerant\'s safety data sheet before handling it.', ARC('s 13.1')),
        src('Recover into in-date cylinders suited to the refrigerant (A2 and A2L into their own cylinders). Never vent refrigerant.', ARC('s 10.1, s 12.2.3')),
        src('Store refrigerant only in refillable containers, and give recovered refrigerant to a refrigerant trading authorisation holder or a destruction facility.', OZONE('reg 135')),
        'Wear cold resistant gloves and eye protection when connecting and disconnecting hoses.',
        src('Close cylinder valves and fit the sealing caps when not in use.', ARC('s 13.6.3')),
      ],
    }],
    ppe: ['gloveCold', 'goggles'],
  },
  {
    when: 'roofPlant',
    steps: [{
      step: 'Install plant and equipment on the roof',
      hazards: ['A fall from the roof edge or through a roof opening.', 'Wind on large panels and plant.', { unless: 'sheetRoof', text: 'Silica dust and tendon strike when drilling fixings into the roof slab.' }],
      controls: [
        { only: 'acUnit', text: 'Once the unit is fixed down, refrigerant pipework is connected, pressure tested and charged only by the holder of a refrigerant handling licence, and the power connection is made by a licensed electrician.' },
        { fact: 'fallControl' },
        src('Edge protection or travel restraint where a fall of 2 m or more (3 m in housing construction) is possible, before work starts.', WHS('s 306D')),
        { unless: 'roofAccess', ...src('Edge protection has a top rail at least 900 mm above the roof, a toe board or bottom rail, and no more than 450 mm between rails.', WHS('s 306E')) },
        src('Harness anchors are engineer designed or approved by a competent person, rated at least 12 kN for one person with a limited free fall, 15 kN for one person with a free fall, or 21 kN for two. Energy absorbers limit the arrest force to 6 kN, there is enough clearance below to stop a fall before it hits anything, and no one uses a harness system alone.', WHS('s 306I')),
        src('Where fall arrest is used, a rescue plan is set and practised.', WHS('s 80')),
        src('Check the wind, rain and heat before roof work, and stop in unsafe conditions.', MODEL('Managing the risk of falls', 's 3.2')),
        src('Tether tools, and secure materials and packaging at the edge, so nothing can fall to the street.', WHS('s 55')),
        { unless: ['houseWork', 'sheetRoof'], text: 'Before drilling fixings into a roof slab, scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval.' },
        // A metal sheet roof has no slab: the plant is fixed to its framing.
        { only: 'sheetRoof', text: 'The plant\'s base or roof curb is fixed to the purlins or a support frame to the manufacturer\'s details, never to the roof sheets alone.' },
        { unless: 'sheetRoof', ...src('Drill with on-tool extraction. Anyone still at risk of exposure wears a fit tested respirator (P2 or better).', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`) },
        { unless: 'sheetRoof', ...src('Assess in writing before drilling whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')) },
        { unless: 'sheetRoof', ...src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')) },
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
    // Containment and cable pulling are often done by different crews with different tools.
    steps: [{
      step: 'Install communications containment',
      only: 'ictContainment',
      hazards: ['A fall from a ladder, platform or open riser.', 'Tools and cable boxes fall onto people below.', 'Contact with energised electrical parts in shared risers and ceilings.', 'Silica dust from drilling anchors.'],
      controls: [
        { fact: 'fallControl' },
        { only: 'riserWork', ...src('Risers and shafts are covered or screened at each level. Covers are strong enough to take anyone who could fall onto them, securely fixed so they cannot be moved or removed by accident, and marked as covering a hole.', `${WHS('s 306F')}; ${QCODE('Managing the risk of falls', 's 4.2')}`) },
        { only: 'riserWork', text: 'Only the section being worked on is opened.' },
        src('Ladders are industrial and rated for at least 120 kg.', WHS('s 306M')),
        src('When working from a ladder, keep two feet and one other point of contact with it, and use a tool belt.', MODEL('Managing the risk of falls', 's 9.1')),
        src('Barricade and sign the area below.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
        'Stop tools and materials falling.',
        src('Where exposed energised parts are nearby, have them de-energised or covered by the electrician before work starts, and use non-conductive ladders near them.', QCODE('Managing electrical risks', 's 7.2')),
        'Before drilling into a slab, scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval. Other detected services are isolated and confirmed before drilling near them.',
        src('Drill anchors with on-tool extraction, and wear a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`),
        src('Assess in writing before drilling whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
      ],
    }, {
      step: 'Pull communications cabling',
      only: 'ictCablePull',
      hazards: ['A fall from a ladder, platform or open riser.', 'Tools and cable boxes fall onto people below.', 'Contact with energised electrical parts in shared risers and ceilings.', 'Strain from pulling and lifting cable.'],
      controls: [
        { fact: 'fallControl' },
        { only: 'riserWork', ...src('Risers and shafts are covered or screened at each level. Covers are strong enough to take anyone who could fall onto them, securely fixed so they cannot be moved or removed by accident, and marked as covering a hole.', `${WHS('s 306F')}; ${QCODE('Managing the risk of falls', 's 4.2')}`) },
        { only: 'riserWork', text: 'Only the section being worked on is opened.' },
        src('Ladders are industrial and rated for at least 120 kg.', WHS('s 306M')),
        src('When working from a ladder, keep two feet and one other point of contact with it, and use a tool belt.', MODEL('Managing the risk of falls', 's 9.1')),
        src('Barricade and sign the area below.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
        'Stop tools and materials falling.',
        src('Where exposed energised parts are nearby, have them de-energised or covered by the electrician before work starts, and use non-conductive ladders near them.', QCODE('Managing electrical risks', 's 7.2')),
        src('Use cable dispensers and rollers, and plan team pulls with one person in charge.', MODEL('Hazardous manual tasks', 's 4.5, s 4.9')),
        'Keep communications cabling separated from power cabling as the Wiring Rules require.',
      ],
    }, {
      only: 'wifiAp',
      step: 'Mount the Wi-Fi access points',
      hazards: ['A fall from the ladder or platform while mounting an access point.', 'An access point or its bracket falls onto people below.'],
      controls: [
        'Access points are mounted from the same access equipment as the cabling, with the area below closed off while each one is fixed.',
        'Each bracket is fixed into framing, or with fixings rated for the ceiling or wall it goes on, to the manufacturer\'s instructions, and the access point is locked onto it before it is let go.',
        'Access points are powered over their network cable. Any power point one needs is installed by a licensed electrician.',
      ],
    }],
    ppe: ['gloveCut', 'p2'],
  },
  {
    when: 'fibre',
    // Hauling the cable is its own step only where no other step pulls or hauls it.
    steps: [{
      step: 'Haul the optical fibre cable',
      only: 'fibreHaul',
      unless: ['ictCabling', 'streetPits'],
      hazards: ['Strain from hauling cable and handling drums.', 'A fall from a ladder or platform.', 'Tools and materials fall onto people below.'],
      controls: [
        'Cable drums sit on stands, and the cable is hauled by hand or with a tension limited winch within its pulling tension, with one person in charge of the pull.',
        'Ladders and platforms are set up as the fall controls set out, and the area below is closed off.',
      ],
    }, {
      step: 'Splice and test optical fibre',
      unless: 'fibreHaulOnly',
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
      step: 'Install comms racks and cabinets',
      hazards: ['Strain or crush moving racks, cabinets and batteries.', 'A rack tips over.', 'Contact with live UPS outputs and distribution boards in the comms room.', 'Silica dust and tendon strike when drilling rack anchors.'],
      controls: [
        src('Move racks and batteries with trolleys, pallet jacks or lifting aids. Team lifts are an interim control, with one person in charge.', MODEL('Hazardous manual tasks', 's 4.5, s 4.9')),
        'Fix racks to the floor or wall as soon as they are stood up, before loading equipment.',
        'Before drilling rack anchors into a slab, scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval.',
        src('Drill with on-tool extraction. Anyone still at risk of exposure wears a fit tested respirator (P2 or better).', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`),
        src('Assess in writing before drilling whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('Where exposed energised parts are nearby, have them de-energised or covered by the electrician before work starts, and use non-conductive ladders near them.', QCODE('Managing electrical risks', 's 7.2')),
      ],
    }, {
      step: 'Install comms equipment',
      hazards: ['Strain or crush moving racks, cabinets and batteries.', 'A rack tips over.', { only: 'upsWork', text: 'Battery electrolyte, short circuits and stored energy.' }, 'Contact with live UPS outputs and distribution boards in the comms room.'],
      controls: [
        src('Move racks and batteries with trolleys, pallet jacks or lifting aids. Team lifts are an interim control, with one person in charge.', MODEL('Hazardous manual tasks', 's 4.5, s 4.9')),
        'Fix racks to the floor or wall as soon as they are stood up, before loading equipment.',
        { only: 'upsWork', ...src('Keep the battery safety data sheet at the work area.', WHS('s 344')) },
        { only: 'upsWork', text: 'UPS and power connections are made only by licensed electricians.' },
        src('Where exposed energised parts are nearby, have them de-energised or covered by the electrician before work starts, and use non-conductive ladders near them.', QCODE('Managing electrical risks', 's 7.2')),
        'Heavy equipment is loaded into the bottom of the rack first.',
      ],
    }],
    ppe: ['gloveChemical', 'p2'],
  },
  {
    when: 'securityDevices',
    steps: [{
      step: 'Install security devices',
      hazards: ['A fall from a ladder or platform.', { unless: 'poleMount', text: 'Silica dust from drilling.' }, { unless: 'poleMount', text: 'Contact with energised cables in walls and ceilings.' }, { only: 'doorStrikes', text: 'Cuts and flying swarf when cutting door frames for strikes.' }, { only: 'doorStrikes', text: 'An exit door is left locked while its strike is fitted.' }],
      controls: [
        { only: 'newPole', text: 'Poles are stood in footings dug after services are located, lifted with a crane truck or by two people for light poles, and braced until the footing has cured.' },
        { only: 'poleMount', text: 'Use an EWP to fit cameras and devices at the top of the pole, with the harness clipped to its anchor.' },
        { only: 'turnstiles', text: 'Turnstiles, gates and barriers are moved with trolleys or lifting equipment, not carried, and anchored to the slab to the manufacturer\'s details.' },
        // Electric strikes and locks are cut into the door frames.
        { only: 'doorStrikes', text: 'Door frames are cut out for strikes and locks with a router or multi-tool with its guard in place, the door wedged open and the frame checked for cables first. Steel frames are cut with eye protection and gloves, and the swarf is cleaned up.' },
        { only: 'doorStrikes', text: 'Doors stay usable as exits while their strikes are fitted: each door is worked on in turn, and the fire and evacuation doors are not left locked or unable to open.' },
        src('Ladders are industrial and rated for at least 120 kg.', WHS('s 306M')),
        src('When working from a ladder, keep two feet and one other point of contact with it, and use a tool belt.', MODEL('Managing the risk of falls', 's 9.1')),
        { unless: 'poleMount', ...src('Drill with on-tool extraction. Anyone still at risk of exposure wears a fit tested respirator (P2 or better).', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`) },
        { unless: 'poleMount', ...src('Assess in writing before drilling whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')) },
        { unless: 'poleMount', ...src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')) },
        { unless: 'poleMount', text: 'Check for cables before drilling walls and ceilings. Power supplies are connected to mains power only by licensed electricians.' },
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
        src('Where panels are lifted by crane or monorail, each panel stays under control until it is fixed and the rigging is released.', WHS('s 219')),
        src('Where a crane lift is out of the operator\'s view, a licensed dogman directs it.', WHS('s 81, schedule 3')),
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
    // Drilling fixing holes at the slab edge, and sealing the joints, are separate activities.
    // Resealing joints alone has no drilling.
    steps: [{
      step: 'Drill fixing holes in the slab edge',
      only: 'facadeDrill',
      hazards: ['Silica dust from drilling.', 'Cutting a post-tensioning tendon.'],
      controls: [
        { unless: 'jointSealOnly', text: 'Before drilling into a slab edge, scan and mark reinforcement, conduits and pipes. In a post-tensioned slab, check the post-tensioning drawings, and never drill within a marked tendon zone: move the hole, or get the structural engineer\'s written approval.' },
        src('Drill with on-tool extraction. Anyone still at risk of exposure wears a fit tested respirator (P2 or better).', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`),
        src('Assess in writing before drilling whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
      ],
    }, {
      step: 'Seal the facade joints',
      hazards: ['Fumes from sealants and cleaners.'],
      controls: [
        { only: 'jointSealOnly', text: 'Old sealant is cut out with a knife or multi-tool, the joint is cleaned, backing rod is fitted, and primer and sealant are applied as their safety data sheets set out, with gloves and eye protection.' },
        { unless: 'jointSealOnly', text: 'Backing rod, primer and sealant are applied as their safety data sheets set out, with gloves and eye protection.' },
        { fact: 'safetyDataSheet' },
        src('Keep the current safety data sheet for each sealant, primer and cleaner used at the work area.', WHS('s 344')),
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
          { only: 'platformOnly', text: 'Fill is placed and compacted in layers with an excavator and roller to the design, with people kept out of the plant\'s reach and two-way acknowledgement before anyone approaches.' },
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
        src('Broken pile heads are lifted with plant designed to lift them. An excavator is used to lift them only where plant designed to lift is not reasonably practicable, and the lift creates no greater risk than with plant designed for it.', WHS('s 219')),
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
      hazards: [{ unless: 'unitsOnly', text: 'Back and shoulder strain carrying sheets, studs and other materials.' }, { only: 'unitsOnly', text: 'Back and shoulder strain carrying cabinets, benchtops and appliances.' }, { unless: 'unitsOnly', text: 'Wind catches large sheets.' }],
      controls: [
        src('Where there is a materials hoist, move materials between levels with it, not by hand.', QCODE('Hazardous manual tasks', 's 4.1, s 4.4')),
        src('Have materials delivered as close as possible to where they are used.', MODEL('Hazardous manual tasks', 's 4.7')),
        src('Use trolleys, lift trolleys, panel lifters, and hooks or suction pads for sheets. Keep trolleys maintained.', MODEL('Hazardous manual tasks', 's 4.4, s 4.5')),
        src('Team lifts are an interim control only, with one person in charge.', MODEL('Hazardous manual tasks', 's 4.9')),
        { unless: 'unitsOnly', ...src('Handle large sheets in low wind, especially on balconies and at hoist landings.', MODEL('Hazardous manual tasks', 's 4.8')) },
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
      unless: 'timberFramingOnly',
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
    // One step per activity: hanging doors, fixing joinery and cabinets, and fixing trim.
    // Doors come when the task names them, or when it names no cabinets. Where the door
    // installer's own step is in the job, it covers the doors.
    steps: [{
      step: 'Hang the doors',
      only: 'joineryDoors',
      unless: 'doorHang',
      hazards: ['Strain holding doors in place while fixing.', 'Crush from a falling door.', 'Cuts from saws and fixings when trimming doors and mouldings.'],
      controls: [
        src('Ask suppliers to deliver joinery ready to install and the right way up.', MODEL('Hazardous manual tasks', 's 4.7')),
        src('Use door lifters, wedges and props to hold doors while they are hung, rather than holding them up by hand for long periods.', QCODE('Hazardous manual tasks', 's 2.2, s 4.4')),
        'Doors are propped or wedged while hung, and fixed before they are left.',
      ],
    }, {
      step: 'Install joinery and cabinets',
      only: 'cabinetWork',
      hazards: ['Strain holding heavy units in place while fixing.', { unless: 'noDoorHang', text: 'Crush from a falling door or cabinet.' }, { unless: 'doorHangWork', text: 'Crush from a falling cabinet.' }],
      controls: [
        { ...src('Engineered stone benchtops, panels and slabs are banned and are not installed or processed. Natural stone tops are cut and finished by the supplier; if any stone must be cut on site, this SWMS is updated with silica controls first.', WHS('s 529D')), only: 'stoneWork' },
        src('Ask suppliers to deliver joinery ready to install and the right way up.', MODEL('Hazardous manual tasks', 's 4.7')),
        src('Use lifting aids, straps, trolleys and props to hold units while fixing, rather than holding them up by hand for long periods.', QCODE('Hazardous manual tasks', 's 2.2, s 4.4')),
        { unless: 'noDoorHang', text: 'Doors and cabinets are fixed or propped as soon as they are stood up.' },
        { unless: 'doorHangWork', text: 'Cabinets are fixed or propped as soon as they are stood up.' },
        'Adhesives, sealants and sealers are used as their safety data sheets set out, with good ventilation and gloves resistant to the product.',
        { ...src('Overhead cabinets and wardrobes are fitted from step platforms or platform ladders rated for at least 120 kg, not from the top of a stepladder.', `${WHS('s 306M')}; ${MODEL('Managing the risk of falls', 's 9.1')}`), only: 'cabinets', unless: 'noWardrobes' },
        { ...src('Overhead cabinets are fitted from step platforms or platform ladders rated for at least 120 kg, not from the top of a stepladder.', `${WHS('s 306M')}; ${MODEL('Managing the risk of falls', 's 9.1')}`), only: 'cabinetsNoWardrobes' },
      ],
    }, {
      step: 'Fix skirting and architraves',
      only: 'trimWork',
      hazards: ['Cuts from saws and fixings when trimming doors and mouldings.', 'Knee strain.'],
      controls: [
        { only: 'trimWork', text: 'Skirting and architraves are cut on a drop saw with its guard in place and the work clamped, and fixed with the nail gun pointed away from hands. Kneeling while fixing skirting is rotated, with knee pads worn.' },
        'Adhesives, sealants and sealers are used as their safety data sheets set out, with good ventilation and gloves resistant to the product.',
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
    // Ground anchors and props each come only where the task names them, and both where it names neither.
    steps: [{
      step: 'Install and later remove ground anchors',
      only: 'groundAnchors',
      hazards: ['The wall moves or collapses if anchors lose load.'],
      controls: [
        { fact: 'temporarySupport' },
        src('Ground anchors are designed by a competent person, such as a geotechnical engineer. Anchor loads are checked while they are in service.', MODEL('Excavation work', 's 6.2')),
        src('Do not remove soil above anchors without a competent person\'s approval. No one works ahead of the support.', QCODE('Excavation work', 's 6.3')),
        'Do not dig below the design stage level, or remove soil within the active soil zone, without a competent person\'s approval.',
        src('Remove supports in reverse order of installation, installing temporary members first where needed, with workers kept clear.', MODEL('Excavation work', 's 6.3')),
        { unless: 'neighbours', ...src('Excavation does not start until steps are taken to stop any neighbouring building collapsing. Excavation below the level of a neighbouring footing is assessed by a competent person and supported to a competent person\'s design. The work does not cause flooding or water getting into neighbouring buildings.', QCODE('Excavation work', 's 3.5')) },
        'The neighbouring building is monitored as the excavation goes down.',
        src('Anchors drilled under streets, neighbouring land or buildings are checked against the underground services information for those areas.', `${WHS('s 304')}; ${MODEL('Excavation work', 's 3.5')}`),
      ],
    }, {
      step: 'Stress the ground anchors',
      only: 'groundAnchors',
      hazards: ['Stored energy released when de-stressing.', 'The wall moves or collapses if anchors lose load.'],
      controls: [
        'Anchor stressing and de-stressing are done by the anchor contractor to the engineer\'s procedure, with an exclusion zone around and behind the jack.',
        src('Anchor loads are checked with hydraulic jacks and pressure gauges.', MODEL('Excavation work', 's 6.2')),
      ],
    }, {
      step: 'Install and later remove props',
      only: 'excavationProps',
      hazards: ['A prop or waler falls during lifting.', 'The wall moves or collapses if a prop or waler is removed or loses load.'],
      controls: [
        { fact: 'temporarySupport' },
        src('Hydraulic props are designed for the expected ground pressures.', MODEL('Excavation work', 's 6.2')),
        'Do not dig below the design stage level, or remove soil within the active soil zone, without a competent person\'s approval.',
        src('Remove supports in reverse order of installation, installing temporary members first where needed, with workers kept clear.', MODEL('Excavation work', 's 6.3')),
        src('Props and walers are lifted with plant designed to lift them, never over people, and slung by a licensed dogman. An excavator is used to lift only where plant designed to lift is not reasonably practicable, and it creates no greater risk.', WHS('s 219, schedule 3')),
        { unless: 'neighbours', ...src('Excavation does not start until steps are taken to stop any neighbouring building collapsing. Excavation below the level of a neighbouring footing is assessed by a competent person and supported to a competent person\'s design. The work does not cause flooding or water getting into neighbouring buildings.', QCODE('Excavation work', 's 3.5')) },
        'The neighbouring building is monitored as the excavation goes down.',
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
        src('Barriers go up around a pit or trench as it is dug, before it is 2 m deep (3 m in housing construction).', WHS('s 306D')),
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
    when: 'conveyorMaintain',
    steps: [{
      step: 'Isolate the conveyor and replace parts',
      hazards: ['Entanglement or crushing at nip points, pulleys and idlers if the conveyor starts.', 'Stored energy in belt tension, take-ups and counterweights.', 'Material falling from the belt or chutes.', 'Strain lifting idlers and rollers.', 'A fall from a conveyor walkway or gantry.'],
      controls: [
        src('Each worker isolates, locks and tags every energy source to the conveyor, stored energy (belt tension, take-ups, counterweights, gravity) is released or restrained, and a start attempt from the controls proves it is isolated before anyone reaches in.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
        'The site\'s isolation and permit procedure applies, and the plant owner agrees when the conveyor can restart.',
        'Material on the belt and in chutes above the work is cleared or secured first.',
        'Heavy or awkward idlers and rollers are lifted with mechanical aids, and hands stay out of nip points.',
        'Work is done from walkways and platforms with handrails. Where there are none, the fall controls in this SWMS apply.',
        src('Guards taken off for the work are refitted and checked before the isolation is removed.', WHS('s 208')),
        src('Emergency stops and pull-wire switches along the conveyor are tested before it runs again.', WHS('s 211')),
      ],
    }],
  },
  {
    when: 'blasting',
    steps: [{
      step: 'Drill the blast holes',
      hazards: ['Rock falls from the face during drilling, scaling and mucking out.', 'A misfire is left in the face or the muckpile.', 'Blast fumes and dust.', 'Noise and vibration.'],
      controls: [
        'Loose rock is scaled and a competent person checks the face before drilling or mucking out starts again.',
        'After firing, the face is ventilated and the fumes cleared before anyone goes back in. The shotfirer checks for misfires, and only the shotfirer deals with a misfire, as the blast plan sets out.',
        'Drilling uses water or dust extraction, and workers wear hearing protection.',
      ],
    }, {
      step: 'Charge and fire the blast',
      hazards: ['Flyrock or an unplanned explosion injures a person.', 'A misfire is left in the face or the muckpile.', 'Blast fumes and dust.', 'Rock falls from the face during drilling, scaling and mucking out.', 'Noise and vibration.'],
      controls: [
        'The blast is designed, and explosives are handled, charged and fired, only by a shotfirer holding the licence the state\'s explosives law requires, under the site\'s blast management plan. The shotfirer\'s own SWMS covers the charging and firing.',
        'Explosives are stored, carried and kept on site only as the state\'s explosives law and the blast plan allow, away from heat, flame and sparks.',
        'Before firing, the exclusion zone in the blast plan is cleared and guarded, the warning signals are given, and nobody returns until the shotfirer gives the all clear.',
        'After firing, the face is ventilated and the fumes cleared before anyone goes back in. The shotfirer checks for misfires, and only the shotfirer deals with a misfire, as the blast plan sets out.',
        'Loose rock is scaled and a competent person checks the face before drilling or mucking out starts again.',
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
        'Before digging, the site contamination report or the environmental consultant\'s advice sets out what is in the ground, the air monitoring and PPE needed, and how the soil is handled. Without one, the soil is treated as contaminated until tested.',
        'If buried contaminants are found, stop, keep clear, and report.',
        'Contaminated soil is kept in its own covered stockpile, sampled and classified before it leaves site, and carted only to a facility licensed to take it, with the waste tracked as the state environment protection authority requires.',
        'Dust is kept down with water sprays. Workers wear the gloves, coveralls and respiratory protection the assessment sets, wash hands and face before eating, drinking or smoking, and leave dirty clothing and boots on site.',
        'Plant and trucks are cleaned before leaving the contaminated area so soil is not tracked onto roads.',
        src('Manage exposure to airborne contaminants in the excavation, with gas monitors and mechanical ventilation where needed.', `${WHS('s 305')}; ${MODEL('Excavation work', 's 4, s 4.6')}`),
        src('If asbestos is found or suspected, stop and keep clear. A competent person identifies it, or it is assumed to be asbestos, and it is removed by a licensed asbestos removalist unless the regulation allows otherwise.', WHS('s 422, s 458')),
        src('Plan haul routes and disposal for spoil.', MODEL('Excavation work', 's 2.2')),
      ],
    }],
  },
  {
    when: 'basementEdge',
    steps: [{
      step: 'Protect the basement edge',
      hazards: ['A fall from the basement edge.', 'Spoil or objects fall onto workers below.'],
      controls: [
        { fact: 'fallControl' },
        src('Edge protection at the basement edge before a fall of 2 m or more is possible: top rail at least 900 mm, toe board at least 150 mm, and no more than 450 mm between rails.', WHS('s 306D, s 306E')),
        src('Toe boards where spoil could fall in.', MODEL('Excavation work', 's 4.1')),
      ],
    }, {
      step: 'Provide access into the basement',
      hazards: ['No safe way in or out.'],
      controls: [
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
        { unless: 'shoringWall', ...src('Underground services information covers adjacent areas too.', WHS('s 304')) },
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
        { only: 'tileReplace', unless: 'tileRemove', text: 'Broken tiles are cut out with a grinder or multi-tool with on-tool extraction, wearing eye protection and a P2 respirator, and the bed is cleaned back before the new tiles go in.' },
        { fact: 'silicaControls' },
        // Wet cutting or extraction is said once, here: there is no separate "no dry cutting" line.
        src('Tiles and stone with 1% or more crystalline silica are a crystalline silica substance. Cutting them with power tools is processing that must be controlled: wet cutting or on-tool extraction, never dry cutting, and respirators for anyone still at risk.', `${WHS('s 529A, s 529B, s 529C')}; ${QCODE('Silica', 's 1.4, s 5.1, s 7.4.1, s 7.4.2, s 7.6')}`),
        src('Assess in writing before cutting whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('No engineered stone benchtops, panels or slabs are cut or installed. Ceramic and porcelain tiles and grout are not engineered stone.', WHS('s 529A, s 529D')),
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
    // One step per product: adhesive, screed, grout and sealer each come only when the
    // task names them (adhesive and grout when it names none).
    steps: [{
      step: 'Lay the screed',
      only: 'tileScreed',
      hazards: ['Cement dust and skin burns from wet cement products.', 'Knee and back strain from mixing, barrowing and screeding.'],
      controls: [
        'Screed is mixed close to where it is laid and moved by barrow or pump, not carried in buckets. Screeding while kneeling is rotated, with knee pads worn.',
        { fact: 'safetyDataSheet' },
        src('The current safety data sheet for each product is at the work area before first use, and every container, including anything decanted, is labelled.', WHS('s 341, s 342, s 344')),
        src('Keep dust below the exposure standard. Mix bagged products with dust control, keep containers closed, vacuum or wet clean instead of dry sweeping, and clean spills straight away.', `${WHS('s 49')}; ${QCODE('Managing risks of hazardous chemicals', 's 1.5, s 4.1, s 4.2')}`),
        src('Avoid skin contact with cement and epoxy: wear chemical resistant gloves suited to the product. No eating, drinking or smoking in the work area, and wash before breaks.', MODEL('Managing risks of hazardous chemicals', 's 4.1, appendix J')),
      ],
    }, {
      step: 'Mix and spread the tile adhesive',
      only: 'tileAdhesive',
      hazards: ['Cement dust and skin burns from wet cement products.'],
      controls: [
        'Adhesive is mixed in small batches with a paddle mixer at low speed, with the bag emptied low into the bucket, not tipped from height.',
        { fact: 'safetyDataSheet' },
        src('The current safety data sheet for each product is at the work area before first use, and every container, including anything decanted, is labelled.', WHS('s 341, s 342, s 344')),
        src('Keep dust below the exposure standard. Mix bagged products with dust control, keep containers closed, vacuum or wet clean instead of dry sweeping, and clean spills straight away.', `${WHS('s 49')}; ${QCODE('Managing risks of hazardous chemicals', 's 1.5, s 4.1, s 4.2')}`),
        src('Avoid skin contact with cement and epoxy: wear chemical resistant gloves suited to the product. No eating, drinking or smoking in the work area, and wash before breaks.', MODEL('Managing risks of hazardous chemicals', 's 4.1, appendix J')),
      ],
    }, {
      step: 'Grout the tiles',
      only: 'tileGrout',
      hazards: ['Cement dust and skin burns from wet cement products.', 'Skin sensitisation from epoxy grouts and sealers.'],
      controls: [
        'Grout is mixed in small batches, and the surplus is washed off with a damp sponge rather than dry brushed. Epoxy grout is mixed and applied with chemical resistant gloves, and nothing is washed into drains.',
        { fact: 'safetyDataSheet' },
        src('The current safety data sheet for each product is at the work area before first use, and every container, including anything decanted, is labelled.', WHS('s 341, s 342, s 344')),
        src('Keep dust below the exposure standard. Mix bagged products with dust control, keep containers closed, vacuum or wet clean instead of dry sweeping, and clean spills straight away.', `${WHS('s 49')}; ${QCODE('Managing risks of hazardous chemicals', 's 1.5, s 4.1, s 4.2')}`),
        src('Avoid skin contact with cement and epoxy: wear chemical resistant gloves suited to the product. No eating, drinking or smoking in the work area, and wash before breaks.', MODEL('Managing risks of hazardous chemicals', 's 4.1, appendix J')),
      ],
    }, {
      step: 'Apply sealer to the tiles and grout',
      only: 'tileSealer',
      hazards: ['Skin sensitisation from epoxy grouts and sealers.', 'Vapour from sealers.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('The current safety data sheet for each product is at the work area before first use, and every container, including anything decanted, is labelled.', WHS('s 341, s 342, s 344')),
        src('Ventilate when using solvent sealers, especially in small or enclosed rooms, and keep ignition sources away.', `${WHS('s 351, s 355')}; ${QCODE('Managing risks of hazardous chemicals', 's 4.1, s 4.2')}`),
        src('Avoid skin contact with cement and epoxy: wear chemical resistant gloves suited to the product. No eating, drinking or smoking in the work area, and wash before breaks.', MODEL('Managing risks of hazardous chemicals', 's 4.1, appendix J')),
      ],
    }],
    ppe: ['gloveChemical', 'goggles', 'p2'],
  },
  {
    when: 'tileLay',
    steps: [{
      step: 'Lay tiles',
      hazards: [{ unless: 'wallTiling', text: 'Knee and back injury from long periods kneeling.' }, { only: 'wallTiling', text: 'Shoulder, neck and back strain from reaching and holding tiles up on the wall.' }, 'Strain lifting tile boxes and adhesive bags.', 'Slips on wet slurry.'],
      controls: [
        { unless: 'wallTiling', ...src('Kneeling while laying tiles is a hazardous manual task. Rotate tasks and take short, frequent breaks.', `${WHS('s 60')}; ${MODEL('Hazardous manual tasks', 's 2.2, s 4.9')}`) },
        { only: 'wallTiling', text: 'Tiling walls means long periods of reaching: work at a height between the knees and shoulders where the access allows it, rotate tasks, and take short, frequent breaks.' },
        { unless: ['wallTiling', 'smallTiling'], ...src('Buy smaller or lighter bags and boxes where possible, have materials delivered as close to the work area as possible, move them between levels by hoist or crane, and use trolleys.', MODEL('Hazardous manual tasks', 's 4.1, s 4.4, s 4.5, s 4.7')) },
        // One room in a house: no hoist or crane, and no panels unless the task has them.
        { only: 'smallTiling', unless: 'wallTiling', ...src('Buy smaller or lighter bags and boxes where possible, have materials delivered as close to the room as possible, and use a trolley.', MODEL('Hazardous manual tasks', 's 4.1, s 4.4, s 4.5, s 4.7')) },
        { unless: 'smallTiling', ...src('Use panel lifters or trolleys for any heavy stone and large format tiles.', MODEL('Hazardous manual tasks', 's 4.5')) },
        { unless: 'wallTiling', text: 'Wear knee pads.' },
        { only: 'bathTiling', text: 'Top courses of wall tiles are reached from a platform ladder or step platform, not a stepladder, a bucket or the edge of a bath or bench.' },
        { unless: 'bathTiling', text: 'Top courses of wall tiles are reached from a platform ladder or step platform, not a stepladder, a bucket or a bench.' },
        src('Keep access ways clear, put waste in bins, and clean up slurry so floors are not slippery.', `${WHS('s 40')}; ${QCODE('Hazardous manual tasks', 's 4.6')}`),
      ],
    }],
  },
  {
    when: 'tileEdge',
    steps: [{
      step: 'Lay tiles near open edges',
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
        { unless: 'railCorridor', ...src('No loads are lifted over areas outside the site. If one must be, the principal contractor closes the area or erects a gantry first.', WHS('s 315L')) },
        { only: 'railCorridor', text: 'Loads over the rail corridor are lifted only inside the possession, under a lift plan the rail manager has accepted.' },
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
        { unless: 'ewp', ...src('Where boom EWPs are used: the harness is attached to the EWP\'s anchor point, not the handrail, and booms of 11 m or more need a licensed operator.', `${QCODE('Managing the risk of falls', 's 5.1')}; ${WHS('schedule 3')}`) },
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
      step: 'Weld steel',
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
        src('Use a brick saw with its blade guarded, isolate the cutting area and wear a face shield.', QCODE('Managing the risks of plant in the workplace', 's 2.3')),
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
        { unless: 'smallMasonry', ...src('Work from scaffold with brick guards where a fall of more than 2 m is possible, and do not overload bays: bricklaying and blocklaying need a heavy duty scaffold, rated up to 675 kg a bay. A scaffold over 4 m is used only after written handover, and inspected at least every 30 days.', `${WHS('s 225')}; ${QCODE('Managing the risk of falls', 's 5.1')}; Scaffolding Code of Practice 2021 (Qld) s 2.3.2.3, Table 2`) },
        src('Trestle platforms where a person could fall 2 m or more (3 m in housing construction) have their trestles secured, edge protection, and a platform at least 450 mm wide and no higher than 5 m. Where a person could fall less than that (2 m, or 3 m in housing construction), the platform is at least 450 mm wide (225 mm for light work). Use only purpose-made pins.', `${WHS('s 306N, s 306O')}; ${QCODE('Managing the risk of falls', 's 5.1')}`),
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
    // Mortar is mixed here only where the task names it and the mortar step is not already given;
    // the core fill is its own stage once the blocks are laid.
    steps: [{
      step: 'Mix mortar',
      only: 'groutMortar',
      hazards: ['Cement burns and dermatitis.', 'Strain lifting bags.'],
      controls: [
        { fact: 'safetyDataSheet' },
        'Avoid skin contact with wet mortar and grout: gloves, long sleeves and eye protection, and wash skin straight away.',
        src('Move bags with mechanical aids rather than carrying them.', MODEL('Hazardous manual tasks', 's 2.2, s 4.5')),
      ],
    }, {
      step: 'Core fill blockwork',
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
      only: 'plasterCutStep',
      step: 'Cut and fix plasterboard',
      hazards: ['Dust from sanding and cutting.', 'Silica dust where products contain crystalline silica.'],
      controls: [
        src('Keep dust below the exposure standard, and monitor the air if unsure. Check each product\'s safety data sheet: a product with 1% or more crystalline silica is a crystalline silica substance, and power sanding or cutting it is processing that must be controlled, with a written assessment before it starts.', `${WHS('s 49, s 50, s 529A, s 529C, s 529CA')}; ${QCODE('Silica', 's 1.3, s 5.1, s 9.1')}`),
        'Sheets are cut by scoring and snapping with a knife where possible. Power saws and routers have on-tool dust extraction.',
      ],
    }, {
      only: 'plasterSetStep',
      step: 'Set the joints',
      hazards: ['Dust from mixing setting compound powders.'],
      controls: [
        'Use pre-mixed compounds where possible. Powders are mixed slowly in a ventilated area, with a P2 respirator worn while mixing.',
      ],
    }, {
      only: 'plasterSandStep',
      step: 'Sand the joints',
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
    // One step per activity: cutting out damaged boards (a repair only), cutting the new
    // boards to size, and laying them.
    steps: [{
      step: 'Cut out the damaged floorboards',
      only: 'floorReplace',
      hazards: ['Cuts from the saw.', 'Noise.', 'Timber dust.', 'The saw strikes pipes or cables under the floor, or a person steps into the opening.'],
      controls: [
        { only: 'floorReplace', text: 'The damaged boards are cut out along the joists with the saw depth set to the board, after checking for pipes and cables below, and the opening is covered or barricaded until the new boards are in.' },
        src('Saw guards in place and hard to bypass, and tools inspected regularly.', `${WHS('s 208')}; ${MODEL('Managing the risks of plant in the workplace', 's 3.5, s 4.1')}`),
        src('Keep noise below 85 dB(A) over 8 hours. Hearing protection for cutting, with hearing tests for workers who must wear it.', WHS('s 56, s 57, s 58')),
        src('Dust from machining timber is hazardous: dust extraction on saws, and cut in a ventilated area.', MODEL('Managing risks of hazardous chemicals', 's 2.1, s 4.1')),
      ],
    }, {
      step: 'Cut timber flooring to size',
      hazards: ['Cuts from drop saws and flooring nailers.', 'Noise.', 'Timber dust.'],
      controls: [
        'Boards are cut on a drop saw set up on a stand, with the work held against the fence and hands clear of the blade.',
        src('Saw guards in place and hard to bypass, and tools inspected regularly.', `${WHS('s 208')}; ${MODEL('Managing the risks of plant in the workplace', 's 3.5, s 4.1')}`),
        src('Keep noise below 85 dB(A) over 8 hours. Hearing protection for cutting, with hearing tests for workers who must wear it.', WHS('s 56, s 57, s 58')),
        src('Dust from machining timber is hazardous: dust extraction on saws, and cut in a ventilated area.', MODEL('Managing risks of hazardous chemicals', 's 2.1, s 4.1')),
      ],
    }, {
      step: 'Lay timber floors',
      hazards: ['Injuries from flooring nailers.', 'Knee strain.', 'Skin and breathing exposure to flooring adhesives.'],
      controls: [
        'Flooring adhesives and underlay products are used as their safety data sheets set out, with ventilation and gloves.',
        'Flooring nailers are used with their safety contact working, pointed away from hands and feet, and disconnected before clearing a jam.',
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
      hazards: ['Knee injury from kneeling.', { unless: 'carpetTiles', text: 'Strain moving rolls.' }, 'Cuts from knives and blades.', { only: 'vinylWeld', text: 'Burns from the hot air gun.' }, { only: 'sheetFloor', text: 'Vapour and skin contact from floor adhesives, primers and levelling compound.' }, { only: 'oldFloorCoverings', text: 'Dust from scraping old adhesive and preparing the floor.' }],
      controls: [
          { text: 'Old carpet, vinyl and adhesive are lifted with scrapers and stripping tools. In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), vinyl, underlay and adhesive are checked for asbestos before they are lifted.', only: 'oldFloorCoverings', unless: ['oldVinylOnly', 'oldCarpetOnly'] },
          // Only the coverings the task names are lifted.
          { text: 'Old vinyl and its adhesive are lifted with scrapers and stripping tools, not dry sanded. In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), the vinyl, any backing and the adhesive are checked for asbestos before they are lifted.', only: 'oldVinylOnly' },
          { text: 'Old carpet, underlay and gripper strips are lifted with stripping tools and cut into rolls small enough to carry. In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), underlay and any adhesive are checked for asbestos before they are lifted.', only: 'oldCarpetOnly' },
          { only: 'sheetFloor', text: 'Floor primers, adhesives and levelling compounds are used as their safety data sheets set out, with good ventilation and gloves, and the room stays closed to others until solvent vapour has cleared.' },
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
        { unless: 'balustradeReplace', ...src('Prevent falls first. Temporary edge protection is opened only under the principal contractor\'s permit.', `${WHS('s 79, s 306C, s 306D')}; ${QCODE('Managing the risk of falls', 's 8.2')}`) },
        { unless: 'balustradeReplace', ...src('It is opened only at the panel being installed, and put back before the area is left.', WHS('s 79, s 306C, s 306D')) },
        // An old balustrade replaced on a house or unit: no principal contractor's permit or glass panels.
        { only: 'balustradeReplace', ...src('Prevent falls first. Temporary edge protection is opened only at the section being worked on, and put back before the area is left.', `${WHS('s 79, s 306C, s 306D')}; ${QCODE('Managing the risk of falls', 's 8.2')}`) },
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
      hazards: ['Back strain and crush from heavy panels.', 'Cuts from glass edges and broken glass.', { only: 'poolFence', text: 'A person falls into the pool while working beside it, or a child gets to the pool through the open barrier.' }],
      controls: [
        // Glass pool fencing is put up beside the water, with the old barrier out.
        { only: 'poolFence', text: 'The pool is closed to guests and children while the barrier is open, with a temporary barrier across every gap left at the end of the day. Glass and tools are kept back from the water\'s edge, and no one works alone beside the pool.' },
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
      only: 'windowFrameStep',
      step: 'Install windows',
      hazards: [{ unless: 'groundFloorFront', text: 'A fall through the window opening, or from the ladder or platform used to reach it.' }, { only: 'groundFloorFront', text: 'A fall from the ladder or platform used to reach the head of the frame.' }, 'A frame falls before it is fixed.', { unless: 'timberHouse', text: 'Silica dust from drilling fixings into concrete or masonry.' }, 'Strain lifting frames into openings.', 'Cuts from glass edges.'],
      controls: [
        { only: 'windowReplace', unless: ['windowsOnly', 'singleWindow'], text: 'Old windows and doors are removed one at a time: glass is taped or taken out first, fixings are cut, and the frame is lowered inside by two people. The opening is protected until the new frame is fixed. In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), sealants, packers and wall linings around the frame are checked for asbestos first.' },
        { only: 'windowsOnly', unless: 'singleWindow', text: 'Old windows are removed one at a time: glass is taped or taken out first, fixings are cut, and the frame is lowered inside by two people. The opening is protected until the new frame is fixed. In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), sealants, packers and wall linings around the frame are checked for asbestos first.' },
        // One frame replaced: said for that frame alone.
        { only: 'singleWindow', text: 'The old window is removed: its glass is taped or taken out first, fixings are cut, and the frame is lowered inside by two people. The opening is protected until the new frame is fixed. In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), sealants, packers and wall linings around the frame are checked for asbestos first.' },
        { fact: 'fallControl' },
        'Openings stay protected by edge protection or a barrier until the frame is fixed in them.',
        { unless: 'groundFloorFront', text: 'Frames above the ground floor are installed from inside the building where practicable.' },
        'Each frame is packed, plumbed and fixed to the manufacturer\'s instructions before it is let go. Large frames are lifted with a panel lifter or two people, with one person in charge.',
        { unless: 'timberHouse', ...src('Drill fixings with on-tool extraction, and wear a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`) },
        ...SILICA_FOLLOW_UP.map((item) => ({ ...item, unless: 'timberHouse' })),
        { only: 'timberHouse', text: 'Old paint on the existing frames and linings is treated as containing lead unless tested, and is not dry sanded or burnt off.' },
      ],
    }, {
      only: 'windowDoorStep',
      step: 'Install doors',
      hazards: [{ unless: 'groundFloorFront', text: 'A fall through the window opening, or from the ladder or platform used to reach it.' }, { only: 'groundFloorFront', text: 'A fall from the ladder or platform used to reach the head of the frame.' }, 'A frame or door falls before it is fixed.', { unless: 'timberHouse', text: 'Silica dust from drilling fixings into concrete or masonry.' }, 'Strain lifting frames into openings.', 'Cuts from glass edges.'],
      controls: [
        { only: 'windowReplace', unless: ['windowsOnly', 'singleWindow'], text: 'Old windows and doors are removed one at a time: glass is taped or taken out first, fixings are cut, and the frame is lowered inside by two people. The opening is protected until the new frame is fixed. In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), sealants, packers and wall linings around the frame are checked for asbestos first.' },
        { fact: 'fallControl' },
        'Openings stay protected by edge protection or a barrier until the frame is fixed in them.',
        // A shopfront has its glass doors hung in the new frames.
        { only: 'shopfront', text: 'Glass doors are hung with a door lifter or by two people on their pivots or hinges, and held until they are adjusted and their closers are set.' },
        { unless: 'shopfront', text: 'Door panels are lifted into their frames or tracks with a door lifter or by two people, and held until they are fixed and adjusted.' },
        'Each frame is packed, plumbed and fixed to the manufacturer\'s instructions before it is let go. Large frames are lifted with a panel lifter or two people, with one person in charge.',
        { unless: 'timberHouse', ...src('Drill fixings with on-tool extraction, and wear a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`) },
        ...SILICA_FOLLOW_UP.map((item) => ({ ...item, unless: 'timberHouse' })),
        { only: 'timberHouse', text: 'Old paint on the existing frames and linings is treated as containing lead unless tested, and is not dry sanded or burnt off.' },
      ],
    }, {
      only: 'louvres',
      step: 'Install louvres',
      hazards: [{ unless: 'groundFloorFront', text: 'A fall through the window opening, or from the ladder or platform used to reach it.' }, { only: 'groundFloorFront', text: 'A fall from the ladder or platform used to reach the head of the frame.' }, 'A frame falls before it is fixed.', { unless: 'timberHouse', text: 'Silica dust from drilling fixings into concrete or masonry.' }, 'Strain lifting frames into openings.', 'Cuts from louvre blades and glass edges.'],
      controls: [
        { fact: 'fallControl' },
        'Openings stay protected by edge protection or a barrier until the frame is fixed in them.',
        { unless: 'groundFloorFront', text: 'Frames above the ground floor are installed from inside the building where practicable.' },
        'Each frame is packed, plumbed and fixed to the manufacturer\'s instructions before it is let go. Large frames are lifted with a panel lifter or two people, with one person in charge.',
        { unless: 'timberHouse', ...src('Drill fixings with on-tool extraction, and wear a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`) },
        ...SILICA_FOLLOW_UP.map((item) => ({ ...item, unless: 'timberHouse' })),
        { only: 'timberHouse', text: 'Old paint on the existing frames and linings is treated as containing lead unless tested, and is not dry sanded or burnt off.' },
        'Louvre blades and glass are handled with cut resistant gloves that still give a good grip, and kept in their racks until fitted.',
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
    // The licensed trades isolate and make safe; the removal crew then takes the services out.
    steps: [{
      step: 'Isolate and make safe the old services',
      hazards: ['Cutting into live cables, pressurised pipes, gas or refrigerant.'],
      controls: [
        'Before removal, each service is identified and labelled, and isolated at its source: electrical circuits by a licensed electrician, locked out and proved de-energised; water and drainage drained; gas purged by a licensed gas fitter.',
        { text: 'Refrigerant is recovered by a refrigerant handling licence holder before pipework or plant is opened.', only: 'refrigerantWork' },
        'Services that stay in use are labelled, protected and kept clear of the removal.',
      ],
    }, {
      step: 'Remove the old services',
      hazards: ['Cutting into live cables, pressurised pipes, gas or refrigerant.', 'Old services fall when their supports are cut.', 'Sharp edges, residues and old insulation (which may contain asbestos or synthetic mineral fibres).'],
      controls: [
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
    // The equipment installer and the softfall layer are different crews and materials.
    steps: [{
      step: 'Install playground equipment',
      unless: 'softfallOnly',
      hazards: [{ unless: 'softfallOnly', text: 'Equipment parts fall or tip while they are lifted and stood.' }, { unless: 'softfallOnly', text: 'Strain lifting heavy parts.' }, { unless: 'softfallOnly', text: 'Striking underground services when digging footings.' }, 'The public enters the work area.'],
      controls: [
        { unless: 'softfallOnly', text: 'The work area is fenced off from the public, with signs, until the equipment is complete and inspected.' },
        { unless: 'softfallOnly', ...src('Get the current underground services information before digging footings, and locate services on site, for example through Before You Dig Australia.', WHS('s 304')) },
        { unless: 'softfallOnly', text: 'Footing holes are dug to the manufacturer\'s details and covered or fenced until the equipment is stood and concreted in.' },
        { unless: 'softfallOnly', text: 'Heavy parts are lifted with a machine or by two people with lifting aids, and are propped or braced until fixed, to the manufacturer\'s instructions.' },
        { unless: 'softfallOnly', text: 'The installed equipment is checked against the manufacturer\'s instructions before the fence comes down.' },
      ],
    }, {
      step: 'Lay the rubber softfall',
      only: 'softfallStep',
      hazards: [{ only: 'softfallWork', text: 'Strain lifting rubber granule and binder bags.' }, { only: 'softfallWork', text: 'Skin and lung irritation from rubber softfall binders.' }, 'The public enters the work area.'],
      controls: [
        'The work area is fenced off from the public, with signs, until the softfall has cured.',
        { only: 'softfallWork', text: 'The base is prepared to the softfall maker\'s depth, and the rubber is mixed in a paddle mixer and trowelled out to the thickness the fall height needs.' },
        { only: 'softfallWork', text: 'Rubber softfall binders are used as their safety data sheet sets out, with gloves, eye protection and good ventilation. Workers using isocyanate binders have the respiratory protection and health monitoring the data sheet calls for.' },
      ],
    }],
    ppe: ['gloveChemical', 'glassesClear'],
  },
  {
    when: 'hddBore',
    steps: [{
      step: 'Bore under the road or ground with a directional drill',
      hazards: ['The drill head strikes a buried electrical cable, gas main or other service.', 'Being caught in the rotating drill string or rod handling.', { only: 'pullback', text: 'Struck by the pipe string, swivel or pulling head during pullback.' }, { only: 'waterCrossing', text: 'Drilling fluid escapes into the waterway.' }, 'Drilling fluid under pressure blows out at the surface.', 'Traffic and the public near the entry and exit pits.', 'Noise from the rig.'],
      controls: [
        src('Get the current underground services information before boring, and locate services on site, for example through Before You Dig Australia.', WHS('s 304')),
        'Services along and across the bore path are exposed by potholing (vacuum or hand digging) and their depth confirmed before the bore passes them. The bore path is tracked and recorded as it goes.',
        'Only the trained operator runs the rig. No one stands near the rotating rods, and the rod handler and operator use agreed signals and the rig\'s interlocks.',
        'Entry and exit pits are fenced, and drilling fluid is contained and disposed of as the principal contractor directs.',
        'Traffic management is in place where the rig or pits are near the road.',
        { only: 'pullback', text: 'The pipe string is laid out on rollers along a cleared route. No one is between the string and plant, or near the swivel and pulling head, while it is pulled back, and the pull force is kept within the pipe and rig limits.' },
        { only: 'waterCrossing', text: 'Under a waterway, drilling fluid pressures and returns are watched for a frac-out, with containment and a response plan ready as the environmental approvals require.' },
        'If a service is struck, stop at once, keep everyone clear, and call the asset owner and 000.',
      ],
    }],
    ppe: ['earMuffs', 'hivis'],
  },
  {
    when: 'structureDemolition',
    steps: [{
      step: 'Demolish the structure',
      hazards: ['The structure collapses unexpectedly or in the wrong direction.', 'Asbestos or lead is disturbed.', 'A live service is struck or cut.', 'Falling debris strikes a worker or the public.', 'An excavator or other demolition plant overturns or strikes a person.', { unless: 'bridgeDemo', text: 'Silica dust and noise from breaking masonry and slabs.' }, { only: 'bridgeDemo', text: 'Silica dust and noise from breaking and crushing concrete.' }],
      controls: [
        { only: 'bridgeDemo', text: 'Services carried on or under the bridge are disconnected or diverted by their asset owners before demolition starts, and this is confirmed in writing.' },
        { unless: 'noBuildingLine', ...src('All gas, electricity, water, sewer, telecommunications and other services are disconnected and capped at or outside the building line by the authorities or licensed trades before demolition starts, and confirmed in writing.', QCODE('Demolition', 's 3.8')) },
        src('Asbestos likely to be disturbed is identified before demolition and, so far as is reasonably practicable, removed by a licensed asbestos removalist before demolition starts.', `${WHS('s 451, s 452, s 453')}; ${QCODE('Demolition', 's 3.6, s 4.2')}`),
        { only: 'attachedStructure', text: 'Services to the attached structure are isolated and capped back to the house by the licensed trades, the shared wall is propped or protected, and the house stays weatherproof and safe to use.' },
        'Demolition is done by a contractor holding any demolition licence the state requires.',
        src('Written notice is given to the regulator at least 5 days before the work starts where the structure, or a load-bearing part of it, is at least 6 m high, where load shifting machinery is used on a suspended floor, or where explosives are used.', WHS('s 142')),
        src('An exclusion zone is fenced and signed around the structure, wide enough that falling or rebounding debris cannot reach anyone outside it. No one enters while demolition is under way.', QCODE('Demolition', 's 4.3')),
        { only: 'bridgeDemo', text: 'The bridge is taken down in the sequence the engineer\'s demolition plan sets, with spans propped or supported as it requires, and kept stable at every stage. No one works on or under a span while it is cut, broken or lifted out.' },
        { unless: 'noRoofDown', ...src('The structure is demolished in the reverse order to its construction, from the roof down, and kept stable at every stage. No one works inside or under it while it is being pulled down.', QCODE('Demolition', 's 4.12')) },
        src('Excavators and other demolition plant have operator protective devices (falling object protection and a seat belt), and only the operator and a spotter in sight of the operator are near them.', QCODE('Demolition', 's 4.12')),
        src('Debris is removed as the work goes, and is not dropped freely except into a fenced drop zone.', QCODE('Demolition', 's 4.7')),
        { only: 'masonryDemo', ...src('Breaking masonry and slabs is processing a crystalline silica substance: water sprays keep dust down, and anyone still at risk wears a fit tested respirator. Hearing protection near breakers and hammers.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.1, s 7.6, s 7.6.2')}`) },
        { unless: 'bridgeDemo', text: 'Neighbours are told before work starts, and the boundary is protected from debris and dust.' },
      ],
    }],
    ppe: ['p2', 'earMuffs', 'hivis'],
  },
  {
    when: 'claddingInstall',
    steps: [{
      unless: 'cladReplace',
      step: 'Fix the battens',
      hazards: ['A fall from the scaffold, EWP or ladder.', 'Nail gun injuries.'],
      controls: [
        { fact: 'fallControl' },
        'Battens at height are fixed from a scaffold or EWP, not from ladders, and are fixed to the frame to the cladding maker\'s spacing as each one is placed.',
        'Nail guns are used with the single shot (sequential) trigger, never carried with a finger on the trigger, and disconnected before clearing a jam.',
      ],
    }, {
      step: 'Install the external cladding',
      hazards: ['A fall from the scaffold, EWP or ladder.', { unless: 'hebel', text: 'Silica dust from cutting fibre cement sheets.' }, { only: 'hebel', text: 'Silica dust from cutting AAC (Hebel) panels.' }, { unless: 'panelCladding', text: 'Nail gun injuries.' }, { unless: 'panelCladding', text: 'Strain handling long boards and sheets.' }, { only: 'panelCladding', text: 'Strain or crush handling heavy panels.' }, 'Boards blow off in the wind.'],
      controls: [
        { fact: 'fallControl' },
        'Cladding at height is fixed from a scaffold or EWP, not from ladders.',
        { only: 'cladReplace', text: 'Old boards are prised off and lowered, not thrown, with nails removed or bent over. Old paint is treated as containing lead unless tested, and is not dry sanded or burnt off.' },
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
      step: 'Rake out the joints',
      hazards: ['Silica dust from raking out mortar and cutting stone or brick.', 'A fall from the scaffold or platform.', 'Loose masonry falls onto people below.'],
      controls: [
        { fact: 'silicaControls' },
        src('Raking out mortar with a power tool is processing a crystalline silica substance: use a tool with on-tool extraction, or hand tools, and wear a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2')}`),
        ...SILICA_FOLLOW_UP,
        'Loose stones and bricks are found and made safe before work below. The area below is barricaded.',
      ],
    }, {
      step: 'Repoint the masonry',
      hazards: ['A fall from the scaffold or platform.', 'Skin burns from lime and cement mortar.'],
      controls: [
        'Mortar is mixed and used with gloves, long sleeves and eye protection. Skin that touches it is washed straight away.',
      ],
    }],
    ppe: ['p2', 'gloveChemical', 'glassesClear'],
  },
  {
    when: 'fixtures',
    steps: [{
      step: 'Fix rails, fittings and equipment to walls and floors',
      hazards: [{ unless: 'boardwalk', text: 'Drilling into hidden cables or pipes.' }, { unless: 'boardwalk', text: 'Silica dust from drilling masonry, concrete or tiles.' }, 'Strain lifting fittings into place.', { unless: 'boardwalk', text: 'People in an occupied building walk into the work area.' }, { only: 'boardwalk', text: 'Tools and fixings fall into the water, and people on the boardwalk walk into the work area.' }],
      controls: [
        { unless: 'boardwalk', text: 'Before drilling, check for cables and pipes with a detector and the services drawings, and keep clear of them.' },
        { unless: 'boardwalk', ...src('Drilling masonry, concrete or tiles is done with on-tool dust extraction, and a fit tested P2 respirator is worn where dust remains.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2')}`) },
        { only: 'boardwalk', text: 'Handrail posts are fixed to the boardwalk structure to the drawings, working from the deck, with tools tethered and fixings kept in a bucket so nothing falls into the water.' },
        { only: 'boardwalk', text: 'The section of boardwalk being worked on is closed to the public, with a signed detour or a supervised way past.' },
        { unless: 'boardwalk', text: 'Fixings suit the wall or floor and the load, as the manufacturer specifies. Heavy items are lifted into place by two people or with a lifter.' },
        { only: 'boardwalk', text: 'Fixings suit the boardwalk structure and the handrail load, as the designer or manufacturer specifies. Long rail lengths are carried and lifted into place by two people.' },
        { unless: 'boardwalk', text: 'In occupied buildings, the work area is screened or barricaded and kept tidy, with cords off walkways.' },
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
        { only: 'weldWork', text: 'Welding on site is hot work, under the site\'s hot work permit, with screens, an extinguisher at hand, fume extraction or ventilation, and a fire watch afterwards.' },
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
      step: 'Install the door',
      unless: 'motorOnly',
      hazards: ['The door or its spring releases stored energy and strikes a person.', { unless: 'noDoorLift', text: 'The door falls while it is lifted into place.' }, 'Strain lifting the door.'],
      controls: [
        'Springs are tensioned and released only with the manufacturer\'s tools and method, by a person trained in that door. No one stands in line with a spring under tension.',
        { unless: ['noDoorLift', 'largeDoor'], text: 'The door is lifted into place by two people or with a lifter, and held until its brackets are fixed.' },
        { unless: 'noDoorLift', only: 'largeDoor', text: 'The curtain and drum are lifted into place from an EWP or scissor lift, or with a forklift and a lifting frame, with the area below closed off, and held until their brackets are fixed.' },
        { only: 'doorSpring', text: 'The door is lowered and clamped, or the spring is fully unwound with the manufacturer\'s winding bars, before the broken spring is removed. Ladders are platform ladders, set up clear of the door.' },
        { only: 'noDoorMotor', text: 'The safety reverse and limits are tested before the door is handed over.' },
      ],
    }, {
      step: 'Install the door motor',
      unless: 'noDoorMotor',
      hazards: ['The door or its spring releases stored energy and strikes a person.', 'Electric shock connecting the motor.'],
      controls: [
        { only: 'motorOnly', text: 'The door is closed and its springs left as they are. The motor and rail are fixed to the ceiling or wall framing from a platform ladder, and the door is not run under power until the motor is set up to the manufacturer\'s instructions.' },
        { unless: 'largeDoor', text: 'The motor is plugged into a socket, or connected by a licensed electrician.' },
        { only: 'largeDoor', text: 'The motor is isolated until it is connected by a licensed electrician.' },
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
    // The jetting and camera crew clean and inspect the pipe before the lining crew relines it.
    // Where the drain clearing step is there, it does the cleaning.
    steps: [{
      step: 'Clean and inspect the pipe',
      unless: 'drainClear',
      hazards: ['Sewage and gases in the pipe and access chambers.', 'Water jetting under high pressure.', { only: 'road', text: 'Traffic at access points in the road.' }, 'Entering an access chamber that is a confined space.'],
      controls: [
        'Pipes are cleaned and inspected with jetters and cameras from the surface. No one enters an access chamber unless it has been assessed and a confined space permit is in place.',
        'High pressure jetting is done only by trained operators, with the hose and nozzle controlled before the pump starts.',
        { only: 'road', text: 'Access points in the road or footpath have traffic management and barriers.' },
        'Workers wash before eating, and cuts are covered, because of sewage.',
      ],
    }, {
      step: 'Reline the pipe',
      hazards: ['Sewage and gases in the pipe and access chambers.', 'Skin and lung irritation from relining resins.', { only: 'road', text: 'Traffic at access points in the road.' }, 'Entering an access chamber that is a confined space.'],
      controls: [
        'No one enters an access chamber unless it has been assessed and a confined space permit is in place.',
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
        // The services are found, and the wall dug out, before anyone works beside it.
        src('Get the current underground services information before digging beside the wall, and locate services on site.', WHS('s 304')),
        'Use a mini excavator, or dig by hand, to expose the wall no deeper or wider than the waterproofing needs, with an exclusion zone around the excavator and the footing left undisturbed.',
        src('Keep spoil, materials, plant and traffic out of the excavation\'s zone of influence unless the support is designed for those loads.', MODEL('Excavation work', 's 4.1')),
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
      step: 'Break out damaged concrete',
      hazards: ['Silica dust and noise from breaking out and grinding concrete.', 'Vibration from breakers and grinders.', { unless: 'slabGround', text: 'Concrete pieces fall onto people below.' }],
      controls: [
        { fact: 'silicaControls' },
        src('Breaking out and grinding concrete is processing a crystalline silica substance: use tools with on-tool extraction or water, and wear a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2')}`),
        ...SILICA_FOLLOW_UP,
        'Before breaking out, the extent is marked and the structure is checked by the engineer where reinforcement or load-bearing members are affected.',
        { unless: 'slabGround', text: 'The area below is barricaded, and loose concrete is removed before work moves on.' },
        'Hearing protection when breaking or grinding, and use of vibrating tools is rotated.',
      ],
    }, {
      // A slab on ground broken out in sections is re-poured in the slab steps, not patched.
      step: 'Repair the concrete',
      unless: 'slabRepairPour',
      hazards: ['Skin burns and sensitisation from repair mortars and coatings.', { unless: 'slabGround', text: 'Concrete pieces fall onto people below.' }],
      controls: [
        'Repair mortars, primers and coatings are used as their safety data sheets set out, with gloves and eye protection.',
        { only: 'crackInjection', text: 'Epoxy or polyurethane injection resins are mixed and injected as their safety data sheets set out, with chemical gloves and eye protection. Ports and packers are checked, and pressure is released before any fitting is undone.' },
        { unless: 'slabGround', text: 'The area below is barricaded, and loose concrete is removed before work moves on.' },
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
      unless: 'floorCoatOnly',
      step: 'Sand timber floors',
      hazards: ['Fine wood dust from sanding.', 'Fire from dust and from solvent coatings.', 'Noise.'],
      controls: [
        { only: 'deckRefinish', text: 'Deck strippers and cleaners are used as their safety data sheets set out, with chemical gloves and eye protection, and run-off is kept out of drains and gardens.' },
        'Sanders have dust bags or extraction, and a P2 respirator is worn while sanding.',
        { unless: 'deckRefinish', text: 'Dust bags are emptied into a metal bin outside the building at the end of each day, not left inside, as fine dust can catch fire.' },
        'Hearing protection while sanding.',
      ],
    }, {
      step: 'Coat timber floors',
      hazards: ['Fire from dust and from solvent coatings.', 'Fumes and sensitisation from polyurethane finishes.'],
      controls: [
        { fact: 'safetyDataSheet' },
        { unless: 'deckRefinish', text: 'Finishes are applied as their safety data sheets set out, with the room ventilated, no ignition sources, and the respirator the data sheet lists.' },
        { only: 'deckRefinish', text: 'Oils and stains are applied as their safety data sheets set out, and oily rags are spread out to dry or kept in a sealed metal bin, as they can self-heat and catch fire.' },
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
        { only: 'renderRepair', ...src('Cracked render is cut out with a grinder or chisel on extraction, or wet, and a fit tested P2 respirator is worn. The area below is closed off while it is removed.', WHS('s 529B, s 529C')) },
        { fact: 'fallControl' },
        'Render is mixed with a mixer or paddle, and bags are moved with a trolley.',
        'Gloves, long sleeves and eye protection are worn. Skin that touches wet render is washed straight away.',
        { unless: 'renderRepair', text: 'Mixing dry render and cutting or grinding masonry is done with dust controls, and a P2 respirator is worn where dust remains.' },
        { only: 'renderRepair', text: 'Dry render is mixed outdoors or with dust controls.' },
        { only: 'renderRepair', ...SILICA_FOLLOW_UP[0] },
      ],
    }],
    ppe: ['gloveChemical', 'glassesClear', 'p2'],
  },
  {
    when: 'roofFittings',
    steps: [{
      step: 'Fix fittings on the roof',
      hazards: ['A fall from the roof edge or through the roof.', { only: 'ventReplace', text: 'A fall through the open vent hole.' }, { unless: 'gutterMesh', text: 'Cuts from sheet metal and flashing edges.' }, { only: 'gutterMesh', text: 'Cuts from the mesh and its trims.' }, 'Heat and sun on the roof.'],
      controls: [
        { fact: 'fallControl' },
        'Work at the edge is done behind edge protection or from a scaffold or EWP, not by leaning out from the roof.',
        'Brittle or fragile roofing and skylights are found and covered or fenced before anyone walks the roof.',
        { only: 'gutterMesh', text: 'Cut resistant gloves are worn when cutting and handling the mesh and its trims, and offcuts are bagged, not left on the roof.' },
        { unless: 'gutterMesh', text: 'Cut resistant gloves are worn when handling sheet metal and flashings, and offcuts are bagged, not left on the roof.' },
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
        { unless: 'gasHeater', text: 'The heater is moved with a trolley or by two people, and set on a hearth that takes its weight.' },
        { only: 'gasHeater', text: 'The heater is moved with a trolley or by two people, and fixed on a floor or wall that takes its weight.' },
        { unless: 'gasHeater', text: 'Clearances from the heater and flue to combustible materials follow the manufacturer\'s instructions and AS/NZS 2918.' },
        { only: 'gasHeater', text: 'Clearances from the heater and flue to combustible materials, and the flue terminal position, follow the manufacturer\'s instructions and AS/NZS 5601.1.' },
        // The flue goes out through the roof, so the cowl is fitted at height whatever the fall answer.
        'The flue and cowl above the roof are fitted from a platform at the roof edge, or from a roof ladder with roof edge protection, and never in wet or windy weather.',
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
      hazards: [{ unless: 'signPostsOnly', text: 'A fall from the EWP or ladder.' }, { unless: 'signPostsOnly', only: 'screenWork', text: 'The sign or screen falls while it is lifted or fixed.' }, { unless: 'signPostsOnly', only: 'signNoScreen', text: 'The sign falls while it is lifted or fixed.' }, { only: 'signPostsOnly', text: 'Striking buried services when digging post holes.' }, { unless: 'signPostsOnly', text: 'Electric shock connecting lit signs.' }, { unless: 'signPostsOnly', text: 'People below are struck by falling items.' }, { only: 'signPostsOnly', text: 'Vehicles in the car park or road strike workers.' }],
      controls: [
        { fact: 'fallControl' },
        { unless: 'signPostsOnly', only: 'screenWork', text: 'Signs and screens are lifted with a crane, hoist or EWP rated for the load, not carried up ladders.' },
        { unless: 'signPostsOnly', only: 'signNoScreen', text: 'Signs are lifted with a crane, hoist or EWP rated for the load, not carried up ladders.' },
        { unless: 'signPostsOnly', only: 'pylonSign', text: 'Fixings into the pylon frame suit the frame and the load, as the designer specifies.' },
        { only: 'facadeSign', text: 'Fixings into the facade suit the wall and the load, as the designer specifies.' },
        { unless: 'signPostsOnly', text: 'An exclusion zone is set up below, with any footpath closure the council requires.' },
        { unless: 'signPostsOnly', only: 'screenWork', text: 'Power to lit signs and screens is connected by a licensed electrician.' },
        { unless: 'signPostsOnly', only: 'signNoScreen', text: 'Power to lit signs is connected by a licensed electrician.' },
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
        'No one enters a tank. Work inside a tank is confined space work, done only under a confined space entry permit.',
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
      step: 'Install fuel lines',
      only: 'fuelLines',
      hazards: ['Fire or explosion from fuel vapour.', 'Fuel on the skin.', 'Struck by vehicles at an operating site.'],
      controls: [
        'The hazardous areas are identified, and no ignition sources are used in them unless a hot work permit is in place.',
        'Existing tanks and lines are isolated, drained and tested free of vapour before they are opened.',
        'New lines are pressure tested before fuel is introduced.',
        'The work area is barricaded from customer vehicles.',
      ],
    }, {
      step: 'Install fuel dispensers',
      only: 'fuelDispensers',
      hazards: ['Fire or explosion from fuel vapour.', 'Fuel on the skin.', 'Struck by vehicles at an operating site.'],
      controls: [
        'The hazardous areas are identified, and no ignition sources are used in them unless a hot work permit is in place.',
        'Existing tanks and lines are isolated, drained and tested free of vapour before they are opened.',
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
      hazards: ['The pump falls while it is lifted or lowered.', 'Strain handling pumps and pipe.', 'Electric shock connecting the pump.', { only: 'pumpOpening', unless: 'sewerPumpSwap', text: 'A fall into an open bore, pit or well.' }, { only: 'sewerPumpSwap', text: 'A fall into the open well.' }],
      controls: [
        // A sewer pump well swap says how the old pump is isolated and lifted out in its own step.
        { only: 'pumpReplace', unless: 'sewerPumpSwap', text: 'The old pump is isolated and locked out, and its lines are depressurised and drained, before it is disconnected.' },
        { unless: 'sewerPumpSwap', text: 'Where a pump is too heavy to handle by hand, it is lifted or lowered with a hoist, tripod or crane rated for the load, and no one stands under the load.' },
        { only: 'sewerPumpSwap', text: 'The new pump is lowered down its guide rails with the davit or tripod, from the top of the well, and no one stands under the load or reaches into the well.' },
        { only: 'pumpOpening', unless: 'sewerPumpSwap', text: 'Openings, bores and pits are covered or barricaded when not being worked on.' },
        { only: 'sewerPumpSwap', text: 'The well opening is covered or barricaded whenever no one is working at it, and the lid is refitted before the area is left.' },
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
      step: 'Abrasive blast the surfaces',
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
        src('Anchor holes are drilled with on-tool extraction, and a fit tested P2 respirator is worn.', WHS('s 529B, s 529C')),
        ...SILICA_FOLLOW_UP.slice(0, 2),
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
        { only: 'subfloor', text: 'Work under an existing floor is done from the subfloor where there is room: the access is checked, sewage is treated as infectious, and the space is assessed as a confined space only if it meets the definition. Where a slab must be cut, it is scanned and saw cut with water or on-tool extraction, and the cutter wears a fit tested P2 respirator, as cutting concrete is processing crystalline silica.' },
      ],
    }],
    ppe: ['gloveChemical', 'glassesClear'],
  },
  {
    when: 'trafficSignals',
    // Pits and conduits are civil work; the poles are stood by a crane truck crew.
    steps: [{
      step: 'Install pits and conduits',
      unless: ['poleOnly', 'pitsByTrench'],
      hazards: ['Struck by passing traffic.', 'Striking underground services or overhead lines.', { unless: 'polesNamed', text: 'Electric shock connecting to the supply.' }],
      controls: [
        'All work is inside the closure set out in the traffic management plan, with traffic controllers where the plan requires them.',
        { only: 'barrierReplace', text: 'The damaged rail and posts are unbolted and lifted out with plant or two people, with the end of the remaining barrier protected until the new section is fixed.' },
        'Underground services are located before pits and conduits are dug, and plant keeps its approach distances from overhead lines.',
        { unless: 'polesNamed', text: 'Signal and lighting wiring and the connection to the supply are electrical work for a licensed electrician accredited by the road authority or network operator, and the supply is isolated and proved de-energised before the connection.' },
      ],
    }, {
      step: 'Stand the poles',
      only: 'polesNamed',
      hazards: ['Struck by passing traffic.', 'A pole falls while it is lifted or stood.', 'Striking underground services or overhead lines.', 'Electric shock connecting to the supply.'],
      controls: [
        'All work is inside the closure set out in the traffic management plan, with traffic controllers where the plan requires them.',
        { only: 'poleOnly', text: 'Underground services are located before pits and conduits are dug, and plant keeps its approach distances from overhead lines.' },
        { unless: 'poleOnly', text: 'The crane truck and EWP keep their approach distances from overhead lines.' },
        { only: 'polesNamed', text: 'Poles are lifted and stood with a crane truck by licensed operators and doggers, with work at the pole head done from an EWP, with an exclusion zone under the load, and bolted to their footings before the slings are released.' },
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
        { only: 'smallPlant', text: 'Holes are dug with the mini excavator or auger attachment by a competent operator, with workers out of its reach and the holes covered or fenced until they are poured.' },
        src('Get the current underground services information, for example through Before You Dig Australia, before digging, and work to it.', WHS('s 304')),
        { only: 'footingPour', text: 'Concrete is placed into the holes from the truck chute, a barrow or a pump, with gloves and boots worn and skin contact washed off straight away.' },
        { unless: 'handDigOff', text: 'Dig with spades and post hole shovels, take turns, and keep loads small. A powered auger is used only with both hands on the handles and stopped before it is cleared.' },
        { only: 'masonryLay', text: 'Strip or pad footings are dug to the drawings, with the trench kept shallow or battered, and concrete is placed with gloves and boots, with skin contact washed off straight away.' },
        // Light poles stand on footings with cast-in cages or bolts, poured before the poles go up.
        { only: 'solarLights', text: 'The footing cages or anchor bolts are set to the manufacturer\'s or engineer\'s template, and the footings are poured and left to cure for the time the supplier states before any pole is stood. Concrete is placed with gloves and boots, with skin contact washed off straight away.' },
        'Open holes are covered or fenced when no one is working at them.',
      ],
    }],
  },
  {
    when: 'tileRoofStrip',
    // One step per activity: strip the old tiles, lay sarking, fix battens, re-lay the tiles.
    // Sarking and battens come when the task names them, and both when it names neither.
    steps: [{
      step: 'Strip the roof tiles',
      hazards: ['A fall from the roof edge or through the battens.', 'Tiles fall onto people below.', 'Strain lifting stacks of tiles.'],
      controls: [
        { fact: 'fallControl' },
        'Tiles are passed down by a chute, hoist or materials lift into a closed area, never thrown.',
        'An exclusion zone is kept under the roof edge and the chute while tiles are removed.',
        'Workers walk only on the battens over the trusses, and sarking is never stood on.',
      ],
    }, {
      step: 'Lay the sarking',
      only: 'roofSarking',
      hazards: ['A fall from the roof edge or through the battens.'],
      controls: [
        { fact: 'fallControl' },
        'Sarking is laid from the eaves up, lapped and fixed as it is laid, and is not rolled out in strong wind.',
        'Workers walk only on the battens over the trusses, and sarking is never stood on.',
      ],
    }, {
      step: 'Fix new roof battens',
      only: 'roofBattenFix',
      hazards: ['A fall from the roof edge or through the battens.'],
      controls: [
        { fact: 'fallControl' },
        'Workers walk only on the battens over the trusses, and sarking is never stood on.',
        'Battens are fixed to the trusses as the manufacturer and the roofing standard require, working up from the eaves.',
      ],
    }, {
      step: 'Lay the roof tiles',
      only: 'roofRelay',
      hazards: ['A fall from the roof edge or through the battens.', 'Strain lifting stacks of tiles.', 'Silica dust from cutting concrete or terracotta tiles.'],
      controls: [
        { only: 'slateRoof', ...src('Slates are cut with a slate cutter or hand tools where possible. Power cutting is done wet or on extraction with a fit tested P2 respirator, as slate contains crystalline silica.', WHS('s 529B, s 529C')) },
        { only: 'slateRoof', text: 'Slates are stacked on the roof only in small lots spread along the battens, and are passed up by hoist, not carried up ladders.' },
        { fact: 'fallControl' },
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
      only: 'screenStep',
      step: 'Fit fly screens',
      hazards: ['Strain lifting screens into place.', 'Cuts from mesh and aluminium edges.', 'A fall from a ladder at upper windows.', 'Drilling into hidden wiring.'],
      controls: [
        'Gloves are worn when cutting and handling mesh and frames.',
        { unless: 'groundFloor', text: 'Upper storey screens are fitted from inside where possible. A screen fitted from outside more than 2 m up is fitted from the access set out in the fall control, and a platform ladder on firm level ground is used only below 2 m.' },
        'Check for wiring before drilling near switches and power points.',
      ],
    }, {
      only: 'doorWork',
      step: 'Fit security doors',
      hazards: ['Strain lifting heavy security doors.', 'Cuts from mesh and aluminium edges.', 'Drilling into hidden wiring.'],
      controls: [
        'Heavy security doors are lifted by two people or with a door lifter.',
        'Gloves are worn when cutting and handling mesh and frames.',
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
    // Laying the decking and stud welding are separate crews. Each comes when the task names
    // it, and the decking when it names neither.
    steps: [{
      step: 'Lay metal decking',
      only: 'deckLay',
      hazards: ['A fall from the leading edge or through gaps in the decking.', 'Decking sheets blown off or slipping.'],
      controls: [
        { fact: 'fallControl' },
        'Bundles are landed only on the beams at the points the erection sequence allows, and the bands are cut only once the bundle is secure.',
        'Sheets are laid from a protected edge or over safety nets, and fixed as they are laid. Penetrations are covered and marked.',
        'Loose sheets are not left out in wind.',
      ],
    }, {
      step: 'Weld shear studs',
      only: 'studWeld',
      hazards: ['A fall from the leading edge or through gaps in the decking.', 'Arc flash, UV and fumes from stud welding.', 'Fire from welding sparks.'],
      controls: [
        { fact: 'fallControl' },
        'Stud welding is done with screens, eye and face protection rated for welding, and ventilation. Cables and the stud welder are checked before use.',
        'Hot work is done under the site\'s hot work permit, with an extinguisher at hand and a fire watch below.',
      ],
    }],
    ppe: ['earPlugs'],
  },
  {
    when: 'shadeSail',
    // Standing the posts (crane truck and footings) and fitting the sails (tensioning at
    // height) are separate activities. Replacing sails on existing posts stands no posts.
    steps: [{
      step: 'Stand the shade sail posts',
      unless: 'sailsOnly',
      hazards: ['A post falls while it is lifted or stood.', 'Children or the public near the work.'],
      controls: [
        'Posts are lifted and stood with a crane truck or excavator within its rated capacity, and braced until the footing concrete has cured.',
        { unless: 'publicSite', text: 'The work area is fenced off from children, students and the public, as the school or site manager agrees.' },
      ],
    }, {
      step: 'Fit and tension the shade sails',
      hazards: ['A sail fitting or cable lets go under tension.', 'A fall from the EWP or ladder.', 'Children or the public near the work.'],
      controls: [
        'Sails are tensioned with the fittings and turnbuckles the designer specifies, standing clear of the line of the cable.',
        'Sail fixings at height are done from an EWP or a platform ladder.',
        { unless: 'publicSite', text: 'The work area is fenced off from children, students and the public, as the school or site manager agrees.' },
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
        'The supply is isolated and the line depressurised before it is cut, and opened slowly once the joints are complete.',
        'Heavy valves and meters are lifted with two people or a lifting aid.',
        'Open pits are covered or fenced when no one is working at them.',
      ],
    }],
  },
  {
    when: 'tankPlace',
    steps: [{
      step: 'Lift and place tanks, pits or precast units',
      hazards: ['The load swings or falls while it is lifted.', 'A person in the excavation is struck by the load.', 'The excavation edge collapses under the plant.', { only: 'tankPit', text: 'The sides of the tank pit collapse onto a person.' }],
      controls: [
        // A tank pit is usually deeper than the pipe trenches: it is dug and worked from outside.
        { only: 'tankPit', text: 'The tank pit is dug to the tank maker\'s dimensions, with its sides battered or benched to suit the ground, and fenced while it is open. The tank is lowered and levelled from outside the pit, and no one enters it. Where anyone must enter a pit 1.5 m or deeper, its sides are shored, battered or benched first and this SWMS is reviewed for the deeper excavation.' },
        { only: 'pumpStationNew', text: 'No one enters the wet well once it is placed. It is a confined space, and any entry is made only under a confined space entry permit, with the atmosphere tested and a standby person at the top.' },
        'Tanks, pits and precast units are lifted on their lifting points with rigging rated for the load, by a licensed operator and dogger where a crane is used.',
        { only: 'trench', text: 'No one is in the excavation while a unit is lowered. Workers guide it with tag lines from outside the excavation.' },
        'Plant stands back from the excavation edge as the excavation design or a competent person sets out.',
        { only: 'treatmentPlant', text: 'The plant\'s pumps, blower and alarm are wired and connected by a licensed electrician, and are not run until they are connected and tested.' },
      ],
    }],
  },
  {
    when: 'jettyRepair',
    steps: [{
      step: 'Remove and replace damaged timbers',
      hazards: ['A fall through the opened deck.', 'Cuts and kickback from saws.', 'Dust from treated timber.', { unless: 'boardsOnly', text: 'Heavy timbers fall or swing while they are moved.' }, { only: 'boardsOnly', text: 'Strain carrying bundles of deck boards.' }],
      controls: [
        { fact: 'fallControl' },
        // The work over the water step already opens one bay at a time and covers it.
        { unless: 'deckingWork', text: 'Openings in the deck are barricaded or covered as soon as boards are removed.' },
        { unless: ['heavyTimbers', 'boardsOnly'], text: 'Bearers and long timbers are carried by two people or moved on a trolley, and set down, not dropped.' },
        { only: 'boardsOnly', text: 'Deck boards are carried in small bundles by two people or moved on a trolley, and set down, not dropped. Old fixings are pulled or cut off flush as each board comes up.' },
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
      step: 'Install drainage behind the retaining wall',
      hazards: ['The cut behind the wall collapses.', 'Strain shovelling gravel.'],
      controls: [
        src('Get the current underground services information before digging behind the wall, and locate services on site.', WHS('s 304')),
        'No one works between the wall and an unstable cut. The cut is battered, or work stops and the SWMS is reviewed.',
        'The ag drain, geotextile and drainage gravel are laid as the wall designer specifies.',
        'Gravel is moved with a bobcat or wheelbarrow, and shovelling is shared.',
      ],
    }, {
      step: 'Backfill behind the retaining wall',
      hazards: ['The wall is pushed over by plant or backfill.', 'The cut behind the wall collapses.', 'Strain shovelling gravel.'],
      controls: [
        'Backfill is placed and compacted in layers with a plate compactor, and plant stays back from the wall as its designer requires.',
        'No one works between the wall and an unstable cut. The cut is battered, or work stops and the SWMS is reviewed.',
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
      hazards: ['Tools or materials fall onto traffic or trains below.', 'Struck by passing traffic while setting up.'],
      controls: [
        'Lanes or tracks below are closed under the road authority\'s or rail operator\'s permit, or catch screens or platforms are fitted, before work starts above them.',
        'Tools and materials are tethered or contained.',
        { only: 'painting', text: 'Drop sheets and spray are contained.' },
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
        'Outdoor units on balconies or roofs are set down from inside the balustrade or edge protection. No one climbs on or leans over the balustrade, and units on walls or roofs above 2 m are fitted from an EWP, scaffold or platform.',
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
        { only: 'boomGate', text: 'Footings and conduits for gates, booms and ticket machines are dug only after services are located.' },
        'Gate leaves, posts, boom housings and arms are lifted with two people or a lifting aid and propped until fixed to their footings or anchors.',
        { only: 'solarGate', text: 'The solar panel and battery are fixed to the post or gate as the maker specifies, with the battery terminals covered until the final connection.' },
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
        { only: 'poolWiring', text: 'A new outdoor power point and its circuit are installed by a licensed electrician with the circuit isolated first, weatherproof and RCD protected, and placed the distance from the pool the wiring rules set.' },
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
        'The truss is lifted by crane on the crane company\'s lift plan, slung by licensed riggers, with an exclusion zone under the load.',
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
      hazards: ['Uprights or beams fall while racking is assembled.', 'A fall from the EWP or ladder.', { unless: 'newBuildingSite', text: 'Struck by forklifts in an operating warehouse.' }, { only: 'newBuildingSite', text: 'Struck by other trades\' plant moving through the new building.' }, 'Drilling the slab releases silica dust.'],
      controls: [
        'Racking is installed to the manufacturer\'s design and AS 4084, with base plates anchored and beams locked with their safety clips.',
        'Upper beams are fitted from an EWP or scissor lift, never by climbing the racking.',
        { unless: 'newBuildingSite', text: 'The work area is barricaded from forklifts and other plant, as the site manager arranges.' },
        { only: 'newBuildingSite', text: 'The work area is barricaded from other trades and their plant, as the principal contractor arranges.' },
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
      hazards: [{ only: 'rfEquipment', text: 'Exposure to radio frequency energy from live antennas.' }, { unless: 'towerWork', text: 'A fall from the roof edge.' }, { only: 'towerWork', text: 'A fall while climbing or working on the tower.' }, 'Equipment falls while it is lifted.', 'Electric shock connecting equipment.'],
      controls: [
        { only: 'rfEquipment', text: 'Work follows the carrier\'s radio frequency safety plan: transmitters near the work are switched off or turned down by the carrier, and workers stay outside the marked exclusion zones (ARPANSA RPS S-1).' },
        { fact: 'fallControl' },
        { only: 'towerWork', text: 'Tower climbing is done only by workers trained in tower climbing and rescue, attached at all times to the tower\'s fall arrest system or with twin lanyards, with a rescue plan and rescue kit on site for a worker suspended in a harness.' },
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
        'Detectors are fixed from a platform ladder or mobile scaffold, not from a stepladder top.',
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
      hazards: ['A fall from the tiers or frame while it is erected or dismantled.', { unless: 'standDismantle', text: 'The structure collapses or overturns in wind or under crowd load.' }, { only: 'standDismantle', text: 'A part-dismantled section collapses or overturns in wind.' }, 'Components fall onto people below.'],
      controls: [
        { unless: 'standDismantle', text: 'The grandstand is erected to its engineer\'s or supplier\'s design for the crowd and wind loads, on ground checked as able to carry it.' },
        { only: 'standDismantle', text: 'The grandstand is dismantled in the supplier\'s sequence, top down, with braces and ties left in place until the parts they hold are removed, and components are lowered, not dropped.' },
        src('Where the grandstand is built from scaffolding and a person or object could fall more than 4 m, it is erected and dismantled by licensed scaffolders.', WHS('s 81, schedule 3')),
        { unless: 'standDismantle', text: 'Seats, handrails and stairs are complete, and a competent person inspects and certifies the structure in writing, before the public uses it.' },
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
        'Hydrant and booster work is done by workers holding the fire protection licence or accreditation the state requires.',
        'The connection to the live water supply is made only under the water authority\'s or building owner\'s isolation, with the line depressurised.',
        { unless: 'sprinkler', text: 'The assembly is pressure tested and commissioned to AS 2419.1 with the area kept clear during the test.' },
        { only: 'sprinkler', text: 'The booster valve set is pressure tested and commissioned to AS 2118.1 and the system design, with the area kept clear during the test.' },
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
        'Benchtop cut-outs are cut with on-tool extraction, and natural stone benchtops are cut wet or with extraction and a P2 respirator.',
        ...ENG_STONE,
        SILICA_FOLLOW_UP[0],
        'The new appliance is connected and tested to the manufacturer\'s instructions and the wiring rules before the circuit is re-energised.',
      ],
    }],
  },
  {
    when: 'concreteWall',
    // The wall's own reo and pour, not suspended slab work.
    replaces: ['reo', 'concrete'],
    steps: [{
      step: 'Form the retaining wall',
      hazards: ['A fall from the wall forms or work platform.', 'Wall forms fall or burst during the pour.', 'The excavation behind the wall collapses onto workers.'],
      controls: [
        { fact: 'fallControl' },
        'Wall forms are built and braced to their design, with a work platform and edge protection along the top for fixing reo and placing concrete.',
        'No one works between the wall forms and an unsupported excavation face. The face is battered, benched or shored as the excavation plan sets out.',
        'Forms are stripped only when the engineer\'s strength or time is reached.',
      ],
    }, {
      step: 'Fix the retaining wall reo',
      hazards: ['A fall from the wall forms or work platform.', 'Impalement on exposed starter bars.', 'The excavation behind the wall collapses onto workers.'],
      controls: [
        { fact: 'fallControl' },
        'Wall forms are built and braced to their design, with a work platform and edge protection along the top for fixing reo and placing concrete.',
        'Exposed starter bars are capped or covered.',
        'No one works between the wall forms and an unsupported excavation face. The face is battered, benched or shored as the excavation plan sets out.',
      ],
    }, {
      step: 'Pour the retaining wall',
      hazards: ['A fall from the wall forms or work platform.', 'Wall forms fall or burst during the pour.', 'Struck by the concrete pump hose or kibble.'],
      controls: [
        { fact: 'fallControl' },
        'Concrete is placed at the rate the form design allows, and a person watches the forms during the pour from outside the area they could fall into.',
        src('The placing boom operator holds a high risk work licence for a concrete placing boom.', WHS('s 81, schedule 3')),
        'Keep people clear of the end hose at start-up. Clear blockages only after the pressure is released.',
        'Wash wet concrete off the skin straight away. Wear gloves and eye protection.',
        'Drainage and backfill are placed as the design shows, only once the engineer allows, and backfill is compacted in layers.',
      ],
    }],
    ppe: ['gloveChemical'],
  },
  {
    when: 'tankWalls',
    steps: [{
      step: 'Form the tank walls',
      hazards: ['A fall from the wall forms or work platform.', 'Wall forms fall or burst during the pour.'],
      controls: [
        { fact: 'fallControl' },
        'Wall forms are built and braced to their design, with a work platform and edge protection along the top for fixing reo and placing concrete.',
        'No one enters the tank to strip forms or finish the inside until the space has been assessed, and entry is under a confined space permit where it is one.',
      ],
    }, {
      step: 'Fix the tank wall reo',
      hazards: ['A fall from the wall forms or work platform.', 'Impalement on exposed starter bars.'],
      controls: [
        { fact: 'fallControl' },
        'Wall forms are built and braced to their design, with a work platform and edge protection along the top for fixing reo and placing concrete.',
        'Exposed starter bars are capped or covered.',
      ],
    }, {
      step: 'Pour the tank walls',
      hazards: ['A fall from the wall forms or work platform.', 'Wall forms fall or burst during the pour.', 'Struck by the concrete pump hose or kibble.'],
      controls: [
        { fact: 'fallControl' },
        'Concrete is placed at the rate the form design allows, and a person watches the forms during the pour.',
        'Keep people clear of the end hose at start-up. Clear blockages only after the pressure is released.',
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
        src('Crack surfaces are ground with on-tool extraction, and a P2 respirator is worn.', WHS('s 529B, s 529C')),
        ...SILICA_FOLLOW_UP.slice(0, 2),
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
        'Water and waste connections, any filter and any backflow prevention device the plumbing rules require are fitted by a licensed plumber.',
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
      step: 'Lay floor joists',
      hazards: ['A fall from the edge of the floor frame or through the joists.', 'Strain lifting joists, bearers and flooring sheets.'],
      controls: [
        { fact: 'fallControl' },
        'Edge protection or a perimeter scaffold is in place around an upper floor before joists are laid, and no one walks on joists that are not braced.',
        'Joists and bearers are handled by two people or lifted by plant, and stacked on the deck only where the frame can carry them.',
      ],
    }, {
      step: 'Lay the floor deck',
      hazards: ['A fall from the edge of the floor frame or through the joists.', 'Strain lifting joists, bearers and flooring sheets.', 'Nail gun injuries.'],
      controls: [
        { fact: 'fallControl' },
        'Flooring sheets are laid and fixed as the work goes, so no one stands on loose sheets, and stair and other voids are covered or guarded.',
        'Nail guns have a sequential trigger, and are disconnected before clearing jams.',
      ],
    }],
  },
  {
    when: 'tactileInstall',
    steps: [{
      step: 'Install tactile indicators',
      hazards: [{ unless: 'flatTactile', text: 'A fall on the stairs while kneeling or working.' }, { only: 'flatTactile', text: 'Knee strain kneeling to fix the indicators.' }, 'The public walks into the work area.', 'Skin and breathing exposure to adhesives.', 'Silica dust from drilling stud holes into concrete.'],
      controls: [
        { unless: 'flatTactile', text: 'The part of the stair being worked on is barricaded, with a safe way past kept open or the stair closed under the site or station operator\'s arrangements.' },
        { unless: 'flatTactile', text: 'Work is done facing the stair, with kneeling pads, tools and materials kept off the treads in use.' },
        { only: 'flatTactile', text: 'The section being worked on is barricaded, with a safe way past kept open under the site or station operator\'s arrangements. On a platform, work stays behind the line the rail operator sets, under its track protection rules.' },
        { only: 'flatTactile', text: 'Kneeling pads are used and tasks rotated.' },
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
      step: 'Remove the old frames',
      hazards: ['Broken glass and a frame falling as it is cut free.'],
      controls: [
        'Glass is taken out or taped first, and each frame is cut free and lowered by two people.',
      ],
    }, {
      step: 'Cut the lintel bearings',
      hazards: ['Masonry above the opening drops before the lintel is in.', 'Silica dust from cutting brickwork.'],
      controls: [
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
        { unless: 'confined', text: 'No one enters the pit until it has been assessed. A pit that is a confined space is entered only under the confined space steps: permit, atmosphere testing, standby person and rescue plan.' },
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
      step: 'Protect the footpath',
      only: 'footpathWork',
      hazards: ['Remaining sections of the wall fall onto workers or the public.'],
      controls: [
        { only: 'footpathWork', text: 'The footpath next to the wall is closed or a protected walkway is set up, with the approval of the authority that controls it.' },
      ],
    }, {
      step: 'Clear the collapsed wall',
      hazards: ['Remaining sections of the wall fall onto workers or the public.', 'Strain handling bricks and rubble.', 'Silica dust from broken brickwork.'],
      controls: [
        { unless: 'footpathWork', text: 'The area below and beside the wall is fenced off, and vehicles are kept off the driveway or yard next to it while the wall is unstable.' },
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
        'The area around the line under test is kept clear, and pressure is released before any fitting is touched.',
        'Purging is to a safe place outdoors, with no ignition sources nearby.',
      ],
    }],
  },
  {
    when: 'fenceRemove',
    steps: [{
      step: 'Take down the old fence',
      hazards: [{ only: 'sheetFenceOld', text: 'Cuts from sheet and wire edges.' }, { only: 'chainWire', unless: 'timberFenceOld', text: 'Cuts from old wire, and wire springing back when it is cut.' }, { only: 'timberFenceOld', text: 'Splinters, nails and cuts from old palings and rails.' }, { unless: 'chainWire', text: 'Strain lifting panels and digging out posts.' }, { only: 'chainWire', text: 'Strain rolling up old wire and digging out posts.' }, { unless: 'notFibroFence', text: 'Asbestos in an old fibro fence.' }, { unless: 'railCorridor', text: 'Children, animals or the public get through the gap.' }, { only: 'railCorridor', text: 'People get into the rail corridor through the gap.' }],
      controls: [
        { unless: 'notFibroFence', text: 'An old fibro fence on a property built before 2004 (asbestos products were used until the national ban at the end of 2003) is treated as asbestos unless tested, and is not cut or broken.' },
        { unless: 'railCorridor', text: 'The fence is taken down in sections, with the boundary kept secure by temporary fencing where a pool, animals or the public need it.' },
        { only: 'railCorridor', text: 'The fence is taken down in sections, and each gap is closed with temporary fencing before it is left, so no one can get into the rail corridor.' },
        { only: 'sheetFenceOld', text: 'Sheets and wire are handled with cut-resistant gloves, and old posts and footings are dug out or cut off below ground, with the holes filled or covered.' },
        { only: 'chainWire', unless: 'timberFenceOld', text: 'Old chain wire and line wires are released from tension before they are cut, and rolled up with cut-resistant gloves. Old posts and footings are dug out or cut off below ground, with the holes filled or covered.' },
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
        { only: 'vanityReplace', text: 'The water is isolated at the room or service valve before the old vanity is disconnected.' },
        { only: 'vanityReplace', text: 'The old and new vanities are moved by two people, and the new unit is fixed to the wall or floor as the supplier specifies.' },
        { unless: 'vanityReplace', text: 'Vanities, toilets and basins are moved by two people or on a trolley, and fixed to the wall or floor as the supplier specifies.' },
        src('Tiles and stone tops are drilled with on-tool extraction or water, and a P2 respirator is worn.', WHS('s 529B, s 529C')),
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'shedTakeDown',
    steps: [{
      step: 'Take down the shed frame',
      hazards: ['The frame collapses while members are removed.', 'Cuts and splinters from sheets, timber and fixings.', 'Asbestos in old fibro sheets.', 'Strain handling frame members.'],
      controls: [
        'Wall and roof sheets are taken off first, working from a platform or ladder, not from the frame. Old fibro sheets on a shed built before 2004 are treated as asbestos unless tested, and are removed under the asbestos rules.',
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
        { unless: 'rockArmour', text: 'Smaller rock is placed by hand with gloves and steel-capped boots, lifting only pieces one person can handle.' },
        { only: 'rockArmour', text: 'Armour rock is placed one piece at a time by the excavator from a stable position, within its lifting chart at that reach, and no one is on the face below.' },
        'Workers stay beside or above the rock being placed, never downhill of it.',
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
    // The board is mounted, then the sub-mains are run to it; where the cable pulling step
    // is there, it runs the sub-mains instead.
    steps: [{
      step: 'Mount the sub-board',
      hazards: ['Strain lifting the board and cable drums.'],
      controls: [
        'The sub-board is fixed to the wall or frame as the manufacturer specifies before it is wired.',
      ],
    }, {
      step: 'Run the sub-mains',
      unless: 'cablePull',
      hazards: ['Electric shock at the main switchboard, which stays partly energised.', 'Strain lifting the board and cable drums.', 'A fall from a ladder or platform running cable at height.'],
      controls: [
        'The sub-mains are run on tray or in conduit, with cable drums on stands and pulled with a winch or enough people. Work at height is done from a platform ladder, or from an EWP where one is used.',
        'Before termination at the main switchboard, the circuit is isolated, locked and proved de-energised, and live parts nearby are shrouded.',
      ],
    }],
  },
  {
    when: 'mainRepair',
    steps: [{
      step: 'Isolate and repair the main',
      hazards: ['Water under pressure when the damaged section is opened.', 'The trench floods.', 'Contaminating the drinking water supply.'],
      controls: [
        'The main is isolated at its valves by the water authority, or under its approval, and depressurised and drained before the damaged section is cut out.',
        'Water is pumped out of the excavation, and no one works in it while it is flooding.',
        'The repair clamp or new section is fitted to the authority\'s specification, and the main is flushed and returned to service as the authority requires.',
      ],
    }],
  },
  {
    when: 'tempPole',
    steps: [{
      step: 'Stand the temporary power pole',
      hazards: ['Striking buried services digging the pole footing.', 'The pole falls while it is stood.', 'Contact with overhead power lines.', 'Strain lifting the pole.'],
      controls: [
        src('Get the current underground services information before digging the footing, and work to it.', WHS('s 304')),
        'The pole is a manufactured temporary pole installed to its maker\'s instructions and the network operator\'s requirements, stood by two people or with a lifting aid, and braced until its footing holds it.',
        'The pole and anyone handling it keep the approach distances to overhead lines.',
        'The supply is connected to the pole only by the network operator or a person it authorises, after the electrician has tested the installation.',
      ],
    }],
  },
  {
    when: 'fireCollar',
    steps: [{
      step: 'Fix fire collars to the slab',
      hazards: ['A fall from a ladder or platform working overhead.', 'Silica dust drilling anchors into the slab soffit.', 'Dust and debris falling into the eyes.'],
      controls: [
        'Collars on the slab soffit are fixed from a platform ladder or mobile scaffold, not from the top of a stepladder.',
        src('Anchors are drilled with on-tool extraction, and a fit tested P2 respirator and eye protection are worn.', WHS('s 529B, s 529C')),
        ...SILICA_FOLLOW_UP.slice(0, 2),
        'Collars are fitted to the manufacturer\'s tested system for the pipe and slab, and labelled.',
      ],
    }],
    ppe: ['p2', 'glassesClear'],
  },
  {
    when: 'pileComplete',
    steps: [{
      step: 'Place the reinforcement cage and concrete the pile',
      hazards: ['The cage swings or drops while it is lifted.', 'A fall into an open bore.', 'Struck by the concrete pump hose or tremie.'],
      controls: [
        'Cages are lifted on their lifting points with a crane or the rig, slung by a licensed dogger, and lowered with tag lines and no one under the load.',
        'Open bores are covered or barricaded until they are concreted.',
        'Concrete is placed by tremie or pump to the pile design, with the pump hose secured and an exclusion zone at the bore.',
      ],
    }],
  },
  {
    when: 'wetAreaSheets',
    steps: [{
      step: 'Fix new wall sheets',
      hazards: ['Silica dust cutting fibre cement sheets.', 'Strain handling sheets.', 'Drilling into hidden pipes or cables.'],
      controls: [
        src('Fibre cement and wet area sheets are cut by scoring and snapping or with shears where possible, or with a saw on extraction, and a fit tested P2 respirator is worn when sawing.', WHS('s 529B, s 529C')),
        'Sheets are carried by two people and fixed to the frame to the manufacturer\'s wet area details.',
        'Pipes and cables in the wall are located before fixing.',
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'regroutStep',
    steps: [{
      step: 'Rake out and reseal the joints',
      hazards: ['Silica dust from raking out grout with power tools.', 'Cuts from blades and scrapers.', 'Fumes from sealants and cleaners.'],
      controls: [
        'Old grout and silicone are removed with hand tools or a multi-tool on extraction, and a P2 respirator is worn when power tools are used.',
        'Cut-resistant gloves are worn with blades and scrapers.',
        'Sealants, grouts and cleaners are used as their safety data sheets set out, with the room ventilated.',
      ],
    }],
    ppe: ['p2', 'gloveCut'],
  },
  {
    when: 'toiletReplace',
    steps: [{
      step: 'Replace the fixture',
      hazards: ['Contact with sewage and bacteria.', 'Strain or a broken pan lifting the fixture.', 'Cuts from broken ceramic.'],
      controls: [
        'The water is turned off at the stop valve, and the cistern and pan are emptied before the old fixture is disconnected.',
        'The old pan is lifted out by two people or broken out under a cover, with cut-resistant gloves, and the drain is plugged so sewer gas cannot enter the room.',
        'Gloves are worn, cuts are covered, and hands are washed before eating.',
        'The new fixture is fixed and connected to the manufacturer\'s instructions and tested for leaks before it is used.',
      ],
    }],
    ppe: ['gloveChemical', 'gloveCut'],
  },
  {
    when: 'smallPourMix',
    steps: [{
      step: 'Mix bagged concrete',
      hazards: ['Cement dust in the eyes and lungs when bags are opened and tipped.', 'Back strain lifting bags.', 'Cement burns from wet concrete.'],
      controls: [
        'Bags are lifted one at a time within what a person can handle, or smaller bags are used, and stacked at waist height near the mixer or barrow.',
        'Bags are opened and tipped low and slowly, out of the wind, with eye protection and a P2 respirator.',
        'A powered mixer has its guards in place and its lead tagged, and is never reached into while it turns.',
        'Gloves and boots are worn, and wet concrete is washed off skin straight away.',
      ],
    }],
    ppe: ['p2', 'gloveChemical'],
  },
  {
    when: 'wallPanels',
    steps: [{
      step: 'Fix acoustic panels to the walls',
      hazards: ['A fall from a ladder or platform fixing high panels.', 'Strain lifting panels.', 'Drilling into hidden cables or pipes.', 'Fibres and dust from cutting panels.'],
      controls: [
        'High panels are fixed from a platform ladder or mobile scaffold, not from the top of a stepladder.',
        'Panels are carried by two people where they are large, and held or propped until fixed.',
        'Walls are checked for cables and pipes before drilling.',
        'Panels are cut with a knife or a saw on extraction, with gloves and a P2 respirator where they shed fibres.',
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'birdNetting',
    steps: [{
      step: 'Install bird netting at height',
      hazards: ['A fall from the EWP or ladder.', 'Contact with bird droppings and nests.', 'People below struck by tools or fixings.'],
      controls: [
        { fact: 'fallControl' },
        { unless: 'birdSpikes', text: 'The net and its cables are fixed from an EWP or scaffold, with the area below closed off.' },
        { only: 'birdSpikes', text: 'Spikes are fixed from an EWP or scaffold, with the area below closed off, and handled with gloves.' },
        'Droppings and nests are wetted and removed before fixing, with gloves and a P2 respirator, and hands are washed before eating.',
        { unless: 'birdSpikes', text: 'Fixings are drilled into the structure the netting supplier specifies, and the net is tensioned to its instructions.' },
        { only: 'birdSpikes', text: 'Spikes are glued or screwed to the ledges as the supplier specifies, without drilling through roof sheets or flashings.' },
      ],
    }],
    ppe: ['p2', 'gloveGeneral'],
  },
  {
    when: 'spaInstall',
    steps: [{
      step: 'Place and connect the spa',
      hazards: ['The deck or floor fails under the full spa.', 'The spa falls or crushes someone while it is moved.', 'Electric shock near water.', 'Drowning once it is filled.'],
      controls: [
        'The deck or slab is checked by an engineer or the deck designer for the weight of the full spa and its occupants before it is placed.',
        'The spa is moved with trolleys, a crane or enough people for its weight, on a planned route, and set down level.',
        'The power supply is installed by a licensed electrician, RCD protected and bonded as the wiring rules require.',
        'Once filled, the spa has its lockable cover fitted, and any pool barrier rules for its depth are met.',
      ],
    }],
  },
  {
    when: 'verandahRepair',
    steps: [{
      step: 'Prop and repair the verandah',
      hazards: [{ unless: 'pergolaWork', text: 'The verandah roof drops while posts or beams are out.' }, { only: 'pergolaWork', text: 'The pergola roof drops while posts or beams are out.' }, { unless: 'pergolaWork', text: 'A fall from the verandah edge or roof.' }, { only: 'pergolaWork', text: 'A fall from the pergola frame or roof.' }, 'Dust from rotten or treated timber.'],
      controls: [
        { fact: 'temporarySupport' },
        'The roof is propped each side of the section before a post, beam or rafter is cut out, and the props stay until the new members are fixed.',
        'Work on the roof sheeting is done from a platform or with edge protection, not from the gutter or a leaning ladder.',
        'Rotten and treated timber is cut with extraction or a P2 respirator, and offcuts are removed as the work goes.',
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'escalatorParts',
    steps: [{
      step: 'Replace escalator parts',
      hazards: ['The escalator starts while someone is working on it.', 'Crushing or entanglement at the drive, steps or handrail.', 'The public walks into the work area.'],
      controls: [
        'The escalator is stopped, isolated and locked out by the lift contractor, and each worker fits their own lock.',
        'The top and bottom landings are barricaded with signs, and people are directed to another route.',
        'Handrails, steps and parts are replaced to the manufacturer\'s instructions by the lift contractor\'s trained workers, and the escalator is tested before it is handed back.',
      ],
    }],
  },
  {
    when: 'purlinInstall',
    steps: [{
      step: 'Lift and fix the purlins',
      hazards: ['A fall from the top of the frame while placing purlins.', 'A purlin bundle falls or swings while it is lifted.', 'Purlins roll or slide off the rafters before they are fixed.'],
      controls: [
        'Purlins are lifted in bundles by crane or telehandler, landed only where the frame is braced to take them, and unstrapped only once they are restrained.',
        'Purlins are placed and fixed from an EWP or from edge protection at the eaves, never by walking the rafters, and each one is fixed at both ends before the next is placed.',
        'Bracing and fly bracing go in as the purlins are fixed, to the frame supplier\'s sequence.',
      ],
    }],
  },
  {
    when: 'stairLiftInstall',
    steps: [{
      step: 'Install the stair lift',
      hazards: ['A fall on the stairs while carrying rail sections or working.', 'Strain lifting the rail, chair and motor.', 'Electric shock connecting the power supply.'],
      controls: [
        'The rail is fixed to the stair treads, not the wall, to the manufacturer\'s instructions, working from below the work and keeping one hand free on the stairs.',
        'Rail sections, the chair and the motor are carried by two people, and the stairs are kept clear of tools and offcuts.',
        'The power outlet for the charger is installed by a licensed electrician, and the lift is tested and its safety edges checked before handover.',
      ],
    }],
  },
  {
    when: 'artificialTurf',
    steps: [{
      step: 'Lay artificial turf',
      hazards: ['Plant strikes a worker while the base is prepared.', 'Cuts from turf knives.', 'Strain handling turf rolls.', 'Dust from crushed rock and infill sand.'],
      controls: [
        src('Get the current underground services information before excavating the base, and locate services on site.', WHS('s 304')),
        'The base is excavated and compacted with the bobcat and plate compactor, with workers out of the plant\'s reach and two-way acknowledgement before anyone approaches.',
        'Turf rolls are moved with the bobcat or by two people, and cut with sharp knives, cutting away from the body, with cut-resistant gloves.',
        'Seam adhesives are used as their safety data sheets set out, with gloves.',
        'Infill sand and crushed rock are spread damp or in low wind, with a P2 respirator where dust is raised.',
      ],
    }],
    ppe: ['gloveCut', 'p2'],
  },
  {
    when: 'timberStairs',
    steps: [{
      step: 'Replace the timber stairs',
      hazards: ['A fall from the landing or the open edge where the stairs are removed.', 'Strain lifting stringers and treads.', 'Dust from rotten or treated timber.', 'Striking buried services when digging post footings.'],
      controls: [
        'The doorway or landing at the top of the stairs is barricaded while the stairs are out, and no one uses them until the new stairs and handrails are fixed.',
        'Old stairs are taken apart from the top down, with the stringers propped until they are released, and are not pulled down in one piece.',
        'Stringers and treads are carried by two people, and the new stringers are propped until fixed.',
        src('Get the current underground services information before digging post footings, and work to it. Footings are dug and poured to the drawings.', WHS('s 304')),
        'Treated and rotten timber is cut with extraction or outdoors with a P2 respirator.',
        'The stairs, handrails and balustrades are built to the drawings and the building rules for stair dimensions and barrier heights.',
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'windowSill',
    steps: [{
      step: 'Cut out and replace the window sill',
      hazards: ['The window frame or sash drops when the sill is cut out.', 'Lead dust from old paint.', 'Cuts from saws, chisels and glass.'],
      controls: [
        'The sash is removed or the frame is propped before the old sill is cut out.',
        'Old paint is treated as containing lead unless tested, and is not dry sanded or burnt off. Dust is controlled with wet methods or extraction and cleaned with an H class vacuum.',
        'Glass is taped or removed before work near it, and cut-resistant gloves are worn.',
      ],
    }],
    ppe: ['p2', 'gloveCut'],
  },
  {
    when: 'chimneyRemoval',
    steps: [{
      step: 'Take down the chimney',
      hazards: ['A fall from the roof.', 'Bricks or the stack fall onto people below or through the roof.', 'Silica dust from breaking brickwork.', 'Asbestos in an old flue or its lining.'],
      controls: [
        { fact: 'fallControl' },
        'The chimney is taken down by hand from the top, one course at a time, working from a scaffold or platform around it, never by pulling it over.',
        'Bricks and rubble are lowered in buckets or a chute to a closed-off area below, not thrown.',
        'Brickwork is broken out with water to keep dust down, and a fit tested P2 respirator is worn.',
        'Flue pipes, cowls and liners on a building built before 2004 are treated as asbestos unless tested.',
        'The opening in the roof is covered or sheeted over before work stops for the day.',
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'concreteSteps',
    steps: [{
      step: 'Break out the old concrete steps',
      hazards: ['Silica dust and noise from breaking out the old steps with a jackhammer.', 'Strain handling broken concrete.', 'People using the entry fall where the steps are out.'],
      controls: [
        'The entry is closed off and another way in is arranged while the steps are out.',
        src('Old concrete is broken out with a breaker on water suppression, and a fit tested P2 respirator and hearing protection are worn.', WHS('s 529B, s 529C')),
        ...SILICA_FOLLOW_UP.slice(0, 1),
      ],
    }, {
      step: 'Form and pour the new concrete steps',
      hazards: ['Cement burns from the new concrete.', 'People using the entry fall where the steps are out.'],
      controls: [
        'The entry is closed off and another way in is arranged while the steps are out.',
        'Forms are built to the step dimensions in the drawings, and concrete is placed with gloves and boots, with skin contact washed off straight away.',
      ],
    }],
    ppe: ['p2', 'earMuffs', 'gloveChemical'],
  },
  {
    when: 'pipeRepair',
    steps: [{
      step: 'Cut out and replace the pipe section',
      hazards: ['Water released when the pipe is cut.', 'Burns and fire from soldering or brazing.', 'Working in a tight subfloor.'],
      controls: [
        'The water is turned off at the meter or valve, and the pipe drained, before it is cut.',
        'Joints are made with press fittings where possible. Where soldering or brazing is needed, flammable material is cleared or shielded, an extinguisher is at hand, and the area is checked after.',
        'Under the house, the access is checked for room, cables, snakes and spiders before going in, and the space is treated as a confined space only if it meets the definition.',
      ],
    }],
  },
  {
    when: 'saunaInstall',
    steps: [{
      step: 'Install the sauna',
      hazards: ['Strain lifting panels and the heater.', 'Electric shock connecting the heater.', 'Fire from the heater near timber.'],
      controls: [
        'The kit is assembled to the manufacturer\'s instructions, with panels carried by two people and propped until joined.',
        'The heater is installed with the clearances to timber the manufacturer sets, and its guard fitted.',
        'The heater circuit and connection are electrical work for a licensed electrician.',
      ],
    }],
  },
  {
    when: 'treePruning',
    steps: [{
      step: 'Prune the trees',
      hazards: ['A fall from the tree or the EWP.', 'Branches fall onto people below.', 'Chainsaw cuts.', 'Contact with power lines.'],
      controls: [
        'Pruning at height is done by an arborist from an EWP or with a climbing system and rescue plan, under their own procedures.',
        'The area under the tree is closed off, with children and the public kept out until the work is finished and the area cleared.',
        'Chainsaws are used by trained operators wearing chainsaw chaps, gloves, eye, hearing and head protection.',
        'Power lines near the trees are checked first, and work near them is done only under the network operator\'s requirements.',
      ],
    }],
    ppe: ['earMuffs', 'faceShield'],
  },
  {
    when: 'bathReplace',
    steps: [{
      step: 'Remove and replace the bath and shower',
      hazards: ['Strain lifting the old bath, especially a cast iron one.', 'Silica dust from breaking out tiles, the bath hob and screed.', 'Asbestos in old wall sheets or under the tiles.', 'Contact with waste water and bacteria.', 'Cuts from broken tiles, glass screens and the old bath.'],
      controls: [
        'The water is turned off and the bath and shower are drained before the wastes are disconnected, and the drains are plugged so sewer gas cannot enter the room.',
        'In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), wall sheets and any sheeting under the tiles are checked for asbestos before they are broken.',
        'Tiles, the bath hob and screed are broken out with water or on-tool extraction, with a fit tested P2 respirator worn, and the dust is cleaned up with an H class vacuum.',
        'Shower screens are taken down before the tiles around them are broken. The old bath is moved with a trolley or enough people for its weight, or a cast iron bath is broken up under a cover.',
        'The new waterproofing is applied to AS 3740 and the product\'s instructions before the new bath or shower base is set, and the room is ventilated while it cures.',
        'The water and waste connections are plumbing work for a licensed plumber.',
        'In an occupied building, the room is closed off and the work area screened from guests and staff.',
      ],
    }],
    ppe: ['p2', 'gloveCut', 'gloveChemical'],
  },
  {
    when: 'sewerPumpSwap',
    steps: [{
      step: 'Isolate and lift out the failed pump',
      hazards: ['Contact with sewage and bacteria.', 'Sewer gas (hydrogen sulphide) or a lack of oxygen in the well.', 'A fall into the open well.', 'Electric shock or the pump starting while it is handled.', 'The pump falls or swings while it is lifted.'],
      controls: [
        'The pump is isolated and locked out at its control panel by a licensed electrician, and the float switches cannot restart it while it is out.',
        'Inflow is stopped or held, and the well is pumped down before the pump is lifted.',
        'Use a vacuum truck to empty the well where it cannot be pumped down.',
        'The well is not entered. Working from the top, the pump is lifted with a davit or tripod and its lifting chain, up its guide rails, with the opening barricaded and covered when no one is at it.',
        'Use a gas detector to test the air at the top of the well before anyone leans over the opening. If anyone must enter, work stops: the well is a confined space and is entered only under a confined space entry permit.',
        'Gloves, eye protection and overalls are worn, cuts are covered, the old pump is hosed down and bagged, and hands are washed before eating.',
      ],
    }],
    ppe: ['gloveChemical', 'goggles'],
  },
  {
    when: 'hydronicPipes',
    steps: [{
      step: 'Lay and fix the hydronic pipes',
      hazards: ['Trips on reo, pipe and bar chairs.', 'Impalement on starter bars.', 'Knee and back strain tying pipe at ground level.', 'Cuts from pipe cutters.'],
      controls: [
        'Pipe is laid from the coil with a dispenser, on boarded walkways over the mesh, and starter bars are capped.',
        'Pipe is tied or clipped to the mesh at the spacing in the heating design, with tying tools to limit bending, and kneeling tasks are rotated with knee pads worn.',
        'The connections to the heat source and the water supply are made by a licensed plumber.',
      ],
    }, {
      step: 'Pressure test the hydronic pipes',
      hazards: ['Trips on reo, pipe and bar chairs.', 'A pipe or fitting bursts under test pressure.'],
      controls: [
        'The pipe loops are pressure tested to the designer\'s test pressure before the pour, with the test gauge and fittings rated for it, and kept under pressure during the pour so a damaged pipe shows.',
        'Walk on the boarded walkways over the mesh while checking the pipe loops.',
      ],
    }],
    ppe: ['kneePads'],
  },
  {
    when: 'wetLiningStrip',
    steps: [{
      step: 'Strip the water-damaged linings',
      hazards: ['Electric shock from wet wiring and fittings.', 'A wet ceiling or sheet collapses onto a worker.', 'Mould spores and dust.', 'Asbestos in old linings.'],
      controls: [
        'Power to the wet walls and ceiling is isolated and locked out, and the wiring and fittings are checked by a licensed electrician before work starts.',
        'A sagging or wet ceiling is propped or brought down from the side, and no one stands under it.',
        'In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), the linings are checked for asbestos before they are cut or removed.',
        'Wet and mouldy board is cut out past the damage, bagged as it is removed, and the area is cleaned with an H class vacuum. A P2 respirator, gloves and eye protection are worn.',
        'The framing is dried and checked for moisture before new sheets are fixed.',
      ],
    }],
    ppe: ['p2', 'gloveGeneral', 'glassesClear'],
  },
  {
    when: 'solarLights',
    steps: [{
      step: 'Stand and fix the solar light poles',
      hazards: ['A pole falls while it is lifted or stood.', 'Striking buried services when digging footings.', 'Strain handling the light head, panel and battery.', 'Members of the public walk into the work area.'],
      controls: [
        'The work area is fenced off from park users while footings are open and poles go up.',
        'The light head, solar panel and battery are fitted to the pole on the ground where the manufacturer allows, so less work is done at height.',
        'Poles light enough to stand by hand are stood by two people, as the manufacturer allows. Heavier poles are lifted and stood with a crane truck, where one is used, by licensed operators and doggers, with an exclusion zone under the load. Each pole is bolted to its footing before it is let go or the slings are released.',
        'The battery is handled and connected to the manufacturer\'s instructions, with its terminals covered until the final connection.',
      ],
    }],
  },
  {
    when: 'railCorridor',
    steps: [{
      step: 'Work in the rail corridor',
      hazards: ['Struck by a train.', 'Contact with overhead traction wiring.', 'Workers or plant stray onto the track.'],
      controls: [
        'Work inside the rail corridor is done only with the rail manager\'s access authority, under the protection arrangements it sets, such as a protection officer, look-outs or a track closure.',
        'Every worker has the rail corridor induction and competency the rail manager requires, and stays on the side of the fence or line the protection plan sets.',
        'Plant, ladders and long items are kept outside the danger zone of the track and clear of any overhead wiring, as the rail manager directs.',
      ],
    }],
    ppe: ['hivis'],
  },
  {
    when: 'louvreReplace',
    steps: [{
      step: 'Replace the broken louvre blades',
      hazards: ['Cuts from broken glass.', 'Glass falls from the frame.', 'Students or staff walk into the work area.'],
      controls: [
        'The room or the area under the window is closed off until the broken glass is removed and cleaned up.',
        'Broken blades are taped, then lifted out of their clips with cut resistant gloves and eye protection, and put straight into a lidded glass bin.',
        'New blades are carried in their racks and clipped in from inside the room. High windows are reached from a platform ladder.',
        'The floor and sill are vacuumed for glass before the area is reopened.',
      ],
    }],
    ppe: ['gloveCut', 'glassesClear'],
  },
  {
    when: 'membraneStrip',
    steps: [{
      step: 'Strip the old membrane',
      hazards: [{ unless: 'planterMembrane', text: 'A fall from the roof edge.' }, { only: 'planterMembrane', text: 'A fall from the podium edge.' }, 'Strain cutting and lifting the old membrane.', 'Asbestos in old bitumen membranes and flashings.', { unless: 'planterMembrane', text: 'Rain gets into the building once the roof is open.' }, { only: 'planterMembrane', text: 'Water gets into the building below once the membrane is off.' }],
      controls: [
        'Edge protection is in place before stripping starts, and stripping does not go past it.',
        'In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), the old membrane, flashings and sealants are checked against the asbestos register or tested before they are disturbed.',
        'The old membrane is cut into strips small enough to handle, with sharp knives cutting away from the body, and lowered in a chute or a hoist, never thrown.',
        'Only as much is stripped as can be covered again that day, and the stripped area is covered before rain or the end of the shift.',
      ],
    }],
    ppe: ['gloveCut'],
  },
  {
    when: 'valleyRepair',
    steps: [{
      step: 'Replace the valley iron',
      hazards: ['A fall from the roof or into the valley.', 'Tiles slide off the roof onto people below.', 'Cuts from the valley iron.'],
      controls: [
        'The tiles beside the valley are lifted and stacked on the battens across the roof where they cannot slide, and the area below is fenced off.',
        'The old valley iron is lifted out with cut resistant gloves, and the new one is fixed on its valley boards to the roofing standard.',
      ],
    }, {
      step: 'Rebed the tiles',
      hazards: ['A fall from the roof or into the valley.', 'Tiles slide off the roof onto people below.', 'Silica dust from cutting tiles and breaking out old mortar.'],
      controls: [
        'The tiles beside the valley are lifted and stacked on the battens across the roof where they cannot slide, and the area below is fenced off.',
        'Old mortar is broken out by hand, wet, and tiles are cut with a wet saw or a saw with on-tool extraction, with a P2 respirator worn.',
        'The tiles are relaid and the cut tiles are bedded and pointed, with the mortar mixed in a bucket at the eaves or on a level roof board.',
      ],
    }],
    ppe: ['gloveCut', 'p2'],
  },
  {
    when: 'rollerDoorRemove',
    steps: [{
      step: 'Take down the old roller door',
      hazards: ['The door spring releases its stored energy.', 'The curtain or drum falls while it is lowered.', 'A fall from the EWP or ladder at the door head.', 'Electric shock from the door motor.'],
      controls: [
        'Power to the door motor is isolated and locked out before work starts.',
        'The door is wound fully down and the spring tension is let off with the manufacturer\'s method, by a person trained in that door, before the drum is unbolted.',
        'The curtain and drum are taken down from an EWP or scissor lift, or with a forklift and a lifting frame, with the area below closed off. They are never let fall.',
        'The opening is barricaded until the new door is fitted and tested.',
      ],
    }],
    ppe: ['gloveGeneral'],
  },
  {
    when: 'stairwellAccess',
    steps: [{
      step: 'Work over the stair void',
      hazards: ['A fall down the stairs or over the balustrade into the stair void.', 'Paint, tools or a roller pole fall onto people below.', 'Residents walk into the work area.'],
      controls: [
        'High walls and ceilings over the stairs are reached from a stair platform or scaffold made for stairs, set level on the treads with guardrails, never from a ladder standing on the steps or a plank across the balustrade.',
        'Nothing is leaned over the balustrade into the void, and no one stands on the balustrade or handrail.',
        'One flight at a time is closed off, with signs, and residents use the lift or another stair while it is closed.',
        'Paint tins and tools are kept back from the balustrade, and drop sheets are taped so they cannot slip on the steps.',
      ],
    }],
  },
  {
    when: 'hoseReels',
    steps: [{
      step: 'Mount the hose reels and extinguishers',
      hazards: ['Strain lifting hose reels and extinguishers.', 'Drilling into hidden cables or pipes.', 'Silica dust from drilling masonry.', 'A fall from a ladder or platform.'],
      controls: [
        'Hose reels are lifted onto their brackets by two people or with a lifter, and fixed to the wall or column with fixings suited to the load.',
        'Walls are checked for cables and pipes before drilling, and masonry is drilled with on-tool extraction.',
        'Hose reels high on walls are fixed from a platform ladder or mobile scaffold.',
        'The hose reel water supply is connected and tested by a licensed plumber or fire services fitter, and the reels and extinguishers are installed, signed and tagged to AS 2441 and AS 2444.',
      ],
    }],
  },
  {
    when: 'letterboxBank',
    steps: [{
      step: 'Set and fix the letterbox bank',
      hazards: ['The letterbox bank tips or falls while it is moved or stood.', 'Strain lifting it.', 'Cement burns from footing concrete.'],
      controls: [
        'The letterbox bank is moved on a trolley, with a crane truck or by enough people for its weight, and propped or held until it is fixed.',
        'It is fixed to its footing or slab with the fixings the manufacturer specifies, after the slab is scanned for services.',
        'Footing concrete is placed with gloves and boots, with skin contact washed off straight away.',
      ],
    }],
  },
  {
    when: 'gardenBeds',
    steps: [{
      step: 'Build the raised garden beds',
      hazards: ['Cuts and kickback from saws.', 'Dust from cutting treated timber or sleepers.', 'Strain lifting sleepers and steel panels.', 'Cuts from steel panel edges.'],
      controls: [
        'Sleepers and timber are cut with a saw that has its guards in place, outdoors, with eye and hearing protection and a P2 respirator for treated timber.',
        'Sleepers and steel panels are carried by two people, and stacked close to where they are used.',
        'Steel bed panels are handled with cut resistant gloves, and screws and joins are fixed to the supplier\'s instructions.',
      ],
    }],
    ppe: ['gloveCut', 'p2'],
  },
  {
    when: 'streetPits',
    steps: [{
      step: 'Open the pits and haul the cable through the conduits',
      hazards: ['Strain lifting pit lids.', 'A person or the public falls into an open pit.', 'The cable or haul rope snaps or whips under tension.', 'Gases in deep pits.'],
      controls: [
        'Pit lids are lifted with lid lifters, by two people where they are heavy, and open pits are barricaded and covered when no one is at them.',
        'Pits are worked from the surface. A pit is not entered unless it has been assessed as not a confined space.',
        'The conduit is rodded and a draw rope fitted first. The cable is hauled with a winch fitted with a tension limiter or by hand, within the cable\'s pulling tension, and no one stands in line with the rope.',
        'The work in the street follows the network operator\'s requirements for its pits and conduits.',
      ],
    }],
    ppe: ['hivis', 'gloveGeneral'],
  },
  {
    when: 'pontoonPlace',
    steps: [{
      step: 'Place and anchor the pontoon',
      hazards: ['A pontoon unit falls or swings while it is lifted.', 'A worker is crushed between the pontoon and the ramp, piles or a boat.', 'A fall into the water.'],
      controls: [
        'Pontoon units are lifted in with a crane rated for the load under a lift plan, or floated into place and towed by a work boat, with no one between the unit and the structure while it moves.',
        'Units are joined and the gangway is fixed to the manufacturer\'s instructions, from the deck, with life jackets worn.',
        'Piles, pile guides and anchors are installed by the marine contractor to the designer\'s drawings.',
        'The pontoon is not opened to the public until it is complete and handed over.',
      ],
    }],
    ppe: ['lifeJacket'],
  },
  {
    when: 'fireDampers',
    steps: [{
      step: 'Fit the fire dampers',
      hazards: ['A fall from a ladder or platform.', 'Dust from cutting into the ceiling and duct in a hospital.', 'Cuts from duct edges.', 'Hidden services in the ceiling.'],
      controls: [
        'The air handling unit serving the duct is shut down and isolated by the mechanical services contractor before the duct is cut.',
        'Ceiling work follows the hospital\'s infection control permit, with a dust barrier or enclosure and an H class vacuum where it requires them.',
        'Dampers are installed in the fire-rated wall or floor to AS 1682.2 and the manufacturer\'s tested installation method, and the penetration is sealed with the tested system.',
        'Ceiling work is done from a platform ladder or mobile scaffold, with the area below closed off.',
        'Cut duct edges are handled with cut resistant gloves.',
      ],
    }],
    ppe: ['gloveCut', 'p2'],
  },
  {
    when: 'tileRemove',
    steps: [{
      step: 'Break out the cracked tiles',
      hazards: ['Silica dust from cutting grout and breaking tiles.', 'Cuts from tile shards.', { unless: 'oldTiles', text: 'Damage to the membrane under the tiles.' }, { only: 'oldFloorTiles', text: 'Strain and knee injury lifting tiles and bedding.' }],
      controls: [
        { unless: 'oldTiles', text: 'Grout around the cracked tiles is cut with an oscillating tool or grinder with on-tool extraction, and tiles are broken out with a chisel, with eye protection and a fit tested P2 respirator.' },
        { only: 'oldWallTiles', text: 'The old wall tiles are chipped off with a bolster or an oscillating tool, using on-tool extraction to keep dust down, with eye protection and a fit tested P2 respirator.' },
        { only: 'oldFloorTiles', text: 'The old tiles and bedding are lifted with a floor scraper or chisel, using water or on-tool extraction to keep dust down, with eye protection and a fit tested P2 respirator. Wall sheets and screeds under old tiles are checked for asbestos first in a building built before 2004.' },
        ...SILICA_FOLLOW_UP,
        'Shards are collected as the work goes, and cut resistant gloves are worn.',
        { only: 'wetAreaTiles', text: 'The membrane under the tiles is checked, and any damage is repaired or the membrane renewed before new tiles are laid.' },
      ],
    }],
    ppe: ['gloveCut', 'p2', 'glassesClear'],
  },
  {
    when: 'wallRemoval',
    steps: [{
      step: 'Remove the wall',
      hazards: ['The ceiling or roof drops if the wall is load-bearing.', 'Electric shock from cables in the wall.', 'Asbestos in old wall sheets.', 'Dust from removing linings and cutting studs.', 'Strain and cuts handling studs and sheets.'],
      controls: [
        'Before any work, a builder or engineer checks whether the wall carries the ceiling, roof or floor above. If it does, work stops: the temporary support and new beam are designed by an engineer and covered by their own SWMS.',
        'Power, water and gas in the wall are isolated, and the cables and pipes are removed or made safe by licensed trades before the wall is opened.',
        'In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), wall and ceiling linings are checked for asbestos before they are disturbed.',
        'Linings are removed first, then studs are cut and taken out from one end, and the top plate is released from the ceiling last.',
        'Dust is kept down with extraction and an H class vacuum, P2 respirators are worn, and the rest of the house is closed off with plastic sheeting.',
      ],
    }],
    ppe: ['p2', 'gloveGeneral', 'glassesClear'],
  },
  {
    when: 'noiseWall',
    steps: [{
      step: 'Stand the noise wall posts and panels',
      hazards: ['Struck by passing traffic.', 'A post or panel falls or swings while it is lifted.', 'Striking buried services when boring post holes.', 'A worker falls into an open post hole.'],
      controls: [
        'All work is inside the closure set out in the traffic management plan, with traffic controllers where the plan requires them.',
        'Underground services are located before post holes are bored, and open holes are covered or fenced.',
        'Posts and panels are lifted with a crane by licensed operators and doggers under a lift plan, with an exclusion zone under the load, and panels are slid into the posts from the ground or an EWP, never by a worker standing under them.',
        'Posts are braced until their footings have cured, as the designer specifies.',
      ],
    }],
    ppe: ['hivis'],
  },
  {
    when: 'dumbwaiter',
    steps: [{
      step: 'Install the dumbwaiter',
      hazards: ['Being crushed by the car or counterweight.', 'A fall into an open shaft.', 'Strain lifting the rails, car and machine.', 'Electric shock from the supply.'],
      controls: [
        'Shaft openings are barricaded at every level except while the door at that level is being fitted.',
        'Rails, the car and the machine are lifted with a chain block or lifting aid rated for the load, with no one under the load.',
        'The car is secured against movement whenever anyone works in the shaft or under it, and the machine is isolated and locked out.',
        'The supply is connected by a licensed electrician, and the dumbwaiter is not used until it has been commissioned to the manufacturer\'s instructions.',
      ],
    }],
  },
  {
    when: 'frameRepair',
    steps: [{
      step: 'Prop and replace the damaged wall framing',
      hazards: ['The wall, ceiling or roof drops while studs or plates are cut out.', 'Termites or chemicals from a termite treatment.', 'Asbestos in old linings.', 'Dust from rotten timber.'],
      controls: [
        'The termites are treated by a licensed pest manager before the frame is opened, and their treatment instructions are followed.',
        'In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), linings are checked for asbestos before they are removed.',
        'The ceiling or roof load is propped each side of the damaged section before any stud, plate or lintel is cut out, and the props stay until the new members are fixed.',
        'Damaged timber is cut out back to sound wood, with P2 respirators worn and the dust cleaned up with an H class vacuum.',
        'Replacement members match the original size and grade, or the engineer\'s or builder\'s detail.',
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'smokeAlarms',
    steps: [{
      step: 'Install the smoke alarms',
      hazards: ['A fall from the ladder.', 'Electric shock connecting hardwired alarms.', 'Dust from drilling the ceiling.'],
      controls: [
        'Alarms are fixed from a platform ladder, not from a chair or the top of a stepladder.',
        'Hardwired alarms are connected by a licensed electrician, with the circuit isolated and tested de-energised first.',
        'In a house built before 2004 (asbestos products were used until the national ban at the end of 2003), the ceiling is checked for asbestos before it is drilled, and the roof space for loose-fill insulation.',
        'Alarms are placed and interconnected as the state\'s smoke alarm rules and AS 3786 require, and tested before handover.',
      ],
    }],
  },
  {
    when: 'crackStitch',
    steps: [{
      step: 'Cut slots and fit the helical ties',
      hazards: ['Silica dust from cutting mortar joints.', 'Noise and vibration from the chaser.', 'Bricks above the crack move or fall.'],
      controls: [
        'Mortar joints are cut with a chaser or grinder with on-tool extraction, with a fit tested P2 respirator, eye and hearing protection worn.',
        'Loose bricks above the crack are propped or removed before cutting, and the area below is closed off.',
        'Helical bars and grout are fitted to the supplier\'s instructions, with gloves and eye protection when mixing the grout.',
      ],
    }],
    ppe: ['p2', 'earMuffs', 'glassesClear'],
  },
  {
    when: 'septicRemove',
    // A liquid waste tanker pumps the tank out before the excavator crew takes it out or fills it.
    steps: [{
      step: 'Pump out the septic tank',
      hazards: ['Contact with sewage and bacteria.', 'Sewer gas in the tank.'],
      controls: [
        'The tank is pumped out by a licensed liquid waste contractor before any work on it.',
        'No one enters the tank. It is a confined space.',
        'Gloves, eye protection and overalls are worn, cuts are covered, and hands are washed before eating.',
      ],
    }, {
      step: 'Remove the old septic tank',
      hazards: ['Contact with sewage and bacteria.', 'Sewer gas in the tank.', 'A fall into the open tank.', 'The tank walls or lid collapse while it is dug out.'],
      controls: [
        'No one enters the tank. It is a confined space.',
        'Once uncovered, the open tank is barricaded and covered when no one is at it, and the old tank is broken up with water on the concrete to keep dust down and lifted out by excavator, or filled as the local council approves.',
        'Gloves, eye protection and overalls are worn, cuts are covered, and hands are washed before eating.',
      ],
    }],
    ppe: ['gloveChemical', 'goggles'],
  },
  {
    when: 'flashingReplace',
    steps: [{
      step: 'Replace the flashing',
      hazards: ['A fall from the roof.', 'Cuts from sheet metal.', 'Silica dust from cutting into mortar or masonry for the flashing.', 'Lead from old lead flashings.'],
      controls: [
        'The old flashing is cut out and removed with cut resistant gloves, and kept from blowing off the roof.',
        'Old lead flashing is handled with gloves and hands are washed before eating. It is not burnt or ground.',
        'Raking out mortar joints for the flashing is done with on-tool extraction and a P2 respirator.',
        'The new flashing is fixed and sealed to the roofing manufacturer\'s details, and the roof is checked for leaks before the work is finished.',
      ],
    }],
    ppe: ['gloveCut', 'p2'],
  },
  {
    when: 'benchtopReplace',
    steps: [{
      step: 'Remove and fit the benchtops',
      hazards: ['Strain lifting benchtops.', 'Water or gas leaks when the sink and cooktop are disconnected.', 'Dust from cutting laminate.', 'Cuts from saws and the old top.'],
      controls: [
        'The sink and cooktop are disconnected by a licensed plumber, gas fitter or electrician before the old top is removed, and reconnected by them after.',
        'Benchtops are carried by two people or more for their weight, and lifted onto the cabinets, not slid over the edge.',
        'Laminate is cut with a circular saw or jigsaw that has its guard and dust extraction in place, outdoors or with a P2 respirator.',
        'Adhesives and sealants are used as their safety data sheets set out, with ventilation and gloves.',
      ],
    }],
    ppe: ['gloveGeneral', 'p2'],
  },
  {
    when: 'crossover',
    steps: [{
      step: 'Build the vehicle crossover',
      hazards: ['Pedestrians walk into the work area on the footpath.', 'Struck by traffic at the kerb.', 'Striking services in the footpath.'],
      controls: [
        'The crossover is built to the local council\'s permit and standard drawing, with its inspections.',
        'The footpath is barricaded with a signed way past for pedestrians, including people using wheelchairs and prams, and work at the kerb follows the council\'s traffic requirements.',
        'Services in the footpath are located before digging, and service pits and covers are kept clear.',
      ],
    }],
    ppe: ['hivis', 'p2'],
  },
  {
    when: 'bikeRacks',
    steps: [{
      step: 'Fix the bike racks',
      hazards: ['Members of the public walk into the work area.', 'Silica dust from drilling concrete.', 'Striking services in the slab.', 'Strain lifting racks.'],
      controls: [
        'The work area is barricaded from the public, with a signed way past.',
        'The slab is scanned for services before drilling, and concrete is drilled with on-tool extraction and a P2 respirator.',
        'Racks are carried by two people and fixed with the anchors the supplier specifies, or set in footings dug after services are located.',
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'crackSeal',
    steps: [{
      step: 'Rout and seal the cracks',
      hazards: ['Silica dust from routing or grinding the cracks.', 'Struck by vehicles in the car park.', 'Breathing sealant vapour.'],
      controls: [
        'The bays being worked on are closed to vehicles with barriers, cones and signs.',
        'Cracks are routed or ground with on-tool extraction, with a fit tested P2 respirator and hearing protection worn.',
        'Primers and sealants are used as their safety data sheets set out, with gloves, eye protection and ventilation, and away from ignition sources.',
      ],
    }],
    ppe: ['p2', 'earMuffs', 'hivis'],
  },
  {
    when: 'ceilingTileReplace',
    steps: [{
      step: 'Replace the ceiling tiles',
      hazards: ['A fall from the platform ladder or mobile scaffold.', 'Asbestos in old ceiling tiles.', 'Dust and fibres from old tiles.', 'Electric shock from cables and fittings in the ceiling space.'],
      controls: [
        'Tiles are changed from a platform ladder or mobile scaffold suited to the height, never from the top of a stepladder, a desk or the grid.',
        'In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), the old tiles are checked against the asbestos register or tested before they are disturbed.',
        'Old tiles are lifted out whole, bagged and taken away, and the area is cleaned with an H class vacuum. A P2 respirator is worn.',
        'Cables and light fittings in the ceiling space are treated as live and are not moved by the ceiling crew.',
        'New tiles are cut on a bench with a knife, and the room is closed to students and staff while the work is done.',
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'stoneWall',
    steps: [{
      step: 'Build the stone wall',
      hazards: ['A stone falls or swings while it is lifted.', 'Hands and feet crushed placing stones.', 'Silica dust from splitting or cutting stone.', 'The wall collapses while it is built.'],
      controls: [
        'Large stones are lifted with the crane truck or excavator using slings or a stone grab rated for the load, by licensed operators and doggers where the work needs them, with no one under or beside the load.',
        'Stones are guided into place with tag lines or bars, never by hand under the load, and steel capped boots and gloves are worn.',
        'Stone is split or cut wet or with on-tool extraction, with a fit tested P2 respirator and eye protection.',
        'The wall is built in courses to the design, with its base on firm ground, and is not built higher than the design allows without engineering.',
      ],
    }],
    ppe: ['p2', 'gloveGeneral', 'glassesClear'],
  },
  {
    when: 'gasRegulator',
    steps: [{
      step: 'Replace the gas regulator',
      hazards: ['Gas escapes and catches fire or explodes.', 'Appliances lose their pilot flames when the gas is turned off.', 'Strain working at the meter.'],
      controls: [
        'Where the regulator is part of the meter set owned by the gas distributor, only the distributor or its authorised contractor replaces it.',
        'The gas is turned off at the meter and the kitchen is told before work starts. No ignition sources are near the work, and a gas detector is used.',
        'The new regulator is set to the appliance supply pressure, the joints are leak tested, and every appliance is relit and checked before the work is finished.',
        'Gas work is done only by a person holding a gas work licence or authorisation for that work.',
      ],
    }],
  },
  {
    when: 'exhaustDuctClean',
    steps: [{
      step: 'Clean the kitchen exhaust duct',
      hazards: ['Burns and eye injury from caustic degreasers.', 'A fall from the roof or ladder at the fan and duct access panels.', 'The exhaust fan starts while it is being cleaned.', 'Cuts from duct edges.', 'Slips on grease.'],
      controls: [
        'The cooking equipment is off and cool, and the exhaust fan is isolated and locked out before cleaning starts.',
        'Degreasers are used as their safety data sheets set out, with chemical gloves, goggles and a face shield, and the kitchen is protected with plastic sheeting.',
        'Duct access panels are opened from a platform ladder or mobile scaffold, and the roof fan is reached only with the roof edge protection or fall control set out for the roof.',
        'Grease and wastewater are collected and disposed of as trade waste, not into the stormwater.',
        'Access panels are refitted and sealed, and the fan is tested, before the kitchen is handed back.',
      ],
    }],
    ppe: ['gloveChemical', 'goggles', 'faceShield'],
  },
  {
    when: 'tankStand',
    // Building the stand (carpentry or steel) and craning the tank on are separate activities.
    // The lift comes when the task names the tank going on the stand.
    steps: [{
      step: 'Build the tank stand',
      hazards: ['The stand fails under the weight of the full tank.', 'A fall from the top of the stand.'],
      controls: [
        'The stand and its footings are built to an engineer\'s or the supplier\'s design for the full weight of the tank, and checked before the tank goes on.',
        'Work on top of the stand is done from a platform ladder or scaffold, or with edge protection, not by climbing the stand.',
      ],
    }, {
      step: 'Lift the tank onto the stand',
      only: 'tankLiftOn',
      hazards: ['The tank falls or swings while it is lifted.', 'A fall from the top of the stand.'],
      controls: [
        'The tank is lifted on empty with a crane truck by licensed operators and doggers, with an exclusion zone under the load.',
        'Work on top of the stand is done from a platform ladder or scaffold, or with edge protection, not by climbing the stand.',
        'The tank is filled only once it is fixed and the stand is complete.',
      ],
    }],
  },
  {
    when: 'stairInstall',
    steps: [{
      step: 'Build and fix the staircase',
      hazards: ['A fall through the stair opening in the floor.', 'Strain lifting stringers and the stair.', 'The stair falls before it is fixed.', 'Cuts from saws and nail guns.'],
      controls: [
        'The stair opening is covered or has a guardrail at all times until the stair and its balustrade are fixed.',
        'Stringers or the stair are carried by two people or more, and propped until fixed top and bottom.',
        'No one uses the stair until the handrails and balustrade are fixed.',
        'The stair, handrails and balustrade are built to the drawings and the building rules for stair dimensions and barrier heights.',
      ],
    }],
  },
  {
    when: 'portableBuilding',
    steps: [{
      step: 'Lift the portable building onto its footings',
      hazards: ['The building falls or swings while it is lifted.', 'A truck or crane strikes a person on the school site.', 'A fall from the building roof or deck.', 'Striking buried services when setting footings.'],
      controls: [
        'The delivery and lift happen when students are kept away, along a route and in a zone fenced off with the school.',
        'The building is lifted with a crane under a lift plan by licensed operators and doggers, with no one under the load, and landed onto footings set out and levelled first.',
        'Footings or stumps are set only after underground services are located.',
        'Work on the roof or at the deck edges uses edge protection, a scaffold or an EWP.',
        'Power, water and sewer connections are made by licensed electricians and plumbers.',
      ],
    }],
  },
  {
    when: 'stoneCladding',
    steps: [{
      step: 'Fix the stone cladding',
      hazards: ['Silica dust from cutting stone.', 'A stone panel falls while it is lifted or before the adhesive sets.', 'Strain lifting stone.', 'A fall from the scaffold or platform.'],
      controls: [
        'Natural stone is not engineered stone. Any cutting is done wet or with on-tool extraction, away from guests, with a fit tested P2 respirator.',
        'Panels are lifted with a vacuum lifter or two people, and held with props or the mechanical fixings the designer specifies until the adhesive sets.',
        'High panels are fixed from a mobile scaffold or platform, with the lobby area below closed off.',
        'Adhesives are used as their safety data sheets set out, with gloves and ventilation.',
      ],
    }],
    ppe: ['p2'],
  },
  {
    when: 'awningReplace',
    steps: [{
      step: 'Take down and replace the awning',
      hazards: ['The awning falls while it is unbolted or lifted.', 'Pedestrians walk under the work.', 'A fall from the EWP or scaffold.', 'Fixings into an old facade fail.'],
      controls: [
        'The footpath under the work is closed with a signed way past, under the council\'s permit where it requires one.',
        'The old awning is supported by the crane, forklift or props before its fixings or tie rods are released, and lowered, never let fall.',
        'Fixings for the new awning go into the structure the engineer specifies, not just the facade lining.',
        'Work at height is done from an EWP or scaffold.',
      ],
    }],
  },
  {
    when: 'polySheets',
    steps: [{
      step: 'Replace the pergola roof sheets',
      hazards: ['A fall through the polycarbonate sheets.', 'A fall from the ladder or platform.', 'Cuts from broken sheets.'],
      controls: [
        'No one stands or walks on the polycarbonate sheets. Sheets are changed from a platform ladder or mobile scaffold beside or under the pergola.',
        'Broken sheets are unscrewed and lifted out whole where they can be, with cut resistant gloves.',
        'New sheets are fixed with the supplier\'s screws and washers, allowing for expansion.',
      ],
    }],
    ppe: ['gloveCut'],
  },
  {
    when: 'slabLift',
    steps: [{
      step: 'Drill and inject under the slab',
      hazards: ['Silica dust from drilling the slab.', 'Burns and sensitisation from polyurethane resin.', 'The slab lifts unevenly and cracks or damages walls.', 'Striking services under the slab.'],
      controls: [
        'The slab is scanned for services and reinforcement, and drilled with on-tool extraction and a P2 respirator.',
        'Resin is mixed and injected as its safety data sheets set out, with chemical gloves and eye protection, and the injection equipment is depressurised before any hose is undone.',
        'The lift is monitored with a level or laser at each point as it is injected, and stopped at the target level.',
      ],
    }],
    ppe: ['p2', 'gloveChemical', 'goggles'],
  },
  {
    when: 'gravelLay',
    steps: [{
      step: 'Spread and compact the gravel',
      hazards: ['A tipper, loader or roller strikes a person.', 'A roller or loader rolls over on a batter or soft edge.', 'Dust from gravel and road base.', 'Noise and vibration from the roller.'],
      controls: [
        'Tippers reverse only with a spotter, and tip on firm, level ground clear of overhead power lines.',
        'Gravel is spread with a skid steer, loader or grader and compacted with a roller or plate compactor, by competent operators, with workers kept out of the plant\'s reach.',
        'Rollers keep back from soft edges, table drains and batters, and the operator wears the seatbelt.',
        'Use a water cart or hose to damp down dust, and wear hearing protection near the roller.',
      ],
    }],
    ppe: ['earMuffs'],
  },
  {
    when: 'solarClean',
    steps: [{
      step: 'Clean the solar panels',
      hazards: ['A fall from the roof edge or through a skylight or fragile sheet.', 'Slips on wet panels and roof sheets.', 'Electric shock from damaged panels or cables.', 'Water and run-off reaching electrical equipment.'],
      controls: [
        'Panels are cleaned from the roof only with the edge protection or fall control set out for the roof, and skylights and fragile sheets are covered or fenced off first.',
        'No one stands or kneels on the panels. Panels are cleaned with a soft brush on a pole and low pressure water, never a high pressure jet.',
        'Damaged panels, cables or connectors are not touched, and are reported to the owner for a licensed electrician to check.',
        'Wet roof sheets are walked on only along the fixing lines, in soft-soled shoes.',
      ],
    }],
  },
  {
    when: 'gateRepair',
    steps: [{
      step: 'Repair the gate',
      hazards: ['The gate falls while it is lifted off its hinges.', 'Strain lifting the gate.', 'Children or the public walk into the work area.'],
      controls: [
        'The gate is propped or held by two people before hinges or fixings are undone, and is never left standing loose.',
        'The area around the gate is closed off, with another way in and out arranged with the site.',
        'Hinges, latches and posts are replaced or reset to the gate maker\'s details, and a pool or child safety gate is tested to close and latch on its own before it is left.',
      ],
    }],
  },
  {
    when: 'dockLeveller',
    steps: [{
      step: 'Install the dock leveller',
      hazards: ['The leveller deck drops and crushes a person.', 'A fall from the open dock edge.', 'Struck by forklifts or trucks at the dock.', 'Hydraulic oil injection or a hose burst.'],
      controls: [
        'The dock is closed to trucks and forklifts, and the open dock edge is barricaded until the leveller is fixed.',
        'The leveller is lifted into the pit with a forklift or crane rated for its weight, and the deck is propped with its maintenance strut whenever anyone works under it.',
        'Hydraulics are depressurised before any hose or fitting is undone, and never checked for leaks by hand.',
        'Power is connected by a licensed electrician, and the leveller is tested to the manufacturer\'s instructions before the dock reopens.',
      ],
    }],
  },
  {
    when: 'filmApply',
    steps: [{
      step: 'Apply the window film',
      hazards: ['Cuts from blades.', 'A fall from a ladder at high windows.', 'Slips on water from the application solution.'],
      controls: [
        'Film is trimmed with a snap-off blade cutting away from the body, and used blades go into a blade container.',
        'High glass is reached from a platform ladder or mobile scaffold.',
        'Water is kept off the floor with towels and drop sheets, and the area is signed while it is wet.',
      ],
    }],
  },
  {
    when: 'poolRemoval',
    steps: [{
      step: 'Break out the pool',
      hazards: ['A person falls into the pool.', 'Plant tips into the pool or the sides collapse.', 'Silica dust from breaking concrete.', 'Striking buried pool pipework and power.'],
      controls: [
        'The pool is drained as the council approves, and the pool area stays fenced until it is filled.',
        'The pool\'s power and plumbing are disconnected and made safe by licensed trades before work starts.',
        'The floor is broken for drainage and the walls broken down with an excavator working from outside the pool, with no one in the pool while the plant works.',
        'Concrete is broken with water to keep dust down.',
      ],
    }, {
      step: 'Fill the pool void',
      hazards: ['A person falls into the pool.', 'Plant tips into the pool or the sides collapse.'],
      controls: [
        'The pool is drained as the council approves, and the pool area stays fenced until it is filled.',
        'Fill is placed and compacted in layers to the engineer\'s or council\'s requirements.',
        'Plant stays back from the pool edge while fill is tipped and spread, with a spotter where it works near the edge.',
      ],
    }],
  },
  {
    when: 'groundSolar',
    steps: [{
      step: 'Install the ground mount frame',
      hazards: ['Striking buried services when driving or digging the frame posts.'],
      controls: [
        'Underground services are located before frame posts are driven, screwed or dug.',
      ],
    }, {
      step: 'Install the solar panels',
      hazards: ['Strain lifting panels.', 'Panels catch the wind.', 'Electric shock from panels in daylight.'],
      controls: [
        'Panels are carried by two people and clamped as soon as each is placed, and are not handled in strong wind.',
        'Panels make DC voltage in daylight: connectors stay apart until the final connection, which is done by a licensed electrician.',
      ],
    }],
  },
  {
    when: 'heaterRemoval',
    steps: [{
      step: 'Remove the old heater and cap the flue',
      hazards: ['Oil, fuel or gas spills or leaks.', 'A fall from the roof while capping the flue.', 'Strain lifting the heater.', 'Asbestos in an old flue or heater lining.'],
      controls: [
        'The fuel or gas supply is isolated and capped by a licensed gas fitter or plumber, and any oil is drained into containers and disposed of as the supplier or council directs.',
        'In a building built before 2004 (asbestos products were used until the national ban at the end of 2003), the flue, its lining and the heater are checked for asbestos before they are disturbed.',
        'The heater is moved with a trolley or by two people.',
        'The flue is capped or the cowl removed from the roof with the fall control set out for the roof, and the roof penetration is sealed watertight.',
      ],
    }],
  },
  {
    when: 'liftMotor',
    steps: [{
      step: 'Replace the lift motor in the machine room',
      hazards: ['The car or counterweight moves while the motor or brake is off.', 'The motor falls or swings while it is lifted.', 'Electric shock from the lift supply and controller.', 'Passengers use the lift while it is out of service.'],
      controls: [
        'The lift is taken out of service, signed at every landing, and the car is parked and secured, with the counterweight landed or blocked as the lift maker\'s procedure requires, before the brake or motor is released.',
        'The main switch is isolated and locked out with personal locks, and the controller is tested de-energised before work starts.',
        'The motor is lifted with the machine room lifting beam and a chain block rated for the load, with no one under it.',
        'The work is done by licensed lift technicians, and the lift is tested before it is returned to service.',
      ],
    }],
  },
  {
    when: 'boilerInstall',
    steps: [{
      step: 'Move and set the boiler',
      hazards: ['The boiler falls or tips while it is moved.', 'Strain lifting the boiler and pipework.'],
      controls: [
        'The boiler is moved on skates or a pallet jack, or lifted with a crane or forklift rated for its weight, along a route checked for floor loads and door sizes.',
        'The boiler is set level on its base and fixed down before it is connected.',
      ],
    }, {
      step: 'Connect the boiler',
      hazards: ['Strain lifting the boiler and pipework.', 'Gas leaks and fire from the fuel connection.', 'Carbon monoxide from a badly installed flue.'],
      controls: [
        'Pipework is connected and pressure tested before the boiler is fired.',
        'The gas connection is made and leak tested by a licensed gas fitter, and the flue is installed to the manufacturer\'s instructions and AS/NZS 5601.1.',
      ],
    }],
  },
  {
    when: 'eaveLining',
    steps: [{
      step: 'Fit the new eave lining',
      hazards: ['A fall from the ladder, trestle or scaffold.', 'Strain holding sheets overhead.', 'Dust from cutting fibre cement sheet.'],
      controls: [
        'Eaves are reached from a mobile scaffold, trestles with a platform, or a platform ladder, not from a ladder leaned on the gutter.',
        'New sheets are held up with props or a sheet lifter while they are fixed, not by hand.',
        'New fibre cement sheet is scored and snapped or cut with a shear, or a saw with on-tool extraction, never dry cut without extraction.',
      ],
    }],
  },
  {
    when: 'poolLight',
    steps: [{
      step: 'Fit and connect the pool light',
      hazards: ['Electric shock in or near the water.', 'A fall into the pool.', 'Water enters the light niche or cable.'],
      controls: [
        'The pool light circuit is isolated and locked out at the switchboard and tested de-energised before the light or its cable is touched.',
        'The light is fitted to the manufacturer\'s instructions, either with the pool lowered below the niche or by lifting the fitting to the deck on its cable, never worked on in the water while energised.',
        'Pool lights are extra-low voltage or as the wiring rules allow for pool zones, supplied through a safety transformer outside the pool zone, with RCD protection and equipotential bonding as the wiring rules require.',
        'The connection is electrical work for a licensed electrician, and the light is tested before the pool is used.',
      ],
    }],
  },
  {
    when: 'roofLeak',
    steps: [{
      step: 'Find and repair the roof leak',
      hazards: ['A fall from the roof or through a fragile area.', 'Damaged sheets, tiles or flashings give way underfoot.', 'Cuts from sheet metal.'],
      controls: [
        'The leak is traced from inside the roof space or ceiling first where it can be, so less time is spent on the roof.',
        'Only the sheets, tiles or flashings around the leak are lifted, and they are refixed or replaced before the roof is left.',
        'Laps, screws and flashings are resealed with products suited to the roofing, and the repair is water tested before the work is finished.',
      ],
    }],
  },
  {
    when: 'pileJacket',
    steps: [{
      step: 'Fit and grout the pile jacket',
      hazards: ['A fall into the water from the deck, ladder or punt.', 'Drowning.', 'Crushing between the punt and the pile.', 'Skin burns from grout.'],
      controls: [
        'The jacket is fitted from a moored punt or a platform at low tide, with life jackets worn. Any work under water is done only by commercial divers under their own dive plan.',
        'Jacket halves are lifted with a davit or plant rated for them, and no one is between the punt and the pile while the punt moves.',
        'Grout is mixed and pumped as its safety data sheet sets out, with gloves and eye protection.',
      ],
    }],
    ppe: ['lifeJacket'],
  },
  {
    when: 'ceilingHatch',
    steps: [{
      step: 'Cut the opening and fit the access hatch',
      hazards: ['A fall from the ladder or platform.', 'Cutting into hidden cables or pipes in the ceiling.', 'Dust from cutting plasterboard.', 'Asbestos in an old ceiling.'],
      controls: [
        'The ceiling space above is checked for cables, pipes and ducts before the opening is marked and cut.',
        'In a building built before 2004, the ceiling is checked for asbestos before it is cut.',
        'The opening is cut between the joists with a plasterboard saw or knife and trimmed with framing, and the hatch is fixed to the manufacturer\'s instructions.',
        'Work is done from a platform ladder or mobile scaffold, not from a stepladder top.',
      ],
    }],
  },
  {
    when: 'greyWater',
    steps: [{
      step: 'Install the grey water system',
      hazards: ['Contact with grey water and bacteria.', 'Strain lifting the tank and treatment unit.', 'Striking buried services when digging.'],
      controls: [
        'The system is an approved type, installed to the council\'s approval and the plumbing rules, with the plumbing connections by a licensed plumber.',
        'Gloves are worn when connecting to existing wastes, cuts are covered, and hands are washed before eating.',
        'The tank and unit are moved with a trolley or plant, and services are located before digging for the tank and irrigation lines.',
      ],
    }],
    ppe: ['gloveChemical'],
  },
  {
    when: 'fanCoil',
    steps: [{
      // Replacing a unit: the old one is lowered out before the new one is lifted in.
      only: 'fanCoilReplace',
      step: 'Remove the old fan coil unit',
      hazards: ['The unit falls while it is lowered or lifted.', 'Strain holding the unit overhead.', 'Condensate and water spill onto ceilings and power.', 'Electric shock from the unit supply.'],
      controls: [
        'The unit is isolated electrically and its chilled or heating water valves closed and drained before it is disconnected.',
        'The unit is lowered and lifted with a material lifter rated for its weight, never held overhead by hand.',
        'The area below is closed off, and condensate trays and pipes are drained into buckets.',
      ],
    }, {
      step: 'Lift the fan coil unit into place and fix it',
      hazards: ['The unit falls while it is lifted or before it is fixed.', 'Strain holding the unit overhead.', 'Electric shock when the unit is connected to its supply.'],
      controls: [
        'The unit is lifted with a material lifter rated for its weight, never held overhead by hand, and is fixed to its hangers or supports before the lifter is lowered.',
        'The area below is closed off while the unit is lifted and fixed.',
        'The unit is connected to its supply only by a licensed electrician, with the circuit isolated and locked out.',
      ],
    }],
  },
  {
    when: 'towerCraneErect',
    steps: [{
      step: 'Erect or dismantle the tower crane',
      hazards: ['A crane section, jib or counterweight falls or swings while it is lifted.', 'A fall from the mast, jib or counterweight jib.', 'The crane is erected out of sequence or on an unchecked base and collapses.', 'Loads pass over the street and the public.'],
      controls: [
        { unless: 'craneDismantle', text: 'The crane is erected by the crane supplier\'s erection crew to the manufacturer\'s erection procedure and a written lift plan, with the base or footing certified by an engineer before erection.' },
        { only: 'craneDismantle', text: 'The crane is dismantled by the crane supplier\'s erection crew to the manufacturer\'s dismantling procedure and a written lift plan, with the assist crane set up on ground or mats checked for its loads.' },
        'Sections are lifted by the assist crane under its lift plan, slung by licensed riggers holding the class of rigging licence the work needs, and no one stands under a load.',
        'Erectors climb and work on the mast and jibs only with fall arrest anchored to the crane at all times, and a rescue plan for a worker suspended at height.',
        'Work stops in winds above the manufacturer\'s erection limit.',
        'The street is closed under the council\'s and road authority\'s permits while loads pass over it.',
        { unless: 'craneDismantle', text: 'The crane is a registered item of plant and is commissioned and inspected by a competent person before it is used.' },
      ],
    }],
    ppe: ['harness', 'chinStrap'],
  },
  {
    when: 'bmuInstall',
    steps: [{
      step: 'Install the building maintenance unit',
      hazards: ['A fall from the roof edge while the track and davits are fixed.', 'BMU parts fall or swing while they are craned onto the roof.', 'The BMU is fixed to a structure that cannot hold it.', 'People below are struck by tools or parts.'],
      controls: [
        'Roof edge protection is in place before work starts near the edge, and no one works outside it without travel restraint to the roof anchors.',
        'BMU parts are lifted onto the roof by crane under a lift plan, slung by licensed doggers or riggers, and landed where the roof is designed to take them.',
        'The track, davits and fixings are installed to the BMU designer\'s drawings and the engineer\'s certified fixings, and anchors are proof tested where the design requires.',
        'The BMU is a registered design, and is commissioned, load tested and certified before anyone uses it.',
        'The area below the roof edge is closed off while parts are lifted or work is done near the edge.',
      ],
    }],
    ppe: ['harness'],
  },
  {
    when: 'cleanRoom',
    steps: [{
      step: 'Install clean room walls and ceilings',
      only: 'cleanRoomPanels',
      hazards: ['Strain lifting insulated wall and ceiling panels.', 'A fall from a platform or from walk-on ceiling panels.', 'Cuts from panel edges.'],
      controls: [
        'Wall and ceiling panels are moved with panel trolleys and lifted with panel lifters or two people, and wall panels are propped until joined.',
        'Ceiling panels are fixed from a mobile scaffold or platform. Walk-on ceilings are walked on only once they are complete and rated for it.',
        'Panel edges are handled with cut resistant gloves.',
        'Work next to the operating pharmacy follows the hospital\'s infection control permit, with dust barriers and an H class vacuum.',
      ],
    }, {
      step: 'Install clean room flooring',
      only: 'cleanRoomFloor',
      hazards: ['Fumes from floor adhesives and sealants.'],
      controls: [
        'Floor adhesives, coved vinyl and sealants are used as their safety data sheets set out, with ventilation, and the room is not used until they have cured.',
        'Work next to the operating pharmacy follows the hospital\'s infection control permit, with dust barriers and an H class vacuum.',
      ],
    }],
    ppe: ['gloveCut'],
  },
  {
    when: 'bridgeBearings',
    steps: [{
      step: 'Jack the deck and replace the bearings',
      hazards: ['The deck drops or shifts while it is on the jacks.', 'Hands crushed between the deck, bearing and pier.', 'Hydraulic hose failure or oil injection.', 'A fall from the pier head or platform.'],
      controls: [
        'Jacking is done to the bridge engineer\'s jacking procedure, with the jack positions, loads and lift heights set out, and the deck is packed on load-rated packers as it rises so it is never held only by the jacks.',
        'Jacks, pumps and hoses are rated for the loads, inspected before use, and the system is depressurised before any fitting is undone.',
        'No hands go between the deck and the bearing while the deck is on the jacks. Bearings are moved with lifting aids or bars.',
        'Work at the pier head is done from an EWP, scaffold or under-bridge platform with guardrails, with traffic or rail below managed under its permit.',
        { only: 'expansionJoints', text: 'Old expansion joints are cut and broken out inside the lane closure, with saw cutting and breaking done wet or with on-tool extraction, and new joints are lifted in by crane or with lifting aids and fixed to the supplier\'s details.' },
      ],
    }],
  },
  {
    when: 'greenWall',
    steps: [{
      step: 'Install the green wall',
      hazards: ['A fall from the EWP, scaffold or swing stage.', 'Panels, planters or tools fall onto people below.', 'Strain lifting wet planter modules.', 'Skin contact with soil, fertiliser and Legionella in potting mix.'],
      controls: [
        'The support frame is fixed to the structure to the engineer\'s design for the wet weight of the planted wall.',
        'Modules are lifted with a hoist or crane, not carried up ladders, and the area below is closed off.',
        'Potting mix is handled damp with gloves and a P2 mask, and hands are washed before eating.',
        'The irrigation connection is made by a licensed plumber with the backflow protection the plumbing rules require.',
      ],
    }],
    ppe: ['p2', 'gloveGeneral'],
  },
  {
    when: 'pendants',
    steps: [{
      step: 'Install the ceiling pendants',
      hazards: ['A pendant falls while it is lifted to the ceiling.', 'The ceiling support fails under the pendant\'s load.', 'Contact with live medical gas or electrical services.', 'Dust in a clinical area.'],
      controls: [
        'Pendants are lifted with a material lifter or lifting frame rated for the load, never held overhead by hand.',
        'The ceiling support steel and anchors are installed to the engineer\'s design for the pendant\'s load and are certified before the pendant is hung.',
        'Medical gas connections are made by licensed medical gas fitters and electrical connections by licensed electricians, with the services isolated under the hospital\'s permit.',
        'Work follows the hospital\'s infection control permit, with dust barriers where it requires them.',
      ],
    }],
  },
  {
    when: 'mriShield',
    steps: [{
      step: 'Install the MRI room shielding',
      hazards: ['Strain and crush injuries from heavy copper or steel shielding panels.', 'A strong magnetic field if a magnet is already on site.', 'Cuts from sheet metal edges.', 'Fumes from soldering or brazing joints.'],
      controls: [
        'Shielding panels are moved on trolleys and lifted with panel lifters or two people, and propped until fixed.',
        'Where the magnet is already installed or energised, no ferrous tools or materials go into the magnet room, and access follows the hospital\'s MRI safety rules.',
        'Sheet edges are handled with cut resistant gloves.',
        'Soldering or brazing is done under a hot work permit with ventilation.',
      ],
    }],
    ppe: ['gloveCut'],
  },
  {
    when: 'fumeCupboard',
    steps: [{
      step: 'Install the fume cupboards',
      hazards: ['A fume cupboard tips or falls while it is moved.', 'Strain lifting cabinets and benches.', 'Chemical residues in an existing laboratory.'],
      controls: [
        'Fume cupboards are moved on trolleys or skates and lifted with mechanical aids, and fixed before they are let go.',
        'In an existing laboratory, the area is cleared and decontaminated by the occupier before work starts.',
        'Fume cupboards are tested and commissioned to AS/NZS 2243.8 before use, with electrical and plumbing connections made by licensed trades.',
      ],
    }, {
      step: 'Install the exhaust fan and stack on the roof',
      hazards: ['A fall from the roof while fitting the exhaust fan and stack.'],
      controls: [
        'The exhaust fan and stack on the roof are installed with the roof fall protection in place.',
      ],
    }],
  },
  {
    when: 'poolPlant',
    steps: [{
      step: 'Install the pool plant',
      unless: 'poolDosingOnly',
      hazards: ['Strain lifting pumps, filters and vessels.', 'Electric shock from pumps and controls near water.', 'Pressure vessel or pipe failure during testing.'],
      controls: [
        'Pumps, filters and vessels are moved with skates, a pallet jack or lifting aids.',
        'Pipework is pressure tested to the designer\'s test pressure with the area clear.',
        'Electrical connections are made by a licensed electrician, and plant is commissioned to the supplier\'s instructions.',
      ],
    }, {
      step: 'Install the chemical dosing',
      hazards: ['Chlorine gas or chemical release when chemicals are mixed or spilled.', 'Electric shock from pumps and controls near water.'],
      controls: [
        'Pool chemicals are stored and handled as their safety data sheets set out, kept apart, never mixed, with an eyewash and spill kit at hand.',
        'Electrical connections are made by a licensed electrician, and plant is commissioned to the supplier\'s instructions.',
      ],
    }],
    ppe: ['gloveChemical', 'goggles'],
  },
  {
    when: 'gasSuppression',
    steps: [{
      step: 'Install the gas suppression system',
      hazards: ['A cylinder falls, or a valve is knocked off and the cylinder discharges.', 'Asphyxiation if the system discharges into an occupied room.', 'Strain lifting cylinders.', 'Pipe fittings fail under pressure.'],
      controls: [
        'Cylinders are moved on cylinder trolleys with their valve caps or anti-recoil devices fitted, and strapped to their racks as soon as they are placed.',
        'The actuators stay disconnected, and the system stays isolated, until commissioning, which is done with the room cleared and to the supplier\'s procedure.',
        'Pipework and fittings are rated for the system pressure and tested as the standard requires.',
        'The work is done by workers holding the fire protection licence or accreditation the state requires.',
      ],
    }],
  },
  {
    when: 'conveyorInstall',
    steps: [{
      step: 'Install the conveyors',
      hazards: ['Conveyor sections fall or swing while they are lifted.', 'Entanglement when the conveyor is first run.', 'A fall from the conveyor frame or walkway.', 'Strain lifting rollers and drive units.'],
      controls: [
        'Sections are lifted with a crane, forklift or lifting gear rated for them, slung by licensed doggers where the work needs it, with no one under the load.',
        'Work at height is done from an EWP or from walkways with their guardrails fitted.',
        'Guards are fitted before the conveyor is run, and the drives are isolated and locked out whenever anyone works on the conveyor.',
        'The conveyor is commissioned to a written procedure, with emergency stops and pull wires tested first.',
      ],
    }],
  },
  {
    when: 'moduleInstall',
    steps: [{
      step: 'Lift and set the modules',
      hazards: ['A module falls or swings while it is lifted.', { unless: 'podOnly', text: 'A fall from the top or open edge of a module.' }, { only: 'podOnly', text: 'A fall from the loading platform or slab edge while a pod is landed or moved in.' }, 'Crush injuries between modules as they are landed.', 'Modules delivered on the street strike the public.'],
      controls: [
        'Each module is lifted with the crane under a lift plan, using the manufacturer\'s lifting points and spreader frame, slung by licensed doggers or riggers, with no one under the load.',
        'Modules are guided with tag lines, and no one stands between a module and the structure while it is landed.',
        { unless: 'podOnly', text: 'Workers on top of modules use edge protection or travel restraint to anchors set out in the installation plan.' },
        { only: 'podOnly', text: 'Pods are landed on a loading platform with guardrails and gates, and moved into place on the floor with skates or pod trolleys rated for their weight, with hands and feet clear.' },
        'Deliveries and lifts over the street happen only inside the traffic management and permits for the work.',
      ],
    }],
    ppe: ['harness'],
  },
  {
    when: 'timberStructure',
    steps: [{
      step: 'Erect the mass timber panels and beams',
      hazards: ['A panel or beam falls or swings while it is lifted.', 'A fall from the floor edge or through an opening.', 'The structure is unstable before it is braced.', 'Cuts and dust from cutting timber on site.'],
      controls: [
        'Panels and beams are lifted with the crane under a lift plan, with the manufacturer\'s lifting points, slung by licensed doggers or riggers.',
        'Members are erected to the engineer\'s sequence and braced as they go up, with props until the connections are complete.',
        'Floor edges and openings have edge protection or covers as soon as panels are laid.',
        'Timber is cut with saws that have dust extraction, and fixings are installed with the tools the connector supplier specifies.',
      ],
    }],
    ppe: ['harness'],
  },
  {
    when: 'shotcrete',
    steps: [{
      step: 'Spray the shotcrete',
      hazards: ['Struck by the nozzle or a hose that whips when it blocks or bursts.', 'Rebound and dust in the eyes and lungs.', 'Cement burns.', 'The face behind the shotcrete collapses.'],
      controls: [
        'The nozzle operator is trained, hoses and couplings are rated and pinned, and the line is depressurised before a blockage is cleared.',
        'No one stands in front of the nozzle or in the rebound area. The nozzle operator wears a face shield and respirator, and others keep back.',
        'The excavated face is sprayed in the lifts the engineer sets, and no one works under an unsupported face.',
        'Gloves, long sleeves and boots are worn, and skin contact is washed off straight away.',
      ],
    }],
    ppe: ['faceShield', 'p2', 'gloveChemical'],
  },
  {
    when: 'kerbInstall',
    steps: [{
      step: 'Form and pour the kerb and channel',
      hazards: ['Struck by traffic or plant.', 'Cement burns and dust.', 'Strain and knee injury finishing kerbs.', 'Caught in a kerb extruding machine.'],
      controls: [
        'All work is inside the traffic management set out for the job, and plant has a spotter where people are near.',
        'The kerb machine is operated by a trained operator, with guards in place and no one near the auger or mould while it runs.',
        'Gloves, boots and long sleeves are worn, and wet concrete is washed off skin straight away.',
        'Finishing is rotated, with kneeling pads used.',
      ],
    }],
    ppe: ['hivis', 'gloveChemical'],
  },
  {
    when: 'trackWork',
    steps: [{
      step: 'Replace the sleepers and ballast',
      hazards: ['Struck by a train or track plant.', { unless: 'tamping', text: 'Strain lifting sleepers and rail.' }, 'Silica dust from ballast.', 'Crushed by on-track plant or rail handling equipment.'],
      controls: [
        'Work is done only inside a track possession under the rail manager\'s protection arrangements, by workers with the rail competencies the rail manager requires.',
        { unless: 'tamping', text: 'Sleepers and rail are handled with on-track plant or sleeper tongs, never lifted by hand alone, and people keep clear of plant on the track.' },
        { only: 'trackLaying', text: 'The track laying machine is run by its trained crew, and no one is near rail being threaded, pulled or cut, or between the machine and the rail it is placing.' },
        { only: 'tamping', text: 'Tampers and ballast regulators work only under the protection officer\'s directions. No one on foot is within the machines\' working area, and workers walk only in a safe place clear of the track.' },
        'Ballast is dropped and regulated with water sprays where dust is raised, and P2 respirators are worn.',
        'The track is inspected and handed back by the rail manager\'s competent person before the possession ends.',
      ],
    }],
    ppe: ['hivis', 'p2'],
  },
  {
    when: 'roadPlant',
    steps: [{
      step: 'Run the road plant inside the work zone',
      hazards: [{ unless: 'asphaltHot', text: 'A worker is struck or run over by the road plant or trucks.' }, { only: 'roadBuild', text: 'A worker is struck by the excavator, grader, road rollers or trucks.' }, { only: 'asphaltHot', text: 'A worker is struck or run over by the paver, road rollers or trucks.' }, 'Struck by passing traffic.', { unless: 'lineMarkOnly', text: 'Entanglement in a cutting or mixing drum, auger or conveyor.' }, { only: 'asphaltHot', text: 'Burns from hot asphalt.' }, { only: 'limeWork', text: 'Burns to skin and eyes from lime and cement.' }, 'Dust and fumes.'],
      controls: [
        'All plant works inside the traffic management set out for the job, with a truck mounted attenuator behind the work where the traffic management plan requires it.',
        'Each machine is run by a competent operator, checked before each shift, with its guards fitted.',
        { unless: 'lineMarkOnly', text: 'Drums, augers and conveyors are stopped and isolated before anyone clears or inspects them.' },
        'Ground workers stay out of the plant\'s path and blind spots, wear high visibility clothing, and use two-way acknowledgement with operators before approaching.',
        { only: 'truckFeed', text: 'Trucks reverse to the paver or profiler only on a spotter\'s signal.' },
        { only: 'limeWork', text: 'Lime and cement are spread in low wind, with workers upwind, wearing eye protection, gloves and a P2 respirator.' },
        { only: 'asphaltHot', text: 'Hot asphalt is handled with gloves, long sleeves and boots.' },
        'At night, the work zone is lit, and plant has its lights and beacons working.',
      ],
    }],
    ppe: ['hivisNight', 'earPlugs', 'gloveGeneral'],
  },
  {
    when: 'heavyLift',
    steps: [{
      step: 'Plan the heavy lift',
      hazards: ['The crane overturns from ground failure or overload.', 'Contact with overhead power lines or rail overhead wiring.'],
      controls: [
        'The lift is planned in writing by the crane company or a competent lift engineer or lift supervisor: a lift study with the load weight and centre of gravity, rigging, crane configuration, radius and capacity, and the ground bearing and crane mats or outrigger pads checked against the ground conditions.',
        'Near power lines or rail overhead wiring, the network or rail operator\'s clearances and permits apply, with a spotter.',
      ],
    }, {
      step: 'Carry out the heavy lift',
      hazards: ['The crane overturns from ground failure or overload.', 'The load drops, swings or strikes people or structures.', 'Contact with overhead power lines or rail overhead wiring.', 'Wind exceeds the crane\'s limit during the lift.'],
      controls: [
        'The crane is set up only on ground or mats certified for its loads, away from excavations, batters and services.',
        'Licensed operators, doggers and riggers run the lift. Everyone not involved stays outside the exclusion zone, and a pre-lift meeting is held.',
        'The lift stops in winds above the crane\'s or the load\'s limit, which is checked before and during the lift.',
        'Near power lines or rail overhead wiring, the network or rail operator\'s clearances and permits apply, with a spotter.',
      ],
    }],
    ppe: ['chinStrap'],
  },
  {
    when: 'craneAssembly',
    steps: [{
      step: 'Assemble or dismantle the crawler crane',
      hazards: ['The boom drops when pins are removed.', 'Crush injuries handling boom sections, tracks and counterweights.', 'A fall from the crane body or boom.', 'The assist crane is overloaded.'],
      controls: [
        'The crane is assembled and dismantled to the manufacturer\'s procedure by its trained erection crew, on firm, level ground checked for the loads.',
        'No one stands under, inside or beside the boom while pins are driven or removed. Boom sections are supported on blocking first.',
        'Sections, tracks and counterweights are lifted with the assist crane under a lift plan, slung by licensed riggers.',
        'Work on the crane body or boom uses the manufacturer\'s access points and fall arrest anchors.',
        'The crane is inspected and its safety devices tested before its first lift.',
      ],
    }],
    ppe: ['harness', 'chinStrap'],
  },
  {
    when: 'transportMove',
    steps: [{
      step: 'Move the load with transporters or a launching system',
      hazards: ['The load tips, slides or drops during the move.', 'Hydraulic failure of the jacks or moving equipment.', 'Workers crushed between the load and the structure.', 'Ground or supports fail under the load.'],
      controls: [
        'The move follows an engineered procedure, with the route, ground bearing, load paths and stop points set out, and the moving equipment set up and checked by its supplier.',
        { only: 'skidMove', text: 'Skid tracks are set level on supports designed for the load, the load is jacked only at its designed jacking points, and it is packed as it is raised or lowered so it cannot drop.' },
        { only: 'substation', text: 'Within a live substation, the work follows the network operator\'s access permit, with the load, plant and people kept outside the safe approach distances to energised equipment.' },
        'Movements are directed by one supervisor with radio contact to all operators, and stop if any monitoring point goes outside its limit.',
        'No one is under the load or between the load and the structure while it moves.',
        'Hydraulic systems are inspected before the move and depressurised before any fitting is undone.',
      ],
    }],
  },
  {
    when: 'drivenPiles',
    steps: [{
      step: 'Pitch and drive the piles',
      hazards: ['A pile or hammer falls or swings while it is pitched.', { unless: 'marinePlant', text: 'The rig overturns on soft ground.' }, { only: 'marinePlant', text: 'The piling rig overturns from barge movement or overload.' }, 'Noise and vibration from the hammer.', 'Struck by a pile that breaks or kicks out while it is driven.'],
      controls: [
        { unless: 'marinePlant', text: 'The rig works on a working platform designed for its track loads, and the platform certificate is sighted before the rig sets up.' },
        { only: 'marinePlant', text: 'The rig on the barge or jack-up works within the vessel\'s stability limits and its load chart for marine use, and pitching stops in sea states or winds above the limits.' },
        'Piles are pitched with the rig or a crane, slung by licensed doggers, with no one under the pile or within the exclusion zone while it is pitched and driven.',
        'The hammer is run by a competent operator, with its guards fitted, and stopped before anyone approaches the pile head.',
        'Hearing protection is worn near the hammer, and noise and vibration at neighbouring buildings are monitored where the plan requires it.',
      ],
    }],
    ppe: ['earMuffs', 'chinStrap'],
  },
  {
    when: 'groundImprove',
    steps: [{
      step: 'Run the ground improvement rig',
      hazards: ['The rig overturns on soft ground.', 'Struck by the mast, mandrel or vibroprobe.', 'Noise and vibration.', 'Plant strikes ground workers.'],
      controls: [
        'The rig works on a working platform designed for its loads, and keeps back from soft edges and excavations.',
        'An exclusion zone is kept around the rig while it runs, and ground workers approach only on the operator\'s signal.',
        'The rig is checked before each shift, run by a competent operator, and the mast is lowered for travel.',
        'Hearing protection is worn near the rig, and vibration at neighbouring structures is monitored where the plan requires it.',
      ],
    }],
    ppe: ['earMuffs'],
  },
  {
    when: 'drillRig',
    steps: [{
      step: 'Drill with the drill rig',
      hazards: ['The rig tips over at the edge of a bench or cut.', 'Entanglement in the rotating rods.', 'Silica dust from drilling rock.', 'Rocks fall from the face above.'],
      controls: [
        'The rig is set up on a bench or platform wide enough for it, back from the edge, and the face above is scaled and checked by a competent person before work below it.',
        'The rotating rods are guarded, and no one handles rods while they turn. The rig has a working emergency stop.',
        'Drilling uses water or dust collection, with fit tested P2 respirators for anyone still at risk.',
        'Workers at a cut edge use fall protection where a fall is possible.',
        { only: 'anchorWork', text: 'Anchors are installed, grouted and tested to the designer\'s method. The stressing jack is run only by trained people, and no one stands behind or in line with the jack or anchor head while it is stressed or tested.' },
      ],
    }],
    ppe: ['p2', 'earMuffs'],
  },
  {
    when: 'groutPump',
    steps: [{
      step: 'Mix and pump the grout',
      hazards: ['Hose whip or a burst line under pressure.', 'Cement burns to skin and eyes.', 'Dust from cement bags.', 'Entanglement in the mixer paddles.'],
      controls: [
        'Hoses and couplings are rated for the pump pressure and pinned, and the line is depressurised before a blockage is cleared or a hose is undone.',
        'The mixer is guarded and stopped before anyone reaches into it.',
        'Bags are opened low, with eye protection, gloves and a P2 respirator, and skin contact is washed off straight away.',
      ],
    }],
    ppe: ['goggles', 'gloveChemical', 'p2'],
  },
  {
    when: 'tunnelWork',
    steps: [{
      step: 'Work underground in the tunnel',
      hazards: ['Struck by plant in a confined tunnel.', { only: 'roadheader', text: 'Contact with the rotating cutter head.' }, { only: 'roadheader', text: 'Silica dust from cutting rock.' }, 'Poor air, dust, diesel exhaust or gas underground.', 'Rock or ground falls from the face or crown.', 'Fire underground.', 'Being unaccounted for in an emergency.'],
      controls: [
        'Everyone underground is tagged in and out, and the tunnel emergency plan covers refuge chambers, self-rescuers and the rescue team.',
        'Ventilation keeps the air within the exposure standards, and the air is monitored for oxygen, gas and diesel exhaust, with alarms.',
        'Plant movements are controlled with traffic rules, passing bays, lighting and proximity warning, and pedestrians stay in marked walkways.',
        'No one goes under unsupported ground. The face and crown are supported as the design requires before anyone works under them.',
        { only: 'roadheader', text: 'The cutter head is stopped and isolated before anyone approaches it, and the water sprays and dust scrubber run whenever it cuts. Air is monitored for crystalline silica, with respirators for anyone still at risk.' },
        'Fire extinguishers are carried on plant and at work areas, and hot work underground is done only under a permit.',
      ],
    }],
    ppe: ['hivisNight', 'earMuffs', 'p2'],
  },
  {
    when: 'marinePlant',
    steps: [{
      step: 'Work from the barge or marine plant',
      hazards: ['The vessel becomes unstable or overloaded.', 'A fall into the water when moving between vessels and structures.', { only: 'bargeCrane', text: 'A crane on a barge is overloaded by barge movement.' }, 'Struck by mooring lines under tension.'],
      controls: [
        'The vessel is run by its licensed master or competent operator under its marine safety system, with its load limits and stability checked for the work.',
        { only: 'bargeCrane', text: 'Crane lifts from a barge use the crane\'s de-rated load chart for barge use and stop in sea states or winds above the limit.' },
        'Transfers between vessels and structures use a secured gangway or ladder, with life jackets worn and a rescue boat or rescue equipment ready.',
        'No one stands in the bight or line of a mooring line under tension.',
      ],
    }],
    ppe: ['lifeJacket'],
  },
  {
    when: 'heavyHaulage',
    steps: [{
      step: 'Haul and deliver the loads on public roads',
      hazards: ['The load shifts or falls from the truck.', 'A truck strikes the public or workers at the site gate.', 'Oversize loads strike power lines, bridges or other road users.', 'Driver fatigue.'],
      controls: [
        'Loads are restrained to the national load restraint guide before the truck leaves, and checked on the way.',
        'Oversize and overmass loads travel only under their road permits, on the approved route, with the pilot or escort vehicles the permit requires, and the route is checked for power lines and clearances.',
        'Trucks enter and leave the site only through the traffic management set out for the gate, with a spotter for reversing.',
        'Drivers work within the heavy vehicle fatigue rules, and the work is planned to meet the chain of responsibility duties.',
        { only: 'heavyUnload', text: 'At site, the load is unloaded by the crane, jacking or skidding method in the delivery plan, on ground checked for the loads, with no one under or beside it while it is lifted or moved off the trailer.' },
      ],
    }],
    ppe: ['hivis'],
  },
  {
    when: 'processPlant',
    steps: [{
      unless: 'plantErect',
      step: 'Run the processing plant',
      hazards: ['Entanglement in conveyors, crushers and screens.', 'Struck by material falling from conveyors or stockpiles.', 'Silica dust and noise.'],
      controls: [
        'Conveyors, crushers and screens have guards fitted, and pull-wire and emergency stops are tested before each shift.',
        'Dust is controlled with water sprays and enclosures, and air monitoring is done for crystalline silica, with P2 respirators where needed.',
        'Hearing protection is worn in signed areas, and loaders keep clear of people around stockpiles and hoppers.',
        'On a mine or quarry site, the work also follows the site\'s safety and health management system and rules, as the state\'s mining safety law requires.',
      ],
    }, {
      unless: 'plantErect',
      step: 'Maintain the processing plant',
      hazards: ['Entanglement in conveyors, crushers and screens.', 'Plant starts while someone is working on it.', 'Silica dust and noise.'],
      controls: [
        'Plant is isolated and locked out with personal locks before anyone clears a blockage, cleans or works on it.',
        'Conveyors, crushers and screens have guards fitted, and pull-wire and emergency stops are tested before each shift.',
        'Dust is controlled with water sprays and enclosures, and air monitoring is done for crystalline silica, with P2 respirators where needed.',
        'On a mine or quarry site, the work also follows the site\'s safety and health management system and rules, as the state\'s mining safety law requires.',
      ],
    }],
    ppe: ['earMuffs', 'p2', 'hivis'],
  },
  {
    when: 'refuelPlant',
    steps: [{
      step: 'Refuel plant on site',
      hazards: ['Fuel fire or explosion.', 'Fuel spill into the ground or stormwater.', 'Struck by the fuel truck or plant.'],
      controls: [
        'Engines are off and plant is parked before refuelling, with no smoking or ignition sources within the refuelling area.',
        'The fuel truck or trailer is earthed or bonded as its supplier requires, and nozzles are never left unattended.',
        'A spill kit and fire extinguisher are at hand, and spills are cleaned up and reported straight away.',
        'Refuelling happens at a set location away from drains and waterways, with the truck\'s movements controlled by a spotter.',
      ],
    }],
  },
  {
    when: 'plantService',
    steps: [{
      step: 'Service and repair mobile plant on site',
      hazards: ['Plant moves or starts while it is being worked on.', 'Raised buckets, blades or bodies drop.', 'Hydraulic oil injection or a hose burst.', 'Tyre or rim explosion.', 'Burns from hot engines and fluids.'],
      controls: [
        'Plant is parked on level ground, the engine stopped, the key removed, and the plant isolated and tagged before work starts. Wheels are chocked.',
        'Raised buckets, blades and bodies are lowered, or blocked with their mechanical locks, before anyone works under them.',
        'Hydraulic pressure is released before any line is undone, and no one checks for leaks with their hands.',
        'Tyres are deflated before rims are worked on, and inflated in a cage or with a remote inflator.',
        'Hot parts and fluids are left to cool, and used oil and filters are collected for disposal.',
      ],
    }],
    ppe: ['gloveGeneral', 'glassesClear'],
  },
  {
    when: 'vegClearing',
    steps: [{
      step: 'Clear vegetation with the mulcher and excavator',
      hazards: ['Struck by debris thrown from the mulcher.', 'Plant rolls over on slopes or soft ground.', 'Trees fall on plant or people.', 'Fire from hot exhausts in dry vegetation.', 'Snakes and wildlife.'],
      controls: [
        'An exclusion zone is set around the mulcher for thrown debris, as its manufacturer specifies, and no one enters it while it runs.',
        'Plant has rollover and falling object protection and keeps to slopes within its limits.',
        'Large trees are felled away from plant and people by competent operators.',
        'In dry conditions a fire extinguisher is carried, exhausts and spark arrestors are checked, and the fire danger rating is checked each day.',
        'The area is checked for wildlife and nests as the environmental approvals require.',
      ],
    }],
  },
  {
    when: 'towerLift',
    steps: [{
      step: 'Lift and erect the tower sections',
      hazards: ['A section falls or swings while it is lifted.', 'A fall from the tower while connecting sections.', 'Wind exceeds the lifting limit.', 'Contact with live power lines nearby.'],
      controls: [
        'Sections are lifted with the crane under a lift plan, slung by licensed riggers, with tag lines and no one under the load.',
        'Connectors climb and work only with fall arrest attached to anchor points on the tower, and a rescue plan for a worker suspended at height.',
        'Lifting stops in winds above the crane\'s and the component supplier\'s limits.',
        'Work near live lines follows the network operator\'s access permit and clearance rules.',
      ],
    }],
    ppe: ['harness', 'chinStrap'],
  },
  {
    when: 'hydroDemo',
    steps: [{
      step: 'Hydro demolish the concrete',
      hazards: ['Injection injury from the very high pressure water jet.', 'Struck by flying concrete.', 'Noise.', 'The robot moves unexpectedly.', 'Slurry run-off.'],
      controls: [
        'The hydro demolition robot is run by a trained operator from outside the exclusion zone, which is fenced and signed for flying debris.',
        'The pump has a dead man control, and no one approaches the jet until the pump is stopped and pressure released.',
        'Hearing protection is worn in the signed area.',
        'Slurry is collected and treated before disposal, as the environmental approvals require.',
      ],
    }],
    ppe: ['earMuffs', 'faceShield'],
  },
  {
    when: 'vacExcavation',
    steps: [{
      step: 'Hydro excavate with the vacuum truck',
      hazards: ['Injection injury from the water lance.', 'Striking or damaging a live service.', 'Struck by the truck or its boom.', 'A person falls into the open hole.'],
      controls: [
        'The lance is used only by a trained operator, with low enough pressure near services that it cannot damage them, and the trigger released when not digging.',
        'Services found are exposed, identified and protected, and their owners told of any damage straight away.',
        'The truck is set up with an exclusion zone around the boom and hose, and a spotter while it moves.',
        'Open holes are covered or barricaded when no one is at them.',
      ],
    }],
  },
  {
    when: 'hvTermination',
    steps: [{
      step: 'Prepare and terminate the high voltage cables',
      hazards: ['Electric shock or arc flash if the cable is not isolated and earthed.', 'Burns from heat shrink torches.', 'Cuts from cable preparation tools.', 'Insulation failure from poor terminations.'],
      controls: [
        'Terminations are made only by jointers trained and authorised for high voltage cable work, under the site or network access permit, with the cable proved de-energised and earthed at both ends.',
        'Cable is prepared with the termination kit maker\'s tools and method, and heat shrink torches are used with a fire extinguisher at hand and away from flammable materials.',
      ],
    }, {
      step: 'Test the high voltage cables',
      hazards: ['Electric shock or arc flash if the cable is not isolated and earthed.', 'Insulation failure from poor terminations.'],
      controls: [
        'Each termination is insulation and pressure tested before the cable is energised, and the test results are recorded.',
        'Energising is done only by the authorised high voltage operator under the switching program.',
      ],
    }],
    ppe: ['gloveInsulated'],
  },
  {
    when: 'trafficSwitch',
    steps: [{
      step: 'Set up the traffic switch and message signs',
      hazards: ['Struck by passing traffic while placing signs, barriers or message boards.', 'Drivers confused by the change in traffic arrangement.', 'Struck by the truck or trailer placing the equipment.'],
      controls: [
        'The traffic switch follows the traffic management plan and staging approved by the road authority, and is set up only by workers holding the state\'s traffic management qualifications for the work.',
        'Signs, barriers and message boards are placed in the order the plan sets, working from behind a truck mounted attenuator or a protected position, and with traffic slowed or stopped where the plan requires it.',
        'Variable message boards are parked clear of traffic, levelled and locked, and show the messages and timing the plan approves before the switch is made.',
        'The switch is checked by driving through it before workers move into the new work area, and is inspected at the intervals the plan sets.',
      ],
    }],
    ppe: ['hivisNight'],
  },
  {
    when: 'ohwInstall',
    steps: [{
      step: 'Install the overhead wiring',
      hazards: ['Electric shock if the traction supply is not isolated and earthed, or is re-energised.', 'A fall from the road rail vehicle platform or a mast.', 'Struck by wire or fittings under tension.', 'Struck by a train or track plant.'],
      controls: [
        'Work is done only inside the possession, after the traction supply is isolated, proved dead and earthed by the rail manager\'s authorised electrical staff, with the permit issued to the work group.',
        'Workers on the overhead wiring hold the electrical and rail competencies the rail manager requires for overhead line work.',
        'Work at height is done from the road rail vehicle platform or elevating work platform with guardrails, and harnesses are attached to its anchor point.',
        'Wire is run out and tensioned with the wiring train or tensioning equipment to the method statement, and no one stands in the bight of a wire under tension.',
        'The permit is cancelled, and earths removed, only when everyone is clear and the work is signed off.',
      ],
    }],
    ppe: ['harness', 'hivisNight'],
  },
  {
    when: 'tempBridge',
    steps: [{
      step: 'Build the temporary bridge',
      hazards: ['The bridge or its abutments fail under haul truck loads.', 'A fall into the creek or from the bridge edge.', 'Struck by beams or deck units while they are lifted.', 'Plant overturns at the creek bank.'],
      controls: [
        'The bridge, abutments and crossing are built to an engineer\'s design for the haul trucks that will use it, with the load rating signed at each end.',
        'Beams and deck units are lifted in by crane under a lift plan, slung by licensed doggers, with no one under the load.',
        'Plant works back from the creek bank on ground checked for its loads, and anyone near the water wears a life jacket.',
        'Edge barriers or kerbs are fitted before trucks use the bridge, and the bridge is inspected by a competent person before first use and at set intervals.',
      ],
    }],
    ppe: ['lifeJacket', 'chinStrap'],
  },
  {
    when: 'dredgeWork',
    steps: [{
      step: 'Run the dredge and discharge line',
      hazards: ['Contact with the cutter head or pump while it is running.', 'The floating discharge line breaks free or a joint bursts.', 'Collision with other vessels in the channel.', 'A fall into the water.'],
      controls: [
        'The cutter head and dredge pump are stopped and isolated before anyone works on them or clears a blockage.',
        'The discharge line is anchored and marked, and its joints and floats are checked each shift. People keep clear of the line while it is pressurised.',
        'Navigation marks, lights and notices are set as the harbour master or waterways authority requires, and the dredge keeps a lookout.',
        'Life jackets are worn on deck and on the discharge line, and a rescue boat is ready.',
      ],
    }],
    ppe: ['lifeJacket', 'earMuffs'],
  },
  {
    when: 'tunnelFans',
    steps: [{
      step: 'Lift and fix the tunnel ventilation fans',
      hazards: ['A fan falls while it is lifted or fixed.', 'Crushed between the platform and the tunnel crown.', 'Fixings into the crown fail.'],
      controls: [
        'Fans are lifted with a lifting device rated for the fan, with no one under the load, and held until the supports are fixed.',
        'Supports and fixings are installed and proof tested to the designer\'s details before the fan is hung.',
        'Platform operators check for crushing points at the crown and services before raising.',
        'The fan supply is isolated and locked out until the electricians connect and commission it.',
      ],
    }],
    ppe: ['chinStrap'],
  },
  {
    when: 'plantErect',
    steps: [{
      step: 'Erect the plant',
      hazards: ['A silo, frame or conveyor section falls while it is lifted.', 'A fall from silos, frames or conveyor walkways.'],
      controls: [
        'The plant is erected to its supplier\'s procedure on footings designed for it, and sections and silos are lifted by crane under a lift plan, slung by licensed doggers or riggers.',
        'Work at height uses the plant\'s walkways and ladders once fitted with guardrails, or an elevating work platform, with harnesses where those are not yet in place.',
      ],
    }, {
      step: 'Commission the plant',
      hazards: ['Plant starts while someone is working on it during commissioning.'],
      controls: [
        'Guards, pull-wires and emergency stops are fitted and tested before the plant is run, and it is isolated and locked out while anyone works on it.',
      ],
    }],
    ppe: ['harness', 'chinStrap'],
  },
  {
    when: 'impactRoller',
    steps: [{
      step: 'Compact with the rolling impact compactor',
      hazards: ['Struck by the towed compactor or tractor.', 'Stones thrown from under the module.', 'Ground vibration damages nearby structures or services.', 'Whole-body vibration for the operator.'],
      controls: [
        'An exclusion zone is set around the compaction area, sized as the supplier specifies, and no one enters it while the compactor runs.',
        'Vibration limits are set for nearby structures and buried services, with monitoring where the plan requires it, and compaction stops back from them.',
        'The tractor has rollover protection and a seat belt, and operators are rotated to limit whole-body vibration.',
      ],
    }],
    ppe: ['earMuffs', 'hivis'],
  },
  {
    when: 'tensileRoof',
    steps: [{
      step: 'Install the fabric roof membrane',
      hazards: ['A fall from the roof structure or the membrane edge.', 'The membrane panel catches the wind while it is lifted or spread.', 'Crushed or struck by the panel, clamping plates or tensioning gear.', 'Rope access workers stranded or injured at height.'],
      controls: [
        { fact: 'fallControl' },
        'The membrane is installed to the supplier\'s installation method and the engineer\'s sequence, with panels lifted, spread and tensioned only within the wind speed limits it sets, checked at roof height before and during the work.',
        'Panels are lifted by crane under a lift plan, slung by licensed doggers or riggers, with tag lines and no one under the load.',
        'Rope access work is done by trained rope access technicians to a rope access plan, on two independent anchored lines, with a rescue plan and rescue equipment at hand.',
        'Tensioning equipment is used within its rated load, and no one stands in line with a cable or strap under tension.',
        'No one walks on the membrane except where the supplier allows, and then only attached to an anchor.',
      ],
    }],
    ppe: ['harness', 'chinStrap'],
  },
  {
    when: 'sportsSurface',
    steps: [{
      step: 'Lay the synthetic track or sports surface',
      hazards: ['Isocyanates in polyurethane binders and coatings cause asthma and skin sensitisation.', 'Struck by the paving machine, loader or trucks.', 'Heat stress working on a dark surface in the sun.', 'Manual handling of rubber granule bags and binder drums.'],
      controls: [
        { fact: 'safetyDataSheet' },
        'Binders, primers and coatings are mixed and applied as their safety data sheets set out, with chemical gloves, long sleeves and eye protection, and the respiratory protection the safety data sheet specifies when spraying.',
        'Workers who are sensitised to isocyanates do not work with them, and skin contact is washed off straight away.',
        'The paving machine and loaders work inside a marked area, with an exclusion zone and two-way acknowledgement before anyone approaches.',
        'Bags and drums are moved by forklift, trolley or two people, and opened at waist height.',
        'Work in hot weather follows the heat plan: shade, cool water, rest breaks and earlier start times.',
      ],
    }],
    ppe: ['gloveChemical', 'goggles', 'sunHat', 'sunscreen'],
  },
  {
    when: 'poolFloor',
    steps: [{
      step: 'Install the moveable pool floor and bulkheads',
      hazards: ['Crushed by the floor or bulkhead while it moves.', 'Hydraulic or drive failure lets the floor drop or move.', 'A fall into the pool or the empty pool shell.', 'Drowning or entrapment once the pool is filled.'],
      controls: [
        'The floor and bulkheads are installed and commissioned to the manufacturer\'s method by its trained installers.',
        'Drives and hydraulics are isolated and locked out, and the floor is mechanically locked or supported, before anyone works under or beside it.',
        'Edges of the empty pool shell are barricaded, and access into the shell is by a fixed ladder or stair.',
        'Once water is in the pool, work in or over it follows the drowning controls, and the floor is not moved while anyone is in the water above or below it.',
      ],
    }],
    ppe: ['chinStrap'],
  },
  {
    when: 'seatingInstall',
    steps: [{
      step: 'Install the seating units and tiers',
      hazards: [{ unless: 'retractSeating', text: 'Crushed by a seating unit or tier while it is moved.' }, { only: 'retractSeating', text: 'Crushed by a seating unit, tier or telescopic bank while it is moved or extended.' }, 'A fall from the edge of a tier or the back of the seating.', 'Manual handling of seats and frames.', 'Dust and noise drilling anchors into concrete.'],
      controls: [
        'Seating is installed to the manufacturer\'s method and the engineer\'s anchoring details.',
        { only: 'retractSeating', text: 'Telescopic banks are extended and retracted only by trained people with everyone clear.' },
        'Heavy frames and units are moved with lifting equipment rated for them, not by hand.',
        'Open edges at the back and sides of tiers are fitted with guardrails before people work near them, or workers use fall protection.',
        src('Anchor holes are drilled with on-tool extraction, anyone still at risk wears a fit tested respirator, and hearing protection is worn.', WHS('s 529B, s 529C')),
        src('Assess in writing before drilling whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
        'Seats are handled by two people or with trolleys, and stacked close to where they are fixed.',
      ],
    }],
    ppe: ['earPlugs', 'gloveGeneral'],
  },
  {
    when: 'marquee',
    steps: [{
      step: 'Erect the marquees and temporary structures',
      hazards: ['The structure collapses or blows over in strong wind.', 'Struck by frames or poles while they are raised.', 'A fall from ladders or the frame.', 'Striking buried services with ground stakes.'],
      controls: [
        'Structures are erected to the supplier\'s engineered drawings for the site\'s wind conditions, with the ballast or anchoring they specify, and any building or event approval they need.',
        'Ground stakes are driven only after buried services are located.',
        'Frames are raised with enough people or lifting equipment for their weight, and workers stand clear of the lifting arc.',
        'Wind is monitored. Work and occupancy stop, and the structure is cleared, at the wind speeds the engineered drawings set.',
        'Roof sheets and walls are fixed from an elevating work platform or platform ladder, not by climbing the frame.',
      ],
    }],
    ppe: ['gloveGeneral'],
  },
  {
    when: 'stageRig',
    // The stage builders and the lighting riggers are different crews. Each comes when the
    // task names it, and both when it names neither.
    steps: [{
      step: 'Build the stage',
      only: 'stageBuild',
      hazards: ['A fall from the stage deck, scaffold or trusses.', 'The stage or towers blow over in wind.'],
      controls: [
        'The stage, towers and roof are built to the supplier\'s engineered drawings, with ballast and wind limits as they set out.',
        'Scaffold from which a person or thing could fall more than 4 m is erected by licensed scaffolders.',
      ],
    }, {
      step: 'Rig the lighting',
      only: 'lightRig',
      hazards: ['A fall from the stage deck, scaffold or trusses.', 'A truss, lighting fixture or speaker falls from height.', 'Overloading the rigging points or the roof structure.'],
      controls: [
        'Rigging points and their loads are approved by an engineer before trusses are hung, and loads are kept within the approved limits.',
        'Trusses are hung with chain hoists rated for the load, by licensed riggers, and every fixture has a secondary safety sling.',
        'No one works under a truss while it is raised or lowered, and work at height is done from guarded platforms or elevating work platforms.',
      ],
    }],
    ppe: ['harness', 'chinStrap'],
  },
  {
    when: 'platformWiden',
    steps: [{
      step: 'Widen the station platform',
      hazards: ['Struck by a train or rail plant at the platform edge.', 'Passengers enter the work area.', 'Precast units or copers fall while they are lifted.', 'Electric shock from rail overhead wiring.'],
      controls: [
        'Work at the platform edge or on the track side is done only inside a possession under the rail manager\'s protection arrangements.',
        'The work area is separated from passengers by hoardings or barriers, with signed safe routes kept open.',
        'Precast units and copers are lifted by crane or rail plant under a lift plan, slung by licensed doggers, with no one under the load.',
        'Near overhead wiring, the rail manager\'s isolation, earthing and clearance rules apply.',
      ],
    }],
    ppe: ['hivisNight'],
  },
  {
    when: 'poleErect',
    steps: [{
      step: 'Stand and fix the poles',
      hazards: ['The pole falls or swings while it is lifted and stood.', 'Contact with overhead power lines or overhead wiring.', 'Struck by traffic or plant.', 'A fall into an open footing hole.'],
      controls: [
        'Poles are lifted and stood with a crane or pole truck rated for the load, slung by licensed doggers, with no one under or within reach of the pole.',
        'Footings are bored or excavated by machine to the engineer\'s details, with services located first and open holes covered.',
        'Each pole is held by the crane until its base bolts are fixed or its footing can hold it, as the engineer\'s details set out.',
        'Overhead lines are identified before work starts, and the crane and pole stay outside the network operator\'s approach distances.',
        'Open footing holes are covered or barricaded.',
        'Work in or beside the road is done inside the traffic management set out for the job.',
      ],
    }],
    ppe: ['chinStrap', 'hivis'],
  },
  {
    when: 'greenRoofLayers',
    steps: [{
      step: 'Install the green roof layers',
      hazards: ['A fall from the roof edge.', 'The roof is overloaded by bulk growing media.', 'Dust from growing media.', 'Wind lifts drainage sheets or fabric.'],
      controls: [
        { fact: 'fallControl' },
        'Growing media and materials are spread across the roof within the load limits the engineer sets, not stockpiled in one place.',
        'The waterproofing is protected before drainage and growing layers are laid, and no sharp tools are used on it.',
        'Growing media is dampened to keep dust down, and P2 respirators are worn when handling dry media.',
        'Sheets and fabric are weighted as they are laid, and laying stops in strong wind.',
      ],
    }, {
      step: 'Plant the green roof',
      hazards: ['A fall from the roof edge.', 'Dust from growing media.', 'Strain lifting pots and root balls.'],
      controls: [
        { fact: 'fallControl' },
        'Plants are moved across the roof in crates or on trolleys, heavy pots and root balls are lifted by two people, and plants are set down back from the roof edge.',
        'Growing media is dampened to keep dust down, and P2 respirators are worn when handling dry media.',
      ],
    }],
    ppe: ['p2', 'gloveGeneral'],
  },
  {
    when: 'poolShell',
    steps: [{
      step: 'Fix the pool shell reo',
      hazards: ['A fall into the pool excavation.', 'The excavation sides collapse.', 'Impalement on exposed reinforcing bars.'],
      controls: [
        'The excavation is battered, benched or shored as the geotechnical advice or excavation plan sets out, and its edges are barricaded.',
        'Access into the excavation is by a secured ladder or ramp, and reo is fixed with bar ends capped or covered.',
      ],
    }, {
      step: 'Spray the pool shell',
      hazards: ['A fall into the pool excavation.', 'The excavation sides collapse.', 'Struck by the nozzle, or a shotcrete pump hose that whips when it blocks or bursts.', 'Rebound, dust and cement burns.'],
      controls: [
        'The excavation is battered, benched or shored as the geotechnical advice or excavation plan sets out, and its edges are barricaded.',
        'Shotcrete is sprayed by a trained nozzle operator. Hoses and couplings are rated and pinned, and the line is depressurised before a blockage is cleared.',
        'No one stands in front of the nozzle or in the rebound area. The nozzle operator wears a face shield and respirator, and gloves, long sleeves and boots are worn by everyone in the shell.',
      ],
    }],
    ppe: ['faceShield', 'p2', 'gloveChemical'],
  },
  {
    when: 'substationEquip',
    steps: [{
      step: 'Set and fix the substation equipment',
      hazards: ['A transformer, switchgear or kiosk falls or swings while it is lifted.', 'Crushed between the equipment and its plinth or the building.', 'Transformer oil spills.', 'Contact with live high voltage equipment nearby.'],
      controls: [
        'Transformers, switchgear and kiosks are lifted by crane under a lift plan, slung at their designed lifting points by licensed doggers, with no one under the load.',
        'Equipment is landed on plinths or footings built and certified to the design, and fixed before the crane releases it.',
        'Hands and feet stay clear of the plinth while the equipment is lowered, and it is guided with tag lines.',
        'Oil-filled equipment is checked for leaks on delivery, with a spill kit at hand and bunding in place as the design requires.',
        'Where existing equipment is live, the work follows the network operator\'s access permit and safe approach distances.',
      ],
    }],
    ppe: ['chinStrap'],
  },
  {
    when: 'precastFloor',
    steps: [{
      step: 'Land and fix the precast floor units',
      hazards: ['A unit falls or swings while it is lifted.', 'A unit slips off its bearings.', 'A fall from the open edge of the deck or through gaps between units.', 'Hands crushed between the unit and its bearing.'],
      controls: [
        { fact: 'erectionDesign' },
        'Units are lifted at their designed lifting points by crane under a lift plan, slung by licensed doggers or riggers, with tag lines and no one under the load.',
        'Each unit is landed on its bearings to the erection design and connected or propped as it requires before the hook is released.',
        'Edge protection or fall protection is in place at open deck edges and gaps before people work on the units.',
        'Hands and feet stay clear of the bearings until the unit is down.',
      ],
    }],
    ppe: ['harness', 'chinStrap'],
  },
  {
    when: 'speakerHang',
    steps: [{
      step: 'Hang the speakers and equipment from the roof structure',
      hazards: ['A speaker or bracket falls onto people below.', 'Overloading the roof steel or fixings.', 'A fall from the boom lift or catwalk.'],
      controls: [
        'Speakers and brackets are hung from fixing points the engineer or supplier has rated for the load, with a secondary safety sling or chain on every item.',
        'Heavy items are lifted with a chain hoist or lifting device rated for the load, not by hand at height.',
        'An exclusion zone is set up below while equipment is lifted and fixed.',
        'Work from the boom lift is done with the harness attached to its anchor point.',
      ],
    }],
    ppe: ['harness'],
  },
  {
    when: 'eventPower',
    steps: [{
      step: 'Install temporary event power and generators',
      hazards: ['Electric shock from damaged leads or connections.', 'People trip over cables in public areas.', 'Generator fire, fuel spill or exhaust fumes.', 'Cables damaged by vehicles or crowds.'],
      controls: [
        'The installation is designed and installed by licensed electrical workers, with RCD protection and earthing as the design requires, and is tested before it is energised.',
        'Cables in public areas are run overhead, in cable ramps or in protected routes, and are kept out of vehicle paths.',
        'Generators are set up outdoors on level ground, earthed as the supplier requires, fenced off from the public, and refuelled only when stopped and cool, with a spill kit and fire extinguisher at hand.',
        'Leads, boards and connections are inspected each day of the event, and damaged items are taken out of service straight away.',
      ],
    }],
    ppe: ['gloveGeneral'],
  },
  {
    when: 'spoilManage',
    steps: [{
      step: 'Stockpile and cover spoil',
      hazards: ['Struck by trucks or plant at the stockpile or loading area.', 'A stockpile or its face slumps onto a worker, or overloads the edge of an excavation.', 'Dust from stockpiles and loads, including silica, and asbestos where fill is unknown.', 'Skin contact with contaminated soil.'],
      controls: [
        { fact: 'spoilPlan' },
        'Spoil is stockpiled only where the principal contractor allows, back from excavation edges and outside their zone of influence, away from drains and site boundaries, and no higher or steeper than it stays stable.',
        'Stockpiles are covered with tarps or kept damp with water sprays to stop dust and runoff, and work stops in winds that lift dust off them. Contaminated or unknown spoil is kept in its own covered stockpile, apart from clean spoil.',
        'Where spoil is contaminated or may contain asbestos, workers wear gloves and coveralls, wash before eating, and the material is handled under the remediation or asbestos plan.',
      ],
    }, {
      step: 'Cart away spoil',
      unless: 'spoilStaysOnSite',
      hazards: ['Struck by trucks or plant at the stockpile or loading area.', 'Dust from stockpiles and loads, including silica, and asbestos where fill is unknown.', 'Skin contact with contaminated soil.', 'Mud, sediment and loose material on roads and in drains.'],
      controls: [
        { fact: 'spoilPlan' },
        'Trucks are loaded in a set loading area with a spotter, and no one stands beside a truck while it is loaded or tips.',
        'Loads are covered and restrained before trucks leave, wheels are cleaned or a shaker grid is used at the gate, and trucks leave under the site traffic management plan.',
        'Spoil leaves site only for a facility or site licensed or approved to take that type of waste, with the waste records the state environment regulator requires.',
        'Where spoil is contaminated or may contain asbestos, workers wear gloves and coveralls, wash before eating, and the material is handled under the remediation or asbestos plan.',
      ],
    }],
    ppe: ['hivis', 'p2', 'gloveGeneral'],
  },
  {
    when: 'loaderCrane',
    steps: [{
      step: 'Unload with the truck loading crane (hiab)',
      hazards: ['The truck tips or the crane overloads when outriggers are not set on firm ground.', 'The load falls, swings or strikes a person.', 'The crane boom or load contacts overhead power lines.', 'A fall from the truck tray or the load.', 'Crushed between the load and the truck, a wall or a stack.'],
      controls: [
        src('A vehicle loading crane rated at 10 metre-tonnes or more is operated only by a person holding the vehicle loading crane licence (CV). A smaller crane is operated by a person trained and competent on it.', WHS('s 81, schedule 3')),
        'The truck is parked level, with the outriggers fully extended on firm ground and pads, back from excavation edges, pits and kerbs, as the crane manufacturer requires.',
        'Overhead power lines are checked before the crane is set up, and the boom and load stay outside the network operator\'s approach distances, with a spotter where they could come close.',
        'Loads are lifted within the crane\'s load chart for the radius, slung with rated lifting gear, and controlled with tag lines. Slinging and directing a load out of the operator\'s view is done by a licensed dogger.',
        'No one stands under the load or between the load and the truck, wall or stack, and an exclusion zone is set around the lift. On a street, the public is kept out under the traffic or pedestrian management for the delivery.',
        'Loads are slung from the ground where possible. No one climbs onto the load, and work on the tray is kept clear of the open edges.',
      ],
    }],
    ppe: ['hivis', 'gloveGeneral'],
  },
  {
    // Work near live parts isolated by another party (owner approved wording, 5 October 2026).
    when: 'isolationByOthers',
    steps: [{
      step: 'Confirm the isolation by others before work',
      hazards: ['Electric shock or arc flash from parts thought to be isolated.', 'The supply is switched back on while work is under way.'],
      controls: [
        'Before work near the circuit, get confirmation from the person in control of the supply (the site electrician or facility manager), such as an isolation permit or record, that it is isolated, locked and tagged.',
        'Fit your own personal danger lock and tag where the isolation point allows it.',
        'A competent person tests that the parts are de-energised before anyone touches them (test before you touch).',
        'If the isolation cannot be confirmed, stop, treat the parts as live and keep out of the approach distance.',
      ],
    }],
  },
  {
    when: 'ladderUse',
    steps: [LADDER_STEP],
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
        { only: 'screenReplace', text: 'The old screen is taken out panel by panel, with each panel supported by two people or suction lifters as its fixings are released, and old silicone is cut away with a scraper, not a grinder.' },
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
    when: 'engStoneWork',
    steps: [{
      step: 'Remove, repair or modify installed engineered stone',
      hazards: ['Silica dust from cutting, drilling or breaking engineered stone.', 'Back injury and crush from heavy pieces of stone.', 'Noise.'],
      controls: [
        ...ENG_STONE,
        ...ENG_STONE_SILICA,
        'Benchtops are cut into pieces two people can carry, or moved on a trolley or with a lifting aid.',
        src('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. Hearing protection worn for the whole time of the noise, with hearing tests within 3 months of starting and at least every 2 years.', `${WHS('s 56, s 57, s 58')}; ${QCODE('Managing noise and preventing hearing loss', 's 2.2, s 5.3, s 5.4')}`),
      ],
    }],
    ppe: ['p2', 'earMuffs'],
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
      hazards: ['Back injury and crush from heavy stone.', 'A benchtop breaks or falls.', { only: 'naturalStone', unless: 'stoneSilica', text: 'Silica dust from cutting natural stone on site.' }],
      controls: [
        src('Use lift trolleys or vacuum lifters. Where team lifts are regular, redesign the task to use mechanical aids. Training in lifting technique is not the main control.', QCODE('Hazardous manual tasks', 's 4.1, s 4.4, s 4.7')),
        src('Any team lift is matched to the load, rehearsed, and led by one person.', MODEL('Hazardous manual tasks', 's 4.9')),
        'Benchtops are carried on edge in an A-frame and supported along their length until fixed.',
        { only: 'naturalStone', unless: 'stoneSilica', ...src('Cut-outs and edge work are done by the supplier off site where possible. Natural stone cut on site is cut wet or with on-tool extraction, by workers wearing fit tested P2 respirators, as cutting it is processing crystalline silica.', WHS('s 529B, s 529C')) },
        ...SILICA_FOLLOW_UP.slice(0, 1).map((item) => ({ only: 'naturalStone', unless: 'stoneSilica', ...(typeof item === 'string' ? { text: item } : item) })),
        'Benchtops are fixed and joined with adhesives and sealants used as their safety data sheets set out, with ventilation and gloves.',
      ],
    }],
  },
  {
    when: 'fireAtHeight',
    steps: [{
      step: 'Install sprinkler pipework',
      unless: 'hydrantOnly',
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
    }, {
      step: 'Install hydrant pipework',
      unless: 'sprinklerOnly',
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
        'Hydrant pipe lengths are lifted into place with a pipe lifter, hoist or chain block rated for their weight, not held up by hand while they are fixed.',
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
      step: 'Work on live fire systems',
      unless: 'pumpRoomOnly',
      hazards: ['Water under pressure released.', 'Pumps start automatically.', 'The building is unprotected while the system is impaired.'],
      controls: [
        { fact: 'isolationProcedure' },
        src('Lock out pumps and isolate valves. Each worker fits their own padlock, a tag alone is not an isolation, and only the person who applied a lock or tag removes it.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
        src('Release stored pressure before breaking into pipework.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
        src('Warn everyone before pumps are restarted.', MODEL('Managing the risks of plant in the workplace', 's 3.6')),
        'Impairments are agreed with the principal contractor and the building\'s fire safety adviser, alternative protection is in place while the system is out of service, and the system is returned to service as soon as practicable.',
        src('The system is not commissioned until it is, so far as reasonably practicable, without risks, and tests are done by a competent person.', WHS('s 204, s 213')),
      ],
    }, {
      step: 'Work in pump rooms',
      only: 'pumpRoomNamed',
      hazards: ['Water under pressure released.', 'Pumps start automatically.', 'Noise from running pumps.'],
      controls: [
        { fact: 'isolationProcedure' },
        src('Lock out pumps and isolate valves. Each worker fits their own padlock, a tag alone is not an isolation, and only the person who applied a lock or tag removes it.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
        src('Release stored pressure before breaking into pipework.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
        src('Warn everyone before pumps are restarted.', MODEL('Managing the risks of plant in the workplace', 's 3.6')),
        src('Where a diesel pump is run indoors, the pump room is ventilated and the exhaust is taken outside, so no one breathes diesel exhaust above the exposure standard.', `${WHS('s 49')}; ${QCODE('Managing risks of hazardous chemicals', 's 1.5, s 2.1, s 4.1')}`),
        src('Pump runs and diesel pump tests are noisy: keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak, signpost the pump room as a hearing protector area, and wear hearing protection for the whole time of the noise.', `${WHS('s 56, s 57, s 58')}; ${QCODE('Managing noise and preventing hearing loss', 's 2.2, s 5.3')}`),
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
    // Temporary fencing, hoardings and gantries are separate activities: a gantry is
    // structural work by licensed scaffolders. Each comes when the task names it, and the
    // fencing when it names neither hoardings nor gantries.
    steps: [{
      step: 'Erect temporary fencing',
      only: 'siteFencing',
      hazards: ['Unauthorised entry to the site.', 'Fence panels blow over in wind.', 'Strain handling fence panels and bases.'],
      controls: [
        src('The site is secured from unauthorised access.', WHS('s 298')),
        'Fence panels are set in their bases, clamped together and braced or ballasted against wind as the supplier specifies. Shade cloth or signs go on only where the bracing is designed for them.',
        'Panels and bases are carried by two people or moved on a trolley.',
        src('Get the current underground services information before digging or driving footings for fences, hoardings and gantries, and work to it.', WHS('s 304')),
        { only: 'road', ...src('Footpath or road closures have written approval from the authority that controls the area.', WHS('s 315M')) },
        src('Temporary cables are kept off access routes, materials are stacked away from fences and hoardings, and emergency exits stay clear and lit.', `${WHS('s 40')}; ${QCODE('Managing electrical risks', 's 3')}`),
      ],
    }, {
      step: 'Erect the hoardings',
      only: 'hoardingNamed',
      hazards: ['The public is struck by falling objects.', 'Unauthorised entry to the site.', 'Hoardings or gantries collapse.'],
      controls: [
        src('The site is secured from unauthorised access.', WHS('s 298')),
        src('The barricade or hoarding is set by the angle from the highest point of the work to the hoarding line: 15 degrees or less, at least 900 mm high; over 15 to 30 degrees, a hoarding at least 1,800 mm high; over 30 and under 75 degrees, a fully sheeted hoarding at least 1,800 mm high; 75 degrees or more, a fully sheeted hoarding at least 1,800 mm high and a gantry, closure or catch platform with screening.', WHS('s 315F, s 315G')),
        src('Loads are lifted over the footpath or road only where the area is closed or a gantry protects people from the load.', WHS('s 315L, s 315M')),
        src('Get the current underground services information before digging or driving footings for fences, hoardings and gantries, and work to it.', WHS('s 304')),
        { only: 'road', ...src('Footpath or road closures have written approval from the authority that controls the area.', WHS('s 315M')) },
        src('Temporary cables are kept off access routes, materials are stacked away from fences and hoardings, and emergency exits stay clear and lit.', `${WHS('s 40')}; ${QCODE('Managing electrical risks', 's 3')}`),
      ],
    }, {
      step: 'Erect the gantry',
      only: 'gantry',
      hazards: ['The public is struck by falling objects.', 'Hoardings or gantries collapse.'],
      controls: [
        { unless: 'hoardingNamed', ...src('The barricade or hoarding is set by the angle from the highest point of the work to the hoarding line: 15 degrees or less, at least 900 mm high; over 15 to 30 degrees, a hoarding at least 1,800 mm high; over 30 and under 75 degrees, a fully sheeted hoarding at least 1,800 mm high; 75 degrees or more, a fully sheeted hoarding at least 1,800 mm high and a gantry, closure or catch platform with screening.', WHS('s 315F, s 315G')) },
        src('Gantries are engineer designed (5 kPa, or 10 kPa where work other than light work is done above 10 m) and stop falling objects, water and dust. The overhead platform is secured against lifting or coming apart, with solid sheeting on its outer edge to at least the higher of 900 mm and anything stored on it. The area below is lit to at least 50 lux, the gantry cannot tip over or rotate (for example if a truck backs into it), and it is engineer designed for any shed or materials on it.', WHS('s 315K')),
        src('Gantries and covered ways in tube and coupler are erected by licensed intermediate scaffolders.', WHS('schedule 3')),
        src('Loads are lifted over the footpath or road only where the area is closed or a gantry protects people from the load.', WHS('s 315L, s 315M')),
        src('Get the current underground services information before digging or driving footings for fences, hoardings and gantries, and work to it.', WHS('s 304')),
        { only: 'road', ...src('Footpath or road closures have written approval from the authority that controls the area.', WHS('s 315M')) },
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
        { only: 'craneInterface', text: 'Traffic controllers hold pedestrians and traffic when the crane company\'s dogman asks. Crane lifts are run by the crane company.' },
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
        { only: 'wireSaw', text: 'The wire saw is set up with its guards fitted and the wire path enclosed, and no one stands in line with the wire while it runs, in case it breaks and whips.' },
        { fact: 'silicaControls' },
        src('Cutting concrete is processing a crystalline silica substance and must be controlled: wet cutting or on-tool extraction, and respirators for anyone still at risk.', `${WHS('s 529A, s 529B, s 529C')}; ${QCODE('Silica', 's 5.1, s 7.4.1, s 7.4.2, s 7.6')}`),
        src('Assess in writing before cutting whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
        src('Where the processing is high risk: a silica risk control plan is given to workers before they start (this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed), and workers doing the processing or at risk of exposure have completed a VET accredited or regulator approved crystalline silica course, with training records kept until 5 years after the worker leaves.', WHS('s 529CB, s 529CC, s 529CD')),
        src('Air monitoring is done where it is not certain the exposure standard is met, and results are kept for 30 years. For high risk processing, results over the exposure standard go to the regulator within 14 days. Workers with a significant risk from ongoing exposure have health monitoring supervised by a registered medical practitioner.', `${WHS('s 50, s 368, s 371, s 529CE, schedule 14')}; ${QCODE('Silica', 's 9.1, s 9.4, s 10.1, s 10.2')}`),
        { text: 'Every opening has the structural engineer\'s written approval before cutting.', only: 'cutOpening' },
        'Before cutting a post-tensioned slab, check the post-tensioning drawings, and scan and mark tendons, conduits and pipes. No cutting within a marked tendon zone unless the engineer gives a written method for it, including any temporary propping.',
        // Section 140 requires construction electrical equipment to comply with AS/NZS 3012; it says nothing on finding services.
        src('Services may be hidden in slabs and walls: scan, and isolate and confirm before cutting.', QCODE('Managing electrical risks', 's 3, s 3.3')),
        src('Saws, leads and RCDs used for the cutting comply with AS/NZS 3012, and leads are kept out of water.', ESR('s 140')),
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
      step: 'Move soil and mulch',
      only: 'landscapeSoil',
      hazards: ['Back strain from bags and soil.', 'Dust.', 'Heat.'],
      controls: [
        src('Order smaller bags, or have bulk loads moved by machine. Deliver as close as possible to where the materials are used. Use mechanical aids, and rotate tasks.', MODEL('Hazardous manual tasks', 's 4.4, s 4.5, s 4.7, s 4.9')),
        src('Keep dust down with wet methods.', MODEL('Managing risks of hazardous chemicals', 's 4.1')),
        'Protect finished paving, hard surfaces and membranes with boards or mats where plant or barrows cross them.',
        'Potting mix, compost and soil can carry Legionella bacteria. Open bags away from the face, keep the material damp, wear gloves and a P2 mask, and wash hands before eating, drinking or smoking.',
        src('Cool drinking water, shade and rest breaks in hot weather.', `${WHS('s 40, s 41')}; ${QCODE('Hazardous manual tasks', 's 4.6')}`),
      ],
    }, {
      step: 'Plant',
      only: 'landscapePlant',
      hazards: ['Back strain from bags and soil.', 'Heat.'],
      controls: [
        'Heavy pots and root balls are moved on trolleys or lifted by two people, and plants are handled with gloves.',
        { unless: 'noDigging', text: 'Before digging swales, irrigation trenches or planting holes, get the services plans (for example through Before You Dig Australia) and locate services on site. Pothole by hand or with a vacuum near services.' },
        { only: 'irrigationWork', text: 'The irrigation connection to the water supply and its backflow device is made by a licensed plumber.' },
        src('Order smaller bags, or have bulk loads moved by machine. Deliver as close as possible to where the materials are used. Use mechanical aids, and rotate tasks.', MODEL('Hazardous manual tasks', 's 4.4, s 4.5, s 4.7, s 4.9')),
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
      hazards: ['Silica dust from cutting pavers with a paver saw.', 'Noise.', 'Kneeling.'],
      controls: [
        src('Get the current underground services information before excavating the paving bed, and work to it.', WHS('s 304')),
        { only: 'paverRepair', text: 'Damaged pavers are lifted out by hand or with a paver lifter. Where pavers have sunk or collapsed, the bed is dug out to find the cause, such as a broken pipe, before it is rebuilt.' },
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
        { unless: 'artificialTurf', ...src('Use a turf laying machine for large turf rolls. Use mechanical aids for smaller rolls, and rotate tasks.', MODEL('Hazardous manual tasks', 's 4.5, s 4.9')) },
        // Laying turf is not excavation work, so the excavation code is not cited here.
        src('Plant has a warning device, and operators and ground workers use two way acknowledgement before anyone approaches plant.', WHS('s 215')),
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
      step: 'Plan the dual lift',
      hazards: ['One crane is overloaded as the load shifts between the cranes.'],
      controls: [
        src('A load is lifted by more than one crane only where each crane is specifically designed to lift a load. Loads stay within each crane\'s limits, under control, and never over people.', WHS('s 219')),
        'The crane company plans the dual lift with a lift plan that sets the share of the load on each crane and the limits for the lift. The lift does not start until the plan is agreed and the people in it are briefed.',
        src('Mobile and crawler cranes over 10 t are registered items. Get the registration details from the crane company.', WHS('schedule 5')),
      ],
    }, {
      step: 'Carry out the dual lift',
      hazards: ['One crane is overloaded as the load shifts between the cranes.', 'The load swings, twists or drops.'],
      controls: [
        src('A load is lifted by more than one crane only where each crane is specifically designed to lift a load. Loads stay within each crane\'s limits, under control, and never over people.', WHS('s 219')),
        src('Dual lifts are directed by riggers holding at least an intermediate rigging licence. Sight each licence.', WHS('s 85, schedule 3')),
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
    // The lights and the screens are separate items, each in the scope or not.
    steps: [{
      step: 'Install sports lighting',
      unless: 'screensOnly',
      hazards: [{ unless: 'sportsField', text: 'A fall from the EWP or the roof edge.' }, { only: 'sportsField', text: 'A fall from the EWP.' }, 'The EWP overturns, or hits power lines or structure.', 'Tools, fittings or the load fall onto people below.'],
      controls: [
        { fact: 'fallControl' },
        src('Boom EWPs with a boom of 11 m or more are operated by a licensed operator. The harness is attached to the EWP\'s designated anchor point, not the handrail.', `${WHS('schedule 3')}; ${MODEL('Managing the risk of falls', 's 5.1')}`),
        src('Plan for the EWP contacting electric lines, overturning, falls from the platform and crushing. Some EWPs are not suitable for windy conditions outdoors: work within the manufacturer\'s wind limit.', MODEL('Managing the risk of falls', 's 5.1')),
        { only: 'craneNamed', ...src('Screens and light frames are lifted by the crane company with lifting attachments suited to the load, within limits, kept under control and never over people.', WHS('s 219')) },
        { only: 'craneNamed', ...src('People are lifted in a crane work box only where plant designed to lift people, such as an EWP, is not reasonably practicable. The box has a registered design and is securely attached, people stay in it and wear a harness, and there is a way to get them out safely if the crane fails.', WHS('s 219(3), s 220(1), schedule 5')) },
        { only: 'lightTowers', text: 'Towers and masts are stood by crane onto footings and base bolts certified by the engineer, and held by the crane until the base bolts are tightened.' },
        src('Connecting the lights to the supply is electrical work, done by licensed electrical workers with the circuits isolated.', ESA('s 18, s 55, s 56')),
        src('Light fittings and parts are moved with trolleys and lifting aids, not carried by hand at height.', `${WHS('s 60')}; ${MODEL('Hazardous manual tasks', 's 4.5')}`),
        src('Tools and fittings at height are on lanyards, and an exclusion zone is set up below.', `${WHS('s 55')}; ${QCODE('Managing the risk of falls', 's 8.1')}`),
      ],
    }, {
      step: 'Install the screens',
      only: 'sportsScreens',
      hazards: [{ unless: 'sportsField', text: 'A fall from the EWP or the roof edge.' }, { only: 'sportsField', text: 'A fall from the EWP.' }, 'The EWP overturns, or hits power lines or structure.', 'Tools, fittings or the load fall onto people below.'],
      controls: [
        { fact: 'fallControl' },
        src('Boom EWPs with a boom of 11 m or more are operated by a licensed operator. The harness is attached to the EWP\'s designated anchor point, not the handrail.', `${WHS('schedule 3')}; ${MODEL('Managing the risk of falls', 's 5.1')}`),
        src('Plan for the EWP contacting electric lines, overturning, falls from the platform and crushing. Some EWPs are not suitable for windy conditions outdoors: work within the manufacturer\'s wind limit.', MODEL('Managing the risk of falls', 's 5.1')),
        { only: 'craneNamed', ...src('Screens and light frames are lifted by the crane company with lifting attachments suited to the load, within limits, kept under control and never over people.', WHS('s 219')) },
        { only: 'craneNamed', ...src('People are lifted in a crane work box only where plant designed to lift people, such as an EWP, is not reasonably practicable. The box has a registered design and is securely attached, people stay in it and wear a harness, and there is a way to get them out safely if the crane fails.', WHS('s 219(3), s 220(1), schedule 5')) },
        'Screen modules are fixed to the support frame to the manufacturer\'s details, each one secured before the next is lifted, and the frame is certified for the screen\'s weight and wind load.',
        src('Connecting the screen to the supply is electrical work, done by licensed electrical workers with the circuits isolated.', ESA('s 18, s 55, s 56')),
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
        { unless: 'noDigWork', ...src('Get the current underground services information before digging, and work to it.', WHS('s 304')) },
        { only: 'haulRoad', text: 'Haul roads are built and kept to the site\'s haul road design: width, grades and crossfalls for the largest vehicle using them, with windrows or bunds on open edges sized as the design sets out.' },
        { only: 'waterCart', text: 'Water carts keep to the routes and speeds set for haul roads, and do not over-water ramps, corners or intersections where plant could slide.' },
        src('Plan haul roads and plant routes for blind spots, and keep plant away from overhangs and the edges of deep excavations. Ground workers wear high visibility clothing.', MODEL('Excavation work', 's 4.3')),
        src('Where a person could fall from a cut face or batter crest, install barriers or bunds, and set up clear pedestrian detours.', MODEL('Excavation work', 's 4.4')),
        { unless: 'noSpoilGate', text: 'Spoil trucks leave through the site gate under the traffic management plan.' },
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
        'Before new pipework is used, it is pressure tested, purged, and tested for gas identity and purity to the medical gas installer\'s procedure, and it is connected to a live system only under the hospital\'s shutdown or tie-in permit.',
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
        src('Monitor the manifold room atmosphere for oxygen enrichment (above 23.5%, the top of the safe oxygen level) while cylinders are connected or changed, and ventilate the room.', `${WHS('s 51, schedule 19')}; ${QCODE('Welding processes', 's 3.6')}`),
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
        src('Where safety nets are used, they are designed by an engineer or competent person and installed so a person falling into the net will not hit anything below it, as close as possible below the work and within the distance the manufacturer, supplier, engineer or competent person specifies.', WHS('s 306J')),
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
        src('Written notice is given to the regulator at least 5 days before the work starts where the structure, or a load-bearing part of it, is at least 6 m high, where load shifting machinery is used on a suspended floor, or where explosives are used.', WHS('s 142')),
        'Props stay in place until the engineer confirms the new opening and its supports are complete.',
        src('Before the work starts, the principal contractor closes the adjoining area or erects perimeter containment screening where objects could fall.', WHS('s 315H, s 315I')),
      ],
    }],
  },
  {
    when: 'generatorPlant',
    steps: [{
      step: 'Install the generators',
      hazards: ['The generator falls or swings while it is lifted or moved.', 'Diesel exhaust and noise when generators run.', 'The generator starts while someone is working on it.'],
      controls: [
        src('Generators and tanks are lifted into place by the crane company or moved on skates and rollers.', `${WHS('s 219')}; ${QCODE('Hazardous manual tasks', 's 4.4')}`),
        'Keep generators and tanks under control and never move them over people.',
        { unless: 'generatorTest', ...src('The generator\'s connection, changeover switch and switchboard work are electrical work for a licensed electrician, with the supply isolated and proved de-energised first.', ESA('s 55, s 56')) },
        src('Generators are isolated by lock-out before work on them, with automatic starting disabled, and each worker fits their own lock.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
        { ...src('When generators are run for testing, the exhaust is taken outside and the room ventilated so no one breathes diesel exhaust above the exposure standard.', `${WHS('s 49')}; ${QCODE('Managing risks of hazardous chemicals', 's 1.5, s 2.1, s 4.1')}`), unless: 'generatorTest' },
        { ...src('Noise is kept below 85 dB(A) over 8 hours and 140 dB(C) peak, with hearing protection in signposted areas.', WHS('s 56, s 57, s 58')), unless: 'generatorTest' },
      ],
    }, {
      step: 'Install the fuel tanks and fuel lines',
      hazards: ['Fire or explosion from diesel or its vapour.', 'Fuel spills.'],
      controls: [
        { fact: 'safetyDataSheet' },
        src('Work on or near fuel lines is high risk construction work.', WHS('s 291')),
        src('Keep the least practicable quantity of fuel at the work area, keep ignition sources out of hazardous areas, and contain and clean up spills straight away.', WHS('s 53, s 355, s 357')),
      ],
    }],
    ppe: ['earMuffs', 'gloveChemical'],
  },
  {
    when: 'boilerPlant',
    steps: [{
      step: 'Install boilers and pressure vessels',
      hazards: ['Fire or explosion from fuel.', 'Heat stress next to operating plant.'],
      controls: [
        src('Isolate steam, water and fuel by lock-out before work, and release stored pressure.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
        src('No ignition sources are taken into a hazardous area around fuel systems. Work on or near gas or fuel lines is high risk construction work, listed above where it applies.', WHS('s 291, s 355')),
        src('Where other boilers or hot plant in the room stay in operation, the area has artificial extremes of temperature, which makes the work high risk construction work: plan breaks, cool water and limits on time near hot plant.', `${WHS('s 40, s 41, s 291')}; ${QCODE('Hazardous manual tasks', 's 4.6')}`),
        { only: 'gasBoiler', text: 'The gas supply is isolated and the old boiler disconnected, and the new boiler connected, leak tested and commissioned, only by a gas fitter holding the licence or authorisation the appliance needs.' },
      ],
    }, {
      step: 'Commission boilers and pressure vessels',
      hazards: ['Release of steam or pressure.', 'Burns from hot surfaces.'],
      controls: [
        src('Boilers and pressure vessels at hazard level A, B or C have a registered design and are registered items before they are used.', WHS('s 243, s 246, schedule 5')),
        src('Boilers are operated only by a person holding a standard or advanced boiler operation licence as the boiler requires.', WHS('s 81, schedule 3')),
        src('Isolate steam, water and fuel by lock-out before work, and release stored pressure.', MODEL('Managing the risks of plant in the workplace', 's 4.5')),
      ],
    }],
  },
  {
    when: 'asbestosCheck',
    steps: [{
      step: 'Check for asbestos before starting',
      hazards: [{ unless: 'bridgeDemo', text: 'Asbestos in fibro, eaves, wall and floor linings, or vinyl tiles is disturbed and its fibres breathed in.' }, { only: 'bridgeDemo', text: 'Asbestos in the structure or the services it carries is disturbed and its fibres breathed in.' }],
      controls: [
        { fact: 'asbestosArrangement' },
        { ...src('Before refurbishing a house, all asbestos likely to be disturbed is identified, and removed so far as is reasonably practicable before the work starts.', WHS('s 457')), unless: 'structureDemolition', only: 'domesticPremises' },
        { only: 'bridgeDemo', ...src('Before demolition or refurbishment, a competent person identifies any asbestos in the structure, and it is removed so far as is reasonably practicable before the work starts.', WHS('s 451, s 452')) },
        { unless: 'bridgeDemo', ...src('Buildings built before 31 December 1989 are checked for asbestos before demolition or refurbishment. Where there is no asbestos register, a competent person inspects first. Material that cannot be identified, but a competent person believes is asbestos, is treated as asbestos.', WHS('s 422, s 447, s 451')) },
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
        unless: 'noPostHoles',
        step: 'Set out',
        hazards: ['Striking buried power, gas, water or sewer services.', 'Trips over pegs and string lines.'],
        controls: [
          src('Get the underground services information before digging, and locate services on site.', WHS('s 304')),
          'Pegs and string lines are kept clear of walkways and marked so no one trips on them.',
        ],
      },
      {
        unless: 'noPostHoles',
        step: 'Dig post holes',
        hazards: ['Striking buried power, gas, water or sewer services.', 'Strain from digging and lifting posts.'],
        controls: [
          src('Get the underground services information before digging, and locate services on site.', WHS('s 304')),
          src('Use a post hole digger or auger.', `${WHS('s 208')}; ${QCODE('Hazardous manual tasks', 's 4.4')}`),
          'Keep the guards in place, and use two people for hand-held augers.',
          'Barricade open holes until the posts are set.',
        ],
      },
      {
        step: 'Build the deck frame',
        unless: 'deckBoardsOnly',
        hazards: ['A fall from the edge of the deck frame or between joists.', 'Cuts and kickback from saws.', 'Back strain lifting bearers, joists and boards.', 'Timber dust.'],
        controls: [
          { only: 'deckReplace', unless: 'deckBoardsOnly', text: 'The old decking and frame are removed in sections from the edge inwards, with temporary edge protection kept on any open edge and offcuts lowered, not thrown.' },
          { fact: 'fallControl' },
          src('Work from the ground, a platform or a scaffold where possible. Where a person could fall, prevent it with edge protection or work platforms before using fall arrest.', WHS('s 78, s 79, s 306C, s 306D')),
          src('Saws have their guards in place. Cut on a stable bench, not on the deck frame.', WHS('s 208')),
          src('Two people carry long bearers and joists, or use mechanical aids. Rotate kneeling work.', MODEL('Hazardous manual tasks', 's 4.5, s 4.9')),
          src('Keep timber dust below the exposure standard: cut outside or with extraction, and wear a dust mask when cutting treated timber.', WHS('s 49')),
        ],
      },
      {
        step: 'Lay the decking',
        hazards: ['A fall from the edge of the deck frame or between joists.', 'Cuts and kickback from saws.', 'Back strain lifting bearers, joists and boards.', 'Timber dust.'],
        controls: [
          { only: 'deckBoardsOnly', text: 'The old boards are lifted one run at a time with a pinch bar, nails and screws are pulled or cut, and the joists are checked for rot before new boards go down. Open gaps are covered or barricaded when no one is working at them.' },
          { fact: 'fallControl' },
          src('Work from the ground, a platform or a scaffold where possible. Where a person could fall, prevent it with edge protection or work platforms before using fall arrest.', WHS('s 78, s 79, s 306C, s 306D')),
          src('Saws have their guards in place. Cut on a stable bench, not on the deck frame.', WHS('s 208')),
          src('Two people carry long bearers and joists, or use mechanical aids. Rotate kneeling work.', MODEL('Hazardous manual tasks', 's 4.5, s 4.9')),
          src('Keep timber dust below the exposure standard: cut outside or with extraction, and wear a dust mask when cutting treated timber.', WHS('s 49')),
          'Boards are fixed as they are laid, and no one stands on loose boards or steps between joists.',
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
          // The roof edge protection that follows is for the roofing: the truss work has its own, put up first.
          src('Before the first truss is stood, edge protection or a scaffold is in place along the top plate, and trusses are fixed from inside it, with temporary bracing fitted as each truss is placed, to the truss supplier\'s bracing layout.', WHS('s 306D, s 306E')),
          src('Truss bundles are lifted by the crane company, kept under control, never over people, and landed only on supports that can take them.', WHS('s 219')),
          src('No one works below the trusses while they are lifted or placed.', WHS('s 55')),
        ],
      },
    ],
    ppe: ['harness', 'earPlugs', 'glassesClear'],
  },
  {
    when: 'fenceBuild',
    // Digging the post holes and building the fence are separate activities. A repair that
    // sets no new posts has no holes to dig.
    steps: [{
      step: 'Dig post holes',
      only: 'fencePostHoles',
      hazards: ['Striking buried services.', 'Entanglement in a post hole auger.', { unless: 'farmWork', text: 'Neighbours or the public near the work.' }, { only: 'farmWork', text: 'Stock moving into the work area.' }, 'Silica dust, noise and flying particles from cutting and coring.', 'Heat and sun.'],
      controls: [
        src('Get the underground services information before digging, and locate services on site, for example through Before You Dig Australia.', WHS('s 304')),
        src('Augers are used with guards in place and loose clothing secured. Two people handle a two-person auger.', WHS('s 208')),
        { unless: 'farmWork', ...src('Keep the public and neighbours out of the work area with barriers, and cover or fence open holes.', WHS('s 298')) },
        { only: 'farmWork', text: 'Stock are moved out of the paddock or yard, or kept out with a temporary fence, while the work is done, and open holes are covered or fenced.' },
        src('Where posts are set in paving or concrete, core or cut the hole with water suppression or on-tool extraction, as cutting concrete and pavers releases silica dust. Anyone still at risk of exposure wears a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.1, s 7.4.2, s 7.6.1, s 7.6.2')}`),
        src('Assess in writing before drilling or cutting whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation. If it cannot be determined, treat it as a risk to health until that is determined.', WHS('s 529CA')),
        SILICA_FOLLOW_UP[1],
        { only: 'substation', text: 'No one enters the substation or works inside its fence without the network operator\'s access permit and escort, and plant and materials keep the network operator\'s exclusion distances from live equipment.' },
        'Sun protection: hat, long sleeves, sunglasses and SPF 30 or higher sunscreen. Cool drinking water, shade and rest breaks in hot weather.',
      ],
    }, {
      step: 'Build the fence',
      hazards: [{ unless: 'chainWire', text: 'Back strain from posts, sheets and concrete bags.' }, { only: 'chainWire', text: 'Back strain from posts, rails, wire rolls and concrete bags.' }, 'Cement burns.', { unless: 'farmWork', text: 'Neighbours or the public near the work.' }, { only: 'farmWork', text: 'Stock moving into the work area.' }, 'Noise and flying particles from cutting posts, rails and panels.', { only: 'gateWork', text: 'A gate leaf falls or crushes a person.' }, 'Heat and sun.'],
      controls: [
        { only: 'chainWire', text: 'Chain wire is unrolled and tensioned with a strainer and tie wire, with gloves and eye protection, standing clear of the line of the wire while it is under tension.' },
        { unless: 'chainWire', ...src('Use barrows and trolleys for posts, sheets and concrete bags, order smaller bags where possible, and rotate tasks.', QCODE('Hazardous manual tasks', 's 4.4, s 4.7')) },
        { only: 'chainWire', ...src('Use barrows and trolleys for posts, wire rolls and concrete bags, order smaller bags where possible, and rotate tasks.', QCODE('Hazardous manual tasks', 's 4.4, s 4.7')) },
        'Wear waterproof chemical resistant gloves and eye protection when mixing concrete. Wash cement off skin straight away.',
        { unless: 'farmWork', ...src('Keep the public and neighbours out of the work area with barriers, and cover or fence open holes.', WHS('s 298')) },
        { only: 'farmWork', text: 'Stock are moved out of the paddock or yard, or kept out with a temporary fence, while the work is done, and open holes are covered or fenced.' },
        'Cut posts, rails and panels with a drop saw or grinder with its guards in place, with the work clamped, and wear eye and hearing protection.',
        { text: 'Wiring for automatic gate motors is done by a licensed electrician.', only: 'gateMotor' },
        { only: 'steelRails', text: 'Rails welded on site are hot work: a fire extinguisher is at hand, dry grass is cleared or wetted, and the welder wears a welding helmet, gloves and natural fibre clothing.' },
        { only: 'gateWork', text: 'Heavy gate leaves are hung with lifting aids and propped until fixed.' },
        { only: 'poolFence', text: 'While the pool barrier is open or unfinished, the pool is closed off with a temporary barrier, and the gate is checked to self-close and self-latch before handover.' },
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
        { only: 'insulationReplace', text: 'Old insulation is bagged in the roof space and passed down, with a P2 respirator, gloves and long sleeves worn, and droppings and dust handled as waste. Anything that looks like loose-fill asbestos stops the work until it is tested.' },
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
        { unless: 'ewpNamed', ...src('Work from the floor with extendable tools where possible. Where cleaning is near a balcony or open edge, the balustrade or barrier is in place first.', `${WHS('s 78')}; ${MODEL('Managing the risk of falls', 's 4.1, s 4.2')}`) },
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
          src('For licensed removal, the licensed removalist gives the regulator written notice at least 5 days before the work starts.', WHS('s 466')),
          'Isolate the area with barriers and asbestos warning signs.',
          'Do not break, cut, drill or use power tools on the asbestos.',
        ],
      },
      {
        step: 'Remove the asbestos',
        hazards: ['Breathing in asbestos fibres.'],
        controls: [
          { unless: 'friableAsbestos', text: 'Keep the material wet and remove it whole, by hand.' },
          { only: 'friableAsbestos', ...src('Friable asbestos is removed inside an enclosure that is tested for leaks, under negative pressure, using the wet method, with air monitoring by an independent licensed asbestos assessor immediately before the work starts and while it is carried out (negative pressure and the monitoring before the start are not needed where glove bags are used). The enclosure is not dismantled until monitoring shows the fibre level inside it is below 0.01 fibres/ml.', WHS('s 475, s 477')) },
          'Wear disposable coveralls and a respirator rated P2 or higher.',
        ],
      },
      {
        step: 'Bag, label and dispose of asbestos waste',
        hazards: ['Fibres spread beyond the work area.'],
        controls: [
          'Wrap the waste in heavy duty plastic, label it as asbestos waste and take it to a facility licensed to accept it.',
          src('When licensed asbestos removal is finished, a clearance inspection is done by an independent competent person (an independent licensed asbestos assessor where the work needed a Class A licence, as friable asbestos does) before the area is reopened.', WHS('s 473')),
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
          src('Close and sign off the entry permit, confirming everyone has left. Keep the risk assessment until at least 28 days after the work and the permit until the work is complete, or both for at least 2 years after a notifiable incident, available for inspection and to workers on request.', WHS('s 67, s 77')),
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
        src('Where a hoist is used, loads stay within its rated load and under control, landing gates stay closed except while loading, and no one stands under a load being lifted.', WHS('s 219')),
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
        hazards: [{ unless: 'poolOnly', only: 'workBoat', text: 'A fall into the water from the edge, an open bay or the work boat.' }, { only: 'waterNoBoat', text: 'A fall into the water from the edge or an open bay.' }, { only: 'poolOnly', text: 'A fall into the pool.' }, { only: 'deckingWork', text: 'Splinters and cuts.' }, { unless: 'noWaterTools', text: 'Power tool injuries.' }, 'Tools and materials fall into the water.'],
        controls: [
          { unless: 'poolOnly', text: 'Life jackets are worn by anyone who could fall into the water.' },
          { text: 'Open one bay at a time and cover or barricade it.', only: 'deckingWork' },
          { text: 'Wear gloves when handling timber.', only: 'deckingWork' },
          { text: 'A punt, barge or work boat is moored and stable before anyone works from it, is not overloaded, and is run by a competent operator.', only: 'workBoat' },
          { unless: 'noWaterTools', text: 'Use tools with guards in place, and battery tools rather than mains power over the water where practical.' },
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
        unless: 'noSandFill',
        step: 'Sand and fill surfaces',
        hazards: [{ unless: 'steelPaint', text: 'Dust from sanding filler and surfaces.' }, { only: 'steelPaint', text: 'Dust from sanding and wire brushing the steel.' }, 'Lead dust where existing surfaces with old paint are sanded or stripped.'],
        controls: [
          // Part 2 of AS/NZS 4361 is for houses and commercial buildings; industrial steelwork is Part 1.
          { unless: ['wallpaperStrip', 'steelPaint'], text: 'Where existing painted surfaces are sanded or stripped, old paint may contain lead, which is common in paint used before 1970. Test it first, and if it contains lead, follow AS/NZS 4361.2 for removing lead paint.' },
          { only: 'steelPaint', text: 'Where existing painted steel is sanded, wire brushed or blasted, old paint may contain lead or other hazardous pigments. Test it first, and if it does, follow AS/NZS 4361.1 for removing it.' },
          'Sand with dust extraction or wet sanding where possible. Clean up dust with a vacuum, never by dry sweeping.',
          'Wear a P2 respirator and eye protection for dry sanding.',
          { only: 'paintExternal', text: 'Preparation at height is done only once the access and fall protection set out for work at height on the outside of the structure are in place.' },
        ],
      },
      {
        step: 'Paint',
        hazards: ['Paint on the skin or in the eyes.', { unless: 'roofOnlyPaint', text: 'Trips over drop sheets and tins.' }, { only: 'roofOnlyPaint', text: 'Slipping on wet paint or wet roof sheets and falling from the roof.' }],
        controls: [
          // Roof painting: the roof sheets are the surface walked on, so the paint is laid out to keep a dry way off.
          { only: 'roofOnlyPaint', text: 'The roof is cleaned and rust treated to the paint maker\'s instructions before painting. No one walks on the sheets while they are wet from washing, dew or rain.' },
          { only: 'roofOnlyPaint', text: 'Old paint on the roof is tested for lead before it is wire brushed or sanded. If it contains lead, it is removed under the lead paint controls of AS/NZS 4361.' },
          { only: 'roofOnlyPaint', text: 'Painting works back towards the access point, so no one walks on wet paint and a dry path to the access point is kept. Rollers on extension poles keep painters back from the edge.' },
          { only: 'roofOnlyPaint', text: 'Roof sheets are walked on only over the purlin lines, and painting stops in wind, rain or when dew is expected.' },
          src('Wear the gloves and eye protection the safety data sheet lists.', QCODE('Managing risks of hazardous chemicals', 's 4.1, s 4.2')),
          src('Painting is a repetitive task: rotate tasks.', QCODE('Hazardous manual tasks', 's 2.2, s 4.7')),
          { unless: 'roofOnlyPaint', text: 'Tape down drop sheets at their edges, and keep walkways clear of tins and trays.' },
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
      step: 'Apply solvent-based paint',
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
      step: 'Get onto the roof',
      hazards: ['A fall from the ladder or stair while getting onto the roof.'],
      controls: [
        'Access by a scaffold stair, or a ladder secured top and bottom that extends above the landing.',
        'Fall protection is in place and checked before anyone goes onto the roof.',
        'Do not work on the roof in wet, windy or stormy weather.',
      ],
    },
    {
      step: 'Set up roof fall protection',
      hazards: ['Falling from the roof edge or through an opening.', 'Falling through a skylight or fragile roof surface.'],
      controls: [
        { fact: 'fallControl' },
        'Fall protection is in place and checked before anyone goes onto the roof.',
        src('Roof edge protection is erected to the manufacturer\'s instructions: top rail at least 900 mm above the surface, a toe board at least 150 mm high or a bottom rail 150 mm to 250 mm above the surface, and no more than 450 mm between rails, or between the lowest rail and the toe board.', WHS('s 306E')),
        'Skylights, roof openings and any fragile surface are covered with fixed covers that take a fall, or fenced off, before work starts near them.',
        'Do not work on the roof in wet, windy or stormy weather.',
      ],
    },
    {
      unless: 'treeOnRoof',
      step: 'Lift equipment and materials to the roof',
      hazards: ['A load falls onto people below.', 'Strain carrying equipment up ladders.', { unless: 'lightRoofLoad', text: 'Overloading the roof structure.' }],
      controls: [
        { unless: 'lightRoofLoad', text: 'Equipment and materials too heavy or bulky to carry safely are lifted to the roof by crane, hoist or materials lift, never carried up a ladder.' },
        { unless: 'lightRoofLoad', text: 'Where a crane is used, the lift is done under the crane company\'s or principal contractor\'s lift plan, slung and directed by a licensed dogger, with no load passing over people.' },
        // Paint, gutter guard or a flashing goes up by hand line, not by crane.
        { only: 'lightRoofLoad', text: 'Tools, tins and materials are hauled up in a bag or bucket on a hand line, or passed up from a platform, never carried up the ladder in the hands.' },
        'Ballast and insulation boards are moved in small loads with barrows or trolleys, boards are handled by two people, board handling stops in strong wind, and spreading tasks are rotated.',
        'Exclusion zone below the lift and below the roof edge, with barriers and signs.',
        { unless: 'lightRoofLoad', text: 'Heavy equipment and materials are placed only where the roof structure is designed to take them, as the engineer or supplier sets out.' },
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
  // The cut is its own step unless the saw cut concrete step already makes it, or a pothole is patched without cutting.
  steps: [{
    step: 'Saw cut asphalt',
    only: 'asphaltCut',
    hazards: ['Silica dust and noise from saw cutting.', 'Traffic and plant near the work.'],
    controls: [
      src('Saw cut existing asphalt and concrete wet or with dust extraction, with hearing and eye protection. Cutting concrete is processing a crystalline silica substance.', QCODE('Silica', 's 5.1, s 7.4.1, s 7.4.2')),
      ...without(stepOf('coreDrill', 'Core drill through the slab or wall').controls, /falling core|Cover or barricade the hole|Drilling concrete is processing/).filter((item) => !item.fact),
      'The saw works inside the traffic management or barriers set out for the work.',
    ],
  }, {
    step: 'Reinstate asphalt',
    hazards: ['Burns from hot asphalt.', 'Fumes from hot asphalt and bitumen.', 'Traffic and plant near the work.'],
    controls: [
      'Hot asphalt is handled with long sleeves, gloves and boots, and kept away from other workers. Work upwind of the fumes where possible.',
      'Any roller or truck works inside the traffic management or barriers set out for the work, with a spotter when reversing.',
      { only: 'potholeRepair', text: 'Use a plate compactor or small roller to compact the patch in layers, with its guards in place and hearing protection worn.' },
    ],
  }],
  ppe: ['earMuffs', 'gloveGeneral', 'gloveWelding', 'p2', 'glassesClear'],
});

// Installing glasswool or other mineral fibre insulation.
addAfter('plasterSheets', {
  when: 'insulation',
  steps: [{
    step: 'Install insulation',
    hazards: ['Skin, eye and throat irritation from glasswool fibres.', { only: 'subfloorInsul', text: 'Working in a cramped subfloor: strain, cables, snakes and spiders.' }, { only: 'ceilingInsulation', text: 'Strain working overhead.' }, { only: 'ceilingInsulation', text: 'Electric shock from damaged or live cables and fittings in the ceiling space.' }, { only: 'ceilingInsulation', text: 'A fall through the ceiling.' }, { only: 'ceilingInsulation', text: 'Heat stress in the roof space.' }],
    controls: [
      { only: 'subfloorInsul', text: 'The subfloor is checked for room, cables, pipes, snakes and spiders before going in. Batts or boards are fitted between the joists from below with supports or clips, and anyone working under the house has a second person outside. The space is treated as a confined space only if it meets the definition.' },
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
      'Painted steel is checked for lead before it is flame cut. Where the paint may contain lead, it is stripped back from the cut line first, or the cutting is done as lead risk work with the controls the state\'s lead rules require.',
      ...without(brazing.controls, /Mark hot pipe|Hot work at height or in risers/),
      'Remove or cover combustible materials where sparks and slag can reach them, including on the floor below.',
      'A fire watch is kept during the cutting and for the time the hot work permit sets after it stops.',
      'Wear filter eye protection rated for gas cutting, fire-resistant gloves and natural fibre clothing.',
      { only: 'cutRemove', text: 'Sections are cut to a size that plant or two people can handle, supported or slung before the last cut, and lowered under control, never dropped.' },
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
      ...without(coring.controls, /falling core|Cover or barricade the hole/).map((item) => (/^Drilling concrete is processing/.test(typeof item === 'string' ? item : item.text || '') ? { unless: 'grindOnly', ...(typeof item === 'string' ? { text: item } : item) } : item)),
      { only: 'grindOnly', ...src('Grinding concrete is processing a crystalline silica substance, controlled by on-tool extraction or wet methods.', WHS('s 529B, s 529C')) },
      { unless: ['grindOnly', 'pavementDrill'], text: 'Scan or check drawings for hidden services and reinforcement before drilling into walls and slabs.' },
      // A road or car park has no walls: the pavement is what is drilled.
      { only: 'pavementDrill', unless: 'grindOnly', text: 'Scan or check drawings for hidden services and reinforcement before drilling into the pavement or slab.' },
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
    step: 'Remove trees',
    unless: 'stumpOnly',
    hazards: [{ unless: 'stumpOnly', text: 'A tree or limb falls on a person.' }, { unless: 'stumpOnly', text: 'Chainsaw cuts and kickback.' }, 'Striking services or overhead power lines.', { unless: 'stumpOnly', text: 'Noise from chainsaws and stump grinders.' }],
    controls: [
      { unless: 'stumpOnly', text: 'Where trees are felled, they are felled from the ground only by competent chainsaw operators, with a plan for the direction of fall. A tree that must be dismantled at height is done by an arborist under their own SWMS.' },
      { unless: 'stumpOnly', text: 'Keep an exclusion zone around felling of at least twice the height of the tree, and around any work under a tree being cut.' },
      { unless: 'stumpOnly', text: 'Check for overhead power lines and buried services before felling or grinding. Work near power lines only under the network operator\'s requirements.' },
      { unless: 'stumpOnly', text: 'Chainsaws have a working chain brake and are refuelled only when stopped and cool. Operators wear chainsaw chaps or trousers, a helmet with face shield, and hearing protection.' },
    ],
  }, {
    step: 'Remove stumps and roots',
    hazards: ['Stump grinder debris.', 'Striking services or overhead power lines.', { unless: 'stumpOnly', text: 'Noise from chainsaws and stump grinders.' }],
    controls: [
      { unless: 'stumpOnly', text: 'Check for overhead power lines and buried services before felling or grinding. Work near power lines only under the network operator\'s requirements.' },
      { only: 'stumpOnly', text: 'Check for buried services before grinding or digging out the stump.' },
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
      { unless: 'fromMeter', text: 'Connections to the water authority\'s main are made only with its approval, and by it where it requires.' },
      { unless: 'meterInstall', text: 'The supply is isolated at the valve, locked or tagged so it cannot be opened, and depressurised and drained before cutting in.' },
      { unless: 'meterInstall', text: 'New pipework is restrained and supported before it is charged, and charged slowly with air released.' },
      { unless: 'mainRepair', only: 'notMeter', text: 'Backflow prevention is installed and tested as the plumbing approval requires, before the supply is used.' },
    ],
  }],
  ppe: ['gloveGeneral'],
});

// Standing door frames and hanging doors.
addAfter('carpJoinery', {
  when: 'doorHang',
  // Standing frames and hanging doors are separate activities, often at different stages.
  // Frames come unless the task only hangs doors; doors unless it only stands frames.
  steps: [{
    step: 'Stand the door frames',
    only: 'doorFrames',
    unless: 'autoDoorsOnly',
    hazards: ['A door or frame falls on a person.', 'Silica dust from drilling masonry for fixings.', 'Power tool injuries.'],
    controls: [
      'Frames are fixed or braced as soon as they are stood, and doors are wedged or propped until hung.',
      src('Drill masonry and concrete for frame fixings with on-tool dust extraction, and wear a fit tested P2 respirator where dust remains.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`),
      ...SILICA_FOLLOW_UP,
      'Adhesives, sealants and sealers are used as their safety data sheets set out, with good ventilation and gloves resistant to the product.',
      'Use power tools with guards in place, with eye and hearing protection.',
    ],
  }, {
    step: 'Hang the doors',
    only: 'doorLeaves',
    hazards: ['Strain handling heavy doors.', 'A door or frame falls on a person.', { only: 'autoDoorsOnly', text: 'Silica dust from drilling masonry for fixings.' }, 'Power tool injuries.'],
    controls: [
      'Heavy doors are moved on door trolleys and hung with a door lifter or by two people.',
      'Frames are fixed or braced as soon as they are stood, and doors are wedged or propped until hung.',
      // Automatic door operators and tracks are drilled into the head and walls.
      { only: 'autoDoorsOnly', ...src('Drill masonry and concrete for frame fixings with on-tool dust extraction, and wear a fit tested P2 respirator where dust remains.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`) },
      ...SILICA_FOLLOW_UP.map((item) => ({ only: 'autoDoorsOnly', ...(typeof item === 'string' ? { text: item } : item) })),
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
      step: 'Set out',
      unless: 'slabRepair',
      hazards: ['Striking underground services.', 'Trips over pegs and string lines.'],
      controls: [
        { ...src('Get the current underground services information before digging, and locate services on site, for example through Before You Dig Australia.', WHS('s 304')), unless: 'trench' },
        'Pegs and string lines are kept clear of walkways and marked so no one trips on them.',
      ],
    },
    {
      step: 'Prepare the ground',
      hazards: ['Striking underground services.', { unless: 'smallPour', text: 'Plant strikes a person.' }, { unless: ['slabRepair', 'crossover'], text: 'An excavation for edge beams, footings or thickened edges collapses, or a person falls in.' }, 'Dust, noise and vibration from compaction.'],
      controls: [
        { ...src('Get the current underground services information before digging, and locate services on site, for example through Before You Dig Australia.', WHS('s 304')), unless: 'trench' },
        { unless: 'smallPour', text: 'Excavators, bobcats and rollers are run by competent operators, checked before each shift, with an exclusion zone and a spotter where people work nearby.' },
        { unless: ['kerbWork', 'slabRepair', 'crossover'], ...src('Boxing out, thickened edges, edge beams and footings are dug no deeper than needed, and battered or benched where the ground needs it.', WHS('s 305')) },
        // A crossover is boxed out to the council's levels: it has no edge beams or footings.
        { only: 'crossover', ...src('The crossover is boxed out no deeper than the council\'s detail needs, and battered where the ground needs it.', WHS('s 305')) },
        // A patch repair digs only the base under the broken-out section.
        { only: 'slabRepair', text: 'The base under each broken-out section is trimmed and compacted with a plate compactor, and topped up with road base where needed, no deeper than the repair needs.' },
        // Where this SWMS has the trench steps, deeper trenches are covered by them.
        { ...src('A trench or shaft deeper than 1.5 m is high risk construction work this SWMS does not cover: stop and have the SWMS reviewed before anyone enters it.', WHS('s 291')), unless: ['trench', 'slabRepair'] },
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
      unless: ['kerbWork', 'repairNoReo'],
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
      step: 'Finish the concrete',
      hazards: [{ unless: 'smallPour', text: 'Power trowel injuries.' }, 'Carbon monoxide from petrol plant used where exhaust can collect.', 'Knee and back strain finishing edges.'],
      controls: [
        { unless: 'smallPourOrKerb', text: 'Power trowels have their guards in place and a working stop switch that cuts out when released, and are never left running unattended.' },
        { unless: 'smallPour', text: 'Petrol trowels, saws and generators run only outdoors or where exhaust cannot collect.' },
        src('Hearing protection where noise exceeds the exposure standard, such as near saws, power trowels and compactors. Workers who must wear it have hearing tests within 3 months of starting and at least every 2 years.', WHS('s 57, s 58')),
        'Use knee pads and kneeling boards for edge finishing, and rotate tasks.',
      ],
    },
    {
      step: 'Saw cut the joints',
      only: 'slabJointCut',
      hazards: [{ only: 'jointSaw', text: 'Silica dust and noise from saw cutting joints.' }, { unless: 'jointSaw', text: 'Silica dust where concrete is cut or drilled.' }, 'Carbon monoxide from petrol plant used where exhaust can collect.'],
      controls: [
        src('Where control joints are saw cut, or concrete is cut or drilled, it is done wet or with on-tool extraction. This is processing a crystalline silica substance. Anyone still at risk of exposure wears a fit tested P2 respirator.', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 5.1, s 7.4.1, s 7.4.2, s 7.6.1, s 7.6.2')}`),
        src('Before any saw cutting or drilling, assess in writing whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely only on the dust controls used for the processing, such as wet methods, extraction or isolation.', WHS('s 529CA')),
        SILICA_FOLLOW_UP[1],
        src('Where it is uncertain whether dust is below the exposure standard, monitor the air.', WHS('s 50')),
        src('Health monitoring is provided for workers at significant risk from crystalline silica.', `${WHS('s 368, schedule 14')}; ${QCODE('Silica', 's 10, s 10.1')}`),
        'Concrete saws have their blade guards in place, and electric saws used wet are protected by an RCD, with leads kept out of water.',
        { unless: 'smallPour', text: 'Petrol trowels, saws and generators run only outdoors or where exhaust cannot collect.' },
        src('Hearing protection where noise exceeds the exposure standard, such as near saws, power trowels and compactors. Workers who must wear it have hearing tests within 3 months of starting and at least every 2 years.', WHS('s 57, s 58')),
      ],
    },
    {
      step: 'Cure the concrete',
      hazards: ['Chemicals in curing compounds and sealers.'],
      controls: [
        'Curing compounds and sealers are used as their safety data sheets set out, with chemical resistant gloves and eye protection.',
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
  { area: 'Body', items: [['siteClothing', 'Clothing to the site rules (sleeves and pants as the principal contractor requires)'], ['longs', 'Long sleeves and long pants'], ['sleevesShorts', 'Long sleeves, shorts allowed'], ['hivis', 'Hi-vis, day'], ['hivisNight', 'Hi-vis, day and night'], ['coveralls', 'Disposable coveralls'], ['chaps', 'Chainsaw chaps or trousers'], ['arcRated', 'Arc-rated face shield and flame-resistant clothing']] },
  { area: 'Knees', items: [['kneePads', 'Knee pads']] },
  { area: 'Feet', items: [['boots', 'Safety boots'], ['gumboots', 'Safety gumboots']] },
  { area: 'Sun', items: [['sunscreen', 'Sunscreen']] },
  { area: 'Falls and water', items: [['harness', 'Full body harness'], ['lifeJacket', 'Life jacket']] },
];

// Sleeves and pants follow the site's rules unless the work needs long clothing (hot work, chemicals, silica).
const SITE_MINIMUM = ['hardHat', 'glassesClear', 'gloveGeneral', 'siteClothing', 'hivis', 'boots'];
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
    // A line reworded for another state keeps only sources that still fit it: none for Queensland-only law.
    const line = localControl(control.text, control.source, cite);
    return line == null ? [] : [line];
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
          'Skylights and fragile roof sheets near the work are covered with fixed covers or fenced off before work starts near them.',
          { fact: 'fallControl' },
          // The roof lifting step already says nothing heavy is carried up a ladder.
          'Panels are lifted with a materials hoist, panel lifter, ladder lift or crane.',
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
          { only: 'solarArray', text: 'Array conductors are treated as live in daylight. Connectors stay apart until the final connection, panels are covered with an opaque cover where their conductors must be worked on, and DC connectors are never pulled apart under load: the DC isolator is opened first.' },
          { only: 'inverterReplace', text: 'The old inverter is isolated on both its AC and DC sides, and the DC isolators locked off, before it is disconnected and removed. The new inverter is mounted to the manufacturer\'s instructions and AS/NZS 4777.1 on a wall that can carry it.' },
          { only: 'solarArray', unless: 'inverterReplace', text: 'The array, inverter and isolators are installed to AS/NZS 5033, AS/NZS 4777.1 and the manufacturers\' instructions, with the required signs fitted.' },
          { only: 'inverterMount', unless: ['solarArray', 'inverterReplace'], text: 'The inverter is mounted to the manufacturer\'s instructions and AS/NZS 4777.1 on a wall or frame that can carry it, before any cable is terminated.' },
          // The battery step already keeps its own terminals covered until the final connection.
          { unless: ['solarArray', 'batteryStorage'], text: 'Battery and inverter terminals stay covered, and the isolators open, until the final connection, which is made with insulated tools.' },
          { only: 'batteryStorage', unless: 'solarArray', text: 'Inverter terminals stay covered, and its isolators open, until the final connection, which is made with insulated tools.' },
          // Testing before connection is the testing and commissioning step's, where there is one.
          { unless: 'commissioning', text: 'The system is tested before it is connected, and is not connected to the grid until the distribution entity has approved the connection.' },
          { only: 'commissioning', text: 'The system is not connected to the grid until the distribution entity has approved the connection.' },
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
      step: 'Have the supply disconnected',
      hazards: ['Electric shock and arc flash at the service fuse and consumer mains.'],
      controls: [
        'The supply is disconnected at the service fuse or pole by the distribution entity or a person it authorises, and the meters are removed by the distribution entity or the metering provider, before anyone works on the meter box or its panel.',
        'The consumer mains are tested de-energised before work starts, and the board is treated as live until they are.',
      ],
    }, {
      step: 'Replace the meter box and consumer mains connection',
      hazards: ['Electric shock and arc flash: the consumer mains and service fuse stay live until the distribution entity disconnects them.', 'Asbestos in an older meter panel.', 'A fall from a ladder at the meter box.'],
      controls: [
        'Electrical work is done only by a licensed electrical worker.',
        'Meters are removed, moved or refitted only by the distribution entity or the metering provider, or a person they authorise.',
        { unless: 'asbestosNamed', text: 'An older meter panel is treated as containing asbestos unless it has been tested. It is removed whole, without drilling, cutting or breaking it, under the asbestos arrangement in this SWMS, and disposed of as asbestos waste.' },
        { unless: 'asbestosNamed', ...src('If asbestos cement is found or suspected, work on it stops. High-pressure water and compressed air are never used on it, and power tools only where their use is controlled; the work follows the asbestos rules.', WHS('s 446')) },
        src('The consumer mains and main switchboard are not connected for the first time until the distribution entity has examined them, confirmed there are no serious defects and tested them.', ESR('s 217, s 218')),
        src('Issue the certificate of testing and safety, and give the distribution entity the notice of test where it must examine or test the installation.', ESR('s 208, s 228')),
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
          'The gas supply is turned off at the meter or appliance isolating valve before any connection is made.',
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
    // One step per activity: fascia (carpenter or roof plumber), gutters and downpipes (roof
    // plumber), and eaves linings (carpenter). Each comes when the task names it, and gutters
    // and downpipes when it names none of them.
    steps: [{
      step: 'Fix the fascia',
      only: 'fasciaWork',
      hazards: ['A fall from the eaves edge or a ladder.', 'Cuts from sheet metal edges.', 'Metal gutters or ladders touching the overhead service line to the building.', 'Strain handling long lengths.'],
      controls: [
        { fact: 'fallControl' },
        'Work at the eaves is done from a scaffold, mobile scaffold or EWP.',
        src('Single or extension ladders are used for access, with 3 points of contact, or for permitted work only: nothing carried that restricts movement or balance, the body centred between the stiles, and tools used with one hand. Where a person could fall 2 m or more (3 m in housing construction), the worker keeps 3 limbs on the ladder or uses a pole strap or a harness not attached to the ladder, and the ladder is secured at the top or bottom. Ladders are industrial and rated for at least 120 kg.', WHS('s 306A, s 306K, s 306L, s 306M')),
        'Before work, find the overhead service line to the building. Keep ladders and long metal lengths well clear of it, and ask the distribution entity to cover or disconnect it where the work is close.',
        'Cut-resistant gloves are worn for sheet metal, and cut edges are deburred.',
        'Long lengths are carried by two people.',
      ],
    }, {
      step: 'Install gutters and downpipes',
      only: 'gutterWork',
      hazards: ['A fall from the eaves edge or a ladder.', 'Cuts from sheet metal edges.', 'Metal gutters or ladders touching the overhead service line to the building.', 'Strain handling long lengths.'],
      controls: [
        { fact: 'fallControl' },
        'Gutter and downpipe lengths are passed up to the platform by two people or lifted with a rope or hoist, not carried up a ladder.',
        'Work at the eaves is done from a scaffold, mobile scaffold or EWP.',
        src('Single or extension ladders are used for access, with 3 points of contact, or for permitted work only: nothing carried that restricts movement or balance, the body centred between the stiles, and tools used with one hand. Where a person could fall 2 m or more (3 m in housing construction), the worker keeps 3 limbs on the ladder or uses a pole strap or a harness not attached to the ladder, and the ladder is secured at the top or bottom. Ladders are industrial and rated for at least 120 kg.', WHS('s 306A, s 306K, s 306L, s 306M')),
        'Before work, find the overhead service line to the building. Keep ladders and long metal lengths well clear of it, and ask the distribution entity to cover or disconnect it where the work is close.',
        'Cut-resistant gloves are worn for sheet metal, and cut edges are deburred.',
        'On a building built before 2004 (asbestos products were used until the national ban at the end of 2003), fibre cement eaves linings, gutters and downpipes are treated as asbestos unless tested, and are not cut, drilled or broken until they have been.',
        src('If asbestos cement is found or suspected, work on it stops. High-pressure water and compressed air are never used on it, and power tools only where their use is controlled; the work follows the asbestos rules.', WHS('s 446')),
        'Long lengths are carried by two people.',
      ],
    }, {
      // The eave lining repair kind has its own step for the linings.
      step: 'Install the eaves linings',
      only: 'eavesLiningWork',
      unless: 'eaveLining',
      hazards: ['A fall from the eaves edge or a ladder.', 'Metal gutters or ladders touching the overhead service line to the building.', 'Dust from cutting fibre cement sheet.'],
      controls: [
        { fact: 'fallControl' },
        'Work at the eaves is done from a scaffold, mobile scaffold or EWP.',
        'Before work, find the overhead service line to the building. Keep ladders and long metal lengths well clear of it, and ask the distribution entity to cover or disconnect it where the work is close.',
        'On a building built before 2004 (asbestos products were used until the national ban at the end of 2003), fibre cement eaves linings, gutters and downpipes are treated as asbestos unless tested, and are not cut, drilled or broken until they have been.',
        src('If asbestos cement is found or suspected, work on it stops. High-pressure water and compressed air are never used on it, and power tools only where their use is controlled; the work follows the asbestos rules.', WHS('s 446')),
        'New fibre cement eaves linings are cut by scoring and snapping or with shears, or with a saw with on-tool extraction and a fit tested P2 respirator. They are never dry cut without extraction.',
      ],
    }],
    ppe: ['gloveCut', 'sunHat', 'sunscreen'],
  },
  {
    when: 'skylight',
    steps: [{
      step: 'Cut in and install the skylight',
      hazards: [{ unless: 'skylightRepair', text: 'A fall through the roof opening while the skylight is out.' }, { only: 'skylightRepair', text: 'A fall through a damaged skylight, or through the opening while it is out.' }, 'A fall from the roof edge.', { unless: 'openRoofSpace', text: 'Live cables and heat in the roof space.' }, { unless: ['tiledRoof', 'skylightRepair'], text: 'Sparks and sharp edges when cutting roof sheet.' }, { only: 'skylightRepair', text: 'Cuts from broken glass or polycarbonate.' }],
      controls: [
        { fact: 'fallControl' },
        { unless: 'skylightRepair', ...src('The opening is covered as soon as it is cut, with a cover strong enough to take anyone who could fall onto it, securely fixed so it cannot be moved or removed by accident, and marked as covering a hole.', `${WHS('s 306F')}; ${MODEL('Managing the risk of falls', 's 4.2')}`) },
        // A damaged skylight is taken out and replaced in its existing opening: nothing is cut.
        { only: 'skylightRepair', text: 'Each damaged skylight is fenced off, or covered with a fixed cover that takes a fall, from the time anyone is on the roof until it is replaced.' },
        { only: 'skylightRepair', ...src('While the old skylight is out, the opening is covered with a cover strong enough to take anyone who could fall onto it, securely fixed so it cannot be moved or removed by accident, and marked as covering a hole.', `${WHS('s 306F')}; ${MODEL('Managing the risk of falls', 's 4.2')}`) },
        { unless: ['tiledRoof', 'skylightRepair'], text: 'Before the sheet is cut, safety mesh is confirmed under it, or the opening is guarded or the worker uses travel restraint, until the cover or the skylight is in.' },
        { unless: ['tiledRoof', 'skylightRepair'], text: 'Roof sheet is cut with nibblers or snips where possible, not a grinder, to avoid sparks and hot swarf.' },
        { only: 'tiledRoof', text: 'Tiles are lifted off and stacked on the roof battens away from the edge.' },
        { only: 'skylightRepair', text: 'The broken skylight is unfixed and lifted out only when its replacement is ready to go in, and broken glass or polycarbonate is bagged, not dropped.' },
        'A finished skylight without a mesh guard is a fragile surface. It is marked, and no one walks on or leans on it.',
        { unless: ['roofSpace', 'openRoofSpace'], text: 'In the roof space, cables are treated as live, workers stand only on joists or crawl boards, and roof space work is kept short in hot weather.' },
        { unless: ['tiledRoof', 'skylightRepair'], text: 'An older roof is checked for asbestos cement before it is cut.' },
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
      only: 'meshStep',
      step: 'Install safety mesh',
      hazards: ['A fall between purlins before the mesh is fixed.', 'A fall from the roof edge.', 'Mesh that is badly fixed or lapped fails under a falling person.'],
      controls: [
        { fact: 'fallControl' },
        'Safety mesh to AS/NZS 4389 is run out from a protected edge, and fixed, lapped and tensioned over the purlins to the manufacturer\'s details.',
        'A competent person checks the mesh before any sheet goes on, and damaged mesh is replaced.',
        'Mesh does not protect against a fall from the edge: edge protection stays in place.',
      ],
    }, {
      only: 'meshSarkingStep',
      step: 'Install sarking',
      hazards: ['A fall from the roof edge.', 'A fall through the sarking between purlins.'],
      controls: [
        { fact: 'fallControl' },
        'Sarking is laid only over mesh that is already fixed. No one stands on sarking between purlins.',
        'Sarking is run out and fixed as it is laid, and is not rolled out in strong wind.',
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
        { unless: 'solarHotWaterRoof', text: 'The water connections are plumbing work for a licensed plumber.' },
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
      step: 'Install the rainwater tank',
      unless: 'tankPumpOnly',
      hazards: ['Strain or crushing moving a large tank.', 'An empty tank blown over by wind.', 'Striking services when digging the base or pipes.', 'A tank entered by a worker is a confined space.'],
      controls: [
        { unless: 'tankStand', text: 'The tank sits on a base built to the tank supplier\'s specification.' },
        'Empty tanks are moved by enough people or with a lifting aid, and tied down when wind is forecast.',
        src('Get the current underground services information, for example through Before You Dig Australia, locate services on site before digging, and work to it.', WHS('s 304')),
        'Connecting the tank to the building\'s water service or fixtures, such as toilets and the laundry, is plumbing work for a licensed plumber. A mains top-up has the backflow prevention the plumbing rules require.',
        'No one enters the tank. Work inside a tank is confined space work under its own permit and SWMS.',
      ],
    }, {
      step: 'Install the pump',
      only: 'tankPump',
      hazards: ['Electric shock from the pump connection.', 'A tank entered by a worker is a confined space.'],
      controls: [
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
      hazards: ['The cut face behind the wall collapses onto a worker.', 'The wall fails if it is built higher or loaded more than it was designed for.', 'Striking services when digging.', { only: 'timberWall', text: 'Strain handling sleepers and posts.' }, { only: 'blockWall', text: 'Strain handling blocks.' }, { only: 'stoneRetaining', text: 'Strain and crushed hands handling stones.' }, { only: 'timberWall', text: 'Dust from cutting treated timber.' }, { only: 'blockWall', text: 'Silica dust from cutting blocks.' }, { only: 'stoneRetaining', text: 'Silica dust from cutting or splitting stone.' }],
      controls: [
        { only: 'wallRepair', unless: 'collapsedWall', text: 'A failed wall is propped, or the area below it fenced off, until it is taken down from the top. It is never undermined, and no one works on its low side while it is unstable.' },
        'A wall over 1 m high, within 1.5 m of a building or another retaining wall, or with a load near the top such as a driveway or sloping ground, is built to an engineer\'s design and any building approval it needs.',
        src('Get the current underground services information before digging, and work to it.', WHS('s 304')),
        'The cut face is battered back or benched, or excavated in short lengths. No one works between an unsupported cut face and the wall where the face could fall on them.',
        { unless: 'noWallBackfill', text: 'Drainage and backfill are placed as the design shows, and backfill is compacted in layers.' },
        { only: 'timberWall', text: 'Sleepers and posts are team lifted or moved by machine.' },
        { only: 'concreteSleeper', text: 'Steel posts are set in concrete in post holes dug after services are located, and concrete sleepers are lifted in by machine or two people with lifting clamps, never dropped into the posts.' },
        { only: 'blockWall', text: 'Blocks are team lifted or moved by machine, and stacked close to the work.' },
        { only: 'stoneRetaining', text: 'Large stones are placed with the excavator, with no one between the stone and the wall or within reach of the bucket. Smaller stones are team lifted, with gloves on and fingers kept clear as each stone is set down.' },
        { only: 'timberWall', text: 'Treated timber is cut outside with dust extraction or a P2 respirator, and hands are washed before eating.' },
        { only: 'blockWall', text: 'Blocks are cut with a wet saw or a saw with on-tool extraction, never dry cut without extraction, and the cutter wears a fit tested P2 respirator.' },
        { only: 'stoneRetaining', ...src('Stone is cut with a wet saw or a saw with on-tool extraction, or split by hand, never dry cut without extraction, and the cutter wears a fit tested P2 respirator. Cutting stone with a power tool is processing a crystalline silica substance.', `${WHS('s 529A, s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.1, s 7.4.2, s 7.6.1, s 7.6.2')}`) },
        { unless: 'timberOnlyWall', ...SILICA_FOLLOW_UP[0] },
        { unless: 'timberOnlyWall', ...SILICA_FOLLOW_UP[1] },
      ],
    }],
    ppe: ['p2', 'gloveGeneral'],
  },
  {
    when: 'kitStructure',
    steps: [{
      step: 'Erect the frame',
      hazards: ['The frame collapses before it is braced.', 'A fall from the frame or roof.', 'Striking services when digging footings.', { only: 'timberFrame', text: 'Cuts, kickback and dust from sawing timber.' }, { only: 'timberFrame', unless: 'cubbyHouse', text: 'Nail gun injuries.' }],
      controls: [
        { fact: 'fallControl' },
        src('Get the current underground services information before digging, and work to it.', WHS('s 304')),
        { only: 'kitBuild', text: 'Footings are dug and poured to the kit supplier\'s or engineer\'s details. Open holes are covered or fenced.' },
        { unless: 'kitBuild', text: 'Footings are dug and poured to the engineer\'s or supplier\'s details. Open holes are covered or fenced.' },
        // A timber structure is cut and fixed on site.
        { only: 'timberFrame', unless: 'cubbyHouse', text: 'Posts, beams and rafters are cut with a drop saw or circular saw with its guard in place and the work clamped, and fixed with a nail gun on single shot or with screws, never with a hand in line with the nail.' },
        { only: 'kitBuild', text: 'Posts are stood, plumbed and braced, and the frame is braced to the kit instructions before roof sheets go on.' },
        { unless: ['kitBuild', 'noRoofSheets'], text: 'Posts are stood, plumbed and braced, and the frame is braced to the engineer\'s or supplier\'s details before roof sheets go on.' },
        // A cubby house is a small building of its own: floor, walls, roof and cladding, all reached from the ground.
        { only: 'shadeFabric', text: 'Posts are stood, plumbed and braced, and the frame is braced to the engineer\'s or supplier\'s details before the fabric goes on.' },
        { only: 'openPergola', text: 'Posts are stood, plumbed and braced, and the beams and rafters are fixed and braced to the engineer\'s or supplier\'s details before the bracing is taken off.' },
        { only: 'roofOverDeck', text: 'Posts stand on their own footings, or on the deck frame only where the engineer or supplier confirms it can take the load. Posts are stood, plumbed and braced, and the beams and rafters are fixed and braced to the engineer\'s or supplier\'s details before the roof sheets go on.' },
        { only: 'roofOverDeck', text: 'Beams and rafters are lifted into place by two people or with a lifting aid, and fixed from platform ladders or a mobile scaffold on the deck, not from the deck rails.' },
        { only: 'cubbyHouse', text: 'The floor frame is set level on its footings and the floor is laid before the walls go up. Wall frames are stood one at a time and fixed and braced to each other as they go up.' },
        { only: 'cubbyHouse', text: 'Timber is cut with a drop saw or circular saw on a stable bench, with the guard in place, and dust is kept down with extraction or by cutting outdoors. Treated timber offcuts are bagged, not burnt.' },
        { unless: ['standaloneStructure', 'cubbyHouse'], text: 'Where the structure is fixed to an existing building, the fascia, wall or slab is checked as able to take the load, to the supplier\'s or engineer\'s details.' },
      ],
    }, {
      // A roof over a deck is sheeted in the roofing steps, and an open pergola has no roof.
      step: 'Fix the roof',
      only: 'kitRoof',
      hazards: ['A fall from the frame or roof.', { unless: 'noRoofSheets', text: 'Roof sheets caught by the wind.' }, { only: 'shadeFabric', text: 'The shade fabric is caught by the wind, or a fitting under tension lets go.' }],
      controls: [
        { fact: 'fallControl' },
        { only: 'shadeFabric', text: 'The shade fabric is fixed and tensioned to the supplier\'s details from platform ladders or an EWP, never in strong wind, with no one in line with a fitting while it is tensioned.' },
        { only: 'cubbyHouse', text: 'Roof framing, roofing and cladding are fixed from the floor, a platform ladder or trestles, never from the top of the wall frames.' },
        { only: 'roofExtension', text: 'Where the new roof ties into the existing roof, the existing roof is walked only on its purlin lines with fall protection, and the junction is flashed to the manufacturer\'s details.' },
        { unless: 'noRoofSheets', text: 'Roof sheets are fixed from a scaffold, platform or EWP, and not handled in strong wind.' },
        { only: 'cubbyHouse', text: 'The finished cubby house is checked for splinters, protruding fixings, sharp edges and finger traps before it is handed over.' },
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
        { unless: 'slateRoof', text: 'Walk only on the lower part of each tile, over the batten, or on roof ladders or boards that spread the load. Wet, mossy or broken tiles are not walked on.' },
        { only: 'slateRoof', text: 'Slates are never walked on. Work is done from roof ladders hooked over the ridge, or from a scaffold at the eaves.' },
        // The valley and skylight steps say how their own tiles are lifted, stacked and cut.
        { unless: 'tileStackElsewhere', text: 'Tiles stacked on the roof are spread along the battens so they cannot slide, and the area below is fenced off.' },
        { only: 'tileDrill', ...src('Drill with on-tool extraction. Anyone still at risk of exposure wears a fit tested respirator (P2 or better).', `${WHS('s 529B, s 529C')}; ${QCODE('Silica', 's 7.4.2, s 7.6.1, s 7.6.2')}`) },
        { unless: ['tileRoofStrip', 'valleyRepair'], text: 'Tiles are cut with a wet saw or a saw with on-tool extraction, never dry cut without extraction.' },
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
        hazards: [{ unless: 'sandstone', text: 'Injection injury from the high-pressure jet.' }, { only: 'sandstone', text: 'Injection injury from the pressure washer jet.' }, { only: 'sandstone', text: 'Breathing dust or spray from the stone.' }, 'Slips on wet surfaces.', 'Electric shock where water meets leads and connections.', 'Run-off of dirty water into stormwater drains.'],
        controls: [
          'The lance is never pointed at anyone, the trigger lock is on whenever the operator is not spraying, and the operator is trained in the machine. An injection injury is a medical emergency, even if it looks minor.',
          'Electric machines and leads are on an RCD, and plugs and connections are kept out of the water.',
          'Wastewater is kept out of stormwater drains: bunded, collected and disposed of as the local council requires.',
          // Stone walls are not asbestos cement.
          { unless: 'stoneSurface', ...src('If asbestos cement is found or suspected, work on it stops. High-pressure water and compressed air are never used on it, and power tools only where their use is controlled; the work follows the asbestos rules.', WHS('s 446')) },
          { unless: 'confined', text: 'The work area is closed to the public, and wet surfaces are signed.' },
          { only: 'sandstone', ...src('Sandstone contains crystalline silica. It is cleaned wet at low pressure, never with a high-pressure water blaster, abrasive blasting or dry brushing, and the slurry is collected before it dries. Anyone exposed to spray or dust wears a fit tested P2 respirator.', QCODE('Silica', 's 5.1, s 5.2, s 8.1')) },
        ],
      },
      {
        step: 'Apply sealers to concrete, pavers or timber',
        only: 'sealing',
        hazards: ['Fire from solvent vapour.', 'Breathing sealer vapour.', 'Slips on wet sealer.'],
        controls: [
          { fact: 'safetyDataSheet' },
          { unless: 'outdoorSeal', ...src('Ventilate when using solvent sealers, especially in small or enclosed rooms, and keep ignition sources away.', `${WHS('s 351, s 355')}; ${QCODE('Managing risks of hazardous chemicals', 's 4.1, s 4.2')}`) },
          { only: 'outdoorSeal', ...src('Solvent sealers are applied in the open air with people kept back from the vapour, and ignition sources are kept away.', `${WHS('s 351, s 355')}; ${QCODE('Managing risks of hazardous chemicals', 's 4.1, s 4.2')}`) },
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
        { only: 'forkliftSite', text: 'In a working warehouse or car park, the area is separated from forklifts and vehicles with physical barriers agreed with the site, not just paint or tape.' },
        { only: 'siteVehicles', unless: 'forkliftSite', text: 'In a car park or driveway in use, the area is separated from vehicles with physical barriers agreed with the site, not just paint or tape.' },
        'Line marking machines are used with their guards in place, and kept clear of others while running.',
      ],
    }],
    ppe: ['hivis', 'kneePads'],
  },
  {
    when: 'bollards',
    // Bollards, barriers, wheel stops and speed humps are each installed only where the task names them.
    steps: [{
      step: 'Install bollards',
      only: 'bollardNamed',
      hazards: [{ unless: 'footpathWork', text: 'Struck by vehicles moving near the work area.' }, { only: 'footpathWork', text: 'Pedestrians walk into the work area on the footpath.' }, 'Strain lifting heavy bollards, barriers and stops.', 'Striking buried or embedded services when drilling or digging.'],
      controls: [
        { only: 'footpathWork', text: 'The work area on the footpath is barricaded, with a signed, clear way past for pedestrians, including people using wheelchairs and prams, kept open or a detour set up.' },
        { unless: 'coreDrill', text: 'Before drilling a slab, the area is scanned for conduits, pipes and reinforcement.' },
        'Heavy bollards, barriers and concrete stops are lifted with a team lift, a trolley or plant, and fixed to the supplier\'s or engineer\'s details.',
        // In-ground bollards stand in their own concrete footings.
        { only: 'bollardFooting', text: 'In-ground bollards are set in footing holes cored or dug to the engineer\'s or supplier\'s depth, propped plumb, and concreted in. The holes are covered or fenced until they are filled, and the bollards are not loaded until the concrete has set.' },
        { only: 'bollardChains', text: 'Chains are fixed between the bollards once the bollards are set, with gloves worn, and the chain heights kept as the design sets.' },
      ],
    }, {
      step: 'Install barriers',
      only: 'barrierNamed',
      hazards: [{ unless: 'footpathWork', text: 'Struck by vehicles moving near the work area.' }, { only: 'footpathWork', text: 'Pedestrians walk into the work area on the footpath.' }, 'Strain lifting heavy bollards, barriers and stops.', 'Striking buried or embedded services when drilling or digging.'],
      controls: [
        { only: 'footpathWork', text: 'The work area on the footpath is barricaded, with a signed, clear way past for pedestrians, including people using wheelchairs and prams, kept open or a detour set up.' },
        { unless: 'coreDrill', text: 'Before drilling a slab, the area is scanned for conduits, pipes and reinforcement.' },
        'Heavy bollards, barriers and concrete stops are lifted with a team lift, a trolley or plant, and fixed to the supplier\'s or engineer\'s details.',
        'Each barrier section is set in line and fixed or connected to the next before it is let go, and the run is completed before it is relied on.',
      ],
    }, {
      step: 'Install wheel stops',
      only: 'wheelStopNamed',
      hazards: [{ unless: 'footpathWork', text: 'Struck by vehicles moving near the work area.' }, { only: 'footpathWork', text: 'Pedestrians walk into the work area on the footpath.' }, 'Strain lifting heavy bollards, barriers and stops.', 'Striking buried or embedded services when drilling or digging.'],
      controls: [
        { only: 'footpathWork', text: 'The work area on the footpath is barricaded, with a signed, clear way past for pedestrians, including people using wheelchairs and prams, kept open or a detour set up.' },
        { unless: 'coreDrill', text: 'Before drilling a slab, the area is scanned for conduits, pipes and reinforcement.' },
        'Heavy bollards, barriers and concrete stops are lifted with a team lift, a trolley or plant, and fixed to the supplier\'s or engineer\'s details.',
        'Wheel stops are set out at the bay lines and fixed with the anchors the supplier specifies, working bay by bay with the bays being worked in closed to vehicles.',
      ],
    }, {
      step: 'Install speed humps',
      only: 'humpNamed',
      hazards: [{ unless: 'footpathWork', text: 'Struck by vehicles moving near the work area.' }, { only: 'footpathWork', text: 'Pedestrians walk into the work area on the footpath.' }, 'Strain lifting speed hump sections.', 'Striking buried or embedded services when drilling or digging.'],
      controls: [
        { only: 'footpathWork', text: 'The work area on the footpath is barricaded, with a signed, clear way past for pedestrians, including people using wheelchairs and prams, kept open or a detour set up.' },
        { unless: 'coreDrill', text: 'Before drilling a slab, the area is scanned for conduits, pipes and reinforcement.' },
        'Speed humps are laid to the road authority\'s or council\'s design, lifted into place by two people or with plant, and fixed with the anchors the supplier specifies.',
      ],
    }],
    ppe: ['hivis'],
  },
  {
    when: 'shallowTrench',
    steps: [{
      step: 'Dig the trench',
      hazards: ['Striking buried services.', 'Entanglement in a trencher.', 'People tripping into the open trench.', 'Strain from hand digging.'],
      controls: [
        src('Get the current underground services information, for example through Before You Dig Australia, locate services on site before digging, and work to it.', WHS('s 304')),
        'The trench stays shallower than 1.5 m. If it needs to go deeper, work stops and the SWMS is reviewed.',
        'A trencher is used only by a trained operator, with its guards in place and no one near the chain. The engine is stopped before anything is cleared from it.',
        'The open trench is fenced or covered when no one is working at it.',
      ],
    }, {
      step: 'Lay the pipe or cable',
      hazards: ['People tripping into the open trench.', 'Strain from lifting and laying pipe or cable in the trench.'],
      controls: [
        'The open trench is fenced or covered when no one is working at it.',
        { only: 'cableOnlyTrench', text: 'Installing and connecting the cable is electrical work for a licensed electrician. Digging the trench is not electrical work.' },
        { unless: 'cableOnlyTrench', text: 'Installing and connecting electrical cable is electrical work for a licensed electrician, and connecting to the water supply is plumbing work for a licensed plumber. Digging the trench is not.' },
      ],
    }],
  },
);

// Steps for the kinds of work found, between the opening and closing steps.
// `flags` names the kinds of work found; `factText` returns the user's text for a fact.
// Work the library does not know uses `fallback`, a step built from the task.
// An "unless" can name one flag or a list of them: the line is left out when any is set.
const anyFlag = (flags, ids) => Boolean(ids) && [].concat(ids).some((id) => flags[id]);

function jobStepsFor(flags, factText, fallback) {
  let found = ACTIVITIES.filter((activity) => flags[activity.when]);
  const replaced = new Set(found.flatMap((activity) => activity.replaces || []));
  found = found.filter((activity) => !replaced.has(activity.when));
  // With no kind of work recognised, the task itself is the only step: marked so the
  // draft is stood down rather than issued with no real hazards or controls.
  let middle = found.length ? found.flatMap((activity) => activity.steps) : [{ ...fallback, fallback: true }];
  // The joinery doors step gives way to the door installer's own step of the same name, so
  // the steps moved by name below are the door installer's.
  if (flags.doorHang) middle = middle.filter((step) => !(step.step === 'Hang the doors' && step.unless === 'doorHang'));
  // Work done inside a confined space happens before the permit is closed.
  const close = middle.filter((step) => step.step === 'Leave and close up');
  middle = [...middle.filter((step) => step.step !== 'Leave and close up'), ...close];
  // Asbestos is checked, and the room stripped out, before anything new goes in.
  const FIRST = ['Check for asbestos before starting', 'Prepare the asbestos work area', 'Remove the asbestos', 'Bag, label and dispose of asbestos waste', 'Strip out the room'];
  middle = [...FIRST.flatMap((name) => middle.filter((step) => step.step === name)), ...middle.filter((step) => !FIRST.includes(step.step))];
  // An asbestos meter panel comes out only once the supply is disconnected.
  if (middle.some((step) => step.step === 'Replace the meter box and consumer mains connection')) {
    const off = ['Have the supply disconnected', 'Isolate and prove de-energised'].flatMap((name) => middle.filter((step) => step.step === name));
    const check = middle.filter((step) => step.step === 'Check for asbestos before starting');
    middle = [...check, ...off, ...middle.filter((step) => !off.includes(step) && !check.includes(step))];
  }
  // The circuit is isolated and proved de-energised before it is worked on.
  const isolate = middle.find((step) => step.step === 'Isolate and prove de-energised');
  const fitOff = middle.findIndex((step) => ['Rough-in', 'Fit off'].includes(step.step));
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
  // Doors hung in new window and door frames, or security doors, are one step: the door lines join it.
  const hangDoors = middle.find((step) => step.step === 'Hang the doors');
  const frameDoors = middle.find((step) => step.step === 'Install doors' || step.step === 'Fit security doors');
  if (hangDoors && frameDoors) {
    const said = new Set([...frameDoors.hazards, ...frameDoors.controls].map((item) => (typeof item === 'string' ? item : item.text || JSON.stringify(item))));
    const fresh = (items) => items.filter((item) => !said.has(typeof item === 'string' ? item : item.text || JSON.stringify(item)));
    middle = middle.filter((step) => step !== hangDoors).map((step) => (step === frameDoors ? { ...frameDoors, hazards: [...frameDoors.hazards, ...fresh(hangDoors.hazards)], controls: [...frameDoors.controls, ...fresh(hangDoors.controls)] } : step));
  }
  // Formwork edge protection named in the task is one step: the general edge protection lines join it.
  const formEdge = middle.find((step) => step.step === 'Install edge protection' && !anyFlag(flags, step.unless));
  const anyEdge = middle.find((step) => step.step === 'Install or remove edge protection');
  if (formEdge && anyEdge) {
    middle = middle.filter((step) => step !== anyEdge).map((step) => (step === formEdge ? { ...formEdge, hazards: [...formEdge.hazards, ...anyEdge.hazards], controls: [...formEdge.controls, ...anyEdge.controls] } : step));
  }
  // The whole-structure step covers the general demolition step.
  if (middle.some((step) => step.step === 'Demolish the structure')) middle = middle.filter((step) => step.step !== 'Demolish');
  // Services are isolated and made safe before anything is demolished.
  const demolish = middle.findIndex((step) => step.step === 'Demolish');
  if (demolish >= 0) {
    const first = middle.filter((step, index) => index > demolish && ['Isolate and prove de-energised', 'Isolate and make safe the old services', 'Remove the old services'].includes(step.step));
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
  moveBefore('Lift and place tanks, pits or precast units', 'Backfill the trench');
  moveBefore('Set up the concrete pump and placing boom', 'Monitor the formwork during the pour');
  moveBefore('Install the battery system', 'Test the new work');
  moveBefore('Dig footing holes', 'Cut blocks and bricks');
  moveBefore('Dig footing holes', 'Mix mortar');
  moveBefore('Take down the old fence', 'Dig post holes');
  moveBefore('Take down the old fence', 'Build the fence');
  moveBefore('Take down the old fence', 'Dig footing holes');
  moveBefore('Take down the old fence', 'Mix mortar');
  moveBefore('Pressure test the gas line', 'Connect, leak test and commission the gas appliance');
  moveBefore('Build the outdoor kitchen', 'Connect, leak test and commission the gas appliance');
  moveBefore('Take down the shed frame', 'Bag, label and dispose of asbestos waste');
  moveBefore('Use an elevating work platform', 'Install temporary support');
  moveBefore('Cut out the old lintel', 'Mix mortar');
  moveBefore('Cut out the old lintel', 'Lift and fix the new beam or lintel');
  moveBefore('Mount the sub-board', 'Test the new work');
  moveBefore('Run the sub-mains', 'Test the new work');
  moveBefore('Mount and wire the control panel', 'Test the new work');
  moveBefore('Work in the roof space', 'Fit cyclone tie-downs');
  moveBefore('Build the retaining wall', 'Mix mortar');
  moveBefore('Clean the gutters and downpipes', 'Clear the drain with a drain machine or jetter');
  moveBefore('Leave unfinished work safe', 'Test the new work');
  for (const name of ['Protect the footpath', 'Clear the collapsed wall']) {
    moveBefore(name, 'Mix mortar');
    moveBefore(name, 'Lay blocks and bricks');
  }
  moveBefore('Work with the crane crew during lifts', 'Lift and place tanks, pits or precast units');
  moveBefore('Isolate the gas and disconnect the old appliance', 'Strip out the room');
  moveBefore('Isolate and make safe the old services', 'Strip out the room');
  moveAfter('Cut the lintel bearings', 'Install temporary support');
  moveAfter('Remove the old frames', 'Install temporary support');
  moveBefore('Remove the old frames', 'Cut blocks and bricks');
  moveBefore('Cut the lintel bearings', 'Cut blocks and bricks');
  moveAfter('Lay floor joists', 'Stand and brace wall frames');
  moveAfter('Lay the floor deck', 'Lay floor joists');
  moveBefore('Install the shoring wall', 'Bulk excavate and load trucks');
  moveBefore('Protect neighbouring buildings and the street', 'Bulk excavate and load trucks');
  // Spoil is stockpiled and carted once the digging that makes it is under way.
  for (const dig of ['Dig footing holes', 'Dig the trench', 'Lay the pipe or cable', 'Excavate', 'Excavate pile caps, lift pits and trenches', 'Excavate in front of the retention wall', 'Bulk excavate and load trucks', 'Run earthmoving plant']) moveAfter('Stockpile and cover spoil', dig);
  moveBefore('Stockpile and cover spoil', 'Backfill the trench');
  moveAfter('Cart away spoil', 'Stockpile and cover spoil');
  moveAfter('Strip the formwork', 'Pump and place concrete');
  moveAfter('Strip the formwork', 'Finish concrete');
  moveAfter('Install backprops', 'Strip the formwork');
  moveAfter('Plant the green roof', 'Move soil and mulch');
  moveBefore('Work at open lift shafts and landing doors', 'Install the lift rails, car and machine');
  moveBefore('Deliver and place switchboards', 'Pull cables and handle cable drums');
  moveBefore('Isolate and prove de-energised', 'Pull cables and handle cable drums');
  for (const power of ['Install temporary lighting', 'Install construction power']) {
    moveBefore('Set up site sheds', power);
    moveBefore('Isolate and prove de-energised', power);
  }
  moveAfter('Inspect, test and maintain construction power', 'Work on or near energised parts');
  moveBefore('Cut and flash the roof penetration', 'Fix hangers and supports');
  moveBefore('Clear the drain with a drain machine or jetter', 'Clean and inspect the pipe');
  moveBefore('Clear the drain with a drain machine or jetter', 'Reline the pipe');
  moveBefore('Install water meters and backflow devices', 'Connect to the water supply');
  moveBefore('Isolate the gas and disconnect the old appliance', 'Hang the doors');
  moveBefore('Isolate the gas and disconnect the old appliance', 'Install joinery and cabinets');
  moveBefore('Work in the roof space', 'Spray polyurethane foam insulation');
  moveBefore('Operate small earthmoving plant', 'Excavate');
  moveBefore('Operate small earthmoving plant', 'Backfill the trench');
  moveBefore('Work with the crane crew during lifts', 'Lift equipment and materials to the roof');
  moveBefore('Erect coolroom panels', 'Pressure test with nitrogen');
  moveBefore('Remove the old board and fit the new one', 'Test the new work');
  moveBefore('Work in the roof space', 'Test the new work');
  moveBefore('Work at edges', 'Apply primers and liquid membranes');
  moveBefore('Work at edges', 'Repair the roof membrane');
  moveBefore('Work with the crane crew during lifts', 'Backfill the trench');
  moveBefore('Get soil and plants to the podium', 'Move soil and mulch');
  moveBefore('Get soil and plants to the podium', 'Plant');
  moveBefore('Pressure clean surfaces', 'Prepare to paint');
  moveBefore('Mix mortar', 'Lay blocks and bricks');
  moveAfter('Core fill blockwork', 'Lay blocks and bricks');
  moveBefore('Deliver and install commercial kitchen equipment', 'Plumbing rough-in');
  moveBefore('Deliver and install commercial kitchen equipment', 'Plumbing fit-off');
  moveBefore('Work with the crane crew during lifts', 'Lift materials to and from the roof');
  moveBefore('Work with the crane crew during lifts', 'Fix new roofing');
  moveBefore('Pull cables and handle cable drums', 'Backfill the trench');
  moveBefore('Isolate and prove de-energised', 'Pull cables and handle cable drums');
  moveBefore('Install pits and conduits', 'Pull cables and handle cable drums');
  moveBefore('Stand the poles', 'Pull cables and handle cable drums');
  moveBefore('Isolate and prove de-energised', 'Pull cables and handle cable drums');
  moveBefore('Prepare the asbestos work area', 'Remove old roofing');
  moveBefore('Remove the asbestos', 'Remove old roofing');
  moveBefore('Bag, label and dispose of asbestos waste', 'Remove old roofing');
  moveBefore('Install the pump-out line', 'Backfill the trench');
  moveBefore('Work in the roof space', 'Seal penetrations and fire stop');
  moveBefore('Install pits and conduits', 'Backfill the trench');
  moveBefore('Stand the poles', 'Backfill the trench');
  moveBefore('Install the battery system', 'Connect the solar array and inverter');
  moveBefore('Break out damaged concrete', 'Set out');
  moveBefore('Repair the concrete', 'Set out');
  moveBefore('Work at edges', 'Lay torch-on membranes');
  moveBefore('Strip the old membrane', 'Lay torch-on membranes');
  moveAfter('Strip the old membrane', 'Work at edges');
  moveBefore('Move membrane rolls and materials', 'Lay torch-on membranes');
  moveBefore('Reach high walls and ceilings', 'Strip wallpaper');
  moveBefore('Reach high walls and ceilings', 'Prepare to paint');
  moveBefore('Lay tiles near open edges', 'Break out the cracked tiles');
  moveBefore('Lay tiles near open edges', 'Cut tiles and stone');
  moveBefore('Break out the cracked tiles', 'Cut tiles and stone');
  moveBefore('Build the raised garden beds', 'Move soil and mulch');
  moveBefore('Build the raised garden beds', 'Plant');
  moveBefore('Strip the water-damaged linings', 'Move and fix plasterboard sheets');
  moveBefore('Strip the water-damaged linings', 'Fix ceiling sheets');
  moveBefore('Strip the water-damaged linings', 'Work at the upper wall and ceiling line');
  moveBefore('Isolate and lift out the failed pump', 'Install the pump and pipework');
  moveBefore('Take down the old roller door', 'Install the door');
  moveBefore('Take down the old roller door', 'Install the door motor');
  moveBefore('Work in the rail corridor', 'Take down the old fence');
  moveBefore('Dig footing holes', 'Set and fix the letterbox bank');
  moveBefore('Dig footing holes', 'Stand and fix the solar light poles');
  // The EWP is used once the footings are in, to fit and aim the light heads.
  if (flags.solarLights) moveAfter('Use an elevating work platform', 'Dig footing holes');
  moveBefore('Work over the stair void', 'Prepare to paint');
  moveBefore('Pump out the septic tank', 'Work in the trench');
  moveBefore('Remove the old septic tank', 'Work in the trench');
  moveBefore('Pump out the septic tank', 'Lift and place tanks, pits or precast units');
  moveBefore('Remove the old septic tank', 'Lift and place tanks, pits or precast units');
  moveBefore('Cut and flash the roof penetration', 'Fix fittings on the roof');
  moveBefore('Cut and flash the roof penetration', 'Install plant and equipment on the roof');
  moveBefore('Saw cut concrete', 'Plumbing rough-in');
  moveBefore('Saw cut concrete', 'Plumbing fit-off');
  moveBefore('Plumbing rough-in', 'Backfill the trench');
  moveBefore('Plumbing fit-off', 'Backfill the trench');
  moveBefore('Install plant and equipment on the roof', 'Pressure test with nitrogen');
  moveBefore('Move and set the boiler', 'Install and commission boilers and pressure vessels');
  moveBefore('Connect the boiler', 'Install and commission boilers and pressure vessels');
  moveBefore('Remove cut sections', 'Plumbing rough-in');
  moveBefore('Remove cut sections', 'Plumbing fit-off');
  moveBefore('Work in the roof space', 'Rough-in');
  moveBefore('Work in the roof space', 'Fit off');
  moveBefore('Build the tank stand', 'Install the rainwater tank');
  moveBefore('Lift the tank onto the stand', 'Install the rainwater tank');
  moveBefore('Dig the trench', 'Rough-in');
  moveBefore('Lay the pipe or cable', 'Rough-in');
  moveBefore('Dig the trench', 'Fit off');
  moveBefore('Lay the pipe or cable', 'Fit off');
  moveBefore('Dig the trench', 'Plumbing rough-in');
  moveBefore('Lay the pipe or cable', 'Plumbing rough-in');
  moveBefore('Dig the trench', 'Plumbing fit-off');
  moveBefore('Lay the pipe or cable', 'Plumbing fit-off');
  moveBefore('Remove and fit the benchtops', 'Install joinery and cabinets');
  moveBefore('Break out the cracked tiles', 'Lay tiles');
  moveBefore('Break out the cracked tiles', 'Cut tiles and stone');
  moveAfter('Fix rails, fittings and equipment to walls and floors', 'Lay the decking');
  moveAfter('Fix rails, fittings and equipment to walls and floors', 'Install access ladders, platforms and walkways');
  for (const item of ['Install speed humps', 'Install wheel stops', 'Install barriers', 'Install bollards']) moveAfter(item, 'Core drill through the slab or wall');
  moveAfter('Cut out and replace the steel handrail', 'Work over the water');
  const leave = middle.find((item) => item.step === 'Leave unfinished work safe');
  if (leave && middle.some((item) => item.step === 'Test the new work')) {
    middle = middle.filter((item) => item !== leave);
    middle.splice(middle.findIndex((item) => item.step === 'Test the new work'), 0, leave);
  }
  // Asbestos roof sheets are removed from the roof, so roof access and fall protection go up first.
  const access = middle.filter((item) => ['Set up roof access', 'Install roof edge protection', 'Get onto the roof', 'Set up roof fall protection'].includes(item.step));
  const asbestosFirst = middle.findIndex((item) => item.step === 'Prepare the asbestos work area');
  if (access.length && asbestosFirst >= 0 && middle.some((item) => item.step === 'Remove old roofing') && middle.indexOf(access[0]) > asbestosFirst) {
    middle = middle.filter((item) => !access.includes(item));
    middle.splice(middle.findIndex((item) => item.step === 'Prepare the asbestos work area'), 0, ...access);
  }
  moveBefore('Work on a tiled roof', 'Cut in and install the skylight');
  // A skylight's light shaft is framed in the roof space once the roof is cut and the skylight is in.
  moveAfter('Work in the roof space', 'Cut in and install the skylight');
  moveBefore('Work on a tiled roof', 'Strip the roof tiles');
  moveBefore('Fix roof battens to the trusses', 'Lay the roof tiles');
  moveBefore('Drill fixing holes in the slab edge', 'Fix brackets at the slab edge');
  // Doors are hung before the skirting and architraves go on.
  moveBefore('Hang the doors', 'Fix skirting and architraves');
  moveBefore('Stand the door frames', 'Hang the doors');
  moveAfter('Install balustrades at open edges', 'Lay the decking');
  moveBefore('Drill tiled walls for fixings', 'Handle and install glass panels');
  moveBefore('Install the pump and pipework', 'Backfill the trench');
  for (const lay of ['Lay pipes', 'Install pits', 'Lay conduits']) moveBefore('Lift and place tanks, pits or precast units', lay);
  moveBefore('Fix plant on its supports', 'Install plant and equipment on the roof');
  moveBefore('Build the retaining wall', 'Lay blocks and bricks');
  moveAfter('Handle and install glass panels', 'Install windows');
  moveAfter('Handle and install glass panels', 'Install doors');
  moveAfter('Handle and install glass panels', 'Install louvres');
  moveBefore('Remove lead paint', 'Prepare to paint');
  moveBefore('Fix the fascia', 'Prepare to paint');
  moveBefore('Install gutters and downpipes', 'Prepare to paint');
  moveBefore('Install the eaves linings', 'Prepare to paint');
  // Rescue equipment is set up before anyone works over the water.
  const rescue = middle.find((item) => item.step === 'Set up rescue equipment');
  if (rescue) middle = [rescue, ...middle.filter((item) => item !== rescue)];
  // Work over the water is set up before any work from the punt or jetty.
  const overWater = middle.find((item) => item.step === 'Work over the water');
  if (overWater) middle = [...middle.filter((item) => item.step === 'Set up rescue equipment'), overWater, ...middle.filter((item) => item !== overWater && item.step !== 'Set up rescue equipment')];
  moveBefore('Saw cut concrete', 'Excavate');
  moveBefore('Saw cut asphalt', 'Excavate');
  // Asphalt is laid once the cutting and any trench work under it are done.
  for (const done of ['Saw cut concrete', 'Remove cut sections', 'Backfill the trench', 'Reinstate the surface']) moveAfter('Reinstate asphalt', done);
  moveBefore('Saw cut concrete', 'Set out');
  moveBefore('Remove cut sections', 'Set out');
  moveAfter('Break out damaged concrete', 'Remove cut sections');
  moveAfter('Break out damaged concrete', 'Saw cut concrete');
  moveAfter('Repair the concrete', 'Break out damaged concrete');
  moveBefore('Build the vehicle crossover', 'Saw cut concrete');
  moveAfter('Break rock with a hydraulic hammer', 'Excavate');
  moveBefore('Set and fix the substation equipment', 'Isolate and prove de-energised');
  moveBefore('Set and fix the substation equipment', 'Pull cables and handle cable drums');
  for (const support of ['Install and later remove ground anchors', 'Stress the ground anchors', 'Install and later remove props']) moveBefore('Drill with the drill rig', support);
  // A suspended pour runs in a fixed order: deck, reo and tendons, inspection, pour, finish, stressing, stripping.
  const POUR = ['Erect falsework and shores', 'Install edge protection', 'Lay the formwork deck', 'Load ply onto the deck while it is being laid', 'Form penetrations and voids', 'Lift reo onto the deck', 'Place and tie reo', 'Place post-tensioning ducts and tendons', 'Inspect before the pour', 'Set up the concrete pump and placing boom', 'Pump and place concrete', 'Monitor the formwork during the pour', 'Finish concrete', 'Stress the tendons', 'Strip the formwork', 'Install backprops'];
  if (middle.some((item) => item.step === 'Erect falsework and shores')) {
    const at = middle.map((item, i) => (POUR.includes(item.step) ? i : -1)).filter((i) => i >= 0);
    const sorted = at.map((i) => middle[i]).sort((x, y) => POUR.indexOf(x.step) - POUR.indexOf(y.step));
    at.forEach((i, k) => { middle[i] = sorted[k]; });
  }
  moveBefore('Use an elevating work platform', 'Strip the formwork');
  // Testing and commissioning, and leaving work safe, follow the installation.
  for (const name of ['Leave unfinished work safe', 'Test the new work', 'Connect and commission']) {
    const last = middle.find((item) => item.step === name);
    if (last) middle = [...middle.filter((item) => item !== last), last];
  }
  moveBefore('Lay and cut pavers', 'Move soil and mulch');
  moveBefore('Lay and cut pavers', 'Plant');
  const aboveStep = middle.find((item) => item.step === 'Work above traffic or a rail line');
  if (aboveStep) middle = [aboveStep, ...middle.filter((item) => item !== aboveStep)];
  const trafficStep = middle.find((item) => item.step === 'Set up traffic management');
  if (trafficStep) middle = [trafficStep, ...middle.filter((item) => item !== trafficStep)];
  const hospitalStep = middle.find((item) => item.step === 'Work next to the live hospital');
  if (hospitalStep) middle = [hospitalStep, ...middle.filter((item) => item !== hospitalStep)];
  // Work in a rail corridor is set up before anything else starts.
  const railStep = middle.find((item) => item.step === 'Work in the rail corridor');
  if (railStep) middle = [railStep, ...middle.filter((item) => item !== railStep)];
  moveBefore('Build the retaining wall', 'Form the retaining wall');
  moveBefore('Lift machines, rails and equipment into the shaft', 'Install the lift rails, car and machine');
  moveAfter('Isolate and prove de-energised', 'Install solar panels and mounting rails on the roof');
  moveBefore('Pressure clean surfaces', 'Apply epoxy or polyurethane floor coatings');
  moveBefore('Lift materials to and from the roof', 'Bag, label and dispose of asbestos waste');
  moveBefore('Remove the old fan coil unit', 'Commission and balance the system');
  moveBefore('Lift the fan coil unit into place and fix it', 'Commission and balance the system');
  moveBefore('Fit the new eave lining', 'Finish and clean up');
  moveBefore('Receive plant and move it into position', 'Lift equipment and materials to the roof');
  moveBefore('Paint the outside of the structure at height', 'Prepare to paint');
  moveBefore('Apply solvent-based paint', 'Clean brushes and rollers');
  moveAfter('Install boom gates and automatic gates', 'Lay the pipe or cable');
  moveBefore('Open the pits and haul the cable through the conduits', 'Haul the optical fibre cable');
  moveBefore('Open the pits and haul the cable through the conduits', 'Splice and test optical fibre');
  moveAfter('Replace the valley iron', 'Work on a tiled roof');
  moveAfter('Rebed the tiles', 'Replace the valley iron');
  moveBefore('Connect the solar array and inverter', 'Leave unfinished work safe');
  moveBefore('Remove cut sections', 'Excavate');
  moveBefore('Apply primers and liquid membranes', 'Cut tiles and stone');
  moveBefore('Apply primers and liquid membranes', 'Lay tiles');
  // Grout and sealer go on after the tiles are laid.
  moveAfter('Apply sealer to the tiles and grout', 'Lay tiles');
  moveAfter('Grout the tiles', 'Lay tiles');
  moveBefore('Install split system indoor and outdoor units', 'Pressure test with nitrogen');
  moveBefore('Connect to the live sewer', 'Backfill the trench');
  moveBefore('Prepare to enter the confined space', 'Connect to the live sewer');
  moveBefore('Enter and work', 'Connect to the live sewer');
  moveBefore('Leave and close up', 'Backfill the trench');
  moveBefore('Work with the crane crew during lifts', 'Lift and place tanks, pits or precast units');
  moveAfter('Clean out the wet well', 'Enter and work');
  moveAfter('Repair the pipe in the pit', 'Enter and work');
  moveBefore('Use an elevating work platform', 'Prepare the asbestos work area');
  moveBefore('Use mobile scaffolds', 'Prepare the asbestos work area');
  moveBefore('Work at edges', 'Apply primers and liquid membranes');
  moveAfter('Fix skirting and architraves', 'Strip out ceilings, partitions and floor coverings');
  moveAfter('Install joinery and cabinets', 'Strip out ceilings, partitions and floor coverings');
  moveAfter('Hang the doors', 'Strip out ceilings, partitions and floor coverings');
  moveBefore('Install the cattle grid', 'Backfill the trench');
  moveBefore('Prepare to enter the confined space', 'Backfill the trench');
  moveBefore('Enter and work', 'Backfill the trench');
  moveBefore('Leave and close up', 'Backfill the trench');
  moveAfter('Leave and close up', 'Enter and work');
  moveBefore('Protect the basement edge', 'Bulk excavate and load trucks');
  moveBefore('Provide access into the basement', 'Bulk excavate and load trucks');
  moveBefore('Operate small earthmoving plant', 'Set out');
  moveBefore('Isolate and repair the main', 'Backfill the trench');
  moveBefore('Fix new wall sheets', 'Apply primers and liquid membranes');
  moveBefore('Fix new wall sheets', 'Cut tiles and stone');
  moveBefore('Apply primers and liquid membranes', 'Cut tiles and stone');
  for (const lay of ['Lay pipes', 'Install pits', 'Lay conduits']) moveBefore('Isolate and repair the main', lay);
  moveBefore('Stand the temporary power pole', 'Install temporary lighting');
  moveBefore('Stand the temporary power pole', 'Install construction power');
  moveBefore('Work in the roof space', 'Leave unfinished work safe');
  moveBefore('Cut an opening in a load-bearing wall', 'Cut blocks and bricks');
  if (flags.vanityReplace) {
    moveBefore('Remove and fit the vanity', 'Plumbing rough-in');
    moveBefore('Remove and fit the vanity', 'Plumbing fit-off');
  } else {
    // A new vanity goes in after the rough-in and before the fit-off.
    moveAfter('Remove and fit the vanity', 'Plumbing rough-in');
    moveBefore('Remove and fit the vanity', 'Plumbing fit-off');
  }
  moveBefore('Remove the old board and fit the new one', 'Rough-in');
  moveBefore('Remove the old board and fit the new one', 'Fit off');
  moveBefore('Install the smoke alarms', 'Leave unfinished work safe');
  moveBefore('Mix bagged concrete', 'Place concrete');
  moveBefore('Deliver and install commercial kitchen equipment', 'Connect, leak test and commission the gas appliance');
  moveBefore('Lift and place tanks, pits or precast units', 'Plumbing rough-in');
  moveBefore('Lift and place tanks, pits or precast units', 'Plumbing fit-off');
  moveBefore('Work in the roof space', 'Fix hangers and supports');
  moveBefore('Disconnect and connect the water heater', 'Connect, leak test and commission the gas appliance');
  moveBefore('Lift and fix the purlins', 'Fix new roofing');
  moveBefore('Lift and fix the purlins', 'Set up roof access');
  moveBefore('Operate small earthmoving plant', 'Dig footing holes');
  moveBefore('Operate small earthmoving plant', 'Lay turf');
  moveBefore('Replace the meter box and consumer mains connection', 'Leave unfinished work safe');
  moveBefore('Replace the meter box and consumer mains connection', 'Test the new work');
  moveBefore('Install pits and conduits', 'Test the new work');
  moveBefore('Stand the poles', 'Test the new work');
  moveBefore('Install pits and conduits', 'Leave unfinished work safe');
  moveBefore('Stand the poles', 'Leave unfinished work safe');
  moveBefore('Install the battery system', 'Leave unfinished work safe');
  moveBefore('Cut an opening in a load-bearing wall', 'Mix mortar');
  moveBefore('Lift and fix the new beam or lintel', 'Cut blocks and bricks');
  moveBefore('Mix mortar', 'Lift and fix the new beam or lintel');
  moveBefore('Run earthmoving plant', 'Place the rock lining');
  moveBefore('Build the retaining wall', 'Mix mortar');
  moveBefore('Take down the old fence', 'Mix mortar');
  moveBefore('Dig footing holes', 'Mix mortar');
  moveBefore('Take down the old fence', 'Dig footing holes');
  moveBefore('Cut out the old lintel', 'Mix mortar');
  moveBefore('Cut out the old lintel', 'Lift and fix the new beam or lintel');
  moveBefore('Connect to the water supply', 'Backfill the trench');
  // A new building goes up in order: frames, trusses, roof, cladding, then linings.
  moveBefore('Stand and brace wall frames', 'Set up roof access');
  moveBefore('Fix roof trusses', 'Set up roof access');
  // Posts, beams and rafters go up before the roof is sheeted.
  moveBefore('Erect the frame', 'Set up roof access');
  moveBefore('Erect the frame', 'Lift materials to and from the roof');
  for (const before of ['Fix roof trusses', 'Fix new roofing']) {
    moveAfter('Fix the battens', before);
    moveAfter('Install the external cladding', 'Fix the battens');
  }
  moveAfter('Move and fix plasterboard sheets', 'Install the external cladding');
  moveBefore('Cut and fix plasterboard', 'Move and fix plasterboard sheets');
  moveBefore('Cut and fix plasterboard', 'Fix ceiling sheets');
  moveAfter('Lift and fix the new beam or lintel', 'Cut an opening in a load-bearing wall');
  moveAfter('Lift and fix the new beam or lintel', 'Cut blocks and bricks');
  moveBefore('Lift and fix the new beam or lintel', 'Lay blocks and bricks');
  moveBefore('Install temporary support', 'Cut an opening in a load-bearing wall');
  // Safety mesh and sarking go in before the sheets are laid over them.
  for (const name of ['Install safety mesh', 'Install sarking']) {
    const mesh = middle.find((step) => step.step === name);
    const sheets = middle.findIndex((step) => step.step === 'Fix new roofing');
    if (mesh && sheets >= 0 && middle.indexOf(mesh) > sheets) {
      middle = middle.filter((step) => step !== mesh);
      middle.splice(middle.findIndex((step) => step.step === 'Fix new roofing'), 0, mesh);
    }
  }
  // Old roofing comes off once the roof access and fall protection are set up.
  const strip = middle.find((step) => step.step === 'Remove old roofing');
  const setUp = middle.findIndex((step) => step.step === 'Install roof edge protection');
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
    .filter((step) => (!step.only || flags[step.only]) && !anyFlag(flags, step.unless))
    .filter((step) => !seen.has(step.step) && seen.add(step.step));
  // Post-tensioning checks apply only where the task is on post-tensioned slabs.
  const pt = (line) => (flags.ptSlab ? line : line.replace(/a post-tensioning tendon or /gi, '').split(/(?<=\.)\s+(?=[A-Z])/).filter((part) => !/post-tension|tendon/i.test(part)).join(' '));
  // A line already given in an earlier step is not repeated in a later one.
  const said = new Set();
  const saidKeys = new Set();
  // A step left with no controls (energised work answered "none") is not work this SWMS covers.
  return steps.map((step) => ({
    ...(step.fallback ? { fallback: true } : {}),
    step: step.step === 'Cut and fix plasterboard' && (flags.plasterSheets || flags.plasterCeiling) ? 'Cut plasterboard' : step.step === 'Fit fly screens' && flags.securityScreens ? (flags.flyScreenNamed ? 'Fit fly and security screens' : 'Fit security screens') : step.step === 'Sand timber floors' && flags.deckRefinish ? 'Strip and sand the deck' : step.step === 'Coat timber floors' && flags.deckRefinish ? 'Oil or stain the deck' : step.step === 'Install windows' && flags.singleWindow ? 'Replace the window frame' : step.step === 'Paint the outside of the structure at height' ? 'Set up access to the outside of the structure' : step.step === 'Install windows' && flags.shopfront ? 'Install the shopfront frames' : step.step === 'Install doors' && flags.shopfront ? 'Hang the shopfront doors' : step.step === 'Install the external cladding' && flags.cladReplace ? 'Replace the cladding boards' : step.step === 'Run the processing plant' && flags.batchOnly ? 'Run the batching plant' : step.step === 'Run the processing plant' ? 'Run the crushing and screening plant' : step.step === 'Maintain the processing plant' && flags.batchOnly ? 'Maintain the batching plant' : step.step === 'Maintain the processing plant' ? 'Maintain the crushing and screening plant' : step.step === 'Install the door' && flags.rollerDoorOnly ? 'Install the roller door' : step.step === 'Hang the doors' && flags.autoDoorsOnly ? 'Install and commission the automatic doors' : step.step === 'Erect and dismantle the temporary grandstand' && flags.standDismantle ? 'Dismantle the temporary grandstand' : step.step === 'Lift and set the modules' && flags.podOnly ? 'Lift and set the bathroom pods' : step.step === 'Replace the sleepers and ballast' && flags.tamping ? 'Tamp and regulate the ballast' : step.step === 'Replace the sleepers and ballast' && flags.trackLaying ? 'Lay the new track' : step.step === 'Operate forklifts' && flags.telehandlerOnly ? 'Operate the telehandler' : step.step === 'Move the load with transporters or a launching system' && flags.skidMove ? 'Jack and skid the load into place' : step.step === 'Move the load with transporters or a launching system' && flags.launchOnly ? 'Launch the girders' : step.step === 'Move the load with transporters or a launching system' && flags.spmtMove ? 'Move the load with the transporters' : step.step === 'Bore under the road or ground with a directional drill' && flags.waterCrossing ? 'Bore under the waterway with the directional drill' : step.step === 'Demolish the structure' && flags.bridgeDemo ? 'Demolish the bridge' : step.step === 'Build the retaining wall' && flags.concreteWall ? 'Excavate and set out the retaining wall' : step.step === 'Disconnect and connect the water heater' && !flags.replaceAppliance ? 'Set and connect the water heater' : step.step === 'Prop and repair the verandah' && flags.pergolaWork ? 'Prop and repair the pergola' : step.step === 'Work on a tiled roof' && flags.slateRoof ? 'Work on a slate roof' : step.step === 'Strip the roof tiles' && flags.slateRoof ? 'Strip the slates' : step.step === 'Lay the roof tiles' && flags.slateRoof ? 'Lay the slates' : step.step === 'Install rooftop antennas and equipment' && flags.towerWork ? 'Install antennas and equipment on the tower' : step.step === 'Install the hydrant booster assembly' && flags.sprinkler ? 'Install the sprinkler booster valve set' : step.step === 'Clean windows and balconies' && flags.ewpNamed ? 'Clean windows from the EWP' : step.step === 'Dig footing holes' && flags.masonryLay ? 'Dig and pour footings'  : step.step === 'Remove and fit the vanity' && !flags.vanityReplace ? 'Install vanities and fixtures' : step.step === 'Install signs and screens' && flags.signPostsOnly ? 'Install signs on posts' : step.step === 'Install signs and screens' && flags.signNoScreen ? 'Install the signs' : step.step === 'Drill or cut concrete, masonry or stone' && flags.grindOnly ? 'Grind concrete' : step.step === 'Remove and replace the bath and shower' && flags.bathOnly ? 'Remove and replace the bath' : step.step === 'Remove and replace the bath and shower' && flags.showerOnly ? 'Remove and replace the shower' : step.step === 'Fix rails, fittings and equipment to walls and floors' && flags.boardwalk ? 'Fix the handrails to the boardwalk' : step.step === 'Apply sealers to concrete, pavers or timber' && flags.stoneSurface ? 'Apply sealer to the stone' : step.step === 'Lay the decking' && flags.deckBoardsOnly ? 'Remove and replace the decking' : step.step === 'Lay the pipe or cable' && flags.cableOnlyTrench ? 'Lay the cable' : step.step === 'Lay the pipe or cable' && flags.outdoorFixture ? 'Lay the pipes' : step.step === 'Build the vehicle crossover' ? 'Set up the crossover work area' : step.step === 'Install bird netting at height' && flags.birdSpikes ? 'Install bird spikes at height' : step.step === 'Prepare the ground' && flags.crossover ? 'Box out the crossover' : step.step === 'Remove and replace damaged timbers' && flags.boardsOnly ? 'Remove and replace the deck boards' : step.step === 'Fix the roof' && flags.shadeFabric ? 'Fix the shade fabric' : step.step === 'Sand and fill surfaces' && flags.steelPaint ? 'Prepare the steel surfaces' : step.step === 'Install security devices' && flags.doorStrikes ? 'Install the security devices and door strikes' : step.step === 'Pull cables and handle cable drums' && flags.newMainBoard ? 'Pull in and terminate the cables' : step.step === 'Cut in and install the skylight' && flags.skylightRepair ? (flags.skylightsPlural ? 'Remove and replace the damaged skylights' : 'Remove and replace the damaged skylight') : step.step === 'Install the pump and pipework' && flags.sewerPumpSwap ? 'Lower in and connect the new pump' : step.step === 'Dig footing holes' && flags.solarLights ? 'Dig and pour the footings' : step.step === 'Lay tiles' && flags.wallTiling ? 'Fix the wall tiles' : step.step === 'Erect the frame' && flags.roofOverDeck ? 'Erect the posts, beams and rafters' : step.step === 'Paint' && flags.roofOnlyPaint ? 'Paint the roof' : step.step === 'Erect the frame' && flags.cubbyHouse ? 'Build the cubby house' : step.step === 'Install gutters and downpipes' && flags.downpipesOnly ? 'Install downpipes' : step.step === 'Install boom gates and automatic gates' && flags.solarGate ? 'Install the gate opener' : step.step === 'Install boom gates and automatic gates' && flags.barrierArm ? 'Install the barrier arm' : step.step === 'Fix the fascia' && flags.fasciaReplace ? 'Replace the fascia boards' : step.step === 'Get soil and plants to the podium' && flags.greenRoof ? 'Get soil and plants to the roof' : step.step === 'Install water meters and backflow devices' && flags.backflowOnly ? 'Install the backflow device' : step.step === 'Jack the house and replace stumps' && flags.houseRaise ? 'Jack and raise the house' : step.step === 'Break out the cracked tiles' && flags.oldTiles ? 'Remove the old tiles' : step.step === 'Plumbing fit-off' && flags.eyewashOnly ? 'Install, connect and test the eyewash station' : step.step === 'Connect the solar array and inverter' && !flags.solarArray ? (flags.batteryStorage ? 'Connect the inverter and battery' : 'Connect the inverter') : step.step,
    hazards: step.hazards.filter((item) => typeof item === 'string' || ((!item.only || flags[item.only]) && !anyFlag(flags, item.unless))).map((item) => (typeof item === 'string' ? item : item.text)).map((line) => localText(line, flags.cite || 'qld')).map(pt).filter(Boolean),
    controls: [...new Set(step.controls.filter((item) => (!item.only || flags[item.only]) && !anyFlag(flags, item.unless)).flatMap((item) => expand(item, factText, flags.cite)).map(pt).filter(Boolean))],
  })).map((step) => {
    // A step that drills, cuts or grinds a silica material with a power tool is processing it,
    // so it carries the written assessment and the high risk rules, where it does not already.
    if (!step.hazards.some((line) => /\bsilica\b/i.test(line)) || !step.controls.some((line) => SILICA_TOOL.test(line))) return step;
    // Any state's wording of the assessment counts (the ACT's water feed rule, Victoria's high risk silica work).
    if (step.controls.some((line) => SAID_ONCE.some(([key, re]) => key === 'assess' && re.test(line)) || /\b(?:processing is high risk|high risk crystalline silica|continuous water feed)\b/i.test(line))) return step;
    return { ...step, controls: [...step.controls, ...SILICA_FOLLOW_UP.slice(0, 2).flatMap((item) => expand(item, factText, flags.cite)).map(pt).filter(Boolean)] };
  }).map((step) => {
    if (step.step === 'Before starting') { step.controls.forEach((line) => line.split(/(?<=\.)\s+(?=[A-Z])/).forEach((part) => SAID_ONCE.forEach(([key, re]) => { if (re.test(part)) saidKeys.add(key); }))); return step; }
    if (step.step === 'Finish and clean up') return step;
    const controls = step.controls.filter((line) => !said.has(line)).map((line) => {
      // A rule already given in full in an earlier step (the written silica assessment,
      // silica health monitoring, hearing tests) is not repeated sentence by sentence.
      const keys = SAID_ONCE.filter(([, re]) => re.test(line)).map(([key]) => key);
      const cite = (/\s\((?:[^()]|\([^()]*\))*\)$/.exec(line) || [''])[0];
      const body = cite ? line.slice(0, -cite.length) : line;
      const rest = keys.length ? body.split(/(?<=\.)\s+(?=[A-Z])/).filter((part) => !SAID_ONCE.some(([key, re]) => saidKeys.has(key) && re.test(part))).join(' ') : body;
      const kept = rest ? rest + cite : '';
      keys.forEach((key) => saidKeys.add(key));
      return kept;
    }).filter(Boolean);
    controls.forEach((line) => said.add(line));
    return { ...step, controls: controls.filter((line) => !COVERED.some(([pattern, by]) => pattern.test(line) && controls.some((other) => other !== line && by.test(other)))) };
  }).filter((step) => step.fallback || step.controls.length);
}

// Lines that say a silica material is drilled, cut or ground with a power tool.
const SILICA_TOOL = /\b(on-tool extraction|drill\w*|saws?|sawn|grind\w*|grinders?|core drill\w*|chas(?:e|ed|ing)|jackhammers?|breakers?|demolition hammers?|power tools?)\b/i;

// A line left out where another line in the same step already says it, such as a state's
// roof space rule that already treats the cables as energised.
const COVERED = [
  [/^Treat all cables in the roof space as live until they are proved de-energised\.$/, /\bcables are treated as energised\b/i],
];

const SAID_ONCE = [
  ['kneePads', /^(?:Use|Wear) knee pads\.?$/i],
  ['kneeling', /^Long periods kneeling are a hazardous manual task\b|^Kneeling (?:while laying tiles |to lay floor coverings )?is a hazardous (?:manual task|posture)\b/i],
  ['coolWater', /^Cool drinking water, shade and rest breaks in hot weather\b/i],
  ['scanDrill', /\bscan\w*\b[^.]*\bbefore drilling\b|\bbefore drilling\b[^.]*\bscann?\w*\b/i],
  ['electricalLicensed', /^Electrical work is done (?:or supervised )?only by (?:a )?licensed electric(?:al workers?|ians?)\b/i],
  ['assess', /\b(?:assess\w*\b[^.]*\bin writing\b[^.]*\bhigh risk|The assessment does not count|If it cannot be determined, treat it as a risk)|^If (?:it is|so),/i],
  ['platformLadder', /\bplatform ladders are used only for short work below 2 m\b/i],
  ['plumbingLicensed', /^Plumbing and drainage work is done by\b|^The water connections are plumbing work for a licensed plumber\b/i],
  ['silicaHealth', /^Health monitoring is provided for workers at significant risk from crystalline silica\b|(?:^|\.\s+)Workers with a significant risk from ongoing exposure have health monitoring\b/i],
  ['hearingTests', /\bhearing tests within 3 months\b|\bhearing protector areas and hearing tests\b/i],
  ['airMonitor', /^(?:Air monitoring is done where it is not certain the exposure standard is met|Where it is uncertain whether dust is below the exposure standard, monitor the air)\b/i],
  ['noiseLimit', /^(?:Keep noise below 85 dB\(A\)|Hearing protection where noise exceeds the exposure standard\b)/i],
];

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
