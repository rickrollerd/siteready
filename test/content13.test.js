// Content faults found by the messy-user test, round 12 (local runs 1 to 8, 18 October 2026, on main ef083c1 with the
// fix12 patch): W17 silent on clearly wrong moves; SiteWrite's own order (the roof, the crane, road work, fittings,
// own steps); missing core work; wrong-context steps, plant, licences and high risk work; the erection sequence hold
// point; "Not required" beside the crew's own use; SiteWrite's check; products in the right step, a false "no job
// steps" listing, and hospitals sharing their first two words.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, packageKinds, stepCoveringPart } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');
const { typeItems } = require('../substances');
const { riskFor } = require('../register');
const { readSlang } = require('../slang');
const { stageOf, inStageOrder, firmFaults, firmOrder, FIRM } = require('../step-stages');
const rules = require('../public/substance-rules');
const places = require('../places');

const SITE = { residential: 'no', company: 'Test', workplace: '12 Smith Street, Paddington', principalContractor: 'ABC Builders Pty Ltd', hospital: 'Royal Hospital', firstAider: 'Jo Smith', musterPoint: 'Front gate', worksManager: 'Sam Lee', worksManagerPhone: '0400 118 552', complianceResponsible: 'Sam Lee', reviewer: 'Sam Lee', date: '18 October 2026' };
function answered(input, given = {}) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id]) continue;
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
const before = (list, a, b) => list.indexOf(a) >= 0 && list.indexOf(b) >= 0 && list.indexOf(a) < list.indexOf(b);
const asSteps = (list) => list.map((step) => ({ step, hazards: [], controls: [] }));
const checked = (draft, state) => checkSwms(fromDraft(draft, { state, swms: { signatures: [{ name: 'Jo Smith' }] } }), { state });

// The runs' own words.
const REROOF = { state: 'vic', fallRisk: 'yes', crane: 'own', task: 'reroof the warehouse, strip old corugated iron n replace with new colorbond trimdek sheets n flashings, new box gutter with torch on membrane, roof is about 7m high. scafold round the edge is by the builder. we use our hiab to lift the sheets up', site: { liveServices: 'power to the building', publicInterface: 'none', otherTrades: 'electricians', ground: 'concrete yard', access: 'scaffold stair' } };
const REROOF_GIVEN = { craneChart: 'hiab chart 1.2t at 8m', groundBearing: 'the builders site manager checked the yard slab for the hiab, we use 600mm outrigger pads' };
const CRANE = { state: 'act', fallRisk: 'no', crane: 'own', task: 'Mobile and crawler crane lifting: travel and set up the mobile crane, check the ground and outriggers, plan and rig the lifts, lift, dog and land loads, and pack up. 60t all terrain crane set up on allara st, lifting 6 AC units onto the roof of a 6 storey office. road closed with traffic control by others. our dogman on the roof to land them', site: { liveServices: 'none', publicInterface: 'allara st closed, traffic control by others', otherTrades: 'none', ground: 'road', access: 'road' } };
const CRANE_GIVEN = { craneChart: '4.2 t at 22 m radius from the crane chart, heaviest unit 1.6 t', groundBearing: 'the builders site manager checked the road for our outriggers, we use 1.2m steel mats' };
const ROAD = { state: 'nt', fallRisk: 'no', crane: 'none', task: 'mill n resheet approx 400m of lee point rd, 50mm AC14 asphalt. profiler, paver, steel drum n multi tyre rollers, tippers. tack coat with the sprayer truck. traffic control by our TC crew under the TGS, single lane closure at night under lighting towers. line marking by others after', site: { liveServices: 'street lights, NBN n water pits in the verge, 11kV overhead on the east side, approx 9m up', publicInterface: 'single lane closure, traffic both ways', otherTrades: 'none', ground: 'existing pavement, soft shoulders', access: 'plant floats in to the work zone, crew walks in from the TC compound' } };
const WATERPROOF = { state: 'tas', fallRisk: 'yes', crane: 'none', task: 'waterproof the level 4 podium deck and 12 apartment balconies on levels 2 to 6. grind the slab, vacuum the dust, prime, then 2 coats of liquid polyurethane membrane with fibreglass bandage at the corners and joints. fit puddle flanges at the floor wastes. flood test 24 hours before the tilers start. torch on bitumen sheet membrane to the plant room roof upstand with a gas torch. edge protection is by the builder: their scaffold round the balcony edges and perimeter guardrails on the podium. materials go up in the builders hoist.', site: { liveServices: 'Temporary power leads run along the podium for the grinders and vacuums, from the builder\'s tested distribution boards. Floor waste and stormwater outlets are live drains. No overhead power lines near the building.', publicInterface: 'The plant room roof upstand is above the Liverpool Street footpath. Nothing is stored within 2 m of the edge, and the builder\'s scaffold has catch screens.', otherTrades: 'Tilers follow us after the flood test.', ground: 'Concrete podium and balcony slabs.', access: 'The crew uses the builder\'s stair and passenger hoist to each level.' } };
const PAINT = { state: 'sa', fallRisk: 'yes', crane: 'none', task: 'PROJECT TRADE SPECIFIC EXTENT OF WORKS:\nThe scope of work includes but is not limited to the following principal areas: -\n1. The Subcontractor shall paint all internal plasterboard, villaboard walls and ceilings, in Building 1, 2, 3 and 4 in a 3 coat system (excluding Conference Room Ceiling and Walls and additional coats for feature wall colours).\n2. The Subcontractor shall paint all doors, architraves, skirting, timber window reveals, timber sills and roller door jambs\n3. The Subcontractor has allowed to paint Building 4 external surfaces: Paint all cladding, soffits, fascia linings, external timber doors and steel framing, including roller and sliding door jambs, and PVC downpipes\n8. The Subcontractor is to mask and cut in paintwork around all electrical & plumbing fittings, switchboards, glass inserts to doors etc\n9. The Subcontractor shall provide and maintain washout facility for cleaning of paint equipment to comply with Local Authority and environmental laws\n10. The Subcontractor shall paint to tops and underside of all doors, tops and bottoms of doors to receive 3 coats minimum or as per door manufacturers specifications', site: { liveServices: 'power leads from the builders boards, live GPOs n switches we mask around', publicInterface: 'none', otherTrades: 'sparkies, tilers n the builders carpenters in the same rooms', ground: 'slab', access: 'ladders n scafold' } };
const PAINT_GIVEN = { fallControl: 'mobile scafold with rails for the soffits n fascia on bldg 4, platform ladders inside' };

