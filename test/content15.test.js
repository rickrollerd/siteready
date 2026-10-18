// Content faults found by the messy-user test, round 14 (local runs 1 to 8, 18 October 2026, on m92: main ef083c1 with the
// fix12, flow13, content13, content14 and flow14 patches): wrong-context steps from the task's words; one typo losing the whole
// job; core work missing and not listed; false items in the work with no job steps; SiteWrite's own order; W17 on clearly wrong
// moves; own steps in the wrong place; products in the wrong step; substances; plant; SiteWrite's check findings; wording.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');
const { typeItems } = require('../substances');
const { inStageOrder, firmFaults, FIRM, stageOf } = require('../step-stages');
const { stepLibrary } = require('../steps');
const { settlePackages } = require('../ai-scope');
const { fixSpelling } = require('../spelling');
const { plantFor } = require('../register');
const { packageTitles } = require('../handover');
const rules = require('../public/substance-rules');
const scopeTask = require('../public/scope-task');
const scopeChoice = require('../public/scope-choice');

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
const asSteps = (list) => list.map((step) => (typeof step === 'string' ? { step, hazards: [], controls: [] } : step));
const picks = (input) => questionsFor({ ...SITE, ...input }).steps;
const checked = (draft, state) => checkSwms(fromDraft(draft, { state, swms: { signatures: [{ name: 'Jo Smith' }] } }), { state });
const plantOf = (draft) => (draft.plantInferred || []).map((item) => item.item);
const own = (name, hazard = 'Strain lifting.', control = 'Team lift with one person in charge.') => ({ name, hazards: [hazard], controls: [control] });

// The saved scope readings the A runs used, and a package of one as the page sends it.
const OUT = '/tmp/claude-0/-home-user-siteready/85aa87a9-e87b-537d-b31b-dfacf6b4101a/scratchpad/ai-run/out';
const haveReadings = fs.existsSync(`${OUT}/a-commercial-kitchens.json`);
function pack(reading, name, extra = {}) {
  const raw = JSON.parse(fs.readFileSync(`${OUT}/${reading}.json`, 'utf8'));
  const data = settlePackages(raw.reading);
  const map = data.packages.find((item) => item.package === name);
  const task = data.activities.filter((row) => row.package === name && row.type !== 'Duty').map((row) => `${row.activity.replace(/\.$/, '')}${row.where ? ` (${row.where})` : ''}.`).join(' ');
  return { state: 'qld', fallRisk: 'yes', residential: 'no', task, kinds: map.groups, ...(map.byOthers && map.byOthers.length ? { leaveOut: map.byOthers.map((entry) => entry.step) } : {}), ...(map.unmatched && map.unmatched.length ? { unmatched: map.unmatched } : {}), ...extra };
}
const rowsOf = (reading, name) => settlePackages(JSON.parse(fs.readFileSync(`${OUT}/${reading}.json`, 'utf8')).reading).activities.filter((row) => row.package === name);

