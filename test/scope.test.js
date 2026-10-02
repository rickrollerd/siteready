// Reading a scope of works. The scopes in scenarios/scopes are real subcontract
// scopes with the project, companies and people taken out.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tasksFromScope, siteWorkLines } = require('../scope');
const { scopeText } = require('../scope-text');

const DIR = path.join(__dirname, '..', 'scenarios', 'scopes');
const read = (name) => tasksFromScope(fs.readFileSync(path.join(DIR, name), 'utf8'));

// Each scope's own trade is found.
const MAIN_TRADE = {
  'a-carpet-vinyl-rubber.txt': 'flooring',
  'a-ceilings-partitions.txt': 'plasterboard',
  'a-cleaning.txt': 'cleaning',
  'a-commercial-kitchens.txt': 'kitchens',
  'a-doors-hardware.txt': 'doors',
  'a-electrical.txt': 'electrical',
  'a-fence-gate.txt': 'fencing',
  'a-floor-wall-tiling.txt': 'tiling',
  'a-glazing.txt': 'glazing',
  'a-hydraulic.txt': 'plumbing',
  'a-joinery.txt': 'carpentry',
  'a-landscaping.txt': 'landscaping',
  'b-aluminium-windows-doors.txt': 'glazing',
  'b-civil-concrete.txt': 'structure',
  'b-mechanical-1.txt': 'mechanical',
  'b-mechanical-2.txt': 'mechanical',
  'b-painting.txt': 'painting',
  'b-reo-placement.txt': 'structure',
  'b-roofing-aluminium.txt': 'roofing',
  'b-roofing-metal.txt': 'roofing',
  'b-security.txt': 'security',
  'b-steel-rigging.txt': 'steel',
  'b-swimming-pool.txt': 'plumbing',
  'b-tiling.txt': 'tiling',
  'b-waterproof-membranes.txt': 'waterproofing',
  'c-ceilings-partitions.txt': 'plasterboard',
  'c-electrical-comms.txt': 'electrical',
  'c-fire.txt': 'fire',
  'c-frp.txt': 'structure',
  'c-hydraulics.txt': 'plumbing',
  'c-mechanical.txt': 'mechanical',
  'c-waterproofing.txt': 'waterproofing',
};

test('every scope finds its own trade and at least one task', () => {
  for (const [name, trade] of Object.entries(MAIN_TRADE)) {
    const result = read(name);
    assert.ok(result.trades.includes(trade), `${name}: found ${result.trades.join(', ')}`);
    assert.ok(result.tasks.length > 0, `${name}: no tasks`);
  }
});

test('a scope with no site work gives no tasks', () => {
  assert.equal(read('a-hospitality-technology.txt').tasks.length, 0);
});

test('the distinct, riskier work is its own task and routine work joins the trade task', () => {
  const ids = (name) => read(name).tasks.map((task) => task.id);
  assert.deepEqual(ids('b-painting.txt').sort(), ['paintExternal', 'painting']);
  for (const id of ['formwork', 'reo', 'concrete', 'propping']) assert.ok(ids('c-frp.txt').includes(id), id);
  assert.ok(ids('b-roofing-metal.txt').includes('roof'));
  assert.ok(ids('b-steel-rigging.txt').includes('steel'));
});

test('exclusions, work by others and paperwork are left out', () => {
  const lines = siteWorkLines([
    '1. SCOPE OF WORKS',
    'Supply and install cable tray and containment in the ceilings, working from scissor lifts.',
    'Kitchen subcontractor to provide Form 16 for their installation works.',
    'Submit shop drawings for approval.',
    '2. EXCLUSIONS',
    'Core drilling through slabs.',
  ].join('\n'));
  assert.deepEqual(lines, ['Supply and install cable tray and containment in the ceilings, working from scissor lifts.']);
});

test('a lead-in line is joined to its list of items', () => {
  const lines = siteWorkLines('Rigging and cranage of the structural steel for buildings 1, 2 and 3:\n· Roof frame\n· Window and door heads\n');
  assert.deepEqual(lines, ['Rigging and cranage of the structural steel for buildings 1, 2 and 3: Roof frame, Window and door heads.']);
});

test('the task reads as the work, without the contract wording', () => {
  const painting = read('b-painting.txt').tasks.find((task) => task.id === 'painting');
  assert.match(painting.task, /^Paint all internal plasterboard/);
});

test('a pasted scope, a text file and an unreadable file', async () => {
  assert.equal(await scopeText({ text: 'Install the ductwork.' }), 'Install the ductwork.');
  assert.equal(await scopeText({ file: { name: 'scope.txt', data: Buffer.from('Lay the tiles.').toString('base64') } }), 'Lay the tiles.');
  await assert.rejects(scopeText({ file: { name: 'scope.doc', data: 'AAAA' } }), /Save it as \.docx/);
  await assert.rejects(scopeText({}), /Attach the scope or paste it/);
});

test('a task from a scope keeps its trade, and its SWMS uses only that trade\'s job steps', () => {
  const { prepareDraft } = require('../draft');
  const painting = read('b-painting.txt').tasks.find((task) => task.id === 'painting');
  assert.equal(painting.trade, 'painting');
  const task = 'Paint all doors, architraves and plasterboard ceilings with water-based paint.';
  const facts = { safetyDataSheet: 'Safety data sheets for the paints are kept at the work area.' };
  const steps = (trade) => prepareDraft({ state: 'qld', task, fallRisk: 'no', trade, facts }).jobSteps.map((step) => step.step);
  assert.ok(!steps('painting').includes('Install doors, joinery and cabinets'));
  assert.ok(steps('painting').includes('Paint'));
  // Without a trade, the task is read as before.
  assert.ok(steps(undefined).includes('Install doors, joinery and cabinets'));
});

test('new fibre cement is not asbestos, and handrails or crane ties are not precast lifts', () => {
  const { questionsFor } = require('../draft');
  const asked = (task) => questionsFor({ state: 'qld', task, fallRisk: 'yes' }).required.map((item) => item.id);
  assert.ok(!asked('Cut off and grind back exposed metal, then install fibre cement protection to planters.').includes('asbestosArrangement'));
  assert.ok(asked('Cut and remove the old fibre cement eaves linings.').includes('asbestosArrangement'));
  assert.ok(!asked('Install edge protection and handrails to precast parapets, and form penetrations.').includes('erectionDesign'));
  assert.ok(!asked('Line walls with lightweight concrete shaft wall panels and close up walls at the crane ties.').includes('erectionDesign'));
  assert.ok(asked('Erect six precast concrete wall panels using a mobile crane.').includes('erectionDesign'));
});
