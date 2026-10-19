// Content faults found by the messy-user test, round 15 (staging runs 1 to 8 and the SiteLink run, 18 to 19 October 2026, on
// main df5c614): a building's service shaft read as an excavation; core work neither stepped nor listed; SiteWrite's own order
// and W17; hold points saying different things; wrong-context steps, lines, plant and licences; own steps in the wrong place;
// a false item in the work with no job steps; Add a step not finding steps by their names; products in the wrong step;
// substances; SiteWrite's check; wording; and the SiteLink run's content faults.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, packageKinds, highRiskMatches } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');
const { firmFaults, inStageOrder } = require('../step-stages');
const { searchSteps } = require('../steps');
const { designsNeeded } = require('../designs');
const { packageTitles } = require('../handover');
const { helpText } = require('../answer-help');
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
const plantOf = (draft) => (draft.plantInferred || []).filter((item) => !item.maybe).map((item) => item.item);
const pkg = (input) => ({ ...input, kinds: packageKinds(input.task, input.kinds) });

// The runs' own words.
const RISERS = { state: 'sa', fallRisk: 'yes', crane: 'none', task: 'Hydraulic pipework at height: install risers in shafts and pipework in ceilings in copper, PVC and polyethylene, joined by brazing, solvent cement and PE fusion welding. Nine storey apartment building: DN100 PVC sewer stacks and copper hot and cold water risers in the service shafts from basement 1 to level 9, then branch pipework in the corridor ceilings from a mobile scaffold and podium steps. Pipe lengths are lifted up the shaft with our chain block. The builder has handrails and penetration covers on the shaft openings.', priorKinds: ['hydraulicRisers', 'hotWork', 'solventCement', 'peFusion'] };
const FORMWORK = { state: 'nsw', fallRisk: 'yes', crane: 'company', slinging: 'company', task: 'Erect, strip and remove formwork and propping to suspended slabs. Erect and strip formwork and propping to in situ concrete stairs and landings. Install and remove back propping to slabs below. Form up penetrations, openings and recesses in slabs, and cover and mark them. Install cast in items: plates, ferrules, conduits. Power trowel finish to slabs. Apply curing compound to concrete. Saw cut control joints to slabs. Grind slab edges, nibs and minor surface defects. Manage deliveries to site loading zone. Daily clean up and removal of offcuts, tie wire, packaging and concrete waste. Concrete washout at builder\'s designated washout bay.', kinds: ['formwork', 'wasteRemoval', 'castIn', 'sitePlant'] };
const POUR = { state: 'nsw', fallRisk: 'yes', crane: 'company', slinging: 'company', task: 'Place concrete to suspended slabs and stairs. Vibrate, screed and finish concrete, including broom finish to stairs. Possible night pours.', kinds: ['concrete'] };
const HV = { state: 'vic', fallRisk: 'yes', crane: 'none', task: 'Install HV cabling and connect it into the existing HV network. Install LV and ELV cabling, consumer mains, submains and final sub-circuits. Terminate, joint and test cables. Install HV, LV and communications earthing, earth grids, earth stakes and surge protection connections. Provide and run temporary standby generators during cutover works and commissioning. Install the energy metering system and connect it to hydraulic water and gas meters. Provide power supplies and final connections to equipment and other trades\' panels. Carry out electrical isolation and lock out. Survey EMS shield requirements and install EMS shielding where nominated. Install AVRS power, control and monitoring cabling, and underground conduits.' };
const INGROUND = { state: 'vic', fallRisk: 'no', crane: 'none', task: 'Inspect and clean CST pits and conduits, clear debris, install draw wires and conduit caps. Connect to the CST and install site-wide pit and conduit reticulation between buildings. Trench, excavate, backfill and compact for services, including stockpiling spoil and reinstating temporary roads. Dewater services trenches. Install in-ground conduits, pits, warning tape with trace wire, pit markers and pit drainage. Install temporary underground conduits and pits.', kinds: ['trench', 'dewatering', 'spoilManage', 'hddBore'] };
const MECH = { state: 'qld', fallRisk: 'yes', crane: 'none', task: 'All mechanical services to all building areas including the lobby, common areas and all back of house areas including air conditioning and mechanical ventilation systems. All support metal work / bracketry is to be provided by the Subcontractor. With approved supports/fixings to structure. Kitchen extract ductwork to kitchens. Pizza bar, pizza oven exhaust system including fan,ductwork and lagging.' };
const SCAFFOLD = { state: 'wa', fallRisk: 'yes', crane: 'none', task: 'Erect and dismantle 3 lift scaffold across the front of a 2 storey shop for the roofers and painters. 18m long 6m high, ties into the brick wall, base plates and sole boards on the footpath, loading bay for roof sheets. Hoist gear up by hand rope' };
const TOWER = { state: 'tas', fallRisk: 'yes', crane: 'none', task: 'Construct stud framing and linings to walls, ceilings, bulkheads and baffles in the residential tower. Construct bulkheads, beam and column casings. Install cornices, mouldings, skirtings, trims and finish angles and junctions. Install supporting framing, battens, hangers, double and boxed studs, deflection heads and movement joints. Install noggings, blocking and supports for other trades\' fixtures. Prepare substrates and apply linings, furring and packing to concrete and masonry. Set, cure and finish plasterboard including final patch after primer. Seal and caulk wet area linings, frames, airshafts and ducts.', kinds: ['carpFraming', 'plasterSheets', 'plasterCeiling', 'plasterSanding', 'plasterHeight', 'carpJoinery', 'caulking', 'mobileScaffold'] };
const CEILINGS = { state: 'tas', fallRisk: 'no', crane: 'none', task: 'Install suspended grid and coffered ceilings. Install flush plasterboard and fibre cement ceilings with shadowlines and junction trims. Trim existing ceilings where new partitions penetrate. Install acoustic baffles in ceiling spaces.', kinds: ['ceilingGrid', 'plasterCeiling', 'mobileScaffold'] };
const DEMO = { state: 'act', fallRisk: 'yes', crane: 'none', task: 'Soft strip of levels 2 and 3 of a vacant four storey office building: remove ceiling tiles and grid, non load bearing stud partitions, carpet and vinyl floor coverings, and loose fittings, working from mobile scaffolds and podium steps. Then demolish the single storey brick rear annexe with our 14 t excavator and hydraulic breaker: strip the metal roof sheeting from a scissor lift first, then knock down the brick walls and break up the slab. Asbestos has been removed by a licensed removalist and a clearance certificate is issued before we start. The builder has disconnected and made safe all services to the annexe. Waste is sorted into skip bins on site.' };
const DRAINS = { state: 'nt', fallRisk: 'yes', crane: 'none', task: 'Stormwater drainage: excavate trenches, including trenches deeper than 1.5 m with shoring or shields installed by workers competent in that system, or with benches the geotechnical engineer designs, lay and joint the pipes and subsoil drain pipes, place the precast pits and gully pits, and backfill and compact. 90m of 600 RCP for the back carpark, trench about 2.6m deep at the low end, trench shield, our 20t excavator, pits lifted in with the excavator.' };

