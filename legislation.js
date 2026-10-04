// Australian states and territories. A statement is prepared only for a state
// whose current legislation is loaded. Queensland is the first.

const HIERARCHY = [
  'Eliminate',
  'Substitute',
  'Isolate or engineer',
  'Administrative',
  'PPE',
];

const SITE_FIELDS = [
  { id: 'liveServices', label: 'Live services', hint: 'Power, gas, water, data or other live services in or near the work, including overhead power lines.' },
  { id: 'publicInterface', label: 'Public interface', hint: 'Where the public, traffic or neighbours are close to the work.' },
  { id: 'otherTrades', label: 'Other trades', hint: 'Other trades working nearby, or above or below you.' },
  { id: 'ground', label: 'Ground', hint: 'Soft or sloping ground, open excavations, or slab and deck loads.' },
  { id: 'access', label: 'Access', hint: 'How the crew gets to the work area, for example ladder, stairs or EWP, and how plant and materials get there.' },
];

// Section 291 categories, as they stand in the Work Health and Safety
// Regulation 2011 (Qld). The March 2026 amendment (2026 SL No. 21) is a high
// risk plant amendment. It does not add categories here.
const HIGH_RISK = [
  { id: 'fall', label: 'Risk of a person falling more than 2 metres' },
  { id: 'tower', label: 'Work on a telecommunication tower' },
  { id: 'demolition', label: 'Demolition of a load-bearing structure' },
  { id: 'asbestos', label: 'Likely to involve disturbing asbestos' },
  { id: 'temporary', label: 'Temporary support for structural alterations or repairs' },
  { id: 'confined', label: 'Work in or near a confined space' },
  { id: 'trench', label: 'Work in or near a shaft or trench with an excavated depth greater than 1.5 metres, or a tunnel' },
  { id: 'explosives', label: 'Use of explosives' },
  { id: 'gas', label: 'Work on or near pressurised gas distribution mains or piping' },
  { id: 'chemicalLine', label: 'Work on or near chemical, fuel or refrigerant lines' },
  { id: 'electrical', label: 'Work on or near energised electrical installations or services' },
  { id: 'atmosphere', label: 'Work in an area that may have a contaminated or flammable atmosphere' },
  { id: 'precast', label: 'Tilt-up or precast concrete' },
  { id: 'road', label: 'Work on, in or adjacent to a road, railway, shipping lane or other traffic corridor in use by traffic other than pedestrians' },
  { id: 'plant', label: 'Work in an area with movement of powered mobile plant' },
  { id: 'temperature', label: 'Work in areas with artificial extremes of temperature' },
  { id: 'water', label: 'Work in or near water or other liquid that involves a risk of drowning' },
  { id: 'diving', label: 'Diving work' },
];

