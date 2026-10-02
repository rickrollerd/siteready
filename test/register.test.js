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
  // Hydro demolition now has its own job step.
  const hydro = stood('Hydro-demolition and concrete repair of a balcony slab soffit from a mobile scaffold.');
  assert.ok(hydro.jobSteps.some((step) => step.step === 'Hydro demolish the concrete'));
  assert.ok(!hydro.jobSteps.some((step) => /eave|gutters/i.test(step.step)));
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
  assert.ok(steps('Replace gutters and downpipes on a single storey house.').includes('Install gutters and downpipes'));
  assert.ok(steps('Install a skylight in a metal roof.').includes('Cut in and install the skylight'));
  assert.ok(steps('Build a timber retaining wall 600 mm high.').includes('Build the retaining wall'));
  assert.ok(steps('Build a timber pergola at ground level.').includes('Erect the frame and roof of the structure'));
  assert.ok(steps('Pressure clean and reseal a concrete driveway.').includes('Pressure clean surfaces'));
  assert.ok(steps('Install bollards in a car park.').includes('Install bollards'));
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
});

test('round 9: Queensland-only duties are not stated in other states, and licences follow the work', () => {
  const { localText } = require('../citations');
  const { workFlags } = require('../draft');
  assert.equal(localText('Extension ladders used for electrical work are no longer than 9.2 m.', 'nt'), null);
  assert.equal(localText('Where the deck slopes more than 26 degrees, mesh or sheeting extends at least 900 mm up the edge protection.', 'nsw'), null);
  assert.ok(!/perimeter containment screening/.test(localText('Where objects could fall on people outside the site, the principal contractor closes the adjoining area or erects perimeter containment screening before formwork is erected or dismantled.', 'nt')));
  const plumbing = prepareDraft({ state: 'qld', fallRisk: 'no', trade: 'plumbing', task: 'Fit off plumbing and drainage fixtures for the internal toilet block and tearoom.' });
  assert.ok(!plumbing.qualifications.some((item) => /Electrical/.test(item)));
  assert.ok(!plumbing.sources.legislation.includes('Electrical Safety Act 2002 (Qld)'));
  assert.ok(!workFlags('Install rangehoods complete with exhaust fan and exhaust ducting to above roof.', {}).plantLift);
  assert.ok(workFlags('Install rangehoods complete with exhaust fan and exhaust ducting to above roof.', {}).roofAccess);
  assert.ok(workFlags('Final connections of water supplies and gas supplies to mechanical equipment.', {}).gasFitting);
});

test('round 10: work named only as a destination or a marking job does not bring in the wrong steps', () => {
  const { workFlags } = require('../draft');
  assert.ok(!workFlags('Final connections of water supplies and gas supplies to mechanical equipment e.g. cooling towers, boilers.', {}).boilerPlant);
  assert.ok(!workFlags('Tape all glazing and the like to windows and doors to clearly identify it.', {}).glassHandle);
  assert.ok(!workFlags('Paint walls. Mask and cut in around all electrical fittings and switchboards.', {}).electricalWork);
  assert.ok(!workFlags('Install a new gas cooktop and connect it.', {}).replaceAppliance);
  const kitchen = prepareDraft({ state: 'qld', fallRisk: 'no', task: 'Install and commission refrigeration equipment and cooking equipment in the commercial kitchen.', facts: { safetyDataSheet: 'Refrigerant SDS.', plantIsolation: 'Isolated and locked out at the switchboard.' } });
  assert.ok((kitchen.highRisk || []).some((item) => /refrigerant/i.test(item)));
});

