// Content faults found by the messy-user test, round 16 (staging runs 1 to 8 and the SiteLink run, 19 October 2026, on main
// a52feac): wrong-context licences, steps and lines; core work neither stepped nor listed; false items in the work with no job
// steps; SiteWrite's own order; W17 silent or partial; own steps in the wrong place; ratings; SiteWrite's check; products and
// substances.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, packageKinds, suggestedKinds, highRiskMatches } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft, isVague } = require('../builder-check');
const { firmFaults } = require('../step-stages');
const { searchSteps } = require('../steps');
const { riskFor } = require('../register');
const rules = require('../public/substance-rules');

const SITE = { residential: 'no', company: 'Test', workplace: '12 Smith Street, Paddington', principalContractor: 'ABC Builders Pty Ltd', hospital: 'Royal Hospital', firstAider: 'Jo Smith', musterPoint: 'Front gate', worksManager: 'Sam Lee', worksManagerPhone: '0400 118 552', complianceResponsible: 'Sam Lee', reviewer: 'Sam Lee', date: '19 October 2026' };
function answered(input, given = {}) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id] !== undefined && facts[item.id] !== '') continue;
      facts[item.id] = given[item.id] || (item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : ((answersFor(item.id, asked.task)[0] || {}).text || 'As set out in the site plan.').replace(/_{3,}/g, 'as on the site plan'));
      added = true;
    }
    if (!added) break;
  }
  return { ...input, facts };
}
const bodyOf = (input, given) => draftBody(answered({ ...SITE, ...input }, given));
const draftOf = (input, given) => prepareDraft(bodyOf(input, given));
const names = (draft) => draft.jobSteps.map((step) => step.step);
const lines = (draft) => draft.jobSteps.flatMap((step) => [...step.hazards, ...step.controls]).join('\n');
const stepNamed = (draft, name) => draft.jobSteps.find((step) => step.step === name);
const before = (list, a, b) => list.indexOf(a) >= 0 && list.indexOf(b) >= 0 && list.indexOf(a) < list.indexOf(b);
const asSteps = (list) => list.map((step) => (typeof step === 'string' ? { step, hazards: [], controls: [] } : step));
const checked = (draft, state) => checkSwms(fromDraft(draft, { state, swms: { signatures: [{ name: 'Jo Smith' }] } }), { state });
const finding = (draft, state, rule) => checked(draft, state).findings.find((item) => item.rule === rule);
const pkg = (input) => ({ ...input, kinds: packageKinds(input.task, input.kinds) });
const flagged = (list, step, after) => firmFaults(asSteps(list)).some((item) => item.step === step && item.after === after);

