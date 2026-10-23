// Content faults found by the messy-user test, round 9 on staging (17 October 2026, build e1f8314), each
// fixed by a general rule: false "Not required" refusals, "Not required" accepted beside real use, work and
// products the SWMS needs, wrong-context steps and lines, order and repeats, plant changes, products in the
// wrong step, the user's own isolation control, and minor ratings, hospitals, codes and licences.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, suggestedKinds } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');
const { typeItems } = require('../substances');
const { controlLevel } = require('../control-level');
const rules = require('../public/substance-rules');
const places = require('../places');

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
const text = (line) => (typeof line === 'string' ? line : line.text);
const lines = (draft) => draft.jobSteps.flatMap((step) => [...step.hazards, ...step.controls].map(text)).join('\n');
const types = (draft, body) => typeItems(draft, body).map((item) => item.type);
const needOf = (input, type) => { const body = bodyOf(input); const draft = prepareDraft(body); return (typeItems(draft, body).find((item) => item.type === type) || {}).need; };
const before = (list, a, b) => list.indexOf(a) >= 0 && list.indexOf(b) >= 0 && list.indexOf(a) < list.indexOf(b);
const PAINT = 'Paints and coatings';
const CEMENT = 'Cement, concrete, grout and mortar';
const WOOD = 'Wood dust (MDF and hardwood)';
const FUEL = 'Fuels (diesel, petrol)';
const GAS = 'Gases (LPG, acetylene, oxygen)';
const POOL = 'Pool and water treatment chemicals';
const GARDEN = 'Potting mix, soil conditioners and fertilisers';
const { SILICA } = rules;
const CHART = { craneChart: '6.4 t at 18 m radius from the crane chart', groundBearing: 'Geotech report GR-1 by Hunter Geo, 200 kPa, 1.2 m mats' };

const RAIL = 'repalce 400 timber sleepers with concrete and resurface 600m of track on the grange line at grange rd level xing, possesion sat nite, hi rail excavator with sleeper grab, ballast hoppers, tamper and regulater, rail cut with abrasive rail saw, alumino thermic welds with propane preheat, lookouts and track protection by others';
const RAIL_SITE = { liveServices: 'signal cables in the cess and boom gate power at the xing, no overhead wiring (diesel line)', publicInterface: 'grange rd level xing closed for the possesion, council detour, peds at the xing', otherTrades: 'signal techs', ground: 'ballast shoulder uneven', access: 'hi rail on at the grange rd xing, crew walk in along the cess' };
const rail = (extra = {}) => ({ state: 'sa', fallRisk: 'no', crane: 'none', trade: 'rail', task: RAIL, site: RAIL_SITE, ...extra });

const BRIDGE = 'Replace the expansoin joints and bearngs on the Parkes Way bridge over Commonwealth Ave. Lane closures on Parkes Way with our TCs under the TGS. Jack the deck at the abutmant with hydralic jacks on a temporary jacking frame (engineer designed), replace 8 elastomeric bearings, saw cut and break out the old joint nosings with jackhammers, install new strip seal joints with epoxy mortar nosings, bond breaker on the abutment joints. Work under the deck from a slung platform and a 20m knuckle boom EWP. Crane company with a 60t all terrain crane lifts the joint steel in.';
const BRIDGE_SITE = { liveServices: 'Street light cables and telco conduits in the bridge deck. No overhead power lines.', publicInterface: 'Traffic on Parkes Way with one lane closed, and on Commonwealth Ave below.', otherTrades: 'None during our shifts', ground: 'Crane on the Parkes Way pavement with outriggers on 1.2 m steel mats.', access: 'From Parkes Way inside the lane closure.' };
const BRIDGE_SDS = 'Two part epoxy mortar for the nosings, strip seal lubricant adhesive and bond breaker tape. SDSs are in the site folder in the ute; products decanted only into labelled tins.';
const bridge = (extra = {}) => ({ state: 'act', fallRisk: 'yes', crane: 'company', slinging: 'crane', trade: 'bridges', task: BRIDGE, site: BRIDGE_SITE, facts: { safetyDataSheet: BRIDGE_SDS, fallControl: 'Slung platform under the deck with full handrails, midrails and toe boards, designed and certified by our engineer.' }, ...extra });

