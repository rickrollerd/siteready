// Content faults found by the messy-user test, round 13 (local runs 1 to 8, 18 October 2026, on m89: main ef083c1 with the
// fix12, flow13 and content13 patches): wrong-context steps from the task's words; a reworded task losing its core steps;
// core work missing and not listed; an electrical licence for a rail crew, live switchboards with no step, crane lines with
// No crane; SiteWrite's own order; W17 on clearly wrong moves; own steps by stage; products in their step; "Not required"
// rules; SiteWrite's check findings; and the minor wording faults. (The formwork hold point on the pour was taken out in v2:
// Clive kept D291, so only the forming steps are held.)
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, priorKindsKept } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');
const { typeItems } = require('../substances');
const { inStageOrder, firmFaults, FIRM, stageOf } = require('../step-stages');
const { searchSteps, stepLibrary } = require('../steps');
const { settlePackages } = require('../ai-scope');
const rules = require('../public/substance-rules');
const gate = require('../public/gate-rules');

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
const picks = (input) => questionsFor({ ...SITE, ...input }).steps;
const checked = (draft, state) => checkSwms(fromDraft(draft, { state, swms: { signatures: [{ name: 'Jo Smith' }] } }), { state });

// The saved scope readings the A runs used, and a package of one as the page sends it.
const OUT = '/tmp/claude-0/-home-user-siteready/85aa87a9-e87b-537d-b31b-dfacf6b4101a/scratchpad/ai-run/out';
const fs = require('fs');
const haveReadings = fs.existsSync(`${OUT}/b-tiling.json`);
function pack(reading, name, extra = {}) {
  const raw = JSON.parse(fs.readFileSync(`${OUT}/${reading}.json`, 'utf8'));
  const data = settlePackages(raw.reading);
  const map = data.packages.find((item) => item.package === name);
  const task = data.activities.filter((row) => row.package === name && row.type !== 'Duty').map((row) => `${row.activity.replace(/\.$/, '')}${row.where ? ` (${row.where})` : ''}.`).join(' ');
  return { state: 'qld', fallRisk: 'yes', residential: 'no', task, kinds: map.groups, ...(map.unmatched && map.unmatched.length ? { unmatched: map.unmatched } : {}), ...extra };
}