// The scope packages of the saved readings, as the page sends them (round 12, runs 1 and 3).
const FIRE_TESTING = 'Test fire services in Common Cell Riser Main Frames before delivery to site. Install valving above slab and flush building branch lines. Flow test hydrants, hose reels, sprinklers, deluge and existing fire pumps for fire authority. Start up, test and commission all fire systems and rectify faults. Carry out witness and repeat testing for builder, consultant, Principal and authorities. Lead fire matrix testing for Gatehouse SER gas discharge system. Carry out deluge discharge test and protect own works for the test. Install covers over smoke detectors after commissioning and remove before Practical Completion.';
const FIRE_BUILDINGS = 'Install seismic restraints. Install mounting plates for fixtures on corrugated walls and ceilings. Install ceiling and in-wall noggins for fire services. Install wet pipe sprinkler systems. Install deluge sprinkler systems including in-slab blockouts and precast wall penetrations. Install addressable smoke and thermal detectors, manual call points and protection guards. Install internal fire hydrants and fire hose reels. Install permanent fire extinguishers and fire blankets with brackets, signage and lockable cabinets. Key fire equipment to common keying requirements. Label installed items, pits, pipes and valves. Paint own installation.';
const FIRE_BUILDINGS_KINDS = ['fireAtHeight', 'fixtures', 'carpFraming', 'castInPlumbing', 'fireAlarm', 'hoseReels', 'hardwareFit', 'serviceLabels', 'painting'];
const SCISSORS = 'No harness is used. All work above 2 m is from scissor lifts with guardrails, and no one climbs out of the platform.';

// ---- 1. W17 on clearly wrong moves ----

const MOVES = [
  { what: 'landing above the crane set-up (A run 1)', wrong: ['Land and release the load', 'Set up the crane', 'Rig and lift the load'], right: ['Set up the crane', 'Rig and lift the load', 'Land and release the load'] },
  { what: 'paving above the traffic set-up on a live road (B run 8)', wrong: ['Lay and roll asphalt', 'Set up traffic management', 'Run the road plant inside the work zone'], right: ['Set up traffic management', 'Run the road plant inside the work zone', 'Lay and roll asphalt'] },
  { what: 'the membrane above the strip-out and the box gutter (A run 2)', wrong: ['Lay torch-on membranes', 'Remove old roofing', 'Replace the box gutter'], right: ['Remove old roofing', 'Replace the box gutter', 'Lay torch-on membranes'] },
  { what: 'fire stopping above the core drilling (A run 3)', wrong: ['Seal penetrations and fire stop', 'Core drill through the slab or wall'], right: ['Core drill through the slab or wall', 'Seal penetrations and fire stop'] },
  { what: 'a lift to the roof before the roof fall protection (A run 2)', wrong: ['Lift equipment and materials to the roof', 'Get onto the roof', 'Set up roof fall protection'], right: ['Get onto the roof', 'Set up roof fall protection', 'Lift equipment and materials to the roof'] },
  { what: 'the heavy lift before its plan', wrong: ['Carry out the heavy lift', 'Plan the heavy lift'], right: ['Plan the heavy lift', 'Carry out the heavy lift'] },
  { what: 'the pour before the pump is set up', wrong: ['Pump and place concrete', 'Set up the concrete pump and placing boom'], right: ['Set up the concrete pump and placing boom', 'Pump and place concrete'] },
];

