// Scopes and stand-in AI readings for the SiteLink scope tests (Goal 12 stage 4). Made-up companies
// and sites only. Each scope's quotes are its own words, so the readings pass the check against the
// brief. Some carry prices on purpose: the reading below quotes them, as an AI that broke the brief would.

const FILLER = 'The Subcontractor shall carry out the works in accordance with the drawings and specifications, keep the work area tidy, and coordinate its work with other trades on the site at all times.';

const FORMWORK = [
  'Subcontract scope of works: Formwork',
  '1.1 Supply, erect and strip formwork to suspended slabs on levels 1 to 6.',
  '1.2 Erect and dismantle edge protection to slab edges.',
  '1.3 The Subcontractor supplies all cranage for the formwork works.',
  '1.4 Lift formwork with the tower crane.',
  '1.5 Fabricate column forms in the Subcontractor\'s workshop.',
  '2.1 The lump sum price is $1,234,567.00 excluding GST.',
  '2.2 Labour rate for day works is $95.00/hr.',
  '2.3 Provide a site supervisor at all times.',
  FILLER,
  FILLER,
].join('\n');

const FORMWORK_READING = {
  activities: [
    { activity: 'Erect and strip formwork to suspended slabs', type: 'Site work', package: 'Formwork and falsework', crew: 'Formworkers', clause: '1.1', quotes: ['Supply, erect and strip formwork to suspended slabs on levels 1 to 6.', '2.1 The lump sum price is $1,234,567.00 excluding GST.'], where: 'Levels 1 to 6', plant: '', conditions: '', unknowns: 'Who provides the hoist for stripping; whether the lump sum price of $1,234,567.00 covers night pours', matrixColumn: '' },
    { activity: 'Erect and dismantle edge protection to slab edges (rate $95.00/hr)', type: 'Site work', package: 'Edge protection', crew: 'Formworkers', clause: '1.2', quotes: ['Erect and dismantle edge protection to slab edges.'], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' },
    { activity: 'Lift formwork with the tower crane', type: 'Site work', package: 'Plant lifting and cranage', crew: 'Crane crew', clause: '1.3, 1.4', quotes: ['The Subcontractor supplies all cranage for the formwork works.', 'Lift formwork with the tower crane.'], where: '', plant: 'Tower crane', conditions: '', unknowns: 'Whether the builder\'s tower crane is available for formwork lifts', matrixColumn: '' },
    { activity: 'Fabricate column forms', type: 'Off-site work', package: 'Off-site fabrication', crew: 'Workshop', clause: '1.5', quotes: ['Fabricate column forms in the Subcontractor\'s workshop.'], where: 'Workshop', plant: '', conditions: '', unknowns: '', matrixColumn: '' },
    { activity: 'Provide a site supervisor', type: 'Duty', package: 'Supervision', crew: 'Supervisor', clause: '2.3', quotes: ['Provide a site supervisor at all times.'], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' },
  ],
  byOthers: [],
  conflicts: [
    { clauseA: '2.1', quoteA: '2.1 The lump sum price is $1,234,567.00 excluding GST.', clauseB: '2.2', quoteB: '2.2 Labour rate for day works is $95.00/hr.', why: 'Day works at $95.00/hr may be in the lump sum.', confidence: 'Low' },
  ],
};

const ELECTRICAL = [
  'Subcontract scope of works: Electrical services',
  '3.1 Install cable tray and pull cables through the ceiling space on all levels.',
  '3.2 Crane lifts for the switchboards are by the builder.',
  '3.3 Test and commission the switchboards.',
  FILLER,
  FILLER,
].join('\n');

const ELECTRICAL_READING = {
  activities: [
    { activity: 'Pull cables through the ceiling space', type: 'Site work', package: 'Trade installation: ceiling space', crew: 'Electricians', clause: '3.1', quotes: ['Install cable tray and pull cables through the ceiling space on all levels.'], where: 'All levels', plant: 'Scissor lift', conditions: '', unknowns: 'Whether the ceiling grid is in before cabling starts', matrixColumn: '' },
    { activity: 'Lift switchboards with a crane', type: 'Site work', package: 'Plant lifting and cranage', crew: 'Crane company', clause: '3.2', quotes: ['Crane lifts for the switchboards are by the builder.'], where: '', plant: 'Mobile crane', conditions: '', unknowns: '', matrixColumn: '' },
    { activity: 'Test and commission the switchboards', type: 'Site work', package: 'Testing and commissioning', crew: 'Electricians', clause: '3.3', quotes: ['Test and commission the switchboards.'], where: '', plant: '', conditions: 'Energised switchboards', unknowns: '', matrixColumn: '' },
  ],
  byOthers: [],
  conflicts: [],
};

// A scope the stand-in reads as one activity, its first numbered line: for counting readings.
function plainScope(name) {
  return [`Subcontract scope of works: ${name}`, `4.1 Install the ${name.toLowerCase()} throughout the building.`, FILLER, FILLER].join('\n');
}

// A drawing's text layer: labels, grid lines and levels in capitals.
const DRAWING = Array.from({ length: 30 }, (_, i) => `GRID ${String.fromCharCode(65 + (i % 26))}${i} LEVEL ${i % 7} RL ${(i * 3.1).toFixed(3)} DWG A-${100 + i} REV C`).join('\n');

// A price schedule: most of its lines are prices.
const PRICE_LIST = ['PRICE SCHEDULE', ...Array.from({ length: 20 }, (_, i) => `${i + 1}. Supply and install item ${i + 1} to the plans and the specification for the works $${(i + 1) * 1250}.00`), 'TOTAL PRICE EXCLUDING GST $262,500.00', FILLER].join('\n');

module.exports = { FORMWORK, FORMWORK_READING, ELECTRICAL, ELECTRICAL_READING, plainScope, DRAWING, PRICE_LIST, FILLER };
