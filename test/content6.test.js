// Content faults found by the messy-user test, round 6 on staging (15 October 2026, build 9269e10), each
// fixed by a general rule: every state's codes for the work, plant the user adds read as that plant,
// licences, the high risk work list, lines kept to their own work, the task's own steps and their order,
// "Not required" for products the steps use, a Fencing trade, and the builder check.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, suggestedKinds } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');
const { typeItems } = require('../substances');
const { gateChecks } = require('../download-gate');
const { agreePpe } = require('../step-ppe');

const SITE = { residential: 'no', company: 'Test', workplace: '12 Smith Street, Paddington', principalContractor: 'ABC Builders Pty Ltd', hospital: 'Royal Hospital', firstAider: 'Jo Smith', musterPoint: 'Front gate', worksManager: 'Sam Lee', worksManagerPhone: '0400 118 552', complianceResponsible: 'Sam Lee', reviewer: 'Sam Lee', date: '15 October 2026' };
function answered(input) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id]) continue;
      facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : ((answersFor(item.id, asked.task)[0] || {}).text || 'As set out in the site plan.').replace(/_{3,}/g, 'as on the site plan');
      added = true;
    }
    if (!added) break;
  }
  return { ...input, facts };
}
const bodyOf = (input) => draftBody(answered({ ...SITE, ...input }));
const draftOf = (input) => prepareDraft(bodyOf(input));
const names = (draft) => draft.jobSteps.map((step) => step.step);
const lines = (draft) => draft.jobSteps.flatMap((step) => [...step.hazards, ...step.controls]).join('\n');
const plantNames = (draft) => (draft.plantInferred || []).map((item) => item.item);
const ticked = (draft) => draft.ppe.flatMap((group) => group.items.filter((item) => item.ticked)).map((item) => item.id);
const before = (list, a, b) => list.indexOf(a) >= 0 && list.indexOf(b) >= 0 && list.indexOf(a) < list.indexOf(b);
const added = (...items) => ({ used: [], notUsed: [], added: items.map(([item, licence]) => ({ item, licence })) });

// ---- 1. Every state lists its codes of practice for common work ----

// Guard: the codes the work itself brings, in each state's own titles (messy round 6: NSW and Victorian
// SWMS for kitchens and flooring listed no code; only Queensland had the rule, the rest listed only the
// codes a printed line cites).
const STATE_CODE = { qld: /\(Qld\)/, nsw: /^SafeWork NSW Code of practice: /, vic: /^Compliance code: .*\(Vic\)$/, sa: /\(SA\)$/, wa: /\(WA\)$/, tas: /\(Tas\)$/, act: /\(ACT\)$/, nt: /\(NT\)$/ };
const COMMON_WORK = [
  'Install stainless steel benches, combi ovens and exhaust canopies in the commercial kitchen, and fix the canopies to the slab above.',
  'Lay sheet vinyl with heat welded joins and carpet tiles by direct stick, and skim the subfloor with levelling compound.',
  'Tile floors and walls to the bathrooms: lay the screed, membrane, cut tiles and grout.',
  'Install suspended ceilings and plasterboard partitions.',
  'Paint walls and ceilings.',
];
test('every state and territory lists its own codes of practice for common work', () => {
  for (const [state, own] of Object.entries(STATE_CODE)) {
    for (const task of COMMON_WORK) {
      const draft = draftOf({ state, fallRisk: 'no', crane: 'none', task });
      assert.equal(draft.kind, 'draft', `${state}: ${task}`);
      const codes = draft.sources.codes.filter((title) => !/^Australian Refrigeration Council/.test(title));
      assert.ok(codes.length > 0, `${state} lists no code for: ${task}`);
      for (const title of codes) assert.match(title, own, `${state}: ${title}`);
    }
  }
});

test('the NSW kitchen and Victorian flooring SWMS of round 6 list their codes', () => {
  const kitchen = draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'instal stainles steel benches, combi ovens, fryers and exhaust canopys in the comercial kitchen, lift canopys up to ceiling and fix to slab above' });
  assert.ok(kitchen.sources.codes.includes('SafeWork NSW Code of practice: Hazardous manual tasks (August 2019)'), kitchen.sources.codes.join('; '));
  const flooring = draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', task: '1. Installation of Vinyl. Allowing for heat weld to all joins and coving 100mm to ALL walls. 3. Supply and Install carpet tile, direct stick. 4. Preparation to skim subfloor 1mm.' });
  assert.ok(flooring.sources.codes.includes('Compliance code: Hazardous manual handling 2019 (Vic)'), flooring.sources.codes.join('; '));
  // A Victorian SWMS cites no other state's code.
  assert.ok(flooring.sources.codes.every((title) => /\(Vic\)$/.test(title)), flooring.sources.codes.join('; '));
});

