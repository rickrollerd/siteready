const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor } = require('../draft');

// Most tests answer No so the task wording check is what is being tested.
const draft = (task, extra = {}) => prepareDraft({ state: 'qld', task, fallRisk: 'no', ...extra });
const FALL = 'Involves a risk of a person falling more than 2m';

test('scaffold erection to 6 m stands down until a fall control is given', () => {
  const task = 'Erect a modular scaffold 4 bays by 2, top working platform at 6 m, ties to the slab edge at every lift.';
  assert.match(questionsFor({ state: 'qld', task, fallRisk: 'no' }).fall.warning, /mentions work at height/);
  const stood = draft(task, { fallRisk: 'yes' });
  assert.equal(stood.kind, 'stand-down');
  assert.deepEqual(stood.missing, ['Fall control', 'System and supplier instructions']);

  const done = draft(task, { fallRisk: 'yes', facts: { fallControl: 'Erect from a fully decked platform with advance guardrails at each lift.', systemInstructions: 'Example modular scaffold, erected to the supplier\'s instructions SC-01 revision 2 by trained scaffolders.' } });
  assert.equal(done.kind, 'draft');
  assert.ok(done.highRisk.includes(FALL));
  assert.ok(done.hazards.some((row) => row.hazard === 'Fall from height'));
  assert.ok(done.method.some((step) => /advance guardrails/.test(step)));
});

test('roof work on a two storey house is recognised as work at height', () => {
  assert.ok(questionsFor({ state: 'qld', task: 'Replace roof sheets on a two storey house.', fallRisk: 'no' }).fall.detected);
  assert.deepEqual(draft('Replace roof sheets on a two storey house.', { fallRisk: 'yes' }).missing, ['Fall control']);
  const done = draft('Replace roof sheets on a two storey house.', {
    fallRisk: 'yes',
    facts: { fallControl: 'Edge protection is installed around the roof perimeter first.' },
  });
  assert.ok(done.highRisk.includes(FALL));
});

test('a length or a shallow depth is not a fall height', () => {
  const fence = draft('Replace a 3m length of fence.');
  assert.equal(fence.kind, 'draft');
  assert.deepEqual(fence.highRisk, []);
  assert.ok(!draft('Dig a trench 1 m deep with an excavator.').highRisk.includes(FALL));
});

test('a trench deeper than 1.5 m needs its support and gets a collapse hazard', () => {
  const task = 'Dig a trench 2 m deep for a stormwater pipe using an excavator.';
  assert.deepEqual(draft(task).missing, ['Trench support']);
  const done = draft(task, { facts: { trenchSupport: 'Trench box to 2.4 m, supplied by the hire company.' } });
  assert.ok(done.hazards.some((row) => row.hazard === 'Trench or excavation collapse'));
  assert.ok(done.controls.some((item) => /Trench box/.test(item.text)));
});

test('a trench of 1 m is not high risk trench work', () => {
  const done = draft('Dig a trench 1 m deep with an excavator.');
  assert.ok(!done.highRisk.some((item) => /trench/i.test(item)));
});

test('a fact that only says it was supplied does not count', () => {
  const vague = draft('Lift steel beams with a crane.', { crane: 'own', facts: { craneChart: 'Chart supplied.' } });
  assert.equal(vague.kind, 'stand-down');
  assert.deepEqual(vague.missing, ['Crane chart (the text given does not state it)']);
  assert.equal(draft('Lift steel beams with a crane, chart supplied.', { crane: 'own' }).kind, 'stand-down');
  assert.equal(draft('Paint the office walls.', { facts: { safetyDataSheet: 'Attached.' } }).kind, 'stand-down');

  const stated = draft('Lift steel beams with a crane.', { crane: 'own', facts: { craneChart: 'Rated capacity 6.2 t at 14 m radius.' } });
  assert.equal(stated.kind, 'draft');
});

test('each high risk category found has a hazard row', () => {
  const done = draft('Install a pump in a confined space.', { facts: { confinedSpace: 'Entry permit issued, air tested before and during entry, standby person at the hatch with rescue gear.' } });
  assert.ok(done.highRisk.some((item) => /confined space/i.test(item)));
  assert.ok(done.hazards.some((row) => row.hazard === 'Confined space'));
});

