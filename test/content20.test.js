// Content faults found by the messy-user test, round 19 (staging runs 1 to 8, 23 October 2026, on main eb16aa7): wrong-context
// steps; SiteWrite's own order; W17 and own steps; wrong-context lines and citations; licences; ratings; missing work and false items;
// designs; products and substances; and the scope reading.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, packageKinds, suggestedKinds } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');
const { firmFaults } = require('../step-stages');
const { typeItems } = require('../substances');
const rules = require('../public/substance-rules');
const scopeChoice = require('../public/scope-choice');
const { screenHighRisk } = require('../draft');

const SITE = { residential: 'no', company: 'Test', workplace: '12 Smith Street, Paddington', principalContractor: 'ABC Builders Pty Ltd', hospital: 'Royal Hospital', firstAider: 'Jo Smith', musterPoint: 'Front gate', worksManager: 'Sam Lee', worksManagerPhone: '0400 118 552', complianceResponsible: 'Sam Lee', reviewer: 'Sam Lee', date: '23 October 2026' };
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
// A scope package's groups are settled as the reading settles them (ai-scope.js settlePackages).
const packaged = (input) => (input.groups ? { ...input, kinds: packageKinds(input.task, input.groups), groups: undefined } : input);
const bodyOf = (input, given) => draftBody(answered({ ...SITE, ...packaged(input) }, given));
const draftOf = (input, given, extra = {}) => prepareDraft({ ...bodyOf(input, given), ...extra });
const names = (draft) => draft.jobSteps.map((step) => step.step);
const textOf = (line) => (typeof line === 'string' ? line : line.text);
const lines = (draft) => draft.jobSteps.flatMap((step) => [...step.hazards, ...step.controls]).map(textOf).join('\n');
const stepNamed = (draft, name) => draft.jobSteps.find((step) => step.step === name);
const stepLines = (draft, name) => { const step = stepNamed(draft, name); return step ? [...step.hazards, ...step.controls].map(textOf).join('\n') : ''; };
const before = (list, a, b) => list.indexOf(a) >= 0 && list.indexOf(b) >= 0 && list.indexOf(a) < list.indexOf(b);
const asSteps = (list) => list.map((step) => (typeof step === 'string' ? { step, hazards: [], controls: [] } : step));
const checked = (draft, state) => checkSwms(fromDraft(draft, { state, swms: { signatures: [{ name: 'Jo Smith', date: '1 October 2026' }] } }), { state });
const w17 = (draft, state) => checked(draft, state).findings.filter((item) => item.rule === 'W17' && !item.pass);
const ticked = (draft) => draft.ppe.flatMap((group) => (group.items || []).filter((item) => item.ticked).map((item) => item.id));
const moved = (draft, name, to) => { const steps = [...draft.jobSteps]; const [step] = steps.splice(steps.findIndex((item) => item.step === name), 1); steps.splice(to, 0, step); return { ...draft, jobSteps: steps }; };