// ---- 2. Plant the user adds is read as that plant ----

test('a HIAB the user adds brings its step, the CV licence and dogging, and a bare "No" licence is questioned', () => {
  const first = { state: 'nt', fallRisk: 'no', crane: 'none', kinds: ['siteEstablish'], task: 'Erect temporary fencing, hoardings and gates along the footpath.', plantChoice: added(['hiab truck', 'No']) };
  // Every item SiteWrite lists is ticked as used, so the plant's only need is the licence.
  const input = { ...first, plantChoice: { ...first.plantChoice, used: draftOf(first).plantInferred.map((item) => item.item) } };
  const draft = draftOf(input);
  assert.ok(names(draft).includes('Unload with the truck loading crane (hiab)'), names(draft).join('; '));
  assert.ok(draft.qualifications.some((name) => /^High risk work licence: vehicle loading crane \(hiab\) \(CV where the crane is rated at 10 metre-tonnes or more\)$/.test(name)), draft.qualifications.join('; '));
  assert.ok(draft.qualifications.includes('High risk work licence: dogging or rigging (DG, RB, RI or RA)'), draft.qualifications.join('; '));
  const row = draft.plant.find((item) => item.item === 'hiab truck');
  assert.match(row.licence, /^Yes \(CV\)/);
  const plant = gateChecks(bodyOf(input), draft).find((item) => item.kind === 'plant');
  assert.match(plant.need, /hiab truck: "No" is not enough for this plant\. A high risk work licence is needed: \(CV\) where the crane is rated at 10 metre-tonnes or more/);
  // A reason given with the "No" is the user's answer, and prints.
  const small = draftOf({ ...input, plantChoice: added(['hiab truck', 'No, it is under 10 metre-tonnes']) });
  assert.equal(small.plant.find((item) => item.item === 'hiab truck').licence, 'No, it is under 10 metre-tonnes');
  assert.ok(!small.qualifications.some((name) => /\(CV/.test(name)), small.qualifications.join('; '));
});

test('a MIG welder the user adds brings welding, the hot work permit and welding PPE, also with the PPE list sent', () => {
  const input = { state: 'sa', fallRisk: 'yes', crane: 'company', kinds: ['liftInstall', 'liftShaft'], task: 'Install the lift: set the lift rails, fix the landing doors, and build the lift car in the lift shaft. Our crew slings the loads.', plantChoice: added(['MIG welder for rail bracket welds', 'No']) };
  const draft = draftOf(input);
  assert.ok(names(draft).includes('Weld steel'), names(draft).join('; '));
  assert.match(lines(draft), /hot work permit/i);
  assert.ok(draft.sources.codes.includes('Welding processes Code of Practice 2024 (SA)'), draft.sources.codes.join('; '));
  // The page always sends its ticks: the welder's PPE is ticked all the same.
  const chosen = draftOf({ ...input, ppe: ['hardHat', 'glassesClear', 'gloveGeneral', 'hivis', 'boots', 'harness'] });
  assert.ok(ticked(chosen).includes('gloveWelding') && ticked(chosen).includes('filterEye'), ticked(chosen).join(','));
  // Shaft access is made safe before the drilling and welding in the shaft.
  assert.ok(before(names(draft), 'Work at open lift shafts and landing doors', 'Weld steel'), names(draft).join('; '));
});

test('a hammer drill, floor grinder or petrol pressure washer the user adds brings its step, silica controls and ear muffs', () => {
  const drill = draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'Install stainless steel benches and exhaust canopies in the commercial kitchen, and fix the canopies to the slab above.', plantChoice: added(['hammer drill', 'No']), ppe: ['hardHat', 'glassesClear', 'gloveCut', 'hivis', 'boots'] });
  assert.ok(names(drill).includes('Drill or cut concrete, masonry or stone'), names(drill).join('; '));
  assert.ok(drill.qualifications.some((name) => /^Crystalline silica training/.test(name)), drill.qualifications.join('; '));
  assert.ok(ticked(drill).includes('earMuffs'), ticked(drill).join(','));
  // Ear muffs the user unticked by hand stay off.
  const off = draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'Install stainless steel benches in the commercial kitchen.', plantChoice: added(['hammer drill', 'No']), ppe: ['hardHat', 'glassesClear', 'hivis', 'boots'], ppeOff: ['earMuffs'] });
  assert.ok(!ticked(off).includes('earMuffs'), ticked(off).join(','));
  const grinder = draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', task: 'Lay sheet vinyl and carpet tiles, and skim the subfloor with levelling compound.', plantChoice: added(['floor grinder', 'No']), ppe: ['hardHat', 'glassesClear', 'gloveGeneral', 'hivis', 'boots'] });
  assert.ok(names(grinder).includes('Prepare and grind floors'), names(grinder).join('; '));
  assert.ok(ticked(grinder).includes('earMuffs') && ticked(grinder).includes('p2'), ticked(grinder).join(','));
  assert.ok(grinder.qualifications.some((name) => /crystalline silica/i.test(name)), grinder.qualifications.join('; '));
  const washer = draftOf({ state: 'act', fallRisk: 'no', crane: 'none', trade: 'cleaning', task: 'Clean floors, fixtures and plant rooms, and wash down the external paved areas.', plantChoice: added(['Petrol pressure washer', 'No']), ppe: ['hardHat', 'glassesClear', 'gloveGeneral', 'hivis', 'boots'] });
  assert.ok(names(washer).includes('Pressure clean surfaces'), names(washer).join('; '));
  assert.ok(ticked(washer).some((id) => /^ear/.test(id)), ticked(washer).join(','));
});

