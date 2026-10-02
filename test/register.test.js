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
  assert.equal(stood('Remove the old water heater and install new pool shell lining with sprayed concrete.').kind, 'stand-down');
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
  assert.equal(prepareDraft({ state: 'qld', fallRisk: 'no', task: 'Hydro-demolition of a balcony slab soffit.', kinds: ['demolition', 'propping'], facts: { temporarySupport: 'Propped to the engineer\'s design PD-1.' } }).kind, 'stand-down');
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

test('library coverage: everyday jobs get their own job steps', () => {
  const fall = { fallControl: 'Edge protection is installed around every open edge, and no one works outside it.' };
  const steps = (task, extra = {}) => {
    const draft = prepareDraft({ state: 'qld', fallRisk: 'yes', task, facts: { ...fall, isolationProcedure: 'Isolated at the main switch, locked, tagged and tested de-energised by the licensed electrician.', energisedWork: 'none', safetyDataSheet: 'Epoxy SDS, revision 3.', asbestosArrangement: 'The asbestos register was checked: no asbestos. A licensed removalist is called if any is found.' }, ...extra });
    return draft.kind === 'draft' ? draft.jobSteps.map((step) => step.step) : draft.missing;
  };
  assert.ok(steps('Install solar panels and an inverter on a house roof.').includes('Connect the solar array and inverter'));
  assert.ok(steps('Install a home battery on a garage wall.', { trade: 'electrical' }).includes('Install the battery system'));
  assert.ok(steps('Install a gas cooktop and connect it to the existing gas supply.', { trade: 'plumbing' }).includes('Connect, leak test and commission the gas appliance'));
  assert.ok(steps('Seal a concrete garage floor with epoxy.').includes('Apply epoxy or polyurethane floor coatings'));
  assert.ok(steps('Install roof battens on a new house.').includes('Fix roof battens to the trusses'));
  assert.ok(steps('Replace gutters and downpipes on a single storey house.').includes('Install gutters, fascia, downpipes and eaves linings'));
  assert.ok(steps('Install a skylight in a metal roof.').includes('Cut in and install the skylight'));
  assert.ok(steps('Build a timber retaining wall 600 mm high.').includes('Build the retaining wall'));
  assert.ok(steps('Build a timber pergola at ground level.').includes('Erect the pergola, carport or shed frame and roof'));
  assert.ok(steps('Pressure clean and reseal a concrete driveway.').includes('Pressure clean surfaces'));
  assert.ok(steps('Install bollards in a car park.').includes('Install bollards, barriers, wheel stops and speed humps'));
  // A meter box in an older house asks how asbestos was identified.
  const { questionsFor } = require('../draft');
  assert.ok(questionsFor({ state: 'qld', fallRisk: 'no', task: 'Replace the old meter box on a house wall.' }).required.some((item) => item.id === 'asbestosArrangement'));
});

test('other states: their own Act, their own sections in register notes, and no Queensland-only wording', () => {
  const { localNote, localText } = require('../citations');
  const draft = (state, task, facts = {}) => prepareDraft({ state, fallRisk: 'no', residential: 'no', task, facts: { silicaControls: 'Drilling is done with on-tool dust extraction.', ...facts } });
  assert.ok(draft('nsw', 'Core drill penetrations through a concrete slab.').sources.legislation.includes('Work Health and Safety Act 2011 (NSW)'));
  const vic = draft('vic', 'Core drill penetrations through a concrete slab.');
  assert.ok(vic.sources.legislation.includes('Occupational Health and Safety Act 2004 (Vic)'));
  const vicText = vic.jobSteps.flatMap((step) => step.controls).join('\n');
  assert.ok(!/silica risk control plan|processing is high risk|Where the processing is high risk: a Before/.test(vicText));
  // A Queensland section maps to the state's own, or is left out where it has not been matched.
  assert.match(localNote('Inspected to the manufacturer\'s instructions (WHS Reg s 213).', 'wa'), /\(Work Health and Safety \(General\) Regulations 2022 \(WA\) r 213\)/);
  assert.equal(localNote('Inspected to the manufacturer\'s instructions (WHS Reg s 213).', 'nsw'), 'Inspected to the manufacturer\'s instructions.');
  assert.ok(!/Queensland/.test(localText('Traffic controllers who hold Queensland traffic controller accreditation direct vehicles, pedestrians and traffic on the footpath and road, as the traffic management plan sets out.', 'act')));
});