test('W17 flags each clearly wrong move of round 12, and SiteWrite sorts it back', () => {
  for (const item of MOVES) {
    assert.ok(firmFaults(asSteps(item.wrong)).length > 0, `${item.what}: not flagged`);
    assert.deepEqual(firmFaults(asSteps(item.right)), [], `${item.what}: right order flagged`);
    assert.deepEqual(inStageOrder(asSteps(item.wrong)).map((step) => step.step), item.right, item.what);
  }
  // The builder check gives W17 for them on a draft.
  const draft = draftOf(REROOF, REROOF_GIVEN);
  const moved = { ...draft, jobSteps: [...draft.jobSteps] };
  const at = (name) => moved.jobSteps.findIndex((step) => step.step === name);
  const [membrane] = moved.jobSteps.splice(at('Lay torch-on membranes'), 1);
  moved.jobSteps.splice(at('Remove old roofing'), 0, membrane);
  assert.ok(checked(moved, 'vic').findings.some((item) => item.rule === 'W17'));
  assert.ok(!checked(draft, 'vic').findings.some((item) => item.rule === 'W17'));
});

test('the firm orders agree with the stage map where both steps have a stage, and SiteWrite\'s own order keeps every one', () => {
  const against = [];
  for (const chain of FIRM) {
    for (let g = 0; g < chain.length; g += 1) {
      for (let h = g + 1; h < chain.length; h += 1) {
        for (const a of chain[g]) for (const b of chain[h]) if (typeof stageOf(a) === 'number' && typeof stageOf(b) === 'number' && !(stageOf(a) < stageOf(b))) against.push(`${a} / ${b}`);
      }
    }
  }
  assert.deepEqual(against, []);
  // A step with no stage of its own is put back in a firm order wherever it was written.
  assert.deepEqual(firmOrder(asSteps(['Rig and lift the load', 'Lift equipment and materials to the roof', 'Set up the crane'])).map((step) => step.step), ['Set up the crane', 'Rig and lift the load', 'Lift equipment and materials to the roof']);
});

// ---- 2. SiteWrite's own order ----

test('A run 2: the roof access and fall protection come before anything is lifted to the roof, and the sheets are fixed', () => {
  const draft = draftOf(REROOF, REROOF_GIVEN);
  const list = names(draft);
  assert.ok(list.includes('Fix new roofing'), list.join(' | '));
  assert.ok(before(list, 'Set up roof access', 'Lift materials to and from the roof'), list.join(' | '));
  assert.ok(before(list, 'Install roof edge protection', 'Lift materials to and from the roof'), list.join(' | '));
  assert.ok(before(list, 'Remove old roofing', 'Fix new roofing'), list.join(' | '));
  assert.ok(before(list, 'Replace the box gutter', 'Lay torch-on membranes'), list.join(' | '));
  assert.deepEqual(firmFaults(draft.jobSteps), []);
});

test('B run 7: the crane is set up before any lift, and the dogman\'s roof access and fall protection before the loads land on the roof', () => {
  const draft = draftOf(CRANE, CRANE_GIVEN);
  const list = names(draft);
  for (const lift of ['Lift equipment and materials to the roof', 'Rig and lift the load', 'Land and release the load']) assert.ok(before(list, 'Set up the crane', lift), `${lift}: ${list.join(' | ')}`);
  assert.ok(before(list, 'Get onto the roof', 'Lift equipment and materials to the roof'), list.join(' | '));
  assert.ok(before(list, 'Set up roof fall protection', 'Lift equipment and materials to the roof'), list.join(' | '));
  assert.deepEqual(firmFaults(draft.jobSteps), []);
});

test('B run 8: the road plant step comes before the paving, after the traffic set-up', () => {
  const list = names(draftOf(ROAD));
  assert.ok(before(list, 'Set up traffic management', 'Run the road plant inside the work zone'), list.join(' | '));
  assert.ok(before(list, 'Run the road plant inside the work zone', 'Lay and roll asphalt'), list.join(' | '));
});