// The runs' own words.
const SCAFFOLD = { state: 'wa', fallRisk: 'yes', crane: 'own', task: 'erect n dismantel tube n coupler scafold up the front of a 3 storey bilding for the renderers, about 12m high, 4 lifts, base plates on sole boards on the footpath, gantry over the footpath, gear comes off our truck with the hiab, workin next to the footpath on st quentin ave, power lines out the front, tie ins to the slab edges, handover tag b4 anyone uses it, weekly inspections' };
const SCAFFOLD_GIVEN = { craneChart: 'Hiab XS 144 vehicle loading crane, rated 1.2 t at 8 m radius from its load chart; heaviest bundle 0.4 t at 6 m.' };
const FRP = { state: 'nsw', fallRisk: 'yes', crane: 'none', groups: ['formwork', 'reo', 'concrete', 'ewp'], task: 'Erect, strip and remove formwork and propping to suspended slabs. Erect and strip formwork and propping to in situ concrete stairs and landings. Install and remove back propping to slabs below. Install cast in items supplied by others. Place and fix reinforcement and mesh. Pump and place concrete to suspended slabs and stairs. Vibrate and screed concrete and broom finish to stairs. Power trowel finish to slabs. Cure concrete with curing compound. Saw cut control joints to slabs. Grind slab edges, nibs and minor surface defects. Manage and receive deliveries at the site loading zone. Daily clean up and removal of formwork offcuts, tie wire, packaging and concrete waste. Concrete washout at builder\'s designated washout bay.' };
const CORES = { state: 'vic', fallRisk: 'yes', crane: 'none', groups: ['coreDrill', 'silicaDrill', 'liveNearby'], facts: { liveElectrical: 'no', energisedWork: 'none' }, task: 'Core drill and drill concrete for penetrations. Scabble and chase concrete for conduits. Clear safety mesh from penetrations and erect and maintain barricades and penetration covers. Energised buildings.' };
const MECH = { state: 'qld', fallRisk: 'yes', crane: 'company', slinging: 'crane', task: 'DESCRIPTION OF WORK AREA: All mechanical services to all building areas including the lobby, common areas and all back of house areas including air conditioning and mechanical ventilation systems. Supply and install the acoustic and vibration separation between major plant and the primary building structure. All support metal work / bracketry is to be provided by the Subcontractor. With approved supports/fixings to structure. All fire dampers required on duct passing through fire wall on grid 17. All safe trays and insulated condensate drains to tundishes. Kitchen extract ductwork to kitchens as detailed on the kitchen consultant\'s drawings. Pizza bar, pizza oven exhaust system including fan, ductwork and lagging.' };
const MECH_GIVEN = { fallControl: 'EWP or mobile scaffold' };
const MECH_CRANE = { ...MECH, task: `${MECH.task} Plant lifted to the roof by the crane company's mobile crane.` };
const FITOUT = { state: 'vic', fallRisk: 'yes', crane: 'none', task: 'Install internal light fittings and supports. Install monitored emergency and exit lighting. Install GPOs, switches, floor boxes, captive outlets and skirting duct. Wire rangehood GPOs and isolators and provide circuit signage. Install free-issued cooktops. Install cable containment: trays, ladders, baskets, catenaries and cable management. Install vending machine data outlets and IP56 GPOs. Make final electrical connections to Common Cell Riser Main Frames on site.' };
const PLUMB = { state: 'sa', fallRisk: 'yes', crane: 'none', task: 'Hydraulic pipework at height: install risers in shafts and pipework in ceilings in copper, PVC and polyethylene, joined by brazing, solvent cement and PE fusion welding.' };
const SDS_PLUMB = 'pvc primer and solvent cement, MAPP gas for brazing. sds in the van';
const CEILINGS = { state: 'tas', fallRisk: 'yes', crane: 'none', craneNoKept: true, groups: ['mobileScaffold', 'ewp', 'plasterHeight', 'carpFraming', 'carpentryWork', 'insulation', 'ceilingGrid', 'ceilingHatch', 'plasterSheets', 'plasterCeiling', 'glassHandle', 'plasterSanding', 'doorHang', 'carpJoinery', 'caulking', 'wasteRemoval'], task: 'Re-mobilise and complete works left open at hoist, crane tie and loading platform locations. Provide prototype samples for approval. Protect, cover and mask works and adjoining surfaces. Daily cleaning, removal of plaster droppings and waste to bins. Make good adjoining surfaces and connect into existing works. Install acoustic insulation, including slab soffit insulation and plant room acoustic lining. Install thermal insulation and sisalation. Supply and install access panels and form openings for them. Drywall walls and ceilings to residential tower units and common areas. Construct party wall system. Construct metal stud and timber framing, supports, double and boxed studs. Install pressed metal frames into drywalls with fire rated filling. Build in glazed panels to partitions. Build in cavity wall sliders. Install skirtings, mouldings and flexible gap sealant. Install beam and column casings. Install cornices and mouldings. Set and finish angles, trims, corner beads and junctions. Install vent faces. Install suspended grid and coffered ceilings. Construct bulkheads and drop ceilings to conceal services. Construct lighting pelmets, troughs and recesses. Construct wardrobe stud walls and sheeting. Construct stud walls beneath stairs including support for stairs. Trim existing ceilings where new partitions penetrate. Apply linings to concrete, brickwork, blockwork and lathing substrates. Treat substrates: backing, bonding agent, dubbing out. Cure finished work. Install noggings, blocking and supports for other trades and fixtures. Packing and furring to walls and columns. Form ceiling shadowline gaps and paint shadowline packers. Final substrate patching after first coat sealer. Install deflection heads, movement and expansion joints. Construct nibs and hobs and skim nib walls. Seal and caulk setting beads, frames and wet area linings.' };
const SDS_CEILINGS = 'cornice cement, base coat n topping compound, glasswool batts n acrylic sealant. sds in the site box';
const FACADE = { state: 'tas', fallRisk: 'yes', crane: 'none', groups: ['mobileScaffold', 'ewp', 'claddingInstall'], task: 'External works: awning soffits, CFC facade and trimdek panel.' };
const DEMO = { state: 'act', fallRisk: 'yes', crane: 'none', site: { liveServices: 'Overhead power line on the Barry Drive frontage, kept 6 m clear. All other services disconnected and capped by others.' }, task: 'Demolish a two storey brick office building. Soft strip the internal fit-out by hand first. Strip the metal roof sheeting and timber trusses from an EWP. Then demolish the brick walls and the concrete first floor slab top down with our 30 t excavator fitted with a breaker and pulveriser, with water sprays for dust. Load the rubble into trucks and separate steel for recycling. Asbestos has been removed beforehand by a licensed removalist with a clearance certificate. Services are disconnected by others before we start.' };
const DRAINS = { state: 'nt', fallRisk: 'no', crane: 'company', slinging: 'crane', task: 'Stormwater drainage: excavate trenches, including trenches deeper than 1.5 m with shoring or shields installed by workers competent in that system, or with benches the geotechnical engineer designs, lay and joint the pipes and subsoil drain pipes, place the precast pits and gully pits, and backfill and compact. 60m of 375 rcp along the carpark, trench bout 1.8m deep with our 8t digger n a trench box, pipes n pits come off the truck with the hiab, 2 new pits n conect to the exsisting pit at the boundry' };