test('plant a scope names that SiteWrite has no entry for is offered as plant; fixings are not', () => {
  const draft = draftOf({ state: 'act', fallRisk: 'no', crane: 'none', kinds: ['cleaning'], task: 'Clean floors, fixtures and plant rooms (whole building; plant: Vacuum cleaners, Wheelie bins, Dyna-bolts).' });
  const listed = draft.plantInferred.map((item) => `${item.item}${item.maybe ? '?' : ''}`);
  assert.ok(listed.includes('Vacuum cleaners?') && listed.includes('Wheelie bins?'), listed.join('; '));
  assert.ok(!listed.some((item) => /bolts/i.test(item)), listed.join('; '));
  // Work words after "plant:" in the task's own sentences are not plant.
  const boilers = draftOf({ state: 'act', fallRisk: 'no', crane: 'none', task: 'Hot water plant: install the boilers and hot water units, booster and circulating pumps and water tanks in the plant rooms, and install the flues.' });
  assert.ok(!(boilers.plantInferred || []).some((item) => /^(?:install|hot water units|booster)|boilers|flues/i.test(item.item)), JSON.stringify(boilers.plantInferred));
  assert.equal(boilers.kind, 'draft');
});

test('handling aids and the EWP a step method names are offered as plant', () => {
  const draft = draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', kinds: ['kitchenEquipment', 'coolroomPanels'], task: 'Install the commercial kitchen equipment and erect the coolroom panels.' });
  const listed = draft.plantInferred.map((item) => `${item.item}${item.maybe ? '?' : ''}`);
  assert.ok(listed.includes('Elevating work platform'), listed.join('; '));
  assert.ok(listed.includes('Trolley or panel lifter?'), listed.join('; '));
  const doors = draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', task: 'Install stainless steel door frames and hang the timber doors.' });
  assert.ok(plantNames(doors).includes('Trolley or panel lifter'), plantNames(doors).join('; '));
});

test('a router that cuts is a power tool; a network router is not', () => {
  const { plantFor } = require('../register');
  assert.deepEqual(plantFor('Door frames are cut out for strikes with a router.').map((item) => item.item), ['Electric power tools and leads']);
  assert.deepEqual(plantFor('Install the network routers and switches in the comms rack.').map((item) => item.item), []);
});

// ---- 3. Licences ----

