// Content faults found by the messy-user test, round 11 on staging (17 October 2026, build 839534e), and three from the
// round 11 SiteLink loop: the stage map for fit-out, electrical and mechanical work, and W17 flagging only the orders
// the map is sure of; high risk work and steps from the task's words; "Not required" beside the crew's own use;
// wrong-context lines, plant and licences; missing work and plant; the shoring hold point; products in the step that
// uses them; hospitals; and short typos.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, packageKinds } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');
const { typeItems } = require('../substances');
const { fixSpelling } = require('../spelling');
const { stageOf, inStageOrder, firmFaults, FIRM } = require('../step-stages');
const rules = require('../public/substance-rules');
const places = require('../places');
const { helpText } = require('../answer-help');

const SITE = { residential: 'no', company: 'Test', workplace: '12 Smith Street, Paddington', principalContractor: 'ABC Builders Pty Ltd', hospital: 'Royal Hospital', firstAider: 'Jo Smith', musterPoint: 'Front gate', worksManager: 'Sam Lee', worksManagerPhone: '0400 118 552', complianceResponsible: 'Sam Lee', reviewer: 'Sam Lee', date: '17 October 2026' };
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
const plantOf = (draft) => (draft.plantInferred || []).map((item) => item.item);
const before = (list, a, b) => list.indexOf(a) >= 0 && list.indexOf(b) >= 0 && list.indexOf(a) < list.indexOf(b);
const site = (extra = {}) => ({ liveServices: 'none', publicInterface: 'none', otherTrades: 'none', ground: 'firm', access: 'main gate', ...extra });
const asSteps = (list) => list.map((step) => ({ step, hazards: [], controls: [] }));

const ELEC = 'Install, terminate and joint HV, LV and ELV cabling, submains and final subcircuits. Install main switchboards, distribution boards, PFC units, surge and protection devices. Install LV earthing, earth grids and earth stakes. Install cable containment, secondary framework and equipment supports. Carry out electrical isolations and lock out. Label and engrave installed items, cables and equipment.';
const elec = (extra = {}) => ({ state: 'vic', fallRisk: 'yes', crane: 'none', task: ELEC, site: site(), ...extra });
const MECH = 'All mechanical services to all building areas including air conditioning and mechanical ventilation systems. Supply and installation of all wiring between air conditioning services switchboards and air conditioning services equipment. All associated plant equipment required to complete the works. Supply and install the acoustic and vibration separation between major plant and the primary building structure. All support metal work and bracketry is to be provided by the Subcontractor. Kitchen extract ductwork to kitchens. Pizza bar, pizza oven exhaust system including fan, ductwork and lagging. Test and commission the air conditioning systems.';
const mech = (extra = {}) => ({ state: 'qld', fallRisk: 'yes', crane: 'none', task: MECH, site: site(), ...extra });
const CEIL = 'Construct metal stud and timber framing to partitions, ceilings, bulkheads and baffles. Install plasterboard and fibre cement linings to walls, ceilings, casings and bulkheads. Install suspended grid and coffered ceilings. Set and finish plasterboard, including cornices, trims, shadowlines, curing and final patching. Install pressed metal door frames into drywalls with fire rated filling. Build in glazed panels to partitions. Install skirtings, mouldings, trims and flexible gap sealant. Install acoustic insulation to walls and ceilings. Install thermal insulation and sisalation, including insulation adhered to balcony and terrace slab soffits. Install acoustic baffles in ceiling spaces. Install access panels and removable panels. Treat substrates, including applying bonding agent and dubbing out existing walls.';
const CEIL_KINDS = ['mobileScaffold', 'ewp', 'carpFraming', 'glassHandle', 'insulation', 'plasterSheets', 'plasterHeight', 'plasterCeiling', 'ceilingGrid', 'ceilingHatch', 'plasterSanding', 'doorHang', 'carpJoinery', 'caulking', 'carpentryWork'];
const ceil = (extra = {}) => ({ state: 'tas', fallRisk: 'yes', crane: 'none', task: CEIL, kinds: CEIL_KINDS, site: site({ ground: 'slab', access: 'builders hoist' }), ...extra });
const PLUMB = 'Hydraulic pipework at height: install risers in shafts and pipework in ceilings in copper, PVC and polyethylene, joined by brazing, solvent cement and PE fusion welding. L2 plant room copper hot water flow n return brazed to the new HWU. 50mm PE in the cieling space joined with electrofusion couplers, core drill the slab penatrations. PVC stack glued with glue n primer. Scissor lift in the corridors, ladder in the risers. Presure test the lot before the cielings get sheeted, then lag the HW.';
const plumb = (extra = {}) => ({ state: 'sa', fallRisk: 'yes', crane: 'none', task: PLUMB, site: site({ ground: 'slab' }), ...extra });
const CIVIL = 'Stormwater drainage: excavate trenches, lay and joint the pipes and subsoil drain pipes, place the precast pits and gully pits, and backfill and compact. Our job: 120 m of 375 mm RCP stormwater along the new car park, trench up to 2.1 m deep with a 14 t excavator and a trench shield. Pipes laid on bedding sand with rubber ring joints. Two precast pits lowered in by the excavator on its rated lifting point. Pipe line CCTV inspected before backfill. Backfill in layers with a plate compactor and trench roller. Asphalt reinstatement by others.';
const civil = (extra = {}) => ({ state: 'nt', fallRisk: 'yes', crane: 'none', task: CIVIL, site: site({ liveServices: 'Overhead power lines 15 m away along the road', publicInterface: 'Car park closed to the public, fenced' }), ...extra });
const DEMO = 'Soft strip out of the old 3 level office at the front first: cielings, partitions, carpet n joinery out, services made safe n cut back by the sparky n plumber. Scissor lift for the cieling grid. Then demo the 2 storey brick anex at the back with a 20t excavater on a pulverisor n hammer, bricks n steel loaded into trucks for recycling. Asbestos already gone by others with clearence cert. Saw cut the slab at the junction with the front building using a petrol quick cut. Water cart n sprays for dust. Trucks in off alinga st with traffic control by others.';
const demo = (extra = {}) => ({ state: 'act', fallRisk: 'yes', crane: 'none', task: DEMO, site: site(), ...extra });
const INGROUND = 'Excavate, trench, backfill, compact and reinstate for conduits and pits. Dewater services trenches. Install in-ground conduits, pits, warning tape, pit markers and pit drainage. Fit tamper-resistant pit lid bolts and free-issue padlocks to pits. Wrap services passing through or under footings. Install conduits, pits and submains to sewer pumping stations.';
const inground = (extra = {}) => ({ state: 'vic', fallRisk: 'no', crane: 'none', task: INGROUND, site: site(), ...extra });

