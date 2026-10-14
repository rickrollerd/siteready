// Two AI readings of the same formwork, reinforcement and pour scope (the messy-user test scope, neutral
// test text), shaped as staging returned them on 14 October 2026 (screenshots and SWMS text in the run
// folders): the foreman's reading put the reinforcement in the formwork package, read the edge protection
// as "Access equipment" and kept the joint cutting and grinding with the pour (6 packages); the office
// admin's reading named the reinforcement "Trade installation: suspended slabs and stairs" and made the
// cutting and grinding a package of its own (8 packages). The AI's job step groups are as the drafts printed.
const row = (activity, pack, clause, { where = '', plant = '', conditions = '', type = 'Site work' } = {}) => ({ activity, type, package: pack, crew: '', clause, quotes: [], where, plant, conditions, unknowns: '', matrixColumn: '' });

const DUTIES = (pack) => [
  row('Provide Safe Work Method Statements for all high risk construction work', pack, '1.2', { type: 'Duty' }),
  row('Attend the site induction and daily pre-start meetings', pack, '1.3', { type: 'Duty' }),
  row('Provide reinforcement inspection hold points for the engineer before each pour', pack, '3.3', { type: 'Duty' }),
  row('Manage own deliveries to the site loading zone', pack, '5.3', { type: 'Duty' }),
];

function foreman() {
  return {
    activities: [
      row('Erect, strip and remove formwork and propping to suspended slabs, including slab edges, set downs, drop panels and band beams', 'Trade installation: suspended slabs', '2.1', { where: 'Suspended slabs, Levels 1, 2 and roof', plant: 'Formwork' }),
      row('Erect and strip formwork and propping to in situ concrete stairs and landings', 'Trade installation: stairs', '2.2', { where: 'Stairs between all levels' }),
      row('Install back propping to slabs below', 'Trade installation: suspended slabs', '2.3'),
      row('Form up, cover and mark penetrations, openings and recesses in slabs', 'Trade installation: suspended slabs', '2.5', { where: 'Suspended slabs' }),
      row('Install cast in items (cast in plates, ferrules, conduits)', 'Trade installation: suspended slabs', '2.6', { where: 'suspended slabs' }),
      row('Place and fix reinforcement and mesh to suspended slabs, stairs, band beams and drop panels', 'Trade installation: suspended slabs', '3.1', { where: 'Suspended slabs, stairs, band beams and drop panels' }),
      row('Install, maintain and remove edge protection to slab edges and stair voids', 'Access equipment', '2.4', { where: 'Slab edges and stair voids' }),
      row('Pump and place concrete to suspended slabs and stairs', 'Trade installation: concrete', '4.1', { where: 'Suspended slabs and stairs', conditions: 'Concrete washout to the builder\'s designated washout bay only; possible night pours', plant: 'Concrete pump, boom pump or line pump' }),
      row('Vibrate, screed and finish concrete, including broom finish to stairs', 'Trade installation: concrete', '4.2', { where: 'Suspended slabs and stairs', plant: 'Concrete vibrator, screed' }),
      row('Power trowel finish to slabs', 'Trade installation: concrete', '4.2', { where: 'Suspended slabs', plant: 'Power trowel' }),
      row('Cure concrete with curing compound', 'Trade installation: concrete', '4.3'),
      row('Saw cut control joints to slabs', 'Trade installation: concrete', '4.4', { where: 'Suspended slabs', conditions: 'Within 24 hours of the pour', plant: 'Concrete saw' }),
      row('Grind slab edges, nibs and minor surface defects', 'Trade installation: concrete', '4.5', { where: 'Slab edges and slab surfaces', plant: 'Grinder' }),
      row('Crane lift formwork, reinforcement bundles and stair forms', 'Plant lifting and cranage', '5.1', { plant: 'Mobile crane' }),
      row('Load out materials on the ground floor with a forklift and telehandler', 'Deliveries and materials handling', '5.4', { plant: 'Forklift, telehandler' }),
      row('Unload deliveries at the site loading zone', 'Deliveries and materials handling', '5.3'),
      row('Clean up work areas daily and remove formwork offcuts, tie wire, packaging and concrete waste from site', 'Clean up', '6.1'),
      row('Wash out concrete equipment at the builder\'s designated washout bay', 'Clean up', '6.2'),
      ...DUTIES('Supervision').slice(0, 3),
      row('Hold tickets for crane, dogging and forklift operation', 'Plant lifting and cranage', '5.1', { type: 'Duty' }),
      row('Attend the engineer\'s inspections', 'Supervision', '3.3', { type: 'Duty' }),
    ],
    packages: [
      { package: 'Trade installation: suspended slabs', groups: ['formwork', 'propping', 'castIn', 'reo'], unmatched: [], byOthers: [] },
      { package: 'Trade installation: stairs', groups: ['formwork'], unmatched: [], byOthers: [] },
      { package: 'Access equipment', groups: ['edgeProtectionInstall'], unmatched: [], byOthers: [] },
      { package: 'Trade installation: concrete', groups: ['slabPour', 'concrete', 'sawCut'], unmatched: [], byOthers: [] },
      { package: 'Plant lifting and cranage', groups: ['craneInterface'], unmatched: [], byOthers: [] },
      { package: 'Deliveries and materials handling', groups: ['forklift', 'carpLoad'], unmatched: [], byOthers: [] },
      { package: 'Clean up', groups: ['wasteRemoval'], unmatched: [], byOthers: [] },
    ],
    byOthers: [],
    conflicts: [],
  };
}