// ---- 1. A building's service shaft is not an excavation ----

test('B run 5: risers in the service shafts, lifted up the shaft, bring no trench, high risk row, permit or trench line, and the builder\'s covers are not listed', () => {
  const draft = draftOf(RISERS);
  const list = names(draft);
  for (const name of ['Locate underground services', 'Excavate', 'Work in the trench', 'Lay pipes', 'Backfill the trench']) assert.ok(!list.includes(name), list.join(' | '));
  assert.ok(!draft.highRisk.some((label) => /trench|shaft/i.test(label)), draft.highRisk.join(' | '));
  assert.doesNotMatch(lines(draft), /excavation permit|lowered in, or in a trench|reversing alarm/i);
  assert.ok(!(draft.notCovered || []).some((part) => /penetration covers/i.test(part)), JSON.stringify(draft.notCovered));
  assert.ok((draft.notCovered || []).some((part) => /chain block/i.test(part)));
  // A shaft that is dug is still an excavation.
  assert.ok(highRiskMatches('Excavate a 3 m deep shaft for the pump station.', 'no', { id: 'qld' }).some((item) => item.check === 'trench'));
  // Nor is an EWP plant where the task works from a mobile scaffold and podium steps (B run 5).
  assert.ok(!plantOf(draft).includes('Elevating work platform'), plantOf(draft).join(' | '));
});

test('A run 2: a scope\'s shoring threshold is not the trench\'s depth, so an answer of 1.2 m settles the high risk row', () => {
  const rule = 'Trench, excavate, backfill and compact for services. Excavations deeper than 1.5 m are shored or benched.';
  assert.ok(highRiskMatches(rule, 'no', { id: 'vic' }).some((item) => item.check === 'trench'));
  assert.ok(!highRiskMatches(`${rule}\nTrenches are no deeper than 1.2 m and the sides are battered back in the clay.`, 'no', { id: 'vic' }).some((item) => item.check === 'trench'));
  assert.ok(highRiskMatches('Excavate trenches deeper than 1.5 m for the sewer.', 'no', { id: 'vic' }).some((item) => item.check === 'trench'));
});

// ---- 2. Missing core work ----