const QUEENSLAND = {
  id: 'qld',
  name: 'Queensland',
  loaded: true,
  instrument: 'Work Health and Safety Regulation 2011 (Qld)',
  compilation: 'March 2026',
  versionLabel: 'current as at 29 March 2026',
  section: '299',
  sectionRef: 'section 299',
  reviewHeading: 'How the controls will be implemented, monitored and reviewed',
  sectionTitle: 'Safe work method statement required for high risk construction work',
  // Section 299(2). The draft writes these four contents and does not claim
  // the statement is approved.
  contents: [
    'the high risk construction work',
    'the hazards and risks',
    'the controls',
    'how the controls will be implemented, monitored and reviewed',
  ],
  // Section 291, in the regulation's words, checked against legislation.qld.gov.au
  // (current as at 29 March 2026) and the model WHS Regulations (5 December 2025).
  highRiskLabels: {
    fall: 'Involves a risk of a person falling more than 2m',
    tower: 'Is carried out on a telecommunication tower',
    demolition: 'Involves demolition of an element of a structure that is load-bearing or otherwise related to the physical integrity of the structure',
    asbestos: 'Involves, or is likely to involve, the disturbance of asbestos',
    temporary: 'Involves structural alterations or repairs that require temporary support to prevent collapse',
    confined: 'Is carried out in or near a confined space',
    trench: 'Is carried out in or near a shaft or trench with an excavated depth greater than 1.5m, or a tunnel',
    explosives: 'Involves the use of explosives',
    gas: 'Is carried out on or near pressurised gas distribution mains or piping',
    chemicalLine: 'Is carried out on or near chemical, fuel or refrigerant lines',
    electrical: 'Is carried out on or near energised electrical installations or services',
    atmosphere: 'Is carried out in an area that may have a contaminated or flammable atmosphere',
    precast: 'Involves tilt-up or precast concrete',
    road: 'Is carried out on, in or adjacent to a road, railway, shipping lane or other traffic corridor that is in use by traffic other than pedestrians',
    plant: 'Is carried out in an area at a workplace in which there is any movement of powered mobile plant',
    temperature: 'Is carried out in an area in which there are artificial extremes of temperature',
    water: 'Is carried out in or near water or other liquid that involves a risk of drowning',
    diving: 'Involves diving work',
  },
  // Plain wording for a user who is not sure what a fall from height is.
  fallExplanation: 'A fall from height means a person could fall from one level to a lower level. For example off a roof, a scaffold, a ladder, a slab or floor edge, or into a hole or trench. Under the Work Health and Safety Regulation 2011 (Qld), section 291, work where a person could fall more than 2 metres is high risk construction work. Section 299 says high risk construction work needs a safe work method statement before it starts.',
  // Electrical Safety Regulation 2026 (Qld), which commenced on 1 September 2026 in place of the
  // expired Electrical Safety Regulation 2013 (s 2, s 344). Schedule 2: 3.0 m is the largest
  // exclusion zone for untrained persons and operating plant near uninsulated lines up to 132 kV;
  // higher voltages need more.
  // Section 299(4): a statement whose only fall controls are administrative or PPE must
  // describe all control measures considered, including the section 79(3) requirements.
  fallControlsConsidered: 'Only needed if the fall control is a procedure or a harness. List the other controls considered, such as edge protection, a scaffold or an elevating work platform, and why they were not used (section 299(4)).',
  overheadLineControl: 'Keep people and operating plant outside the minimum distance for the line voltage under the Electrical Safety Regulation 2026 (Qld). For a line up to 132 kV this is 3.0 m. Use a safety observer when plant could come within that distance.',
};

// Checked against the official PDF of the Work Health and Safety Regulation 2025 (NSW),
// "Current version for 3 July 2026 to date", from legislation.nsw.gov.au.
const NEW_SOUTH_WALES = {
  id: 'nsw',
  name: 'New South Wales',
  loaded: true,
  instrument: 'Work Health and Safety Regulation 2025 (NSW)',
  compilation: '3 July 2026',
  versionLabel: 'current version from 3 July 2026',
  section: '299',
  sectionRef: 'section 299',
  reviewHeading: 'How the controls will be implemented, monitored and reviewed',
  sectionTitle: 'Safe work method statement required for high risk construction work',
  // Section 299(2).
  contents: [
    'the work that is high risk construction work',
    'the hazards and the risks to health and safety',
    'the measures to control the risks',
    'how the control measures will be implemented, monitored and reviewed',
  ],
  // Section 291, in the regulation's words.
  highRiskLabels: {
    fall: 'Involves a risk of a person falling more than 2m',
    tower: 'Is carried out on a telecommunication tower',
    demolition: 'Involves demolition of an element of a structure that is load-bearing or otherwise related to the physical integrity of the structure',
    asbestos: 'Involves, or is likely to involve, the disturbance of asbestos',
    temporary: 'Involves structural alterations or repairs that require temporary support to prevent collapse',
    confined: 'Is carried out in or near a confined space',
    trench: 'Is carried out in or near a shaft or trench with an excavated depth greater than 1.5m, or a tunnel',
    explosives: 'Involves the use of explosives',
    gas: 'Is carried out on or near pressurised gas distribution mains or piping',
    chemicalLine: 'Is carried out on or near chemical, fuel or refrigerant lines',
    electrical: 'Is carried out on or near energised electrical installations or services',
    atmosphere: 'Is carried out in an area that may have a contaminated or flammable atmosphere',
    precast: 'Involves tilt-up or precast concrete',
    road: 'Is carried out on, in or adjacent to a road, railway, shipping lane or other traffic corridor that is in use by traffic other than pedestrians',
    plant: 'Is carried out in an area at a workplace in which there is movement of powered mobile plant',
    temperature: 'Is carried out in an area in which there are artificial extremes of temperature',
    water: 'Is carried out in or near water or other liquid that involves a risk of drowning',
    diving: 'Involves diving work',
  },
  fallExplanation: 'A fall from height means a person could fall from one level to a lower level. For example off a roof, a scaffold, a ladder, a slab or floor edge, or into a hole or trench. Under the Work Health and Safety Regulation 2025 (NSW), section 291, work that involves a risk of a person falling more than 2 metres is high risk construction work. Section 299 says high risk construction work needs a safe work method statement before it starts.',
  // Section 166 sets no distance. It requires an unsafe distance to be avoided, or a risk
  // assessment and the electricity supply authority's requirements where that is not practicable.
  // Distances: SafeWork NSW Code of practice, Work near overhead and underground electric
  // lines (May 2026), Table 1, ordinary persons and plant they operate.
  overheadLineControl: 'Keep people, cranes, plant, loads and tools at least the approach distance from an overhead electric line: 3.0 m up to 132 kV, 6.0 m above 132 kV up to 330 kV, and 8.0 m above 330 kV (SafeWork NSW Code of practice, Work near overhead and underground electric lines, May 2026, Table 1). Section 166 of the Work Health and Safety Regulation 2025 (NSW) requires an unsafe distance to be avoided. If that is not reasonably practicable, do a risk assessment and follow the requirements of the electricity supply authority responsible for the line.',
};