test('overhead lines use the Queensland distance', () => {
  const done = draft('Relocate the switchboard near the overhead power lines.', { facts: { electricalSafety: 'Plant and people stay 4 m from the lines, with a safety observer watching.' } });
  const line = done.controls.find((item) => /overhead|line voltage/i.test(item.text));
  assert.ok(line);
  assert.match(line.text, /3\.0 m/);
  assert.doesNotMatch(line.text, /4\.0 m/);
});

test('the fall question must be answered', () => {
  const asked = questionsFor({ state: 'qld', task: 'Replace a 3m length of fence.' });
  assert.equal(asked.kind, 'error');
  assert.match(asked.explanation, /more than 2 metres/);
  assert.equal(prepareDraft({ state: 'qld', task: 'Replace a 3m length of fence.' }).kind, 'error');
});

test('Yes requires a fall control even when the wording does not show height', () => {
  const task = 'Replace a 3m length of fence.';
  assert.deepEqual(draft(task, { fallRisk: 'yes' }).missing, ['Fall control']);
  const done = draft(task, { fallRisk: 'yes', facts: { fallControl: 'The work is done from the ground.' } });
  assert.equal(done.kind, 'draft');
  assert.ok(done.highRisk.includes(FALL));
  assert.ok(done.hazards.some((row) => row.hazard === 'Fall from height'));
  assert.ok(done.controls.some((item) => item.level === 'Eliminate'));
  assert.equal(done.fallRisk, 'Yes');
});

test('No with work at height warns, and the No stands', () => {
  const task = 'Replace roof sheets on a two storey house.';
  const asked = questionsFor({ state: 'qld', task, fallRisk: 'no' });
  assert.match(asked.fall.warning, /go back and answer Yes/);
  assert.ok(!asked.required.some((item) => item.id === 'fallControl'));
  const done = draft(task);
  assert.equal(done.kind, 'draft');
  assert.ok(!done.highRisk.includes(FALL));
  assert.match(done.fallRisk, /No work is done where a person could fall 2 metres or more/);
});

test('No on a task at ground level is recorded as No with no warning', () => {
  const asked = questionsFor({ state: 'qld', task: 'Replace a 3m length of fence.', fallRisk: 'no' });
  assert.equal(asked.fall.warning, '');
  assert.equal(draft('Replace a 3m length of fence.').fallRisk, 'No');
});

test('New South Wales uses its own regulation, wording and power line rule', () => {
  const done = prepareDraft({
    state: 'nsw',
    task: 'Relocate the switchboard near the overhead power lines.',
    facts: { electricalSafety: 'Plant and people stay 4 m from the lines, with a safety observer watching.' },
    fallRisk: 'no',
  });
  assert.equal(done.kind, 'draft');
  assert.equal(done.instrument, 'Work Health and Safety Regulation 2025 (NSW)');
  assert.equal(done.section, '299');
  assert.ok(done.highRisk.includes('Is carried out on or near energised electrical installations or services'));
  const line = done.controls.find((item) => /electric line/.test(item.text));
  assert.match(line.text, /Section 166/);
  assert.match(line.text, /3\.0 m up to 132 kV, 6\.0 m above 132 kV up to 330 kV, and 8\.0 m above 330 kV/);
  assert.doesNotMatch(line.text, /Qld/);
  const asked = questionsFor({ state: 'nsw', task: 'Replace a 3m length of fence.', fallRisk: 'no' });
  assert.match(asked.fall.explanation, /Regulation 2025 \(NSW\), section 291/);
});

