// Content faults found by the messy-user test, round 5 on staging (15 October 2026, build 4bb088f), each
// fixed by a general rule: the task's own work gets its steps and plant, wrong-trade and wrong-context
// steps and lines are left out (library wording unchanged, D181), the high risk work list, licences, PPE,
// hazardous products, the order of the steps and the builder check.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, suggestedKinds, packageKinds } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');
const rules = require('../public/substance-rules');
const { typeItems } = require('../substances');
const { splitPpe } = require('../step-ppe');

const SITE = { residential: 'no', company: 'Test', workplace: '12 Smith Street, Paddington QLD 4064', principalContractor: 'ABC Builders Pty Ltd', hospital: 'Royal Brisbane', firstAider: 'Jo Smith', musterPoint: 'Front gate', worksManager: 'Sam Lee', worksManagerPhone: '0400 118 552', complianceResponsible: 'Sam Lee', reviewer: 'Sam Lee', date: '15 October 2026' };
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
const draftOf = (input) => prepareDraft(draftBody(answered({ ...SITE, ...input })));
const names = (draft) => draft.jobSteps.map((step) => step.step);
const lines = (draft) => draft.jobSteps.flatMap((step) => [...step.hazards, ...step.controls]).join('\n');
const plantNames = (draft) => (draft.plantInferred || []).map((item) => item.item);
const ticked = (draft) => draft.ppe.flatMap((group) => group.items.filter((item) => item.ticked)).map((item) => item.id);
const before = (list, a, b) => list.indexOf(a) >= 0 && list.indexOf(b) >= 0 && list.indexOf(a) < list.indexOf(b);

const ACCESS = 'Access control: install card readers, door controllers, electric strikes, mortice and magnetic locks and door hubs, drill and rout the doors and frames, and cut the steel frames. Levels 2 and 3 of an office fitout, cable in the ceiling from a ladder.';
const BRIDGE = 'bridge deck replacement over the creek, remove old concrete deck and barriers, crane in new precast planks, form and pour stich pour and new barriers';
const TREES = 'Advanced tree planting: excavate the tree pit next to the road, lift the large root ball trees in with a crane truck, plant and stake the trees. Six advanced trees in 400 L root balls along the Smith St Mall footpath, pits dug with a 5 t excavator, trees lifted by our own vehicle loading crane (HIAB) operated by our crew.';
const TREE_SITE = { liveServices: 'Street lighting cables and telecommunications pits under the footpath.', publicInterface: 'Pedestrians in the mall, held by a traffic controller during each lift.', otherTrades: 'None nearby.', ground: 'Paved footpath over clay. Tree pits about 1.2 m deep, battered back, fenced when open.', access: 'From Smith St under the traffic management plan.' };
const TREE_FACTS = { craneChart: 'Rated capacity from the crane chart: 1.6 t at 6 m radius. Heaviest gross load is 1.1 t at 5.5 m radius.', groundBearing: 'Our supervisor checked the footpath design with the council; outriggers on 600 x 600 mm timber pads.' };
const POOL_FINISH = 'Clean, grind and prepare concrete pool surface. Install pool shell waterproofing membrane. Skim coat and screed concrete pool surface. Apply pebble aggregate finish to swimming pool. Install wet deck and waterline tiling including grout: install only.';
const CONCRETE = 'Install and remove formwork for concrete works. Install steel reinforcement. Install dowel and expansion joints. Pump, place and finish concrete (corefill, tank plinths, slabs on ground, kerbs, channel, driveways) (Retaining walls, tank plinths, slabs on ground, kerbs, channel and driveways; conditions: Engineer inspection at least 24 hours before each pour; Principal approval required before each pour; plant: Concrete pump).';
const CONCRETE_GROUPS = ['slabGround', 'slabPour', 'concrete', 'kerbInstall', 'masonryGrout', 'formwork', 'reo'];