// The runs' own words.
const CLEANING = { state: 'act', fallRisk: 'yes', crane: 'none', task: '4.0 TRADE SPECIFIC INCLUSIONS\n7. Cleaning of glass– special care is to be taken when cleaning of glass. Removal of cemetious mortars is to be done by wet or chemical (approved by the Contractor) removal not rubbed off dry.  Report all scratches and defects to the Contractor prior to starting.\n13. The Subcontractor is to vacuum and or sweep all floors, mop and polish all tile surfaces.\n16. All mirrors are to be polished with marks from labels etc removed and a clean streak free finish.\n19. All windows are to be cleaned to a streak free finish including the removal of paint, mortar tags, render and the like on the frame and glass.  Both internal and external.  Ensure tracks of sliding doors and external windows are clean and free from obstruction.\n22. Provide all access equipment necessary to complete the works. No EWP’s on tiled or carpet areas. Mobile scaffolds are to be used.', site: { liveServices: 'none', publicInterface: 'none', otherTrades: 'painters', ground: 'tiled floors', access: 'front door' } };
const FENCING = { state: 'nt', fallRisk: 'no', crane: 'company', priorKinds: ['fenceRemove', 'fenceBuild'], task: 'Replace the old fence: take down the old fence, dig the post holes, set the posts in concrete, and build the new fence and gates. About 180 m of old chain wire fence on the Larapinta Drive boundary of an operating primary school is removed, and a 2.1 m high steel palisade fence with a 6 m motorised sliding gate is installed. Post holes are augered with our 5 t excavator and auger attachment, and posts are set in concrete from bags mixed on site. The school stays open, so the work area is fenced off from students and the footpath.', site: { liveServices: 'none', publicInterface: 'school students and parents on the school side', otherTrades: 'none', ground: 'sandy', access: 'school gate' } };
const FENCING_SITE = { ...FENCING, facts: { electricalSafety: 'Plant stays 6.4 m from the 22 kV line, a trained safety observer watches the excavator near the line.' }, site: { liveServices: 'Overhead 22 kV power line on the far side of Larapinta Drive, about 15 m from the fence line', publicInterface: 'Students and staff inside the school, parents on the footpath at drop off and pick up, and traffic on Larapinta Drive. Work area fenced off with temporary mesh fencing', otherTrades: 'School grounds staff mowing near the boundary', ground: 'Level, hard red sandy ground', access: 'Plant and materials come in through the school service gate off Larapinta Drive' } };
const LIFTS = { state: 'sa', fallRisk: 'yes', crane: 'none', priorKinds: ['liftInstall', 'liftShaft'], task: 'Install the lift: set the lift rails, fix the landing doors, and build the lift car and counterweight in the lift shaft. 2 passenger lifts n 1 goods lift, 14 levels. rails n landing doors lifted up the shaft with our chain blocks off the machine room lifting beam', site: { liveServices: 'n/a', publicInterface: 'none', otherTrades: 'builders', ground: 'slab', access: 'stairs' } };
const LIFTS_GIVEN = { harnessSystem: 'Full body harness to the rated anchor in the machine room, users trained by the supplier', fallControl: 'Landing doors barricaded until fitted; work in a harness in the shaft' };
const STORMWATER = { state: 'tas', fallRisk: 'no', crane: 'none', task: 'lay 120m of 450 dia stormwater pipe along the brooker hwy verge. excavtor digs the trench 2.2m deep, trench sheilds in the trench, bed n backfil with crushed rock, conect into the existing pit with a new junction pit. traffic control by others', site: { liveServices: 'none', publicInterface: 'traffic on the highway', otherTrades: 'none', ground: 'clay, firm', access: 'verge' } };
const WALL = { state: 'qld', fallRisk: 'no', crane: 'none', company: 'north qld retaning walls', task: 'build 40m of 1.8m high concrete sleeper retaning wall along the back boundry. dig post holes with our 5t excavator n auger, stand steel H posts n concrete them in, slot the sleepers in, ag pipe n drainage gravel behind, backfil n compact. neighbours fence is 1m away', site: { liveServices: 'none', publicInterface: 'neighbours', otherTrades: 'none', ground: 'clay', access: 'side gate' } };
const COOLROOM = { state: 'nsw', fallRisk: 'no', crane: 'none', priorKinds: ['coolroomPanels'], task: 'Install EPS panel cool room, freezer room and wine store in the main kitchen, Building 2. Wall panels stood by hand, ceiling panels hung off the slab above from a mobile scaffold. Fit the cool room doors and the internal tundish, and silicone the panel joints.', site: { liveServices: 'none', publicInterface: 'none', otherTrades: 'none', ground: 'slab', access: 'loading dock n goods lift' } };
const KITCHEN_NOTES = ' The fans, ductwork and electrical controls for the canopies are by other trades. The final plumbing connections to the tap sets and tails are made by the plumbing subcontractor.';

// ---- 1. Wrong-context steps from the task's words ----

