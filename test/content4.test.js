// Content faults found by the messy-user test, round 4 on staging (14 October 2026, build 0f7ec70), each
// fixed by a general rule: plant from the task's own work, crane licences where our company runs the crane,
// library lines kept to their own work (wording unchanged, D181), other trades' licences, PPE that agrees
// with the steps, missing steps, the step search, product rows and the builder check.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, suggestedKinds } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { searchSteps, stepLibrary } = require('../steps');
const { matchStep } = require('../public/substance-rules');
const { checkSwms, fromDraft } = require('../builder-check');
const { categoriesFor } = require('../emergency');

const SITE = { state: 'qld', fallRisk: 'yes', residential: 'no', company: 'Test', workplace: '12 Smith Street, Paddington QLD 4064', principalContractor: 'ABC Builders Pty Ltd', hospital: 'Royal Brisbane', firstAider: 'Jo Smith', musterPoint: 'Front gate', worksManager: 'Sam Lee', worksManagerPhone: '0400 118 552', complianceResponsible: 'Sam Lee', reviewer: 'Sam Lee', date: '14 October 2026' };
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
const draftOf = (input) => prepareDraft(draftBody(answered(input)));
const names = (draft) => draft.jobSteps.map((step) => step.step);
const lines = (draft) => draft.jobSteps.flatMap((step) => [...step.hazards, ...step.controls]).join('\n');
const plantNames = (draft) => (draft.plantInferred || []).map((item) => item.item);
const sure = (draft) => (draft.plantInferred || []).filter((item) => !item.maybe).map((item) => item.item);
const ticked = (draft) => draft.ppe.flatMap((group) => group.items.filter((item) => item.ticked)).map((item) => item.id);
const forSteps = (draft, id) => (draft.ppe.flatMap((group) => group.items).find((item) => item.id === id && item.ticked) || {}).steps || null;

const FIRE_SCOPE = 'Install wet pipe sprinkler systems, including monitored valves, test drains, baffles near switchboards and signage. Connect sprinkler test drains to tundishes and pits. Install internal fire hydrants and fire hose reels with signage.';
const WINDOWS = 'Install aluminium windows, external doors and louvres: move the glass and frames to the levels, install the windows, fit the door hardware, and seal the glazing and flashings. Level 3 of an occupied office building: the old windows are removed and new ones installed from inside the floor, with glass and frames taken up in the goods lift.';

// ---- 1. Plant from the task's own work ----

test('a scope row\'s conditions bring no plant: "anti-tamper fixings" is not a rail track machine', () => {
  const draft = draftOf({ ...SITE, trade: 'fire', task: 'Install wet pipe sprinkler systems.', scopeTask: { plain: 'Install wet pipe sprinkler systems.', full: 'Install wet pipe sprinkler systems (all buildings; conditions: Anti-tamper fixings in areas accessible to in-mates).', notes: '' } });
  assert.equal(draft.kind, 'draft');
  assert.ok(!plantNames(draft).includes('Track maintenance machine'), plantNames(draft).join('; '));
  // Rail plant stays for rail track work.
  const rail = draftOf({ ...SITE, fallRisk: 'no', task: 'Tamp and regulate the ballast with the tamping machine during the track possession.' });
  assert.ok(plantNames(rail).includes('Track maintenance machine'), plantNames(rail).join('; '));
});

test('windows installed from inside get no nail gun, bar cutter or carpentry steps, and the scaffold is only a maybe', () => {
  const draft = draftOf({ ...SITE, state: 'wa', task: WINDOWS });
  for (const item of ['Nail gun', 'Bar cutter or cut-off saw']) assert.ok(!plantNames(draft).includes(item), item);
  assert.ok(!sure(draft).includes('Scaffold'), sure(draft).join('; '));
  for (const step of ['Use power tools', 'Move materials into place', 'Hang the doors']) assert.ok(!names(draft).includes(step), step);
  assert.ok(names(draft).includes('Install windows'));
  // Glass handled in the wind is outside work; a facade job keeps it.
  assert.ok(!names(draft).includes('Handle glass in the wind'), names(draft).join('; '));
  assert.ok(names(draftOf({ ...SITE, state: 'wa', task: 'Install aluminium windows and external doors to the new house.' })).includes('Handle glass in the wind'));
  // Timber doors and frames are still carpentry.
  assert.ok(suggestedKinds('Hang the timber doors and fix the architraves.', {}, {}).includes('carpJoinery'));
});