test('Victoria uses regulation 322 and 327 and its own SWMS contents', () => {
  const shed = (state) => prepareDraft({ state, task: 'Demolish an internal timber stud wall with hand tools in a house built in 2015.', fallRisk: 'no' });
  const vic = shed('vic');
  assert.equal(vic.instrument, 'Occupational Health and Safety Regulations 2017 (Vic)');
  assert.equal(vic.sectionRef, 'regulation 327');
  assert.equal(vic.reviewHeading, 'How the risk control measures are to be implemented');
  // Any demolition is high risk in Victoria. Section 291 needs a load-bearing element.
  assert.deepEqual(vic.highRisk, ['Involving demolition']);
  assert.deepEqual(shed('qld').highRisk, []);
  assert.deepEqual(shed('nsw').highRisk, []);

  // Sprayed concrete has no job steps yet, so the tunnel is checked on its high risk categories alone.
  const { highRiskMatches } = require('../draft');
  const tunnel = highRiskMatches('Line a stormwater tunnel with shotcrete.', 'no', require('../legislation').findState('vic')).map((item) => item.label);
  assert.ok(tunnel.includes('Involving a tunnel'));
  assert.ok(!tunnel.some((item) => /trench or shaft/.test(item)));

  const lines = prepareDraft({ state: 'vic', task: 'Relocate the switchboard near the overhead power lines.', fallRisk: 'no', facts: { electricalSafety: 'Plant and people stay 4 m from the lines, with a safety observer watching.' } });
  const line = lines.controls.find((item) => /overhead electric lines/.test(item.text));
  assert.match(line.text, /set no distance/);
  assert.match(questionsFor({ state: 'vic', task: 'Replace a 3m length of fence.', fallRisk: 'no' }).fall.explanation, /regulation 322/);
});

test('South Australia uses its regulations and gives no power line distance', () => {
  const done = prepareDraft({ state: 'sa', task: 'Relocate the switchboard near the overhead power lines.', fallRisk: 'no', facts: { electricalSafety: 'Plant and people stay 4 m from the lines, with a safety observer watching.' } });
  assert.equal(done.instrument, 'Work Health and Safety Regulations 2012 (SA)');
  assert.equal(done.sectionRef, 'regulation 299');
  assert.ok(done.highRisk.includes('Is carried out on or near energised electrical installations or services'));
  const line = done.controls.find((item) => /electric line/.test(item.text));
  assert.match(line.text, /regulation 166/);
  assert.doesNotMatch(line.text, /\d\.\d m/);
});

test('Queensland section 299(4): a harness alone needs the other controls considered', () => {
  const task = 'Replace roof sheets on a two storey house.';
  const harness = 'Workers wear a full body harness clipped to a static line.';
  const asked = questionsFor({ state: 'qld', task, fallRisk: 'yes' });
  assert.ok(asked.required.some((item) => item.id === 'controlsConsidered'));

  const bare = draft(task, { fallRisk: 'yes', facts: { fallControl: harness } });
  assert.equal(bare.kind, 'stand-down');
  assert.deepEqual(bare.missing, ['Other fall controls considered', 'Harness and anchors']);

  const done = draft(task, {
    fallRisk: 'yes',
    facts: { fallControl: harness, harnessSystem: 'Full body harness on a restraint lanyard to the engineer-rated static line SL-1, inspected every 6 months, users trained by ABC Training.', controlsConsidered: 'Edge protection was considered but the roof edge has no fixing points; a scaffold cannot be placed on the neighbouring boundary.' },
  });
  assert.equal(done.kind, 'draft');
  assert.ok(done.controls.some((item) => /^Other fall controls considered: Edge protection/.test(item.text)));
  assert.ok(done.controls.some((item) => item.level === 'PPE'));

  // Edge protection is an engineering control, so nothing more is needed.
  const edge = draft(task, { fallRisk: 'yes', facts: { fallControl: 'Edge protection is installed around the roof perimeter first.' } });
  assert.equal(edge.kind, 'draft');

  // The rule is Queensland's. NSW does not ask.
  const nsw = prepareDraft({ state: 'nsw', task, fallRisk: 'yes', facts: { fallControl: harness, harnessSystem: 'Full body harness on a restraint lanyard to the rated static line, inspected every 6 months, users trained.' } });
  assert.equal(nsw.kind, 'draft');
  assert.ok(nsw.controls.some((item) => /was considered first for any fall of more than 2 metres, and is not reasonably practicable for this work because ____/.test(item.text)));
});

