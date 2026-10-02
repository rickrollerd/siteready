// The registers that go with the job steps: plant, substances, licences,
// emergency arrangements, sources and the suggested risk rating.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft } = require('../draft');
const { MATRIX, riskFor, legislationFor } = require('../register');

const slab = () => prepareDraft({
  state: 'qld', fallRisk: 'no', swmsRef: 'SR-001',
  task: 'Excavate, form, reinforce and pour a concrete house slab on ground, using a line pump and power trowel, and saw cut control joints.',
  facts: { silicaControls: 'Saw cutting is done wet.' },
});

test('the matrix matches the Queensland SWMS template', () => {
  assert.deepEqual(MATRIX[5], ['Moderate', 'Moderate', 'High', 'Extreme', 'Extreme']);
  assert.deepEqual(MATRIX[1], ['Low', 'Low', 'Low', 'Low', 'Moderate']);
  assert.equal(MATRIX[3][4], 'High');
});

test('plant, substances, licences, emergency arrangements and the reference number', () => {
  const draft = slab();
  assert.equal(draft.swmsRef, 'SR-001');
  const plant = draft.plant.map((item) => item.item);
  assert.ok(plant.includes('Concrete line pump') && plant.includes('Power trowel') && plant.includes('Concrete saw'));
  // A line pump needs no high risk work licence; a placing boom does.
  assert.match(draft.plant.find((item) => item.item === 'Concrete line pump').licence, /^No/);
  assert.ok(draft.substances.items.some((item) => /Cement/.test(item.product)));
  assert.ok(draft.qualifications.some((item) => /white card/.test(item)));
  assert.ok(draft.emergency.some((item) => item.type === 'Fire'));
  assert.ok(draft.sources.legislation.includes('Work Health and Safety Regulation 2011 (Qld)'));
});

test('each work step is rated before and after its controls, and controls lower the rating', () => {
  const draft = slab();
  assert.equal(draft.jobSteps[0].risk, null);
  const order = ['Low', 'Moderate', 'High', 'Extreme'];
  for (const step of draft.jobSteps.slice(1)) {
    assert.ok(order.indexOf(step.risk.after.level) <= order.indexOf(step.risk.before.level), step.step);
  }
  const fall = riskFor({ hazards: ['A person falls from the edge.'], controls: ['Edge protection is installed at every open edge.'] });
  assert.equal(fall.before.level, 'High');
  assert.equal(fall.after.level, 'Moderate');
});

test('sources are grouped into legislation and codes', () => {
  const sources = legislationFor(['Keep noise down. (Work Health and Safety Regulation 2011 (Qld) s 56; Managing noise and preventing hearing loss at work Code of Practice 2021 (Qld) s 2.2)']);
  assert.deepEqual(sources.legislation, ['Work Health and Safety Regulation 2011 (Qld)']);
  assert.deepEqual(sources.codes, ['Managing noise and preventing hearing loss at work Code of Practice 2021 (Qld)']);
});

test('explosive power tools are not the use of explosives', () => {
  const { highRiskMatches } = require('../draft');
  const { findState } = require('../legislation');
  const checks = (task) => highRiskMatches(task, 'no', findState('qld')).map((item) => item.check);
  assert.ok(!checks('Fix brackets with explosive power tools.').includes('explosives'));
  assert.ok(checks('Blast rock with explosives to form the footing.').includes('explosives'));
});

test('high risk categories from the task wording', () => {
  const { highRiskMatches } = require('../draft');
  const { findState } = require('../legislation');
  const checks = (task) => highRiskMatches(task, 'no', findState('qld')).map((item) => item.check);
  assert.ok(checks('Excavate and connect a new sewer line to the council main 2.4 m deep in the footpath.').includes('trench'));
  assert.ok(checks('Excavate and connect a new sewer line to the council main 2.4 m deep in the footpath.').includes('road'));
  assert.ok(!checks('Excavate the basement 9 m deep.').includes('trench'));
  assert.ok(checks('Install solar panels and an inverter on a house roof.').includes('electrical'));
  assert.ok(checks('Demolish the load-bearing wall with temporary props and a new steel beam.').includes('temporary'));
  assert.ok(checks('Install a new swimming pool fence around a filled pool.').includes('water'));
  assert.ok(!checks('Install pool fencing before the pool is filled.').includes('water'));
  assert.ok(checks('Install a gas hot water system and connect it to the existing gas line.').includes('gas'));
});