const GARDEN_TASK = 'Podium and roof garden planting: get soil and plants to the roof by crane, install the green roof layers and the green wall, and plant next to the edges. Shopping centre podium on the trower rd side, planter boxes with drip irrigation.';
const garden = (extra = {}) => ({ state: 'nt', fallRisk: 'yes', crane: 'company', slinging: 'crane', trade: 'landscaping', task: GARDEN_TASK, site: { liveServices: 'garden lights and irrigation water in the planters', publicInterface: 'shoppers on the walkway below the podium', otherTrades: "builder's crew", ground: 'podium slab load limit 5 kPa', access: 'loading dock and goods lift' }, facts: { fallControl: "Builder's glass balustrade on the podium edge. Where panels are out we fix temporary guardrails before working near the edge." }, ...extra });

const CIVIL = 'Bulk excavation for site. Backfill and compact. Remove soft spots and replace with select granular fill. Cart away and dump excavated fill off site. Grade to level and compact subgrade. Hand trim excavations and hand backfill and compact. Excavate, grade, backfill and compact for concrete works. Install underground stormwater and pits. Roadsaw existing pavement for stormwater.';
const civil = (extra = {}) => ({ state: 'vic', fallRisk: 'no', crane: 'none', trade: 'civil-earthworks', task: CIVIL, site: { liveServices: 'gas main along Cheltenham Rd', publicInterface: 'footpath on Cheltenham Rd', otherTrades: "builder's crew", ground: 'clay', access: 'front gate' }, ...extra });

// ---- 1. False refusals ----

test('silica is not refused for a garden bed step that cuts timber sleepers, and paint is not refused by a step that only lists coatings among products', () => {
  const draft = draftOf(garden());
  assert.ok(names(draft).includes('Build the raised garden beds'), names(draft).join('; '));
  assert.equal(rules.silicaStep(draft), '', 'cutting timber sleepers makes no silica dust');
  // Concrete sleepers named by the word "concrete" still do.
  assert.equal(rules.silicaStep({ jobSteps: [{ step: 'Replace sleepers', hazards: ['Silica dust from cutting concrete sleepers.'], controls: [] }] }), 'Replace sleepers');
  // A hazard listing several kinds of product does not prove this crew uses the paint.
  const repair = { jobSteps: [{ step: 'Repair the concrete', hazards: ['Skin burns and sensitisation from repair mortars and coatings.'], controls: [] }] };
  assert.equal(rules.usedByStep(PAINT, repair), null);
  // One kind named on its own still counts.
  assert.ok(rules.usedByStep('Solvents and thinners', { jobSteps: [{ step: 'Clean brushes and rollers', hazards: ['Solvent vapour and skin contact from cleaning solvents.'], controls: [] }] }));
});

test('an epoxy mortar in the SDS answer is the epoxy, not a cement product', () => {
  assert.equal(rules.sdsConflict(CEMENT, BRIDGE_SDS), '');
  assert.match(rules.sdsConflict('Epoxy, resins and two-part products', BRIDGE_SDS), /^Epoxy or resin: your safety data sheet answer names/);
  // A cement mortar still is.
  assert.match(rules.sdsConflict(CEMENT, 'Sand and cement mortar for the bedding, SDS in the ute.'), /names "cement"/);
  const need = needOf(bridge({ substancesNotUsed: [CEMENT], substancesNotUsedWhy: { [CEMENT]: 'epoxy nosings only' } }), CEMENT);
  assert.ok(!need, need);
});

// ---- 2. "Not required" accepted beside real use ----

test('"Not required" is refused for silica beside "Silica dust from ballast", whatever the reason', () => {
  const need = needOf(rail({ substancesNotUsed: [SILICA], substancesNotUsedWhy: { [SILICA]: 'supplied and applied by others' } }), SILICA);
  assert.match(need, /the job step "Replace the sleepers and ballast" makes silica dust, so it cannot be "Not required"/);
  // The builder check flags it too.
  const swms = { task: 'Resleeper the track.', fallRisk: 'no', highRisk: [], notRequired: [SILICA], steps: [{ step: 'Replace the sleepers and ballast', hazards: ['Silica dust from ballast.'], controls: ['P2 respirators are worn.'] }] };
  const fixes = checkSwms(swms, { state: 'sa' }).findings.flatMap((item) => item.fixes || []).join('\n');
  assert.match(fixes, /crystalline silica[^\n]*"Not required", but the step "Replace the sleepers and ballast"/);
});