test('Western Australia: danger zones, and the regulator notice for tilt-up work', () => {
  const lines = prepareDraft({ state: 'wa', task: 'Relocate the switchboard near the overhead power lines.', fallRisk: 'no', facts: { electricalSafety: 'Plant and people stay 4 m from the lines, with a safety observer watching.' } });
  assert.equal(lines.instrument, 'Work Health and Safety (General) Regulations 2022 (WA)');
  const line = lines.controls.find((item) => /danger zone/.test(item.text));
  assert.match(line.text, /0\.5 m .* 1\.0 m .* 3\.0 m .* 6\.0 m .*regulation 166A/);

  const task = 'Erect six precast concrete wall panels using a 100 tonne mobile crane.';
  const pack = {
    craneCompany: 'Example Cranes supplies and operates the crane under its lift plan.',
    erectionDesign: 'Erection design drawing ED-01 revision B by the project engineer.',
    centreOfGravity: 'Centre of gravity is marked on each panel shop drawing, 1.2 m above the base.',
    braceArrangement: 'Two braces per panel, fixed to the slab with chemical anchors as shown on drawing ED-02.',
  };
  const bare = prepareDraft({ state: 'wa', task, fallRisk: 'no', facts: pack });
  assert.deepEqual(bare.missing, ['WorkSafe WA notification']);
  const done = prepareDraft({ state: 'wa', task, fallRisk: 'no', facts: { ...pack, regulatorNotified: 'Notified on 2 September 2026, 15 working days before casting.' } });
  assert.equal(done.kind, 'draft');
  assert.ok(done.controls.some((item) => /regulation 306I/.test(item.text)));
  assert.ok(done.controls.some((item) => /regulation 306H/.test(item.text)));
  // Other states do not ask for it.
  assert.equal(prepareDraft({ state: 'nsw', task, fallRisk: 'no', facts: pack }).kind, 'draft');
});

test('Tasmania uses its regulations and gives no power line distance', () => {
  const done = prepareDraft({ state: 'tas', task: 'Relocate the switchboard near the overhead power lines.', fallRisk: 'no', facts: { electricalSafety: 'Plant and people stay 4 m from the lines, with a safety observer watching.' } });
  assert.equal(done.instrument, 'Work Health and Safety Regulations 2022 (Tas)');
  assert.equal(done.sectionRef, 'regulation 299');
  const line = done.controls.find((item) => /electric line/.test(item.text));
  assert.match(line.text, /regulation 166/);
  assert.match(line.text, /Electricity Industry Safety and Administration Act 1997/);
  assert.doesNotMatch(line.text, /\d\.\d m/);
});

test('ACT: light rail, and processing crystalline silica material with a power tool', () => {
  const cut = prepareDraft({ state: 'act', task: 'Cut and grind concrete pavers with an angle grinder to fit the new path.', fallRisk: 'no', facts: { silicaControls: 'Pavers are cut with on-tool dust extraction, and fit tested P2 respirators are worn.' } });
  assert.equal(cut.instrument, 'Work Health and Safety Regulation 2011 (ACT)');
  assert.ok(cut.highRisk.includes('Involves processing crystalline silica material using a power tool or another mechanical method'));
  assert.ok(cut.hazards.some((row) => row.hazard === 'Respirable crystalline silica'));
  // Not a category elsewhere.
  assert.ok(!prepareDraft({ state: 'nsw', task: 'Cut and grind concrete pavers with an angle grinder.', fallRisk: 'no', facts: { silicaControls: 'Pavers are cut with on-tool dust extraction, and fit tested P2 respirators are worn.' } }).highRisk.some((item) => /silica/.test(item)));
  // Hand tools alone do not count.
  assert.ok(!prepareDraft({ state: 'act', task: 'Score and snap plasterboard sheets with a knife.', fallRisk: 'no' }).highRisk.some((item) => /silica/.test(item)));

  const rail = prepareDraft({ state: 'act', task: 'Repair the concrete footpath kerb beside the light rail line.', fallRisk: 'no' });
  assert.ok(rail.highRisk.some((item) => /including light rail/.test(item)));
});