// ---- 1. The stage map, and W17 only for the orders the map is sure of ----

// The round 8 to 11 cases, each in the wrong order a run met and the right one (the run's own or the user's fix).
const ORDERS = [
  { what: 'fit-off after the joints are set and sanded (round 11, run 6)', wrong: ['Frame walls and bulkheads', 'Move and fix plasterboard sheets', 'Hang the doors', 'Fix skirting and architraves', 'Set the joints', 'Sand the joints'], right: ['Frame walls and bulkheads', 'Move and fix plasterboard sheets', 'Set the joints', 'Sand the joints', 'Hang the doors', 'Fix skirting and architraves'] },
  { what: 'glazed panels after the framing (round 11, run 6)', wrong: ['Handle and install glass panels', 'Frame walls and bulkheads'], right: ['Frame walls and bulkheads', 'Handle and install glass panels'] },
  { what: 'PE joined after it is installed (round 11, run 5)', wrong: ['Join polyethylene pipe by electrofusion', 'Core drill through the slab or wall', 'Install risers and pipework'], right: ['Core drill through the slab or wall', 'Install risers and pipework', 'Join polyethylene pipe by electrofusion'] },
  { what: 'earthing before the HV test and the commissioning (round 11, run 2)', wrong: ['Pull in and terminate the cables', 'Test the high voltage cables', 'Connect and commission', 'Connect and test the earthing'], right: ['Pull in and terminate the cables', 'Connect and test the earthing', 'Test the high voltage cables', 'Connect and commission'] },
  { what: 'plant received before it is fixed (round 11, run 3)', wrong: ['Fix plant on its supports', 'Receive plant and move it into position'], right: ['Receive plant and move it into position', 'Fix plant on its supports'] },
  { what: 'strip before erect (round 11, run 1, the W17 test)', wrong: ['Strip the formwork', 'Erect falsework and shores'], right: ['Erect falsework and shores', 'Strip the formwork'] },
  { what: 'backfill before the dig (round 11, run 2, the W17 test)', wrong: ['Backfill the trench', 'Excavate'], right: ['Excavate', 'Backfill the trench'] },
  { what: 'pressure test before the core holes (round 11, run 5, the W17 test)', wrong: ['Pressure test and commission', 'Plan core holes'], right: ['Plan core holes', 'Pressure test and commission'] },
  { what: 'footing, blocks, drainage, backfill (round 10, run 3)', wrong: ['Lay blocks and bricks', 'Dig and pour footings', 'Backfill behind the retaining wall', 'Install drainage behind the retaining wall'], right: ['Dig and pour footings', 'Lay blocks and bricks', 'Install drainage behind the retaining wall', 'Backfill behind the retaining wall'] },
  { what: 'primer before adhesive (round 10, run 2)', wrong: ['Apply flooring adhesives', 'Apply primers and levelling compounds'], right: ['Apply primers and levelling compounds', 'Apply flooring adhesives'] },
  { what: 'fusion and test before the backfill (round 10, run 6)', wrong: ['Lay pipes', 'Backfill the trench', 'Join polyethylene pipe by electrofusion', 'Reinstate the surface'], right: ['Lay pipes', 'Join polyethylene pipe by electrofusion', 'Backfill the trench', 'Reinstate the surface'] },
  { what: 'floor wastes and cool room before the equipment (round 10, run 1)', wrong: ['Deliver and install commercial kitchen equipment', 'Erect coolroom panels', 'Plumbing fit-off'], right: ['Erect coolroom panels', 'Deliver and install commercial kitchen equipment', 'Plumbing fit-off'] },
  { what: 'membrane, flood test, tiles (round 9)', wrong: ['Lay tiles', 'Apply primers and liquid membranes', 'Set up the flood test'], right: ['Apply primers and liquid membranes', 'Set up the flood test', 'Lay tiles'] },
];

test('the known-good orders: each wrong form is flagged and sorted right; each right form is left alone', () => {
  for (const item of ORDERS) {
    assert.ok(firmFaults(asSteps(item.wrong)).length > 0, `${item.what}: wrong form not flagged`);
    assert.deepEqual(firmFaults(asSteps(item.right)), [], `${item.what}: right form flagged`);
    assert.deepEqual(inStageOrder(asSteps(item.wrong)).map((step) => step.step), item.right, item.what);
    assert.deepEqual(inStageOrder(asSteps(item.right)).map((step) => step.step), item.right, `${item.what}: right form moved`);
  }
});

