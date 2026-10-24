// Content faults found by the messy-user test on staging (14 October 2026, run 2 on 901a302), each
// fixed by a general rule: wrong or duplicate job steps, packages named and grouped differently for the
// same work, and step PPE that contradicted itself (D246 to D248). The scope wording is neutral test text.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, packageKinds, suggestedKinds } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { readSlang } = require('../slang');
const { settlePackages } = require('../ai-scope');
const { packagesOf, pickFor, projectItems } = require('../public/scope-choice');
const { packageTask } = require('../public/scope-task');
const { splitPpe } = require('../step-ppe');
const { checkSwms, fromDraft } = require('../builder-check');
const { foreman, admin } = require('./frp-readings.data');

const SITE = { state: 'qld', fallRisk: 'yes', residential: 'no', company: 'Test', workplace: '12 Smith Street, Paddington QLD 4064', principalContractor: 'ABC Builders Pty Ltd' };
function answered(input) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id]) continue;
      facts[item.id] = item.choices ? item.choices[0].value : ((answersFor(item.id, asked.task)[0] || {}).text || 'As set out in the site plan.').replace(/_{3,}/g, 'as on the site plan');
      added = true;
    }
    if (!added) break;
  }
  return { ...input, facts };
}
const draftOf = (input) => prepareDraft(draftBody(answered(input)));
const names = (draft) => draft.jobSteps.map((step) => step.step);
const ticked = (draft) => draft.ppe.flatMap((group) => group.items.filter((item) => item.ticked));
const allWork = (draft) => ticked(draft).filter((item) => !item.steps).map((item) => item.id);
const forSteps = (draft, id) => (ticked(draft).find((item) => item.id === id) || {}).steps || [];

// The SWMS made from a package of a reading, as the page makes it (scope-choice projectItems).
function fromScope(reading, name, extra = {}) {
  const settled = settlePackages(reading);
  const [item] = projectItems(settled, [name], { crane: 'company' });
  assert.ok(item, `package ${name}`);
  return draftOf({ ...SITE, task: item.task, kinds: item.kinds, leaveOut: item.leaveOut, crane: 'company', ...extra });
}
const POUR = 'Concrete placing and finishing';

// ---- 1. Wrong or duplicate steps ----

test('typed "form up and pour L2 slab, reo, pump" gets the formwork steps, then reo, then the pump set up before the pour', () => {
  assert.equal(readSlang('form up and pour L2 slab, reo, pump'), 'erect formwork and pour level 2 slab, reo, pump');
  assert.equal(readSlang('form up the deck'), 'erect formwork to the deck');
  // Forming up penetrations is left as it is: it is not slab formwork.
  assert.equal(readSlang('Form up all penetrations, openings and recesses in slabs'), 'Form up all penetrations, openings and recesses in slabs');
  const draft = draftOf({ ...SITE, task: 'form up and pour L2 slab, reo, pump' });
  assert.equal(draft.kind, 'draft');
  const steps = names(draft);
  for (const name of ['Erect falsework and shores', 'Lay the formwork deck', 'Place and tie reo', 'Set up the concrete pump and placing boom', 'Pump and place concrete', 'Strip the formwork']) assert.ok(steps.includes(name), `${name}: ${steps}`);
  assert.ok(steps.indexOf('Erect falsework and shores') < steps.indexOf('Place and tie reo'));
  assert.ok(steps.indexOf('Set up the concrete pump and placing boom') < steps.indexOf('Pump and place concrete'));
  // No slab on ground steps beside the suspended pour.
  assert.ok(!steps.includes('Place concrete') && !steps.includes('Finish the concrete'), `${steps}`);
});