test('roof sheeting suggests ladders, power tools and the roof access plant, and no crane with No crane', () => {
  const draft = draftOf({ ...SITE, state: 'vic', crane: 'none', task: 'replace metal roof sheets and guttering on a 2 storey warehouse, add new insulation and safety mesh' });
  for (const item of ['Ladders', 'Electric power tools and leads', 'Scaffold']) assert.ok(plantNames(draft).includes(item), `${item}: ${plantNames(draft)}`);
  assert.ok(!plantNames(draft).some((item) => /crane/i.test(item)), plantNames(draft).join('; '));
});

// ---- 2. Crane licences where our company runs the crane ----

test('our company\'s crane: the operator\'s licence class and dogging, the operator\'s own steps, not the crane crew step', () => {
  const facts = { craneChart: '25 t at 20 m radius from the crane chart', groundBearing: 'Geotechnical report GR-12 rev B: allowable 200 kPa; 1.2 m x 1.2 m timber mats under each outrigger.' };
  const crawler = draftOf({ ...SITE, fallRisk: 'no', crane: 'own', kinds: ['crane', 'craneInterface'], facts, task: 'Mobile and crawler crane lifting: travel and set up the mobile crane, check the ground and outriggers, plan and rig the lifts, lift, dog and land loads, and pack up.' });
  assert.ok(!names(crawler).includes('Work with the crane crew during lifts'), names(crawler).join('; '));
  assert.ok(names(crawler).includes('Rig and lift the load'));
  assert.ok(crawler.qualifications.some((line) => /^High risk work licence: crawler crane \(slewing mobile crane class for its capacity/.test(line)), crawler.qualifications.join(' | '));
  assert.ok(crawler.qualifications.includes('High risk work licence: dogging or rigging (DG, RB, RI or RA)'));
  assert.ok(!crawler.plant.some((row) => /crane company/i.test(`${row.licence} ${row.inspection}`)), JSON.stringify(crawler.plant));
  // A Franna is non-slewing whatever its capacity; a slewing crane's capacity sets its class.
  const franna = draftOf({ ...SITE, fallRisk: 'no', crane: 'own', facts, task: 'Lift roof trusses with our 25t franna crane, sling and dog the loads.' });
  assert.ok(franna.qualifications.some((line) => /non-slewing mobile crane \(CN\)/.test(line)), franna.qualifications.join(' | '));
  const slewing = draftOf({ ...SITE, fallRisk: 'no', crane: 'own', facts, task: 'Lift precast panels with our 50 t slewing mobile crane.' });
  assert.ok(slewing.qualifications.some((line) => /slewing mobile crane up to 60 t \(C6\)/.test(line)), slewing.qualifications.join(' | '));
  // A crane company's crane keeps its licence with the crane company.
  const theirs = draftOf({ ...SITE, fallRisk: 'no', crane: 'company', slinging: 'crane', task: 'Lift the plant onto the roof with the crane.' });
  assert.ok(!theirs.qualifications.some((line) => /crane \(/.test(line)), theirs.qualifications.join(' | '));
});

// ---- 3. Library lines kept to their own work ----

test('house roof space lines stay out of a correctional facility; a house keeps them', () => {
  const prison = lines(draftOf({ ...SITE, trade: 'fire', task: 'Install fire hydrants and hose reels to cover the roof space of the correctional facility.', kinds: ['fireAtHeight', 'roofSpace'] }));
  assert.doesNotMatch(prison, /Where the house has solar panels|off-peak circuit|Occupants are told before the power/);
  const house = lines(draftOf({ ...SITE, fallRisk: 'no', task: 'Run new cables through the roof space of the house for downlights.' }));
  assert.match(house, /Where the house has solar panels/);
});

test('steel for ceiling fans, painting around plumbing fittings and baffles near switchboards are not electrical or plumbing work', () => {
  const steel = draftOf({ ...SITE, state: 'nsw', crane: 'company', slinging: 'ours', task: 'Erect structural steel roof frame. Install structural steel for architectural accessories: ceiling fans, hanging artwork. Install dyna-bolts and masonry bolts.' });
  assert.doesNotMatch(lines(steel), /Electrical work is done or supervised only by licensed|Apprentices are supervised/);
  for (const step of ['Mix mortar', 'Lay blocks and bricks', 'Hang the doors']) assert.ok(!names(steel).includes(step), step);
  const paint = draftOf({ ...SITE, state: 'sa', trade: 'painting', task: 'Paint internal plasterboard walls and ceilings. Mask and cut in paintwork around electrical and plumbing fittings, switchboards and door glass inserts.' });
  assert.doesNotMatch(lines(paint), /Plumbing and drainage work is done by licensed|Backflow prevention devices/);
  const fire = draftOf({ ...SITE, trade: 'fire', task: FIRE_SCOPE });
  assert.ok(!fire.qualifications.some((line) => /^(Electrical work licence|Plumbing and drainage licence)/.test(line)), fire.qualifications.join(' | '));
  // An electrician's own work keeps its lines and licence.
  const sparky = draftOf({ ...SITE, fallRisk: 'no', task: 'Install new power points and light fittings in the office.' });
  assert.match(lines(sparky), /Electrical work is done or supervised only by licensed/);
});

test('overhead power lines near riggers or scaffolders: the power line row, no low voltage rescue or switchboard questions', () => {
  const draft = draftOf({ ...SITE, state: 'wa', task: 'erect and dismantle tube and coupler scaffold to 3 lifts around building', site: { liveServices: 'Overhead power lines on the street, 5 m from the scaffold.' } });
  assert.ok(draft.highRisk.some((item) => /energised electrical/i.test(item)));
  assert.ok(!draft.qualifications.some((line) => /low voltage rescue/i.test(line)), draft.qualifications.join(' | '));
  assert.ok(draft.emergency.some((row) => row.type === 'Contact with power lines'));
  assert.ok(!draft.emergency.some((row) => /^Electric shock/.test(row.type)));
  assert.ok(!categoriesFor(draft).includes('electrical'));
  // The scaffolder's power line step has no crane, tipper or disc sander lines, and one clearance for the scaffold.
  const step = draft.jobSteps.find((item) => item.step === 'Plan the work near overhead power lines');
  assert.ok(step);
  assert.doesNotMatch(step.controls.join('\n'), /crane|tipper|disc sander|operating plant operated/i);
  assert.doesNotMatch(lines(draft), /^Exclusion zone for an untrained person: 3 m/m);
  // Live parts still bring the low voltage rescue.
  const live = draftOf({ ...SITE, fallRisk: 'no', task: 'Replace the circuit breakers in the energised main switchboard.' });
  assert.ok(live.qualifications.some((line) => /low voltage rescue/i.test(line)), live.qualifications.join(' | '));
});

test('lines for one setting stay there: Bundaberg in Queensland, no principal contractor, the crane company, the shopping centre', () => {
  const wa = lines(draftOf({ ...SITE, state: 'wa', task: 'erect and dismantle tube and coupler scaffold to 3 lifts around building' }));
  assert.doesNotMatch(wa, /north of Bundaberg/);
  const road = draftOf({ ...SITE, state: 'nt', fallRisk: 'no', task: 'Asphalt resurfacing of an arterial road under traffic control at night.' });
  assert.doesNotMatch(lines(road), /Where there is no principal contractor/);
  const noneNamed = draftOf({ ...SITE, state: 'nt', fallRisk: 'no', principalContractor: '', task: 'Asphalt resurfacing of an arterial road under traffic control at night.' });
  assert.match(lines(noneNamed), /Where there is no principal contractor/);
  const roof = lines(draftOf({ ...SITE, state: 'vic', crane: 'none', task: 'replace metal roof sheets on a 2 storey warehouse' }));
  assert.doesNotMatch(roof, /crane company/i);
});

test('work inside a building: no traffic corridor, mobile plant or broad brim from the site answers', () => {
  const draft = draftOf({ ...SITE, state: 'wa', crane: 'none', task: WINDOWS, site: { publicInterface: 'William St footpath is directly below the windows. The builder runs a hoarding and gantry over the footpath.', ground: 'Suspended concrete floor. Glass stillages stand on the marked load area near the goods lift.' } });
  assert.deepEqual(draft.highRisk.filter((item) => /traffic corridor|powered mobile plant/i.test(item)), []);
  assert.doesNotMatch(lines(draft), /reversing alarm/);
  assert.ok(!draft.controls.some((item) => /passing traffic/.test(item.text)));
  for (const id of ['sunHat', 'sunscreen', 'glassesTinted']) assert.ok(!ticked(draft).includes(id), id);
});

test('a paint washout has no cement wash water lines or cement and plaster rows; a concrete washout keeps them', () => {
  const paint = draftOf({ ...SITE, fallRisk: 'no', trade: 'painting', kinds: ['wasteRemoval'], task: 'Set up a paint washout bay at ground level with a bunded tray and settling drums. Wash brushes, rollers and spray gear in it.' });
  assert.ok(paint.jobSteps.some((step) => step.step === 'Wash out tools at the washout bay'), names(paint).join('; '));
  assert.doesNotMatch(lines(paint), /Cement-based compounds|cement and alkaline wash water/);
  assert.match(lines(paint), /solvent-soaked rags are kept wet in a closed container/);
  assert.ok(!paint.substances.items.some((item) => /^(Cement|Plaster)/.test(item.product)), JSON.stringify(paint.substances.items));
  const concrete = draftOf({ ...SITE, fallRisk: 'no', kinds: ['wasteRemoval', 'slabGround'], task: 'Pour the concrete path and wash out the barrows at the washout bay.' });
  assert.match(lines(concrete), /Cement-based compounds have a very high pH/);
});

test('the road profiler\'s operator line cites the moving plant source, not the excavation code', () => {
  const draft = draftOf({ ...SITE, state: 'nsw', fallRisk: 'no', task: 'Asphalt resurfacing of an arterial road: cold planing (profiling) the old wearing course, and laying and rolling asphalt, under traffic control at night.' });
  assert.ok(plantNames(draft).includes('Road profiler'));
  assert.doesNotMatch(lines(draft), /Operators can show they are competent on the type of plant they use\. \([^)]*Excavation/);
});

test('an acrylic sealant leaves out the polyurethane (isocyanate) lines in its step', () => {
  const input = { ...SITE, state: 'sa', fallRisk: 'no', task: 'Seal the window frames and skirting joints with acrylic gap sealant.', kinds: ['caulking'], substances: [{ id: 'sub-1', type: 'Sealants, mastics and silicone', product: 'Gap Filler Acrylic', supplier: 'X', sdsDate: '2025-02-01', hazards: ['Not classified as hazardous.'], controls: ['Wear safety glasses.', 'Wear gloves.'], firstAid: ['Rinse eyes with water.'], storage: ['Store below 30 C.'], confirmed: true }] };
  const draft = draftOf(input);
  const step = draft.jobSteps.find((item) => item.step === 'Apply sealant and caulking');
  assert.ok(step);
  assert.doesNotMatch([...step.hazards, ...step.controls].join('\n'), /isocyanate|polyurethane/i);
  const without = draftOf({ ...input, substances: [] });
  assert.match(lines(without), /polyurethane/i);
});

// ---- 5. PPE agrees with the steps ----

test('a harness named in the controls, and a P2 in the user\'s own step, are in the PPE table', () => {
  const draft = draftOf({ ...SITE, state: 'nsw', crane: 'company', slinging: 'ours', kinds: ['steelLift', 'steelErect'], ppe: ['hardHat', 'glassesClear', 'gloveGeneral', 'sleevesLong', 'pantsLong', 'hivis', 'boots'],
    facts: { fallControl: 'Connections are made from boom lifts with guardrails, with harnesses attached to the boom lift anchor points.' },
    ownSteps: [{ name: 'Install dyna-bolts and masonry bolts', hazards: ['Silica dust drilling fixings'], controls: ['Drill with on-tool extraction, P2 mask'] }],
    task: 'Erect structural steel roof frame. Install dyna-bolts and masonry bolts.' });
  assert.ok(ticked(draft).includes('harness'), ticked(draft).join(' '));
  assert.ok(ticked(draft).includes('p2') || ticked(draft).includes('halfFace'), ticked(draft).join(' '));
});

test('glasses and sun protection: clear for wet areas, tinted for outdoor crane work', () => {
  const wet = draftOf({ ...SITE, state: 'tas', fallRisk: 'no', task: 'waterproof wet areas and balconies, liquid membrane and torch on membrane to podium' });
  assert.ok(ticked(wet).includes('glassesClear') && !ticked(wet).includes('glassesTinted'), ticked(wet).join(' '));
  const crane = draftOf({ ...SITE, fallRisk: 'no', crane: 'own', kinds: ['crane'], facts: { craneChart: '25 t at 20 m radius from the crane chart', groundBearing: 'Geotechnical report GR-12 rev B: allowable 200 kPa, timber mats.' }, task: 'Mobile crane lifting: travel and set up the mobile crane, rig the lifts, lift and land loads.' });
  assert.ok(ticked(crane).includes('glassesTinted') && !ticked(crane).includes('glassesClear'), ticked(crane).join(' '));
});

test('hot asphalt\'s SDS asking for heat resistant gloves ticks them; sanding and clean-up get no chemical gloves; planning core holes needs no gumboots', () => {
  const asphalt = draftOf({ ...SITE, state: 'nt', fallRisk: 'no', task: 'Lay and roll asphalt on the arterial road under traffic control at night.', substances: [{ id: 'sub-1', type: 'Bitumen and asphalt', product: 'Dense graded asphalt AC14', supplier: 'X', sdsDate: '2024-05-01', hazards: ['Contact with hot product causes burns.'], controls: ['Wear heat resistant gloves.'], firstAid: ['Cool burns with water.'], storage: ['Not stored.'], confirmed: true }] });
  assert.ok(ticked(asphalt).includes('gloveWelding'), ticked(asphalt).join(' '));
  // The asphalt paver's screed is not a concrete screed: no chemical gloves for laying asphalt.
  assert.ok(!(forSteps(asphalt, 'gloveChemical') || []).includes('Lay and roll asphalt'), String(forSteps(asphalt, 'gloveChemical')));
  const slab = draftOf({ ...SITE, fallRisk: 'no', task: 'Place, screed and finish the concrete slab.' });
  assert.ok(ticked(slab).includes('gloveChemical'), ticked(slab).join(' '));
  const paint = draftOf({ ...SITE, state: 'sa', fallRisk: 'no', task: 'Prepare and paint the internal walls: fill, sand, prime and paint, and clean up.', kinds: ['painting', 'siteClean'] });
  for (const step of ['Sand and fill surfaces', 'Clean up the work area']) assert.ok(!(forSteps(paint, 'gloveChemical') || []).includes(step), `${step}: ${forSteps(paint, 'gloveChemical')}`);
  const core = draftOf({ ...SITE, fallRisk: 'no', task: 'Core drill penetrations through the slab after scanning.' });
  assert.ok(!(forSteps(core, 'gumboots') || []).includes('Plan core holes'), String(forSteps(core, 'gumboots')));
});

// ---- 6. Missing or wrong steps ----

test('painting from a confirmed EWP and mobile scaffold, with an airless sprayer, has the height and spray steps', () => {
  const draft = draftOf({ ...SITE, state: 'sa', trade: 'painting', kinds: ['painting'], task: 'Paint the external cladding and fascias.', plantChoice: { used: ['Elevating work platform', 'Mobile scaffold'], notUsed: [], added: [{ item: 'Airless paint sprayer', licence: 'No' }] } });
  for (const step of ['Use an elevating work platform', 'Use mobile scaffolds', 'Spray paint with airless sprayers']) assert.ok(names(draft).includes(step), `${step}: ${names(draft)}`);
});

test('guttering gets its gutter step; "Work at edges" does not print with falls No', () => {
  const gutters = draftOf({ ...SITE, state: 'vic', task: 'replace the guttering and downpipes on a 2 storey warehouse' });
  assert.ok(names(gutters).includes('Install gutters and downpipes'), names(gutters).join('; '));
  const membrane = draftOf({ ...SITE, state: 'tas', fallRisk: 'no', task: 'waterproof the balconies with liquid membrane' });
  assert.ok(!names(membrane).includes('Work at edges'), names(membrane).join('; '));
  const yes = draftOf({ ...SITE, state: 'tas', fallRisk: 'yes', task: 'waterproof the balconies with liquid membrane' });
  assert.ok(names(yes).includes('Work at edges'), names(yes).join('; '));
});

// ---- 7. The step search ----

test('the step search ranks whole words and the trade first, and lists few unrelated steps', () => {
  const label = new Map(stepLibrary().groups.flatMap((group) => group.kinds).map((kind) => [kind.id, kind.label]));
  assert.ok(searchSteps('store').length <= 8, String(searchSteps('store').length));
  assert.equal(label.get(searchSteps('profil')[0]), 'Run the road plant inside the work zone');
  assert.equal(label.get(searchSteps('cold planing')[0]), 'Run the road plant inside the work zone');
  assert.deepEqual(searchSteps('tack'), []);
  // A whole word in a step's name still comes first.
  assert.equal(label.get(searchSteps('asphalt')[0]), 'Lay and roll asphalt');
});

// ---- 8. Product rows and matching ----

test('products go in the step that uses them, and plant types follow the plant confirmed', () => {
  const steps = (...list) => list.map((step) => ({ step, hazards: [], controls: [] }));
  assert.equal(matchStep('Paints and coatings', steps('Before starting', 'Prepare to paint', 'Paint')), 'Paint');
  assert.equal(matchStep('Fuels (diesel, petrol)', [{ step: 'Run the road plant inside the work zone', hazards: [], controls: [] }, { step: 'Paint line marking', hazards: [], controls: ['Petrol engines are refuelled only when stopped and cool.'] }]), 'Run the road plant inside the work zone');
  const torch = draftOf({ ...SITE, fallRisk: 'no', task: 'Lay torch-on membrane to the podium with an LPG torch.' });
  assert.ok(plantNames(torch).includes('LPG gas torch') && !plantNames(torch).includes('Oxy-acetylene or gas torch set'), plantNames(torch).join('; '));
  assert.ok(!names(torch).includes('Connect, leak test and commission the gas appliance'));
  const unticked = draftOf({ ...SITE, fallRisk: 'no', task: 'Braze the copper pipe joints in the plant room.', plantChoice: { used: [], notUsed: ['Oxy-acetylene or gas torch set'], added: [] } });
  assert.ok(!unticked.substances.items.some((item) => /^Gases/.test(item.product)), JSON.stringify(unticked.substances.items));
  const charge = draftOf({ ...SITE, fallRisk: 'no', task: 'Commission the split system air conditioners: pressure test, evacuate and charge.' });
  assert.ok(charge.substances.items.some((item) => item.product === 'Refrigerants'));
});

// ---- 9. The builder check ----

test('the builder check finds a harness or respirator the PPE list leaves out, and another trade\'s licensing lines', () => {
  const steps = [
    { step: 'Erect and connect steel at height', hazards: ['A fall from height.'], controls: ['Connections are made from boom lifts, with harnesses attached to the boom lift anchor points.', 'Drill with on-tool extraction and wear a P2 respirator.'] },
  ];
  const base = { state: 'nsw', task: 'Erect structural steel roof frame.', steps, ppe: ['Hard hat', 'Safety glasses, clear', 'Safety boots'], licences: ['General construction induction (white card)'] };
  const w = (result, rule) => result.findings.find((item) => item.rule === rule);
  const clash = checkSwms(base, { state: 'nsw' });
  assert.match(w(clash, 'W2').message, /a full body harness and a respirator are worn, but the PPE list leaves them out/);
  const agreed = checkSwms({ ...base, ppe: [...base.ppe, 'Full body harness', 'P2 respirator (fit tested)'] }, { state: 'nsw' });
  assert.equal(w(agreed, 'W2').points - w(clash, 'W2').points, 4);
  const sparky = checkSwms({ ...base, ppe: [...base.ppe, 'Full body harness', 'P2 respirator (fit tested)'], steps: [{ step: 'Before starting', hazards: ['x'], controls: ['Electrical work is done or supervised only by licensed electrical workers, for a licensed electrical contractor.'] }, ...steps] }, { state: 'nsw' });
  assert.match(w(sparky, 'W5').message, /electrical licensing lines/);
  assert.equal(w(agreed, 'W5').points - w(sparky, 'W5').points, 2);
  // A well-formed draft loses nothing: a SiteReady draft's PPE agrees with its steps.
  const draft = draftOf({ ...SITE, state: 'nsw', crane: 'company', slinging: 'ours', kinds: ['steelLift', 'steelErect'], task: 'Erect structural steel roof frame.', facts: { fallControl: 'Connections are made from boom lifts with guardrails, with harnesses attached to the boom lift anchor points.' } });
  const own = checkSwms(fromDraft(draft, { state: 'nsw', swms: { signatures: [{ name: 'Jo' }] } }), { state: 'nsw' });
  assert.doesNotMatch(w(own, 'W2').message, /PPE list leaves/);
  assert.doesNotMatch(w(own, 'W5').message, /licensing lines/);
});