test('A run 1: the formwork crew\'s slab finishing gets the concrete finishing step, not the pump, the pour or the demolition saw cut', () => {
  const settled = packageKinds(FORMWORK.task, ['formwork']);
  assert.ok(settled.includes('concrete'), settled.join(', '));
  const draft = draftOf(pkg(FORMWORK));
  const list = names(draft);
  assert.ok(list.includes('Finish concrete'), list.join(' | '));
  for (const name of ['Pump and place concrete', 'Set up the concrete pump and placing boom', 'Saw cut concrete']) assert.ok(!list.includes(name), list.join(' | '));
  const finish = stepNamed(draft, 'Finish concrete').controls.join('\n');
  assert.match(finish, /power trowels/i);
  assert.match(finish, /curing compounds/i);
  assert.match(finish, /control joints are saw cut/i);
  assert.ok(before(list, 'Monitor the formwork during the pour', 'Finish concrete'), list.join(' | '));
  for (const part of ['Power trowel finish to slabs', 'Apply curing compound to concrete', 'Saw cut control joints to slabs']) assert.ok(!(draft.notCovered || []).includes(part), JSON.stringify(draft.notCovered));
  // The finishing step is recommended for the formwork crew's own words too, not only for a scope package.
  assert.ok(names(draftOf({ ...FORMWORK, kinds: undefined })).includes('Finish concrete'));
});

test('A runs 2 and 3: air conditioning units and exhaust fans, standby generators run at cutover, and CST pits cleaned with draw wires are stepped', () => {
  const mech = draftOf(MECH);
  assert.ok(names(mech).includes('Fix the units in place'), names(mech).join(' | '));
  // Ventilation systems named with their units keep the ductwork step (the wide corpus's b-mechanical-1).
  const vent = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'Install air conditioning and mechanical ventilation systems to all building areas. Install toilet exhaust systems. Install safe trays and insulated condensate drains to tundishes.' });
  assert.ok(names(vent).includes('Install ductwork') && names(vent).includes('Fix the units in place'), names(vent).join(' | '));
  const hv = draftOf(HV);
  assert.ok(names(hv).includes('Connect a temporary generator to the installation'), names(hv).join(' | '));
  assert.ok(!names(hv).includes('Install the generators'));
  assert.ok(!draftOf({ ...HV, state: 'qld' }).highRisk.some((label) => /fuel|chemical/i.test(label)));
  const pits = draftOf(pkg(INGROUND));
  assert.ok(names(pits).includes('Open the pits and haul the cable through the conduits'), names(pits).join(' | '));
  assert.doesNotMatch(lines(pits), /The work in the street follows/);
  assert.ok(!(pits.notCovered || []).some((part) => /draw wires/i.test(part)), JSON.stringify(pits.notCovered));
  // Pipe pits cleaned before the pipework connects are not cable pits (the wide corpus's CST mechanical pits).
  assert.ok(!names(draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', task: 'Enter and inspect CST mechanical pits and check integrity and cleanliness of CST pipework before connection. Internally clean CST pits, make good damage and touch up valve paint.' })).includes('Open the pits and haul the cable through the conduits'));
});

test('B run 6: flush plasterboard ceilings are set and sanded, and acoustic baffles with no library step are listed', () => {
  const draft = draftOf(pkg(CEILINGS));
  const list = names(draft);
  assert.ok(list.includes('Set the joints') && list.includes('Sand the joints'), list.join(' | '));
  assert.ok((draft.notCovered || []).some((part) => /acoustic baffles/i.test(part)), JSON.stringify(draft.notCovered));
});

test('A run 1: the engineer\'s reinforcement inspection before each pour prints in the reo step; B run 7: the engineer\'s demolition plan is asked for', () => {
  const reo = { state: 'nsw', fallRisk: 'yes', crane: 'company', slinging: 'company', task: 'Place and fix reinforcement and mesh.', kinds: ['reo'] };
  const held = draftOf({ ...reo, scopeTask: { plain: reo.task, full: 'Place and fix reinforcement and mesh (conditions: reinforcement inspection hold points by the engineer before each pour).', notes: '' } });
  assert.match(stepNamed(held, 'Place and tie reo').controls.join('\n'), /Where the engineer inspects before the pour, the pour starts only once the inspection is passed/);
  assert.doesNotMatch(stepNamed(draftOf(reo), 'Place and tie reo').controls.join('\n'), /engineer inspects before the pour/);
  const demo = draftOf(DEMO);
  const needed = designsNeeded(demo);
  assert.ok(needed.some((item) => item.id === 'demolition' && item.steps.some((entry) => entry.step === 'Demolish the structure' && entry.holds)), JSON.stringify(needed));
  assert.match(lines(demo), /holding any demolition licence the territory requires/);
});

// ---- 3 and 4. SiteWrite's own order, and W17 on wrong moves ----