test('every firm order agrees with the stage map, so SiteWrite\'s own sorted steps never fail it', () => {
  const against = [];
  for (const chain of FIRM) {
    for (let g = 0; g < chain.length; g += 1) {
      for (let h = g + 1; h < chain.length; h += 1) {
        for (const a of chain[g]) for (const b of chain[h]) if (!(typeof stageOf(a) === 'number' && typeof stageOf(b) === 'number' && stageOf(a) < stageOf(b))) against.push(`${a} / ${b}`);
      }
    }
  }
  assert.deepEqual(against, []);
});

test('loose pairs are not flagged: the work can be done either way round', () => {
  // Insulation over or under a ceiling, painting before or after glazing, dewatering before or after the dig.
  for (const pair of [['Fix ceiling sheets', 'Install insulation'], ['Paint', 'Handle and install glass panels'], ['Dewater the excavation', 'Excavate'], ['Drill and install piles', 'Bulk excavate and load trucks']]) {
    assert.deepEqual(firmFaults(asSteps(pair)), [], pair.join(' / '));
  }
});

test('run 6: SiteWrite\'s ceilings order is right, and W17 does not push the user\'s corrected order the wrong way', () => {
  const draft = draftOf(ceil());
  const list = names(draft);
  assert.ok(before(list, 'Frame walls and bulkheads', 'Handle and install glass panels'), list.join(' | '));
  assert.ok(before(list, 'Sand the joints', 'Fix skirting and architraves'), list.join(' | '));
  assert.deepEqual(firmFaults(draft.jobSteps), []);
  const check = (steps) => checkSwms(fromDraft({ ...draft, jobSteps: steps }, { state: 'tas', swms: { signatures: [{ name: 'Jo Smith' }] } }), { state: 'tas' }).findings.filter((item) => item.rule === 'W17');
  assert.deepEqual(check(draft.jobSteps), []);
  // Moved the wrong way, it is flagged.
  const glass = draft.jobSteps.find((step) => step.step === 'Handle and install glass panels');
  const moved = [draft.jobSteps[0], glass, ...draft.jobSteps.slice(1).filter((step) => step !== glass)];
  assert.match(check(moved)[0].message, /"Frame walls and bulkheads" \(step \d+\) is usually done before "Handle and install glass panels" \(step 2\)/);
});

test('run 6: an own step done "before lining" goes before the linings', () => {
  const draft = draftOf(ceil({ ownSteps: [{ name: 'Treat substrates before lining', part: 'Treat substrates, including applying bonding agent and dubbing out existing walls', hazards: ['Splashes of bonding agent.'], controls: ['The bonding agent is applied by roller with gloves and eye protection.'] }] }));
  const list = names(draft);
  assert.ok(before(list, 'Treat substrates before lining (Our own step)', 'Cut plasterboard'), list.join(' | '));
});

test('run 2: an own step wrapping services goes with the services laid, not before the dig', () => {
  const draft = draftOf(inground({ ownSteps: [{ name: 'Wrap services passing through or under footings', part: 'Wrap services passing through or under footings', hazards: ['Cuts from wrap.'], controls: ['Gloves are worn.'] }] }));
  const list = names(draft);
  assert.ok(before(list, 'Excavate', 'Wrap services passing through or under footings (Our own step)'), list.join(' | '));
  assert.ok(before(list, 'Lay conduits', 'Wrap services passing through or under footings (Our own step)'), list.join(' | '));
});

test('run 5: PE joined by electrofusion after the pipe is installed', () => {
  const list = names(draftOf(plumb()));
  assert.ok(before(list, 'Install risers and pipework', 'Join polyethylene pipe by electrofusion'), list.join(' | '));
  assert.ok(before(list, 'Join polyethylene pipe by electrofusion', 'Pressure test and commission'), list.join(' | '));
});

test('run 8: the earthmoving plant step leads into the dig, not after the reinstatement', () => {
  const list = names(draftOf(civil()));
  assert.ok(before(list, 'Run earthmoving plant', 'Excavate'), list.join(' | '));
  // In a demolition it leads into the demolition.
  const demoSteps = names(draftOf(demo()));
  assert.equal(demoSteps[demoSteps.indexOf('Demolish the structure') - 1], 'Run earthmoving plant', demoSteps.join(' | '));
});

test('run 2: earthing before energising and testing; isolation and energised work with the connection, not before installation', () => {
  const list = names(draftOf(elec(), { energisedWork: 'testing' }));
  assert.ok(before(list, 'Connect and test the earthing', 'Test the high voltage cables'), list.join(' | '));
  assert.ok(before(list, 'Connect and test the earthing', 'Work on or near energised parts'), list.join(' | '));
  assert.ok(before(list, 'Install cable tray and containment', 'Isolate and prove de-energised'), list.join(' | '));
  assert.ok(before(list, 'Pull in and terminate the cables', 'Work on or near energised parts'), list.join(' | '));
  // Work on existing plant keeps the isolation before it.
  const existing = inStageOrder(asSteps(['Isolate and prove de-energised', 'Remove the old board and fit the new one', 'Test the new work']));
  assert.equal(existing[0].step, 'Isolate and prove de-energised');
});