// The runs' own words.
const SPRINKLER = { state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Make final connection of fire services to installed CCRMF. Install seismic restraints to fire services. Install wet pipe sprinkler system including monitored valves, test drains and switchboard baffles. Install deluge sprinkler systems in SE/TH dayrooms and DU cells. Install double interlock pre-action sprinkler systems in MH and MU accommodation cells. Install valving arrangement above slab for flushing building branch lines. Install internal fire hydrant and fire hose reel reticulation. Install regulatory signage for fire systems. Install fire extinguishers and fire blankets including lockable cabinets. Install metal shrouds over exposed pipework and conduit in prisoner accessible areas. Install mounting plates for fixtures on corrugated walls and ceilings. Install ceiling and in-wall noggins. Apply non-pick caulking and bedding to installed items. Label pits, pipes, valves and installed items. Install additional fire hydrants and hose reels to cover roof space.' };
const PENETRATIONS = { state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Scan concrete for cast-in conduits before drilling, coring and cutting. Core drill, scabble and chase penetrations NB50 and under. Form slab block outs and penetrations through precast walls for SE/TH balcony deluge. Cut, patch, trim and make good structure and ceilings for fire services. Clear safety mesh from penetrations and erect and maintain barricades and penetration covers.' };
const ROOF = { state: 'vic', fallRisk: 'yes', crane: 'none', task: 'Strip old roof sheets and replace with new colorbond on a 2 storey shop, approx 380m2, 15 degree pitch. New safety mesh and sisalation, new box gutter and downpipes, new flashings. Scaffold with edge protection on the front and sides done by the scaffolders, we use a cherry picker at the back lane. Old sheets go in a skip' };
const WINDOWS = { state: 'wa', fallRisk: 'yes', crane: 'none', task: 'Replace the aluminium windows and louvres on levels 2 to 5 of a 6 storey office refurb. Old windows come out from inside and new ones go in from inside, open edge while window is out. Glass goes up in the builders hoist and we use a vacuum lifter on the floor. Seal the glazing and flashings' };
const STEEL = { state: 'nsw', fallRisk: 'yes', crane: 'own', kinds: ['steelErect', 'painting'], task: 'Erect structural steel roof frame. Install window and door head steel. Install operable wall portal frames. Install structural steel for kitchen hoods. Install structural steel for architectural accessories: ceiling fans, hanging artwork. Install and remove temporary bracing, shims and packers. Install dyna-bolts and masonry bolt fixings. Touch up paint on installed steel. Protect adjacent surfaces and replace damaged materials.' };
const LIFTS = { state: 'nsw', fallRisk: 'yes', crane: 'own', kinds: ['steelLift', 'crane'], task: 'Crane lift and rig structural steel into position. Handle and off-load materials using trade-specific handling equipment.' };
const CRANE_CHART = { craneChart: 'Our 60 t all terrain crane: rated 6.2 t at 18 m radius from its load chart. The heaviest pick is 3.1 t at 16 m radius.', groundBearing: 'The builder\'s geotechnical engineer certified the hardstand pads for the crane\'s outrigger loads (report GR-02 rev B). Steel outrigger pads under each outrigger.' };
const PAINTER = { state: 'sa', fallRisk: 'yes', crane: 'none', task: 'Paint all internal plasterboard, villaboard walls and ceilings, in Building 1, 2, 3 and 4 in a 3 coat system (excluding Conference Room Ceiling and Walls and additional coats for feature wall colours). Paint Building 4 external surfaces: Paint all cladding, soffits, fascia linings, external timber doors and steel framing, including roller and sliding door jambs, and PVC downpipes. Carry out full preparation of all services to receive paint finishes prior to application including filling, rubbing down, priming, sealing, gapping and all other preparatory work as required, to a finish as required by Australian Standard and in accordance with the project\'s paint and texture coating supplier specifications and manufacturers warranties, for which paint is to be applied. Protect, from paint, all previous trades works including but not limited to the following, windows, joinery items, tiles etc. Provide and maintain washout facility for cleaning of paint equipment to comply with Local Authority and environmental laws.' };
const WATERPROOF = { state: 'tas', fallRisk: 'no', crane: 'none', task: 'Waterproof the wet areas in 24 apartments, levels 1 to 6. Grind high spots, prime, bond breaker at the junctions, 2 coats liquid membrane, flood test the showers before the tilers. Torch on membrane to the planter boxes on the level 1 podium' };
const CRANE_TRUCK = { state: 'act', fallRisk: 'no', crane: 'own', task: 'Vehicle loading crane (crane truck) work: set up the outriggers, load and unload materials, and lift the portable building onto its footings. Also lift the roof trusses up onto the top plates for the chippies' };
const HIAB_CHART = { craneChart: 'Hiab XS 144 vehicle loading crane, 10.5 metre-tonnes, rated 1.2 t at 8 m radius from its load chart; heaviest truss pack 0.9 t at 7 m.', groundBearing: 'The builder\'s engineer confirmed the gravel hardstand carries the outrigger loads (letter GE-04). Outriggers on 600 mm steel pads, checked by the operator.' };
const RESURFACE = { state: 'nt', fallRisk: 'no', crane: 'none', task: 'Resurface 400 m of the Bagot Road service lane at night with one lane kept open to traffic. Traffic control to the approved traffic management plan by our accredited traffic controllers. Mill the old asphalt 50 mm deep with our 1 m profiler and cart the millings away in tipper trucks. Sweep, spray the tack coat from the sprayer truck, lay 50 mm of AC14 asphalt with our paver and compact it with steel drum and multi-tyre rollers. Line marking is done by others.' };

// ---- 1. Wrong-context licences, steps and lines ----

test('A run 3: a sprinkler crew gets no electrical licence, low voltage rescue, shock row, Electrical Safety Act or electrician lines, and no house roof space step', () => {
  const draft = draftOf(SPRINKLER);
  assert.ok(!draft.qualifications.some((name) => /^Electrical work licence|low voltage rescue/i.test(name)), draft.qualifications.join(' | '));
  assert.ok(!draft.emergency.some((row) => /Electric shock/.test(row.type)), JSON.stringify(draft.emergency.map((row) => row.type)));
  assert.ok(!draft.sources.legislation.some((name) => /Electrical Safety Act/.test(name)), draft.sources.legislation.join(' | '));
  assert.doesNotMatch(stepNamed(draft, 'Before starting').controls.join('\n'), /licensed electrical workers|Apprentices are supervised/);
  assert.ok(!names(draft).includes('Work in the roof space'), names(draft).join(' | '));
  // Hydrants that cover the roof space are not work in it, picked or not; a roof space named as the work still is.
  assert.ok(!packageKinds(SPRINKLER.task, ['fireAtHeight', 'roofSpace', 'hoseReels']).includes('roofSpace'));
  assert.ok(suggestedKinds('Run the new cables through the roof space to the bedroom lights in the house.', {}, {}).includes('roofSpace'));
  // A building's switchboards named only as the place for baffles do not make the work electrical; wiring a board does.
  assert.ok(draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'Replace the main switchboard and rewire the lighting circuits.' }).qualifications.some((name) => /^Electrical work licence/.test(name)));
});

