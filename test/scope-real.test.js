// Reading real subcontract scopes: lists under a lead-in, interface matrices, work by
// others, contract wording and repeated tasks. The lines here are short made-up examples
// of the patterns found in real scopes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { tasksFromScope, siteWorkLines } = require('../scope');

test('items lettered "a." under a lead-in of contract wording are each a line of work', () => {
  const lines = siteWorkLines([
    'MECHANICAL SERVICES',
    'SCOPE OF WORKS',
    '1. Document, fabricate, supply, deliver, unload, handle, hoist, install and certify the following mechanical services items in accordance with the subcontract documents and relevant codes:-',
    'a. Split air conditioning systems to the switch room and the comms room.',
    'b. Ductwork including straight and curved sections;',
    'c. Fire dampers including operating motors and fusible links;',
    '2. Balancing and commissioning of all new air conditioning installations.',
  ].join('\n'));
  assert.ok(lines.includes('Install split air conditioning systems to the switch room and the comms room.'), lines.join('\n'));
  assert.ok(lines.includes('Install ductwork including straight and curved sections.'));
  assert.ok(lines.includes('Install fire dampers including operating motors and fusible links.'));
  // The lead-in sentence itself is contract wording, not a line of work.
  assert.ok(!lines.some((line) => /hoist/i.test(line)), lines.join('\n'));
});

test('short items under a lead-in read as the work, without the handling verbs', () => {
  const lines = siteWorkLines([
    'LANDSCAPING',
    'SCOPE OF WORKS',
    '1. Supply, fabricate, deliver, unload, handle, hoist, install and certify the following landscaping items in accordance with the subcontract documents:',
    '· Turfing;',
    '· Mulching;',
    '· Root barriers;',
  ].join('\n'));
  assert.deepEqual(lines, ['Install turfing.', 'Install mulching.', 'Install root barriers.']);
});

test('a trade\'s systems listed without a verb under its heading make the trade\'s main task', () => {
  const result = tasksFromScope([
    'Scope of Works - Fire Services',
    'TRADE SPECIFIC',
    'Fire Sprinkler Systems',
    '(a) Wet pipe sprinkler protection generally throughout all buildings;',
    '(b) Deluge sprinkler protection to the selected dayroom areas;',
    'Fire Hydrant and Hose Reel Systems',
    '(a) Internal fire hydrants and fire hose reels throughout;',
  ].join('\n'), 'qld');
  assert.deepEqual(result.trades, ['fire']);
  const fire = result.tasks.find((task) => task.id === 'fire');
  assert.ok(fire, result.tasks.map((task) => task.title).join(', '));
  assert.match(fire.task, /Wet pipe sprinkler protection/);
  assert.match(fire.task, /Internal fire hydrants/);
});

test('an interface matrix keeps the rows marked for the subcontractor and drops the rest', () => {
  const lines = siteWorkLines([
    'Scope of Works - Fire Services',
    'C-3\tInterface Works with Electrical Services Subcontractor',
    '\tRESPONSIBILITY',
    '',
    '\tFire',
    '\tElectrical',
    '',
    '\t ',
    '\tDemolition associated with the old visitor building',
    '\t ',
    '\t ',
    '',
    '\tC-3.01',
    '\tInstall smoke detectors in the switch rooms and risers.',
    '\tX',
    '\t ',
    '',
    '\tC-3.02',
    '\tGeneral lighting and temporary power for construction purposes.',
    '\t ',
    '\tX',
  ].join('\n'));
  assert.deepEqual(lines, ['Install smoke detectors in the switch rooms and risers.']);
});

test('a template line still waiting for its choice of party is not work', () => {
  const lines = siteWorkLines([
    'GENERAL SCOPE - ALL TRADES',
    '(i) General access, egress and emergency lighting:',
    '\t<<Main Contractor / Subcontractor>>',
    '(iii) Initial supply and erection and final removal of scaffolding at the following locations:',
    '\t<<Specify locations>>',
  ].join('\n'));
  assert.deepEqual(lines, []);
});

test('standards clauses, site rules, general duties and training are not work', () => {
  const lines = siteWorkLines([
    'SCOPE OF WORKS',
    'All works to be completed in accordance with AS 2785 Suspended Ceilings - Design and Installation.',
    'It is a site safety requirement that no conduits are installed in the slab unless there is no alternative.',
    'Provide any required traffic control associated with their works.',
    'All works are to be installed to the highest standard expected of a hotel.',
    'Training of the client users in operating the access control system.',
    'The builder will install the temporary hoardings to the site boundary.',
    'Install suspended grid ceilings to the corridors and offices.',
  ].join('\n'));
  assert.deepEqual(lines, ['Install suspended grid ceilings to the corridors and offices.']);
});

test('work by others in a note or a sentence is taken out and the rest of the line kept', () => {
  const lines = siteWorkLines([
    'SCOPE OF WORKS',
    'Supply and install the stainless steel exhaust canopies. (Fans, ductwork and controls by others).',
    'Doors are to be final painted on site (by others).',
    'All doors are supplied ready to be painted.',
    'Install the roof flashings to all penetrations. Under flashings by the builder.',
  ].join('\n'));
  assert.deepEqual(lines, ['Supply and install the stainless steel exhaust canopies.', 'Install the roof flashings to all penetrations.']);
});

test('rates and supply-only items in a list are not work', () => {
  const lines = siteWorkLines([
    'Place, tie and chair all reinforcing steel for the following:',
    '· Footings and ground slabs',
    '· Agreed Rates',
    '· Reinforcing $____ per tonne',
    '· Day labour $____ per hour',
    '· Supply tie wire',
  ].join('\n'));
  assert.deepEqual(lines, ['Place, tie and chair all reinforcing steel for the following: Footings and ground slabs.']);
});