test('a suspended slab pour from a scope has no slab on ground steps, no rubbish steps from its washout condition, and the pump set up first', () => {
  for (const reading of [foreman(), admin()]) {
    const draft = fromScope(reading, POUR);
    assert.equal(draft.kind, 'draft');
    const steps = names(draft);
    assert.deepEqual(steps, ['Before starting', 'Set up the concrete pump and placing boom', 'Pump and place concrete', 'Finish concrete', 'Finish and clean up']);
  }
  // The rule by itself: slab on ground groups come off a package whose words are all suspended work,
  // the suspended pour steps come in their place, and a washout condition brings no waste steps.
  const task = packageTask(foreman().activities.filter((row) => row.package === 'Trade installation: concrete'));
  assert.deepEqual(packageKinds(task, ['slabPour', 'concrete', 'sawCut']), ['concrete']);
  assert.deepEqual(packageKinds('Pump and place concrete to the level 2 slab.', ['slabPour']), ['concrete']);
  // A ground slab keeps its steps, and a scope that names both keeps both.
  assert.deepEqual(packageKinds('Place and finish concrete slabs on ground and driveways. Pump concrete.', ['slabPour', 'concrete']), ['slabPour', 'concrete']);
  assert.deepEqual(packageKinds('Pour the ground floor slab and the suspended level 1 slab.', ['slabPour', 'concrete']), ['slabPour', 'concrete']);
  // Rubbish named as the work still brings the waste steps; saw cutting openings keeps the saw steps.
  assert.ok(packageKinds('Remove rubbish to the site bins daily.', []).includes('wasteRemoval'));
  assert.ok(packageKinds('Saw cut openings in the suspended slab for the new stair. Place concrete.', ['concrete', 'sawCut']).includes('sawCut'));
});

test('a slab on ground poured by pump sets up the pump before placing the concrete', () => {
  const draft = draftOf({ ...SITE, fallRisk: 'no', task: 'Place and finish the concrete ground slab, pumped with a line pump.', kinds: ['slabPour', 'concrete'] });
  const steps = names(draft);
  // One placing step (messy round 9): the pumped placing takes in "Place concrete".
  const place = steps.includes('Place concrete') ? 'Place concrete' : 'Pump and place concrete';
  assert.ok(steps.includes(place) && !(steps.includes('Place concrete') && steps.includes('Pump and place concrete')), `${steps}`);
  assert.ok(steps.indexOf('Set up the concrete pump and placing boom') < steps.indexOf(place), `${steps}`);
});

test('formwork stripped from slabs on "Levels 1, 2 and roof" is not old roofing', () => {
  const task = 'Supply, erect, strip and remove formwork and propping to all suspended slabs (Levels 1, 2 and roof).';
  assert.ok(!suggestedKinds(task, {}, {}).includes('roofStrip'));
  assert.ok(!suggestedKinds(task, {}, { allWords: true }).includes('roofStrip'));
  assert.ok(suggestedKinds(task, {}, {}).includes('formwork'));
  // Real roof work is still roof work.
  assert.ok(suggestedKinds('Strip and replace the roof sheets.', {}, {}).includes('roofStrip'));
  assert.ok(suggestedKinds('Remove the old roof.', {}, {}).includes('roofStrip'));
});

test('a formwork design not issued holds the steps that build the formwork, not the pour that keeps its load within it', () => {
  const pour = fromScope(foreman(), POUR);
  const design = pour.designs.find((row) => row.id === 'formwork');
  assert.deepEqual(design.steps, ['Pump and place concrete']);
  const notIssued = fromScope(foreman(), POUR, { designs: [{ id: 'formwork', what: 'Formwork design', status: 'notIssued' }] });
  assert.ok(!notIssued.jobSteps.some((step) => step.controls.some((line) => /^Hold point:/.test(line))), 'no hold point on the pour');
  const row = notIssued.designs.find((item) => item.id === 'formwork');
  assert.equal(row.statusText, 'Not issued yet. Update this SWMS when it is issued.');
  // The builder check says the step works to a design not issued yet, not that it is on hold.
  const w16 = checkSwms(fromDraft(notIssued, { state: 'qld' }), { state: 'qld' }).findings.find((item) => item.rule === 'W16');
  assert.match(w16.message, /work to a design not issued yet: Pump and place concrete/);
  assert.doesNotMatch(w16.message, /on hold/);
  // Given, the pour names it as before.
  const given = fromScope(foreman(), POUR, { designs: [{ id: 'formwork', what: 'Formwork design', status: 'given', by: 'Smith Engineering', number: 'FW-101', revision: 'C', date: '2026-10-03' }] });
  assert.ok(given.jobSteps.find((step) => step.step === 'Pump and place concrete').controls.includes('Work to the formwork design FW-101 rev C (Smith Engineering, 3 October 2026).'));
  // In the formwork crew's SWMS the hold point goes on erecting the falsework, not on placing the concrete.
  const typed = draftOf({ ...SITE, task: 'form up and pour L2 slab, reo, pump', designs: [{ id: 'formwork', what: 'Formwork design', status: 'notIssued' }] });
  const held = typed.jobSteps.filter((step) => step.controls.some((line) => /^Hold point: the formwork design is not issued yet\./.test(line))).map((step) => step.step);
  assert.ok(held.includes('Erect falsework and shores'), `${held}`);
  assert.ok(!held.includes('Pump and place concrete') && !held.includes('Monitor the formwork during the pour'), `${held}`);
  assert.match(typed.designs.find((item) => item.id === 'formwork').statusText, /^Not issued yet\. Hold point/);
});