test('A run 3: small fire signs print no crane lift, footpath closure, lit sign wiring, network operator zone or facade fixing lines', () => {
  const draft = draftOf({ ...SPRINKLER, kinds: ['signageInstall', 'fireAtHeight', 'hoseReels'] });
  const signs = stepNamed(draft, 'Install the signs');
  assert.ok(signs, names(draft).join(' | '));
  const text = [...signs.hazards, ...signs.controls].join('\n');
  assert.doesNotMatch(text, /lifted with a crane|footpath closure|lit signs|network operator|into the facade/i);
  assert.match(text, /Before drilling, check for cables and pipes/);
  // A shopfront sign keeps its lines.
  const shop = stepNamed(draftOf({ state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Install the illuminated shopfront sign on the facade above the entry.' }), 'Install the signs');
  assert.match([...shop.hazards, ...shop.controls].join('\n'), /lit signs/i);
});

test('A run 2: roof flashings print no mortar raking or silica lines, and a reroof prints no concrete, masonry or plasterboard clean-up', () => {
  const draft = draftOf({ ...ROOF, kinds: ['roofAccess', 'roofEdge', 'roofStrip', 'roof', 'boxGutter', 'gutters', 'wasteRemoval', 'flashingReplace'] });
  const flashing = stepNamed(draft, 'Replace the flashing');
  assert.ok(flashing, names(draft).join(' | '));
  assert.doesNotMatch([...flashing.hazards, ...flashing.controls].join('\n'), /mortar|silica|masonry/i);
  assert.notEqual(flashing.risk.after.level, 'High');
  assert.ok(!names(draft).includes('Clean up the work area'), names(draft).join(' | '));
  assert.doesNotMatch(lines(draft), /plasterboard waste|slurry/i);
  // A wall chased for its flashing keeps them.
  const chased = stepNamed(draftOf({ state: 'vic', fallRisk: 'yes', crane: 'none', task: 'Replace the leaking flashing chased into the brick parapet wall.', kinds: ['flashingReplace', 'roofAccess'] }), 'Replace the flashing');
  assert.match(chased.controls.join('\n'), /Raking out mortar joints/);
});

test('A run 1: drilling dyna-bolt holes prints no saw kick-back or cutting lines, and no hot work permit line', () => {
  // The task welds, but no step of this SWMS welds: the permit line goes in "Before starting", not the drilling step.
  const draft = draftOf({ ...STEEL, task: `${STEEL.task} Weld the cleats on site.`, kinds: ['steelErect', 'painting', 'silicaDrill'] });
  const drill = stepNamed(draft, 'Drill or cut concrete, masonry or stone');
  assert.ok(drill, names(draft).join(' | '));
  assert.doesNotMatch(drill.controls.join('\n'), /kick-back|above shoulder height|hot work permit/i);
  assert.ok(stepNamed(draft, 'Before starting').controls.some((line) => /^No hot work \(welding/.test(line)), 'the permit line prints in Before starting');
  // Cutting keeps them.
  const cut = stepNamed(draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'Cut and chase the block walls for the conduits.', kinds: ['silicaDrill'] }), 'Drill or cut concrete, masonry or stone');
  assert.match(cut.controls.join('\n'), /kick-back/);
});

test('B runs 5 and 6: a painter\'s protect and prep words tick no tile, facade sealing or carpenter\'s materials steps; mobile scaffolds get no tie line; liquid membranes no board line', () => {
  const kinds = suggestedKinds(PAINTER.task, {}, {});
  for (const id of ['tileCut', 'facadeSeal', 'carpLoad']) assert.ok(!kinds.includes(id), kinds.join(', '));
  const painter = draftOf({ ...PAINTER, kinds: ['mobileScaffold', 'plasterHeight', 'paintExternal', 'painting'] });
  assert.doesNotMatch(lines(painter), /scaffold ties|carrying sheets, studs|hoist landing gates/i);
  // A fixed scaffold keeps the tie line, and a facade sealer keeps facade sealing.
  assert.match(lines(draftOf({ ...PAINTER, kinds: ['scaffoldUse', 'paintExternal', 'painting'] })), /scaffold ties/);
  assert.ok(suggestedKinds('Seal the facade joints between the precast panels with polyurethane sealant.', {}, {}).includes('facadeSeal'));
  assert.doesNotMatch(lines(draftOf(WATERPROOF)), /Board handling stops in strong wind/);
});

test('B run 8: a full resurface runs the road plant and ticks no trench patch steps', () => {
  const kinds = suggestedKinds(RESURFACE.task, {}, {});
  assert.ok(kinds.includes('roadPlant'), kinds.join(', '));
  const list = names(draftOf(RESURFACE));
  assert.ok(list.includes('Run the road plant inside the work zone'), list.join(' | '));
  for (const name of ['Reinstate asphalt', 'Saw cut asphalt']) assert.ok(!list.includes(name), list.join(' | '));
});

test('B run 7: a crane truck lifting timber trusses and a portable building gets no steel steps, steel lines, RB licence or crane company line', () => {
  for (const crane of ['own', 'none']) {
    const kinds = suggestedKinds(CRANE_TRUCK.task, {}, { ownCrane: crane === 'own' });
    assert.ok(!kinds.includes('steelErect') && !kinds.includes('steelLift'), kinds.join(', '));
  }
  const draft = draftOf(CRANE_TRUCK, HIAB_CHART);
  assert.equal(draft.kind, 'draft');
  assert.ok(names(draft).includes('Unload with the truck loading crane (hiab)'), names(draft).join(' | '));
  assert.ok(!names(draft).some((name) => /steel/i.test(name)), names(draft).join(' | '));
  assert.ok(!draft.qualifications.some((name) => /structural steel/i.test(name)), draft.qualifications.join(' | '));
  assert.doesNotMatch(lines(draft), /crane company operates the crane|Christmas tree|steel bundles/i);
  // Steel roof trusses erected are still steel.
  assert.ok(suggestedKinds('Erect the long span steel roof trusses with the crane.', {}, {}).includes('steelErect'));
});

test('SiteLink: wiring the FIP to the gas shut-off valve is not gas piping, No to live work settles the energised category, welding sprinkler pipe is arc welding, and cast-in sleeves ask no formwork design', () => {
  for (const words of ['Wire and connect the FIP to the gas shut-off valve.', 'Wire and connect the FIP to the kitchen gas emergency shut-off valve.', 'Wire the fire alarm interface to the gas shutdown valve in the kitchen.']) {
    assert.ok(!highRiskMatches(words, 'no', { id: 'nsw' }).some((item) => item.check === 'gas'), words);
  }
  assert.ok(highRiskMatches('Connect the new gas line to the meter.', 'no', { id: 'nsw' }).some((item) => item.check === 'gas'));
  const comms = { state: 'qld', fallRisk: 'no', crane: 'none', task: 'Install data cabling in the ceilings and risers to the comms rooms. Core drill through the walls for the cable runs.' };
  assert.ok(!draftOf({ ...comms, facts: { liveElectrical: 'no' } }).highRisk.some((label) => /energised/i.test(label)));
  assert.ok(draftOf({ ...comms, facts: { liveElectrical: 'yes' } }).highRisk.some((label) => /energised/i.test(label)));
  const hot = draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'Cut, grind and weld sprinkler pipe and brackets on site under a hot work permit. Fire watch for 60 min after.' });
  assert.ok(names(hot).includes('Weld steel') && !names(hot).some((name) => /^Braze/.test(name)), names(hot).join(' | '));
  const plant = hot.plantInferred.map((item) => item.item);
  assert.ok(!plant.some((item) => /oxy-acetylene/i.test(item)) && plant.includes('Electric power tools and leads'), plant.join(' | '));
  const sleeves = questionsFor(bodyOf({ state: 'nsw', fallRisk: 'yes', crane: 'none', task: 'Install cast-in sleeves, blockouts, holding bolts and conduits into formwork before concrete pour (Slabs and walls site wide). Install wet pipe sprinkler systems (All buildings including concealed spaces).' }));
  assert.ok(!sleeves.required.some((item) => ['formworkDesign', 'loadLimits'].includes(item.id)), sleeves.required.map((item) => item.id).join(', '));
});