test('A run 3: mounting plates and fittings go up before the pipework hung from them, not after the painting', () => {
  const draft = draftOf({ state: 'qld', fallRisk: 'yes', crane: 'none', task: FIRE_BUILDINGS, kinds: packageKinds(FIRE_BUILDINGS, FIRE_BUILDINGS_KINDS), site: { liveServices: 'none', publicInterface: 'none', otherTrades: 'none', ground: 'slab', access: 'gate' } }, { fallControl: SCISSORS });
  const list = names(draft);
  assert.ok(before(list, 'Fix rails, fittings and equipment to walls and floors', 'Install sprinkler pipework'), list.join(' | '));
  assert.ok(before(list, 'Fix rails, fittings and equipment to walls and floors', 'Paint'), list.join(' | '));
});

test('own steps for listed work go where that work belongs by stage: puddle flanges before the membrane, milling and the tack coat before the paving', () => {
  const own = (name, part) => ({ name, part, hazards: ['Cuts and burns.'], controls: ['Wear cut resistant gloves.'] });
  const wet = names(draftOf({ ...WATERPROOF, ownSteps: [own('Fit puddle flanges at the floor wastes', 'fit puddle flanges at the floor wastes')] }));
  const flange = 'Fit puddle flanges at the floor wastes (Our own step)';
  assert.ok(before(wet, flange, 'Apply primers and liquid membranes'), wet.join(' | '));
  assert.ok(before(wet, 'Prepare surfaces by grinding', flange), wet.join(' | '));
  assert.ok(before(wet, flange, 'Check and drain the flood test'), wet.join(' | '));
  const road = names(draftOf({ ...ROAD, ownSteps: [own('Spray tack coat with the sprayer truck', 'tack coat with the sprayer truck'), own('Mill the old asphalt with the profiler')] }));
  const mill = 'Mill the old asphalt with the profiler (Our own step)';
  const tack = 'Spray tack coat with the sprayer truck (Our own step)';
  assert.ok(before(road, mill, tack) && before(road, tack, 'Lay and roll asphalt'), road.join(' | '));
  assert.ok(before(road, 'Set up traffic management', mill), road.join(' | '));
});

// ---- 3. Missing core work ----

test('A run 2: a reroof with a box gutter membrane fixes the new roof sheets and flashings', () => {
  const draft = draftOf(REROOF, REROOF_GIVEN);
  assert.ok(names(draft).includes('Fix new roofing'));
  assert.deepEqual(draft.notCovered, []);
  // With the roofing step taken off, the new sheets are listed as work with no job steps.
  const off = draftOf({ ...REROOF, kinds: ['roofAccess', 'roofStrip', 'boxGutter', 'loaderCrane', 'wpTorch', 'wpEdge', 'wpRolls'] }, REROOF_GIVEN);
  assert.ok(off.notCovered.some((part) => /new colorbond trimdek sheets/.test(part)), JSON.stringify(off.notCovered));
  // A membrane on a plant room upstand is still waterproofing, not roofing (B run 6).
  assert.ok(!names(draftOf(WATERPROOF)).includes('Fix new roofing'));
});

test('B run 8: milling is listed as work with no job steps, and the 11 kV line in Live services brings the power line step', () => {
  const draft = draftOf(ROAD);
  assert.ok(draft.notCovered.some((part) => /\bmill\b/i.test(part)), JSON.stringify(draft.notCovered));
  assert.ok(names(draft).includes('Plan the work near overhead power lines'), names(draft).join(' | '));
  assert.ok(draft.highRisk.some((item) => /energised electrical/i.test(item)));
  // A mill finish on aluminium is not milling a road.
  const glazing = draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', task: 'Install mill finish aluminium window frames to level 1.', site: { liveServices: 'none', publicInterface: 'none', otherTrades: 'none', ground: 'slab', access: 'stairs' } });
  assert.ok(!(glazing.notCovered || []).some((part) => /\bmill\b/i.test(part)));
});

// ---- 4. Wrong-context steps, plant, licences and high risk work ----

test('A run 3: a gas suppression (gas discharge) system is not gas mains: no gas high risk work, gas fitter line or gas meter row', () => {
  const draft = draftOf({ state: 'qld', fallRisk: 'yes', crane: 'none', task: FIRE_TESTING, kinds: packageKinds(FIRE_TESTING, ['pressureTest', 'fireAtHeight', 'fireLive', 'fireAlarm']), site: { liveServices: 'none', publicInterface: 'none', otherTrades: 'none', ground: 'slab', access: 'gate' } }, { fallControl: SCISSORS });
  assert.ok(!draft.highRisk.some((item) => /gas/i.test(item)), draft.highRisk.join(' | '));
  assert.ok(!/licensed gas fitter/i.test(lines(draft)));
  assert.ok(!draft.emergency.some((row) => /gas leak/i.test(row.type)));
});