test('B run 7: a cleaner\'s words tick no joinery, tiling, painting, render, glass installing or power tools, and a scope that bans EWPs brings none', () => {
  const steps = picks(CLEANING);
  for (const id of ['carpentryWork', 'carpJoinery', 'tileCut', 'tileMix', 'tileLay', 'paintExternal', 'rendering', 'glassHandle', 'glassWind', 'ewp']) assert.ok(!steps.chosen.includes(id), id);
  for (const id of ['cleaning', 'cleaningHeight', 'mobileScaffold']) assert.ok(steps.chosen.includes(id), id);
  const draft = draftOf(CLEANING);
  for (const name of ['Hang the doors', 'Cut tiles and stone', 'Lay tiles', 'Apply render to walls', 'Handle and install glass panels', 'Handle glass in the wind', 'Use power tools', 'Clean windows from the EWP', 'Set up access to the outside of the structure']) assert.ok(!names(draft).includes(name), name);
  assert.ok(names(draft).includes('Clean windows and balconies'));
  assert.doesNotMatch(lines(draft), /nail gun|glue instead of nailing|MDF/i);
  for (const item of ['Elevating work platform', 'Nail gun', 'Tile saw']) assert.ok(!plantOf(draft).includes(item), item);
  assert.ok(plantOf(draft).includes('Mobile scaffold'));
  assert.ok(!draft.highRisk.some((label) => /powered mobile plant/i.test(label)));
  // What is cleaned off is not a product the crew uses; the cleaning chemicals are.
  const types = typeItems(draft, bodyOf(CLEANING)).map((item) => item.type);
  for (const type of ['Paints and coatings', 'Adhesives', 'Cement, concrete, grout and mortar', 'Wood dust (MDF and hardwood)']) assert.ok(!types.includes(type), type);
  assert.ok(types.includes('Cleaning chemicals'));
  assert.ok(!(questionsFor({ ...SITE, ...CLEANING }).required || []).some((item) => item.id === 'silicaControls'));
  // A cleaning sentence that also builds keeps its work.
  assert.ok(picks({ state: 'act', fallRisk: 'no', crane: 'none', task: 'Clean all windows. Install new tiles to the foyer floor and grout them.' }).chosen.includes('tileLay'));
  // An EWP the task names for use is still used.
  assert.ok(picks({ state: 'act', fallRisk: 'yes', crane: 'none', task: 'Clean all windows from our EWP. No EWP on the tiled foyer floor.' }).chosen.includes('cleaningHeight'));
});

test('B run 8: posts set in bagged concrete beside a footpath named as the place tick no slab and reo steps', () => {
  const steps = picks(FENCING);
  assert.ok(!steps.chosen.includes('slabGround'));
  const draft = draftOf(FENCING);
  for (const name of ['Set out', 'Prepare the ground', 'Set edge forms and prepare the base', 'Place and tie reo on the ground']) assert.ok(!names(draft).includes(name), name);
  assert.deepEqual(names(draft), ['Before starting', 'Take down the old fence', 'Dig post holes', 'Build the fence', 'Finish and clean up']);
  // A path poured with the fence still gets its slab steps.
  assert.ok(picks({ state: 'nt', fallRisk: 'no', crane: 'none', task: 'Build a new pool fence and pour a 20 m concrete footpath beside it.' }).chosen.includes('slabGround'));
});

test('B run 5: "hoist" in an own step is not a personnel or materials hoist, and its licence does not print', () => {
  const draft = draftOf({ ...LIFTS, ownSteps: [own('hoist rails n landing doors up the shaft with chain blocks')] }, LIFTS_GIVEN);
  assert.ok(!plantOf(draft).includes('Personnel or materials hoist'));
  assert.doesNotMatch(JSON.stringify(draft.qualifications), /\bHP\b|\bHM\b/);
  assert.deepEqual(plantFor('hoist rails n landing doors up the shaft with chain blocks').map((item) => item.item), ['Lifting beam and chain block']);
  assert.deepEqual(plantFor('materials go up the builders hoist').map((item) => item.item), ['Personnel or materials hoist']);
});

test('A run 1: the plumbing fit-off left out as others\' takes its rough-in with it, so no chasing or silica for the kitchen installer', { skip: !haveReadings }, () => {
  const input = pack('a-commercial-kitchens', 'Trade installation: commercial kitchens', { state: 'nsw', crane: 'none', fallRisk: 'no' });
  assert.ok(input.leaveOut.includes('Plumbing fit-off'));
  assert.ok(!picks(input).chosen.includes('plumbingFitOff'));
  const draft = draftOf(input);
  assert.ok(!names(draft).includes('Plumbing rough-in'));
  assert.equal(rules.silicaStep(draft) === 'Plumbing rough-in', false);
  // A rough-in the task's own words name stays.
  assert.ok(picks({ ...input, task: `${input.task} Rough-in the new wastes in the walls.` }).chosen.includes('plumbingFitOff'));
});

test('A run 3: a fence named as the place is not a fence built', () => {
  const steps = picks(WALL);
  assert.ok(!steps.chosen.includes('fenceBuild'));
  assert.ok(steps.chosen.includes('retainingWall'));
  assert.ok(picks({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'Replace the old boundary fence with a new colorbond fence.' }).chosen.includes('fenceBuild'));
  assert.ok(picks({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'Install 50m of pool fence.' }).chosen.includes('fenceBuild'));
});