test('everyday tasks get job steps for their main work', () => {
  const steps = (task, facts = {}) => {
    const draft = prepareDraft({ state: 'nsw', fallRisk: 'no', residential: 'yes', task, facts: { silicaControls: 'On-tool extraction.', fallControl: 'Mobile scaffold with guardrails.', ...facts } });
    return draft.kind === 'draft' ? draft.jobSteps.map((step) => step.step) : draft.missing;
  };
  assert.ok(steps('Install ceiling grid and tiles in an open plan office from mobile scaffolds.').includes('Install suspended grid ceilings'));
  assert.ok(steps('Install new playground equipment and rubber softfall at a council park.').includes('Install playground equipment and softfall'));
  assert.ok(steps('Install a 20 m sewer rising main by horizontal directional drilling under a road.').includes('Bore under the road or ground with a directional drill'));
  assert.ok(steps('Demolish a single storey brick veneer house and remove the slab.', { asbestosArrangement: 'A licensed removalist removed all asbestos; clearance certificate sighted.' }).includes('Demolish the structure'));
  assert.ok(steps('Remove three large gum trees near power lines at a rural property.', { electricalSafety: 'The network operator has isolated the line in writing before work starts.' }).some((step) => /tree/i.test(step)));
  assert.ok(steps('Replace carpet tiles and vinyl in a primary school during the holidays.').some((step) => /floor/i.test(step)));
});

test('task bank round 4: licences, high risk categories and main work steps', () => {
  const { workFlags } = require('../draft');
  const draft = (task, extra = {}) => prepareDraft({ state: 'nsw', fallRisk: 'no', residential: 'no', task, facts: { silicaControls: 'On-tool extraction.', fallControl: 'Mobile scaffold with guardrails.', safetyDataSheet: 'SDS at the work area.', ...extra.facts }, ...extra.body });
  const steps = (task, extra) => { const d = draft(task, extra); return d.kind === 'draft' ? d.jobSteps.map((step) => step.step) : d.missing; };
  // A forklift named only as a hazard is the site's plant, not a licence this crew needs.
  const sealing = draft('Seal the joints in a concrete warehouse floor with polyurethane sealant.');
  assert.ok(!sealing.qualifications.some((item) => /forklift \(LF\)$/.test(item)));
  const marking = draft('Paint road line markings on a highway at night with traffic control.');
  assert.ok(!marking.plant.some((item) => item.item === 'Forklift'));
  assert.ok(!marking.jobSteps.some((step) => step.controls.some((line) => /warehouse/.test(line))));
  // Tube and coupler scaffolds need an intermediate or advanced licence.
  const tube = draft('Erect a 3 lift tube and coupler scaffold on the facade of a three storey shop.', { body: { fallRisk: 'yes' }, facts: { fallControl: 'Scaffolders work from a fully decked lift below.', systemInstructions: 'Erected to the scaffold design and AS/NZS 4576.' } });
  assert.ok(tube.plant.some((item) => item.item === 'Scaffold' && /\(SI or SA\)/.test(item.licence)));
  // A roof space is hot from the sun, not an artificial extreme of temperature.
  assert.doesNotMatch(JSON.stringify(draft('Install a new hot water cylinder in the roof space of an old Queenslander.')), /artificial extremes/i);
  // High risk categories from the task's own words.
  const { highRiskMatches } = require('../draft');
  const nsw = require('../legislation').STATES.find((state) => state.id === 'nsw');
  const cats = (task) => highRiskMatches(task, '', nsw).map((item) => item.label).join(' | ');
  assert.match(cats('Remove a load-bearing wall between the kitchen and lounge and install a steel beam.'), /load-bearing/);
  assert.match(cats('Install a 5 m deep sewer manhole in a live road.'), /trench.*1\.5m|1\.5m.*trench/);
  assert.match(cats('Install a 5 m deep sewer manhole in a live road.'), /road/);
  assert.match(cats('Lay asphalt to a 200 m section of council road with traffic control.'), /powered mobile plant/);
  assert.doesNotMatch(cats('Seal a concrete driveway and paths with an acrylic sealer.'), /powered mobile plant/);
  assert.ok(!workFlags('Mitres, cut and splayed ends, intersections, special shaped or blocked ends.', {}).road);
  // Main work steps.
  assert.ok(steps('Install a vehicle hoist in a mechanical workshop.').includes('Install the vehicle hoist'));
  assert.ok(!steps('Install a vehicle hoist in a mechanical workshop.').includes('Install, climb and dismantle the hoist'));
  assert.deepEqual(steps('Remove a load-bearing wall between the kitchen and lounge and install a steel beam.', { facts: { temporarySupport: 'Props to the engineer\'s design, checked by the supervisor before the wall is removed.' } }).filter((step) => /support|opening|beam/.test(step)), ['Install temporary support', 'Cut an opening in a load-bearing wall', 'Lift and fix the new beam or lintel']);
  assert.ok(steps('Install new playground shade sails at a school.').includes('Install shade sail posts and sails'));
  assert.ok(!steps('Install new playground shade sails at a school.').includes('Erect the frame and roof of the structure'));
  assert.ok(steps('Lay sewer drainage under a new house slab before the pour.').includes('Lay drainage under the slab or floor'));
  assert.ok(!steps('Lay sewer drainage under a new house slab before the pour.').includes('Place concrete'));
  const tank = steps('Install a stormwater detention tank under a car park.', { facts: { trenchSupport: 'The excavation is battered to the geotechnical engineer\'s design.' } });
  assert.ok(tank.indexOf('Lift and place tanks, pits or precast units') < tank.indexOf('Backfill and restore'));
  const flat = steps('Build a granny flat on a slab: frame, roof, clad and line it.', { body: { trade: 'carpentry', residential: 'yes' } });
  assert.ok(flat.indexOf('Stand and brace wall frames') < flat.indexOf('Fix new roofing'));
  assert.ok(flat.indexOf('Fix new roofing') < flat.indexOf('Install battens and external cladding'));
  assert.ok(!steps('Install steel portal frames and purlins for a farm machinery shed using a mobile crane and EWPs.').includes('Set up site sheds'));
});