test('"Not required" is refused for wood dust beside a step that cuts treated timber', () => {
  const need = needOf(garden({ substancesNotUsed: [WOOD] }), WOOD);
  assert.match(need, /the job step "Build the raised garden beds" in this SWMS uses "dust from cutting treated timber/);
});

test('fuel "by others" is refused beside the crew\'s own petrol plant, and beside a line refuelling its plant', () => {
  const own = rail({ substancesNotUsed: [FUEL], substancesNotUsedWhy: { [FUEL]: 'fuelled by others before the possesion' }, plantChoice: { used: [], notUsed: [], added: [{ item: 'abrasive rail saw (petrol)', licence: 'No' }] } });
  assert.match(needOf(own, FUEL), /your own plant "abrasive rail saw \(petrol\)" runs on petrol/);
  // The same for the gas the crew's own preheat torch burns.
  const torch = rail({ substancesNotUsed: [GAS], substancesNotUsedWhy: { [GAS]: 'supplied and applied by others' }, plantChoice: { used: [], notUsed: [], added: [{ item: 'thermit welding kit and propane preheat torch', licence: 'rail welder competency' }] } });
  assert.match(needOf(torch, GAS), /your own plant "thermit welding kit and propane preheat torch" runs on propane\. Add the gas you use/);
  const pour = { jobSteps: [{ step: 'Pump and place concrete', hazards: ['A burst line.'], controls: ['Petrol-driven saws, trowels and generators are refuelled only when stopped and cool.'] }] };
  assert.match(rules.notUsedNeed(FUEL, 'supplied by others, pump hire fuels it', '', '', '', '', pour), /"Pump and place concrete" has your crew's plant refuelled on site/);
  // A reason that is not "others do it" still settles it.
  assert.equal(rules.notUsedNeed(FUEL, 'electric trowel and saw only', '', '', '', '', pour), '');
  // The builder check flags fuel beside a refuelling line.
  const swms = { task: 'Pour the slab.', fallRisk: 'no', highRisk: [], notRequired: [FUEL], steps: [{ step: 'Pump and place concrete', hazards: ['A burst line.'], controls: ['Petrol-driven saws, trowels and generators are refuelled only when stopped and cool.'] }] };
  assert.match(checkSwms(swms, { state: 'vic' }).findings.flatMap((item) => item.fixes || []).join('\n'), /Fuels \(diesel, petrol\) is marked "Not required", but the step "Pump and place concrete"/);
});

test('a road saw in the task brings a cutting step and the concrete saw, so silica cannot be "Not required" on the project page either', () => {
  const draft = draftOf(civil());
  assert.ok(draft.plantInferred.some((item) => item.item === 'Concrete saw'), draft.plantInferred.map((item) => item.item).join('; '));
  const cut = rules.silicaStep(draft);
  assert.ok(cut, names(draft).join('; '));
  assert.match(rules.notUsedNeed(SILICA, '', 'roadsaw', '', '', cut, null, null), /cannot be "Not required"/);
  assert.ok(suggestedKinds('Roadsaw existing pavement for stormwater.', {}, { state: 'vic' }).some((id) => ['sawCut', 'silicaDrill'].includes(id)));
});

// ---- 3. Missing work and products ----

test('underground stormwater, pits and pipework laid beside bulk earthworks bring the trench steps', () => {
  const draft = draftOf(civil());
  for (const name of ['Excavate', 'Lay pipes', 'Install pits', 'Backfill the trench']) assert.ok(names(draft).includes(name), `${name}: ${names(draft).join('; ')}`);
  const pool = draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', trade: 'civil-earthworks', task: 'Prepare and test soil. Excavate, dispose of soil, backfill and compact. Import and place fill. Install cast-in and underground pipework from the pool and plant room.' });
  assert.ok(names(pool).includes('Lay pipes') && names(pool).includes('Backfill the trench'), names(pool).join('; '));
});

test('product types the steps, the SDS answer and the plant name are asked for', () => {
  // Pool chemicals and PVC primer in a plant room's steps.
  const plantRoom = { state: 'wa', fallRisk: 'no', crane: 'none', kinds: ['poolEquipment', 'poolPlant'], task: 'Install pool filtration plant. Install pool chemical dosing and water chemistry equipment.', facts: { safetyDataSheet: 'Pool chlorine (sodium hypochlorite), hydrochloric acid 33%, PVC primer and solvent cement. SDSs in the plant room folder.' } };
  let body = bodyOf(plantRoom);
  let list = types(prepareDraft(body), body);
  assert.ok(list.includes(POOL) && list.includes('PVC primer and solvent cement'), list.join('; '));
  assert.ok(!list.includes('Cleaning chemicals'), list.join('; '));
  // Propane named in the task.
  body = bodyOf(rail());
  assert.ok(types(prepareDraft(body), body).includes(GAS));
  // MDF dust and glue in the power tools step.
  body = bodyOf({ state: 'tas', fallRisk: 'no', crane: 'none', trade: 'shopfitting', task: 'Install front of house joinery: main bar structure and finishes, library shelving and cabinets.' });
  list = types(prepareDraft(body), body);
  assert.ok(list.includes(WOOD) && list.includes('Adhesives'), list.join('; '));
  // Potting mix and fertiliser in the planting steps.
  body = bodyOf(garden());
  assert.ok(types(prepareDraft(body), body).includes(GARDEN));
  // An adhesive the SDS answer lists, and fuel for a diesel compressor the user added.
  body = bodyOf(bridge({ plantChoice: { used: [], notUsed: [], added: [{ item: 'Pneumatic jackhammers and diesel air compressor', licence: 'No' }] } }));
  list = types(prepareDraft(body), body);
  assert.ok(list.includes('Adhesives') && list.includes(FUEL), list.join('; '));
  // Road plant brings fuel (content8 decision 6 A).
  body = bodyOf({ state: 'nt', fallRisk: 'no', crane: 'none', task: 'Mill the old asphalt with the road profiler and lay new asphalt with the paver.' });
  assert.ok(types(prepareDraft(body), body).includes(FUEL));
});

test('a Saturday night possession is night work: the night line and day and night hi-vis', () => {
  const draft = draftOf(rail());
  assert.match(lines(draft), /^At night, work areas, stairs and access routes are lit/m);
  const ticked = draft.ppe.flatMap((group) => group.items.filter((item) => item.ticked).map((item) => item.id));
  assert.ok(ticked.includes('hivisNight') && !ticked.includes('hivis'), ticked.join('; '));
  // "nite works" still is, and "no night work" is not.
  assert.match(lines(draftOf({ state: 'nt', fallRisk: 'no', crane: 'none', task: 'Saw cut the asphalt joints, nite works with TCs.' })), /^At night/m);
  assert.doesNotMatch(lines(draftOf({ state: 'nt', fallRisk: 'no', crane: 'none', task: 'Saw cut the asphalt joints. No night works.' })), /^At night/m);
});

test('jacking a bridge deck onto temporary supports is temporary support high risk work', () => {
  const draft = draftOf(bridge());
  assert.ok(draft.highRisk.some((item) => /temporary support/i.test(item)), draft.highRisk.join('; '));
  // Lane closures with our traffic controllers under a TGS are work beside live traffic, so SiteWrite's own check
  // does not then refuse the draft for leaving it out.
  assert.ok(draft.highRisk.some((item) => /traffic corridor/i.test(item)), draft.highRisk.join('; '));
});

// ---- 4. Wrong-context steps and lines ----

test('thermit welds tick no brazing, an added thermit kit brings no aluminium welding or test and tag', () => {
  const draft = draftOf(rail({ plantChoice: { used: ['Excavator', 'Track maintenance machine'], notUsed: [], added: [{ item: 'thermit welding kit and propane preheat torch', licence: 'rail welder competency (aluminothermic)' }] } }));
  assert.ok(!names(draft).some((name) => /Braze|Weld aluminium|Weld steel/.test(name)), names(draft).join('; '));
  const kit = draft.plant.find((item) => /thermit/.test(item.item));
  assert.ok(kit && !/tested and tagged/i.test(kit.inspection), JSON.stringify(kit));
  assert.ok(!suggestedKinds('alumino thermic welds with propane preheat on the rail joints', {}, { state: 'sa' }).includes('hotWork'));
  // With no library step for them, the welds are listed as work with no job steps (D184).
  assert.ok((draft.notCovered || []).some((part) => /alumino thermic welds/.test(part)), JSON.stringify(draft.notCovered));
});

test('bridge expansion joints bring no floor joint or floor coating steps, and no rail permit line on a road bridge', () => {
  const draft = draftOf(bridge());
  assert.ok(!names(draft).includes('Clean out and seal floor joints') && !names(draft).includes('Apply epoxy or polyurethane floor coatings'), names(draft).join('; '));
  assert.doesNotMatch(lines(draft), /Rail traffic below/);
  assert.match(lines(draft), /Road traffic below/);
  // A floor's joints still are floor joints.
  assert.ok(suggestedKinds('Clean out and reseal the expansion joints in the warehouse floor slab.', {}, { state: 'act' }).includes('jointSealing'));
});

test('a truck-mounted EWP outdoors with no power lines prints no indoor, scissor lift, battery, telehandler or Zone B lines', () => {
  // The power tools the plant list also holds do not make the platform a battery one (browser run).
  const draft = draftOf(bridge({ plantChoice: { used: ['Mobile crane (60 t)', 'Electric power tools and leads'], notUsed: ['Boom-type elevating work platform'], added: [{ item: 'Truck mounted knuckle boom EWP, 20 m', licence: 'WP high risk work licence' }] } }));
  const ewp = draft.jobSteps.find((step) => step.step === 'Use an elevating work platform');
  assert.ok(ewp, names(draft).join('; '));
  const said = ewp.controls.join('\n');
  assert.doesNotMatch(said, /Indoors, an electric EWP|engine-driven EWP is used indoors|scissor lift is moved through a doorway|Battery EWPs|charging areas|telehandler is used as an EWP|Zone B|contacts a power line|After contact with a power line/);
  // Indoor scissor lift work keeps its own lines.
  const inside = draftOf({ state: 'act', fallRisk: 'yes', crane: 'none', task: 'Install ceiling grid inside the building from a scissor lift.' });
  assert.match(lines(inside), /scissor lift is moved through a doorway/);
});

test('"no overhead wiring" takes off the traction wiring contact hazard', () => {
  assert.doesNotMatch(lines(draftOf(rail())), /^Contact with overhead traction wiring/m);
  assert.match(lines(draftOf(rail({ site: { ...RAIL_SITE, liveServices: 'signal cables in the cess' } }))), /^Contact with overhead traction wiring/m);
});

test('lines kept to their own work: a bar cutter, a loading platform, a road line, a reversing alarm, the excavation code, a gas meter', () => {
  // A cut-off saw's PPE line is not a bar cutter for joinery.
  const joinery = draftOf({ state: 'tas', fallRisk: 'no', crane: 'none', trade: 'shopfitting', task: 'Install front of house joinery: main bar structure and finishes, library shelving and cabinets.' });
  assert.ok(!joinery.plantInferred.some((item) => /Bar cutter/.test(item.item)), joinery.plantInferred.map((item) => item.item).join('; '));
  // CCTV poles lifted by our own crane truck in a car park: no loading platform or road line.
  const cctv = draftOf({ state: 'qld', fallRisk: 'no', crane: 'own', trade: 'security-access-control', facts: CHART, task: 'CCTV: fix the cameras inside, on facades and at roof edges from EWPs, stand the camera poles on their footings with a crane truck, and fit the pole enclosures and surge protection. 12 cams total in the cribb st carpark and lobby, core drill holes in slab for pole base plates, brennocks sparky does the 240v' });
  assert.doesNotMatch(lines(cctv), /loading platform only after|Work in or beside the road is done inside the traffic management/);
  // Pool pumps are not mobile plant.
  const pool = draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', kinds: ['poolPlant'], task: 'Install pool filtration plant in the plant room.' });
  assert.doesNotMatch(pool.jobSteps.find((step) => step.step === 'Install the pool plant').controls.join('\n'), /reversing alarm/);
  // A tiling SWMS does not list the excavation code from a plant separation line.
  const tiling = draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'company', slinging: 'crane', kinds: ['tileLay', 'tileCut', 'tileMix', 'sitePlant'], task: 'Lay floor tiles in the units and common areas.' });
  assert.ok(!tiling.sources.codes.some((title) => /Excavation/.test(title)), tiling.sources.codes.join('; '));
  // A gas main in the street brings no gas fitting line or "turn off the gas at the meter".
  const dig = draftOf(civil());
  assert.ok(!dig.emergency.some((row) => /meter/.test(row.equipment)), dig.emergency.map((row) => row.equipment).join('\n'));
  assert.doesNotMatch(lines(dig), /Gas pipework is installed, connected and tested only by a licensed gas fitter/);
  assert.ok(dig.emergency.some((row) => row.type === 'Service strike'));
});