test('registers: no paint rollers as compactors, no plumbing licence for plumb and brace, licences held by others', () => {
  const draft = prepareDraft({ state: 'qld', fallRisk: 'no', trade: 'doors', task: 'Stand, plumb and brace door frames, and hang doors to masonry openings.', facts: { silicaControls: 'Drilling is done with on-tool extraction.' } });
  assert.ok(!draft.qualifications.some((item) => /Plumbing/.test(item)));
  const paint = prepareDraft({ state: 'qld', fallRisk: 'no', trade: 'painting', task: 'Paint the office walls with water-based paint using brushes and rollers.', facts: { safetyDataSheet: 'Water-based acrylic.' } });
  assert.ok(!paint.plant.some((item) => /compactor/i.test(item.item)));
});

test('round 2 review: service strikes and formwork failure are catastrophic, silica is a substance, others hold their licences', () => {
  assert.equal(riskFor({ hazards: ['Striking underground electrical, gas, water or communications services.'], controls: [] }).before.consequence, 5);
  assert.equal(riskFor({ hazards: ['Formwork or falsework fails under the wet concrete.'], controls: [] }).before.consequence, 5);
  const { registersFor } = require('../register');
  const step = (name, hazards, controls = []) => ({ step: name, hazards, controls });
  const regs = (task, steps, extra = {}) => registersFor({ task, state: 'Queensland', highRisk: [], jobSteps: steps, controls: [], ...extra });
  const tile = regs('Tile a bathroom.', [step('Cut tiles and stone', ['Respirable crystalline silica dust from cutting.'])]);
  assert.ok(tile.substances.items.some((item) => /silica/i.test(item.product)));
  const paint = regs('Mask and cut in around electrical and plumbing fittings, then paint the walls.', [step('Paint', ['Paint splashes.'])]);
  assert.ok(!paint.qualifications.some((item) => /Plumbing|Electrical work licence/.test(item)));
  const linings = regs('Fix wall linings. Leave out walls at the hoist.', [step('Fix sheets', ['Manual handling strain.'])]);
  assert.ok(!linings.plant.some((item) => /hoist/i.test(item.item)));
  const pour = regs('Place concrete to the suspended slab with a boom pump.', [step('Pump and place concrete', ['Hose whip.'])]);
  assert.match(pour.plant.find((item) => item.item === 'Concrete placing boom').licence, /pumping company/);
  const duct = regs('Install ductwork.', [step('Commission and balance the system', ['Fans, pumps or compressors start without warning.'])]);
  assert.ok(!duct.plant.some((item) => /compressor/i.test(item.item)));
  const dig = regs('Excavate a trench for conduits.', [step('Locate underground services', ['Striking underground electrical, gas, water or communications services.'])]);
  assert.ok(dig.emergency.some((row) => row.type === 'Service strike'));
  assert.ok(!dig.qualifications.some((item) => /^Rescue/.test(item)));
});

test('a task whose main work has no steps is stood down, not drafted with only access or lifting steps', () => {
  const stood = (task, trade = '') => prepareDraft({ state: 'qld', fallRisk: 'yes', trade, task, facts: { fallControl: 'Edge protection is installed around every open edge, and no one works outside it.' } });
  assert.equal(stood('Install solar panels and an inverter on a single storey house roof.').kind, 'stand-down');
  assert.equal(stood('Install a gas hot water system and connect it to the existing gas line.', 'plumbing').kind, 'stand-down');
  assert.equal(stood('Hydro-demolition and concrete repair of a balcony slab soffit from a mobile scaffold.').kind, 'stand-down');
});