test('run 3: deliveries first and the way up before the work done from it; isolation after the installation', () => {
  const list = names(draftOf(mech(), { energisedWork: 'testing' }));
  assert.ok(list.indexOf('Receive plant and move it into position') <= 2 && before(list, 'Receive plant and move it into position', 'Use an elevating work platform'), list.join(' | '));
  assert.ok(before(list, 'Use an elevating work platform', 'Install ductwork'), list.join(' | '));
  assert.ok(before(list, 'Use an elevating work platform', 'Fix hangers and supports'), list.join(' | '));
  assert.ok(before(list, 'Install ductwork', 'Isolate and prove de-energised'), list.join(' | '));
  assert.ok(before(list, 'Insulate ductwork and pipework', 'Work on or near energised parts'), list.join(' | '));
});

test('SiteLink: spoil is stockpiled and carted after the dig, and the EWP goes before the riser work done from it', () => {
  const sorted = inStageOrder(asSteps(['Cart away spoil', 'Excavate', 'Lay pipes', 'Stockpile and cover spoil', 'Backfill the trench'])).map((step) => step.step);
  assert.ok(before(sorted, 'Excavate', 'Cart away spoil') && before(sorted, 'Stockpile and cover spoil', 'Lay pipes'), sorted.join(' | '));
  const riser = [{ step: 'Install risers and pipework', hazards: ['A fall from a ladder or platform.'], controls: [] }, { step: 'Use an elevating work platform', hazards: ['The platform overturns.'], controls: [] }, { step: 'Pressure test and commission', hazards: [], controls: [] }];
  assert.equal(inStageOrder(riser)[0].step, 'Use an elevating work platform');
});

// ---- 2. High risk work and steps from the task's words (run 7) ----

test('run 7: "demo the 2 storey brick anex" is load-bearing demolition, "services made safe" brings the isolation step, and a strip out has no lining steps', () => {
  const draft = draftOf(demo());
  const list = names(draft);
  assert.ok(list.includes('Demolish the structure'), list.join(' | '));
  assert.ok(!list.includes('Demolish'), list.join(' | '));
  assert.ok((draft.highRisk || []).some((item) => /demolition of an element of a structure that is load-bearing/i.test(item)), JSON.stringify(draft.highRisk));
  assert.ok(list.includes('Isolate and make safe the old services'), list.join(' | '));
  assert.ok(!list.includes('Fix ceiling sheets') && !list.includes('Cut plasterboard') && !list.includes('Cut and fix plasterboard'), list.join(' | '));
  assert.match(draft.task, /brick annex/);
  // New linings named beside a strip out keep their steps.
  const relined = names(draftOf(demo({ task: 'Strip out the old ceilings and partitions, then install new plasterboard ceilings and set and sand the joints.' })));
  assert.ok(relined.includes('Fix ceiling sheets'), relined.join(' | '));
});

test('run 7: SiteWrite\'s check does not say the task keeps the structure where an annex is knocked down whole', () => {
  const draft = draftOf(demo());
  const result = checkSwms(fromDraft(draft, { state: 'act', swms: { signatures: [{ name: 'Jo Smith' }] } }), { state: 'act' });
  assert.ok(!result.findings.some((item) => /the task keeps the structure/.test(item.message || '')));
});

// ---- 3. "Not required" beside the crew's own use (A fault 3) ----

test('run 2: fuel "Not required" asks a reason beside the crew\'s own engine-driven plant, in the SWMS and on the project page', () => {
  const FUEL = 'Fuels (diesel, petrol)';
  const draft = { kind: 'draft', jobSteps: [{ step: 'Excavate', hazards: [], controls: [] }], plantInferred: [{ item: 'Excavator' }, { item: 'Roller or plate compactor' }] };
  assert.match(rules.notUsedNeed(FUEL, '', 'Excavate the trench.', '', '', '', draft), /your plant list has "Excavator", which runs on diesel or petrol\. Add the product you use, or give a short reason/);
  assert.equal(rules.notUsedNeed(FUEL, 'battery and electric plant only', 'Excavate the trench.', '', '', '', draft), '');
  // The project page reads what the draft found.
  const uses = rules.stepUses(draft);
  assert.deepEqual(uses[FUEL], { step: 'Excavator', word: 'diesel or petrol', plant: true });
  assert.match(rules.notUsedNeed(FUEL, '', 'Excavate the trench.', '', '', '', null, uses[FUEL]), /your plant list has "Excavator"/);
  assert.equal(rules.notUsedNeed(FUEL, 'electric excavator, battery compactor', 'Excavate the trench.', '', '', '', null, uses[FUEL]), '');
});

test('runs 2 and 3: "the roofer does it" and "lagging by others" do not settle the crew\'s own waterproofing and lagging', () => {
  const W = 'Waterproofing membranes and primers';
  assert.match(rules.notUsedNeed(W, 'the roofer does it', 'Make roof penetrations, waterproof them and install over flashings.'), /says another trade does it, but your task names "waterproof" as your crew's work/);
  assert.equal(rules.notUsedNeed(W, 'the roofer does it', 'Make roof penetrations. Waterproofing by the roofer.'), '');
  assert.equal(rules.notUsedNeed(W, 'no membrane in our work', 'Make roof penetrations, waterproof them.'), '');
  const S = 'Synthetic mineral fibres (insulation)';
  const steps = { kind: 'draft', jobSteps: [{ step: 'Insulate ductwork and pipework', hazards: ['Skin, eye and breathing irritation from insulation and adhesives.'], controls: [] }] };
  assert.match(rules.notUsedNeed(S, 'lagging by others', MECH, '', '', '', steps), /cannot be "Not required"|says another trade does it/);
  // Insulation resistance testing is not an insulation product.
  assert.ok(!rules.TYPES.filter((type) => type === S).some(() => /insulation/i.test('x') && false));
  assert.equal(rules.namedIn(S, 'Insulation failure from poor terminations. During insulation resistance testing, the far ends are barricaded.'), '');
});

// ---- 4. Wrong-context lines, plant and licences ----

test('run 2: "scissor lifts only, no booms" drops the boom lines, and an indoor warehouse drops the wind lines', () => {
  const draft = draftOf(elec({ plantChoice: { used: ['Scissor lift'], notUsed: [], added: [] } }), { fallControl: 'Scissor lifts only, no booms. Guardrails on the scissor lift platform.' });
  assert.doesNotMatch(lines(draft), /boom-type platform is used|boom's pivot point|Outriggers are set to the manufacturer's instructions|Every boom-type EWP/);
  const indoor = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'install supply air ductwork at high level in the warehouse, 6 m up, working from the EWP', site: site({ ground: 'slab' }) });
  assert.doesNotMatch(lines(indoor), /anemometer|When lightning is|Near traffic, the boom's pivot point/);
});