// The runs' own words.
const BRIDGE = { state: 'act', fallRisk: 'yes', crane: 'none', task: 'replace bridge bearings n expansion joints on comonwealth ave bridge. jack the deck with hydrualic jacks off the pier heads, pull out old rubber bearings, set new ones n grout the bedding. saw cut n jackhammer out old expansion joint, form n pour new joint nosing. we work off an underbridge unit, scafold on pier heads is by others. 12m over the lake. trafic control by others, night lane closures', site: { liveServices: 'street light cables n telstra pit in the bridge footpath', publicInterface: 'traffic on the bridge in the open lanes, cyclists n walkers on the path, boats on the lake', otherTrades: 'none', ground: 'bridge deck, check load limit with the builder for the jacks n plant', access: 'underbridge unit from the closed lane, scafold stairs on the pier by others' } };
const BRIDGE_GIVEN = { fallControl: 'underbridge unit platform has full guardrails, we stay inside it. pier head scafold by others has guardrails' };
const RAIL = { state: 'sa', fallRisk: 'no', crane: 'none', task: 'Replace 160 timber sleepers with steel sleepers and top up ballast on a 300 m section of the Flinders line near Tonsley station, during a 54 hour weekend possession. The rail operator takes the possession, isolates and earths the 25 kV overhead wiring and provides the protection officer. We use our own hi-rail excavator with a sleeper changer attachment, a ballast regulator and a tamper, and a hi-rail truck to bring in the sleepers and ballast. Two rail joints are thermite welded and ground flush. Old sleepers are loaded on the truck and taken off site. Ballast is wetted down to keep the dust down.', site: { liveServices: '25 kV overhead wiring above the track, isolated and earthed by the rail operator before we start, under the possession. Signalling cables in troughing beside the track, located and marked by the operator\'s signal maintainer before work starts.', publicInterface: 'Tonsley station is closed for the possession.', otherTrades: 'The rail operator\'s signal maintainer works 100 m north.', ground: 'The ballast shoulder at the cess is soft and sloped.', access: 'The crew walks in through the operator\'s access gate.' } };
const RAIL_GIVEN = { hotWorkPermit: 'The rail operator\'s protection officer issues the hot work permit for each thermite weld, under the operator\'s hot work procedure. Our welder\'s offsider is fire watch during each weld and for 60 minutes after. A 9 kg dry chemical extinguisher and the 400 L water cart stand at each weld.' };
const JOINERY = { state: 'tas', fallRisk: 'no', crane: 'none', task: 'Shop draw, fabricate, supply, deliver, install and certify all front of house joinery items: Front of house bathroom joinery. Main bar structure and finishes. Library shelving, cabinet and wall finishes. Restaurant servery areas. Restaurant waiter stations. Private dining cladding to frame and glazing. Beach café cladding and benchtop. Day spa front desk and display unit.', site: { liveServices: 'none, its inside the resort bldg 2', publicInterface: 'none', otherTrades: 'sparkies n plumbers in the same rooms, painters after us', ground: 'concrete floor inside, all level', access: 'front door of bldg 2 then carry in by hand n trolley' } };
const TREES = { state: 'nt', fallRisk: 'no', crane: 'own', kinds: ['landscape', 'loaderCrane', 'trench', 'road'], leaveOut: ['Install pits'], task: 'Advanced tree planting: excavate the tree pit next to the road, lift the large root ball trees in with a crane truck, plant and stake the trees. 14 trees in 200L bags along chung wah tce, our hiab truck n a 1.7t mini excavator, council footpath stays open', site: { liveServices: 'none', publicInterface: 'footpath', otherTrades: 'none', ground: 'dirt verge, soft after rain', access: 'truck' } };
const TREES_GIVEN = { craneChart: '2.1t at 6m', groundBearing: 'the head contractors site manager checked the verge for our outriggers, we use 600mm pads' };
const CCTV = { state: 'qld', fallRisk: 'yes', crane: 'none', task: 'instal 6 cctv cams on 4m poles in the carpark n 3 cams on the bldg wall at 6m off a scisor lift. dig the pole footings with a posthole auger on our bobcat, poles stood by hand n 2 blokes, no crane. run cable thru existing conduit. fit the pole enclosures n surge protection.', site: { liveServices: 'none', publicInterface: 'carpark is open to the public, cars driving thru', otherTrades: 'none', ground: 'asphalt', access: 'drive in' } };
const CCTV_PICK = 'CCTV: fix the cameras inside, on facades and at roof edges from EWPs, stand the camera poles on their footings with a crane truck, and fit the pole enclosures and surge protection.';
const SWITCHROOM = { state: 'vic', fallRisk: 'no', crane: 'none', task: 'Fill the 3 existing cable trenches in the main switchroom with concrete, pumped in through the switchroom door. Switchboards stay live.', site: { liveServices: 'Existing services.', publicInterface: 'none', otherTrades: 'builder', ground: 'slab', access: 'front gate on lonsdale st' } };

// ---- 1. Wrong-context steps from the task's words ----

test('B run 7: "grout the bedding" of bridge bearings ticks no tiling, a bridge over a lake works above no traffic or rail, and traffic control by others is not Recommended', () => {
  const steps = picks(BRIDGE);
  for (const id of ['tileCut', 'tileMix', 'tileLay', 'workAbove']) assert.ok(!steps.suggested.includes(id), id);
  assert.ok(steps.suggested.includes('road'), 'traffic management is still offered');
  assert.ok(!steps.chosen.includes('road') && !steps.locked.includes('road'), 'not ticked or Recommended with traffic control by others');
  const draft = draftOf({ ...BRIDGE, kinds: steps.chosen }, BRIDGE_GIVEN);
  for (const name of ['Cut tiles and stone', 'Lay the screed', 'Lay tiles', 'Work above traffic or a rail line']) assert.ok(!names(draft).includes(name), name);
  assert.doesNotMatch(lines(draft), /Rail traffic below|Road traffic below/);
  // The traffic corridor's high risk work stays, and the bearings and their bedding are the bearing step's work.
  assert.ok(draft.highRisk.some((label) => /traffic corridor|road, railway/i.test(label)));
  assert.deepEqual(draft.notCovered.filter((part) => /bearing|bedding/.test(part)), []);
  assert.ok(!checked(draft, 'act').findings.some((item) => /rail protection/i.test(item.text || item.fix || JSON.stringify(item))));
  // Our own traffic control crew keeps the step Recommended.
  assert.ok(picks({ ...BRIDGE, task: BRIDGE.task.replace('trafic control by others', 'our tc crew runs the traffic control') }).locked.includes('road'));
});