// ---- 2. Missing work, stepped or listed ----

test('A run 1: dyna-bolts and masonry bolts are drilled, with the silica question, and Add a step finds them', () => {
  assert.ok(suggestedKinds('Install dyna-bolts and masonry bolt fixings.', {}, {}).includes('silicaDrill'));
  assert.ok(packageKinds(STEEL.task, STEEL.kinds).includes('silicaDrill'));
  const draft = draftOf(pkg(STEEL));
  assert.ok(names(draft).includes('Drill or cut concrete, masonry or stone'), names(draft).join(' | '));
  assert.ok(questionsFor(bodyOf(pkg(STEEL))).required.some((item) => item.id === 'silicaControls'));
  for (const words of ['dyna-bolt', 'dynabolt', 'masonry bolt']) assert.equal(searchSteps(words)[0], 'silicaDrill', words);
});

test('A run 2: new downpipes beside a new box gutter get the downpipe step, Add a step finds it, and the cherry picker brings the EWP step', () => {
  const draft = draftOf(ROOF);
  const list = names(draft);
  assert.ok(list.includes('Install downpipes') && list.includes('Replace the box gutter'), list.join(' | '));
  assert.equal(searchSteps('downpipe')[0], 'gutters');
  assert.ok(list.includes('Use an elevating work platform'), list.join(' | '));
  assert.ok(!draft.notCovered.some((part) => /cherry picker/i.test(part)), JSON.stringify(draft.notCovered));
});