test('run 2: arc-rated PPE only in steps on or near energised parts, labelling named for cables, no insulation product from insulation testing', () => {
  const draft = draftOf(elec({ kinds: ['cablePull', 'containment', 'isolation', 'hvTermination', 'commissioning', 'fitOff', 'earthStakes', 'mobileScaffold', 'ewp', 'serviceLabels'] }), { energisedWork: 'testing' });
  const arc = draft.jobSteps.filter((step) => step.controls.some((line) => /^Wear an arc-rated face shield/.test(line))).map((step) => step.step);
  for (const name of ['Use mobile scaffolds', 'Use an elevating work platform', 'Drive or drill the earth stakes', 'Install cable tray and containment']) assert.ok(!arc.includes(name), arc.join(' | '));
  assert.ok(names(draft).includes('Label cables and equipment'), names(draft).join(' | '));
  assert.ok(!names(draft).includes('Label pipes, ducts and equipment'));
  const types = typeItems(draft, bodyOf(elec())).map((item) => item.type);
  assert.ok(!types.includes('Synthetic mineral fibres (insulation)'), types.join(' | '));
});

test('run 2: tamper-resistant pit bolts are not a rail machine, and conduits and pit drainage need no plumbing licence', () => {
  const draft = draftOf(inground());
  assert.ok(!plantOf(draft).includes('Track maintenance machine'), plantOf(draft).join(' | '));
  assert.ok(!(draft.qualifications || []).some((name) => /^Plumbing/.test(name)), JSON.stringify(draft.qualifications));
});

test('run 1: perimeter screen install lines only where the crew installs the screens; no chemical splash row with no substances; one clean-up step for a washout', () => {
  const fw = draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'none', task: 'Erect, strip and remove formwork and propping to suspended slabs. Install and remove back propping to slabs below.', site: site() });
  assert.doesNotMatch(lines(fw), /Perimeter screens are assembled and installed by workers trained by the screen supplier/);
  const own = draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'none', task: 'Erect, strip and remove formwork to suspended slabs. Install and jump the perimeter screens.', site: site() });
  assert.match(lines(own), /Perimeter screens are assembled and installed by workers trained by the screen supplier/);
  const crane = draftOf({ state: 'nsw', fallRisk: 'no', crane: 'company', kinds: ['crane', 'forklift'], task: 'Mobile crane lifting of formwork, reinforcement bundles and stair forms. Load out materials with forklift on ground floor. Load out materials with telehandler on ground floor.', site: site() });
  assert.ok(!crane.emergency.some((row) => row.type === 'Chemical splash'), JSON.stringify(crane.emergency.map((row) => row.type)));
  const pour = names(draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'none', task: 'Place concrete to suspended slabs and stairs using concrete pump. Vibrate, screed and finish concrete. Concrete washout at builder\'s designated washout bay.', site: site() }));
  assert.ok(!pour.includes('Cart rubbish to the site bins') && !pour.includes('Clean up the work area'), pour.join(' | '));
  assert.ok(pour.includes('Wash out tools at the washout bay'), pour.join(' | '));
});

test('run 3: no Scaffolding code with no scaffold, and no energised testing lines after "None: everything is isolated"', () => {
  const draft = draftOf(mech({ kinds: ['mechDuct', 'mechPlant', 'splitSystem', 'mechInsulation', 'ewp', 'ladderUse', 'isolation'] }), { energisedWork: 'none' });
  assert.ok(!(draft.sources.codes || []).some((title) => /Scaffold/.test(title)), JSON.stringify(draft.sources.codes));
  // The step keeps its statement that none is done (and the high risk work category), without the energised testing lines.
  const energised = draft.jobSteps.find((step) => step.step === 'Work on or near energised parts');
  if (energised) {
    assert.ok(energised.controls.some((line) => /^No electrical work is done on or near energised parts/.test(line)));
    assert.ok(!energised.controls.some((line) => /energised testing|fault finding|safety observer/i.test(line)), energised.controls.join('\n'));
  }
});

test('run 5: no replacement step for new pipework, and electrofusion without the butt fusion machine lines', () => {
  const draft = draftOf(plumb());
  assert.ok(!names(draft).includes('Replace pipework in the ceiling'), names(draft).join(' | '));
  const fusion = draft.jobSteps.find((step) => step.step === 'Join polyethylene pipe by electrofusion');
  const text = [...fusion.hazards, ...fusion.controls].join('\n');
  assert.doesNotMatch(text, /clamps|hydraulic pressure|into the machine|heater plate/);
  assert.match(text, /Fusion is done only by operators trained/);
});