test('an in-ground pool is not asked how a formwork deck is laid', () => {
  const task = 'Construct the pool structure: formwork, reinforcement and concrete to swimming stage. Construct concrete balance tank. Install tiling and grout to wet deck and water feature edges.';
  const asked = questionsFor(bodyOf({ state: 'wa', fallRisk: 'yes', crane: 'none', task })).required.map((item) => item.id);
  assert.ok(!asked.includes('deckMethod'), asked.join('; '));
  // A suspended slab still is.
  assert.ok(questionsFor(bodyOf({ state: 'wa', fallRisk: 'yes', crane: 'none', task: 'Form and pour the suspended slab: lay the formply deck.' })).required.some((item) => item.id === 'deckMethod'));
});

// ---- 5. Order and repeats ----

test('a pour runs in order with one placing step, tank walls are poured before the finishes, the bulk dig before the trenches', () => {
  const pour = draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', kinds: ['slabGround', 'slabPour', 'concrete', 'kerbInstall', 'masonryGrout'], task: 'Pump concrete. Place and finish concrete slabs on ground, tank plinths, kerbs, channel and driveways. Corefill retaining walls with concrete.' });
  const steps = names(pour);
  assert.ok(!(steps.includes('Place concrete') && steps.includes('Pump and place concrete')), steps.join('; '));
  assert.ok(before(steps, 'Pump and place concrete', 'Cure the concrete') && before(steps, 'Core fill blockwork', 'Cure the concrete'), steps.join('; '));
  assert.ok(before(steps, 'Set up the concrete pump and placing boom', 'Pump and place concrete'), steps.join('; '));
  const pool = names(draftOf({ state: 'wa', fallRisk: 'yes', crane: 'none', task: 'Construct the pool structure: formwork, reinforcement and concrete to swimming stage. Place concrete using concrete boom pump. Construct concrete balance tank. Clean and grind the concrete pool shell. Apply waterproofing to the pool shell. Install tiling and grout to wet deck edges. Apply render to the walls.' }));
  if (pool.includes('Pour the tank walls')) {
    for (const later of ['Prepare surfaces by grinding', 'Lay tiles', 'Grout the tiles', 'Apply render to walls']) if (pool.includes(later)) assert.ok(before(pool, 'Pour the tank walls', later), `${later}: ${pool.join('; ')}`);
  }
  const dig = names(draftOf(civil()));
  for (const later of ['Excavate', 'Lay pipes', 'Backfill the trench']) assert.ok(before(dig, 'Bulk excavate and load trucks', later), dig.join('; '));
});