test('A run 3: Testing and commissioning gets no installation steps; a sprinkler package\'s noggins and keying bring no framing or door hardware', () => {
  const testing = packageKinds(FIRE_TESTING, ['pressureTest', 'fireAtHeight', 'fireLive', 'fireAlarm']);
  assert.ok(!testing.includes('fireAtHeight') && !testing.includes('fireAlarm'), testing.join(', '));
  assert.ok(testing.includes('pressureTest') && testing.includes('fireLive'));
  const building = packageKinds(FIRE_BUILDINGS, FIRE_BUILDINGS_KINDS);
  assert.ok(!building.includes('carpFraming') && !building.includes('hardwareFit'), building.join(', '));
  assert.ok(building.includes('fireAtHeight') && building.includes('fireAlarm'));
  // Real door hardware and stud walls keep theirs.
  assert.ok(packageKinds('Install door hardware after painting. Hang timber doors.', ['doorHang', 'hardwareFit']).includes('hardwareFit'));
  assert.ok(packageKinds('Install noggins and construct stud walls to the plant room.', ['carpFraming', 'plasterSheets']).includes('carpFraming'));
});

test('B run 5: a painter gets no glazing or window cleaning steps from "glass inserts to doors" and "window reveals"', () => {
  const list = names(draftOf(PAINT, PAINT_GIVEN));
  for (const name of ['Handle glass in the wind', 'Clean windows and balconies', 'Handle and install glass panels']) assert.ok(!list.includes(name), list.join(' | '));
  assert.ok(list.includes('Paint'));
});

test('B run 7: a crane hire lifting units gets no plant receiving or fixing steps, no heavy lift for 1.6 t, and no silica', () => {
  const draft = draftOf(CRANE, CRANE_GIVEN);
  const list = names(draft);
  for (const name of ['Receive plant and move it into position', 'Fix plant on its supports', 'Plan the heavy lift', 'Carry out the heavy lift']) assert.ok(!list.includes(name), list.join(' | '));
  assert.ok(!draft.highRisk.some((item) => /silica/i.test(item)));
  assert.ok(list.includes('Rig and lift the load'));
  // A crawler crane named outright keeps its heavy lift.
  assert.ok(names(draftOf({ ...CRANE, task: 'Assemble and use our 250t crawler crane to lift the bridge beams.' }, CRANE_GIVEN)).includes('Carry out the heavy lift'));
});

test('B run 8: on a road, "TC" is traffic control: no tower crane, no crane step, no crane operator or crane lines with No crane, and no electrical licence for lighting towers', () => {
  assert.equal(readSlang('traffic control by our TC crew under the TGS'), 'traffic control by our traffic control crew under the TGS');
  assert.equal(readSlang('the TC lifts the reo to level 3'), 'the tower crane lifts the reo to level 3');
  const draft = draftOf(ROAD);
  assert.ok(!names(draft).includes('Work with the crane crew during lifts'), names(draft).join(' | '));
  assert.ok(!(draft.plantInferred || []).some((item) => /crane/i.test(item.item)));
  assert.equal(draft.craneOperator, '');
  assert.ok(!/crane company/i.test([lines(draft), ...(draft.controls || []).map((item) => item.text || item)].join('\n')));
  assert.ok(!draft.qualifications.some((name) => /electrical/i.test(name)), draft.qualifications.join(' | '));
  // A crane company named only as another's work, with No crane ticked, names no crane operator.
  const others = draftOf({ ...ROAD, task: `${ROAD.task}. no crane on this job, the sign gantry crane is by others` });
  assert.equal(others.craneOperator, '');
  assert.ok(!(others.plantInferred || []).some((item) => /crane/i.test(item.item)));
});

test('B run 6: the builder\'s hoist and a footpath named as a place bring no powered mobile plant', () => {
  const draft = draftOf(WATERPROOF);
  assert.ok(!draft.highRisk.some((item) => /mobile plant/i.test(item)), draft.highRisk.join(' | '));
  // SiteWrite's check does not ask the crew for a licence to run the builder's hoist.
  const w5 = checked(draft, 'tas').findings.find((item) => item.rule === 'W5');
  assert.ok(!w5 || !/builders hoist/.test(w5.message || ''), w5 && w5.message);
  // A footpath poured is still plant work: concrete trucks come in.
  const path = draftOf({ state: 'tas', fallRisk: 'no', crane: 'none', task: 'Form and pour the new concrete footpath.', site: { liveServices: 'none', publicInterface: 'none', otherTrades: 'none', ground: 'firm', access: 'gate' } });
  assert.ok(path.highRisk.some((item) => /mobile plant/i.test(item)));
});