// ---- 1. The task's own work gets its steps and plant ----

test('resleepering with tamping keeps the sleeper handling lines, and on-track plant is the track maintenance machine', () => {
  const draft = draftOf({ state: 'sa', fallRisk: 'no', crane: 'none', task: 'Resleepering in the rail corridor: remove old sleepers, insert new sleepers, renew the ballast and tamp, with on-track plant and silica dust controls.', kinds: ['trackWork', 'railCorridor'] });
  assert.ok(names(draft).includes('Replace the sleepers and ballast'), names(draft).join('; '));
  assert.match(lines(draft), /Sleepers and rail are handled with on-track plant or sleeper tongs/);
  assert.match(lines(draft), /Tampers and ballast regulators work only under the protection officer/);
  assert.ok(plantNames(draft).includes('Track maintenance machine'), plantNames(draft).join('; '));
  // Tamping on its own is still the tamping step.
  const tamp = draftOf({ state: 'sa', fallRisk: 'no', crane: 'none', task: 'Tamp and regulate the ballast with the tamping machine during the track possession.' });
  assert.ok(names(tamp).includes('Tamp and regulate the ballast'), names(tamp).join('; '));
});

test('thermite welds named in a rail task are listed as work with no job steps, not dropped, and are not a welder', () => {
  const draft = draftOf({ state: 'sa', fallRisk: 'no', crane: 'none', task: 'resleepering and reballast 200m of track during possession, tamper, thermite welds' });
  assert.equal(draft.kind, 'draft');
  assert.deepEqual(draft.notCovered, ['thermite welds']);
  assert.ok(!plantNames(draft).includes('Welder'), plantNames(draft).join('; '));
  // A task that is all rail welding still stands down for want of job steps.
  const weld = draftOf({ state: 'sa', fallRisk: 'no', crane: 'none', task: 'Rail welding in the rail corridor: cut the rail, aluminothermic welding with preheating and molten metal, grind the welds, and stress the rail with tensors.', kinds: [] });
  assert.equal(weld.kind, 'stand-down');
});

test('a bridge deck replacement demolishes the old deck first, lands the precast planks as deck units, and names the stitch pour forming as work with no steps', () => {
  const draft = draftOf({ state: 'act', fallRisk: 'yes', crane: 'own', slinging: 'ours', task: BRIDGE, facts: { craneChart: '50t at 20m from chart, planks 18t' } });
  const list = names(draft);
  assert.ok(list.includes('Demolish the bridge'), list.join('; '));
  assert.ok(list.includes('Land and fix the precast floor units'), list.join('; '));
  assert.ok(!list.includes('Remove and replace damaged timbers'), list.join('; '));
  assert.ok(!list.includes('Stand and brace the precast elements'), list.join('; '));
  assert.ok(before(list, 'Demolish the bridge', 'Land and fix the precast floor units'), list.join('; '));
  assert.ok(before(list, 'Land and fix the precast floor units', 'Pump and place concrete'), list.join('; '));
  assert.ok(draft.notCovered.some((part) => /stich pour/.test(part)), JSON.stringify(draft.notCovered));
  // The demolition and the work above traffic are listed as the builder check reads them from the steps.
  const quiet = draftOf({ state: 'act', fallRisk: 'yes', crane: 'own', slinging: 'ours', task: BRIDGE, site: { ...SITE.site, publicInterface: 'No public in the work area.' }, facts: { craneChart: '50t at 20m from chart, planks 18t' } });
  assert.ok(quiet.highRisk.some((label) => /demolition of an element of a structure that is load-bearing/.test(label)), quiet.highRisk.join(' | '));
  assert.ok(quiet.highRisk.some((label) => /traffic corridor/.test(label)), quiet.highRisk.join(' | '));
  assert.ok(!checkSwms(fromDraft(quiet, { state: 'act' }), { state: 'act' }).findings.some((item) => item.rule === 'H1' && !item.pass));
});