test('A run 4: replacing windows and louvres installs the windows, taking the old ones out, with no roof, louvre blade or flashing steps', () => {
  const kinds = suggestedKinds(WINDOWS.task, {}, {});
  assert.ok(kinds.includes('windowInstall'), kinds.join(', '));
  for (const id of ['roofAccess', 'louvreReplace', 'flashingReplace']) assert.ok(!kinds.includes(id), kinds.join(', '));
  const draft = draftOf(WINDOWS);
  assert.match(stepNamed(draft, 'Install windows').controls.join('\n'), /Old windows and doors are removed one at a time/);
  // Picked by hand, the window step still prints (A run 4: "Install windows" stayed ticked and the draft had only the louvres).
  assert.ok(names(draftOf({ ...WINDOWS, kinds: ['windowInstall', 'glassHandle', 'glazingSeal'] })).includes('Install windows'));
  assert.equal(searchSteps('remove old windows')[0], 'windowInstall');
  // Broken louvre blades are still louvre blades.
  assert.ok(suggestedKinds('Replace the broken louvre blades in the bathroom windows.', {}, {}).includes('louvreReplace'));
});

test('A run 3, B runs 5 and 7: slab block outs, masking other trades\' work and a truss lift with no library step are listed', () => {
  assert.ok(draftOf(PENETRATIONS).notCovered.some((part) => /block outs/i.test(part)));
  assert.ok(draftOf(PAINTER).notCovered.some((part) => /^Protect, from paint/i.test(part)), JSON.stringify(draftOf(PAINTER).notCovered));
  assert.ok(draftOf(CRANE_TRUCK, HIAB_CHART).notCovered.some((part) => /roof trusses/i.test(part)));
});