test('loads lifted on chains, and a line that has a licensed dogger sling, bring the dogging licence', () => {
  const wall = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'build 1.8m high concrete sleeper retaining wall along rear boundary. dig post holes with 5t excavator, steel posts concreted in, lift sleepers in with the excavator and chains, cut sleepers with quick cut saw, ag drain and gravel backfill' });
  assert.ok(wall.qualifications.includes('High risk work licence: dogging or rigging (DG, RB, RI or RA)'), wall.qualifications.join('; '));
  // Cutting concrete sleepers is cutting concrete.
  assert.ok(names(wall).includes('Drill or cut concrete, masonry or stone'), names(wall).join('; '));
  assert.ok(wall.qualifications.some((name) => /^Crystalline silica training/.test(name)), wall.qualifications.join('; '));
  // A chain block is not lifting on chains.
  const block = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'Install the pump: lift it into the pit with the chain block on the lifting beam.' });
  assert.ok(!(block.plantInferred || []).some((item) => /^Lifting gear/.test(item.item)) || block.kind !== 'draft', JSON.stringify(block.plantInferred));
});

test('a step that has refrigeration connections made by a licence holder lists the refrigerant licence', () => {
  const draft = draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', kinds: ['coolroomPanels'], task: 'Erect the coolroom panels.' });
  assert.match(lines(draft), /Refrigeration connections are made only by the holder of a refrigerant handling licence/);
  assert.ok(draft.qualifications.includes('Refrigerant handling licence (ARC), where our crew makes the refrigeration connections'), draft.qualifications.join('; '));
  // The licence only where our crew makes the connections does not, alone, list refrigerant as a substance.
  assert.ok(!draft.substances.items.some((item) => item.product === 'Refrigerants'), JSON.stringify(draft.substances.items));
});

// ---- 4. High risk work read rightly ----

test('a lift pit depth in the site answers does not make the lift shaft an excavated shaft', () => {
  const draft = draftOf({ state: 'sa', fallRisk: 'yes', crane: 'company', kinds: ['liftInstall', 'liftShaft'], task: 'Install the lift: set the lift rails, fix the landing doors, and build the lift car and counterweight in the lift shaft.', site: { liveServices: 'Temporary power to the shaft lighting. No other live services in the shaft.', publicInterface: 'None.', otherTrades: 'Electricians on the landings.', ground: 'Suspended slabs. Lift pit is dry and 1.6 m deep.', access: 'From the shaft platform.' } });
  assert.ok(!draft.highRisk.some((item) => /shaft or trench/.test(item)), draft.highRisk.join('; '));
  assert.doesNotMatch(lines(draft), /No digging starts until an excavation permit/);
  assert.ok(!draft.emergency.some((row) => row.type === 'Trench'), draft.emergency.map((row) => row.type).join('; '));
  // A pit that is dug still counts.
  const dug = draftOf({ state: 'sa', fallRisk: 'no', crane: 'none', task: 'Excavate the stormwater pit 2.2 m deep and lay the pipes.' });
  assert.ok(dug.highRisk.some((item) => /shaft or trench/.test(item)), dug.highRisk.join('; '));
});

const CLEAN = 'Wipe bench tops and shelves. Vacuum and sweep floors, mop and polish tile surfaces. Clean toilets, basins, sinks and bathroom hardware. Wipe down and clean light fittings including inside of glass. Clean windows and glazing including removal of paint, mortar tags and render. Sweep and wash the internal site roads, never on the public road. The traffic controller stops site vehicles on the road section being cleaned.';
test('a builders clean is not silica processing, a traffic corridor, or electrical and plumbing work', () => {
  const draft = draftOf({ state: 'act', fallRisk: 'no', crane: 'none', kinds: ['cleaning', 'cleaningHeight', 'wasteRemoval'], task: CLEAN });
  assert.deepEqual(draft.highRisk, []);
  const start = draft.jobSteps.find((step) => step.step === 'Before starting').controls.join('\n');
  assert.doesNotMatch(start, /licensed electricians|plumbers licensed|Backflow prevention/);
  // Polishing concrete and a public road still count.
  const polish = draftOf({ state: 'act', fallRisk: 'no', crane: 'none', task: 'Grind and polish the concrete floor with a ride-on grinder.' });
  assert.ok(polish.highRisk.some((item) => /silica/.test(item)), polish.highRisk.join('; '));
  const road = draftOf({ state: 'act', fallRisk: 'no', crane: 'none', kinds: ['cleaning'], task: 'Clean floors and fixtures. Sweep the kerb and channel on the road outside the site.' });
  assert.ok(road.highRisk.some((item) => /traffic corridor/.test(item)), road.highRisk.join('; '));
});