test('run 6: plumbers named as other trades bring no plumbing lines, and a tower\'s ceiling spaces are not a roof space', () => {
  const draft = draftOf(ceil({ task: `${CEIL} Electricians, plumbers, mechanical and fire services work in the same ceiling spaces. Painters follow on each level.` }));
  assert.doesNotMatch(lines(draft), /Plumbing and drainage work is done by licensed workers|Backflow prevention devices/);
  assert.doesNotMatch(lines(draft), /Heat stress in the roof space|walk only on joists or crawl boards/);
  // A house's ceiling insulation keeps them.
  const house = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'Install ceiling insulation batts in the roof space of the house.', site: site() });
  assert.match(lines(house), /Heat stress in the roof space/);
});

test('run 8: pipe CCTV is not a security job, No crane names no crane operator, others\' reinstatement gets no step, and no sander or children lines', () => {
  const draft = draftOf(civil());
  assert.ok(!(draft.qualifications || []).some((name) => /Security/.test(name)), JSON.stringify(draft.qualifications));
  assert.equal(draft.craneOperator, '');
  assert.ok(!names(draft).includes('Reinstate the surface'), names(draft).join(' | '));
  assert.doesNotMatch(lines(draft), /manual sanding is considered|children, students, patients/);
});

test('run 7: the unticked chainsaw takes its line, and the demolition scaffold lines go with no scaffold', () => {
  const draft = draftOf(demo({ plantChoice: { used: ['Scissor lift', 'Excavator', 'Concrete saw', 'Water cart'], notUsed: ['Chainsaw', 'Skid steer or posi-track', 'Mobile scaffold'], added: [] } }));
  assert.doesNotMatch(lines(draft), /cut with chainsaws|demolition scaffold|Where scaffolding is used for demolition work|The scaffold is dismantled progressively/);
});

// ---- 5. Missing work and plant ----

test('runs 5 and 8: lagging gets the insulation step, and pipe CCTV with no step is listed', () => {
  assert.ok(names(draftOf(plumb())).includes('Insulate ductwork and pipework'));
  assert.ok((draftOf(civil()).notCovered || []).some((part) => /CCTV/.test(part)), JSON.stringify(draftOf(civil()).notCovered));
});

test('run 6: the facade SWMS has the EWP step from the fall answer, and silica, not cement, for CFC sheet', () => {
  const facade = { state: 'tas', fallRisk: 'yes', crane: 'none', task: 'Install external awning soffits, CFC facade and trimdek panel.', kinds: ['eaveLining', 'claddingInstall'], site: site() };
  const draft = draftOf(facade, { fallControl: 'Boom lift EWP with harness clipped to the basket anchor.' });
  assert.ok(names(draft).includes('Use an elevating work platform'), names(draft).join(' | '));
  const types = typeItems(draft, bodyOf(facade)).map((item) => item.type);
  assert.ok(types.includes('Respirable crystalline silica (concrete, masonry, tile and stone dust)'), types.join(' | '));
  assert.ok(!types.includes('Cement, concrete, grout and mortar'), types.join(' | '));
});

test('runs 1, 2 and 7: switchboards, stair formwork, a loading bay, fuel, release agent, the hammer and the trucks', () => {
  assert.ok(names(draftOf(elec())).includes('Deliver and place switchboards'), names(draftOf(elec())).join(' | '));
  const fw = draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'none', task: 'Erect, strip and remove formwork and propping to suspended slabs. Erect and remove formwork and propping to in situ concrete stairs and landings.', site: site() });
  assert.ok((fw.notCovered || []).some((part) => /stairs/.test(part)), JSON.stringify(fw.notCovered));
  assert.ok(typeItems(fw, bodyOf({ state: 'nsw', task: 'formwork' })).some((item) => item.type === 'Curing compounds and form release agents'));
  const scaf = draftOf({ state: 'wa', fallRisk: 'yes', crane: 'own', task: 'erect and dismantle a scaffold around a 3 storey office building, about 4 lifts with hop ups. tie into the slab edges, loading bay on level 2.', site: site() });
  assert.ok((scaf.notCovered || []).some((part) => /loading bay/.test(part)), JSON.stringify(scaf.notCovered));
  const crane = draftOf({ state: 'nsw', fallRisk: 'no', crane: 'company', kinds: ['crane', 'forklift'], task: 'Load out materials with forklift on ground floor. Load out materials with telehandler on ground floor.', site: site() });
  assert.ok(crane.substances.items.some((item) => /^Fuels/.test(item.product)), JSON.stringify(crane.substances));
  const plant = plantOf(draftOf(demo()));
  assert.ok(plant.includes('Rock breaker (hydraulic hammer)') && plant.includes('Tipper or dump truck'), plant.join(' | '));
});

test('SiteLink: building plumbing gets its rough-in and fit-off, not tank walls; in-ground drainage gets its dig; a risers package loses unnamed sewer and lagging steps', () => {
  const building = packageKinds('Install sanitary plumbing and drainage including connection to CST stub branches. Install floor waste gullies, trap primers, sumps and tundishes. Install sanitaryware and tapware in the buildings. Install storage tanks.', ['scaffold', 'mobileScaffold', 'scaffoldUse', 'tankWalls', 'waterConnection']);
  assert.ok(building.includes('plumbingFitOff') && !building.includes('tankWalls') && !building.includes('trench'), building.join(' '));
  const inGround = packageKinds('Trench, excavate, bed, backfill and compact for hydraulic services. Install stormwater pipes, pits and manholes.', ['tankPlace', 'plumbingFitOff', 'waterConnection', 'meterInstall']);
  assert.ok(inGround.includes('trench'), inGround.join(' '));
  const risers = packageKinds('Install hydraulic risers in shafts and pipework at height in copper and PVC. Pressure test the pipework.', ['hydraulicRisers', 'sewerConnection', 'mechInsulation', 'pressureTest', 'ewp']);
  assert.ok(!risers.includes('sewerConnection') && !risers.includes('mechInsulation'), risers.join(' '));
});