test('B run 6: cladding and glazing named among joinery items bring no facade panel, slab edge or glass steps, and the joinery group is not named "Hang the doors"', () => {
  const draft = draftOf(JOINERY);
  for (const name of ['Load panels onto the floors and move them to the work face', 'Install panels at the open slab edge', 'Handle glass and panels']) assert.ok(!names(draft).includes(name), name);
  assert.ok(names(draft).includes('Install joinery and cabinets'));
  const joinery = stepLibrary().groups.flatMap((group) => group.kinds).find((kind) => kind.id === 'carpJoinery');
  assert.doesNotMatch(joinery.label, /^Hang the doors$/);
  assert.ok(!joinery.steps.includes('Hang the doors'));
  // A facade keeps its panel steps.
  assert.ok(names(draftOf({ state: 'qld', fallRisk: 'yes', crane: 'company', task: 'Install unitised curtain wall panels and glazing to the level 4 to 10 facade, loaded onto the floors from stillages.' })).some((name) => /panel/i.test(name)));
});

test('B run 5: the operator\'s isolated overhead wiring is not installed, and thermite welds are not arc welding', () => {
  const draft = draftOf(RAIL, RAIL_GIVEN);
  assert.ok(!names(draft).includes('Install the overhead wiring'));
  assert.ok(!names(draft).includes('Weld steel'));
  assert.doesNotMatch(lines(draft), /electrode holder|voltage reduction/i);
  assert.ok(draft.notCovered.some((part) => /thermite/i.test(part)), 'the thermite welds are listed as before');
  // Wiring the crew installs is still its work.
  assert.ok(names(draftOf({ ...RAIL, task: 'Install and tension the new overhead wiring contact wire along the rail corridor from the road rail vehicle.' })).includes('Install the overhead wiring'));
});

test('A run 1: waste plugs in the floor wastes and tiling around pipes are not plumbing', { skip: !haveReadings }, () => {
  const input = pack('b-tiling', 'Trade installation: all tiled areas', { state: 'nsw', crane: 'company' });
  assert.ok(!input.kinds.includes('plumbingFitOff'));
  const draft = draftOf(input);
  assert.ok(!names(draft).some((name) => /^Plumbing/.test(name)));
  assert.ok(!draft.notCovered.some((part) => /waste plugs/i.test(part)));
});

test('A run 4: ground-level water features are formed as tanks with no deck, and the pool excavation casts nothing into a deck', { skip: !haveReadings }, () => {
  const water = draftOf(pack('b-swimming-pool', 'Trade installation: water features', { state: 'wa', crane: 'none', fallRisk: 'no' }));
  for (const name of ['Erect falsework and shores', 'Lay the formwork deck', 'Load ply onto the deck while it is being laid', 'Lift reo onto the deck', 'Load reo onto the deck', 'Install backprops']) assert.ok(!names(water).includes(name), name);
  assert.ok(names(water).includes('Form the tank walls'));
  assert.ok(!questionsFor({ ...SITE, ...pack('b-swimming-pool', 'Trade installation: water features', { state: 'wa', crane: 'none', fallRisk: 'no' }) }).required.some((item) => item.id === 'deckMethod'));
  const dig = draftOf(pack('b-swimming-pool', 'In-ground civil', { state: 'wa', crane: 'none', fallRisk: 'no' }));
  assert.ok(!names(dig).includes('Install cast-in sleeves and puddle flanges on the deck before the pour'));
});

test('A run 2: a door named as the way in hangs no doors, and concrete pumped into trenches is placed concrete', () => {
  const draft = draftOf(SWITCHROOM);
  assert.ok(!names(draft).includes('Hang the doors'));
  assert.ok(names(draft).some((name) => /place concrete/i.test(name)));
});

// ---- 2. A reworded task keeps the work its new words still name ----

test('A runs 2 and 3: re-reading a reworded task keeps the scope\'s or pick list\'s steps the new words still name', () => {
  const live = draftBody({ ...SITE, ...SWITCHROOM, priorKinds: ['slabPour'] });
  assert.ok(live.kinds.includes('slabPour') && live.kinds.includes('liveNearby'));
  assert.ok(!live.kinds.includes('carpJoinery'));
  const poles = draftBody({ ...SITE, ...CCTV, priorKinds: ['securityDevices', 'poleErect', 'ewp', 'craneInterface'] });
  for (const id of ['securityDevices', 'poleErect', 'ewp']) assert.ok(poles.kinds.includes(id), id);
  assert.ok(!poles.kinds.includes('craneInterface'), 'No crane, and the new words name none');
  assert.ok(names(prepareDraft(bodyOf({ ...CCTV, kinds: poles.kinds }))).includes('Stand and fix the poles'));
  // A group the new words do not name goes.
  assert.deepEqual(priorKindsKept({ state: 'qld', task: 'Paint the plant room walls.' }, ['poleErect']), []);
  // The pole words alone find the pole step too.
  assert.ok(names(draftOf(CCTV)).includes('Stand and fix the poles'));
});