test('one pump step in a plant room, plant separation before the work, podium edges before the planting, and added jackhammers bring no second cutting step', () => {
  const plantRoom = names(draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', kinds: ['poolEquipment', 'poolPlant'], task: 'Install pool filtration plant, pool pump and filter.' }));
  assert.ok(!(plantRoom.includes('Install the pool pump and filter') && plantRoom.includes('Install the pool plant')), plantRoom.join('; '));
  const tiling = names(draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'company', slinging: 'crane', kinds: ['tileLay', 'tileCut', 'tileMix', 'sitePlant'], task: 'Lay floor tiles in the units and common areas.' }));
  assert.ok(before(tiling, 'Separate plant and people on site', 'Grout the tiles'), tiling.join('; '));
  const podium = names(draftOf(garden({ kinds: ['landscapeLift', 'greenRoofLayers', 'greenWall', 'podiumEdge'] })));
  assert.ok(before(podium, 'Work at podium edges', 'Plant the green roof') && before(podium, 'Work at podium edges', 'Install the green wall'), podium.join('; '));
  const jack = names(draftOf(bridge({ plantChoice: { used: [], notUsed: [], added: [{ item: 'Pneumatic jackhammers and diesel air compressor', licence: 'No' }] } })));
  assert.ok(jack.includes('Saw cut concrete') && !jack.includes('Drill or cut concrete, masonry or stone'), jack.join('; '));
});

