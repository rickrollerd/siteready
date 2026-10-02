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
  assert.ok(ids('b-steel-rigging.txt').includes('steelErect'));
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

test('review fixes: trench depth threshold, harness only when used, trade-limited questions, roof access, PPE from steps', () => {
  const { prepareDraft, questionsFor } = require('../draft');
  const draft = (input) => prepareDraft({ state: 'qld', fallRisk: 'no', ...input });
  // "1.5 m deep or more" is a threshold, so the trench still counts as deep, and machine digging is mobile plant.
  const trench = draft({ trade: 'electrical', task: 'Excavate trenches for underground conduits, backfill and compact.', facts: { trenchSupport: 'Trenches 1.5 m deep or more are shored with a trench shield.' } });
  assert.ok(trench.highRisk.some((item) => /trench/.test(item)) && trench.highRisk.some((item) => /mobile plant/.test(item)));
  // Scissor lifts: no harness lines and no harness ticked.
  const scissor = draft({ trade: 'painting', fallRisk: 'yes', task: 'Paint the ceilings with water-based paint.', facts: { safetyDataSheet: 'The products used are water-based acrylics.', fallControl: 'Scissor lifts with guardrails are used for all work above 2 m.' } });
  const lines = scissor.jobSteps.flatMap((step) => step.controls).join('\n');
  assert.ok(!/In a boom EWP|Where fall arrest is used/.test(lines));
  assert.ok(!scissor.ppe.flatMap((group) => group.items).find((item) => item.id === 'harness').ticked);
  // Roofing does not ask for a steel erection sequence.
  assert.ok(!questionsFor({ state: 'qld', trade: 'roofing', fallRisk: 'yes', task: 'Install prepainted steel roof sheeting.' }).required.some((item) => item.id === 'erectionSequence'));
  // A plumber's roof work gets roof access; a roofer gets the roofing steps, not both.
  const steps = (input) => draft({ fallRisk: 'yes', facts: { fallControl: 'Edge protection is installed around every open edge, and no one works outside it.' }, ...input }).jobSteps.map((step) => step.step);
  // The plumber's solar hot water install gets roof access and the water heater connection.
  const solar = draft({ trade: 'plumbing', fallRisk: 'yes', task: 'Install the solar hot water system on the roof.', facts: { fallControl: 'Edge protection is installed around every open edge, and no one works outside it.' } });
  assert.equal(solar.kind, 'draft');
  assert.ok(solar.jobSteps.some((step) => step.step === 'Get onto the roof and set up fall protection') && solar.jobSteps.some((step) => step.step === 'Disconnect and connect the water heater'));
  assert.ok(!steps({ trade: 'roofing', task: 'Fix roof sheeting on the roof.' }).includes('Get onto the roof and set up fall protection'));
  // Knee pads called for in the steps are ticked.
  const vinyl = draft({ trade: 'flooring', task: 'Install sheet vinyl and carpet tiles with adhesive.', facts: { safetyDataSheet: 'The products used are epoxy adhesive.' } });
  assert.ok(vinyl.ppe.flatMap((group) => group.items).find((item) => item.id === 'kneePads').ticked);
});

test('review fixes: sun line kept when a respirator is added, task-only lines, silica assessment for door fixings', () => {
  const { prepareDraft } = require('../draft');
  const lines = (input) => prepareDraft({ state: 'qld', fallRisk: 'no', ...input }).jobSteps.flatMap((step) => step.controls).join('\n');
  // Grinding brings in a respirator, which rebuilds the steps; the sun and heat line must survive that.
  const concrete = lines({ trade: 'structure', task: 'Pump, place and finish concrete to the ground floor slab, and grind high spots.' });
  assert.match(concrete, /Sun and heat/);
  // Footings and pits are named only when the task has them.
  const reo = (task) => lines({ trade: 'structure', task });
  assert.match(reo('Fix reo to the footings and lift pit.'), /Footings, thickenings and pits are entered/);
  assert.doesNotMatch(reo('Fix reo to the suspended slabs and landings.'), /Footings, thickenings and pits are entered/);
  // Drilling masonry for door frames carries the written silica assessment.
  assert.match(lines({ trade: 'doors', task: 'Install door frames and hang doors to masonry openings.', facts: { silicaControls: 'Drilling is done with on-tool extraction.' } }), /Assess in writing before starting whether the processing is high risk/);
});