// ---- 3. Missing core work ----

test('B run 8: lifting the root ball trees into the pits and staking them are listed, and the trolley line is not for 200 L trees', () => {
  const draft = draftOf(TREES, TREES_GIVEN);
  assert.ok(draft.notCovered.some((part) => /lift the large root ball trees/i.test(part)));
  assert.ok(draft.notCovered.some((part) => /stake the trees/i.test(part)));
  assert.doesNotMatch(lines(draft), /root balls are moved on trolleys or lifted by two people/);
});

test('B run 7: the old expansion joint saw cut and jackhammered out gets the saw cutting and break-out steps, and "jackham" finds them', () => {
  const draft = draftOf({ ...BRIDGE, kinds: picks(BRIDGE).chosen }, BRIDGE_GIVEN);
  assert.ok(names(draft).includes('Saw cut concrete'));
  assert.ok(names(draft).includes('Break out damaged concrete'));
  assert.ok(!names(draft).includes('Repair the concrete'), 'the new nosing is poured, not patched');
  assert.equal(searchSteps('jackham')[0], 'concreteRepair');
  // Control joints saw cut into a new slab are still the finishing step's work.
  assert.ok(!names(draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'Pour and finish the ground floor slab, then saw cut the control joints.' })).includes('Saw cut concrete'));
});

test('A run 1: floor tiles are laid, the sand cement bed is screeded, and the matting step comes with the matting', { skip: !haveReadings }, () => {
  const whole = draftOf(pack('b-tiling', 'Trade installation: whole project', { state: 'nsw', crane: 'company' }));
  assert.ok(names(whole).includes('Lay tiles'), 'floor tiles');
  assert.ok(names(whole).includes('Lay the screed'));
  assert.ok(names(whole).includes('Mix and spread the tile adhesive') && names(whole).includes('Grout the tiles'));
  const all = pack('b-tiling', 'Trade installation: all tiled areas', { state: 'nsw', crane: 'company' });
  assert.ok(draftBody({ ...SITE, ...all }).kinds.includes('acousticMat') || picks(all).chosen.includes('acousticMat'));
  const draft = draftOf(all);
  assert.ok(names(draft).includes('Lay the acoustic matting'));
  assert.ok(!draft.notCovered.some((part) => /acoustic matting/i.test(part)));
  // A ticked group whose steps print only as the task names them is named for the group, not its first step.
  const tileMix = stepLibrary().groups.flatMap((group) => group.kinds).find((kind) => kind.id === 'tileMix');
  assert.doesNotMatch(tileMix.label, /^Lay the screed$/);
});

test('A run 2: "Fix steel reinforcement" beside kerbs places the reo, and the road saw gets the saw cutting step', { skip: !haveReadings }, () => {
  const concrete = draftOf(pack('b-civil-concrete', 'Trade installation: concrete works', { state: 'vic', crane: 'none', fallRisk: 'no' }));
  assert.ok(names(concrete).some((name) => /reo/i.test(name)));
  const dig = pack('b-civil-concrete', 'In-ground civil', { state: 'vic', crane: 'none', fallRisk: 'no' });
  assert.ok(names(draftOf(dig)).includes('Saw cut concrete'));
  // Unticked, the reinforcement and the road saw are listed as work with no job steps, and the check flags them.
  const unticked = draftOf({ ...pack('b-civil-concrete', 'Trade installation: concrete works', { state: 'vic', crane: 'none', fallRisk: 'no' }), kinds: ['slabPour', 'concrete', 'kerbInstall'] });
  assert.ok(unticked.notCovered.some((part) => /reinforcement/i.test(part)));
  assert.ok(checked(unticked, 'vic').findings.some((item) => item.rule === 'W1' && /reinforcement/i.test(item.message)));
  const sawOff = draftOf({ ...dig, kinds: dig.kinds.filter((id) => id !== 'sawCut') });
  assert.ok(sawOff.notCovered.some((part) => /roadsaw/i.test(part)));
});

// ---- 4. An electrical licence and lines for a rail crew, live switchboards, cranes with No crane ----

test('B run 5: wiring the rail operator isolates and earths gives the track crew no electrical licence or electrician lines', () => {
  const draft = draftOf(RAIL, RAIL_GIVEN);
  assert.ok(!draft.qualifications.some((name) => /^Electrical/.test(name)));
  assert.doesNotMatch(lines(draft), /licensed electricians|Apprentices are supervised/);
  assert.ok(draft.highRisk.some((label) => /energised electrical/i.test(label)), 'the crew still works near it');
});