test('Northern Territory: 3 metres for residential construction work, 2 metres otherwise', () => {
  const nt = (task, residential, fallRisk = 'no', facts = {}) => prepareDraft({ state: 'nt', task, residential, fallRisk, facts });
  assert.equal(nt('Replace a 3m length of fence.', '').kind, 'error');

  // A 2.5 m height is a fall risk for commercial work but not for residential work.
  const task = 'Fix gutters from a platform at 2.5 m.';
  assert.match(questionsFor({ state: 'nt', task, residential: 'no', fallRisk: 'no' }).fall.warning, /more than 2 metres/);
  assert.equal(questionsFor({ state: 'nt', task, residential: 'yes', fallRisk: 'no' }).fall.warning, '');

  const house = nt('Replace roof sheets on a two storey house.', 'yes', 'yes', { fallControl: 'Edge protection is installed around the roof perimeter first.' });
  assert.ok(house.highRisk.includes('If it is residential construction work, involves a risk of a person falling more than 3 m'));
  assert.equal(house.fallMetres, 3);
  assert.equal(house.residential, 'Yes');
  assert.ok(house.hazards.some((row) => row.risk === 'A person falls more than 3 metres.'));

  const shop = nt('Replace roof sheets on a shop.', 'no', 'yes', { fallControl: 'Edge protection is installed around the roof perimeter first.' });
  assert.ok(shop.highRisk.includes('If it is not residential construction work, involves a risk of a person falling more than 2 m'));
  assert.equal(shop.fallMetres, 2);
  // Other states do not ask.
  assert.equal(prepareDraft({ state: 'qld', task: 'Replace a 3m length of fence.', fallRisk: 'no' }).residential, '');
});

test('confined spaces, propping, power lines and water stand down without their key fact', () => {
  const cases = [
    ['Install a pump in a confined space.', 'Confined space entry'],
    ['Demolish a load-bearing wall with propping.', 'Temporary support design'],
    ['Paint the fascia near the overhead power lines.', 'Electrical safety arrangement'],
    ['Replace boards on a jetty over a tidal river.', 'Drowning controls'],
  ];
  for (const [task, label] of cases) {
    const done = draft(task);
    assert.equal(done.kind, 'stand-down', task);
    assert.ok(done.missing.includes(label), `${task}: ${done.missing}`);
  }
});

test('a draft has job steps with hazards and controls, and a PPE list', () => {
  const done = draft('Remove and replace the iron roof sheets on a house, about 7 m up.', {
    fallRisk: 'yes',
    facts: { fallControl: 'Perimeter guardrail scaffold around the roof edge.', controlsConsidered: 'Guardrail is in place.' },
  });
  const names = done.jobSteps.map((step) => step.step);
  assert.equal(names[0], 'Before starting');
  assert.equal(names[names.length - 1], 'Finish and clean up');
  assert.ok(names.includes('Remove old roofing'));
  const access = done.jobSteps.find((step) => step.step === 'Set up roof access and fall protection');
  assert.ok(access.controls.some((line) => /Perimeter guardrail scaffold/.test(line)), 'the fall control goes in its step');
  const ticked = done.ppe.flatMap((group) => group.items.filter((item) => item.ticked).map((item) => item.id));
  assert.ok(['hardHat', 'boots', 'hivis', 'longs', 'gloveCut', 'sunscreen'].every((id) => ticked.includes(id)));
});

test('roof beams are not roofing, and indoor work gets no sunscreen', () => {
  const beams = draft('Lift the carport roof beams into place with a crane truck.', { crane: 'own', facts: { craneChart: '1.5 t at 6 m radius.' } });
  assert.ok(!beams.jobSteps.some((step) => step.step === 'Remove old roofing'));
  const paint = draft('Paint the interior walls of a shop with solvent-based enamel paint.', { facts: { safetyDataSheet: 'Flammable liquid, ventilate, gloves and eye protection.' } });
  const ticked = paint.ppe.flatMap((group) => group.items.filter((item) => item.ticked).map((item) => item.id));
  assert.ok(!ticked.includes('sunscreen'));
  assert.ok(ticked.includes('gloveChemical'));
});

test('work SiteReady has no job steps for is stood down, not issued with generic text', () => {
  const done = draft('Reupholster the foyer lounge chairs.');
  assert.equal(done.kind, 'stand-down');
  assert.match(done.missing[0], /^Job steps for this work/);
});