test('task bank round 5: everyday jobs that stood down now get their main steps', () => {
  const steps = (task, trade = '', fallRisk = 'no') => {
    const draft = prepareDraft({ state: 'vic', fallRisk, residential: 'yes', trade, task, facts: { silicaControls: 'On-tool extraction.', fallControl: 'Edge protection on all open edges.', safetyDataSheet: 'SDS at the work area.' } });
    return draft.kind === 'draft' ? draft.jobSteps.map((step) => step.step) : draft.missing;
  };
  assert.ok(steps('Install a gate and boom gate at a car park entry.', 'electrical').includes('Install boom gates and automatic gates'));
  assert.ok(steps('Install pallet racking in a warehouse.', 'steel', 'yes').includes('Install pallet racking'));
  assert.ok(steps('Install a new escalator in a shopping centre.', 'lifts', 'yes').includes('Install the escalator'));
  assert.ok(steps('Install cyclone tie-downs to an existing house roof.', 'carpentry', 'yes').includes('Fit cyclone tie-downs'));
  assert.ok(steps('Install a mobile phone antenna on a building rooftop.', 'communications', 'yes').includes('Install rooftop antennas and equipment'));
  assert.ok(steps('Reseal the expansion joints on a multi-storey car park deck.', 'waterproofing', 'yes').includes('Clean out and seal floor joints'));
  assert.ok(steps('Install new LED high bay lights in a warehouse from a scissor lift.', 'electrical', 'yes').includes('Install high bay light fittings'));
  assert.ok(steps('Replace a section of collapsed stormwater pipe 1.2 m deep in a backyard.', 'plumbing').includes('Lay pipes, pits and conduits'));
  const kerb = steps('Remove and replace a damaged section of a kerb and channel.', 'structure');
  assert.ok(kerb.indexOf('Saw cut concrete') < kerb.indexOf('Place concrete'));
});