test('A run 2: switchboards that stay live give a crew doing no electrical work the energised parts step and its separation lines', () => {
  const draft = draftOf(SWITCHROOM);
  const step = draft.jobSteps.find((item) => item.step === 'Work on or near energised parts');
  assert.ok(step, 'the step');
  assert.ok(step.controls.some((line) => /kept separated from them/.test(line)));
  assert.ok(!step.controls.some((line) => /energised testing|safety observer, assessed/i.test(line)));
  assert.ok(before(names(draft), 'Work on or near energised parts', 'Pump and place concrete'));
  assert.doesNotMatch(lines(draft), /licensed electricians|excavation permit/);
  assert.ok(picks(SWITCHROOM).locked.includes('liveNearby'));
});

test('A run 3: with No crane, the pick list\'s "with a crane truck" ticks no crane steps, the pole step drops its crane lines, and the check asks no lift plan', () => {
  const picked = picks({ ...CCTV, task: CCTV_PICK, kinds: ['securityDevices', 'poleErect', 'ewp'] });
  for (const id of ['craneInterface', 'loaderCrane']) assert.ok(!picked.suggested.includes(id), id);
  const draft = draftOf({ ...CCTV, kinds: ['securityDevices', 'poleErect', 'ewp'] });
  const pole = draft.jobSteps.find((item) => item.step === 'Stand and fix the poles');
  assert.ok(!pole.controls.some((line) => /with a crane or pole truck|held by the crane|slung by licensed doggers/.test(line)));
  assert.ok(!(draft.plant || []).some((item) => /crane/i.test(item.item)));
  assert.ok(!checked(draft, 'qld').findings.some((item) => /lift plan/i.test(`${item.message} ${(item.fixes || []).join(' ')}`)));
  // A crane the user's own words name still counts.
  assert.ok(picks({ ...CCTV, task: 'stand the 4m camera poles with our crane truck', kinds: null }).suggested.some((id) => /crane/i.test(id)));
});

// ---- 5. SiteWrite's own order ----

test('SiteWrite\'s own order: bearings before the nosing pour, tiling drilled and cleaned after laying, slabs finished before kerbs and core fill', { skip: !haveReadings }, () => {
  const bridge = names(draftOf({ ...BRIDGE, kinds: picks(BRIDGE).chosen }, BRIDGE_GIVEN));
  assert.ok(before(bridge, 'Jack the deck and replace the bearings', 'Pump and place concrete'));
  assert.ok(before(bridge, 'Jack the deck and replace the bearings', 'Saw cut concrete'));
  const tiles = names(draftOf(pack('b-tiling', 'Trade installation: all tiled areas', { state: 'nsw', crane: 'company' })));
  assert.ok(before(tiles, 'Lay tiles', 'Drill tiled walls for fixings'));
  assert.ok(before(tiles, 'Lay tiles', 'Clean with chemicals'));
  assert.ok(before(tiles, 'Cut tiles and stone', 'Lay the screed'));
  const whole = names(draftOf(pack('b-tiling', 'Trade installation: whole project', { state: 'nsw', crane: 'company' })));
  assert.ok(before(whole, 'Cut tiles and stone', 'Lay tiles near open edges'));
  assert.ok(before(whole, 'Mix and spread the tile adhesive', 'Lay tiles near open edges'));
  const concrete = names(draftOf(pack('b-civil-concrete', 'Trade installation: concrete works', { state: 'vic', crane: 'none', fallRisk: 'no' })));
  assert.ok(before(concrete, 'Finish the concrete', 'Form and pour the kerb and channel'));
  assert.ok(before(concrete, 'Finish the concrete', 'Core fill blockwork'));
  // Arc welding no longer comes before the sleepers: there is none (B run 5).
  assert.ok(!names(draftOf(RAIL, RAIL_GIVEN)).includes('Weld steel'));
});

// ---- 6. W17 on clearly wrong moves ----