// ---- 6. Plant ----

test('an own EWP in place of the library one keeps the EWP questions, and its WP licence answers the check', () => {
  const draft = draftOf(bridge({ plantChoice: { used: ['Mobile crane (60 t)'], notUsed: ['Boom-type elevating work platform'], added: [{ item: 'Truck mounted knuckle boom EWP, 20 m', licence: 'WP high risk work licence' }] } }));
  const asked = (draft.emergencyQuestions || []).map((item) => item.id);
  assert.ok(asked.includes('ewpLower') && asked.includes('ewpControls'), asked.join('; '));
  const fixes = checkSwms(fromDraft(draft, { state: 'act' }), { state: 'act' }).findings.flatMap((item) => item.fixes || []).join('\n');
  assert.doesNotMatch(fixes, /Match a licence or ticket to the plant and work: elevating work platform/);
});

test('an unticked post hole auger and scaffold take their own lines', () => {
  const input = { state: 'nsw', fallRisk: 'no', crane: 'none', kinds: ['footingHoles'], task: 'Dig the footing holes for the new shade structure posts.' };
  const first = draftOf(input);
  assert.match(lines(first), /hand-held powered auger/);
  const used = first.plantInferred.map((item) => item.item).filter((name) => name !== 'Post hole auger');
  const unticked = draftOf({ ...input, plantChoice: { used, notUsed: ['Post hole auger'], added: [] } });
  assert.doesNotMatch(lines(unticked), /powered auger|hand-held auger/i);
  const render = { state: 'wa', fallRisk: 'yes', crane: 'none', kinds: ['rendering'], task: 'Apply cement render to the external block walls.' };
  const withScaffold = draftOf(render);
  assert.match(lines(withScaffold), /A fall from the scaffold or platform/);
  const kept = withScaffold.plantInferred.map((item) => item.item).filter((name) => name !== 'Scaffold');
  const off = draftOf({ ...render, plantChoice: { used: kept, notUsed: ['Scaffold'], added: [] } });
  assert.doesNotMatch(lines(off), /A fall from the scaffold or platform|scaffold ties/);
});