// ---- 1. Wrong-context steps ----

test('A run 4: a scaffold for the renderers is not rendering, and a footpath gantry is not work above traffic or a rail line', () => {
  assert.ok(!suggestedKinds(SCAFFOLD.task, {}, {}).includes('rendering'));
  const draft = draftOf(SCAFFOLD, SCAFFOLD_GIVEN);
  const list = names(draft);
  for (const name of ['Apply render to walls', 'Work above traffic or a rail line']) assert.ok(!list.includes(name), list.join(' | '));
  assert.doesNotMatch(lines(draft), /rail operator's permit/);
  assert.ok(!checked(draft, 'wa').findings.some((item) => !item.pass && /rail protection/i.test(item.message || '')));
  // The renderers' own rendering, and a gantry over a road, still are.
  assert.ok(suggestedKinds('Render and bag the new brick walls.', {}, {}).includes('rendering'));
  assert.ok(suggestedKinds('Erect a gantry over the road for the facade works.', {}, {}).includes('workAbove'));
});

test('A run 2: no energised parts step and no low voltage rescue after No and None, for a crew that does no electrical work', () => {
  const draft = draftOf(CORES);
  assert.ok(!names(draft).includes('Work on or near energised parts'), names(draft).join(' | '));
  assert.ok(!draft.qualifications.some((name) => /low voltage rescue/i.test(name)), draft.qualifications.join(' | '));
  assert.doesNotMatch(lines(draft), /low voltage rescue/i);
  // Chasing concrete for conduits is concrete work, not electrical work.
  assert.ok(!draft.qualifications.some((name) => /^Electrical licence/.test(name)));
  // With Yes to live electrical work the step stays.
  const live = draftOf({ ...CORES, facts: { liveElectrical: 'yes' } });
  assert.ok(names(live).includes('Work on or near energised parts'));
});

test('B run 7: services disconnected by others bring the step that confirms their isolation, not one that isolates them', () => {
  const draft = draftOf(DEMO);
  const list = names(draft);
  assert.ok(!list.includes('Isolate and make safe the old services'), list.join(' | '));
  assert.ok(!list.includes('Remove the old services'), list.join(' | '));
  assert.ok(list.includes('Confirm the isolation by others before work'), list.join(' | '));
  // Services the crew makes safe itself keep the isolation step (messy round 11).
  const own = names(draftOf({ state: 'act', fallRisk: 'no', crane: 'none', task: 'Soft strip out of the old office: ceilings, partitions and carpet out, services made safe n cut back by the sparky n plumber, then demo the brick annex with a 20t excavator.' }));
  assert.ok(own.includes('Isolate and make safe the old services'), own.join(' | '));
});

// ---- 2. SiteWrite's own order ----

test('A run 4: the footpath gantry goes up before the scaffold above it, and W17 flags it moved after', () => {
  const draft = draftOf(SCAFFOLD, SCAFFOLD_GIVEN);
  assert.ok(before(names(draft), 'Erect the gantry', 'Erect the scaffold'), names(draft).join(' | '));
  assert.equal(w17(draft, 'wa').length, 0);
  const after = moved(draft, 'Erect the gantry', names(draft).indexOf('Erect the scaffold') + 1);
  assert.match(w17(after, 'wa').map((item) => item.message).join(' '), /"Erect the gantry" \(step \d+\) is usually done before "Erect the scaffold"/);
});

test('A run 3: the crane crew step goes before the plant it delivers is received', () => {
  const draft = draftOf(MECH_CRANE, MECH_GIVEN);
  assert.ok(before(names(draft), 'Work with the crane crew during lifts', 'Receive plant and move it into position'), names(draft).join(' | '));
  assert.equal(w17(draft, 'qld').length, 0);
});

test('B run 6: the access hatch is cut once the ceiling sheets are fixed, and W17 flags it moved before them', () => {
  const draft = draftOf(CEILINGS);
  const list = names(draft);
  assert.ok(before(list, 'Fix ceiling sheets', 'Cut the opening and fit the access hatch'), list.join(' | '));
  assert.ok(before(list, 'Move and fix plasterboard sheets', 'Cut the opening and fit the access hatch'), list.join(' | '));
  assert.equal(w17(draft, 'tas').length, 0);
  assert.ok(firmFaults(asSteps(['Cut the opening and fit the access hatch', 'Fix ceiling sheets'])).length > 0);
});

// ---- 3. W17 and own steps ----

test('A run 3: an own vibration isolator step goes before the plant is fixed on its supports, and W17 flags it moved after the insulation', () => {
  const own = { name: 'Install vibration isolators and acoustic pads under the major plant', hazards: ['Crush injuries placing plant on the isolators.'], controls: ['Plant is lifted with mechanical aids and chocked before the pads go under it.'] };
  const draft = draftOf(MECH, MECH_GIVEN, { ownSteps: [own] });
  const list = names(draft);
  const mine = list.find((name) => /vibration isolators/.test(name));
  assert.ok(before(list, mine, 'Fix plant on its supports'), list.join(' | '));
  const after = moved(draft, mine, list.indexOf('Insulate ductwork and pipework') + 1);
  assert.match(w17(after, 'qld').map((item) => item.message).join(' '), /vibration isolators[^"]*" \(step \d+\) is usually done before "Fix plant on its supports"/);
});

test('B run 7: demolition moved above four earlier steps names each of them', () => {
  const draft = draftOf(DEMO);
  assert.equal(w17(draft, 'act').length, 0);
  const after = moved(draft, 'Demolish the structure', 1);
  const message = w17(after, 'act').map((item) => item.message).join(' ');
  for (const name of ['Check for asbestos before starting', 'Confirm the isolation by others before work', 'Strip out ceilings, partitions and floor coverings', 'Remove old roofing']) assert.ok(message.includes(`"${name}"`), message);
  assert.match(message, /are usually done before "Demolish the structure"/);
});

// ---- 4. Wrong-context lines and citations ----

test('A runs 2 and 3: no house roof space lines in a resort or an apartment fit-out', () => {
  const text = lines(draftOf(MECH, MECH_GIVEN));
  for (const pattern of [/Where the house has solar panels/, /Occupants are told before the power is switched off/, /off-peak circuit/]) assert.doesNotMatch(text, pattern);
  assert.doesNotMatch(lines(draftOf(FITOUT)), /solar panel cables/);
  // A house keeps them.
  const house = lines(draftOf({ state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Run new power circuits through the roof space of the house and fit off new downlights.' }));
  assert.match(house, /Where the house has solar panels/);
});

test('A run 3: the mechanical crew\'s fire damper line does not name the mechanical services contractor, and no tower crane code for a mobile crane', () => {
  const draft = draftOf(MECH_CRANE, MECH_GIVEN);
  const dampers = stepLines(draft, 'Fit the fire dampers');
  assert.match(dampers, /The air handling unit serving the duct is shut down and isolated before the duct is cut\./);
  assert.doesNotMatch(dampers, /by the mechanical services contractor/);
  assert.doesNotMatch(lines(draft), /Tower crane Code of Practice/);
  assert.ok(!draft.sources.codes.some((title) => /Tower crane/i.test(title)), draft.sources.codes.join(' | '));
  // Another trade cutting into the duct keeps the line as written.
  const other = lines(draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'Fire stop the penetrations and fit the fire dampers in the duct where it passes through the fire wall.' }));
  if (/air handling unit serving the duct/.test(other)) assert.match(other, /by the mechanical services contractor/);
});

test('A run 1 and B run 7: with No crane, no crane load, crane crew or crane-held section lines', () => {
  const frp = draftOf(FRP);
  const text = lines(frp);
  for (const pattern of [/crane loads are slung by a licensed dogger/, /^Crane loads land only in an agreed landing zone/m, /^Crane crews land loads on the deck/m]) assert.doesNotMatch(text, pattern);
  const demo = draftOf(DEMO);
  const demolish = stepLines(demo, 'Demolish the structure');
  assert.doesNotMatch(demolish, /Where a crane holds a section/);
  assert.doesNotMatch(demolish, /pulled down by rope or chain/);
  // With a crane company the crane-held section line stays.
  assert.match(stepLines(draftOf({ ...DEMO, crane: 'company', slinging: 'crane', task: `${DEMO.task} The crane company's mobile crane holds the steel sections while they are cut free.` }, { craneChart: 'Mobile crane, rated 12 t at 20 m radius from its chart.' }), 'Demolish the structure'), /Where a crane holds a section/);
});

test('B run 7: the power lines step prints no sander line and no grinding face shield for a demolition crew', () => {
  const step = stepLines(draftOf(DEMO), 'Plan the work near overhead power lines');
  assert.ok(step, 'the power lines step prints');
  assert.doesNotMatch(step, /heavy electric disc sander/);
  assert.doesNotMatch(step, /face shield over safety glasses while grinding/);
});

test('A run 1: the EWP prints no chemicals line where no chemical is named', () => {
  const ewp = stepLines(draftOf(DEMO), 'Use an elevating work platform');
  assert.ok(ewp);
  assert.doesNotMatch(ewp, /Where chemicals are used from the platform/);
  const painting = stepLines(draftOf({ state: 'act', fallRisk: 'yes', crane: 'none', task: 'Paint the steel portal frames from a boom lift beside the live road, with solvent based paint.' }), 'Use an elevating work platform');
  assert.match(painting, /Where chemicals are used from the platform/);
  assert.match(painting, /cannot extend into live lanes/);
});

test('B run 6: no old ceiling asbestos or joist lines in a new tower\'s ceilings, and no "under a crane" for the vacuum lifter with No crane', () => {
  const draft = draftOf(CEILINGS);
  const hatch = stepLines(draft, 'Cut the opening and fit the access hatch');
  assert.ok(hatch);
  assert.doesNotMatch(hatch, /built before 2004/);
  assert.doesNotMatch(hatch, /between the joists/);
  const lifter = draft.plant.find((item) => item.item === 'Vacuum lifter');
  if (lifter) assert.doesNotMatch(lifter.inspection, /under a crane/);
  // A house's old ceiling keeps them.
  const house = stepLines(draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'Cut an opening in the existing ceiling of the house and fit a new access hatch.' }), 'Cut the opening and fit the access hatch');
  assert.match(house, /built before 2004/);
});

test('A run 2: no broad brim or sunscreen for core drilling in an existing energised building', () => {
  const ppe = ticked(draftOf(CORES));
  assert.ok(!ppe.includes('sunHat') && !ppe.includes('sunscreen'), ppe.join(' '));
});

test('B run 7: a chainsaw in the plant list brings chainsaw chaps', () => {
  const draft = draftOf(DEMO);
  assert.ok(draft.plant.some((item) => item.item === 'Chainsaw'));
  assert.ok(ticked(draft).includes('chaps'), ticked(draft).join(' '));
});

// ---- 5. Licences ----

test('B run 7: the demolition licence the step names is listed with the licences', () => {
  const draft = draftOf(DEMO);
  assert.match(stepLines(draft, 'Demolish the structure'), /demolition licence the territory requires/);
  assert.ok(draft.qualifications.some((name) => /^Demolition licence/.test(name)), draft.qualifications.join(' | '));
  assert.ok(!draftOf(FRP).qualifications.some((name) => /^Demolition licence/.test(name)));
});

test('B run 8: where the crane company\'s dogman slings, the lifting gear row and Who name it as theirs', () => {
  const draft = draftOf(DRAINS);
  assert.ok(!draft.qualifications.some((name) => /dogging or rigging/.test(name)), draft.qualifications.join(' | '));
  const gear = draft.plant.find((item) => /^Lifting gear/.test(item.item));
  assert.ok(gear);
  assert.doesNotMatch(gear.licence, /needs a dogging or rigging licence/);
  assert.match(gear.licence, /crane company's licensed dogger or rigger/);
  assert.ok(!draft.jobSteps.some((step) => step.responsible === 'Licensed rigger'), draft.jobSteps.map((step) => step.responsible).join(' | '));
  // Our crew slinging keeps the licence and the row.
  const ours = draftOf({ ...DRAINS, slinging: 'ours' });
  assert.ok(ours.qualifications.some((name) => /dogging or rigging/.test(name)));
});

// ---- 6. Ratings ----

test('A run 1: loading reo onto the deck with No crane is not High after its controls', () => {
  const step = stepNamed(draftOf(FRP), 'Load reo onto the deck');
  assert.ok(step);
  assert.notEqual(step.risk.after.level, 'High', step.risk.after.label);
});

test('B run 5: butt fusion is rated again once the generator, and its shock hazard, come off', () => {
  const kept = stepNamed(draftOf(PLUMB), 'Butt fuse polyethylene pipe');
  assert.equal(kept.risk.before.consequence, 5);
  const off = stepNamed(draftOf(PLUMB, {}, { plantChoice: { notUsed: ['Generator'], added: [] } }), 'Butt fuse polyethylene pipe');
  assert.ok(!off.hazards.some((line) => /generator/i.test(textOf(line))));
  assert.ok(off.risk.before.consequence < 5, off.risk.before.label);
  assert.notEqual(off.risk.after.level, 'High');
});

// ---- 7. Missing work and false items ----

test('A run 1: cast-in items supplied by others are listed as work with no job steps; daily clean up and waste removal are not', () => {
  const draft = draftOf(FRP);
  assert.ok(draft.notCovered.some((part) => /^Install cast in items/.test(part)), draft.notCovered.join(' | '));
  assert.ok(draft.notCovered.some((part) => /stairs and landings/.test(part)), draft.notCovered.join(' | '));
  const unticked = draftOf({ ...FRP, groups: undefined, kinds: ['formwork', 'reo', 'concrete', 'ewp'], kindsOff: ['wasteRemoval'] });
  for (const part of unticked.notCovered) assert.doesNotMatch(part, /offcuts|^Daily clean up$/i, unticked.notCovered.join(' | '));
});

test('B run 6: pressed metal frames are stood, and cornices, awning soffits and trimdek are listed as work with no job steps', () => {
  const draft = draftOf(CEILINGS);
  assert.ok(names(draft).includes('Stand the door frames'), names(draft).join(' | '));
  assert.ok(!names(draft).includes('Hang the doors'), names(draft).join(' | '));
  assert.ok(draft.notCovered.some((part) => /cornices/i.test(part)), draft.notCovered.join(' | '));
  const facade = draftOf(FACADE);
  assert.ok(facade.notCovered.some((part) => /awning soffits/i.test(part)), facade.notCovered.join(' | '));
  assert.ok(facade.notCovered.some((part) => /trimdek/i.test(part)), facade.notCovered.join(' | '));
});

// ---- 8. Designs ----

test('A run 1: the temporary support design and the load limit drawing named by number print in the designs table', () => {
  const draft = draftOf(FRP, {
    temporarySupport: 'Temporary supports are to the engineer\'s design TW-04, installed and checked by our leading hand before loads are applied.',
    loadLimits: 'Loads are placed only in the areas marked on the structural engineer\'s drawing S-201 (3 kPa), checked by the leading hand before loading starts.',
  });
  const rows = (draft.designs || []).map((row) => `${row.what} ${row.number}`);
  assert.ok(rows.some((row) => /TW-04/.test(row)), rows.join(' | '));
  assert.ok(rows.some((row) => /S-201/.test(row)), rows.join(' | '));
});

// ---- 9. Products and substances ----

test('A run 1: a curing compound goes to the finishing step; a form oil to the deck', () => {
  const steps = draftOf(FRP).jobSteps;
  assert.equal(rules.stepOf({ type: 'Curing compounds and form release agents', product: 'Curing compound' }, steps), 'Finish concrete');
  assert.equal(rules.stepOf({ type: 'Curing compounds and form release agents', product: 'Form oil' }, steps), 'Lay the formwork deck');
});

test('A run 3: silica goes to the hanger step where the anchors are hammer drilled', () => {
  assert.equal(rules.matchStep(rules.SILICA, draftOf(MECH, MECH_GIVEN).jobSteps), 'Fix hangers and supports');
});

test('A run 3: an own step naming PVC solvent cement asks for the PVC product, not a solvent', () => {
  const own = { name: 'Install safe trays and insulated condensate drains to the tundishes', hazards: ['Solvent fumes from PVC solvent cement.'], controls: ['PVC solvent cement is used with good ventilation and the lid kept on.'] };
  const input = { ...bodyOf(MECH, MECH_GIVEN), ownSteps: [own] };
  const types = typeItems(prepareDraft(input), input).map((item) => item.type);
  assert.ok(types.includes('PVC primer and solvent cement'), types.join(' | '));
  assert.ok(!types.includes('Solvents and thinners'), types.join(' | '));
});

test('B run 5: the SDS answer makes the MAPP gas product, and the answer leaves the step once its products are placed', () => {
  const made = rules.sdsProducts(SDS_PLUMB);
  assert.deepEqual(made.map((row) => row.product), ['pvc primer', 'solvent cement', 'MAPP gas']);
  assert.equal(made[2].type, 'Gases (LPG, acetylene, oxygen)');
  assert.equal(rules.namedIn('Gases (LPG, acetylene, oxygen)', 'the site map'), '');
  const input = { ...bodyOf(PLUMB, { safetyDataSheet: SDS_PLUMB }), substances: [
    { id: 'sub-1', type: 'PVC primer and solvent cement', product: 'PVC primer', sdsDate: '2025-01-01', controls: ['Use in a ventilated area.'], matches: true },
    { id: 'sub-2', type: 'PVC primer and solvent cement', product: 'Solvent cement', sdsDate: '2025-01-01', controls: ['Use in a ventilated area.'], matches: true },
  ] };
  const pvc = prepareDraft(input).jobSteps.find((step) => /\bPVC\b/.test(step.step));
  assert.ok(pvc);
  assert.ok(!pvc.controls.map(textOf).some((line) => /^PVC primer and solvent cement, MAPP gas/i.test(line)), pvc.controls.map(textOf).join('\n'));
});

test('B run 6: base coat and topping compound are two setting products, cornice cement is not a cement, and setting goes to the joints', () => {
  const made = rules.sdsProducts(SDS_CEILINGS);
  const byProduct = Object.fromEntries(made.map((row) => [row.product, row.type]));
  assert.equal(byProduct['base coat'], 'Plaster, jointing and setting compounds');
  assert.equal(byProduct['topping compound'], 'Plaster, jointing and setting compounds');
  assert.equal(byProduct['cornice cement'], 'Plaster, jointing and setting compounds');
  assert.equal(rules.matchStep('Plaster, jointing and setting compounds', draftOf(CEILINGS).jobSteps), 'Set the joints');
});

test('B run 7: diesel goes to the step that runs the excavator, not the asbestos check that names the regulator', () => {
  assert.equal(rules.matchStep('Fuels (diesel, petrol)', draftOf(DEMO).jobSteps), 'Demolish the structure');
});

// ---- 10. Reading ----

test('A run 1: scope 2.4 gives the crew its edge protection, so the "by others" question starts at Yes', () => {
  const says = 'Supply and install edge protection to all slab edges and stair voids during formwork, reinforcement and pour, and maintain it until handed over to the builder\'s perimeter screens. Perimeter screens are supplied by others.';
  const pack = { name: 'Suspended slabs and stairs', rows: [{ activity: 'Erect, strip and remove formwork and propping to suspended slabs' }] };
  assert.equal(scopeChoice.othersAnswer({}, pack, { step: 'Install edge protection', says }), 'yes');
  assert.equal(scopeChoice.othersAnswer({}, pack, { step: 'Install edge protection', says: 'Perimeter screens are supplied by others.' }, [{ activity: says }]), 'yes');
  assert.equal(scopeChoice.othersAnswer({}, pack, { step: 'Install perimeter screens', says: 'Perimeter screens are supplied by others.' }, [{ activity: says }]), 'no');
  assert.equal(scopeChoice.othersAnswer({ [pack.name]: { 'Install edge protection': 'no' } }, pack, { step: 'Install edge protection', says }), 'no');
});

test('A run 2: a generator control panel is not fuel line work', () => {
  const screened = screenHighRisk({ state: 'vic', task: 'Install generator control panel and modify existing generator master control system and BMS interface. Install Lighting Control System. Install HLI gateways and BMS interfaces to plant.', kinds: null, leaveOut: [] }, '');
  assert.ok(!screened.categories.some((item) => item.id === 'chemicalLine'), JSON.stringify(screened.categories));
  const generator = screenHighRisk({ state: 'vic', task: 'Install the new standby generator with its day tank and fuel lines.', kinds: null, leaveOut: [] }, '');
  assert.ok(generator.categories.some((item) => item.id === 'chemicalLine'));
});