// Checked against the authorised PDF of the Work Health and Safety Regulations 2012 (SA),
// "Version: 1.7.2026", published under the Legislation Revision and Publication Act 2002.
const SOUTH_AUSTRALIA = {
  id: 'sa',
  name: 'South Australia',
  loaded: true,
  instrument: 'Work Health and Safety Regulations 2012 (SA)',
  compilation: '1 July 2026',
  versionLabel: 'version of 1 July 2026',
  section: '299',
  sectionRef: 'regulation 299',
  sectionTitle: 'Safe work method statement required for high risk construction work',
  reviewHeading: 'How the controls will be implemented, monitored and reviewed',
  // Regulation 299(2).
  contents: [
    'the work that is high risk construction work',
    'the hazards and the risks to health and safety',
    'the measures to control the risks',
    'how the control measures are to be implemented, monitored and reviewed',
  ],
  // Regulation 291, in the regulation's words.
  highRiskLabels: {
    fall: 'Involves a risk of a person falling more than 2 metres',
    tower: 'Is carried out on a telecommunication tower',
    demolition: 'Involves demolition of an element of a structure that is load-bearing or otherwise related to the physical integrity of the structure',
    asbestos: 'Involves, or is likely to involve, the disturbance of asbestos',
    temporary: 'Involves structural alterations or repairs that require temporary support to prevent collapse',
    confined: 'Is carried out in or near a confined space',
    trench: 'Is carried out in or near a shaft or trench with an excavated depth greater than 1.5 metres, or a tunnel',
    explosives: 'Involves the use of explosives',
    gas: 'Is carried out on or near pressurised gas distribution mains or piping',
    chemicalLine: 'Is carried out on or near chemical, fuel or refrigerant lines',
    electrical: 'Is carried out on or near energised electrical installations or services',
    atmosphere: 'Is carried out in an area that may have a contaminated or flammable atmosphere',
    precast: 'Involves tilt-up or precast concrete',
    road: 'Is carried out on, in or adjacent to a road, railway, shipping lane or other traffic corridor that is in use by traffic other than pedestrians',
    plant: 'Is carried out in an area at a workplace in which there is any movement of powered mobile plant',
    temperature: 'Is carried out in an area in which there are artificial extremes of temperature',
    water: 'Is carried out in or near water or other liquid that involves a risk of drowning',
    diving: 'Involves diving work',
  },
  fallExplanation: 'A fall from height means a person could fall from one level to a lower level. For example off a roof, a scaffold, a ladder, a slab or floor edge, or into a hole or trench. Under the Work Health and Safety Regulations 2012 (SA), regulation 291, work that involves a risk of a person falling more than 2 metres is high risk construction work. Regulation 299 says high risk construction work needs a safe work method statement before it starts.',
  // Regulation 166 sets no distance.
  overheadLineControl: 'Keep people, plant and things out of an unsafe distance of an overhead or underground electric line (Work Health and Safety Regulations 2012 (SA), regulation 166). The regulations set no distance, so get the electricity supply authority\'s requirements before work starts. If a safe distance is not reasonably practicable, do a risk assessment and follow those requirements.',
};