function admin() {
  return {
    activities: [
      row('Erect, strip and remove formwork and propping to suspended slabs, slab edges, set downs, drop panels and band beams', 'Trade installation: suspended slabs', '2.1', { where: 'Levels 1, 2 and roof' }),
      row('Erect and strip formwork and propping to in situ concrete stairs and landings', 'Trade installation: stairs', '2.2'),
      row('Install and remove back propping to slabs below', 'Trade installation: suspended slabs', '2.3'),
      row('Form up penetrations, openings and recesses in slabs', 'Trade installation: suspended slabs', '2.5'),
      row('Install cast in items (cast in plates, ferrules, conduits)', 'Trade installation: suspended slabs', '2.6'),
      row('Supply, install and maintain edge protection to slab edges and stair voids', 'Edge protection', '2.4'),
      row('Cover and mark penetrations and openings', 'Edge protection', '2.5'),
      row('Place and fix reinforcement and mesh including bar chairs, spacers and starter bars', 'Trade installation: suspended slabs and stairs', '3.1', { where: 'Suspended slabs, stairs, band beams and drop panels' }),
      row('Place concrete to suspended slabs and stairs using a concrete pump', 'Concrete pumping and placement', '4.1', { where: 'Suspended slabs and stairs', conditions: 'Possible night pours', plant: 'Concrete pump, boom pump or line pump' }),
      row('Vibrate, screed and finish concrete including broom finish to stairs', 'Concrete pumping and placement', '4.2', { where: 'Suspended slabs and stairs', plant: 'Vibrators' }),
      row('Power trowel finish to slabs', 'Concrete pumping and placement', '4.2', { where: 'Suspended slabs', plant: 'Power trowel' }),
      row('Cure concrete with curing compound', 'Concrete pumping and placement', '4.3'),
      row('Saw cut control joints to slabs', 'Concrete cutting and grinding', '4.4', { plant: 'Concrete saw' }),
      row('Grind slab edges, nibs and minor surface defects', 'Concrete cutting and grinding', '4.5', { plant: 'Grinder' }),
      row('Crane lift formwork, reinforcement bundles and stair forms', 'Plant lifting and cranage', '5.1', { plant: 'Mobile crane with operator and dogman' }),
      row('Engage a mobile crane with operator and dogman', 'Plant lifting and cranage', '5.1'),
      row('Load out materials on the ground floor with a forklift and telehandler', 'Deliveries and materials handling', '5.4', { plant: 'Forklift, telehandler' }),
      row('Manage deliveries to the site loading zone', 'Deliveries and materials handling', '5.3'),
      row('Clean up work areas daily and remove offcuts, tie wire, packaging and concrete waste', 'Clean up', '6.1'),
      row('Wash out concrete equipment at the designated washout bay', 'Clean up', '6.2'),
      ...DUTIES('Supervision'),
    ],
    packages: [
      { package: 'Trade installation: suspended slabs', groups: ['formwork', 'propping', 'castIn'], unmatched: [], byOthers: [] },
      { package: 'Trade installation: stairs', groups: ['formwork'], unmatched: [], byOthers: [] },
      { package: 'Edge protection', groups: ['edgeProtectionInstall'], unmatched: [], byOthers: [] },
      { package: 'Trade installation: suspended slabs and stairs', groups: ['reo'], unmatched: [], byOthers: [] },
      { package: 'Concrete pumping and placement', groups: ['concrete', 'slabPour'], unmatched: [], byOthers: [] },
      { package: 'Concrete cutting and grinding', groups: ['sawCut', 'floorGrind'], unmatched: [], byOthers: [] },
      { package: 'Plant lifting and cranage', groups: ['crane'], unmatched: [], byOthers: [] },
      { package: 'Deliveries and materials handling', groups: ['forklift', 'carpLoad'], unmatched: [], byOthers: [] },
      { package: 'Clean up', groups: ['wasteRemoval'], unmatched: [], byOthers: [] },
    ],
    byOthers: [],
    conflicts: [],
  };
}

module.exports = { foreman, admin };