// ---- 7. Products in the right step ----

test('products go in the step that uses them: silica in the cutting step, a grout in the grouting step, petrol with the saw', () => {
  const cctv = { jobSteps: [{ step: 'Before starting', hazards: [], controls: [] }, { step: 'Set up the crane', hazards: ['The crane overturns.'], controls: ['The crane crew does not set up or work where another trade is making silica or other dust without controls, and reports it to the site supervisor.'] }, { step: 'Core drill through the slab or wall', hazards: ['Silica dust from core drilling.'], controls: [] }] };
  assert.equal(rules.matchStep(SILICA, cctv.jobSteps), 'Core drill through the slab or wall');
  const tiles = [{ step: 'Before starting' }, { step: 'Lay tiles near open edges' }, { step: 'Cut tiles and stone' }, { step: 'Mix and spread the tile adhesive' }, { step: 'Lay tiles' }, { step: 'Grout the tiles' }];
  assert.equal(rules.stepOf({ type: 'Epoxy, resins and two-part products', product: 'Epoxy grout' }, tiles), 'Grout the tiles');
  assert.equal(rules.stepOf({ type: CEMENT, product: 'Sand and cement bedding mix' }, tiles), 'Lay tiles');
  const civilSteps = [{ step: 'Run earthmoving plant' }, { step: 'Drill or cut concrete, masonry or stone' }, { step: 'Excavate' }];
  assert.equal(rules.stepOf({ type: FUEL, product: 'Unleaded petrol' }, civilSteps), 'Drill or cut concrete, masonry or stone');
  assert.equal(rules.stepOf({ type: FUEL, product: 'Diesel' }, civilSteps), 'Run earthmoving plant');
});

// ---- 8. An own isolation control ----

test('the user\'s own track isolation lowers a High rating, and isolation lines rank as isolation', () => {
  const line = 'The track is closed to trains for the whole possession: signals at both ends are locked at stop and derailers are fitted at the worksite limits, so no train can enter the worksite';
  assert.equal(controlLevel(line), 'Isolate or engineer');
  const step = (draft) => draft.jobSteps.find((item) => item.step === 'Replace the sleepers and ballast');
  // Inside a track possession the library step is no longer High on its own lines (content18, messy round 17, B run 5); the user's
  // own isolation line still rates as isolation and keeps it from High.
  assert.notEqual(step(draftOf(rail())).risk.after.level, 'High');
  const own = draftOf(rail({ controlEdits: { 'Replace the sleepers and ballast': { removed: [], changed: [], added: [line] } } }));
  assert.equal(step(own).risk.after.level, 'Moderate');
});

// ---- 9. Minor ----

test('setting out and hand trimming are not left High after their controls', () => {
  const pour = draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', kinds: ['slabGround', 'slabPour'], task: 'Set out, form and pour the slab on ground.' });
  const setOut = pour.jobSteps.find((item) => item.step === 'Set out');
  assert.ok(setOut && setOut.risk.after.level !== 'High', JSON.stringify(setOut && setOut.risk));
  const trim = draftOf(civil()).jobSteps.find((item) => item.step === 'Trim and compact the base by hand');
  assert.ok(trim && trim.risk.after.level !== 'High', JSON.stringify(trim && trim.risk));
});

test('a private hospital an emergency department search returned comes after the public hospitals', async () => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  const at = (latitude, longitude) => ({ latitude, longitude });
  const place = (id, name, location) => ({ id, displayName: { text: name }, formattedAddress: 'NT, Australia', location, primaryType: 'hospital' });
  const reply = (body) => ({ ok: true, json: async () => body });
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith(':searchText') && body.pageSize === 1) return reply({ places: [{ location: at(-12.37, 130.88) }] });
    if (url.endsWith(':searchText') && body.textQuery === 'hospital emergency department') return reply({ places: [place('p', 'Darwin Private Hospital', at(-12.371, 130.881)), place('r', 'Royal Darwin Hospital', at(-12.372, 130.882))] });
    return reply({ places: [] });
  };
  const result = await places.nearbyCare('1 Trower Rd, Casuarina NT 0810', { fetchImpl });
  assert.deepEqual(result.hospitals.map((item) => item.name), ['Royal Darwin Hospital', 'Darwin Private Hospital']);
  delete process.env.GOOGLE_PLACES_API_KEY;
});