test('SiteWrite\'s own order: control joints after the pour, the isolation before the HV terminations, the grid before the ceiling sheets', () => {
  const saw = draftOf({ ...FORMWORK, kinds: ['formwork', 'sawCut'] });
  assert.ok(before(names(saw), 'Monitor the formwork during the pour', 'Saw cut concrete'), names(saw).join(' | '));
  assert.deepEqual(firmFaults(saw.jobSteps), []);
  const hv = draftOf(HV);
  assert.ok(before(names(hv), 'Isolate and prove de-energised', 'Prepare and terminate the high voltage cables'), names(hv).join(' | '));
  assert.ok(before(names(hv), 'Pull cables and handle cable drums', 'Isolate and prove de-energised'), names(hv).join(' | '));
  assert.deepEqual(firmFaults(hv.jobSteps), []);
  const ceilings = draftOf(CEILINGS);
  assert.ok(before(names(ceilings), 'Install suspended grid ceilings', 'Fix ceiling sheets'), names(ceilings).join(' | '));
  assert.deepEqual(firmFaults(ceilings.jobSteps), []);
});

test('W17 flags each wrong move of round 15, own steps included, and SiteWrite sorts its own steps back', () => {
  const flagged = (list, step, after) => firmFaults(asSteps(list)).some((item) => item.step === step && item.after === after);
  assert.ok(flagged(['Before starting', 'Fix plant on its supports', 'Use an elevating work platform', 'Fix hangers and supports', 'Finish and clean up'], 'Fix hangers and supports', 'Fix plant on its supports'));
  assert.ok(flagged(['Before starting', 'Excavate', 'Lay pipes', 'Work in the trench', 'Finish and clean up'], 'Work in the trench', 'Lay pipes'));
  assert.ok(flagged(['Before starting', 'Saw cut concrete', 'Erect falsework and shores', 'Lay the formwork deck', 'Finish and clean up'], 'Erect falsework and shores', 'Saw cut concrete'));
  assert.ok(flagged(['Before starting', 'Fix ceiling sheets', 'Install suspended grid ceilings', 'Finish and clean up'], 'Install suspended grid ceilings', 'Fix ceiling sheets'));
  assert.ok(flagged(['Before starting', 'Prepare and terminate the high voltage cables', 'Isolate and prove de-energised', 'Finish and clean up'], 'Isolate and prove de-energised', 'Prepare and terminate the high voltage cables'));
  assert.ok(flagged(['Before starting', 'Erect falsework and shores', 'Strip the formwork', 'Form up the stairs and landings (Our own step)', 'Finish and clean up'], 'Form up the stairs and landings (Our own step)', 'Strip the formwork'));
  assert.ok(flagged(['Before starting', 'Erect the scaffold', 'Dismantle the scaffold', 'build the loading bay for the roof sheets (Our own step)', 'Finish and clean up'], 'build the loading bay for the roof sheets (Our own step)', 'Dismantle the scaffold'));
  // A saw cut before a repair pour, with no formwork, is not flagged.
  assert.ok(!flagged(['Before starting', 'Saw cut concrete', 'Break out damaged concrete', 'Place concrete', 'Finish and clean up'], 'Place concrete', 'Saw cut concrete'));
  const sorted = inStageOrder(asSteps(['Before starting', 'Fix ceiling sheets', 'Install suspended grid ceilings', 'Finish and clean up'])).map((step) => step.step);
  assert.ok(before(sorted, 'Install suspended grid ceilings', 'Fix ceiling sheets'), sorted.join(' | '));
});

// ---- 5. Hold points say one thing ----

test('A run 1: a formwork design not issued yet holds every forming step, the deck too, and the pour SWMS, holding none, says only to update it', () => {
  const ownFacts = (input) => { const body = bodyOf(input); return { ...body, facts: { ...body.facts, formworkDesign: '', temporarySupport: 'Temporary supports to the temporary works design (not issued yet: the work does not start until it is issued and this SWMS is updated), installed and checked by the leading hand before loads are applied.' }, designs: [{ id: 'formwork', status: 'notIssued' }, { id: 'propping', status: 'notIssued' }] }; };
  const form = prepareDraft(ownFacts(pkg(FORMWORK)));
  const row = form.designs.find((item) => item.id === 'formwork');
  for (const name of ['Erect falsework and shores', 'Lay the formwork deck', 'Form penetrations and voids', 'Install backprops']) {
    assert.ok(row.held.includes(name), row.held.join(' | '));
    assert.ok(stepNamed(form, name).controls.some((line) => /^Hold point: the formwork design is not issued yet/.test(line)), name);
  }
  assert.ok(!row.held.includes('Monitor the formwork during the pour'));
  assert.match(row.statusText, /Hold point: the steps that rely on it do not start/);
  const formRef = form.references.find((item) => item.label === 'Formwork design');
  assert.equal(formRef.text, 'Hold point: the formwork design is not issued yet, so the steps that rely on it do not start until it is issued and this SWMS is updated.');
  const props = form.references.find((item) => /Temporary support/.test(item.label));
  assert.match(props.text, /not issued yet: update this SWMS when it is issued/);
  assert.equal(form.designs.find((item) => item.id === 'propping').statusText, 'Not issued yet. Update this SWMS when it is issued.');
  const pour = prepareDraft(ownFacts(POUR));
  assert.equal(pour.designs.find((item) => item.id === 'formwork').statusText, 'Not issued yet. Update this SWMS when it is issued.');
  const pourRef = pour.references.find((item) => item.label === 'Formwork design');
  assert.equal(pourRef.text, 'The formwork design is not issued yet. Update this SWMS when it is issued.');
  assert.ok(!pour.jobSteps.some((step) => step.controls.some((line) => /^Hold point/.test(line))));
});