// ---- 3. No false work with no job steps ----

test('B run 8 and A run 1: milling and compaction the steps cover, a control and a duty are not listed; "Finish and clean up" can cover a part', () => {
  const road = draftOf(RESURFACE);
  assert.ok(!road.notCovered.some((part) => /mill|compact/i.test(part)), JSON.stringify(road.notCovered));
  const lifts = draftOf({ ...LIFTS, unmatched: ['Fall protection for drivers and dogman when off-loading and slinging'] }, CRANE_CHART);
  assert.deepEqual(lifts.notCovered, []);
  const steel = draftOf({ ...STEEL, unmatched: ['Protect adjacent surfaces and replace damaged materials'] });
  assert.ok(!steel.notCovered.some((part) => /Protect adjacent/i.test(part)), JSON.stringify(steel.notCovered));
  const part = draftOf(STEEL).notCovered[0];
  assert.ok(part);
  const covered = draftOf({ ...STEEL, notCoveredInStep: { [part]: 'Finish and clean up' } });
  assert.ok((covered.notCoveredInStep || []).some((item) => item.part === part && item.step === 'Finish and clean up'), JSON.stringify(covered.notCoveredInStep));
});

// ---- 4 and 5. SiteWrite's own order, and W17 ----

test('SiteWrite\'s own order: the box gutter before the sheets, the facade joints after the glass, the edge before the slab edge drilling, the signs after the hose reels', () => {
  const roof = names(draftOf(ROOF));
  assert.ok(before(roof, 'Replace the box gutter', 'Fix new roofing'), roof.join(' | '));
  const glass = names(draftOf({ ...WINDOWS, kinds: ['windowInstall', 'glassHandle', 'glazingSeal', 'facadeSeal', 'louvres'] }));
  assert.ok(before(glass, 'Handle and install glass panels', 'Seal the facade joints') && before(glass, 'Seal glazing', 'Seal the facade joints'), glass.join(' | '));
  const edge = names(draftOf(WINDOWS));
  assert.ok(before(edge, 'Work at edges', 'Drill fixing holes in the slab edge'), edge.join(' | '));
  const signs = names(draftOf({ ...SPRINKLER, kinds: ['signageInstall', 'hoseReels', 'fireAtHeight'] }));
  assert.ok(before(signs, 'Mount the hose reels and extinguishers', 'Install the signs'), signs.join(' | '));
  for (const list of [roof, glass, edge, signs]) assert.deepEqual(firmFaults(asSteps(list)), [], list.join(' | '));
});

test('W17 names own steps placed after the work they precede, and every step a moved asphalt step should follow', () => {
  assert.ok(flagged(['Before starting', 'Set up the crane', 'Rig and lift the load', 'Land and release the load', 'Unload steel from the semi-trailer at the laydown area (Our own step)', 'Finish and clean up'], 'Unload steel from the semi-trailer at the laydown area (Our own step)', 'Rig and lift the load'));
  assert.ok(flagged(['Before starting', 'Erect and connect steel at height', 'Touch up paint on installed steel (Our own step)', 'Install and remove temporary bracing', 'Finish and clean up'], 'Install and remove temporary bracing', 'Touch up paint on installed steel (Our own step)'));
  assert.ok(flagged(['Before starting', 'Install louvres', 'Handle and install glass panels', 'Seal glazing', 'take out the old windows n put in the new frames (Our own step)', 'Finish and clean up'], 'take out the old windows n put in the new frames (Our own step)', 'Handle and install glass panels'));
  const moved = ['Before starting', 'Lay and roll asphalt', 'Set up traffic management', 'Separate plant and people on site', 'Run the road plant inside the work zone', 'Sweep the milled surface and spray the tack coat from the sprayer truck (Our own step)', 'Finish and clean up'];
  for (const step of ['Set up traffic management', 'Run the road plant inside the work zone', 'Sweep the milled surface and spray the tack coat from the sprayer truck (Our own step)']) assert.ok(flagged(moved, step, 'Lay and roll asphalt'), step);
  assert.ok(flagged(['Before starting', 'Remove old roofing', 'Fix new roofing', 'Replace the box gutter', 'Finish and clean up'], 'Replace the box gutter', 'Fix new roofing'));
  assert.ok(flagged(['Before starting', 'Seal the facade joints', 'Handle and install glass panels', 'Finish and clean up'], 'Handle and install glass panels', 'Seal the facade joints'));
});