test('A run 1: a reworded cool room task keeps its panels, ticks the mobile scaffold it names, and has no EWP lines, joinery or doors', { skip: !haveReadings }, () => {
  const steps = picks(COOLROOM);
  assert.deepEqual([...steps.chosen].sort(), ['coolroomPanels', 'mobileScaffold']);
  const draft = draftOf(COOLROOM);
  assert.ok(names(draft).includes('Use mobile scaffolds'));
  assert.ok(names(draft).includes('Erect coolroom panels'));
  assert.doesNotMatch(lines(draft), /worker in an EWP/);
  assert.ok(!plantOf(draft).includes('Elevating work platform'));
  // A cool room put up from an EWP keeps its EWP line.
  assert.match(lines(draftOf({ ...COOLROOM, task: 'Install the EPS panel cool room. Tall wall panels stood from our scissor lift EWP.' })), /worker in an EWP/);
  // The kitchen's shelving "in the cool rooms" prints no cool room panel lines in "Deliver and install".
  const kitchen = draftOf(pack('a-commercial-kitchens', 'Trade installation: commercial kitchens', { state: 'nsw', crane: 'none', fallRisk: 'no' }));
  assert.doesNotMatch(lines(kitchen), /Coolroom (?:ceiling )?panels/);
  // The project page sends a reworded task's scope steps to be kept, not as the picks.
  const page = fs.readFileSync(require.resolve('../public/project-go.js'), 'utf8');
  assert.match(page, /priorKinds: reworded\(item\)/);
});

test('A run 1: electrical and plumbing work others do brings no electrical lines or low voltage rescue licence, and no plumbing licence', { skip: !haveReadings }, () => {
  const input = pack('a-commercial-kitchens', 'Trade installation: commercial kitchens', { state: 'nsw', crane: 'none', fallRisk: 'no' });
  const draft = draftOf({ ...input, task: `${input.task}${KITCHEN_NOTES}` });
  assert.ok(!draft.qualifications.some((name) => /low voltage rescue|Plumbing licence|Electrical licence/i.test(name)), JSON.stringify(draft.qualifications));
  assert.doesNotMatch(draft.jobSteps[0].controls.join('\n'), /Electrical work is done or supervised only by licensed electricians/);
  // The crew's own electrical work still brings them.
  const sparky = draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'Install and wire new power circuits to the kitchen equipment from the distribution board.' });
  assert.ok(sparky.qualifications.some((name) => /Electrical licence/i.test(name)));
});

test('B run 6 (decision): a stormwater main in a highway verge is the road\'s drainage network, not plumbing', () => {
  const draft = draftOf(STORMWATER);
  assert.ok(!draft.qualifications.some((name) => /Plumbing/i.test(name)));
  assert.doesNotMatch(lines(draft), /plumbers licensed or registered/);
  assert.ok(!draft.jobSteps.some((step) => step.responsible === 'Licensed plumber'));
  // Stormwater drainage on a building's property is still plumbing.
  const house = draftOf({ state: 'tas', fallRisk: 'no', crane: 'none', task: 'Dig the trench and lay the new house stormwater drain pipes from the downpipes to the property connection.' });
  assert.ok(house.qualifications.some((name) => /Plumbing/i.test(name)));
});

