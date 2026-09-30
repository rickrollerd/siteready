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
  { id: 'liveServices', label: 'Live services' },
  { id: 'publicInterface', label: 'Public interface' },
  { id: 'otherTrades', label: 'Other trades' },
  { id: 'ground', label: 'Ground' },
  { id: 'access', label: 'Access' },
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
  section: '299',
  sectionTitle: 'Safe work method statement required for high risk construction work',
  // Section 299(2). The draft writes these four contents and does not claim
  // the statement is approved.
  contents: [
    'the high risk construction work',
    'the hazards and risks',
    'the controls',
    'how the controls will be implemented, monitored and reviewed',
  ],
  // Plain wording for a user who is not sure what a fall from height is.
  fallExplanation: 'A fall from height means a person could fall from one level to a lower level. For example off a roof, a scaffold, a ladder, a slab or floor edge, or into a hole or trench. Under the Work Health and Safety Regulation 2011 (Qld), section 291, work where a person could fall more than 2 metres is high risk construction work. Section 299 says high risk construction work needs a safe work method statement before it starts.',
  // Electrical Safety Regulation 2026 (Qld), which replaced the 2013 regulation on 1 September 2026
  // with no policy change. 3.0 m is the exclusion zone for untrained persons and operating plant
  // near lines up to 132 kV; higher voltages need more.
  overheadLineControl: 'Keep people and operating plant outside the minimum distance for the line voltage under the Electrical Safety Regulation 2026 (Qld). For a line up to 132 kV this is 3.0 m. Use a safety observer when plant could come within that distance.',
};

const STATES = [
  QUEENSLAND,
  { id: 'nsw', name: 'New South Wales', loaded: false },
  { id: 'vic', name: 'Victoria', loaded: false },
  { id: 'sa', name: 'South Australia', loaded: false },
  { id: 'wa', name: 'Western Australia', loaded: false },
  { id: 'tas', name: 'Tasmania', loaded: false },
  { id: 'nt', name: 'Northern Territory', loaded: false },
  { id: 'act', name: 'Australian Capital Territory', loaded: false },
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
    instrument: state.instrument || '',
    fallExplanation: state.fallExplanation || '',
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
  STATES,
  listStates,
  findState,
};