const MOVES = [
  { what: 'sleepers before the corridor protection (B run 5)', wrong: ['Replace the sleepers and ballast', 'Work in the rail corridor'], right: ['Work in the rail corridor', 'Replace the sleepers and ballast'] },
  { what: 'benchtops before the cabinets (B run 6)', wrong: ['Move and set heavy benchtops', 'Install joinery and cabinets'], right: ['Install joinery and cabinets', 'Move and set heavy benchtops'] },
  { what: 'backfill before the dig (B run 8)', wrong: ['Backfill the tree pits', 'Excavate', 'Plant'], right: ['Excavate', 'Plant', 'Backfill the tree pits'] },
  { what: 'planting before the dig (B run 8)', wrong: ['Plant', 'Excavate'], right: ['Excavate', 'Plant'] },
  { what: 'drilling tiled walls before the tiling (A run 1)', wrong: ['Drill tiled walls for fixings', 'Lay tiles'], right: ['Lay tiles', 'Drill tiled walls for fixings'] },
  { what: 'tiles before the screed and matting (A runs 1 and 4)', wrong: ['Lay tiles', 'Lay the screed', 'Lay the acoustic matting'], right: ['Lay the screed', 'Lay the acoustic matting', 'Lay tiles'] },
  { what: 'the pour before the break-out (B run 7)', wrong: ['Pump and place concrete', 'Break out damaged concrete'], right: ['Break out damaged concrete', 'Pump and place concrete'] },
  { what: 'the nosing pour before the bearings (B run 7)', wrong: ['Pump and place concrete', 'Jack the deck and replace the bearings'], right: ['Jack the deck and replace the bearings', 'Pump and place concrete'] },
];

test('W17 flags each clearly wrong move of round 13, and SiteWrite sorts it back', () => {
  for (const item of MOVES) {
    assert.ok(firmFaults(asSteps(item.wrong)).length > 0, `${item.what}: not flagged`);
    assert.deepEqual(firmFaults(asSteps(item.right)), [], `${item.what}: right order flagged`);
    assert.deepEqual(inStageOrder(asSteps(item.wrong)).map((step) => step.step), item.right, item.what);
  }
  // Every firm chain agrees with the stage map where both steps have a stage.
  for (const chain of FIRM) for (let g = 0; g < chain.length; g += 1) for (let h = g + 1; h < chain.length; h += 1) {
    for (const a of chain[g]) for (const b of chain[h]) if (typeof stageOf(a) === 'number' && typeof stageOf(b) === 'number') assert.ok(stageOf(a) < stageOf(b), `${a} / ${b}`);
  }
  // The builder check gives W17 on a draft with the pour moved above the break-out.
  const draft = draftOf({ ...BRIDGE, kinds: picks(BRIDGE).chosen }, BRIDGE_GIVEN);
  const moved = { ...draft, jobSteps: [...draft.jobSteps] };
  const at = (name) => moved.jobSteps.findIndex((step) => step.step === name);
  const [pour] = moved.jobSteps.splice(at('Pump and place concrete'), 1);
  moved.jobSteps.splice(at('Break out damaged concrete'), 0, pour);
  const w17 = (swms) => checked(swms, 'act').findings.find((item) => item.rule === 'W17');
  assert.ok(w17(moved) && !w17(moved).pass && /Pump and place concrete/.test(w17(moved).message));
  assert.ok(!w17(draft) || w17(draft).pass);
});

// ---- 7. Own steps by the stage of the work they name ----

test('own steps go where their work belongs: thermite welds after the sleepers, floor tiles before the grout, a pool cleaner at fit-off', { skip: !haveReadings }, () => {
  const own = (name, hazard, control) => [{ name, hazards: [hazard], controls: [control] }];
  const rail = names(draftOf({ ...RAIL, ownSteps: own('Thermite weld the two rail joints and grind them flush', 'Burns from molten metal', 'Fire watch for 60 minutes after each weld') }, RAIL_GIVEN));
  assert.ok(before(rail, 'Replace the sleepers and ballast', 'Thermite weld the two rail joints and grind them flush (Our own step)'));
  const tiles = names(draftOf({ ...pack('b-tiling', 'Trade installation: whole project', { state: 'nsw', crane: 'company' }), ownSteps: own('Screed and lay floor tiles in units, common areas, lift foyers and external areas', 'Back and knee strain', 'Knee pads are worn for kneeling work') }));
  assert.ok(before(tiles, 'Screed and lay floor tiles in units, common areas, lift foyers and external areas (Our own step)', 'Grout the tiles'));
  const pool = names(draftOf({ ...pack('b-swimming-pool', 'Trade installation: swimming pool', { state: 'wa', crane: 'none', fallRisk: 'no' }), ownSteps: own('Fit the robotic pool cleaner and its power supply', 'Electric shock from the cleaner power supply near water', 'The power supply is the extra low voltage unit from the maker') }));
  assert.ok(before(pool, 'Pour the tank walls', 'Fit the robotic pool cleaner and its power supply (Our own step)'));
  assert.ok(before(pool, 'Grout the tiles', 'Fit the robotic pool cleaner and its power supply (Our own step)'));
});