test('A run 2: materials handling for floor covering rolls has no plasterboard sheet wording', { skip: !haveReadings }, () => {
  const draft = draftOf(pack('a-carpet-vinyl-rubber', 'Materials handling', { state: 'vic', crane: 'none', fallRisk: 'no' }));
  const step = draft.jobSteps.find((item) => item.step === 'Move materials into place');
  assert.doesNotMatch([...step.hazards, ...step.controls].join('\n'), /sheets, studs|Wind catches large sheets|suction pads for sheets/);
  assert.ok(step.hazards.includes('Strain moving rolls.'));
  assert.ok(step.controls.some((line) => /^Move rolls with trolleys or hand trucks/.test(line)));
  // Sheets still read as sheets.
  assert.match(lines(draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', kinds: ['carpLoad'], task: 'Carry plasterboard sheets and studs up to level 2.' })), /sheets, studs/);
});

// ---- 2. One typo lost the whole job ----

test('A run 3: a trade word misspelt in the company name too is read and fixed in the task, and a stand-down says the words it could not read', () => {
  assert.equal(fixSpelling('build a retaning wall', { names: ['north qld retaning walls'] }).text, 'build a retaining wall');
  assert.equal(fixSpelling('along stuart hwy', { places: '400 Stuart Hwy' }).text, 'along stuart hwy');
  const draft = draftOf(WALL);
  assert.equal(draft.kind, 'draft');
  assert.deepEqual(names(draft), ['Before starting', 'Build the retaining wall', 'Install drainage behind the retaining wall', 'Backfill behind the retaining wall', 'Finish and clean up']);
  assert.match(draft.task, /retaining wall/);
  assert.deepEqual(draft.notCovered, []);
  const asked = questionsFor({ state: 'qld', task: 'install a flurbinator on the wall bracket', fallRisk: 'no', crane: 'none' });
  if (asked.standDown) assert.match(asked.standDown.message, /could not read this word in the task: "flurbinator"/);
  const down = questionsFor({ state: 'qld', task: 'flurbinate the wazzlecrump', fallRisk: 'no', crane: 'none' });
  assert.ok(down.standDown);
  assert.match(down.standDown.message, /could not read these words in the task: "flurbinate", "wazzlecrump"/);
});

// ---- 3. Missing core work ----

test('missing core work: the lift rails hoisted up the shaft are stepped, and the bedding, the pit connection and a cool room\'s hung ceiling are listed', { skip: !haveReadings }, () => {
  const lift = draftOf(LIFTS, LIFTS_GIVEN);
  assert.ok(before(names(lift), 'Lift machines, rails and equipment into the shaft', 'Install the lift rails, car and machine'));
  // The library holds no step that lays pipe bedding or cuts into a live pit (D181): both are listed.
  const pipe = draftOf(STORMWATER);
  assert.ok(pipe.notCovered.some((part) => /^bed and backfill with crushed rock$/.test(part)), JSON.stringify(pipe.notCovered));
  assert.ok(pipe.notCovered.some((part) => /existing pit/.test(part)));
  assert.ok(draftOf(COOLROOM).notCovered.some((part) => /ceiling panels hung off the slab/.test(part)));
  // Falls Yes on a roof with only a ladder line: the edge step carries the roof fall control.
  const refrig = pack('a-commercial-kitchens', 'Trade installation: refrigeration', { state: 'nsw', crane: 'none', fallRisk: 'yes' });
  const roof = draftOf(refrig, { fallControl: 'Roof edge guardrail is installed to every open edge before work starts, and no one works outside it.' });
  const edge = roof.jobSteps.find((step) => step.step === 'Work at edges');
  assert.ok(edge && edge.controls.some((line) => /^Roof edge guardrail/.test(line)));
  assert.ok(!names(draftOf({ ...refrig, fallRisk: 'no' })).includes('Work at edges'));
});

// ---- 4. False items in "work with no job steps" ----

test('B runs 5 and 7: a quantity, where the work is, and a list inside one sentence are not listed as work with no job steps', () => {
  assert.deepEqual(draftOf(LIFTS, LIFTS_GIVEN).notCovered, []);
  assert.deepEqual(draftOf(CLEANING).notCovered, []);
  // With the window cleaning taken off, the window sentence is not split into pieces, and the place words are not listed.
  const left = draftOf({ ...CLEANING, kinds: ['mobileScaffold', 'cleaning'] }).notCovered;
  assert.ok(!left.some((part) => /^(?:render and the like|mortar tags|Both internal and external)/i.test(part)), JSON.stringify(left));
  assert.ok(left.some((part) => /glass/i.test(part)));
});

// ---- 5. SiteWrite's own order ----

test('SiteWrite\'s own order: cleaners do the glass before the floors, and the kitchen equipment is delivered before the appliance is set', { skip: !haveReadings }, () => {
  assert.ok(before(names(draftOf(CLEANING)), 'Clean windows and balconies', 'Clean floors, fixtures and plant rooms'));
  const kitchen = names(draftOf(pack('a-commercial-kitchens', 'Trade installation: commercial kitchens', { state: 'nsw', crane: 'none', fallRisk: 'no' })));
  assert.ok(before(kitchen, 'Deliver and install commercial kitchen equipment', 'Set and connect the appliance'), kitchen.join(' | '));
});

// ---- 6. W17 ----

const MOVES = [
  { what: 'B run 5: finish above the install', wrong: ['Before starting', 'Finish and clean up', 'Install the lift rails, car and machine'], right: ['Before starting', 'Install the lift rails, car and machine', 'Finish and clean up'] },
  { what: 'B run 5: hoisting after the install', wrong: ['Before starting', 'Install the lift rails, car and machine', 'Lift machines, rails and equipment into the shaft', 'Finish and clean up'], right: ['Before starting', 'Lift machines, rails and equipment into the shaft', 'Install the lift rails, car and machine', 'Finish and clean up'] },
  { what: 'A run 1: the appliance connected before delivery', wrong: ['Before starting', 'Set and connect the appliance', 'Deliver and install commercial kitchen equipment', 'Finish and clean up'], right: ['Before starting', 'Deliver and install commercial kitchen equipment', 'Set and connect the appliance', 'Finish and clean up'] },
  { what: 'B run 7: floors before the windows', wrong: ['Before starting', 'Clean floors, fixtures and plant rooms', 'Clean windows and balconies', 'Finish and clean up'], right: ['Before starting', 'Clean windows and balconies', 'Clean floors, fixtures and plant rooms', 'Finish and clean up'] },
];

test('W17 flags each clearly wrong move of round 14, names the whole move, and SiteWrite sorts it back', () => {
  for (const item of MOVES) {
    assert.ok(firmFaults(asSteps(item.wrong)).length > 0, `${item.what}: not flagged`);
    assert.deepEqual(firmFaults(asSteps(item.right)), [], `${item.what}: right order flagged`);
    assert.deepEqual(inStageOrder(asSteps(item.wrong)).map((step) => step.step), item.right, item.what);
  }
  // A run 3: backfill moved above the wall names the wall as well as the drainage.
  const wall = firmFaults(asSteps(['Before starting', 'Backfill behind the retaining wall', 'Build the retaining wall', 'Install drainage behind the retaining wall', 'Finish and clean up']));
  assert.deepEqual(wall.map((fault) => fault.step), ['Build the retaining wall', 'Install drainage behind the retaining wall']);
  // B run 7: the scaffold moved below all the cleaning, after the floors, is flagged against the work done from it.
  const scaffold = firmFaults(asSteps(['Before starting', { step: 'Clean all windows and glass inside and out (Our own step)', hazards: ['A fall from the mobile scaffold.'], controls: [] }, 'Clean with chemicals', 'Clean floors, fixtures and plant rooms', 'Use mobile scaffolds', 'Finish and clean up']));
  assert.deepEqual(scaffold.map((fault) => [fault.step, fault.after]), [['Use mobile scaffolds', 'Clean all windows and glass inside and out (Our own step)']]);
  // An access-only SWMS is not flagged.
  assert.deepEqual(firmFaults(asSteps(['Before starting', 'Use mobile scaffolds', 'Work from ladders', 'Work from trestle platforms', 'Finish and clean up'])), []);
  // Every firm chain agrees with the stage map where both steps have a stage.
  for (const chain of FIRM) for (let g = 0; g < chain.length; g += 1) for (let h = g + 1; h < chain.length; h += 1) {
    for (const a of chain[g]) for (const b of chain[h]) if (typeof stageOf(a) === 'number' && typeof stageOf(b) === 'number') assert.ok(stageOf(a) < stageOf(b), `${a} / ${b}`);
  }
  // The builder check gives W17 with "Finish and clean up" moved above the install, and none on SiteWrite's own order.
  const lift = draftOf(LIFTS, LIFTS_GIVEN);
  const w17 = (swms) => checked(swms, 'sa').findings.find((item) => item.rule === 'W17');
  assert.ok(!w17(lift) || w17(lift).pass);
  const moved = { ...lift, jobSteps: [lift.jobSteps[0], lift.jobSteps[lift.jobSteps.length - 1], ...lift.jobSteps.slice(1, -1)] };
  assert.ok(w17(moved) && /Finish and clean up/.test(w17(moved).message));
});

// ---- 7. Own steps in the wrong place ----

test('own steps go where their work is done: hoisting before the install, bedding before the pipe, protection before the install, unloading before moving', { skip: !haveReadings }, () => {
  const lift = names(draftOf({ ...LIFTS, ownSteps: [own('hoist rails n landing doors up the shaft with chain blocks')] }, LIFTS_GIVEN));
  assert.ok(before(lift, 'hoist rails n landing doors up the shaft with chain blocks (Our own step)', 'Install the lift rails, car and machine'), lift.join(' | '));
  const pipe = names(draftOf({ ...STORMWATER, ownSteps: [own('lay n compact crushed rock beding in the trench'), own('connect into the existing pit, cut the pit wall with a wet saw')] }));
  assert.ok(before(pipe, 'lay n compact crushed rock beding in the trench (Our own step)', 'Lay pipes'), pipe.join(' | '));
  assert.ok(before(pipe, 'Lay pipes', 'connect into the existing pit, cut the pit wall with a wet saw (Our own step)'));
  assert.ok(before(pipe, 'connect into the existing pit, cut the pit wall with a wet saw (Our own step)', 'Backfill the trench'));
  const kitchen = names(draftOf({ ...pack('a-commercial-kitchens', 'Trade installation: commercial kitchens', { state: 'nsw', crane: 'none', fallRisk: 'no' }), ownSteps: [own('Protect finished floors and walls before moving equipment in')] }));
  assert.ok(before(kitchen, 'Protect finished floors and walls before moving equipment in (Our own step)', 'Deliver and install commercial kitchen equipment'));
  const doors = names(draftOf({ ...pack('a-doors-hardware', 'Trade installation: doors and frames', { state: 'wa', crane: 'none', fallRisk: 'no' }), ownSteps: [own('Protect finished floors, walls and frames')] }));
  assert.equal(doors[1], 'Protect finished floors, walls and frames (Our own step)', doors.join(' | '));
  const handling = names(draftOf({ ...pack('a-carpet-vinyl-rubber', 'Materials handling', { state: 'vic', crane: 'none', fallRisk: 'no' }), ownSteps: [own('Unload and check the delivery of carpet rolls and vinyl at the site gate')] }));
  assert.ok(before(handling, 'Unload and check the delivery of carpet rolls and vinyl at the site gate (Our own step)', 'Move materials into place'));
});

// ---- 8. Products in the wrong step ----

test('products go to the step that uses them: old footings to the take-down, refrigerant to the charging, fire sealant to the frames, none to a protection step', () => {
  const steps = (list) => list.map((step) => (typeof step === 'string' ? { step, hazards: [], controls: [] } : step));
  const fence = steps(['Before starting', 'Take down the old fence', { step: 'Dig post holes', hazards: ['Silica dust, noise and flying particles from cutting and coring.'], controls: ['Where posts are set in paving or concrete, core or cut the hole with water suppression or on-tool extraction.'] }, 'Build the fence', 'Finish and clean up']);
  assert.equal(rules.stepOf({ product: 'Old concrete post footings', type: rules.SILICA }, fence), 'Take down the old fence');
  const refrig = steps(['Before starting', { step: 'Run and fix refrigerant pipe and pair coil', hazards: ['Refrigerant release.'], controls: ['Refrigerant lines are capped.'] }, 'Braze refrigerant pipework', 'Pressure test with nitrogen', 'Evacuate and charge the system', 'Finish and clean up']);
  assert.equal(rules.stepOf({ product: 'R448A refrigerant', type: 'Refrigerants' }, refrig), 'Evacuate and charge the system');
  const doors = [...steps(['Before starting', { step: 'Drill or cut concrete, masonry or stone', hazards: ['Silica dust from drilling.'], controls: ['Sealants are used as their safety data sheets set out.'] }, 'Use power tools', 'Hang the doors', 'Fit locks, closers and other hardware', 'Finish and clean up']), { step: 'Protect finished floors, walls and frames (Our own step)', own: true, hazards: [], controls: [] }];
  assert.equal(rules.stepOf({ product: 'Fire rated sealant', type: 'Sealants, mastics and silicone' }, doors), 'Hang the doors');
  assert.notEqual(rules.stepOf({ product: 'MDF door frames and leaves', type: 'Wood dust (MDF and hardwood)' }, doors), 'Protect finished floors, walls and frames (Our own step)');
  assert.notEqual(rules.stepOf({ product: 'Masonry walls drilled for frame anchors', type: rules.SILICA }, doors), 'Protect finished floors, walls and frames (Our own step)');
});

// ---- 9. Substances ----

test('substances: silica beside a masonry saw, not refused by a conditional line, brazing gases kept, cement for concreted posts, a fuel reason that names one machine', { skip: !haveReadings }, () => {
  // B run 6: the own step cuts the pit wall with a confirmed wet saw.
  const pipe = draftOf({ ...STORMWATER, ownSteps: [own('connect into the existing pit, cut the pit wall with a wet saw')] });
  assert.ok(typeItems(pipe, bodyOf({ ...STORMWATER, ownSteps: [own('connect into the existing pit, cut the pit wall with a wet saw')] })).some((item) => item.type === rules.SILICA));
  // B run 8: augered post holes in sand, with the library's "Where posts are set in paving or concrete" line, do not refuse silica.
  const fence = draftOf(FENCING);
  assert.equal(rules.silicaStep(fence), '');
  assert.equal(rules.notUsedNeed(rules.SILICA, 'holes augered in sand, no concrete or pavers cut', rules.ownWords(bodyOf(FENCING)), rules.stepWords(fence), '', rules.silicaStep(fence), fence), '');
  // A run 1: brazing prints, so the gases stay asked and the torch is in the plant list.
  const refrig = pack('a-commercial-kitchens', 'Trade installation: refrigeration', { state: 'nsw', crane: 'none', fallRisk: 'no' });
  const brazed = draftOf(refrig);
  assert.ok(names(brazed).includes('Braze refrigerant pipework'));
  assert.ok(plantOf(brazed).includes('Oxy-acetylene or gas torch set'));
  assert.ok(typeItems(brazed, bodyOf(refrig)).some((item) => /^Gases/.test(item.type)));
  // A run 3: posts concreted in ask for cement.
  const wall = draftOf(WALL);
  assert.ok(typeItems(wall, bodyOf(WALL)).some((item) => /^Cement/.test(item.type)));
  // A run 3: a fuel reason that names the excavator does not settle the plate compactor.
  assert.match(rules.notUsedNeed('Fuels (diesel, petrol)', 'we fill the excavator at the yard', rules.ownWords(bodyOf(WALL)), rules.stepWords(wall), '', '', wall), /plate compactor/);
  assert.equal(rules.notUsedNeed('Fuels (diesel, petrol)', 'all our plant is filled at the yard', rules.ownWords(bodyOf(WALL)), rules.stepWords(wall), '', '', wall), '');
});

// ---- 10. Plant ----

test('plant: a hot air gun is a power tool, scope plant chips carry no notes or products, trestles are listed', { skip: !haveReadings }, () => {
  const floors = draftOf(pack('a-carpet-vinyl-rubber', 'Trade installation: floor finishes', { state: 'vic', crane: 'none', fallRisk: 'no' }));
  assert.ok(plantOf(floors).includes('Electric power tools and leads'));
  assert.deepEqual(plantFor('Weld vinyl seams with the hot air gun').map((item) => item.item), ['Electric power tools and leads']);
  assert.deepEqual(scopeTask.scopePlant([{ plant: 'Heat welding equipment (heat weld named); epoxy adhesive' }, { plant: 'Adhesive (direct stick)' }, { plant: 'Drill (not named)' }, { plant: 'Delivery vehicles; lifting plant not named' }]), ['Heat welding equipment', 'Drill', 'Delivery vehicles']);
  const access = draftOf(pack('a-doors-hardware', 'Access equipment', { state: 'wa', crane: 'none', fallRisk: 'no' }));
  assert.ok(plantOf(access).includes('Trestles and planks'));
});

// ---- 11. SiteWrite's check findings ----

test('the check: a traffic guidance scheme named in the task is the plan, a school-side fence asks no traffic plan, and a banned EWP needs no licence', () => {
  const tgs = draftOf({ ...STORMWATER, task: STORMWATER.task.replace('traffic control by others', 'traffic control by others to traffic guidance scheme TGS-117 by the traffic contractor') });
  const plan = (draft, state) => checked(draft, state).findings.find((item) => item.rule === 'W13' && /traffic management plan or traffic guidance scheme/.test(item.message || ''));
  assert.ok(!plan(tgs, 'tas'));
  assert.ok(plan(draftOf(STORMWATER), 'tas'), 'still asked where no plan is named');
  assert.ok(!plan(draftOf(FENCING_SITE), 'nt'));
  const clean = checked(draftOf(CLEANING), 'act').findings;
  assert.ok(!clean.some((item) => /Match a licence or ticket to the plant and work: EWP/.test(item.message || '')));
  assert.ok(!clean.some((item) => item.rule === 'H1' && !item.pass));
});

// ---- 12. Wording ----

test('wording: "Seal or paint", the by-others review quotes the hanging line, the door picker group is named for both steps, and the cool room title', { skip: !haveReadings }, () => {
  const rows = rowsOf('a-doors-hardware', 'Trade installation: doors and frames');
  assert.match(scopeTask.plainTask(rows), /^Seal or paint bottoms of doors before hanging\. /);
  assert.equal(scopeChoice.ownWorkNaming(rows, 'Hang the doors'), 'Hang timber doors, fire rated and non-fire rated.');
  const doors = stepLibrary().groups.flatMap((group) => group.kinds).find((kind) => kind.id === 'doorHang');
  assert.equal(doors.label, 'Door frames and doors (as the task names them)');
  const titles = packageTitles(JSON.parse(fs.readFileSync(`${OUT}/a-commercial-kitchens.json`, 'utf8')).reading);
  assert.equal(titles['Trade installation: cool rooms'], 'Cool rooms');
});