test('A run 2: the crew\'s own hiab names no crane company\'s lift plan', () => {
  const draft = draftOf({ ...REROOF, task: 'install solar hot water on the warehouse roof, about 7m high. scafold round the edge is by the builder. we use our hiab to lift the sheets up' }, REROOF_GIVEN);
  assert.ok(!/crane company/i.test(lines(draft)), lines(draft).split('\n').filter((line) => /crane company/i.test(line)).join(' | '));
  assert.ok(before(names(draft), 'Set up roof fall protection', 'Lift equipment and materials to the roof'));
});

test('A run 1: cranage with our crane lifting steel rigs, lifts and lands once, with the steel lines kept', () => {
  const task = 'Crane lift structural steel for Buildings 1, 2 and 3. Off-load and handle materials on site including slinging loads.';
  const draft = draftOf({ state: 'nsw', fallRisk: 'no', crane: 'own', task, kinds: ['steelLift', 'crane'], site: { liveServices: 'none', publicInterface: 'none', otherTrades: 'none', ground: 'slab', access: 'gate' } }, { craneChart: '20 t at 15 m radius', groundBearing: 'the builders site manager confirmed the slab, 1.2 m mats' });
  const list = names(draft);
  assert.ok(!list.some((name) => /^Lift and land steel/.test(name)), list.join(' | '));
  assert.ok(list.includes('Rig and lift the load') && list.includes('Land and release the load'));
  assert.ok(/Members are not rigged one below another on the same hook/.test(lines(draft)));
});

// ---- 5. The erection sequence hold point ----

test('A run 1: "Not issued yet" holds "Erect and connect steel at height" as well as the bracing step', () => {
  const task = 'Erect structural steel roof frame. Install operable wall portal frames. Install temporary bracing, shims and packers.';
  const draft = draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'company', task, kinds: ['steelErect', 'ewp'], designs: [{ id: 'steelErection', status: 'notIssued' }], site: { liveServices: 'none', publicInterface: 'none', otherTrades: 'none', ground: 'slab', access: 'gate' } }, { fallControl: 'Connections are made from boom lifts with guardrails. No one climbs the steel.' });
  const held = draft.jobSteps.filter((step) => step.controls.some((line) => /^Hold point:/.test(line))).map((step) => step.step);
  assert.ok(held.includes('Erect and connect steel at height'), held.join(' | '));
  assert.ok(held.includes('Install and remove temporary bracing'), held.join(' | '));
  const row = draft.designs.find((item) => item.id === 'steelErection');
  assert.deepEqual(row.steps, ['Erect and connect steel at height', 'Install and remove temporary bracing']);
});

// ---- 6. "Not required" ----

test('A run 2: bitumen "Not required" is refused beside the crew\'s own torch-on membrane, and the SBS sheet listed once covers both types', () => {
  const body = { ...bodyOf(REROOF, REROOF_GIVEN), substancesNotUsed: ['Bitumen and asphalt'], substancesNotUsedWhy: { 'Bitumen and asphalt': 'no hot bitumen, membrane only' } };
  const draft = prepareDraft(body);
  const bitumen = typeItems(draft, body).find((item) => item.type === 'Bitumen and asphalt');
  assert.match(bitumen.need, /Lay torch-on membranes/);
  const listed = { ...bodyOf(REROOF, REROOF_GIVEN), substances: [{ id: 'sub-1', type: 'Waterproofing membranes and primers', product: 'SBS modified bitumen torch-on membrane', sdsDate: '2025-01-15', controls: ['Heat resistant gloves and safety glasses when torching.'], confirmed: true }] };
  const types = typeItems(prepareDraft(listed), listed);
  assert.equal(types.find((item) => item.type === 'Bitumen and asphalt').need, '');
  assert.equal(types.find((item) => item.type === 'Waterproofing membranes and primers').need, '');
});