// ---- 6. Wrong-context steps, lines, plant and licences ----

test('B run 7: removal words tick no install steps, the strip out and roof stripping print their own lines, no rock breaking or chainsaw', () => {
  const draft = draftOf(DEMO);
  const list = names(draft);
  for (const name of ['Lay floor coverings', 'Install suspended grid ceilings', 'Fix new roofing', 'Set up roof access', 'Install roof edge protection', 'Lift materials to and from the roof', 'Strip out the room', 'Break rock with a hydraulic hammer']) assert.ok(!list.includes(name), `${name}: ${list.join(' | ')}`);
  for (const name of ['Strip out ceilings, partitions and floor coverings', 'Remove old roofing', 'Demolish the structure', 'Use an elevating work platform', 'Use mobile scaffolds']) assert.ok(list.includes(name), `${name}: ${list.join(' | ')}`);
  const roofing = stepNamed(draft, 'Remove old roofing').controls.join('\n');
  assert.doesNotMatch(roofing, /before new sheets go on|crawl boards|purlin lines/);
  // The asbestos was removed, with a clearance, before the crew starts: no asbestos cement sheet lines (seen in the content16 browser run).
  assert.doesNotMatch(roofing, /Asbestos cement/);
  assert.ok(!plantOf(draft).includes('Chainsaw'), plantOf(draft).join(' | '));
  assert.ok(before(list, 'Use mobile scaffolds', 'Strip out ceilings, partitions and floor coverings') && before(list, 'Use an elevating work platform', 'Remove old roofing'), list.join(' | '));
  // A reroof that strips and replaces keeps its new roofing.
  const reroof = draftOf({ state: 'vic', fallRisk: 'yes', crane: 'own', task: 'reroof the warehouse, strip old corugated iron n replace with new colorbond trimdek sheets n flashings, new box gutter with torch on membrane, roof is about 7m high. scafold round the edge is by the builder. we use our hiab to lift the sheets up', site: { liveServices: 'power to the building', publicInterface: 'none', otherTrades: 'electricians', ground: 'concrete yard', access: 'scaffold stair' } }, { craneChart: 'hiab chart 1.2t at 8m', groundBearing: 'the builders site manager checked the yard slab for the hiab, we use 600mm outrigger pads' });
  assert.ok(names(reroof).includes('Fix new roofing'), names(reroof).join(' | '));
});

test('A run 4: scaffold ties into a brick wall mix no mortar, and the painters the scaffold is for bring no paint', () => {
  const draft = draftOf(SCAFFOLD);
  assert.ok(!names(draft).includes('Mix mortar'), names(draft).join(' | '));
  assert.ok(!rules.SUBSTANCES[0][1].test('for the roofers and painters'));
  assert.ok(rules.SUBSTANCES[0][1].test('paint the handrails'));
});