test('a timber bridge deck repair still gets the timber repair step', () => {
  const draft = draftOf({ state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Replace the damaged timber planks and bearers on the pedestrian bridge deck.' });
  assert.ok(names(draft).includes('Remove and replace damaged timbers'), names(draft).join('; '));
});

test('tiling plant comes from the steps: a tile saw and a paddle mixer', () => {
  const draft = draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'supply and lay floor and wall tiles to bathrooms, ensuites, kitchens, laundries and common area foyers' });
  assert.ok(plantNames(draft).includes('Tile saw'), plantNames(draft).join('; '));
  assert.ok(plantNames(draft).includes('Paddle mixer'), plantNames(draft).join('; '));
  assert.ok(!plantNames(draft).includes('Masonry or paver saw'), plantNames(draft).join('; '));
});

test('a pool finishes package is drafted, not refused for pool shell work, with the pebble pump, and grinding before what goes on the surface', () => {
  const draft = draftOf({ state: 'wa', fallRisk: 'yes', crane: 'none', task: POOL_FINISH });
  assert.equal(draft.kind, 'draft');
  assert.ok(plantNames(draft).includes('Pebble pump and spray rig'), plantNames(draft).join('; '));
  const list = names(draft);
  assert.ok(before(list, 'Prepare surfaces by grinding', 'Lay the screed'), list.join('; '));
  assert.ok(before(list, 'Prepare surfaces by grinding', 'Lay tiles'), list.join('; '));
  // The membrane, the copings and the tiling are the steps' own work; "install only" is a note, not work.
  assert.ok(list.includes('Apply primers and liquid membranes'), list.join('; '));
  assert.deepEqual(draft.notCovered || [], []);
  // A sprayed pool shell still has its own hold.
  const shell = draftOf({ state: 'wa', fallRisk: 'yes', crane: 'none', task: 'Build the pool shell with sprayed concrete (gunite).', kinds: [] });
  assert.equal(shell.kind, 'stand-down');
});

test('a joinery materials handling package with the user\'s storage step has its handling step and trolleys, and confirmed carpentry tools bring the power tools step and hearing protection', () => {
  // The storage work is the user's own step (round 4 decision); the handling step and its trolleys are SiteWrite's.
  const store = draftOf({ state: 'tas', fallRisk: 'no', crane: 'none', task: 'Deliver joinery to site and handle materials for movement and installation. Provide storage for joinery materials.', kinds: ['carpLoad'], ownSteps: [{ part: 'Provide storage for joinery materials', name: 'Store joinery in the site container', hazards: ['Strain lifting joinery'], controls: ['Joinery is moved on trolleys and stacked on bearers in the container'], who: 'Supervisor' }] });
  assert.equal(store.kind, 'draft', (store.missing || []).join('; '));
  assert.ok(names(store).includes('Move materials into place'), names(store).join('; '));
  assert.ok(plantNames(store).includes('Trolley or panel lifter'), plantNames(store).join('; '));
  const install = draftOf({ state: 'tas', fallRisk: 'no', crane: 'none', task: 'Install reception desk and concierge joinery. Install sliding veneer hollowcore doors on proprietary door track.', kinds: ['carpJoinery'], plantChoice: { used: [], notUsed: [], added: [{ item: 'drop saw', licence: 'No' }, { item: 'nail gun', licence: 'No' }] } });
  assert.ok(names(install).includes('Use power tools'), names(install).join('; '));
  assert.ok(ticked(install).some((id) => ['earMuffs', 'earPlugs'].includes(id)), ticked(install).join(', '));
});

test('an electrical task typed with "test the new work" gets the testing step and lists no part as uncovered', () => {
  const draft = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'Install new power circuits and lights in the office fitout and test the new work' });
  assert.ok(names(draft).includes('Test the new work'), names(draft).join('; '));
  assert.deepEqual(draft.notCovered, []);
  assert.ok(!names(draft).includes('Install joinery and cabinets'), names(draft).join('; '));
});