test('licences and steps follow the work, not words around it', () => {
  const { workFlags } = require('../draft');
  const { tasksFromScope } = require('../scope');
  const painting = prepareDraft({ state: 'tas', fallRisk: 'no', residential: 'no', trade: 'painting,electrical', facts: { safetyDataSheet: 'Acrylic paint SDS, revision 2.' }, task: 'Paint internal walls and ceilings. Mask and cut in paintwork around all electrical fittings and switchboards.' });
  assert.ok(!painting.qualifications.some((item) => /Electrical/.test(item)));
  assert.ok(!workFlags('Install energy efficient in pool lighting and a pool services distribution board.', {}).water);
  assert.ok(!workFlags('Provide a submain from the meter panel main circuit breaker to the distribution boards.', {}).meterBox);
  assert.ok(workFlags('Replace the meter box on a house.', {}).meterBox);
  assert.ok(!workFlags('Cut reglets for flashings to the parapet.', {}).cutOpening);
  assert.ok(workFlags('Saw cut a new doorway opening in a concrete wall.', {}).cutOpening);
  assert.ok(!workFlags('Install windows with all flashings, sealants and trims.', {}).roofAccess);
  assert.ok(workFlags('Grade to level and compact subgrade, with backfilling and compaction as required.', {}).earthworks);
  assert.ok(!workFlags('Fabricate and install steel, cleaning free from loose scale and touching up primer.', {}).cleaning);
  const scope = tasksFromScope('SCOPE OF WORKS\n1. The Subcontractor shall only supply materials to the Site that contain NO asbestos.\n2. Install cable tray and pull cables for lighting circuits.\n3. Terminate all cables at the distribution boards.');
  assert.ok(!scope.tasks.some((task) => /asbestos/i.test(task.title)));
});

test('round 4: window installs, merged glass steps, waterproofing and crane licences', () => {
  const { workFlags } = require('../draft');
  const draft = prepareDraft({ state: 'nsw', fallRisk: 'yes', residential: 'no', trade: 'glazing', task: 'Install aluminium windows, fixed glass louvres and doors.', facts: { fallControl: 'Work is done from inside the building behind edge protection.', silicaControls: 'On-tool extraction.' } });
  const steps = draft.jobSteps.map((step) => step.step);
  assert.ok(steps.includes('Install window frames, doors and louvres'));
  assert.ok(!(steps.includes('Handle glass and panels') && steps.includes('Handle and install glass panels')));
  assert.ok(!workFlags('Liquid-applied membrane with a drainage cell and drainage gravel.', {}).hydraulicRisers);
  assert.ok(!workFlags('Attend on site during all concrete placement to keep the reo cover.', {}).concrete);
  assert.ok(workFlags('Pizza oven exhaust system including fan, ductwork and lagging.', {}).ductwork);
});

test('round 5: national sources in every state, scope words read in context, verified citations', () => {
  const { workFlags } = require('../draft');
  const { localSource } = require('../citations');
  assert.equal(localSource('Telecommunications (Cabling Provider) Rules 2025 (Cth) s 1; Work Health and Safety Regulation 2011 (Qld) s 999', 'tas'), 'Telecommunications (Cabling Provider) Rules 2025 (Cth) s 1');
  assert.ok(!workFlags('Flush plasterboard or fibre cement ceilings.', {}).ictWork);
  assert.ok(!workFlags('Coring for penetrations. Prior to the energisation of a Building, the coring procedure applies.', {}).isolation);
  assert.ok(workFlags('Sewer drainage: supply and installation of the sewer/house drainage system.', {}).trench);
  assert.ok(workFlags('Install and terminate all electronic door locking system cabling.', {}).securityDevices);
  assert.ok(workFlags('Supply and install automatic sliding doors.', {}).autoDoors);
  const { ACTIVITIES } = require('../activities');
  const lines = ACTIVITIES.flatMap((activity) => (activity.steps || []).flatMap((step) => step.controls)).map((item) => (typeof item === 'string' ? item : item.text || ''));
  assert.ok(!lines.some((line) => /\(s 302, s 306\)/.test(line)));
});