test('a paint roller is not a compactor, an asphalt roller is', () => {
  const ceilings = prepareDraft({ state: 'qld', fallRisk: 'no', trade: 'painting', task: 'Paint the ceilings of a new house with a roller.', facts: { safetyDataSheet: 'Water-based acrylic.' } });
  assert.ok(!(ceilings.plant || []).some((item) => /compactor/i.test(item.item)));
  const asphalt = prepareDraft({ state: 'qld', fallRisk: 'no', task: 'Lay asphalt to a private driveway with a roller.' });
  if (asphalt.kind === 'draft') assert.ok(asphalt.plant.some((item) => /Roller/.test(item.item)));
});

test('picked job steps replace the ones found, but required steps stay and bring their questions', () => {
  const { questionsFor } = require('../draft');
  const task = 'Install whirlybird ventilators on a house roof.';
  const fall = { fallControl: 'Edge protection is installed around every open edge, and no one works outside it.' };
  const kinds = ['roofAccess', 'roofPlant', 'isolation', 'fitOff'];
  const asked = questionsFor({ state: 'qld', fallRisk: 'yes', task, kinds });
  assert.ok(asked.steps.chosen.includes('roofPlant'));
  assert.ok(asked.required.some((item) => item.id === 'isolationProcedure'));
  const draft = prepareDraft({ state: 'qld', fallRisk: 'yes', task, kinds, facts: { ...fall, isolationProcedure: 'Isolated at the main switch, locked, tagged and tested de-energised by the licensed electrician.', energisedWork: 'none' } });
  assert.equal(draft.kind, 'draft');
  assert.ok(draft.jobSteps.some((step) => step.step === 'Install plant and equipment on the roof'));
  // Only access steps picked: still stood down.
  assert.equal(prepareDraft({ state: 'qld', fallRisk: 'yes', task, kinds: ['roofAccess'], facts: fall }).kind, 'stand-down');
  // Work with its own hazard and no library steps stays stood down whatever is picked.
  assert.equal(prepareDraft({ state: 'qld', fallRisk: 'yes', task: 'Install solar panels and an inverter on a house roof.', kinds, facts: { ...fall, isolationProcedure: 'Isolated and tested.', energisedWork: 'none' } }).kind, 'stand-down');
  // Asbestos removal cannot be unticked, and comes first.
  const asbestos = prepareDraft({ state: 'qld', fallRisk: 'no', task: 'Remove asbestos cement sheets from a bathroom.', kinds: ['tileLay'], facts: { asbestosArrangement: 'A licensed removalist removes them under a control plan.' } });
  assert.equal(asbestos.jobSteps[1].step, 'Prepare the asbestos work area');
  // A picked strip-out in an existing building asks how asbestos was identified.
  assert.ok(questionsFor({ state: 'qld', fallRisk: 'no', task: 'Retile a commercial kitchen floor.', kinds: ['stripOut', 'tileLay'] }).required.some((item) => item.id === 'asbestosArrangement'));
  // Unknown kinds are ignored.
  assert.equal(prepareDraft({ state: 'qld', fallRisk: 'yes', task: 'Install solar panels on a house roof.', kinds: ['nonsense'], facts: fall }).kind, 'stand-down');
});

test('the step library lists every kind with job steps once per trade group', () => {
  const { stepLibrary } = require('../steps');
  const { ACTIVITIES } = require('../activities');
  const listed = new Set(stepLibrary().groups.flatMap((group) => group.kinds.map((kind) => kind.id)));
  for (const activity of ACTIVITIES) if (activity.steps.length) assert.ok(listed.has(activity.when), activity.when);
});

test('scope tasks carry the job steps to tick', () => {
  const { tasksFromScope } = require('../scope');
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'scenarios', 'scopes');
  const file = fs.readdirSync(dir).find((name) => name.endsWith('.txt'));
  const found = tasksFromScope(fs.readFileSync(path.join(dir, file), 'utf8'));
  assert.ok(found.tasks.length);
  assert.ok(found.tasks.every((task) => Array.isArray(task.kinds)));
  assert.ok(found.tasks.some((task) => task.kinds.length));
});