test('a table cell that names work does not bring a warranty section back into the work', () => {
  const lines = siteWorkLines([
    'SCOPE OF WORKS',
    'Paint all internal plasterboard walls and ceilings in a three coat system.',
    'MAINTENANCE AND WARRANTIES',
    '\tCaulking',
    'External and internal paint finishes other than',
  ].join('\n'));
  assert.deepEqual(lines, ['Paint all internal plasterboard walls and ceilings in a three coat system.']);
});

test('an item named in the exclusions is left out of a list of items', () => {
  const lines = siteWorkLines([
    'ELECTRICAL SERVICES',
    '1. Supply, deliver, install and certify the following electrical services items in accordance with the subcontract documents:',
    '· Distribution boards',
    '· CCTV system',
    'EXCLUSIONS:',
    '· CCTV',
  ].join('\n'));
  assert.deepEqual(lines, ['Install distribution boards.']);
});

test('two tasks made from the same lines are one task with both kinds of work', () => {
  const result = tasksFromScope([
    'STRUCTURAL STEEL RIGGING',
    'SCOPE OF WORKS',
    'Rigging and cranage of the structural steel for buildings 1, 2 and 3:',
    '· Roof frame',
    '· Window and door heads',
  ].join('\n'), 'qld');
  assert.equal(result.tasks.length, 1, result.tasks.map((task) => task.title).join(', '));
  assert.ok(['steelErect', 'steelLift'].every((kind) => result.tasks[0].kinds.includes(kind)));
});

test('a description of the facilities with no work verbs gives no task', () => {
  const result = tasksFromScope([
    'HOSPITALITY TECHNOLOGY CONSULTANCY',
    'The central facilities comprise a foyer, a restaurant and bar, a commercial kitchen, a lagoon swimming pool and hot tub, a pool plant room and a gymnasium.',
    'Building 5 is the pool plant room with the filtration plant and chemical dosing equipment.',
    'The day spa has five treatment rooms, a sauna and a plunge pool.',
  ].join('\n'), 'qld');
  assert.deepEqual(result.tasks, []);
});

test('a cleaning scope titled "final clean" is a cleaning scope, whatever surfaces it names', () => {
  const result = tasksFromScope([
    'BUILDERS/FINAL CLEAN',
    'SCOPE OF WORKS',
    '1. Clean all wet areas and kitchens.',
    '2. Clean all window glass and remove paint overspray from the frames.',
    '3. Clean all window frames and remove paint spots from the window glass.',
  ].join('\n'), 'qld');
  assert.ok(result.trades.includes('cleaning'), result.trades.join(', '));
  assert.ok(!result.trades.includes('painting'), result.trades.join(', '));
});

test('work the head contractor does, and legal clauses, are not the subcontractor\'s work', () => {
  const lines = siteWorkLines([
    'SCOPE OF WORKS',
    'The high propping to the towers will be supplied, erected and dismantled by the Contractor.',
    'Set out all slab edges and penetrations. The Contractor shall provide one benchmark and four grid lines.',
    'Materials demolished as a result of the works shall become the property of the Subcontractor.',
    'Demolishing or destroying any reproduction of those documents without notice is not permitted.',
  ].join('\n'));
  assert.deepEqual(lines, ['Set out all slab edges and penetrations.']);
});

test('the general trade conditions that sit in every subcontract are not this trade\'s work', () => {
  const lines = siteWorkLines([
    'TRADE CONDITIONS OF CONTRACT - FORMWORK',
    '1. Strip and remove all formwork and back prop the slabs.',
    'TRADE CONDITIONS OF CONTRACT - GENERAL (ALL SUBCONTRACTS)',
    '1. Locate and identify existing services before excavation commences.',
  ].join('\n'));
  assert.deepEqual(lines, ['Strip and remove all formwork and back prop the slabs.']);
});

test('a lead-in naming the work carries over the headings of the work areas under it', () => {
  const lines = siteWorkLines([
    'Description of Work Area',
    'The works include the supply, installation and or erection of formwork and associated items to the following general building elements and as further defined by the drawings:',
    'Basement',
    '· The suspended slabs, beams and ramps to basement 2',
    '· In situ stair flights and landings',
    'Tower',
    '· Suspended slabs and beams level 1 to 12',
  ].join('\n'));
  assert.deepEqual(lines, [
    'Formwork to the suspended slabs, beams and ramps to basement 2.',
    'Formwork to in situ stair flights and landings.',
    'Formwork to suspended slabs and beams level 1 to 12.',
  ]);
});

test('a deck left clear for the following trades is not their work', () => {
  const result = tasksFromScope([
    'FORMWORK',
    'SCOPE OF WORKS',
    'Erect the suspended deck formwork and falsework to all levels.',
    'Strip the deck formwork and falsework after each pour is approved.',
    'Provide a clear deck for precast, reinforcement and PT placement, with edge protection to allow following trades to commence.',
  ].join('\n'), 'qld');
  assert.ok(!result.tasks.some((task) => ['reo', 'precast'].includes(task.id)), result.tasks.map((task) => task.title).join(', '));
});

test('a task with very many lines is split into the parts of the scope they come from', () => {
  const area = (name, count) => [name, ...Array.from({ length: count }, (_, i) => `${i + 1}. Erect and strip the suspended deck formwork to ${name.toLowerCase()} pour ${i + 1}.`)];
  const result = tasksFromScope(['FORMWORK', 'SCOPE OF WORKS', ...area('Basement', 14), ...area('Tower', 14)].join('\n'), 'qld');
  const formwork = result.tasks.filter((task) => task.id === 'formwork');
  assert.deepEqual(formwork.map((task) => task.title).sort(), ['Formwork and falsework: Basement', 'Formwork and falsework: Tower']);
});