test('round 6: Queensland roof space and ladder rules as the regulation states them, and scope words read in context', () => {
  const { workFlags, highRiskMatches } = require('../draft');
  const { findState } = require('../legislation');
  const steps = (task, state = 'qld') => prepareDraft({ state, fallRisk: 'no', trade: 'electrical', task, facts: { isolationProcedure: 'Isolated, locked and tested.', energisedWork: 'none' } }).jobSteps.flatMap((step) => step.controls).join('\n');
  // ESR s 31: the roof space rule is for class 1, 2 and 10a buildings.
  assert.ok(/only when the electrical installation is de-energised/.test(steps('Rough-in new lighting circuits in the roof space of a house.')));
  assert.ok(!/only when the electrical installation is de-energised/.test(steps('Rough-in new lighting circuits in the roof space of a warehouse office.')));
  assert.ok(!workFlags('Supply and install all insulation and lagging materials to ductwork.', {}).ductwork);
  assert.ok(!workFlags('The mechanical main switchboard and control panels.', {}).mainSwitchboard);
  assert.ok(workFlags('Switchgear (switchboards and distribution boards) including connection to mains and provision of metering.', {}).commissioning);
  assert.ok(workFlags('Operation of generators, including load shedding.', {}).generatorTest);
  assert.ok(workFlags('Marking pipes and ductwork with colour bands and tags.', {}).serviceLabels);
  assert.ok(!highRiskMatches('Cast in precast conduits and back boxes.', '', findState('nsw')).some((item) => item.id === 'precast'));
  assert.ok(!highRiskMatches('Coring. Prior to the energisation of a Building, this process applies.', '', findState('qld')).some((item) => /energised/i.test(item.label)));
});

test('round 7: removing old services, door hardware, generator testing and citations', () => {
  const { workFlags } = require('../draft');
  assert.ok(workFlags('Identifying, labelling, and protecting all plant, pipework, cabling and ductwork to be demolished.', {}).servicesStrip);
  assert.ok(workFlags('Install all architectural door and window hardware as specified.', {}).hardwareFit);
  assert.ok(!workFlags('Install all architectural door and window hardware as specified.', {}).windowInstall);
  assert.ok(!workFlags('Cable terminations, joints to main and sub-mains and line taps to generators.', {}).generatorPlant);
  const draft = prepareDraft({ state: 'qld', fallRisk: 'no', trade: 'electrical', task: 'Operation of generators, including load shedding and load bank testing of the switchboards.', facts: { isolationProcedure: 'Isolated, locked and tested.', energisedWork: 'testing', safetyDataSheet: 'Diesel SDS.' } });
  assert.ok(draft.highRisk.some((item) => /energised/i.test(item)));
  assert.ok(!draft.plant.some((item) => item.item === 'Generator'));
});

test('round 8: licences from the work itself, and lines only where the work has them', () => {
  const { workFlags } = require('../draft');
  const fibre = prepareDraft({ state: 'nt', fallRisk: 'no', residential: 'no', trade: 'communications', task: 'Fire Detection - Fibre optic cabling and terminations.' });
  assert.ok(!fibre.qualifications.some((item) => /Electrical/.test(item)));
  assert.ok(!workFlags('Identifying, labelling, and protecting all plant, pipework, cabling and ductwork to be demolished and removed from site.', {}).demolition);
  assert.ok(!workFlags('Install all architectural door and window hardware. Tape all glazing to windows and doors.', {}).glassHandle);
  assert.ok(!workFlags('Clean, grind and prepare the concrete pool prior to membrane installation.', {}).fibreCement);
  const forklift = prepareDraft({ state: 'qld', fallRisk: 'no', task: 'Unload and move formwork ply around the deck. Forklifts are kept clear of the pour area.' });
  assert.ok(!forklift.qualifications.some((item) => /\(\(/.test(item)));
});