test('"ballast them for wind" is not rail work; track ballast still is', () => {
  const fence = draftOf({ state: 'nt', fallRisk: 'no', crane: 'none', kinds: ['siteEstablish'], task: 'Erect temporary fencing, hoardings and gates: set out, deliver and erect fence panels, shade cloth and solid hoardings, ballast them for wind, and move them as the work stages change.' });
  const check = checkSwms(fromDraft(fence));
  assert.doesNotMatch(JSON.stringify(check.findings), /rail manager/);
  const rail = draftOf({ state: 'nt', fallRisk: 'no', crane: 'none', task: 'Renew the ballast and tamp the track.' });
  if (rail.kind === 'draft') assert.match(JSON.stringify(checkSwms(fromDraft({ ...rail, jobSteps: rail.jobSteps.map((step) => ({ ...step, controls: step.controls.filter((line) => !/\b(access authority|possessions?|track (?:access|closure|occupancy)|worksite protection|protection officer|rail access)\b/i.test(line)) })) })).findings), /rail manager/);
});

// ---- 5. Lines kept to their own work ----

test('carpet tile adhesive is not repeated beside the sheet floor adhesive line', () => {
  const both = draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', task: 'Lay sheet vinyl with heat welded seams and carpet tiles by direct stick.' });
  assert.doesNotMatch(lines(both), /^Tile adhesive is used as its safety data sheet sets out\./m);
  const tiles = draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', task: 'Lay carpet tiles by direct stick in the offices.' });
  assert.match(lines(tiles), /Tile adhesive is used as its safety data sheet sets out\./);
});

test('materials handling for a doors package is about doors, not sheets, studs and balconies', () => {
  const draft = draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', trade: 'doors', kinds: ['carpLoad'], task: 'Accept delivery, unload and handle materials on site.' });
  const step = draft.jobSteps.find((item) => item.step === 'Move materials into place');
  assert.deepEqual(step.hazards, ['Strain handling heavy doors.']);
  assert.doesNotMatch(step.controls.join('\n'), /balconies/);
  const general = draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', kinds: ['carpLoad'], task: 'Accept delivery, unload and handle materials on site.' });
  assert.match(general.jobSteps.find((item) => item.step === 'Move materials into place').hazards.join('\n'), /sheets, studs/);
});

test('a concrete sleeper wall is not a formed wall, and its cut is not trenching', () => {
  const kinds = suggestedKinds('Concrete sleeper retaining wall 1.8m high on the rear boundary: excavate the cut and dig post holes with a 5t excavator, concrete in steel posts, lift sleepers in with the excavator and chains, ag drain and gravel backfill.', {}, { id: 'qld' });
  assert.ok(kinds.includes('retainingWall') && !kinds.includes('concreteWall') && !kinds.includes('trench'), kinds.join(', '));
  assert.ok(suggestedKinds('Concrete retaining wall 1.8m high: form, fix reo and pour.', {}, { id: 'qld' }).includes('concreteWall'));
});

test('"no welding" in the task leaves out the welder, the hot work permit, the Welding code and brazing', () => {
  const draft = draftOf({ state: 'tas', fallRisk: 'no', crane: 'none', kinds: ['trench', 'pressureTest', 'castInGround'], task: 'Water mains: excavate the trench, lay PE and PVC mains, butt and electrofusion weld the pipe, form and pour the concrete thrust blocks in the trench, and pressure test the main. our job is 300 DICL on the bass hwy with rubber ring joints, no welding, trentch 1.8m' });
  assert.ok(!plantNames(draft).includes('Welder'), plantNames(draft).join('; '));
  assert.doesNotMatch(lines(draft), /hot work permit/i);
  assert.ok(!draft.sources.codes.some((title) => /Welding/.test(title)), draft.sources.codes.join('; '));
  const asked = questionsFor({ ...SITE, state: 'tas', fallRisk: 'no', crane: 'none', task: draft.task });
  assert.ok(!asked.steps.suggested.includes('hotWork'), asked.steps.suggested.join(', '));
  // Thrust blocks: no wall forms with a platform along the top, and poured before the backfill.
  assert.doesNotMatch(lines(draft), /Wall forms are built and braced to their design/);
  assert.ok(before(names(draft), 'Form, fix reo and pour concrete in the excavation', 'Backfill the trench'), names(draft).join('; '));
});