// ---- 2. Wrong-trade and wrong-context steps and lines ----

test('access control: drilling and routing doors and frames is not door hanging, joinery or steel erection, and an office ceiling is not a roof space', () => {
  // "cable in the ceiling from a ladder" is work from a ladder (messy round 10, run 8: "from a ladder" brought no ladder step).
  assert.deepEqual(suggestedKinds(ACCESS, {}, {}), ['securityDevices', 'ladderUse']);
  const draft = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: ACCESS });
  const list = names(draft);
  for (const name of ['Hang the doors', 'Install joinery and cabinets', 'Erect and connect steel at height', 'Work in the roof space', 'Use power tools']) assert.ok(!list.includes(name), list.join('; '));
  const asked = questionsFor({ ...SITE, state: 'qld', fallRisk: 'no', crane: 'none', task: ACCESS });
  assert.ok(!(asked.required || []).some((item) => item.id === 'erectionSequence'));
  assert.ok(!plantNames(draft).includes('Nail gun') && !plantNames(draft).includes('Bar cutter or cut-off saw'), plantNames(draft).join('; '));
  // Hanging doors is still door hanging, and a house ceiling still a roof space.
  assert.ok(suggestedKinds('Hang the new doors and fit the locks.', {}, {}).some((id) => /door|carp/i.test(id)));
});

test('tree pits: no trench shoring, pits or pipe steps, no planting bag or erosion matting lines, trees planted before the pits are backfilled, and no trench category for 1.2 m pits', () => {
  const draft = draftOf({ state: 'nt', fallRisk: 'no', crane: 'own', slinging: 'ours', task: TREES, kinds: ['landscape', 'loaderCrane', 'trench', 'road'], site: TREE_SITE, facts: TREE_FACTS });
  const list = names(draft);
  for (const name of ['Work in the trench', 'Install pits', 'Lay pipes', 'Set up the crane']) assert.ok(!list.includes(name), list.join('; '));
  assert.doesNotMatch(lines(draft), /Planting bags are loaded|erosion matting|crane company/);
  assert.ok(before(list, 'Plant', 'Backfill the tree pits'), list.join('; '));
  assert.ok(!draft.highRisk.some((item) => /trench/i.test(item)), draft.highRisk.join('; '));
  // Typed, with our own HIAB: the truck loading crane step, not the mobile crane steps, and not tree removal.
  const typed = draftOf({ state: 'nt', fallRisk: 'no', crane: 'own', slinging: 'ours', task: TREES, site: TREE_SITE, facts: TREE_FACTS });
  assert.equal(typed.kind, 'draft');
  assert.ok(names(typed).includes('Unload with the truck loading crane (hiab)') && !names(typed).includes('Rig and lift the load'), names(typed).join('; '));
});

test('slabs on ground with formwork and reo groups get no deck, edge protection or stair tower lines, and reo goes in before the pour', () => {
  const kinds = packageKinds(CONCRETE, CONCRETE_GROUPS);
  assert.ok(!kinds.includes('formwork'), kinds.join(', '));
  const draft = draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', task: CONCRETE, kinds });
  assert.doesNotMatch(lines(draft), /through the deck|Stay inside the edge protection|stair tower/);
  assert.ok(!names(draft).some((name) => /onto the deck|formwork deck|falsework/i.test(name)), names(draft).join('; '));
  const list = names(draft);
  // One placing step (messy round 9): the pumped placing takes in "Place concrete".
  assert.ok(before(list, 'Place and tie reo', list.includes('Place concrete') ? 'Place concrete' : 'Pump and place concrete'), list.join('; '));
  // The scope's conditions and plant notes are not printed as a control.
  assert.ok(!draft.controls.some((item) => /conditions:|plant:/.test(item.text)), draft.controls.map((item) => item.text).join(' | '));
});