test('task bank round 6: categories and steps that fit the job', () => {
  const { highRiskMatches } = require('../draft');
  const qld = require('../legislation').STATES.find((state) => state.id === 'qld');
  const base = { silicaControls: 'Wet cutting and on-tool extraction.', fallControl: 'Edge protection on all open edges.', safetyDataSheet: 'Safety data sheets for each product are at the work area.', spaceAssessment: 'notConfined', asbestosArrangement: 'Asbestos register sighted; none in the work area.', drowningControls: 'No one works alone over the water, with a rescue pole and life ring at the edge.' };
  const draft = (task, trade = '', fallRisk = 'no', facts = {}) => prepareDraft({ state: 'qld', fallRisk, residential: 'yes', trade, task, facts: { ...base, ...facts } });
  const steps = (...args) => { const d = draft(...args); return d.kind === 'draft' ? d.jobSteps.map((step) => step.step) : d.missing; };
  // A non-load-bearing wall is not load-bearing demolition.
  assert.ok(!highRiskMatches('Demolish an internal non-load-bearing stud wall in an office.', '', qld).some((item) => item.id === 'demolition'));
  // Work on an existing tilt-up building is not tilt-up work.
  assert.ok(!highRiskMatches('Install wall cladding panels on a tilt-up warehouse from an EWP.', '', qld).some((item) => item.id === 'precast'));
  // A small barrowed pour has no trucks or mobile plant.
  const shed = draft('Lay a concrete slab for a garden shed using a wheelbarrow and bagged concrete.', 'structure');
  assert.ok(!shed.plant.some((item) => /Concrete truck|Power trowel|Excavator/.test(item.item)));
  assert.ok(!(shed.highRisk || []).some((item) => /powered mobile plant/.test(item)));
  // Fuel tank removal brings its atmosphere and plant categories.
  assert.ok(draft('Pull out an old in-ground fuel tank on a farm.', 'excavation').highRisk.some((item) => /flammable atmosphere/.test(item)));
  // Gas lines are leak tested, not water tested, and are gas work, not plumbing.
  const gas = draft('Pressure test and commission a new gas line to a commercial bakery oven.', 'plumbing', 'no', { pressureTesting: require('../presets').answersFor('pressureTesting')[0].text });
  assert.ok(!gas.jobSteps.some((step) => step.controls.some((line) => /Tested with water/.test(line))));
  assert.ok(gas.qualifications.some((item) => /^Gas work licence/.test(item)) && !gas.qualifications.some((item) => /^Plumbing/.test(item)));
  // Steps that fit the job.
  assert.ok(!steps('Install a solar battery and inverter at a farm shed.', 'electrical').includes('Install solar panels and mounting rails on the roof'));
  assert.ok(steps('Lay a bitumen spray seal on a rural road.', 'excavation').includes('Spray seal the road'));
  assert.ok(steps('Install a vehicle crash barrier along a highway.', 'excavation').includes('Install road safety barrier'));
  assert.ok(steps('Install a fire alarm system in a new childcare centre.', 'electrical', 'yes').includes('Install the fire detection and alarm system'));
  assert.ok(steps('Remove old lead paint from window frames of a heritage house.', 'painting', 'yes').includes('Remove lead paint'));
  assert.ok(steps('Replace a section of corroded steel handrail on a jetty.', 'steel').includes('Cut out and replace the steel handrail'));
  assert.ok(!steps('Replace roof tiles broken by a storm on a single storey house.', 'roofing', 'yes').includes('Fix new roofing'));
  assert.ok(steps('Remove the concrete roof tiles from a two storey house and replace them with metal roof sheeting.', 'roofing', 'yes').includes('Fix new roofing'));
  const wall = steps('Construct a concrete block retaining wall 2.4 m high.', 'masonry', 'yes');
  assert.ok(wall.indexOf('Build the retaining wall') < wall.indexOf('Lay blocks and bricks'));
  // Early childhood centres have a lower hot water limit.
  assert.ok(draft('Install a new hot water heat pump at a childcare centre.', 'plumbing').jobSteps.some((step) => step.controls.some((line) => /45 °C in early childhood centres/.test(line))));
});