test('hoardings are not a scaffolder\'s, and the compactor line needs compaction', () => {
  const draft = draftOf({ state: 'nt', fallRisk: 'no', crane: 'none', kinds: ['siteEstablish', 'smallPlant'], task: 'Erect temporary fencing and solid hoardings along the footpath, bobcat auger for posts.' });
  const hoardings = draft.jobSteps.find((step) => step.step === 'Erect the hoardings');
  assert.notEqual(hoardings.responsible, 'Licensed scaffolder');
  assert.doesNotMatch(lines(draft), /Plate compactor operators wear personal hearing protectors/);
});

test('falls answered No: a line naming a harness or EWP as one way up brings no work at height row', () => {
  const draft = draftOf({ state: 'act', fallRisk: 'no', crane: 'none', kinds: ['cleaning', 'cleaningHeight'], task: 'Clean floors and fixtures, and clean the windows from inside.' });
  assert.ok(!draft.emergency.some((row) => row.type === 'Work at height'), draft.emergency.map((row) => row.type).join('; '));
});

test('"No harness is used" does not tick a harness', () => {
  const draft = { kind: 'draft', jobSteps: [{ step: 'Before starting', hazards: ['x'], controls: ['y'] }, { step: 'Use mobile scaffolds', hazards: ['A fall from the platform.'], controls: ['No harness is used. Work is only from the mobile scaffold platform inside its guardrails.'] }], ppe: [{ area: 'Falls', items: [{ id: 'harness', label: 'Full body harness', ticked: false }] }] };
  assert.equal(agreePpe(draft).ppe[0].items[0].ticked, false);
});

// ---- 6. The task's own work, in order ----

test('an auger named for posts brings the hole digging step', () => {
  const kinds = suggestedKinds('Erect temporary fencing and hoardings along the footpath, bobcat auger for posts.', {}, { id: 'nt' });
  assert.ok(kinds.includes('footingHoles'), kinds.join(', '));
  const draft = draftOf({ state: 'nt', fallRisk: 'no', crane: 'none', kinds: ['siteEstablish'], task: 'Erect temporary fencing and hoardings.', plantChoice: added(['post hole auger', 'No']) });
  assert.ok(names(draft).includes('Dig footing holes'), names(draft).join('; '));
});

test('a retaining wall is built before the drainage and backfill behind it', () => {
  const draft = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', kinds: ['retainingWall', 'wallDrainage', 'smallPlant', 'carpLoad'], task: 'Concrete sleeper retaining wall: dig post holes, stand the posts, lift the sleepers in, ag drain and gravel backfill.' });
  assert.ok(before(names(draft), 'Build the retaining wall', 'Install drainage behind the retaining wall'), names(draft).join('; '));
  assert.ok(before(names(draft), 'Build the retaining wall', 'Backfill behind the retaining wall'), names(draft).join('; '));
  // Typed with no steps picked, the ag drain brings the drainage step, and nothing is left with no steps.
  const typed = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'build 1.8m high concrete sleeper retaining wall along rear boundary. dig post holes with 5t excavator, steel posts concreted in, lift sleepers in with the excavator and chains, cut sleepers with quick cut saw, ag drain and gravel backfill' });
  assert.ok(before(names(typed), 'Build the retaining wall', 'Install drainage behind the retaining wall'), names(typed).join('; '));
  assert.deepEqual(typed.notCovered, []);
});

test('an access equipment package from a cleaning scope has the cleaning work at height', () => {
  const draft = draftOf({ state: 'act', fallRisk: 'no', crane: 'none', trade: 'cleaning', task: 'Work from mobile scaffolds.' });
  assert.ok(names(draft).includes('Use mobile scaffolds') && names(draft).includes('Clean windows and balconies'), names(draft).join('; '));
  const plain = draftOf({ state: 'act', fallRisk: 'no', crane: 'none', task: 'Work from mobile scaffolds.' });
  assert.ok(!names(plain).includes('Clean windows and balconies'), names(plain).join('; '));
});

// ---- 7. "Not required" with a reason where the steps use the product ----