// Checked against the official current version (01-c0-00, as at 1 July 2026) read from
// legislation.wa.gov.au, the 2022 PDF (00-a0-00) and the model WHS Regulations.
const WESTERN_AUSTRALIA = {
  id: 'wa',
  name: 'Western Australia',
  loaded: true,
  instrument: 'Work Health and Safety (General) Regulations 2022 (WA)',
  compilation: '1 July 2026',
  versionLabel: 'version 01-c0-00, as at 1 July 2026',
  section: '299',
  sectionRef: 'regulation 299',
  sectionTitle: 'Safe work method statement required for high risk construction work',
  reviewHeading: 'How the controls will be implemented, monitored and reviewed',
  contents: [
    'the work that is high risk construction work',
    'the hazards and the risks to health and safety',
    'the measures to control the risks',
    'how the control measures are to be implemented, monitored and reviewed',
  ],
  // Regulation 291, in the regulation's words (the same as South Australia's).
  highRiskLabels: {
    fall: 'Involves a risk of a person falling more than 2 metres',
    tower: 'Is carried out on a telecommunication tower',
    demolition: 'Involves demolition of an element of a structure that is load-bearing or otherwise related to the physical integrity of the structure',
    asbestos: 'Involves, or is likely to involve, the disturbance of asbestos',
    temporary: 'Involves structural alterations or repairs that require temporary support to prevent collapse',
    confined: 'Is carried out in or near a confined space',
    trench: 'Is carried out in or near a shaft or trench with an excavated depth greater than 1.5 metres, or a tunnel',
    explosives: 'Involves the use of explosives',
    gas: 'Is carried out on or near pressurised gas distribution mains or piping',
    chemicalLine: 'Is carried out on or near chemical, fuel or refrigerant lines',
    electrical: 'Is carried out on or near energised electrical installations or services',
    atmosphere: 'Is carried out in an area that may have a contaminated or flammable atmosphere',
    precast: 'Involves tilt-up or precast concrete',
    road: 'Is carried out on, in or adjacent to a road, railway, shipping lane or other traffic corridor that is in use by traffic other than pedestrians',
    plant: 'Is carried out in an area at a workplace in which there is any movement of powered mobile plant',
    temperature: 'Is carried out in an area in which there are artificial extremes of temperature',
    water: 'Is carried out in or near water or other liquid that involves a risk of drowning',
    diving: 'Involves diving work',
  },  fallExplanation: 'A fall from height means a person could fall from one level to a lower level. For example off a roof, a scaffold, a ladder, a slab or floor edge, or into a hole or trench. Under the Work Health and Safety (General) Regulations 2022 (WA), regulation 291, work that involves a risk of a person falling more than 2 metres is high risk construction work. Regulation 299 says high risk construction work needs a safe work method statement before it starts.',
  // Regulation 166A danger zones.
  overheadLineControl: 'Keep workers, plant and material out of the danger zone of an overhead electric line: 0.5 m from a live insulated line or aerial bundled conductor of not more than 1,000 volts, 1.0 m from a live uninsulated line of not more than 1,000 volts, 3.0 m from a live line above 1,000 volts up to 33,000 volts, and 6.0 m from a live line above 33,000 volts (Work Health and Safety (General) Regulations 2022 (WA), regulation 166A). This does not apply where the line has been insulated and cordoned off or otherwise made safe, or to a worker authorised to carry out electrical work under the Electricity Act 1945.',
  // Regulations 306B to 306I, tilt-up and precast concrete panels.
  panelFacts: [
    {
      id: 'regulatorNotified',
      label: 'WorkSafe WA notification',
      prompt: 'When the regulator was notified under regulation 306B, at least 10 working days before the panels were cast. Tilt-up work cannot be done on site without it (regulation 306G).',
    },
  ],
  panelControls: [
    ['Isolate or engineer', 'Only people doing the tilt-up work, people with written authority for a purpose connected with it, and people authorised under a written law enter or stay in the area where it is done (regulation 306I).'],
    ['Administrative', 'Keep at the site the regulator notification, the shop drawings of each panel, a current plan for the work, any written advice from a qualified practising engineer, each panel\'s inspection report, and any exemption that relates to the work (regulation 306H).'],
  ],
};