test('task bank round 8: small jobs get steps for that job, not a bigger one', () => {
  const base = { silicaControls: 'Wet cutting and on-tool extraction.', fallControl: 'Edge protection on all open edges.', safetyDataSheet: 'Safety data sheets for each product are at the work area.', spaceAssessment: 'notConfined', asbestosArrangement: 'Asbestos register sighted; none in the work area.', drowningControls: 'No one works alone near the pool.', temporarySupport: 'Props to the engineer\'s design, checked before any member is removed.' };
  const draft = (task, trade = '', fallRisk = 'no') => prepareDraft({ state: 'nsw', fallRisk, residential: 'yes', trade, task, facts: base });
  const steps = (...args) => { const d = draft(...args); return d.kind === 'draft' ? d.jobSteps.map((step) => step.step) : d.missing; };
  const text = (...args) => JSON.stringify(draft(...args).jobSteps);
  assert.doesNotMatch(text('Lay timber decking around a swimming pool.', 'carpentry'), /tides|work boat/);
  assert.ok(steps('Lay timber decking around a swimming pool.', 'carpentry').includes('Build the deck frame and lay the decking'));
  assert.deepEqual(steps('Install a wheelchair lift platform at a library entrance.', 'lifts').filter((step) => /lift|shaft/i.test(step)), ['Install the platform lift']);
  assert.ok(!steps('Replace a broken stormwater pit lid in a council road.', 'plumbing').includes('Excavate'));
  assert.ok(steps('Replace a section of rotten timber floor joists under a house.', 'carpentry').includes('Prop the floor and replace joists or bearers'));
  assert.ok(!steps('Replace a roof turbine vent on a factory roof.', 'roofing', 'yes').includes('Remove old roofing'));
  assert.doesNotMatch(text('Install new carpet tiles in an office after hours.', 'flooring'), /power stretcher/);
  assert.doesNotMatch(text('Replace a broken toilet pan in a public toilet block.', 'plumbing'), /Before chasing/);
  // A line given once is not repeated in a later step.
  for (const step of draft('Install an air conditioning condenser on a house roof.', 'mechanical', 'yes').jobSteps.slice(1, -1)) {
    for (const other of draft('Install an air conditioning condenser on a house roof.', 'mechanical', 'yes').jobSteps.slice(1, -1)) {
      if (step.step !== other.step) assert.ok(!step.controls.some((line) => other.controls.includes(line)));
    }
  }
  const nsw = require('../legislation').STATES.find((state) => state.id === 'nsw');
  assert.ok(require('../draft').highRiskMatches('Excavate with an excavator.', '', nsw).some((item) => /any movement of powered mobile plant/.test(item.label)));
});

test('task bank round 9: jobs that are smaller than the template get only their own lines', () => {
  const base = { silicaControls: 'Wet cutting and on-tool extraction.', fallControl: 'Work above 2 m is done from an EWP with guardrails.', safetyDataSheet: 'Safety data sheets for each product are at the work area.', spaceAssessment: 'notConfined', asbestosArrangement: 'Asbestos register sighted; none in the work area.', confinedSpace: 'Permit entry.', temporarySupport: 'Props to the engineer\'s design.' };
  const draft = (task, trade = '', fallRisk = 'no') => prepareDraft({ state: 'nsw', fallRisk, residential: 'yes', trade, task, facts: base });
  const text = (...args) => JSON.stringify(draft(...args));
  const steps = (...args) => draft(...args).jobSteps.map((step) => step.step);
  // A confined space arrangement is dropped when the space is assessed as not confined.
  assert.doesNotMatch(text('Repair a concrete water tank that leaks.', 'structure'), /Permit entry/);
  assert.doesNotMatch(text('Install a CCTV camera on a pole in a car park.', 'security', 'yes'), /walls and ceilings|CCTV drain camera/);
  assert.ok(steps('Replace an old electric stove with a new induction cooktop.', 'electrical').includes('Disconnect the old appliance and connect the new one'));
  assert.doesNotMatch(text('Install lighting in a sports field from a boom lift.', 'electrical', 'yes'), /crane work box|roof edge/);
  assert.doesNotMatch(text('Install a solar battery and inverter at a farm shed.', 'electrical'), /Array conductors/);
  assert.doesNotMatch(text('Install a commercial dishwasher with a booster heater.', 'plumbing'), /Refrigerant work/);
  const pump = steps('Install a new septic tank pump-out line at a caravan park.', 'plumbing');
  assert.ok(pump.indexOf('Install the pump-out line') < pump.indexOf('Backfill and restore'));
  const bollards = steps('Install steel bollards in front of a shopfront by core drilling the footpath.', 'excavation');
  assert.ok(bollards.indexOf('Core drill through the slab or wall') < bollards.indexOf('Install bollards'));
  assert.ok(draft('Lay a bitumen spray seal on a rural road.', 'excavation').plant.some((item) => item.item === 'Bitumen sprayer'));
});