// ---- 2. The same packages, names and trades for the same scope ----

test('the same scope read two ways settles to the same packages, names and pick list trades', () => {
  const view = (reading) => {
    const settled = settlePackages(reading);
    return packagesOf(settled).work.map((pack) => ({ name: pack.name, pick: pickFor(pack.name, pack.rows) })).sort((a, b) => a.name.localeCompare(b.name));
  };
  const one = view(foreman());
  const two = view(admin());
  assert.deepEqual(one.map((item) => item.name), two.map((item) => item.name));
  assert.deepEqual(one.map((item) => item.name), ['Clean up', 'Concrete placing and finishing', 'Deliveries and materials handling', 'Edge protection', 'Formwork and falsework: whole project', 'Plant lifting and cranage', 'Reinforcement']);
  assert.deepEqual(one.map((item) => item.pick), two.map((item) => item.pick));
  const pick = (name) => one.find((item) => item.name === name).pick;
  assert.deepEqual(pick('Reinforcement'), { trade: 'steel-fixing-pt', task: 'reo-decks' });
  assert.deepEqual(pick('Edge protection'), { trade: 'scaffolding', task: 'edge-protection-stairs-nets' });
  assert.deepEqual(pick(POUR), { trade: 'concreting', task: 'suspended-placing' });
  // A package name that only named the work ("Trade installation: concrete") is not kept as a place.
  assert.ok(settlePackages(foreman()).activities.filter((row) => row.package === POUR).every((row) => !/^concrete:/i.test(row.where)));
});

