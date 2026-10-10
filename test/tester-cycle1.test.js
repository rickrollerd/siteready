// The independent tester's first cycle on staging (9 October 2026), replayed from its exact task
// texts and site answers: steps brought in by stray words, the confined space and excavation
// categories, asbestos removed by others, and the steel crew's bracing, dogging and rigging.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, screenHighRisk, packageKinds } = require('../draft');
const { packageHighRisk, settlePackages } = require('../ai-scope');

// The draft as the page makes it: every question the draft asks is answered, a choice with the
// answer given here or its first option.
function draft(input, answers = {}) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    const open = (asked.required || []).filter((item) => !facts[item.id]);
    if (!open.length) break;
    for (const item of open) facts[item.id] = answers[item.id] || (item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : `As set out in the site plan: ${item.label}.`);
  }
  return { ...prepareDraft({ ...input, facts }), facts };
}
const asked = (input) => (questionsFor({ ...input, facts: {} }).required || []).map((item) => item.id);
const steps = (d) => d.jobSteps.map((step) => step.step);
const risk = (d) => d.highRisk.join(' / ');
const SITE = { company: 'Koval Site Services Pty Ltd', crane: 'company', fallRisk: 'yes', residential: 'no', principalContractor: 'Principal Builders Pty Ltd' };

const PRECAST = 'Install precast concrete panels to the lift core of a 9 storey commercial building in Parramatta. Panels craned in by the crane company, landed and braced, then grouted. Work from a mobile scaffold and off the slab edge.';
const STEEL = "Erect structural steel columns and beams to Levels 1 to 6 of the acute services building at Monash Health Clayton, working from scissor and boom lifts. Install permanent and temporary bracing; temporary bracing stays until the floor diaphragm is complete. Steel offloaded by the head contractor's tower crane; our crew do the dogging and rigging.";
const STATION_BOX = 'Place and compact concrete to the station box base slab and perimeter retaining walls by concrete boom pump, including night pours, within a confined station box excavation up to 18 metres deep with a single egress ramp. Concrete delivered by agitators on the shared haul road. Fix reinforcement and erect and strip formwork and falsework to the slab and walls.';
const SCAFFOLD = "Erect and dismantle modular scaffold to the external facade of a 22 storey commercial tower in the Perth CBD, up to 70 metres, including loading bays and a cantilevered hoist tie-in. Materials hoisted by the crane company's mobile crane. Work over a public footpath.";
const SWITCHROOM = 'Install new 11kV switchgear in the existing high voltage switchroom at the Adelaide Desalination Plant, including offloading and positioning switchboards with a crane and forklift, pulling and terminating HV and LV cables on cable ladder at high level from scissor lifts, and core drilling wall and slab penetrations for cable entries. The switchroom is an enclosed room with restricted egress on a live operating water plant. All isolation and permit to work controlled by the principal contractor; no live work.';

test('SWMS1: a site answer that says there are no overhead lines brings no power line step or energised category', () => {
  for (const liveServices of ['No live services. No overhead lines.', 'No live services/no overhead lines', 'Nil overhead power lines; no live services in the work area.']) {
    const d = draft({ ...SITE, state: 'nsw', task: PRECAST, site: { liveServices } });
    assert.equal(d.kind, 'draft');
    assert.ok(!steps(d).includes('Plan the work near overhead power lines'), liveServices);
    assert.doesNotMatch(risk(d), /energised electrical/, liveServices);
    assert.match(risk(d), /precast/);
  }
  // An answer that names lines still brings them, including one that keeps plant out of the no go zone.
  for (const liveServices of ['Overhead power lines on the boundary, 8 m from the crane.', 'Keep the crane out of the no go zone of the overhead power lines.', 'No street lights, but 11 kV overhead power lines along the north boundary.']) {
    const d = draft({ ...SITE, state: 'nsw', task: PRECAST, site: { liveServices } });
    assert.ok(steps(d).includes('Plan the work near overhead power lines'), liveServices);
  }
});