test('A run 1: control joints print no slab removal lines or plant, the pour lists no generator or compressor as used, and a crane company holds the crane licence', () => {
  const saw = draftOf({ ...FORMWORK, kinds: ['formwork', 'sawCut'] });
  assert.doesNotMatch(lines(saw), /lifted out with an excavator or bobcat|No one is near the bucket/);
  assert.ok(!plantOf(saw).includes('Excavator'));
  const pour = draftOf(POUR);
  for (const item of ['Generator', 'Air compressor']) assert.ok(!plantOf(pour).includes(item), plantOf(pour).join(' | '));
  assert.ok(plantOf(pour).includes('Concrete vibrator'));
  const lifted = draftOf({ ...FORMWORK, task: `${FORMWORK.task} Crane lift formwork and props with the mobile crane.`, plantChoice: { used: ['Mobile crane or crane truck', 'Power trowel', 'Electric power tools and leads'], notUsed: [], added: [] } });
  assert.ok(!lifted.qualifications.some((line) => /mobile crane/i.test(line)), lifted.qualifications.join(' | '));
  assert.match(lifted.plant.find((item) => item.item === 'Mobile crane or crane truck').licence, /^Held by the crane company's operator/);
  assert.ok(!highRiskMatches('Leads damaged by water or concrete.', 'no', { id: 'nsw' }).some((item) => item.check === 'water'));
});

test('A run 3: fans and ventilation plant print no refrigerant licence or release; split systems do, and ask the refrigerant', () => {
  const plain = draftOf({ ...MECH, kinds: ['ductwork', 'mechInsulation', 'plantLift'] });
  assert.doesNotMatch(lines(plain), /Refrigerant connections/);
  assert.ok(!plain.qualifications.some((line) => /Refrigerant/.test(line)));
  const split = { ...MECH, task: `${MECH.task} Install split systems to the offices.`, kinds: ['ductwork', 'mechInsulation', 'plantLift'] };
  const body = bodyOf(split);
  const draft = prepareDraft(body);
  assert.match(lines(draft), /Refrigerant connections are made only by the holder/);
  assert.ok(require('../substances').typeItems(draft, body).some((item) => item.type === 'Refrigerants'));
});

test('B run 6: trims and mouldings hang no doors, an own step\'s scaffold is the mobile scaffold, and the furring drilled into concrete is stepped', () => {
  const tower = draftOf(pkg(TOWER));
  assert.ok(!names(tower).includes('Hang the doors'), names(tower).join(' | '));
  assert.ok(names(tower).includes('Drill or cut concrete, masonry or stone'), names(tower).join(' | '));
  const ceilings = draftOf({ ...CEILINGS, ownSteps: [{ name: 'install acoustic baffles in ceiling spaces', hazards: ['fall from the scaffold'], controls: ['work from the scaffold with guardrails'] }] });
  assert.ok(!plantOf(ceilings).includes('Scaffold'), plantOf(ceilings).join(' | '));
  assert.ok(!plantOf(ceilings).includes('Elevating work platform'), plantOf(ceilings).join(' | '));
});

// ---- 7. Own steps where their work is ----

test('own steps go where their work is: stairs with the forming, the loading bay with the scaffold, baffles before the sheets, setting after them', () => {
  const stairs = draftOf({ ...FORMWORK, ownSteps: [{ name: 'Form up the stairs and landings', hazards: ['Fall from the stair void'], controls: ['Edge protection around the stair void'] }] });
  assert.ok(before(names(stairs), 'Form up the stairs and landings (Our own step)', 'Inspect before the pour'), names(stairs).join(' | '));
  const bay = draftOf({ ...SCAFFOLD, ownSteps: [{ name: 'build the loading bay for the roof sheets', hazards: ['bay overloaded and collapses'], controls: ['loading bay built to the supplier design with gate and toe boards'] }] });
  assert.ok(before(names(bay), 'Erect the scaffold', 'build the loading bay for the roof sheets (Our own step)') && before(names(bay), 'build the loading bay for the roof sheets (Our own step)', 'Dismantle the scaffold'), names(bay).join(' | '));
  const ceilings = draftOf({ ...CEILINGS, kinds: ['ceilingGrid', 'plasterCeiling', 'mobileScaffold'], ownSteps: [
    { name: 'set sand and finish ceiling joints and shadowline trims', hazards: ['dust from sanding'], controls: ['sand with an extraction sander'] },
    { name: 'install acoustic baffles in ceiling spaces', hazards: ['strain working overhead'], controls: ['two people lift each baffle'] }] });
  const list = names(ceilings);
  assert.ok(before(list, 'Install suspended grid ceilings', 'install acoustic baffles in ceiling spaces (Our own step)') && before(list, 'install acoustic baffles in ceiling spaces (Our own step)', 'Fix ceiling sheets'), list.join(' | '));
  assert.ok(before(list, 'Fix ceiling sheets', 'set sand and finish ceiling joints and shadowline trims (Our own step)'), list.join(' | '));
});

// ---- 8. No false item ----

test('A run 1: "Possible night pours" and the builder\'s hours are not work with no job steps', () => {
  const draft = draftOf({ ...FORMWORK, kinds: ['formwork'], unmatched: ['Possible night pours', 'Hours for night pours, if required: to be determined by the builder', 'Erect and strip formwork and propping to in situ concrete stairs and landings'] });
  assert.ok(!(draft.notCovered || []).some((part) => /night pours/i.test(part)), JSON.stringify(draft.notCovered));
  assert.ok((draft.notCovered || []).some((part) => /stairs and landings/i.test(part)));
});

// ---- 9. Add a step finds steps by their own names ----

test('B run 6: Add a step finds "Set the joints" and "Sand the joints" by their names, by "setting" and by "plasterboard"', () => {
  for (const query of ['set the joints', 'sand the joints', 'setting', 'plasterboard']) assert.ok(searchSteps(query).slice(0, 4).includes('plasterSanding'), `${query}: ${searchSteps(query).slice(0, 6).join(', ')}`);
  // Picked by hand for a task whose words do not name the plasterboard, its steps all print.
  const picked = draftOf({ ...CEILINGS, task: 'Install suspended grid ceilings and coffered bulkheads.', kinds: ['ceilingGrid', 'plasterSanding'] });
  assert.ok(names(picked).includes('Set the joints') && names(picked).includes('Sand the joints'), names(picked).join(' | '));
});

// ---- 10. Products in their step ----

test('products go to the step that uses them: concrete not to the pour watch, resin to the terminations, conduit cement to the rough-in, duct sealant to the ductwork, compound to the setting', () => {
  const steps = (list) => asSteps(list);
  assert.equal(rules.stepOf({ type: 'Cement, concrete, grout and mortar', product: 'Premixed concrete' }, steps(['Before starting', 'Monitor the formwork during the pour', 'Finish concrete', 'Finish and clean up'])), 'Finish concrete');
  assert.equal(rules.stepOf({ type: 'Cement, concrete, grout and mortar', product: 'Premixed concrete' }, draftOf(pkg(FORMWORK)).jobSteps), 'Finish concrete');
  assert.equal(rules.stepOf({ type: 'Epoxy, resins and two-part products', product: 'Two-part cable jointing resin' }, steps(['Before starting', 'Install cable tray and containment', 'Prepare and terminate the high voltage cables', 'Finish and clean up'])), 'Prepare and terminate the high voltage cables');
  assert.equal(rules.stepOf({ type: 'PVC primer and solvent cement', product: 'PVC conduit solvent cement' }, steps(['Before starting', 'Install cable tray and containment', 'Rough-in', 'Finish and clean up'])), 'Rough-in');
  assert.equal(rules.stepOf({ type: 'Sealants, mastics and silicone', product: 'Duct joint sealant' }, steps(['Before starting', 'Install ductwork', 'Insulate ductwork and pipework', 'Finish and clean up'])), 'Install ductwork');
  assert.equal(rules.stepOf({ type: 'Plaster, jointing and setting compounds', product: 'Jointing compound' }, steps(['Before starting', 'Fix ceiling sheets', { step: 'set sand and finish ceiling joints (Our own step)', own: true, hazards: [], controls: [] }, 'Finish and clean up'])), 'set sand and finish ceiling joints (Our own step)');
  assert.equal(rules.stepOf({ type: 'Adhesives', product: 'Cornice adhesive' }, steps(['Before starting', 'Set the joints', 'Fix skirting and architraves', 'Finish and clean up'])), 'Fix skirting and architraves');
  const draft = draftOf(RISERS, { safetyDataSheet: 'Brazing flux and MAPP gas: leather gloves and a face shield, cylinders upright and chained, safety data sheets in the ute.' });
  const holding = draft.jobSteps.filter((step) => step.controls.some((line) => /MAPP gas/.test(line))).map((step) => step.step);
  assert.deepEqual(holding, ['Braze and solder pipe joints (hot work)']);
});

// ---- 12. SiteWrite's check and ratings ----

test('the check: an annexe demolished whole is not "kept", a trench fall asks for the trench edge check, and an unticked water cart is not named', () => {
  const demo = checked(draftOf(DEMO), 'act');
  assert.ok(!demo.findings.some((item) => /the task keeps the structure/.test(item.message || '')));
  const drains = checked(draftOf(DRAINS), 'nt');
  assert.ok(!drains.findings.some((item) => /the scaffold tag, the EWP pre-start/.test(item.message || '')), JSON.stringify(drains.findings.filter((item) => item.rule === 'W13')));
  const body = bodyOf({ ...DRAINS, plantChoice: { used: ['Excavator', 'Roller or plate compactor', 'Trench shield or shoring'], notUsed: ['Water cart'], added: [] } });
  const draft = prepareDraft(body);
  const need = rules.notUsedNeed('Fuels (diesel, petrol)', 'we fill the excavator at the yard', rules.ownWords(body), rules.stepWords(draft), '', '', draft);
  assert.doesNotMatch(need, /water cart/i);
});

test('ratings: a delivery step kept to its zone with people kept clear, and the skip step with its exclusion zone, are not High after controls', () => {
  const draft = draftOf({ ...FORMWORK, ownSteps: [{ name: 'Unload deliveries at the loading zone', hazards: ['Truck or forklift hits a worker or the public', 'Load falls while unloading'], controls: ['Deliveries booked with the builder and unloaded only in the loading zone', 'Spotter keeps people clear of the truck and forklift', 'Loads checked as secure before straps come off'] }] });
  assert.notEqual(stepNamed(draft, 'Unload deliveries at the loading zone (Our own step)').risk.after.level, 'High');
  const demo = draftOf(DEMO);
  assert.notEqual(stepNamed(demo, 'Load skips and bins').risk.after.level, 'High');
});

// ---- 13. Wording ----

test('wording: a package is titled by its work, not by two of its ten activities, and the load limits example fits a job with no deck', () => {
  const rows = ['Install HV cabling and connect it into the existing HV network', 'Install LV and ELV cabling, consumer mains, submains and final sub-circuits', 'Terminate, joint and test cables', 'Install HV, LV and communications earthing, earth grids, earth stakes and surge protection connections', 'Provide and run temporary standby generators during cutover works and commissioning', 'Install the energy metering system and connect it to hydraulic water and gas meters', 'Carry out electrical isolation and lock out', 'Install AVRS power, control and monitoring cabling, and underground conduits'];
  const reading = { activities: [...rows.map((activity) => ({ package: 'Electrical', activity, crew: 'Electricians', type: 'Activity' })), { package: 'Trade installation: gatehouse', activity: 'Install power and lighting to the gatehouse', crew: 'Electricians', type: 'Activity' }, { package: 'Trade installation: gatehouse', activity: 'Install the gatehouse data outlets', crew: 'Electricians', type: 'Activity' }], packages: [] };
  const titles = packageTitles(reading);
  for (const title of Object.values(titles)) assert.doesNotMatch(title, /Terminate, joint and test cables and carry out/);
  const item = questionsFor({ ...SITE, ...MECH, task: `${MECH.task} AHUs lifted onto the level 4 slab.` }).required.find((one) => one.id === 'loadLimits');
  if (item) assert.doesNotMatch(helpText(item), /formwork deck/);
  assert.doesNotMatch(helpText({ id: 'loadLimits', prompt: 'The allowable loads on each floor or slab the loads are moved or stacked on.' }), /formwork deck/);
  assert.match(helpText({ id: 'loadLimits', prompt: 'The allowable loads on the formwork deck and on each slab.' }), /formwork deck/);
});

// ---- 14. The SiteLink run ----

test('SiteLink: cabling to the gas meters and UPS power to the gas valves is not gas piping; cast-in conduits ask no formwork design or load limits', () => {
  const task = 'Install energy metering system and cabling to hydraulic water and gas meters. Carry out electrical isolation and lock out. Install additional UPS power supplies to MSSBs and gas shut-off valves.';
  assert.ok(!highRiskMatches(task, 'no', { id: 'qld' }).some((item) => item.check === 'gas'));
  const fitout = { state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Cast in conduits, sleeves and fixings into formwork and slabs on site. Install cable tray, conduits and wiring in all buildings.' };
  const asked = questionsFor({ ...SITE, ...fitout }).required.map((item) => item.id);
  assert.ok(!asked.includes('formworkDesign') && !asked.includes('loadLimits'), asked.join(', '));
  // A crew that builds the formwork is still asked.
  assert.ok(questionsFor({ ...SITE, ...FORMWORK }).required.some((item) => item.id === 'formworkDesign'));
});

test('SiteLink: a generator installed with a crane company has the crane crew and connection steps; a crane lift to the roof in the access answer brings the lift', () => {
  const generator = draftOf({ state: 'qld', fallRisk: 'yes', crane: 'company', task: 'Install 11kV containerised generator with day tank, exhaust and battery charger.' });
  assert.ok(names(generator).includes('Work with the crane crew during lifts'), names(generator).join(' | '));
  assert.ok(names(generator).includes('Connect and commission'), names(generator).join(' | '));
  const none = draftOf({ state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Install 11kV containerised generator with day tank, exhaust and battery charger.' });
  assert.ok(!names(none).includes('Work with the crane crew during lifts'));
  const roof = { state: 'qld', fallRisk: 'yes', crane: 'company', task: 'Install lightning protection to buildings, poles and perimeter. Make roof penetrations and waterproof them.', kinds: ['roofPenetration', 'lightningProtection', 'ewp'], site: { access: 'Up to the roof by the builder\'s scaffold stair. Lightning protection gear is lifted to the roof by the crane company\'s mobile crane.' } };
  const draft = draftOf(roof);
  assert.ok(names(draft).includes('Lift equipment and materials to the roof'), names(draft).join(' | '));
  assert.ok(questionsFor({ ...SITE, ...roof, facts: { siteConditions: `Access: ${roof.site.access}` } }).steps.locked.includes('roofAccess'));
});