// ---- 6. Own steps where their work is ----

test('A runs 1 and 4: own steps go where their work is: unloading before the lifts, touch-up after the bracing, the old windows out before the glass', () => {
  const lift = names(draftOf({ ...LIFTS, ownSteps: [{ name: 'Unload steel from the semi-trailer', hazards: ['Struck by the load'], controls: ['Dogman slings from the ground'] }] }, CRANE_CHART));
  assert.ok(before(lift, 'Unload steel from the semi-trailer (Our own step)', 'Rig and lift the load') && before(lift, 'Set up the crane', 'Unload steel from the semi-trailer (Our own step)'), lift.join(' | '));
  const steel = names(draftOf({ ...STEEL, ownSteps: [{ name: 'Touch up paint on installed steel', hazards: ['Paint fumes'], controls: ['Touch-ups from the boom lift'] }] }));
  assert.ok(before(steel, 'Install and remove temporary bracing', 'Touch up paint on installed steel (Our own step)'), steel.join(' | '));
  const glass = names(draftOf({ ...WINDOWS, kinds: ['windowInstall', 'glassHandle', 'glazingSeal', 'louvres'], ownSteps: [{ name: 'take out the old windows n put in the new frames', hazards: ['fall through the open window'], controls: ['work inside the edge protection'] }] }));
  assert.ok(before(glass, 'take out the old windows n put in the new frames (Our own step)', 'Handle and install glass panels'), glass.join(' | '));
});

// ---- 7. Risk ratings ----

test('A run 1 and B run 8: own steps with sound controls, and an engineering control the user adds, are not left High', () => {
  const tack = riskFor({ step: 'Sweep the milled surface and spray the tack coat from the sprayer truck', hazards: ['Burns and fumes from hot bitumen emulsion at the spray bar.', 'A worker on foot is struck by the sweeper or sprayer truck.'], controls: ['Only the sprayer operator is beside the spray bar, and everyone else keeps 5 m clear while it sprays.', 'The sweeper and sprayer work inside the traffic management, with a spotter when reversing.', 'Spray bar hoses and fittings are checked before each shift.'] });
  assert.notEqual(tack.after.level, 'High');
  const touch = riskFor({ step: 'Touch up paint on installed steel', hazards: ['Breathing paint mist and solvent vapour from aerosol primer.', 'A fall from the boom lift basket while reaching to touch up.'], controls: ['Touch-ups are done from the boom lift with the harness clipped on, never by reaching over the basket rail.', 'Aerosols are sprayed with good airflow and away from ignition sources.'] });
  assert.notEqual(touch.after.level, 'High');
  const plain = riskFor({ step: 'Sweep', hazards: ['A worker on foot is struck by the sweeper.'], controls: ['Workers take care.'] });
  assert.equal(plain.after.level, 'High');
  const lay = draftOf({ ...RESURFACE, controlEdits: { 'Lay and roll asphalt': { added: ['The paver and both rollers have reversing cameras and proximity alarms that warn the operator when a person is within 3 m.'] } } });
  assert.notEqual(stepNamed(lay, 'Lay and roll asphalt').risk.after.level, 'High');
});

// ---- 8. SiteWrite's check ----