test('SWMS1: grouting precast panels is not tiling, so no tiling step comes from the slab edge', () => {
  const d = draft({ ...SITE, state: 'nsw', task: PRECAST });
  assert.ok(!steps(d).includes('Lay tiles near open edges'));
  assert.ok(!steps(d).some((step) => /tile/i.test(step)));
  assert.ok(steps(d).includes('Grout the base'));
  // Tiling, and grouting tiles, still bring the tiling steps.
  const tiles = draft({ ...SITE, state: 'qld', fallRisk: 'no', task: 'Lay floor tiles to the balcony at the slab edge and grout them.' });
  assert.ok(steps(tiles).some((step) => /tiles/i.test(step)));
});

test('SWMS3: a pour inside a station box excavation brings no trenching or pipe laying, and keeps the excavation category', () => {
  const d = draft({ ...SITE, state: 'qld', task: STATION_BOX }, { spaceAssessment: 'notConfined' });
  assert.equal(d.kind, 'draft');
  for (const name of ['Locate underground services', 'Excavate', 'Work in the trench', 'Lay pipes', 'Backfill the trench', 'Reinstate the surface', 'Run earthmoving plant']) assert.ok(!steps(d).includes(name), name);
  assert.match(risk(d), /trench with an excavated depth greater than 1\.5 ?m/);
  assert.ok(steps(d).includes('Pump and place concrete'));
  // Agitators on the shared haul road still put plant and people together.
  assert.ok(steps(d).includes('Separate plant and people on site'));
  // Digging is still digging.
  const dig = draft({ ...SITE, state: 'qld', fallRisk: 'no', task: 'Excavate a trench 2.4 m deep and lay the stormwater pipe.' });
  for (const name of ['Excavate', 'Work in the trench', 'Lay pipes']) assert.ok(steps(dig).includes(name), name);
  assert.ok(steps(draft({ ...SITE, state: 'qld', fallRisk: 'no', task: 'Bulk earthworks with dozers, scrapers and haul trucks on the haul road.' })).includes('Run earthmoving plant'));
});

const INSIDE = 'Work inside a deep excavation';