test('an in-ground pool structure gets the tank wall steps, not a formwork deck or reo loaded onto a deck', () => {
  const task = 'Construct pool structure: formwork, reinforcement and concrete. Construct 45000L concrete balance tank. Construct 2 infinity edges.';
  const kinds = packageKinds(task, ['formwork', 'reo', 'concrete', 'tankWalls']);
  assert.ok(!kinds.includes('formwork') && kinds.includes('tankWalls'), kinds.join(', '));
  const draft = draftOf({ state: 'wa', fallRisk: 'yes', crane: 'none', task, kinds });
  assert.ok(!names(draft).some((name) => /deck/i.test(name)), names(draft).join('; '));
  assert.ok(before(names(draft), 'Form the tank walls', 'Pump and place concrete'), names(draft).join('; '));
  // The pool structure is the tank wall steps' work, so it is not listed as work with no steps.
  assert.deepEqual(draft.notCovered || [], []);
  // Typed as forming and pouring the pool shell, it was stood down as sprayed pool shell work (#224). A shell
  // formed and poured is built with the tank wall steps (content9, flow9 note on messy round 9); a sprayed one
  // is still the shotcrete steps (test/content9.test.js).
  const typed = draftOf({ state: 'wa', fallRisk: 'yes', crane: 'none', task: 'Construct the in-ground pool shell: form up, fix reo and pour the pool shell and the balance tank walls with a concrete pump.' });
  assert.equal(typed.kind, 'draft', (typed.missing || []).join(' '));
  assert.ok(names(typed).includes('Pour the tank walls'), names(typed).join('; '));
});

test('the backflow line is for water supply plumbing, not stormwater drainage alone', () => {
  const storm = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'Excavate and install underground stormwater pipes and pits to 1.2 m deep.' });
  assert.doesNotMatch(lines(storm), /Backflow prevention devices and temperature control devices/);
  const water = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', trade: 'plumbing', task: 'Install the cold and hot water services and the backflow device to the new amenities.' });
  assert.match(lines(water), /Backflow prevention devices and temperature control devices/);
});

test('fall control answers for open excavation work are the excavation\'s own, and the silica answers fit grinding', () => {
  assert.equal(answersFor('fallControl', 'Excavate site works. Install underground stormwater pipes and pits.')[0].label, 'Excavation edge barriers');
  assert.ok(!answersFor('fallControl', 'Excavate site works.').some((answer) => /roof|risers|scissor/i.test(answer.label)));
  assert.ok(!answersFor('fallControl', 'Install the roof sheets').some((answer) => answer.label === 'Excavation edge barriers'));
  assert.deepEqual(answersFor('silicaControls', 'Clean, grind and prepare concrete pool surface.').map((answer) => answer.label), ['Shrouded grinder']);
  assert.ok(answersFor('silicaControls', 'Saw cut the control joints.').some((answer) => answer.label === 'Wet cutting'));
});

test('power line and chemical splash emergency rows only with their cause', () => {
  const draft = draftOf({ state: 'act', fallRisk: 'yes', crane: 'own', slinging: 'ours', task: BRIDGE, facts: { craneChart: '50t at 20m from chart' }, site: { liveServices: 'none', publicInterface: 'one lane closed with traffic control', otherTrades: 'none', ground: 'soft creek bank', access: 'via the bridge approach' }, substancesNotUsed: ['Cement, concrete, grout and mortar', 'Curing compounds and form release agents', 'Fuels (diesel, petrol)'] });
  const types = draft.emergency.map((row) => row.type);
  assert.ok(!types.includes('Contact with power lines'), types.join('; '));
  assert.ok(!types.includes('Chemical splash'), types.join('; '));
});