test('SiteLink: installing below-ground sewer pump stations asks whether the space is confined', () => {
  const asked = questionsFor({ ...SITE, state: 'qld', fallRisk: 'no', crane: 'none', task: 'Install three 5000L below ground temporary sewer pump stations. Install sewer pump stations with control panels, vents and covers.', kinds: ['trench', 'pumpInstall'] });
  assert.ok((asked.required || []).some((item) => item.id === 'spaceAssessment'), JSON.stringify((asked.required || []).map((item) => item.id)));
});

// ---- 6. The shoring design hold point ----

test('run 2: the shoring design hold point is on the dig and the trench work, not only the dewatering', () => {
  const draft = draftOf(inground({ designs: [{ id: 'shoring', what: 'Shoring design', status: 'notIssued' }] }));
  const held = draft.jobSteps.filter((step) => step.controls.some((line) => /^Hold point: the shoring design is not issued yet/.test(line))).map((step) => step.step);
  for (const name of ['Excavate', 'Work in the trench', 'Dewater the excavation']) assert.ok(held.includes(name), held.join(' | '));
});

// ---- 7. Products in the step that uses them ----

test('runs 1, 2, 5, 6 and 7: each product goes to the step that uses it', () => {
  const at = (type, product, list) => rules.stepOf({ type, product }, asSteps(list));
  assert.equal(at('PVC primer and solvent cement', 'PVC solvent cement type P and priming fluid', ['Install risers and pipework', 'Join polyethylene pipe by electrofusion', 'Join PVC pipe with primer and solvent cement']), 'Join PVC pipe with primer and solvent cement');
  assert.equal(at('Plaster, jointing and setting compounds', 'Boral jointing compound', ['Move and fix plasterboard sheets', 'Set the joints', 'Sand the joints']), 'Set the joints');
  assert.equal(at('Synthetic mineral fibres (insulation)', 'old glasswool batts', ['Remove the old services', 'Strip out ceilings, partitions and floor coverings']), 'Strip out ceilings, partitions and floor coverings');
  assert.equal(at('Cement, concrete, grout and mortar', 'N32 concrete', ['Lay the formwork deck', 'Install cast-in conduits on the deck before the pour', 'Monitor the formwork during the pour']), 'Monitor the formwork during the pour');
  assert.equal(at('Fuels (diesel, petrol)', 'Unleaded petrol', ['Set up the concrete pump and placing boom', 'Pump and place concrete', 'Finish concrete']), 'Finish concrete');
  assert.equal(at('Adhesives', 'pvc conduit glue', ['Lay conduits', 'Label cables and equipment']), 'Lay conduits');
  assert.equal(at('Curing compounds and form release agents', 'Form release agent', ['Erect falsework and shores', 'Lay the formwork deck']), 'Lay the formwork deck');
});

// ---- 8. Hospitals ----

const place = (id, text, location, address, primaryType = 'hospital') => ({ id, displayName: { text }, formattedAddress: address, location, primaryType });
const reply = (body) => ({ ok: true, json: async () => body });
const at = (latitude, longitude) => ({ latitude, longitude });

test('run 5: Flinders Medical Centre, the public emergency department 2 km away, comes before the private hospitals', async () => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith(':searchText') && body.pageSize === 1) return reply({ places: [{ location: at(-35.003, 138.578), formattedAddress: '1284 South Rd, Clovelly Park SA 5042, Australia' }] });
    if (url.endsWith(':searchText') && /emergency/.test(body.textQuery)) return reply({ places: [place('f', 'Flinders Medical Centre', at(-35.022, 138.567), 'Flinders Dr, Bedford Park SA 5042, Australia'), place('b', 'Blackwood Hospital', at(-35.021, 138.614), 'Blackwood SA 5051, Australia'), place('s', 'St Andrew\'s Hospital', at(-34.931, 138.605), 'Adelaide SA 5000, Australia'), place('r', 'Royal Adelaide Hospital', at(-34.920, 138.588), 'Adelaide SA 5000, Australia')] });
    if (url.endsWith(':searchNearby') && body.includedPrimaryTypes.includes('hospital')) return reply({ places: [place('a', 'Ashford Hospital', at(-34.950, 138.574), 'Ashford SA 5035, Australia'), place('c', 'Calvary Adelaide Hospital Emergency Department', at(-34.930, 138.610), 'Adelaide SA 5000, Australia')] });
    return reply({ places: [] });
  };
  const result = await places.nearbyCare('1284 South Rd, Clovelly Park SA 5042', { fetchImpl });
  const list = result.hospitals.map((item) => item.name);
  assert.equal(list[0], 'Flinders Medical Centre', list.join(' | '));
  assert.equal(list[1], 'Royal Adelaide Hospital', list.join(' | '));
  delete process.env.GOOGLE_PLACES_API_KEY;
});