test('B run 7: fuel stays asked beside our own diesel crane in the plant list', () => {
  // As the run left it: the plant steps (with their forklift) taken off, the crane steps kept.
  const body = bodyOf({ ...CRANE, kinds: ['road', 'roofAccess', 'crane'] }, CRANE_GIVEN);
  const draft = prepareDraft(body);
  assert.ok(draft.substances.items.some((item) => /^Fuels/.test(item.product)), JSON.stringify(draft.substances.items));
  const ticked = { ...body, substancesNotUsed: ['Fuels (diesel, petrol)'] };
  assert.match(typeItems(prepareDraft(ticked), ticked).find((item) => /^Fuels/.test(item.type)).need, /diesel or petrol/);
  // A crane company's crane is not the crew's fuel.
  const company = prepareDraft(bodyOf({ state: 'act', fallRisk: 'no', crane: 'company', task: 'Sling and land the steel beams on level 2 with the crane company\'s 60t mobile crane.', site: { liveServices: 'none', publicInterface: 'none', otherTrades: 'none', ground: 'slab', access: 'gate' } }));
  assert.ok(company.plant.some((item) => /^Mobile crane/.test(item.item)));
  assert.ok(!company.substances.items.some((item) => /^Fuels/.test(item.product)));
});

test('A run 3: silica "Not required" gets the same answer on the project page and in the SWMS', () => {
  const input = { state: 'qld', fallRisk: 'yes', crane: 'none', task: FIRE_BUILDINGS, kinds: packageKinds(FIRE_BUILDINGS, FIRE_BUILDINGS_KINDS), site: { liveServices: 'none', publicInterface: 'none', otherTrades: 'none', ground: 'slab', access: 'gate' } };
  const body = bodyOf(input, { fallControl: SCISSORS });
  const draft = prepareDraft(body);
  const why = 'no concrete is cut or drilled by our crew';
  // The project page, from what the server says of the draft before Prepare all (server.js designsAsked).
  const page = rules.notUsedNeed(rules.SILICA, why, rules.ownWords(body), '', '', rules.silicaStep(draft), null, rules.stepUses(draft)[rules.SILICA] || null);
  const ticked = { ...body, substancesNotUsed: [rules.SILICA], substancesNotUsedWhy: { [rules.SILICA]: why } };
  const item = typeItems(prepareDraft(ticked), ticked).find((row) => row.type === rules.SILICA);
  assert.equal(Boolean(page), Boolean(item && item.need), `page: ${page} | SWMS: ${item && item.need}`);
});

// ---- 7. SiteWrite's check ----

test('B run 5: no harness anchors from tool lanyards, no power line observer from the ladder\'s live parts hazard, and "water based" settles brush cleaning', () => {
  const body = { ...bodyOf(PAINT, PAINT_GIVEN), substancesNotUsed: ['Solvents and thinners'], substancesNotUsedWhy: { 'Solvents and thinners': 'water based paints only, brushes washed in water' } };
  const draft = prepareDraft(body);
  const result = checked(draft, 'sa');
  const w13 = result.findings.find((item) => item.rule === 'W13');
  assert.ok(!w13 || !/anchor point|safety observer/.test(w13.message || ''), w13 && w13.message);
  const w14 = result.findings.find((item) => item.rule === 'W14');
  assert.ok(!w14 || !/Clean brushes and rollers/.test(w14.message || ''), w14 && w14.message);
  // "By others" does not settle the crew's own brush cleaning.
  const others = { ...body, substancesNotUsedWhy: { 'Solvents and thinners': 'supplied and applied by others' } };
  assert.match(checked(prepareDraft(others), 'sa').findings.find((item) => item.rule === 'W14').message, /Clean brushes and rollers/);
});

test('A run 1: trestles named in the package tick the library\'s trestle step, and an own trestle step under 2 m is not left High', () => {
  const words = 'Provide, install, maintain and remove access equipment. Erect and use mobile scaffolds. Use A-frames or trestles as working platforms.';
  assert.ok(packageKinds(words, ['mobileScaffold', 'ladderUse']).includes('trestleUse'));
  const draft = draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'none', task: words, kinds: packageKinds(words, ['mobileScaffold', 'ladderUse']), unmatched: ['Use trestles as working platforms'], site: { liveServices: 'none', publicInterface: 'none', otherTrades: 'none', ground: 'slab', access: 'gate' } }, { fallControl: 'Mobile scaffolds with guardrails for work above 2 m.' });
  assert.ok(names(draft).includes('Work from trestle platforms'), names(draft).join(' | '));
  assert.ok(!(draft.notCovered || []).some((part) => /trestle/i.test(part)), JSON.stringify(draft.notCovered));
  // Coordinator, from flow13: the access steps cover "Provide, install, maintain and remove access equipment".
  assert.ok(!(draft.notCovered || []).some((part) => /access equipment/i.test(part)), JSON.stringify(draft.notCovered));
  const unmatched = draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'none', task: words, kinds: ['mobileScaffold', 'ladderUse', 'ewp'], unmatched: ['Provide, install, maintain and remove access equipment (type not stated)'], site: { liveServices: 'none', publicInterface: 'none', otherTrades: 'none', ground: 'slab', access: 'gate' } }, { fallControl: 'Mobile scaffolds with guardrails for work above 2 m.' });
  assert.ok(!(unmatched.notCovered || []).some((part) => /access equipment/i.test(part)), JSON.stringify(unmatched.notCovered));
  const own = { step: 'Use trestles as working platforms (Our own step)', own: true, hazards: ['Trestle tips or collapses under load', 'Worker falls off the plank'], controls: ['Trestles set on level firm slab and checked before use', 'Planks lapped, clipped and kept within the trestle rated load', 'Platform under 2 m, no work off the plank ends'] };
  assert.notEqual(riskFor(own).after.level, 'High');
  // Over 2 m it stays as it was.
  assert.equal(riskFor({ ...own, controls: [...own.controls.slice(0, 2), 'Platform at 3 m, more than 2 m up'] }).after.level, 'High');
});