test('fixing framing to blockwork is silica processing, and work with an outdoor part gets sun protection', () => {
  const { prepareDraft } = require('../draft');
  const draft = prepareDraft({ state: 'qld', fallRisk: 'no', trade: 'plasterboard', task: 'Frame external and internal walls, including over blockwork, and line the eaves.', facts: { silicaControls: 'Drilling is done with on-tool extraction.' } });
  assert.ok(draft.jobSteps.some((step) => step.step === 'Drill or cut concrete, masonry or stone'));
  assert.ok(draft.ppe.flatMap((group) => group.items).find((item) => item.id === 'sunscreen').ticked);
});

test('a cutting step outside the trade gives way to the general drilling step', () => {
  const { prepareDraft } = require('../draft');
  // The silica answer mentions cutting blockwork, which is masonry work, not plasterboard work.
  const draft = prepareDraft({ state: 'qld', fallRisk: 'no', trade: 'plasterboard', task: 'Frame internal ceilings, bulkheads and external and internal walls (including over blockwork) in steel stud.', facts: { silicaControls: 'Drilling and cutting blockwork are done with on-tool dust extraction.' } });
  assert.ok(draft.jobSteps.some((step) => step.step === 'Drill or cut concrete, masonry or stone'));
});

test('slabs on ground: ground steps instead of deck steps, plant ticked, no deck load question', () => {
  const { prepareDraft, questionsFor } = require('../draft');
  const task = 'Excavate, form, reinforce and pour a concrete house slab on ground with edge beams, on a vapour barrier, finished with a power trowel.';
  const draft = prepareDraft({ state: 'qld', fallRisk: 'no', task });
  const steps = draft.jobSteps.map((step) => step.step);
  for (const step of ['Prepare the ground and set out', 'Set edge forms and prepare the base', 'Place and tie reo on the ground', 'Place concrete', 'Finish, joint and cure']) assert.ok(steps.includes(step), step);
  for (const step of ['Lift reo onto the deck', 'Pump and place concrete', 'Work in the trench']) assert.ok(!steps.includes(step), step);
  assert.ok(draft.highRisk.some((item) => /mobile plant/.test(item)));
  assert.ok(!questionsFor({ state: 'qld', fallRisk: 'no', task }).required.some((item) => item.id === 'loadLimits'));
  // A reo crew on ground and suspended slabs keeps the reo steps only.
  const reo = prepareDraft({ state: 'qld', fallRisk: 'yes', trade: 'structure', task: 'Place and tie reo to the ground slabs and suspended slabs.', facts: { fallControl: 'Edge protection is installed at every open edge.', loadLimits: 'Loads as marked on the drawings.' } });
  assert.ok(!reo.jobSteps.some((step) => step.step === 'Place concrete'));
});

test('a civil scope with slabs on ground gives one slab on ground task', () => {
  const ids = read('b-civil-concrete.txt').tasks.map((task) => task.id);
  assert.ok(ids.includes('slabGround'));
  for (const id of ['formwork', 'reo', 'concrete']) assert.ok(!ids.includes(id), id);
  // A reo scope with suspended slabs keeps its reo task.
  assert.ok(!read('b-reo-placement.txt').tasks.some((task) => task.id === 'slabGround'));
});

test('a concreter pouring ground and suspended slabs gets one set of pour steps, not the ground preparation', () => {
  const { prepareDraft } = require('../draft');
  const draft = prepareDraft({ state: 'qld', fallRisk: 'yes', trade: 'structure', task: 'Pump, place and finish concrete to the ground floor slab on ground and the level 1 suspended slab, and saw cut control joints.', facts: { fallControl: 'Edge protection is installed at every open edge.', loadLimits: 'Loads as marked on the drawings.', silicaControls: 'Saw cutting is done wet.' } });
  const steps = draft.jobSteps.map((step) => step.step);
  // One set of pour steps, with the ground slab and joint cutting lines in them.
  for (const step of ['Set up the concrete pump and placing boom', 'Pump and place concrete', 'Finish concrete']) assert.ok(steps.includes(step), step);
  for (const step of ['Prepare the ground and set out', 'Place concrete', 'Saw cut concrete', 'Remove cut sections']) assert.ok(!steps.includes(step), step);
  assert.ok(draft.jobSteps.flatMap((step) => step.controls).some((line) => /^Where control joints are saw cut/.test(line)));
});