test('gas work alone needs a gas licence, not a plumbing licence, outside Victoria', () => {
  const quals = (state) => prepareDraft({ state, fallRisk: 'no', residential: 'yes', trade: 'plumbing', task: 'Run a new gas line under a house to a new cooktop.', facts: {} }).qualifications;
  for (const state of ['qld', 'nsw', 'sa', 'wa', 'tas', 'nt', 'act']) {
    assert.ok(quals(state).some((item) => /^Gas work licence/.test(item)), state);
    assert.ok(!quals(state).some((item) => /^Plumbing/.test(item)), state);
  }
  assert.ok(quals('vic').some((item) => /^Plumbing/.test(item)));
});

test('banks 1 to 4 verification: step order, main work and lines for the job', () => {
  const base = { silicaControls: 'Wet cutting and on-tool extraction.', fallControl: 'Work above 2 m is done from an EWP with guardrails.', safetyDataSheet: 'Safety data sheets for each product are at the work area.', spaceAssessment: 'notConfined', asbestosArrangement: 'Asbestos register sighted. Our crew removes the asbestos under our asbestos removal licence.', confinedSpace: 'Permit entry.', temporarySupport: 'Props to the engineer\'s design.', isolationProcedure: 'Isolated, locked and tested.', energisedWork: 'none', trenchSupport: 'Battered to the engineer\'s design.', formworkDesign: 'Formwork to the engineer\'s design.', loadLimits: 'Loads only in marked areas.', systemInstructions: 'Erected to the supplier\'s instructions.', hotWorkPermit: 'Hot work permit from the site, with a fire watch for 30 minutes after.', drowningControls: 'No one works alone near the water, with a rescue pole and life ring at the edge.' };
  const draftOf = (task, trade, state, fallRisk) => { const d = draft(task, trade, state, fallRisk); assert.equal(d.kind, 'draft', `${task}: ${JSON.stringify(d.missing)}`); return d; };
  const draft = (task, trade = '', state = 'qld', fallRisk = 'no') => prepareDraft({ state, fallRisk, residential: 'no', trade, task, facts: base });
  const text = (...args) => JSON.stringify(draft(...args));
  const steps = (...args) => draftOf(...args).jobSteps.map((step) => step.step);
  const before = (list, a, b) => list.indexOf(a) >= 0 && list.indexOf(a) < list.indexOf(b);
  // An asbestos meter panel comes out only once the supply is isolated.
  const meter = steps('Replace an old meter box containing asbestos backing board on a 1965 house.', 'electrical');
  assert.ok(before(meter, 'Isolate and prove de-energised', 'Prepare the asbestos work area'));
  // Carpet and vinyl tiles are not ceramic tiling.
  assert.ok(!steps('Replace carpet tiles and vinyl in a primary school during the holidays.', 'flooring').includes('Cut tiles and stone'));
  assert.ok(!steps('Remove asbestos vinyl floor tiles from a school classroom.', 'asbestos').includes('Cut tiles and stone'));
  // Relining a sewer is done from the surface; the drain is cleared first.
  const reline = steps('Clean out and reline a sewer pipe with a CCTV camera and relining equipment.', 'plumbing');
  assert.ok(!reline.includes('Enter and work'));
  assert.ok(before(reline, 'Clear the drain with a drain machine or jetter', 'Clean, inspect and reline the pipe'));
  // The pump is set up and the slab poured before the forms are stripped.
  const slab = steps('Install formwork and pour a suspended slab on level 3 of an apartment building.', 'structure');
  assert.ok(before(slab, 'Pump and place concrete', 'Strip formwork and backprop'));
  // Lift shaft protection goes in before the rails.
  assert.ok(before(steps('Install a lift in an existing three storey building, working in the open lift shaft.', 'lifts'), 'Work at open lift shafts and landing doors', 'Install the lift rails, car and machine'));
  // A hood, a freezer room or an exhaust fan is not a commercial kitchen fit-out.
  assert.doesNotMatch(text('Install a commercial kitchen exhaust hood and ductwork through the roof of a restaurant.', 'mechanical'), /benches|gas connections by a licensed gas fitter/);
  assert.ok(!steps('Install a commercial walk-in freezer at a restaurant.', 'refrigeration').includes('Deliver and install commercial kitchen equipment'));
  // Fit-off alone has no chasing, and is tested before it is connected.
  const fitOff = draft('Fit off lights, power points and ceiling fans in a new house.', 'electrical');
  assert.doesNotMatch(JSON.stringify(fitOff.jobSteps), /Chase and drill/);
  assert.ok(fitOff.jobSteps.some((step) => step.step === 'Test, connect and commission'));
  // Pool heat pumps have no relief valve; solar hot water on a roof gets its collector step.
  assert.doesNotMatch(text('Install a heat pump pool heater and connect plumbing and power.', 'plumbing'), /pressure relief valve/);
  assert.ok(steps('Install a solar hot water system on a flat roof of a motel.', 'plumbing').includes('Fix the solar collectors and tank frame to the roof'));
  // The welding job gets a welding step, not brazing.
  const weld = steps('Weld new steel brackets to an existing beam in an operating factory.', 'steel');
  assert.ok(weld.includes('Bolt and weld steel') && !weld.includes('Braze and solder pipe joints (hot work)'));
  // Dismantling only.
  assert.ok(!steps('Dismantle a scaffold from a finished building.', 'scaffolding').includes('Erect the scaffold'));
  // Plant and licences that match the work.
  assert.ok(!draft('Install a vehicle hoist in a mechanical workshop.', 'mechanical').plant.some((item) => item.item === 'Personnel or materials hoist'));
  assert.ok(draft('Spray paint steel beams in a workshop using solvent-based paint.', 'painting').plant.some((item) => item.item === 'Airless spray unit'));
  assert.ok(!draft('Test and tag electrical equipment on a construction site.', 'electrical').qualifications.some((item) => /^Electrical/.test(item)));
  assert.ok(draft('Install CCTV cameras and access control readers at a caravan park.', 'security').qualifications.some((item) => /^Security equipment installer licence/.test(item)));
  assert.ok(!draft('Install retaining wall drainage and backfill behind a new sleeper wall.', 'landscaping', 'nsw').qualifications.some((item) => /plumbing/i.test(item)));
  // High risk categories the steps call for.
  assert.ok(draft('Re-stump a weatherboard house using hydraulic jacks.', 'carpentry').highRisk.some((item) => /temporary support/.test(item)));
  const wetWell = prepareDraft({ state: 'qld', fallRisk: 'no', residential: 'no', trade: 'plumbing', task: 'Clean out a sewage pump station wet well.', facts: { ...base, spaceAssessment: '' } });
  assert.ok(wetWell.highRisk.some((item) => /confined space/.test(item)));
  assert.ok(!draft('Clean out a sewage pump station wet well.', 'plumbing').highRisk.some((item) => /in a confined space/.test(item)));
  assert.ok(draftOf('Build a timber boardwalk through a wetland.', 'carpentry', 'vic').highRisk.some((item) => /drowning/.test(item)));
  // A Queensland-only inspection interval is not stated elsewhere.
  assert.doesNotMatch(text('Install glass balustrades on level 8 balconies of an apartment building.', 'glazing', 'wa', 'yes'), /every 6 months/);
  // Night work has no sun line.
  assert.doesNotMatch(text('Paint road line markings on a highway at night with traffic control.', 'painting', 'nsw'), /Sun and heat/);
});