// Checked against the official current text read from legislation.tas.gov.au (authorised
// version of 2 July 2025) and the model WHS Regulations (5 December 2025).
const TASMANIA = {
  id: 'tas',
  name: 'Tasmania',
  loaded: true,
  instrument: 'Work Health and Safety Regulations 2022 (Tas)',
  compilation: '2 July 2025',
  versionLabel: 'authorised version of 2 July 2025',
  section: '299',
  sectionRef: 'regulation 299',
  sectionTitle: 'Safe work method statement required for high risk construction work',
  reviewHeading: 'How the controls will be implemented, monitored and reviewed',
  contents: [
    'the work that is high risk construction work',
    'the hazards and the risks to health and safety',
    'the measures to control the risks',
    'how the control measures are to be implemented, monitored and reviewed',
  ],
  // Regulation 291, in the regulation's words (the same as South Australia's).
  highRiskLabels: {
    fall: 'Involves a risk of a person falling more than 2 metres',
    tower: 'Is carried out on a telecommunication tower',
    demolition: 'Involves demolition of an element of a structure that is load-bearing or otherwise related to the physical integrity of the structure',
    asbestos: 'Involves, or is likely to involve, the disturbance of asbestos',
    temporary: 'Involves structural alterations or repairs that require temporary support to prevent collapse',
    confined: 'Is carried out in or near a confined space',
    trench: 'Is carried out in or near a shaft or trench with an excavated depth greater than 1.5 metres, or a tunnel',
    explosives: 'Involves the use of explosives',
    gas: 'Is carried out on or near pressurised gas distribution mains or piping',
    chemicalLine: 'Is carried out on or near chemical, fuel or refrigerant lines',
    electrical: 'Is carried out on or near energised electrical installations or services',
    atmosphere: 'Is carried out in an area that may have a contaminated or flammable atmosphere',
    precast: 'Involves tilt-up or precast concrete',
    road: 'Is carried out on, in or adjacent to a road, railway, shipping lane or other traffic corridor that is in use by traffic other than pedestrians',
    plant: 'Is carried out in an area at a workplace in which there is any movement of powered mobile plant',
    temperature: 'Is carried out in an area in which there are artificial extremes of temperature',
    water: 'Is carried out in or near water or other liquid that involves a risk of drowning',
    diving: 'Involves diving work',
  },  fallExplanation: 'A fall from height means a person could fall from one level to a lower level. For example off a roof, a scaffold, a ladder, a slab or floor edge, or into a hole or trench. Under the Work Health and Safety Regulations 2022 (Tas), regulation 291, work that involves a risk of a person falling more than 2 metres is high risk construction work. Regulation 299 says high risk construction work needs a safe work method statement before it starts.',
  // Regulation 166 sets no distance. Its note says the Electricity Industry Safety and
  // Administration Act 1997 also applies.
  overheadLineControl: 'Keep people, plant and things out of an unsafe distance of an overhead or underground electric line (Work Health and Safety Regulations 2022 (Tas), regulation 166). The regulations set no distance, so get the electricity supply authority\'s requirements before work starts. If a safe distance is not reasonably practicable, do a risk assessment and follow those requirements. The Electricity Industry Safety and Administration Act 1997 also applies.',
};