test('A runs 1 and 4, B run 6: the check names every held step, does not call a stated fallback vague, and asks for the fall inspection the SWMS uses', () => {
  const body = bodyOf(STEEL);
  const held = prepareDraft({ ...body, facts: { ...body.facts, erectionSequence: '' }, designs: [{ id: 'steelErection', status: 'notIssued' }] });
  const w16 = finding(held, 'nsw', 'W16');
  assert.match(w16.message, /Erect and connect steel at height \(Steel erection/);
  assert.match(w16.message, /Install and remove temporary bracing \(Steel erection/);
  assert.equal(isVague('Slings are attached from the ground with a hook pole where possible; where the dogman must go on the tray, the side gates stay up and access is by a gated platform ladder.'), false);
  assert.equal(isVague('Use a hook pole where possible.'), true);
  const edge = finding(draftOf({ ...WATERPROOF, fallRisk: 'yes' }, { fallControl: 'Edge protection is installed around every open edge before work starts, and no one works outside it.' }), 'tas', 'W13');
  assert.doesNotMatch(edge.message, /scaffold tag|EWP pre-start|harness and anchors/);
  const inside = finding(draftOf({ ...WATERPROOF, fallRisk: 'yes' }, { fallControl: 'The work is inside the builder\'s podium balustrade, which is in place and 1 m high. No one leans over it.' }), 'tas', 'W13');
  assert.equal(inside.points, inside.max, inside.message);
});

// ---- 9. Products and substances ----

test('Products go to the step that uses them, the bond breaker is asked, and touch-up paint asks a reason for "Not required"', () => {
  const steps = (list) => asSteps(list);
  assert.equal(rules.stepOf({ type: 'Sealants, mastics and silicone', product: 'Pipe thread sealant' }, steps(['Before starting', 'Install sprinkler pipework', 'Install hydrant pipework', 'Apply sealant and caulking', 'Finish and clean up'])), 'Install sprinkler pipework');
  const paint = steps(['Before starting', 'Use mobile scaffolds', 'Prepare to paint', 'Sand and fill surfaces', 'Paint', 'Clean brushes and rollers', 'Finish and clean up']);
  assert.equal(rules.stepOf({ type: 'Sealants, mastics and silicone', product: 'Acrylic gap filler' }, paint), 'Sand and fill surfaces');
  assert.equal(rules.stepOf({ type: 'Solvents and thinners', product: 'Mineral turps' }, paint), 'Clean brushes and rollers');
  assert.equal(rules.stepOf({ type: 'Sealants, mastics and silicone', product: 'Polyurethane bond breaker' }, steps(['Before starting', 'Move membrane rolls and materials', 'Prepare surfaces by grinding', 'Apply primers and liquid membranes', 'Lay torch-on membranes', 'Finish and clean up'])), 'Apply primers and liquid membranes');
  assert.equal(rules.stepOf({ type: 'Fuels (diesel, petrol)', product: 'Diesel fuel' }, steps(['Before starting', 'Set up traffic management', 'Separate plant and people on site', 'Run the road plant inside the work zone', 'Lay and roll asphalt', 'Finish and clean up'])), 'Run the road plant inside the work zone');
  const { typeItems } = require('../substances');
  const wp = bodyOf(WATERPROOF);
  assert.ok(typeItems(prepareDraft(wp), wp).some((item) => item.type === 'Sealants, mastics and silicone'));
  const roof = draftOf(ROOF);
  assert.match(rules.notUsedNeed('Paints and coatings', '', ROOF.task, rules.stepWords(roof), '', '', roof), /give a short reason/);
  // The pipe thread sealant answer prints in the pipework step, not the caulking step.
  const sds = draftOf({ ...SPRINKLER, kinds: ['ewp', 'fixtures', 'fireAtHeight', 'caulking', 'hoseReels', 'serviceLabels'] }, { safetyDataSheet: 'Pipe thread sealant and cutting oil: SDS in the site box, wear gloves.' });
  assert.ok(stepNamed(sds, 'Install sprinkler pipework').controls.some((line) => /^Pipe thread sealant/.test(line)));
  assert.ok(!stepNamed(sds, 'Apply sealant and caulking').controls.some((line) => /^Pipe thread sealant/.test(line)));
});