test('builder check findings for a Victorian SWMS cite Victoria\'s regulations, not NSW sources', () => {
  const result = checkSwms({ task: 'Pour the slab', steps: [] }, { state: 'vic' });
  const sources = result.findings.map((item) => item.source || '').join('\n');
  assert.doesNotMatch(sources, /SafeWork NSW|(?<!model )WHS Regulations s 299/);
  assert.match(sources, /Occupational Health and Safety Regulations 2017 \(Vic\) r 327/);
  assert.match(checkSwms({ task: 'x', steps: [] }, { state: 'nsw' }).findings.map((item) => item.source || '').join('\n'), /SafeWork NSW/);
});

// ---- 3. High risk work ----

test('a confirmed tamper is powered mobile plant, and a typed resleepering task lists the traffic corridor', () => {
  const draft = draftOf({ state: 'sa', fallRisk: 'no', crane: 'none', task: 'resleepering and reballast 200m of track during possession', plantChoice: { used: [], notUsed: [], added: [{ item: 'tamper', licence: 'rail manager competency for the machine' }] } });
  assert.ok(draft.highRisk.some((item) => /powered mobile plant/i.test(item)), draft.highRisk.join('; '));
  assert.ok(draft.highRisk.some((item) => /traffic corridor/i.test(item)), draft.highRisk.join('; '));
});

// ---- 4. Licences ----

test('slinging with lifting gear lists the dogging licence; typed licences for the user\'s own plant are listed; silica training is for processing silica only', () => {
  const civil = draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', task: 'Excavate the site. Install underground stormwater pipes and pits, lowered in with the excavator on slings. Cart away and dump excavated fill to tip.', plantChoice: { used: ['Excavator', 'Lifting gear (slings, chains, shackles)'], notUsed: [], added: [{ item: 'Tip truck', licence: 'HR licence' }, { item: 'Water cart', licence: 'MR' }] } });
  assert.ok(civil.qualifications.some((name) => /dogging or rigging/.test(name)), civil.qualifications.join(' | '));
  assert.ok(civil.qualifications.includes('Tip truck: HR licence') && civil.qualifications.includes('Water cart: MR'), civil.qualifications.join(' | '));
  assert.ok(!civil.qualifications.some((name) => /silica/i.test(name)), civil.qualifications.join(' | '));
  const tiles = draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'Cut and lay floor tiles in the bathrooms.' });
  assert.ok(tiles.qualifications.some((name) => /silica/i.test(name)), tiles.qualifications.join(' | '));
});

test('the crane class is chosen from the crane chart the user gave', () => {
  const draft = draftOf({ state: 'act', fallRisk: 'yes', crane: 'own', slinging: 'ours', task: 'Lift the precast planks onto the bridge with our mobile crane.', facts: { craneChart: '50t at 20m from chart, planks 18t' } });
  const crane = draft.qualifications.find((name) => /mobile crane/i.test(name)) || '';
  assert.match(crane, /at least C6/);
  assert.doesNotMatch(crane, /crane class to suit/);
});

test('a placing boom the user said is not used takes its boom lines and licence line with it', () => {
  const draft = draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', task: 'Pump, place and finish the concrete slab on ground with a line pump.', kinds: ['slabGround', 'slabPour', 'concrete'], plantChoice: { used: ['Concrete line pump'], notUsed: ['Concrete placing boom'], added: [] } });
  assert.doesNotMatch(lines(draft), /placing boom operator holds a high risk work licence/);
  assert.ok(names(draft).includes('Set up the concrete pump'), names(draft).join('; '));
});

// ---- 5. PPE ----

test('loud plant brings hearing protection, and noise in a step\'s hazards does too', () => {
  const draft = draftOf({ state: 'sa', fallRisk: 'no', crane: 'none', task: 'Resleepering in the rail corridor: remove old sleepers, insert new sleepers, renew the ballast and tamp, with on-track plant.', kinds: ['trackWork', 'railCorridor'] });
  assert.ok(ticked(draft).some((id) => ['earMuffs', 'earPlugs'].includes(id)), ticked(draft).join(', '));
});