// Checked against the official current PDF (Republication 47, effective 29 November 2025)
// read from legislation.act.gov.au, and the model WHS Regulations (5 December 2025).
const AUSTRALIAN_CAPITAL_TERRITORY = {
  id: 'act',
  name: 'Australian Capital Territory',
  loaded: true,
  instrument: 'Work Health and Safety Regulation 2011 (ACT)',
  compilation: '29 November 2025',
  versionLabel: 'republication 47, effective 29 November 2025',
  section: '299',
  sectionRef: 'section 299',
  sectionTitle: 'Safe work method statement required for high risk construction work',
  reviewHeading: 'How the controls will be implemented, monitored and reviewed',
  contents: [
    'the work that is high risk construction work',
    'the hazards and the risks to health and safety',
    'the measures to control the risks',
    'how the control measures are to be implemented, monitored and reviewed',
  ],
  // Section 291, in the regulation's words. The ACT adds light rail and item (s).
  highRisk: [
    { id: 'fall', check: 'fall', label: 'Involves a risk of a person falling more than 2m' },
    { id: 'tower', check: 'tower', label: 'Is carried out on a telecommunication tower' },
    { id: 'demolition', check: 'demolition', label: 'Involves demolition of an element of a structure that is load-bearing or otherwise related to the physical integrity of the structure' },
    { id: 'asbestos', check: 'asbestos', label: 'Involves, or is likely to involve, the disturbance of asbestos' },
    { id: 'temporary', check: 'temporary', label: 'Involves structural alterations or repairs that require temporary support to prevent collapse' },
    { id: 'confined', check: 'confined', label: 'Is carried out in or near a confined space' },
    { id: 'trench', check: 'trench', label: 'Is carried out in or near a shaft or trench with an excavated depth greater than 1.5m, or a tunnel' },
    { id: 'explosives', check: 'explosives', label: 'Involves the use of explosives' },
    { id: 'gas', check: 'gas', label: 'Is carried out on or near pressurised gas distribution mains or piping' },
    { id: 'chemicalLine', check: 'chemicalLine', label: 'Is carried out on or near chemical, fuel or refrigerant lines' },
    { id: 'electrical', check: 'electrical', label: 'Is carried out on or near energised electrical installations or services' },
    { id: 'atmosphere', check: 'atmosphere', label: 'Is carried out in an area that may have a contaminated or flammable atmosphere' },
    { id: 'precast', check: 'precast', label: 'Involves tilt-up or precast concrete' },
    { id: 'road', check: 'road', label: 'Is carried out on, in or adjacent to a road, railway (including light rail), shipping lane or other traffic corridor that is in use by traffic other than pedestrians' },
    { id: 'plant', check: 'plant', label: 'Is carried out in an area at a workplace in which there is any movement of powered mobile plant' },
    { id: 'temperature', check: 'temperature', label: 'Is carried out in an area in which there are artificial extremes of temperature' },
    { id: 'water', check: 'water', label: 'Is carried out in or near water or other liquid that involves a risk of drowning' },
    { id: 'diving', check: 'diving', label: 'Involves diving work' },
    { id: 'silica', check: 'silica', label: 'Involves processing crystalline silica material using a power tool or another mechanical method' },
  ],
  fallExplanation: 'A fall from height means a person could fall from one level to a lower level. For example off a roof, a scaffold, a ladder, a slab or floor edge, or into a hole or trench. Under the Work Health and Safety Regulation 2011 (ACT), section 291, work that involves a risk of a person falling more than 2 metres is high risk construction work. Section 299 says high risk construction work needs a safe work method statement before it starts.',
  // Section 166 sets no distance, and names the ACT electricity Acts.
  overheadLineControl: 'Keep people, plant and things out of an unsafe distance of an overhead or underground electric line (Work Health and Safety Regulation 2011 (ACT), section 166). The regulation sets no distance, so get the electricity supply authority\'s requirements before work starts. If a safe distance is not reasonably practicable, do a risk assessment and follow those requirements. The Electricity Safety Act 1971, the Utilities Act 2000 and the Utilities (Technical Regulation) Act 2014 also apply.',
};