test('a WA civil SWMS lists the WA excavation code, and the electrical licence goes where another trade does the 240 V', () => {
  const wa = draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', trade: 'civil-earthworks', task: 'Excavate a trench 1.8 m deep, lay the stormwater pipes and backfill.' });
  assert.ok(wa.sources.codes.includes('Excavation Code of practice 2022 (WA)'), wa.sources.codes.join('; '));
  const cctv = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', trade: 'security-access-control', kinds: ['securityDevices'], task: 'CCTV: fix the cameras in the car park and lobby, brennocks sparky does the 240v.' });
  assert.ok(!cctv.qualifications.some((name) => /^Electrical work licence/.test(name)), cctv.qualifications.join('; '));
  // Our own electrician's work keeps it.
  const ours = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', trade: 'electrical', task: 'Install the new switchboard, our electricians connect the mains.' });
  assert.ok(ours.qualifications.some((name) => /^Electrical work licence/.test(name)), ours.qualifications.join('; '));
});

test('water feature filtration equipment in a plant room is not building a water feature, so it brings no trench', () => {
  const task = 'Install pool filtration plant. Install pool chemical dosing and water chemistry equipment. Install water feature filtration systems. Install movement and isolation joints and mounts to pipework and plant. Install acoustic treatment to pool plant.';
  const kinds = suggestedKinds(task, {}, { state: 'wa' });
  assert.ok(!kinds.includes('trench'), kinds.join('; '));
  const draft = draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', task });
  assert.ok(!names(draft).some((name) => /^(?:Excavate|Work in the trench|Backfill the trench)$/.test(name)), names(draft).join('; '));
  assert.ok(!draft.highRisk.some((item) => /trench/i.test(item)), draft.highRisk.join('; '));
  // Building a water feature still brings its trench and pump.
  assert.ok(suggestedKinds('Build a new water feature with a pump in the courtyard.', {}, { state: 'wa' }).includes('trench'));
});

test('an in-ground pool chosen as formwork, reo and concrete gets the tank wall steps, not a suspended deck, and a "pool shell" is formed and poured', () => {
  const task = 'Construct the in-ground swimming pool: formwork, reinforcement and concrete.';
  const pool = draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', task, kinds: ['formwork', 'reo', 'concrete'] });
  const steps = names(pool);
  assert.ok(steps.includes('Form the tank walls') && steps.includes('Pour the tank walls'), steps.join('; '));
  for (const name of ['Install edge protection', 'Lay the formwork deck', 'Install backprops', 'Erect falsework and shores']) assert.ok(!steps.includes(name), `${name}: ${steps.join('; ')}`);
  assert.ok(!((pool.fallConflict || {}).steps || []).some((name) => /deck|edge protection|backprops/i.test(name)), JSON.stringify(pool.fallConflict));
  // A pool under a suspended slab keeps the deck steps.
  const podium = draftOf({ state: 'wa', fallRisk: 'yes', crane: 'none', task: 'Form and pour the suspended slab over the podium pool.', kinds: ['formwork', 'reo', 'concrete'] });
  assert.ok(names(podium).includes('Lay the formwork deck'), names(podium).join('; '));
  // "Pool shell" formed and poured has steps; sprayed is still the shotcrete steps.
  const shell = draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', task: 'Construct the pool shell.' });
  assert.equal(shell.kind, 'draft', (shell.missing || []).join(' '));
  assert.ok(names(shell).includes('Pour the tank walls') && !(shell.notCovered || []).length, `${names(shell).join('; ')} ${JSON.stringify(shell.notCovered)}`);
  const sprayed = draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', task: 'Spray the pool shell with shotcrete.' });
  assert.ok(names(sprayed).includes('Spray the pool shell') && !names(sprayed).includes('Pour the tank walls'), names(sprayed).join('; '));
});

test('"load-bearing" scaffolds, floor units and girders landed on their bearings bring no bearing replacement step', () => {
  for (const task of ["Birdcage and load-bearing support scaffolds: erect the birdcage scaffold and support scaffold under formwork decks and voids.", 'Precast floor units: land and fix the hollowcore and plank floor units on their bearings, with edge protection at open deck edges.', 'Bridge girder erection: land precast concrete or steel girders onto the bearings with one or two cranes.']) {
    assert.ok(!suggestedKinds(task, {}, { state: 'qld' }).includes('bridgeBearings'), task);
  }
  assert.ok(suggestedKinds('Jack the deck at the abutment and replace the bridge bearings.', {}, { state: 'qld' }).includes('bridgeBearings'));
});