test('a crane company runs the crane unless the subcontractor says it runs its own', () => {
  const task = 'Lift steel beams into place with a mobile crane.';
  // The lifts are the crane company's work, so nothing is asked about them.
  const done = draft(task);
  assert.equal(done.kind, 'draft');
  assert.deepEqual(done.missing, []);
  assert.equal(done.craneOperator, 'Crane company');
  const steps = done.jobSteps.map((step) => step.step);
  assert.ok(steps.includes('Work with the crane crew during lifts'));
  assert.ok(!steps.includes('Set up the crane'));
  assert.ok(!done.controls.some((item) => /free-fall/.test(item.text)));
  const own = draft(task, { crane: 'own' });
  assert.deepEqual(own.missing, ['Crane chart']);
  const ownDone = draft(task, { crane: 'own', facts: { craneChart: 'Rated capacity 6.2 t at 14 m radius.' } });
  assert.ok(ownDone.jobSteps.some((step) => step.step === 'Set up the crane'));
  assert.equal(ownDone.craneOperator, 'Our company');
});

test('a proprietary system is erected to its supplier\'s instructions, which the SWMS lists', () => {
  const task = 'Erect the slab formwork and falsework for level 12.';
  const stood = draft(task);
  assert.ok(stood.missing.includes('System and supplier instructions'));
  const done = draft(task, { facts: {
    systemInstructions: 'Example deck system from Example Formwork Hire, erected to its assembly instructions AI-7 revision 4. Crew trained by the supplier.',
    formworkDesign: 'Formwork design FW-1 by the formwork engineer.',
    loadLimits: 'Deck loads on drawing FW-2, signed at each landing area.',
  } });
  assert.equal(done.kind, 'draft');
  const erect = done.jobSteps.find((step) => step.step === 'Erect falsework and shores');
  assert.ok(erect.controls.some((line) => /assembly instructions AI-7/.test(line)));
  assert.ok(erect.controls.some((line) => /Do not mix components/.test(line)));
  assert.ok(erect.hazards.some((line) => /^Manual handling/.test(line)));
  assert.deepEqual(done.references.map((item) => item.label), ['Load limits', 'System and supplier instructions', 'Formwork design']);
});

test('the deck is laid the way the user chooses, and ply loading onto the deck is covered', () => {
  const task = 'Erect the slab formwork and falsework and lay the ply deck for level 12.';
  const facts = {
    systemInstructions: 'Example deck system, erected to its assembly instructions AI-7 revision 4.',
    formworkDesign: 'Formwork design FW-1 by the formwork engineer.',
    loadLimits: 'Deck loads on drawing FW-2, signed at each landing area.',
  };
  const asked = questionsFor({ state: 'qld', task, fallRisk: 'no' });
  const question = asked.required.find((item) => item.id === 'deckMethod');
  assert.deepEqual(question.choices.map((choice) => choice.value), ['below', 'top']);
  assert.ok(draft(task, { facts }).missing.includes('How the deck is laid'));

  const deckStep = (method) => draft(task, { facts: { ...facts, deckMethod: method } })
    .jobSteps.find((step) => step.step === 'Install edge protection and lay the deck').controls.join(' ');
  assert.match(deckStep('below'), /working platform below the joists/);
  assert.doesNotMatch(deckStep('below'), /Never step onto joists/);
  assert.match(deckStep('top'), /Never step onto joists or unfixed sheets/);
  assert.doesNotMatch(deckStep('top'), /platform below the joists/);

  const done = draft(task, { facts: { ...facts, deckMethod: 'top' } });
  const loading = done.jobSteps.find((step) => step.step === 'Load ply onto the deck while it is being laid');
  assert.ok(loading.controls.some((line) => /Never on joists alone or on unfixed sheets/.test(line)));
  assert.ok(done.controls.some((item) => /Deck laid on top, working away from the edge/.test(item.text)));
});

test('load limits must be stated before materials or plant go on a deck or slab', () => {
  for (const task of [
    'Load out level 20 with ply and props from the loading platform.',
    'Lift reo bundles onto the deck and tie the slab reinforcement.',
    'Move pallets of blocks across the suspended slab with a forklift.',
  ]) {
    assert.ok(draft(task).missing.includes('Load limits'), task);
  }
  assert.ok(!draft('Paint the interior walls of a shop with water-based paint.').missing.includes('Load limits'));
});