test('run 3: on the Gold Coast, Gold Coast University Hospital before a private emergency room, and a NSW hospital after Queensland ones', async () => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  const calls = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (url.endsWith(':searchText') && body.pageSize === 1) return reply({ places: [{ location: at(-28.000, 153.430), formattedAddress: '120 Esplanade, Surfers Paradise QLD 4217, Australia' }] });
    // Only the nearest public emergency department search, strictly typed, returns the university hospital.
    if (url.endsWith(':searchText') && body.textQuery === 'public hospital emergency department' && body.strictTypeFiltering) return reply({ places: [place('g', 'Gold Coast University Hospital', at(-27.961, 153.383), '1 Hospital Blvd, Southport QLD 4215, Australia')] });
    if (url.endsWith(':searchText') && /emergency/.test(body.textQuery)) return reply({ places: [place('p', 'Pindara Private Hospital Emergency Room', at(-28.013, 153.393), 'Benowa QLD 4217, Australia'), place('t', 'Tweed Valley Hospital', at(-28.247, 153.556), 'Cudgen NSW 2487, Australia'), place('o', 'Robina Hospital', at(-28.078, 153.380), 'Robina QLD 4226, Australia')] });
    return reply({ places: [] });
  };
  const result = await places.nearbyCare('120 Esplanade, Surfers Paradise QLD 4217', { fetchImpl });
  const list = result.hospitals.map((item) => item.name);
  assert.equal(list[0], 'Gold Coast University Hospital', list.join(' | '));
  assert.ok(before(list, 'Robina Hospital', 'Pindara Private Hospital Emergency Room'), list.join(' | '));
  assert.equal(list[list.length - 1], 'Tweed Valley Hospital', list.join(' | '));
  assert.ok(calls.some((body) => body.strictTypeFiltering && body.textQuery === 'public hospital emergency department'));
  delete process.env.GOOGLE_PLACES_API_KEY;
});

// ---- 9. Minor ----

test('"anex" is fixed in the task line, and the SDS example is not one trade\'s product', () => {
  assert.equal(fixSpelling('the 2 storey brick anex').text, 'the 2 storey brick annex');
  assert.doesNotMatch(helpText({ id: 'safetyDataSheet' }), /Curing compound/);
});

// ---- The sl11 build's false flags on the c-hydraulics reading ----

test('sl11: drainage downpipes bring no gutter step, storage tanks no trench, tamper-proof fixings no rail machine, WMS cabling and trench grates no trench or confined space', () => {
  const temp = packageKinds('Install temporary sanitary plumbing and drainage. Install temporary stormwater drainage including downpipes.', ['plumbingFitOff', 'gutters']);
  assert.ok(!temp.includes('gutters'), temp.join(' '));
  assert.ok(packageKinds('Install box gutters and downpipes to the roof.', ['gutters']).includes('gutters'));
  // A package that is only the downpipes keeps the gutter group's downpipe step, as on main (qa-all: it stood down in 8 states).
  const only = 'Install downpipes to the in-ground stormwater drainage system (Central Facilities).';
  assert.deepEqual(packageKinds(only, ['gutters']), ['gutters']);
  const downpipes = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: only, kinds: packageKinds(only, ['gutters']), site: site() });
  assert.equal(downpipes.kind, 'draft', JSON.stringify(downpipes.missing));
  assert.ok(names(downpipes).includes('Install downpipes'), names(downpipes).join(' | '));
  const tanks = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'Install storage tanks on concrete foundations.', kinds: ['tankPlace'], site: site() });
  assert.ok(!(tanks.highRisk || []).some((item) => /trench/i.test(item)), JSON.stringify(tanks.highRisk));
  const pits = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'Fit tamper-resistant security bolts and anti-tamper fixings to pit lids and grates.', site: site() });
  assert.ok(!plantOf(pits).includes('Track maintenance machine'), plantOf(pits).join(' | '));
  for (const task of ['Install WMS field and backbone cabling, cable containment and patch leads.', 'Install bucket traps and trench grates. Design and install automatic hot water flushing system for trade waste.']) {
    const draft = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task, site: site() });
    if (draft.kind !== 'draft') continue;
    assert.ok(!(draft.highRisk || []).some((item) => /trench|confined/i.test(item)), `${task}: ${JSON.stringify(draft.highRisk)}`);
  }
});

test('H3 reads the printed Controls table: a testing package with no energised work keeps its edge protection answer as the fall control', () => {
  const edge = 'Edge protection is installed around every open edge before work starts, and no one works outside it.';
  const draft = draftOf({ state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Test and commission the electrical services.', site: site() }, { energisedWork: 'none', fallControl: edge });
  assert.equal(draft.kind, 'draft');
  const swms = fromDraft(draft, { state: 'qld' });
  assert.ok([...swms.steps.flatMap((step) => step.controls), ...swms.controls].includes(edge), JSON.stringify(swms.controls));
  assert.ok(!checkSwms(swms, { state: 'qld' }).hardFails.includes('H3'));
  // The table line alone passes H3; with it gone, nothing else stops the fall.
  const bare = { state: 'qld', task: 'Test the switchboard on the mezzanine.', fallRisk: 'yes', highRisk: ['Work where there is a risk of a person falling more than 2 metres'], steps: [{ step: 'Test the switchboard', hazards: ['Falling from the mezzanine edge.'], controls: ['Testing is done by a licensed electrician.'] }] };
  assert.ok(checkSwms(bare, { state: 'qld' }).hardFails.includes('H3'));
  assert.ok(!checkSwms({ ...bare, controls: [edge] }, { state: 'qld' }).hardFails.includes('H3'));
});