test('a harness where no step works at height goes with the digging steps for rescue, not all work', () => {
  const ppe = [{ group: 'Falls', items: [{ id: 'harness', label: 'Full body harness', ticked: true }] }];
  const steps = [{ step: 'Before starting', hazards: [], controls: [] }, { step: 'Excavate', hazards: ['The excavator strikes a person.'], controls: ['x'] }, { step: 'Plant', hazards: ['Heat.'], controls: ['y'] }, { step: 'Finish and clean up', hazards: [], controls: [] }];
  assert.deepEqual(splitPpe(ppe, steps)[0].items[0].steps, ['Excavate']);
});

// ---- 6. Hazardous products ----

test('"Not required" needs a reason where the job steps use the product, and products go to the step that does the work', () => {
  const draft = draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'supply and lay floor and wall tiles to bathrooms' });
  const input = { task: 'supply and lay floor and wall tiles to bathrooms', substancesNotUsed: ['Adhesives'], substancesNotUsedWhy: {} };
  const adhesive = typeItems(draft, input).find((item) => item.type === 'Adhesives');
  // The step "Mix and spread the tile adhesive" names the product, so no reason settles it (content7
  // decision 1, option A, built in content8).
  assert.ok(adhesive && /"Mix and spread the tile adhesive" in this SWMS uses "adhesive", so it cannot be "Not required"/.test(adhesive.need), JSON.stringify(adhesive));
  assert.match(typeItems(draft, { ...input, substancesNotUsedWhy: { Adhesives: 'supplied and applied by others' } }).find((item) => item.type === 'Adhesives').need, /cannot be "Not required"/);
  assert.equal(rules.matchStep('Cement, concrete, grout and mortar', [{ step: 'Core fill blockwork', hazards: ['Cement burns.'], controls: [] }, { step: 'Pump and place concrete', hazards: [], controls: [] }]), 'Pump and place concrete');
  assert.equal(rules.matchStep('Fuels (diesel, petrol)', [{ step: 'Excavate', hazards: [], controls: [] }, { step: 'Run earthmoving plant', hazards: [], controls: [] }]), 'Run earthmoving plant');
});

// ---- 8. Builder check ----

test('the builder check marks down work no step covers, slinging with no dogging licence, and rail corridor work with no access authority', () => {
  const draft = draftOf({ state: 'sa', fallRisk: 'no', crane: 'none', task: 'resleepering and reballast 200m of track during possession, tamper, thermite welds' });
  const result = checkSwms(fromDraft(draft, { state: 'sa' }), { state: 'sa' });
  const w1 = result.findings.find((item) => item.rule === 'W1');
  assert.match(w1.message, /thermite welds/);
  // Named as covered by another SWMS, it is not marked down.
  const named = draftOf({ state: 'sa', fallRisk: 'no', crane: 'none', task: 'resleepering and reballast 200m of track during possession, tamper, thermite welds', notCoveredElsewhere: { 'thermite welds': 'Rail welding SWMS' } });
  assert.deepEqual(named.notCoveredNamed, ['thermite welds']);
  assert.ok(!checkSwms(fromDraft(named, { state: 'sa' }), { state: 'sa' }).findings.find((item) => item.rule === 'W1').message.includes('thermite'));
  const w12 = result.findings.find((item) => item.rule === 'W12');
  assert.match(w12.message, /rail corridor/);
  const slung = { task: 'Lay the stormwater pipes', steps: [{ step: 'Lay pipes', hazards: ['A pipe swings.'], controls: ['When earthmoving plant lifts a load the operator cannot see at all times, a licensed dogger directs the lift.'] }], licences: ['General construction induction (white card)'], plant: [] };
  const w5 = checkSwms(slung, { state: 'qld' }).findings.find((item) => item.rule === 'W5');
  assert.match(w5.message, /dogging/);
});