test('SWMS3: work inside an existing deep excavation, station box or shaft has its own step, from the Excavation work code', () => {
  const d = draft({ ...SITE, state: 'qld', task: STATION_BOX }, { spaceAssessment: 'notConfined' });
  assert.deepEqual(steps(d).slice(0, 2), ['Before starting', INSIDE], 'getting in and working safely in the box comes before the pour');
  const step = d.jobSteps.find((item) => item.step === INSIDE);
  const lines = step.controls.join('\n');
  // Access and egress, the ground and batter watch, objects and plant at the edge, and emergency egress.
  for (const pattern of [/steps, a ramp or a ladder secured in place/, /landing platforms or scaffold towers/, /second way in and out is kept for emergency use/, /toe boards/, /frequently checks the ground, batters and ground support/,
    /Plant does not operate or travel near the edge/, /outside the zone of influence/, /rescuing a worker from the excavation/]) assert.match(lines, pattern);
  // Every line is cited to the Excavation work code sections it comes from.
  for (const line of step.controls) assert.match(line, /\(Excavation work Code of Practice 2021 \(Qld\) s (?:3\.8|4 \(Table 2\), s 4\.4|4\.1(?:, s 4\.4)?|4\.3|4\.4|6\.7)\)$/, line);
  assert.match(risk(d), /trench with an excavated depth greater than 1\.5 ?m/);
  // The crew digs nothing, so there is no permit to dig.
  assert.ok(!d.jobSteps.some((item) => item.controls.some((line) => /^No digging starts/.test(line))));
  // In New South Wales the SafeWork NSW code, with the same section numbers.
  const nsw = draft({ ...SITE, state: 'nsw', task: STATION_BOX }, { spaceAssessment: 'notConfined' });
  for (const line of nsw.jobSteps.find((item) => item.step === INSIDE).controls) assert.match(line, /\(SafeWork NSW Code of practice: Excavation work \(January 2020\) s [\d.]+/, line);
  // At the base of an existing shaft, and inside an existing excavation: the step, and no trench steps.
  // A basement dig is an excavation too (tester, 10 October 2026).
  for (const task of ['Fix reinforcement and pour the base slab at the bottom of the shaft, 14 m deep.', 'Form and pour the pile caps at the base of the existing excavation 3 m deep.', 'Install the pump and pipework inside the existing wet well shaft 9 m deep.', 'Fix reo in the basement excavation 6 m deep.']) {
    const inside = draft({ ...SITE, state: 'qld', fallRisk: 'no', task });
    assert.ok(steps(inside).includes(INSIDE), task);
    for (const name of ['Excavate', 'Work in the trench', 'Backfill the trench']) assert.ok(!steps(inside).includes(name), `${task}: ${name}`);
  }
});

test('the deep excavation step comes only for work inside one deeper than 1.5 m that the crew does not dig', () => {
  const none = [
    // Digging it: the trench, earthmoving and basement steps cover the work.
    'Excavate a trench 2.4 m deep and lay the stormwater pipe.',
    'Bulk excavate the station box to 18 m deep with excavators.',
    'Excavate the shaft to 12 m deep and install the liner rings inside the shaft.',
    'Dig the pile caps inside the excavation 3 m deep with a mini excavator.',
    'Install ground anchors and walers inside the station box excavation 18 m deep as the dig goes down.',
    'Working in or around trenches and excavations, 2.5 m deep.',
    // Not deeper than 1.5 m, or no depth given for an excavation.
    'Form and pour a footing inside the excavation 1.2 m deep.',
    'Pour the base slab within the station box excavation.',
    // Shafts through a building.
    'Install lift guide rails inside the lift shaft.',
    'lift install in shaft',
    'Hoisting machines, rails and equipment into the shaft and machine room',
    'Install pipework in the riser shaft from level 1 to level 9.',
    'Install ductwork in the ventilation shaft from basement to roof, 40 m.',
  ];
  for (const task of none) assert.ok(!steps(draft({ ...SITE, state: 'qld', fallRisk: 'no', task })).includes(INSIDE), task);
  // From a scope: the package that puts its work in the station box gets the step whatever the AI
  // chose, and a package that does not cannot have it.
  assert.ok(packageKinds('Place and compact concrete to the station box base slab (Station box; conditions: All work is within a confined station box up to 18m deep with a single egress ramp).', ['concrete']).includes('inExcavation'));
  assert.deepEqual(packageKinds('Place and compact concrete to the ground floor slab.', ['concrete', 'inExcavation']), ['concrete']);
});

test('confined space: the words "confined" or atmosphere monitoring ask the question; a switchroom does not', () => {
  // A room designed for people with restricted egress is generally not a confined space (code s 1.1).
  const sa = draft({ ...SITE, state: 'sa', task: SWITCHROOM, ppe: ['hardHat', 'glassesClear', 'boots', 'hivis', 'gloveInsulated', 'arcRated'] });
  assert.equal(sa.kind, 'draft');
  assert.doesNotMatch(risk(sa), /confined/i);
  assert.ok(!asked({ ...SITE, state: 'sa', task: SWITCHROOM }).includes('spaceAssessment'));
  // A space the task calls confined is decided by the question.
  assert.ok(asked({ ...SITE, state: 'qld', task: STATION_BOX }).includes('spaceAssessment'));
  const yes = draft({ ...SITE, state: 'qld', task: STATION_BOX }, { spaceAssessment: 'confined' });
  assert.match(risk(yes), /confined space/);
  assert.ok(steps(yes).includes('Prepare to enter the confined space'));
  const no = draft({ ...SITE, state: 'qld', task: STATION_BOX }, { spaceAssessment: 'notConfined' });
  assert.doesNotMatch(risk(no), /confined/i);
  // "Confined to" is where the work is limited to, not a confined space.
  assert.ok(!asked({ ...SITE, state: 'qld', task: 'Paint the walls. Work is confined to level 3.' }).includes('spaceAssessment'));
});

test('package flags: confined spaces named in the scope are likely, atmosphere monitoring alone depends on the question', () => {
  const ids = (flag) => flag.categories.map((item) => `${item.id}${item.likely ? '?' : ''}`);
  const box = screenHighRisk({ state: 'qld', task: 'Place and compact concrete to the station box base slab (Station box; conditions: All work is within a confined station box up to 18m deep with a single egress ramp; atmosphere monitoring where required).' });
  assert.ok(ids(box).includes('confined?'));
  assert.ok(ids(box).includes('trench'));
  assert.match(box.categories.find((item) => item.id === 'confined').dependsOn, /confined space definition/);
  const chambers = screenHighRisk({ state: 'sa', task: 'Install new 11kV switchgear (Switchroom; conditions: Switchroom is an enclosed room with restricted egress; confined and restricted spaces apply in some chambers).' });
  assert.ok(ids(chambers).includes('confined?'));
  const room = screenHighRisk({ state: 'sa', task: 'Install new 11kV switchgear (Switchroom; conditions: Switchroom is an enclosed room with restricted egress).' });
  assert.ok(!ids(room).some((id) => id.startsWith('confined')) && !room.dependsOn.some((item) => item.id === 'confined'));
  const air = screenHighRisk({ state: 'sa', task: 'Install the pumps in the valve chamber (conditions: atmosphere monitoring before entry).' });
  assert.ok(!ids(air).some((id) => id.startsWith('confined')));
  assert.ok(air.dependsOn.some((item) => item.id === 'confined'));
});

test('package flags: the rebuilt Qld station box and SA switchroom readings', async () => {
  const row = (pack, activity, extra = {}) => ({ activity, type: 'Site work', package: pack, quotes: [], where: '', plant: '', conditions: '', unknowns: '', ...extra });
  const box = { activities: [
    row('Trade installation: station box', 'Place and compact concrete to the station box base slab and perimeter retaining walls by concrete boom pump, including night pours', { where: 'Station box', plant: 'Concrete boom pump; agitator trucks', conditions: 'All work is within a confined station box up to 18m deep with a single egress ramp; atmosphere monitoring where required; night pours' }),
    row('Trade installation: station box', 'Erect and strip formwork and falsework to the slab and walls', { where: 'Station box' }),
    row('Mobile plant spotting', 'Spot concrete agitators on the shared haul road and at the pump', { plant: 'Agitator trucks', conditions: 'Shared haul road' }),
  ], packages: [{ package: 'Trade installation: station box', groups: ['concrete', 'formwork'], byOthers: [], unknown: [], unmatched: [] }] };
  const flags = await packageHighRisk(settlePackages(box), 'qld');
  const station = flags.find((flag) => flag.package === 'Trade installation: station box');
  assert.deepEqual(station.categories.map((item) => `${item.id}${item.likely ? '?' : ''}`), ['confined?', 'trench', 'plant']);

  const sa = { activities: [
    row('Demolition and removal', 'Remove redundant switchgear, cabling and cable ladder', { where: 'Existing switchroom', conditions: "Asbestos removed by the principal's licensed removalist before our work starts" }),
  ], packages: [{ package: 'Demolition and removal', groups: [], byOthers: [], unknown: [], unmatched: [] }] };
  const [demo] = await packageHighRisk(settlePackages(sa), 'sa');
  assert.ok(!demo.categories.some((item) => item.id === 'asbestos'));
});

test('asbestos removed by others before our work is not this work disturbing asbestos; removing it ourselves is', () => {
  const ids = (task) => screenHighRisk({ state: 'sa', task }).categories.map((item) => item.id);
  for (const task of [
    'Remove redundant switchboards and cabling (Switchroom; conditions: asbestos removal by others before our work).',
    'Strip out the existing switchroom equipment and make good (conditions: Hazardous materials removed before our work).',
    'Demolition of existing switchboards (conditions: asbestos removal completed by the principal prior to commencement).',
  ]) assert.ok(!ids(task).includes('asbestos'), task);
  assert.ok(ids('Remove the asbestos cement sheeting before our roofing work.').includes('asbestos'));
  assert.ok(ids('Strip out the existing 1970s office fitout.').includes('asbestos'));
  // The check before starting stays; the removal steps do not come.
  const d = draft({ ...SITE, state: 'sa', fallRisk: 'no', task: 'Strip out the existing switchroom equipment. Asbestos removed by the principal\'s licensed removalist before our work starts.' });
  assert.ok(steps(d).includes('Check for asbestos before starting'));
  assert.ok(!steps(d).includes('Prepare the asbestos work area'));
  assert.doesNotMatch(risk(d), /asbestos/i);
});

test('SWMS2: temporary bracing has its own cited step, and dogging and rigging are covered by the lifting step', () => {
  const d = draft({ ...SITE, state: 'vic', task: STEEL });
  assert.equal(d.kind, 'draft');
  assert.deepEqual(d.notCovered, []);
  const bracing = d.jobSteps.find((step) => step.step === 'Install and remove temporary bracing');
  assert.ok(bracing);
  const lines = bracing.controls.map((line) => (typeof line === 'string' ? line : line.text));
  assert.ok(lines.some((line) => /^Temporary bracing and guys are removed only at the stage the sequential erection procedure sets/.test(line)));
  assert.ok(lines.some((line) => /inspected at the start of each shift/.test(line)));
  // Victoria cites its own steel erection standard; Queensland cites its steel construction code.
  assert.ok(lines.some((line) => /Safe erection of structural steel industry standard \(WorkSafe Victoria, 2009/.test(line)));
  assert.ok(!lines.some((line) => /Steel construction Code of Practice 2004 \(Qld\)/.test(line)));
  const lift = d.jobSteps.find((step) => step.step === 'Lift and land steel with the crane company').controls.map((line) => (typeof line === 'string' ? line : line.text));
  assert.ok(lift.some((line) => /^Each column is bolted down and stable, and each beam secured, before the slings are released/.test(line)));
  const qld = draft({ ...SITE, state: 'qld', task: 'Erect structural steel columns and beams, and install temporary bracing.' });
  const qldLines = qld.jobSteps.find((step) => step.step === 'Install and remove temporary bracing').controls.map((line) => (typeof line === 'string' ? line : line.text));
  assert.ok(qldLines.some((line) => /Steel construction Code of Practice 2004 \(Qld\) s 5\.1/.test(line)));
  assert.ok(!qldLines.some((line) => /WorkSafe Victoria/.test(line)));
  // Steel with no bracing named gets no bracing step.
  assert.ok(!steps(draft({ ...SITE, state: 'qld', task: 'Erect structural steel columns and beams.' })).includes('Install and remove temporary bracing'));
});

test('SWMS4: a scaffold to a facade with loading bays loads no facade panels', () => {
  const d = draft({ ...SITE, state: 'wa', task: SCAFFOLD });
  assert.equal(d.kind, 'draft');
  assert.ok(!steps(d).includes('Load panels onto the floors and move them to the work face'));
  assert.ok(steps(d).includes('Erect the scaffold'));
  const panels = draft({ ...SITE, state: 'qld', task: 'Install facade cladding panels to the tower from the scaffold. Panels delivered in stillages and loaded onto the floors by crane.' });
  assert.ok(steps(panels).includes('Load panels onto the floors and move them to the work face'));
});

test('Builder check: propping precast panels in erection is not a structural alteration (H1), an alteration still is', () => {
  const bc = require('../builder-check');
  const check = (task, strip = false) => {
    const d = draft({ ...SITE, state: 'nsw', task, workplace: '1 Church Street, Parramatta NSW 2150', complianceResponsible: 'Sam Lee, supervisor', reviewer: 'Sam Lee, supervisor', firstAider: 'Jo Smith', musterPoint: 'Front gate', reviewDate: '5 November 2026', date: '5 October 2026', site: { liveServices: 'None in the work area.', publicInterface: 'Hoarding.', otherTrades: 'None.', ground: 'Firm slab.', access: 'Gate 1.' } });
    const swms = bc.fromDraft(d, { state: 'nsw', swms: { signatures: [{ name: 'Jo Smith' }] } });
    if (strip) swms.highRisk = swms.highRisk.filter((label) => !/alterations? or repairs?/i.test(label));
    return { d, h1: bc.checkSwms(swms, { state: 'nsw' }).findings.find((item) => item.rule === 'H1') };
  };
  // The step names "Install temporary support" and "Remove the braces" are separate sentences.
  for (const task of ['Install precast concrete wall panels with temporary propping.', 'Erect precast concrete panels by mobile crane, temporary propping until the slab is poured, then remove the props.']) {
    const { d, h1 } = check(task);
    assert.ok(steps(d).includes('Install temporary support') && steps(d).includes('Remove the braces'), task);
    assert.ok(h1.pass, `${task}: ${h1.message}`);
  }
  // Cutting an opening in a load-bearing wall under props is the alteration category: left off, H1 fails.
  const { h1 } = check('Prop the existing slab and cut a new opening in the load-bearing wall.', true);
  assert.equal(h1.pass, false);
  assert.match(h1.message, /structural alterations or repairs/);
});