// Checked against the official PDF read from legislation.nt.gov.au (as in force at
// 17 July 2026) and the model WHS Regulations (5 December 2025).
const NORTHERN_TERRITORY = {
  id: 'nt',
  name: 'Northern Territory',
  loaded: true,
  instrument: 'Work Health and Safety (National Uniform Legislation) Regulations 2011 (NT)',
  compilation: '17 July 2026',
  versionLabel: 'as in force at 17 July 2026',
  section: '299',
  sectionRef: 'regulation 299',
  sectionTitle: 'Safe work method statement required for high risk construction work',
  reviewHeading: 'How the controls will be implemented, monitored and reviewed',
  contents: [
    'the work that is high risk construction work',
    'the hazards and the risks to health and safety',
    'the measures to control the risks',
    'how the control measures are to be implemented, monitored and reviewed',
  ],
  // Regulation 291(1)(a) and (ab): 3 metres for residential construction work, a Class 1
  // building or a Class 10 building attached or adjacent to one; 2 metres otherwise.
  residentialFallMetres: 3,
  residentialQuestion: 'Is this residential construction work? That is work on a house (a Class 1 building), or on a garage, carport or shed attached to or next to a house (a Class 10 building).',
  residentialFallLabel: 'If it is residential construction work, involves a risk of a person falling more than 3 m',
  // Regulation 291, in the regulation's words.
  highRiskLabels: {
    fall: 'If it is not residential construction work, involves a risk of a person falling more than 2 m',
    tower: 'Is carried out on a telecommunication tower',
    demolition: 'Involves demolition of an element of a structure that is load-bearing or otherwise related to the physical integrity of the structure',
    asbestos: 'Involves, or is likely to involve, the disturbance of asbestos',
    temporary: 'Involves structural alterations or repairs that require temporary support to prevent collapse',
    confined: 'Is carried out in or near a confined space',
    trench: 'Is carried out in or near a shaft or trench with an excavated depth greater than 1.5 m, or a tunnel',
    explosives: 'Involves the use of explosives',
    gas: 'Is carried out on or near pressurised gas distribution mains or piping',
    chemicalLine: 'Is carried out on or near chemical, fuel or refrigerant lines',
    electrical: 'Is carried out on or near energised electrical installations or services',
    atmosphere: 'Is carried out in an area that may have a contaminated or flammable atmosphere',
    precast: 'Involves tilt-up or precast concrete',
    road: 'Is carried out on, in or adjacent to a road, railway, shipping lane or other traffic corridor that is in use by traffic other than pedestrians',
    plant: 'Is carried out in an area at a workplace in which there is any movement of powered mobile plant',
    temperature: 'Is carried out in an area in which there are artificial extremes of temperature',
    water: 'Is carried out in or near water or other liquid that involves a risk of drowning',
    diving: 'Involves diving work',
  },
  fallExplanation: 'A fall from height means a person could fall from one level to a lower level. For example off a roof, a scaffold, a ladder, a slab or floor edge, or into a hole or trench. Under the Work Health and Safety (National Uniform Legislation) Regulations 2011 (NT), regulation 291, construction work that is not residential is high risk construction work where a person could fall more than 2 metres. Regulation 299 says high risk construction work needs a safe work method statement before it starts.',
  residentialFallExplanation: 'A fall from height means a person could fall from one level to a lower level. For example off a roof, a scaffold, a ladder, a slab or floor edge, or into a hole or trench. Under the Work Health and Safety (National Uniform Legislation) Regulations 2011 (NT), regulation 291, residential construction work (a house, or a garage, carport or shed attached to or next to a house) is high risk construction work where a person could fall more than 3 metres. Regulation 299 says high risk construction work needs a safe work method statement before it starts.',
  // Part 4.7, with regulation 166, was repealed by the Electrical Safety Act 2022 (NT) s 300 from
  // 1 July 2024 (endnotes). Regulation 729's note says the Electricity Reform Act 2000 (its title as
  // regulation 5 gives it) imposes obligations in relation to electric lines in certain circumstances.
  overheadLineControl: 'Keep people, plant and things away from overhead and underground electric lines. Get the electricity supply authority\'s requirements before work starts and follow them. Since 1 July 2024 the Electrical Safety Act 2022 (NT) has applied in place of Part 4.7 of the regulations, and the Electricity Reform Act 2000 (NT) also imposes obligations in relation to electric lines in certain circumstances.',
};

// Checked against the authorised PDF of the Occupational Health and Safety Regulations 2017
// (Vic), S.R. No. 22/2017, authorised version 017 incorporating amendments as at 29 July 2026.
// Victoria is not a model WHS state: its list is regulation 322 and differs from section 291.
const VICTORIA = {
  id: 'vic',
  name: 'Victoria',
  loaded: true,
  instrument: 'Occupational Health and Safety Regulations 2017 (Vic)',
  compilation: '29 July 2026',
  versionLabel: 'authorised version 017, as at 29 July 2026',
  section: '327',
  sectionRef: 'regulation 327',
  sectionTitle: 'Safe work method statement required for high risk construction work',
  reviewHeading: 'How the risk control measures are to be implemented',
  // Regulation 324.
  contents: [
    'the work that is high risk construction work',
    'the hazards and risks of that work',
    'measures to control those risks',
    'how the risk control measures are to be implemented',
  ],
  // Regulation 322, in the regulation's words. check names the test in draft.js.
  highRisk: [
    { id: 'fall', check: 'fall', label: 'Where there is a risk of a person falling more than 2 metres' },
    { id: 'tower', check: 'tower', label: 'On telecommunications towers' },
    { id: 'demolition', check: 'demolitionAny', label: 'Involving demolition' },
    { id: 'asbestos', check: 'asbestos', label: 'Involving the removal or likely disturbance of asbestos' },
    { id: 'temporary', check: 'temporary', label: 'Involving structural alterations that require temporary support to prevent collapse' },
    { id: 'confined', check: 'confined', label: 'Involving a confined space' },
    { id: 'trench', check: 'trenchOrShaft', label: 'Involving a trench or shaft if the excavated depth is more than 1.5 metres' },
    { id: 'tunnel', check: 'tunnel', label: 'Involving a tunnel' },
    { id: 'explosives', check: 'explosives', label: 'Involving the use of explosives' },
    { id: 'gas', check: 'gas', label: 'On or near pressurised gas distribution mains or piping' },
    { id: 'chemicalLine', check: 'chemicalLine', label: 'On or near chemical, fuel or refrigerant lines' },
    { id: 'electrical', check: 'electrical', label: 'On or near energised electrical installations or services' },
    { id: 'atmosphere', check: 'atmosphere', label: 'In an area that may have a contaminated or flammable atmosphere' },
    { id: 'precast', check: 'precast', label: 'Involving tilt-up or precast concrete' },
    { id: 'road', check: 'roadOrRail', label: 'On or adjacent to roadways or railways used by road or rail traffic' },
    { id: 'plant', check: 'plant', label: 'At workplaces where there is any movement of powered mobile plant' },
    { id: 'temperature', check: 'temperature', label: 'In an area where there are artificial extremes of temperature' },
    { id: 'water', check: 'water', label: 'In, over or adjacent to water or other liquids where there is a risk of drowning' },
    { id: 'diving', check: 'diving', label: 'Involving diving' },
  ],
  fallExplanation: 'A fall from height means a person could fall from one level to a lower level. For example off a roof, a scaffold, a ladder, a slab or floor edge, or into a hole or trench. Under the Occupational Health and Safety Regulations 2017 (Vic), regulation 322, construction work where there is a risk of a person falling more than 2 metres is high risk construction work. Regulation 327 says that work must not be done, where it puts anyone at risk, unless a safe work method statement is prepared before it starts and the work follows it.',
  // The regulations set no distance for overhead electric lines.
  overheadLineControl: 'Keep people, plant, loads and tools away from overhead electric lines. The Occupational Health and Safety Regulations 2017 (Vic) set no distance, so get the line owner\'s requirements before work starts and follow them.',
};