test('edge protection read as access equipment goes to the edge protection package; ladders and EWPs stay', () => {
  const row = (activity, pack) => ({ activity, type: 'Site work', package: pack, crew: '', clause: '', quotes: [], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' });
  const settled = settlePackages({
    activities: [row('Install, maintain and remove edge protection to slab edges and stair voids', 'Access equipment'), row('Use scissor lifts for soffit work', 'Access equipment'), row('Erect slab formwork', 'Trade installation: formwork')],
    packages: [{ package: 'Access equipment', groups: ['edgeProtectionInstall', 'ewp'], unmatched: [], byOthers: [] }, { package: 'Trade installation: formwork', groups: ['formwork'], unmatched: [], byOthers: [] }],
    byOthers: [],
    conflicts: [],
  });
  const packageOf = (activity) => settled.activities.find((item) => item.activity.startsWith(activity)).package;
  assert.equal(packageOf('Install, maintain and remove edge protection'), 'Edge protection');
  assert.equal(packageOf('Use scissor lifts'), 'Access equipment');
  assert.deepEqual(settled.packages.find((item) => item.package === 'Edge protection').groups, ['edgeProtectionInstall']);
  assert.deepEqual(settled.packages.find((item) => item.package === 'Access equipment').groups, ['ewp']);
});

test('reinforcement read into the formwork package becomes its own package; work naming both stays', () => {
  const settled = settlePackages(foreman());
  const reo = settled.activities.find((row) => /^Place and fix reinforcement/.test(row.activity));
  assert.equal(reo.package, 'Reinforcement');
  assert.deepEqual(settled.packages.find((item) => item.package === 'Reinforcement').groups, ['reo']);
  assert.ok(!settled.packages.find((item) => item.package === 'Formwork and falsework: whole project').groups.includes('reo'));
  // One activity that names formwork and reo stays where the AI put it.
  const row = (activity, pack) => ({ activity, type: 'Site work', package: pack, crew: '', clause: '', quotes: [], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' });
  const both = settlePackages({ activities: [row('Form, fix reo and pour the level 1 slab', 'Trade installation: level 1')], packages: [{ package: 'Trade installation: level 1', groups: ['formwork', 'reo', 'concrete'], unmatched: [], byOthers: [] }], byOthers: [], conflicts: [] });
  assert.equal(both.activities[0].package, 'Trade installation: level 1');
});

// ---- 3. Step PPE without contradictions ----

test('PPE for all work has one pair of safety glasses, chosen by the work, and never goggles', () => {
  const eyes = (draft) => allWork(draft).filter((id) => ['glassesClear', 'glassesTinted', 'goggles', 'faceShield'].includes(id));
  // A pour that may run at night: clear. Roofing outdoors: tinted. Indoor work: clear.
  assert.deepEqual(eyes(fromScope(foreman(), POUR)), ['glassesClear']);
  assert.deepEqual(eyes(draftOf({ ...SITE, task: 'Strip and replace the roof sheets on the house.' })), ['glassesTinted']);
  assert.deepEqual(eyes(draftOf({ ...SITE, fallRisk: 'no', task: 'Grout and seal the bathroom floor tiles.' })), ['glassesClear']);
  // Goggles are for the steps that splash, never for all work.
  const pour = fromScope(admin(), POUR);
  assert.ok(!allWork(pour).includes('goggles'));
  assert.deepEqual(forSteps(pour, 'goggles'), ['Pump and place concrete', 'Finish concrete']);
});

test('safety gumboots are for wet concrete steps only, and never listed with safety boots for all work', () => {
  const pour = fromScope(admin(), POUR);
  assert.ok(allWork(pour).includes('boots'));
  assert.deepEqual(forSteps(pour, 'gumboots'), ['Pump and place concrete', 'Finish concrete']);
  // Where every step of the work is wet concrete work, gumboots are the footwear for all work, without boots.
  const ppe = [{ area: 'Feet', items: [{ id: 'boots', label: 'Safety boots', ticked: true }, { id: 'gumboots', label: 'Safety gumboots', ticked: true }] }];
  const wet = [{ step: 'Before starting', hazards: [], controls: [] }, { step: 'Screed the floor', hazards: ['Cement burns to the skin.'], controls: ['Screed is moved by barrow.'] }];
  const feet = splitPpe(ppe, wet, { suggest: true })[0].items.filter((item) => item.ticked).map((item) => item.id);
  assert.deepEqual(feet, ['gumboots']);
  // No wet concrete step: no gumboots.
  const dry = [{ step: 'Before starting', hazards: [], controls: [] }, { step: 'Erect falsework and shores', hazards: ['Falsework collapse.'], controls: ['Water that could wash out under the falsework is diverted away.'] }];
  assert.deepEqual(splitPpe(ppe, dry, { suggest: true })[0].items.filter((item) => item.ticked).map((item) => item.id), ['boots']);
});

test('a P2 respirator only where a step makes dust (cutting, grinding, scabbling), not for placing concrete', () => {
  const pour = fromScope(foreman(), POUR);
  assert.deepEqual(forSteps(pour, 'p2'), ['Finish concrete']);
  assert.ok(!allWork(pour).includes('p2'));
  const typed = draftOf({ ...SITE, task: 'form up and pour L2 slab, reo, pump' });
  assert.ok(!forSteps(typed, 'p2').includes('Pump and place concrete'), `${forSteps(typed, 'p2')}`);
  assert.ok(forSteps(typed, 'p2').includes('Finish concrete'));
  // The pour step's own line about blowing out debris says "never on concrete dust": not a reason for P2.
  const pumpStep = pour.jobSteps.find((step) => step.step === 'Pump and place concrete');
  assert.ok(!pumpStep.controls.some((line) => /^Wear [^.]*P2/.test(line)), pumpStep.controls.filter((line) => /^Wear /.test(line)).join(' '));
});

test('chemical resistant gloves only where cement or a chemical is handled, not for erecting falsework', () => {
  const typed = draftOf({ ...SITE, task: 'form up and pour L2 slab, reo, pump' });
  const chem = forSteps(typed, 'gloveChemical');
  for (const name of ['Erect falsework and shores', 'Inspect before the pour', 'Monitor the formwork during the pour', 'Strip the formwork', 'Set up the concrete pump and placing boom']) assert.ok(!chem.includes(name), `${name}: ${chem}`);
  for (const name of ['Pump and place concrete', 'Finish concrete']) assert.ok(chem.includes(name), `${name}: ${chem}`);
  // A formwork only SWMS has no chemical gloves, and keeps general purpose gloves for all work.
  const formwork = draftOf({ ...SITE, task: 'Erect, strip and remove formwork, propping and back propping to suspended slabs and stairs.', kinds: ['formwork', 'propping'] });
  assert.ok(!ticked(formwork).some((item) => item.id === 'gloveChemical'));
  assert.ok(allWork(formwork).includes('gloveGeneral'));
});

// ---- Round 3 of the messy-user test (14 October 2026, main 28404b2) ----

const lines = (draft) => draft.jobSteps.flatMap((step) => step.controls.map((line) => `${step.step} | ${line}`)).join('\n');

test('erecting and dismantling a scaffold gets the erect and hand over steps; dismantling only does not', () => {
  const both = names(draftOf({ ...SITE, state: 'wa', task: 'erect and dismantel tube and coupler scafold to 3 lifts aroud the building' }));
  for (const name of ['Erect the scaffold', 'Inspect and hand over', 'Dismantle the scaffold']) assert.ok(both.includes(name), `${name}: ${both}`);
  const strike = names(draftOf({ ...SITE, task: 'Dismantle the scaffold around the building.' }));
  assert.ok(strike.includes('Dismantle the scaffold') && !strike.includes('Erect the scaffold'));
});

test('demolition on level 2 of a building gets no formwork, reo or pour steps; formwork to band beams is not post-tensioning', () => {
  const steps = names(draftOf({ ...SITE, state: 'act', fallRisk: 'no', task: 'strip out and demolish internal walls, ceilings and services on level 2 of an occupied office building, including saw cutting slab penetrations and removing old vinyl tiles' }));
  for (const name of ['Erect falsework and shores', 'Place and tie reo', 'Pump and place concrete']) assert.ok(!steps.includes(name), `${name}: ${steps}`);
  assert.ok(steps.includes('Demolish') && steps.includes('Saw cut concrete'));
  const form = suggestedKinds('Erect, strip and remove formwork and propping to suspended slabs, drop panels and band beams. Install back propping to slabs below.', {}, {});
  assert.ok(!form.includes('ptTendons') && !form.includes('stressing'), `${form}`);
  assert.ok(suggestedKinds('Install and stress post-tensioned band beams.', {}, {}).includes('stressing'));
});

test('a trenching job that also digs shallow trenches has one dig and one lay step, in order', () => {
  const draft = draftOf({ ...SITE, state: 'nt', fallRisk: 'no', task: 'Trenching for services, including trenches deeper than 1.5 m: excavate the trench, shore it or use a trench shield, lay the pipes or conduits, backfill and compact in layers, and reinstate the surface. Includes shallow trenches dug by hand.', kinds: ['trench', 'shallowTrench'] });
  const steps = names(draft);
  assert.ok(!steps.includes('Dig the trench') && !steps.includes('Lay the pipe or cable'), `${steps}`);
  assert.ok(steps.indexOf('Excavate') < steps.indexOf('Reinstate the surface'));
});

test('lines that apply only to some work stay out of other work', () => {
  // Butt fusion in risers: no trench line.
  const risers = lines(draftOf({ ...SITE, state: 'sa', task: 'Hydraulic pipework at height: install risers in shafts and pipework in ceilings in copper, PVC and polyethylene, joined by brazing, solvent cement and PE fusion welding.', kinds: ['hydraulicRisers', 'hotWork', 'solventCement', 'peFusion'] }));
  assert.doesNotMatch(risers, /lowered in, or in a trench/);
  // ... and no harness rescue line where no harness is used.
  assert.doesNotMatch(risers, /A harness user never works alone/);
  assert.match(lines(draftOf({ ...SITE, fallRisk: 'no', task: 'Lay a PE water main in a trench, joined by butt fusion.' })), /lowered in, or in a trench/);
  // A suspended slab reo crew: no footing or pit depth lines.
  const reo = lines(draftOf({ ...SITE, state: 'nsw', task: 'Place and fix reinforcement and mesh to suspended slabs, stairs, band beams and drop panels.', kinds: ['reo'] }));
  assert.doesNotMatch(reo, /footing, thickening or pit deeper than 1\.5 m|geotechnical engineer has approved/);
  assert.match(lines(draftOf({ ...SITE, fallRisk: 'no', task: 'Place and fix reo to the footings and ground slab.', kinds: ['reo'] })), /footing, thickening or pit deeper than 1\.5 m/);
  // A concrete washout: no solvent rags.
  const washout = lines(draftOf({ ...SITE, fallRisk: 'no', task: 'Clean up the work area daily and wash out concrete tools at the washout bay.', kinds: ['wasteRemoval'] }));
  assert.doesNotMatch(washout, /solvent-soaked rags|rag container/);
  // Hospital infection control only in a hospital.
  assert.doesNotMatch(lines(draftOf({ ...SITE, task: 'Install fire dampers in the resort corridors.', kinds: ['fireDampers'] })), /infection control/);
  assert.match(lines(draftOf({ ...SITE, task: 'Install fire dampers in the hospital wards.', kinds: ['fireDampers'] })), /infection control/);
});

test('door frames in partitions are not door hanging; a formwork package with a stair does not get the pour steps', () => {
  // Messy round 19 (B run 6): the pressed metal frames are stood with the frame step; still no door is hung (test/content20.test.js).
  assert.deepEqual(packageKinds('Install pressed metal door frames into the drywalls. Install plasterboard ceilings.', ['plasterSheets', 'doorHang']), ['plasterSheets', 'doorHang']);
  assert.deepEqual(packageKinds('Install the door frames into the drywalls. Install plasterboard ceilings.', ['plasterSheets', 'doorHang']), ['plasterSheets']);
  assert.deepEqual(packageKinds('Supply and hang doors to all units.', ['doorHang']), ['doorHang']);
  assert.deepEqual(packageKinds('Erect, strip and remove formwork and propping to suspended slabs. Erect and strip formwork to in situ concrete stairs and landings.', ['formwork', 'slabPour', 'propping']), ['formwork', 'propping']);
});

test('PPE: one hearing protection item, no broad brim indoors, coveralls where the step says so', () => {
  const pour = fromScope(admin(), POUR);
  const hearing = ticked(pour).filter((item) => ['earPlugs', 'earMuffs'].includes(item.id)).map((item) => item.id);
  assert.equal(hearing.length, 1, `${hearing}`);
  const indoor = draftOf({ ...SITE, fallRisk: 'no', task: 'Install plasterboard walls and ceilings in the apartments, inside the building.' });
  assert.ok(!ticked(indoor).some((item) => item.id === 'sunHat'));
  const sampling = draftOf({ ...SITE, fallRisk: 'no', task: 'Take samples of suspect asbestos materials in the office ceilings.', kinds: ['asbestosCheck'] });
  assert.ok(names(sampling).includes('Take samples of suspect materials'), `${names(sampling)}`);
  assert.ok(ticked(sampling).some((item) => item.id === 'coveralls'));
});

test('a daily clean-up read as "Demolition and removal" is named for the clean-up, with its trade', () => {
  const row = (activity, pack) => ({ activity, type: 'Site work', package: pack, crew: '', clause: '', quotes: [], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' });
  const clean = settlePackages({ activities: [row('Clean up work areas daily and remove offcuts and packaging', 'Demolition and removal'), row('Remove rubbish to the site bins', 'Demolition and removal')], packages: [{ package: 'Demolition and removal', groups: ['wasteRemoval'], unmatched: [], byOthers: [] }], byOthers: [], conflicts: [] });
  assert.deepEqual(clean.packages.map((item) => item.package), ['Rubbish removal and site clean-ups']);
  assert.deepEqual(pickFor('Rubbish removal and site clean-ups', []), { trade: 'cleaning', task: 'site-cleanup' });
  const demolish = settlePackages({ activities: [row('Demolish the internal walls', 'Demolition and removal')], packages: [{ package: 'Demolition and removal', groups: ['demolition'], unmatched: [], byOthers: [] }], byOthers: [], conflicts: [] });
  assert.deepEqual(demolish.packages.map((item) => item.package), ['Demolition and removal']);
  // A clean-up named in the AI's own words that already gets the clean-up trade keeps its name.
  const own = settlePackages({ activities: [row('Remove rubbish to the skip bins', 'Housekeeping and waste')], packages: [{ package: 'Housekeeping and waste', groups: ['wasteRemoval'], unmatched: [], byOthers: [] }], byOthers: [], conflicts: [] });
  assert.deepEqual(own.packages.map((item) => item.package), ['Housekeeping and waste']);
});