// ---- 8. Products, a false listing, hospitals ----

test('B runs 6 and 8: the membrane, primer and torch-on sheet go to the steps that use them, and the tack coat to the own tack coat step', () => {
  const wet = prepareDraft(bodyOf(WATERPROOF)).jobSteps;
  assert.equal(rules.stepOf({ type: 'Waterproofing membranes and primers', product: 'Liquid polyurethane membrane' }, wet), 'Apply primers and liquid membranes');
  assert.equal(rules.stepOf({ type: 'Waterproofing membranes and primers', product: 'Solvent based membrane primer' }, wet), 'Apply primers and liquid membranes');
  assert.equal(rules.stepOf({ type: 'Bitumen and asphalt', product: 'SBS bitumen torch-on sheet membrane' }, wet), 'Lay torch-on membranes');
  const own = { name: 'Spray tack coat with the sprayer truck', part: 'tack coat with the sprayer truck', hazards: ['Burns from hot emulsion.'], controls: ['Sprayer works inside the closed lane only.'] };
  const road = prepareDraft(bodyOf({ ...ROAD, ownSteps: [own] })).jobSteps;
  assert.equal(rules.stepOf({ type: 'Bitumen and asphalt', product: 'Bitumen tack coat emulsion' }, road), 'Spray tack coat with the sprayer truck (Our own step)');
  assert.equal(rules.stepOf({ type: 'Bitumen and asphalt', product: 'AC14 asphalt' }, road), 'Lay and roll asphalt');
});

test('B run 7: units only lifted by the crane are covered by its lifting steps, so the work is not listed or stood down', () => {
  const draft = draftOf(CRANE, CRANE_GIVEN);
  assert.equal(draft.kind, 'draft');
  assert.ok(!(draft.notCovered || []).some((part) => /air conditioning|AC units/i.test(part)), JSON.stringify(draft.notCovered));
  // Installing them still needs the plant steps.
  const install = draftOf({ ...CRANE, crane: 'company', task: 'Install 6 AC units on the roof of a 6 storey office, lifted by the crane company.' });
  assert.ok(names(install).some((name) => /^Install (?:plant|split system)/.test(name)), names(install).join(' | '));
});

test('A runs 1 and 3: hospitals sharing their first two words are both offered; a hospital and its emergency listing show once', async () => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  const at = (latitude, longitude) => ({ latitude, longitude });
  const place = (id, text, location, address) => ({ id, displayName: { text }, formattedAddress: address, location, primaryType: 'hospital' });
  const reply = (body) => ({ ok: true, json: async () => body });
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith(':searchText') && body.pageSize === 1) return reply({ places: [{ location: at(-31.43, 152.91), formattedAddress: '120 Ocean Drive, Port Macquarie NSW 2444, Australia' }] });
    return reply({ places: [
      place('b', 'Port Macquarie Base Hospital', at(-31.452, 152.890), 'Wrights Rd, Port Macquarie NSW 2444, Australia'),
      place('p', 'Port Macquarie Private Hospital', at(-31.440, 152.905), 'Lake Rd, Port Macquarie NSW 2444, Australia'),
      place('e', 'Port Macquarie Base Hospital Emergency Department', at(-31.452, 152.890), 'Wrights Rd, Port Macquarie NSW 2444, Australia'),
    ] });
  };
  const result = await places.nearbyCare('120 Ocean Drive, Port Macquarie NSW 2444', { fetchImpl });
  const list = result.hospitals.map((item) => item.name);
  assert.ok(list.includes('Port Macquarie Private Hospital'), list.join(' | '));
  assert.equal(list.filter((name) => /Port Macquarie Base Hospital/.test(name)).length, 1, list.join(' | '));
  delete process.env.GOOGLE_PLACES_API_KEY;
});