test('only the line hand and pour crew under a working placing boom, two braces before the hook is released, and respirators fit tested', () => {
  const pour = draft('Pump concrete with a placing boom and place and finish the slab.');
  const pump = pour.jobSteps.find((step) => step.step === 'Set up the concrete pump and placing boom');
  assert.ok(pump.controls.some((line) => line.startsWith('Only the line hand and the pour crew work under the boom.')));

  const precast = draft('Install precast concrete columns with a mobile crane and brace them.', { facts: {
    craneCompany: 'Example Cranes operates the crane under its lift plan.',
    erectionDesign: 'Erection design drawing PC-1 revision A by the precast engineer.',
    centreOfGravity: 'Marked on each shop drawing.',
    braceArrangement: 'Two braces per column on drawing PC-2.',
  } });
  const brace = precast.jobSteps.find((step) => step.step === 'Stand and brace the precast elements');
  assert.ok(brace.controls.some((line) => /at least two braces fixed.*before the crane hook is released/.test(line)));

  const asbestos = draft('Remove bonded asbestos cement sheets.', { facts: { asbestosArrangement: 'A licensed removalist removes them under a control plan.' } });
  const ppe = asbestos.ppe.flatMap((group) => group.items).find((item) => item.id === 'p2');
  assert.equal(ppe.label, 'P2 respirator (fit tested)');
  assert.ok(ppe.ticked);
  assert.ok(asbestos.jobSteps[0].controls.some((line) => /fit tested to each wearer/.test(line)));
  assert.ok(!draft('Lay carpet tiles in an office.').jobSteps[0].controls.some((line) => /fit tested/.test(line)));
});

test('work into a live hospital gets the hospital step, demolition and asbestos controls', () => {
  const task = "Saw cut and core drill an opening through the existing hospital's load-bearing concrete wall to connect the new link bridge, next to occupied wards, with the wall propped to the engineer's design before cutting.";
  const done = prepareDraft({ state: 'qld', task, fallRisk: 'no', facts: { temporarySupport: 'Propped to the engineer\'s design PR-05, checked before cutting.', silicaControls: 'Wet cutting with water-fed saws. Fit tested P2 respirators are worn while cutting. The written silica assessment is attached.' } });
  assert.equal(done.kind, 'draft');
  const steps = done.jobSteps.map((step) => step.step);
  assert.ok(steps.includes('Work next to the live hospital'));
  assert.ok(steps.includes('Cut an opening in a load-bearing wall'));
  const text = JSON.stringify(done.jobSteps);
  assert.match(text, /asbestos register/);
  assert.match(text, /demolition licence/);
});

test('every question the draft asks is kept when the answer comes from the browser', () => {
  const { draftBody } = require('../input');
  const source = require('fs').readFileSync(require('path').join(__dirname, '..', 'draft.js'), 'utf8');
  const start = source.indexOf('const CATEGORY_FACTS');
  const ids = [...source.slice(start).matchAll(/\bid: '([a-zA-Z]+)'/g)].map((match) => match[1]);
  assert.ok(ids.includes('harnessSystem') && ids.includes('spoilPlan'));
  const facts = Object.fromEntries(ids.map((id) => [id, 'answer']));
  const kept = draftBody({ facts }).facts;
  assert.deepEqual(ids.filter((id) => kept[id] !== 'answer'), []);
});

test('step search finds earthworks steps by the words used on site, and only whole words', () => {
  const { searchSteps } = require('../steps');
  const found = searchSteps('earthworks');
  assert.ok(found.length >= 10);
  for (const id of ['spoilManage']) assert.ok(found.includes(id), id);
  assert.ok(!searchSteps('earthworks').some((id) => /batter|door|paint/i.test(id)));
});

test('job steps follow the order the user chose, and a step not in it stays after the one it followed', () => {
  const { draftBody } = require('../input');
  const body = { state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no' };
  const names = prepareDraft(draftBody(body)).jobSteps.map((step) => step.step);
  assert.ok(names.length >= 3);
  const reversed = [...names].reverse();
  assert.deepEqual(prepareDraft(draftBody({ ...body, stepOrder: reversed })).jobSteps.map((step) => step.step), reversed);
  // Steps left out of the order keep their place around the ones named.
  const partial = prepareDraft(draftBody({ ...body, stepOrder: [names[2], names[1]] })).jobSteps.map((step) => step.step);
  // The first step was before any named one; the fourth followed the third, so it moves with it.
  assert.deepEqual(partial.slice(0, 4), [names[0], names[2], names[3], names[1]]);
});