test('banks 4 and 5 verification: the work named, in order, with its own plant and lines', () => {
  const base = { silicaControls: 'Wet cutting and on-tool extraction.', fallControl: 'Work above 2 m is done from an EWP with guardrails.', safetyDataSheet: 'Safety data sheets for each product are at the work area.', spaceAssessment: 'notConfined', asbestosArrangement: 'Asbestos register sighted. Our crew removes the asbestos under our asbestos removal licence.', isolationProcedure: 'Isolated, locked and tested.', energisedWork: 'none', trenchSupport: 'Battered to the engineer\'s design.', pressureTesting: 'Tested with nitrogen to the standard.', temporarySupport: 'Props to the engineer\'s design.', hotWorkPermit: 'Hot work permit with a fire watch.' };
  const draft = (task, trade = '', state = 'nsw') => { const d = prepareDraft({ state, fallRisk: 'no', residential: 'no', trade, task, facts: base }); assert.equal(d.kind, 'draft', `${task}: ${JSON.stringify(d.missing)}`); return d; };
  const text = (...args) => JSON.stringify(draft(...args));
  const steps = (...args) => draft(...args).jobSteps.map((step) => step.step);
  const before = (list, a, b) => list.indexOf(a) >= 0 && list.indexOf(a) < list.indexOf(b);
  assert.ok(steps('Install an outdoor kitchen with a gas barbecue.', 'plumbing').includes('Build the outdoor kitchen'));
  assert.ok(before(steps('Pressure test and commission a new gas line to a commercial bakery oven.', 'plumbing'), 'Pressure test the gas line', 'Connect, leak test and commission the gas appliance'));
  assert.doesNotMatch(text('Install a commercial ice machine and connect water and drain in a pub.', 'plumbing'), /Scalds from hot water|Sun and heat/);
  assert.ok(before(steps('Install cyclone tie-downs to an existing house roof.', 'carpentry'), 'Work in the roof space', 'Fit cyclone tie-downs'));
  assert.ok(steps('Install a mezzanine stair and handrail in an office.', 'steel').includes('Install the steel staircase'));
  assert.ok(before(steps('Replace 30 m of storm-damaged colorbond fencing with new posts in concrete.', 'fencing'), 'Take down the old fence', 'Dig post holes and build the fence'));
  assert.ok(!steps('Replace rotten fascia boards and repaint the eaves of a weatherboard house.', 'carpentry').includes('Get onto the roof and set up fall protection'));
  const shed = steps('Remove a fibro garden shed that may contain asbestos.', 'demolition');
  assert.ok(!shed.includes('Demolish the structure') && before(shed, 'Take down the shed frame', 'Bag, label and dispose of asbestos waste'));
  assert.ok(!steps('Grind and seal a concrete garage floor with epoxy.', 'flooring').includes('Grind concrete'));
  assert.ok(!draft('Lay pipes for a new subdivision\'s water reticulation.', 'plumbing', 'wa').qualifications.some((item) => /^Plumbing/.test(item)));
  assert.ok(!steps('Seal a leaking shower in an apartment without removing tiles.', 'tiling').includes('Cut tiles and stone'));
  assert.ok(before(steps('Replace a rusted steel lintel above a shopfront window.', 'masonry'), 'Cut out the old lintel', 'Lift and fix the new beam or lintel'));
  assert.doesNotMatch(text('Install a CCTV camera on a pole in a car park.', 'security'), /Poles are stood in footings/);
  assert.doesNotMatch(text('Install new automatic sliding doors at a supermarket entrance.', 'carpentry', 'vic'), /MDF/);
  assert.match(text('Replace a roof turbine vent on a factory roof.', 'roofing'), /The old vent is unfixed/);
  assert.ok(draft('Erect a temporary grandstand for a weekend event.', 'scaffolding').qualifications.some((item) => /^Scaffolding licence/.test(item)));
});