// ---- 8. Products in their step ----

test('products go to the step that uses them: bearing grout to the bearings, tile grout and adhesive to the laying, not a shared place word', () => {
  const steps = (list) => list.map((step) => ({ step, hazards: [], controls: [] }));
  assert.equal(rules.stepOf({ product: 'Sika non shrink bearing grout', type: 'Cement, concrete, grout and mortar' }, steps(['Before starting', 'Jack the deck and replace the bearings', 'Saw cut concrete', 'Pump and place concrete', 'Finish and clean up'])), 'Jack the deck and replace the bearings');
  const tiling = steps(['Before starting', 'Cut tiles and stone', 'Lay the screed', 'Lay tiles', 'Finish and clean up']);
  assert.equal(rules.stepOf({ product: 'Two-part epoxy grout', type: 'Epoxy, resins and two-part products' }, tiling), 'Lay tiles');
  assert.equal(rules.stepOf({ product: 'Cement-based tile adhesive', type: 'Cement, concrete, grout and mortar' }, tiling), 'Lay tiles');
  assert.equal(rules.stepOf({ product: 'Cement grout', type: 'Cement, concrete, grout and mortar' }, tiling), 'Lay tiles');
  const pool = [...steps(['Before starting', 'Cut tiles and stone', 'Mix and apply the pebble finish']), { step: 'Fit the robotic pool cleaner (Our own step)', own: true, hazards: [], controls: [] }];
  assert.notEqual(rules.stepOf({ product: 'Pool tiles and pebble finish', type: rules.SILICA }, pool), 'Fit the robotic pool cleaner (Our own step)');
});

// ---- 9. "Not required" ----

test('"Not required": wood dust asks a reason beside the MDF line, a refuelling reason settles the check as it does the page, the saw in the plant keeps silica, the crew\'s bobcat asks for fuel', () => {
  const joinery = draftOf(JOINERY);
  const words = rules.ownWords(bodyOf(JOINERY));
  assert.match(rules.notUsedNeed('Wood dust (MDF and hardwood)', '', words, rules.stepWords(joinery), '', rules.silicaStep(joinery), joinery), /reason/);
  assert.equal(rules.notUsedNeed('Wood dust (MDF and hardwood)', 'all cut in the workshop, no cutting on site', words, rules.stepWords(joinery), '', rules.silicaStep(joinery), joinery), '');
  // Fuel: the page accepts "we fill them at the yard", and the check agrees.
  const bridge = draftOf({ ...BRIDGE, kinds: picks(BRIDGE).chosen, substancesNotUsed: ['Fuels (diesel, petrol)'], substancesNotUsedWhy: { 'Fuels (diesel, petrol)': 'genny n compressor are diesel but we fill them at the yard' } }, BRIDGE_GIVEN);
  assert.equal(rules.notUsedNeed('Fuels (diesel, petrol)', 'genny n compressor are diesel but we fill them at the yard', rules.ownWords(bodyOf(BRIDGE)), rules.stepWords(bridge), '', rules.silicaStep(bridge), bridge), '');
  assert.ok(!checked(bridge, 'act').findings.some((item) => /Fuels \(diesel, petrol\) is marked/.test(`${item.message} ${(item.fixes || []).join(' ')}`)));
  // Silica "no cutting" beside a concrete saw in the plant list.
  const sawOnly = { kind: 'draft', jobSteps: [{ step: 'Excavate', hazards: [], controls: [] }], plant: [{ item: 'Concrete saw' }] };
  assert.match(rules.notUsedNeed(rules.SILICA, 'no cutting', '', '', '', '', sawOnly), /Concrete saw/);
  // Fuel is asked for the crew's own bobcat.
  assert.ok(typeItems(draftOf(CCTV), bodyOf(CCTV)).some((item) => /^Fuels/.test(item.type)));
});

test('"Not required" is not over-strict: a cement adhesive listed under cement covers adhesive, and a library grout step\'s "epoxy grouts" does not refuse epoxy', () => {
  assert.ok(rules.coversType({ type: 'Cement, concrete, grout and mortar', product: 'Cement-based tile adhesive' }, 'Adhesives'));
  assert.ok(!rules.coversType({ type: 'Cement, concrete, grout and mortar', product: 'GP cement' }, 'Adhesives'));
  const grout = { kind: 'draft', jobSteps: [{ step: 'Grout the tiles', hazards: ['Cement dust and skin burns from wet cement products.', 'Skin sensitisation from epoxy grouts and sealers.'], controls: [] }] };
  assert.equal(rules.usedByStep('Epoxy, resins and two-part products', grout), null);
});