test('"Not required" needs a reason where a step\'s lines use the product or plant uses fuel, and an SDS answer naming it conflicts', () => {
  const need = (input) => {
    const draft = draftOf(input);
    const types = draft.substances.items.map((item) => item.product);
    return Object.fromEntries(typeItems(draft, bodyOf({ ...input, substancesNotUsed: types, ...(input.why ? { substancesNotUsedWhy: input.why } : {}) })).map((item) => [item.type, item.need]));
  };
  const floor = need({ state: 'vic', fallRisk: 'no', crane: 'none', task: 'Lay sheet vinyl with heat welded seams. Skim the subfloor 1mm.' });
  assert.match(floor['Cement, concrete, grout and mortar'] || '', /the job steps name "Cement"/);
  const coolroom = need({ state: 'nsw', fallRisk: 'no', crane: 'none', kinds: ['coolroomPanels'], task: 'Erect the coolroom panels.' });
  assert.match(coolroom['Sealants, mastics and silicone'] || '', /the job steps name/);
  const saw = need({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'Build a concrete sleeper retaining wall, digging the post holes with a 5t excavator.', plantChoice: added(['petrol quick cut saw', 'No']) });
  assert.match(saw['Fuels (diesel, petrol)'] || '', /name "petrol"/);
  const doors = need({ state: 'wa', fallRisk: 'no', crane: 'none', task: 'Install stainless steel door frames. Seal: paint bottoms of doors before hanging.', facts: { safetyDataSheet: 'The products used are Sikaflex 11FC sealant, door bottom primer' }, why: { 'Sealants, mastics and silicone': 'supplied and applied by others' } });
  assert.match(doors['Sealants, mastics and silicone'] || '', /your safety data sheet answer names "sealant" as a product used, but it is ticked "Not required"/);
});

// ---- 8. A Fencing trade in the pick list ----

test('the pick list has a Fencing and gates trade, each task with library steps', () => {
  const lists = require('../pick-lists.json');
  const fencing = lists.trades.find((trade) => trade.id === 'fencing');
  assert.ok(fencing, 'no fencing trade');
  assert.equal(fencing.name, 'Fencing and gates');
  assert.deepEqual(fencing.tasks.map((task) => task.kinds), [['siteEstablish'], ['fenceBuild'], ['fenceRemove', 'fenceBuild']]);
  for (const task of fencing.tasks) {
    const draft = draftOf({ state: 'nt', fallRisk: task.fallRisk, crane: task.crane, kinds: task.kinds, task: task.task });
    assert.equal(draft.kind, 'draft', task.title);
  }
});

// ---- 9. Builder check ----

test('the builder check reads the hoarding design where the hoardings carry shade cloth', () => {
  const draft = draftOf({ state: 'nt', fallRisk: 'no', crane: 'none', kinds: ['siteEstablish'], task: 'Erect temporary fencing and solid hoardings with shade cloth along the footpath.' });
  assert.ok((draft.designs || []).some((row) => row.id === 'hoarding'), JSON.stringify(draft.designs));
  const w16 = checkSwms(fromDraft(draft)).findings.find((item) => item.rule === 'W16');
  assert.doesNotMatch(w16.message, /No step relies on an engineer's/);
});

// ---- Found in the browser runs of this build ----

test('plant the user added is not listed again under SiteWrite\'s own name, and "where one is used" is said once', () => {
  const draft = draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', task: 'Lay sheet vinyl and skim the subfloor.', plantChoice: added(['floor grinder', 'No']) });
  assert.ok(names(draft).includes('Prepare and grind floors'), names(draft).join('; '));
  assert.ok(!plantNames(draft).includes('Floor grinder with H class extraction'), plantNames(draft).join('; '));
  const doors = draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', task: 'Install stainless steel door frames and hang the timber doors.' });
  assert.ok(doors.plant.every((item) => !/where one is used, where one is used/.test(item.licence)), doors.plant.map((item) => item.licence).join('; '));
});

test('thrust blocks poured in the trench do not bring the pump, placing and finishing steps', () => {
  const kinds = suggestedKinds('Water mains: excavate the trench, lay the mains, form and pour the concrete thrust blocks in the trench, and pressure test the main.', {}, { id: 'tas' });
  assert.ok(kinds.includes('castInGround') && !kinds.includes('concrete'), kinds.join(', '));
  assert.ok(suggestedKinds('Form and pour the concrete slab and the thrust blocks.', {}, { id: 'tas' }).includes('concrete'));
});

test('the step picker names a kind\'s steps without the ones for another variant of the work', () => {
  const { stepLibrary } = require('../steps');
  const wall = stepLibrary().groups.flatMap((group) => group.kinds).find((kind) => kind.id === 'retainingWall');
  assert.deepEqual(wall.steps, ['Build the retaining wall']);
});