// The categories a state uses. A state without its own list uses section 291.
function highRiskList(state) {
  if (state && Array.isArray(state.highRisk)) return state.highRisk;
  return HIGH_RISK.map((item) => ({ id: item.id, check: item.id, label: highRiskLabel(state, item.id) }));
}

function highRiskLabel(state, id) {
  const listed = state && Array.isArray(state.highRisk) && state.highRisk.find((entry) => entry.id === id);
  if (listed) return listed.label;
  const own = state && state.highRiskLabels && state.highRiskLabels[id];
  if (own) return own;
  const item = HIGH_RISK.find((entry) => entry.id === id);
  return item ? item.label : id;
}

const STATES = [
  QUEENSLAND,
  NEW_SOUTH_WALES,
  VICTORIA,
  SOUTH_AUSTRALIA,
  WESTERN_AUSTRALIA,
  TASMANIA,
  NORTHERN_TERRITORY,
  AUSTRALIAN_CAPITAL_TERRITORY,
];

const ALIASES = {
  queensland: 'qld',
  qld: 'qld',
  'new south wales': 'nsw',
  nsw: 'nsw',
  victoria: 'vic',
  vic: 'vic',
  'south australia': 'sa',
  sa: 'sa',
  'western australia': 'wa',
  wa: 'wa',
  tasmania: 'tas',
  tas: 'tas',
  'northern territory': 'nt',
  nt: 'nt',
  'australian capital territory': 'act',
  act: 'act',
};

function listStates() {
  return STATES.map((state) => ({
    id: state.id,
    name: state.name,
    loaded: state.loaded,
    compilation: state.compilation || '',
    versionLabel: state.versionLabel || '',
    instrument: state.instrument || '',
    fallExplanation: state.fallExplanation || '',
    residentialFallMetres: state.residentialFallMetres || 0,
    residentialQuestion: state.residentialQuestion || '',
    residentialFallExplanation: state.residentialFallExplanation || '',
  }));
}

function findState(value) {
  const key = String(value || '').trim().toLowerCase();
  const id = ALIASES[key] || key;
  return STATES.find((state) => state.id === id) || null;
}

module.exports = {
  HIERARCHY,
  SITE_FIELDS,
  HIGH_RISK,
  QUEENSLAND,
  NEW_SOUTH_WALES,
  VICTORIA,
  SOUTH_AUSTRALIA,
  WESTERN_AUSTRALIA,
  TASMANIA,
  AUSTRALIAN_CAPITAL_TERRITORY,
  NORTHERN_TERRITORY,
  STATES,
  highRiskLabel,
  highRiskList,
  listStates,
  findState,
};