test('A run 1: silica controls are asked in every tiling SWMS that cuts tiles', { skip: !haveReadings }, () => {
  for (const name of ['Trade installation: whole project', 'Trade installation: all tiled areas']) {
    const asked = questionsFor({ ...SITE, ...pack('b-tiling', name, { state: 'nsw', crane: 'company' }) }).required.map((item) => item.id);
    assert.ok(asked.includes('silicaControls'), name);
  }
  const roof = questionsFor({ ...SITE, ...pack('b-tiling', 'Roof works', { state: 'nsw', crane: 'company' }), kinds: ['tileLay', 'tileMix', 'tileCut'] }).required.map((item) => item.id);
  assert.ok(roof.includes('silicaControls'));
});

// ---- 10. The formwork hold point (D291 kept, v2) ----

test('A run 4: a formwork design not issued yet holds the forming of the tank walls, not their pour (D291)', { skip: !haveReadings }, () => {
  const draft = draftOf({ ...pack('b-swimming-pool', 'Trade installation: swimming pool', { state: 'wa', crane: 'none', fallRisk: 'no' }), designs: [{ id: 'formwork', status: 'notIssued' }] });
  const held = (name) => draft.jobSteps.find((step) => step.step === name).controls.some((line) => /^Hold point/.test(line));
  assert.ok(held('Form the tank walls'));
  assert.ok(!held('Pour the tank walls'));
  // A crew that only pours to another's formwork is not held either.
  const pour = draftOf({ state: 'qld', fallRisk: 'yes', crane: 'company', task: 'Pump and place concrete to the level 3 suspended slab on the builder\'s formwork. Finish the slab.', designs: [{ id: 'formwork', status: 'notIssued' }] });
  assert.ok(!pour.jobSteps.some((step) => /pour|place/i.test(step.step) && step.controls.some((line) => /^Hold point/.test(line))));
});

// ---- 11. SiteWrite's check ----

test('B run 5: the check asks no dig permit or hand digging for a hi-rail excavator, no traffic plan for rail steps, and no row points to a missing shock row', () => {
  const draft = draftOf(RAIL, RAIL_GIVEN);
  assert.doesNotMatch(lines(draft), /No digging starts until an excavation permit/);
  const found = JSON.stringify(checked(draft, 'sa').findings);
  assert.doesNotMatch(found, /excavation or dig permit|digging by hand/);
  assert.doesNotMatch(found, /work beside a road/);
  assert.doesNotMatch(JSON.stringify(draft.emergency), /as for electric shock above/);
  // The user's own answer that the rail operator issues the hot work permit replaces the principal contractor line.
  assert.doesNotMatch(lines(draft), /hot work permit is issued by the principal contractor/);
});

// ---- 12. Minor ----

test('minor: the line pump set-up keeps a hazard, one finishing step, the life jacket blanks read plainly, a possession of 54 hours is day and night', () => {
  const pump = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'Pump and place concrete for the ground slab with a line pump.', plantChoice: { confirmed: true, notUsed: ['Concrete placing boom'], added: [] } });
  const setUp = pump.jobSteps.find((step) => /^Set up the concrete pump/.test(step.step));
  if (setUp) assert.ok(setUp.hazards.length > 0);
  const both = draftOf({ ...SWITCHROOM, kinds: ['slabPour', 'concrete'] });
  assert.equal(names(both).filter((name) => /^Finish (?:the )?concrete$/.test(name)).length, 1);
  const line = 'Rescue: ____ (rescue boat, life ring and throw line at ____), and workers are trained in their use by ____.';
  assert.equal(gate.fillLine(line, ['rescue boat', 'on the lake under the bridge', 'boat driver']), 'Rescue: rescue boat (rescue boat, life ring and throw line on the lake under the bridge), and workers are trained in their use by the boat driver.');
  assert.equal(gate.fillLine(line, ['a boat', 'the jetty', 'Sam Lee']), 'Rescue: a boat (rescue boat, life ring and throw line at the jetty), and workers are trained in their use by Sam Lee.');
  const rail = draftOf(RAIL, RAIL_GIVEN);
  assert.ok((rail.ppe || []).flatMap((group) => group.items || [group]).some((item) => item.id === 'hivisNight' && item.ticked));
  // A private hospital gets the note, and a children's hospital comes after the general one.
  assert.match(gate.careNote('St Vincent\'s Hospital Launceston'), /private hospital/);
  assert.equal(gate.careNote('Launceston General Hospital'), '');
});
