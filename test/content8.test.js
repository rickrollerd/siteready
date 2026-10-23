// Content faults found by the messy-user test, round 8 on staging (16 October 2026, build c744142), each
// fixed by a general rule: a false "breaking out concrete" item and found work never standing a draft
// with steps down, "Not required" reasons that contradict the SWMS (content7 decision 1, option A, with
// the SDS answer and the project page), wrong-context lines and steps, repeats and order, plant changes,
// the user's own engineering control, and minor rows and lists.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, suggestedKinds } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');
const { typeItems } = require('../substances');
const { TRADES } = require('../presets');
const rules = require('../public/substance-rules');
const places = require('../places');

const SITE = { residential: 'no', company: 'Test', workplace: '12 Smith Street, Paddington', principalContractor: 'ABC Builders Pty Ltd', hospital: 'Royal Hospital', firstAider: 'Jo Smith', musterPoint: 'Front gate', worksManager: 'Sam Lee', worksManagerPhone: '0400 118 552', complianceResponsible: 'Sam Lee', reviewer: 'Sam Lee', date: '16 October 2026' };
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
const needOf = (input, type) => { const body = bodyOf(input); const draft = prepareDraft(body); return (typeItems(draft, body).find((item) => item.type === type) || {}).need; };
const confirmAll = (draft, extra = {}) => ({ used: draft.plantInferred.map((item) => item.item), notUsed: [], added: [], ...extra });
const PAINT = 'Paints and coatings';
const SEALANT = 'Sealants, mastics and silicone';
const SOLVENT = 'Solvents and thinners';

// ---- 1. A found item never stands a draft with steps down ----

const WATERPROOF = 'waterproof 6 bathrms and 2 balconys lvl 3 and 4, grind slab and prime, torch on membrane on podium planter boxs, liquid membrane to wet areas, bond braker and puddle flanges, flood test 24hr';

test('a bond breaker is not breaking out concrete, and the waterproofing draft is not stood down', () => {
  const draft = draftOf({ state: 'tas', fallRisk: 'yes', crane: 'none', task: WATERPROOF });
  assert.equal(draft.kind, 'draft', (draft.missing || []).join(' '));
  assert.ok(names(draft).includes('Apply primers and liquid membranes'));
  assert.ok(!(draft.notCovered || []).some((part) => /break/i.test(part)), (draft.notCovered || []).join('; '));
});

test('work found by its words beside SiteWrite\'s own work steps is listed above the draft, not stood down', () => {
  const draft = draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'Waterproof the bathroom floor with liquid membrane, jackhammer out the old screed, flood test 24 hours.' });
  assert.equal(draft.kind, 'draft');
  assert.ok((draft.notCovered || []).some((part) => /jackhammer/i.test(part)), (draft.notCovered || []).join('; '));
  // With no work step of SiteWrite's own, the same work still stands the draft down.
  const alone = draftOf({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'Jackhammer out the old screed.' });
  assert.ok(alone.kind === 'stand-down' || (alone.notCovered || []).length || names(alone).some((name) => /break|Demolish/i.test(name)), alone.kind);
});

// ---- 2. "Not required" reasons that contradict the SWMS ----

test('"Not required" is refused where the SDS answer lists the product, whatever the reason', () => {
  // Run 1: "touch up only" beside "cold galv touch up paint spray cans, SDS in the ute".
  const steel = { state: 'nsw', fallRisk: 'yes', crane: 'company', slinging: 'crane', task: 'Erect structural steel roof frame. Install dyna-bolts and masonry bolts. Touch up paint on installed steel.', facts: { safetyDataSheet: 'cold galv touch up paint spray cans, SDS in the ute.' }, substancesNotUsed: [PAINT], substancesNotUsedWhy: { [PAINT]: 'touch up only' } };
  // "cold galv" names the coating too, and comes first (messy round 17, SiteLink).
  assert.match(needOf(steel, PAINT), /safety data sheet answer names "cold galv"/);
  // Run 3: sealant "by the passive fire sub" beside an SDS answer naming fire sealant.
  const fire = { state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Install sprinkler pipework and seal the penetrations with fire sealant.', facts: { safetyDataSheet: 'blazemaster cpvc cement, rocol thread paste, fire sealant. SDSs in the gang box' }, substancesNotUsed: [SEALANT], substancesNotUsedWhy: { [SEALANT]: 'passive fire sub does the sealing' } };
  assert.match(needOf(fire, SEALANT), /names "sealant"/);
  // A sentence that says the product is not used is not a list of products used.
  assert.equal(rules.sdsConflict(PAINT, 'No paint used on this job. SDS for the sealant is in the ute.'), '');
});

test('"Not required" is refused beside SiteWrite\'s own step that uses the product (content7 decision 1, option A)', () => {
  // Run 3: paint "painters do it" beside "Prepare to paint", "Paint" and "Clean brushes and rollers".
  const fire = { state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Install sprinkler and hydrant pipework. Paint fire services installation as specified.', substancesNotUsed: [PAINT], substancesNotUsedWhy: { [PAINT]: 'painters do it' } };
  // The step that uses the paint is named before the one that prepares for it (messy round 10).
  assert.match(needOf(fire, PAINT), /the job step "Paint" in this SWMS uses "paint", so it cannot be "Not required"/);
  // Run 5: solvents "supplied and applied by others" beside the solvent cleaning step.
  const painting = { state: 'sa', fallRisk: 'no', crane: 'none', task: 'Paint walls and ceilings, doors and trim. Apply the sealer.', substancesNotUsed: [SOLVENT], substancesNotUsedWhy: { [SOLVENT]: 'supplied and applied by others' } };
  assert.match(needOf(painting, SOLVENT), /"Clean brushes and rollers"/);
  // Old work stripped or a hazard that is only old material is not the product used.
  const step = (name, hazards = []) => ({ jobSteps: [{ step: name, hazards, controls: [] }] });
  assert.equal(rules.usedByStep(PAINT, step('Remove lead paint')), null);
  assert.equal(rules.usedByStep(PAINT, step('Strip wallpaper', ['Lead in old paint under the paper.'])), null);
  assert.equal(rules.usedByStep('Waterproofing membranes and primers', step('Strip the old membrane')), null);
  assert.equal(rules.usedByStep(SOLVENT, step('Clean brushes and rollers', ['Solvent vapour and skin contact from cleaning solvents.'])).step, 'Clean brushes and rollers');
});

test('the project page refuses the same ticks before Prepare all: the questions name the steps that use each type, and the SDS answer counts', async () => {
  const { app } = require('../server');
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const body = bodyOf({ state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Install sprinkler pipework. Core drill penetrations through the slab. Paint fire services installation as specified.' });
    const got = await (await fetch(`${base}/api/draft/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    assert.ok(got.silicaStep, JSON.stringify(Object.keys(got)));
    assert.ok(got.substanceUses && got.substanceUses[PAINT], JSON.stringify(got.substanceUses));
    // As the page calls it: no draft, the step found by the questions passed as known.
    assert.match(rules.notUsedNeed(rules.SILICA, 'core holes by the coring sub', 'core drill', '', '', got.silicaStep, null, null), /cannot be "Not required"/);
    assert.match(rules.notUsedNeed(PAINT, 'painters do it', 'paint', '', '', '', null, got.substanceUses[PAINT]), /cannot be "Not required"/);
    assert.match(rules.notUsedNeed(SEALANT, 'by the passive fire sub', 'seal', '', 'blazemaster cement, fire sealant. SDSs in the gang box', '', null, null), /names "sealant"/);
  } finally {
    server.close();
  }
});

test('the builder check finds a type marked "Not required" beside a step that uses it', () => {
  const swms = { task: 'Paint the walls.', fallRisk: 'no', highRisk: [], notRequired: [PAINT], steps: [{ step: 'Paint', hazards: ['Fumes.'], controls: ['Ventilate the room.'] }] };
  const fixes = checkSwms(swms, { state: 'qld' }).findings.flatMap((item) => item.fixes || []).join('\n');
  assert.match(fixes, /Paints and coatings is marked "Not required", but the step "Paint" uses "paint"/);
});

// ---- 3. Wrong-context lines and steps ----

const CHART = { craneChart: '6.4 t at 18 m radius from the crane chart', groundBearing: 'Geotech report GR-1 by Hunter Geo, 200 kPa, 1.2 m mats' };

test('where our company runs the crane, no line says a crane company runs the lifts, and the steel step is not named for one', () => {
  const draft = draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'own', facts: CHART, task: 'Crane lift structural steel. Erect structural steel roof frame.' });
  assert.ok(!/Crane lifts are done by the crane company|The crane company operates the crane|crane company's wind limits|Our SWMS and the crane company's/.test(lines(draft)), lines(draft));
  // Our crane's own lifting step carries the steel lifting lines, so the steel is not rigged, lifted and landed twice
  // (content13, messy round 12, A run 1).
  assert.ok(!names(draft).some((name) => /^Lift and land steel/.test(name)), names(draft).join('; '));
  assert.ok(draft.jobSteps.find((step) => step.step === 'Rig and lift the load').controls.some((line) => /Members are not rigged one below another/.test(line)));
  assert.ok(draft.qualifications.some((name) => /basic rigging/.test(name)), draft.qualifications.join('; '));
  // A crane company's crane keeps its lines and its step.
  const company = draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'company', slinging: 'crane', task: 'Crane lift structural steel. Erect structural steel roof frame.' });
  assert.ok(names(company).includes('Lift and land steel with the crane company'));
});

test('with no crane, "scisor lifts" and precast walls bring no crane company line', () => {
  const draft = draftOf({ state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Form penetrations through precast walls. Core drill penetrations NB 50 and under.', facts: { fallControl: 'scisor lifts with handrails for all pipe work above 2m, ladders only under 2m' } });
  assert.ok(!draft.controls.some((item) => /crane company/i.test(item.text)), draft.controls.map((item) => item.text).join('\n'));
  // The misspelt scissor lift is the platform used.
  assert.ok(draft.plantInferred.some((item) => item.item === 'Scissor lift'), draft.plantInferred.map((item) => item.item).join('; '));
});

test('a correctional centre\'s medical unit brings no hospital infection control lines, and new work no old lead paint lines', () => {
  const jail = draftOf({ state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Install fire dampers in the ducts at the medical unit and mental health block of the correctional centre.' });
  assert.ok(names(jail).includes('Fit the fire dampers'));
  assert.ok(!/hospital/i.test(lines(jail)), lines(jail));
  const ward = draftOf({ state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Install fire dampers in the ducts above the hospital wards.' });
  assert.match(lines(ward), /hospital's infection control permit/);
  const fresh = draftOf({ state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Install sprinkler pipework. Paint fire services installation as specified.', site: { publicInterface: 'existing jail next door is live' } });
  assert.ok(names(fresh).includes('Sand and fill surfaces'));
  assert.ok(!/old paint|lead paint|Lead dust/i.test(lines(fresh)), lines(fresh));
  const repaint = draftOf({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'Repaint the existing office walls and doors.' });
  assert.match(lines(repaint), /old paint may contain lead/);
});

test('old frames taken out of an office refurbishment bring no lintel bearings, masonry saw or scaffold supervisor, and come out first', () => {
  const task = 'Install aluminium windows, external doors and louvres: move the glass and frames to the levels, install the windows, fit the door hardware, and seal the glazing and flashings. Levels 2 to 6 office refurb, old windows taken out first, glass handled with a vacuum lifter, crane company lifts the stillages onto the loading platform.';
  const draft = draftOf({ state: 'wa', fallRisk: 'yes', crane: 'company', slinging: 'crane', kinds: ['windowInstall', 'glassHandle', 'hardwareFit', 'glazingSeal', 'openingBrickUp'], task });
  assert.ok(!names(draft).includes('Cut the lintel bearings'), names(draft).join('; '));
  assert.ok(names(draft).indexOf('Remove the old frames') < names(draft).indexOf('Install windows'), names(draft).join('; '));
  // A scaffold SiteWrite is only not sure of asks for no scaffold supervisor.
  assert.equal(draft.scaffoldSupervisor, '');
  // A brick opening keeps its lintel bearings.
  const brick = draftOf({ state: 'wa', fallRisk: 'no', crane: 'none', kinds: ['openingBrickUp'], task: 'Remove the old frames and cut new lintel bearings in the brickwork.' });
  assert.ok(names(brick).includes('Cut the lintel bearings'));
});

test('road resheeting is not roofing, and an asphalt paver is not paving stones', () => {
  const task = 'mill and resheet 300m of the stuart hwy service rd, profiler, 2 tipers, paver and 2 rolers, tack coat, nite works with TCs, saw cut joints at the tie ins, line marking by others';
  const kinds = suggestedKinds(task, {}, { state: 'nt' });
  assert.ok(!kinds.some((id) => /^roof/.test(id)), kinds.join('; '));
  assert.ok(!kinds.includes('paving'), kinds.join('; '));
  assert.ok(kinds.includes('asphaltLay'), kinds.join('; '));
  // Roofs and pavers still read as such.
  assert.ok(suggestedKinds('Resheet the warehouse roof with new colorbond.', {}, { state: 'nt' }).some((id) => /^roof/.test(id)));
  assert.ok(suggestedKinds('Lay and cut concrete pavers to the courtyard.', {}, { state: 'nt' }).includes('paving'));
  // The residential question is not asked for road work in the Northern Territory.
  const draft = draftOf({ state: 'nt', residential: '', fallRisk: 'no', crane: 'none', task });
  assert.equal(draft.kind, 'draft', draft.message);
});

test('painting doors, frames and trim brings no framing, door hanging, joinery, plasterboard or carpenter\'s power tool lines', () => {
  const task = 'The scope of work includes but is not limited to the following principal areas: - The Subcontractor shall paint all internal walls and ceilings. - Paint all doors, door frames and timber trim. - Paint the outside of Building 4.';
  const draft = draftOf({ state: 'sa', fallRisk: 'no', crane: 'none', task });
  for (const name of ['Frame walls and bulkheads', 'Hang the doors', 'Stand the door frames', 'Fix skirting and architraves', 'Use power tools', 'Cut and fix plasterboard']) assert.ok(!names(draft).includes(name), name);
  assert.ok(!/Glue instead of nailing|MDF|Score and snap|Nail gun/i.test(lines(draft)), lines(draft));
  assert.ok(names(draft).includes('Paint'));
  // Hanging doors that are then painted keeps the door steps.
  assert.ok(suggestedKinds('Hang the new doors and paint them.', {}, { state: 'sa' }).some((id) => ['doorHang', 'carpJoinery'].includes(id)));
});

test('a crane lift onto a roof brings no roof work; "dial before you dig" no excavation permit; "no overhead power lines" no line contact', () => {
  const task = 'Mobile and crawler crane lifting: travel and set up the mobile crane, check the ground and outriggers, plan and rig the lifts, lift, dog and land loads, and pack up. 60 tonne all terrain crane set up on Constitution Avenue to lift six rooftop air conditioning units, 2.8 tonne each, onto the level 4 roof. Our own dogger slings and directs the lifts.';
  const site = { liveServices: 'No overhead power lines on Constitution Avenue near the set-up area. Underground pits in the footpath, located from the dial before you dig plans.', publicInterface: 'Kerb lane closed by traffic controllers.', otherTrades: 'none', ground: 'Road pavement.', access: 'From Constitution Avenue.' };
  const draft = draftOf({ state: 'act', fallRisk: 'yes', crane: 'own', kinds: ['crane'], facts: CHART, task, site });
  assert.ok(!suggestedKinds(task, {}, { state: 'act', ownCrane: true }).includes('roofAccess'));
  assert.ok(!/excavation permit/.test(lines(draft)), lines(draft));
  assert.ok(!/^Contact with overhead power lines/m.test(lines(draft)));
  assert.equal(draft.scaffoldSupervisor, '');
  // Roof work named besides the lift keeps its roof steps.
  assert.ok(suggestedKinds('Install the air conditioning condensers on the roof, crane to lift them onto the roof.', {}, { state: 'act' }).includes('roofAccess'));
});

test('a design given in its question\'s answer fills its card, and a design no step relies on claims no hold point steps', () => {
  const draft = draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'own', facts: CHART, task: 'Erect structural steel roof frame and install temporary bracing.' }, { erectionSequence: 'Steel is erected in the sequence on drawing S-101 rev B from Hunter Structural, braced as it shows.' });
  const row = draft.designs.find((item) => item.id === 'steelErection');
  assert.equal(row.number, 'S-101');
  assert.equal(row.revision, 'B');
  assert.equal(row.fromAnswer, true);
  const window = draftOf({ state: 'wa', fallRisk: 'yes', crane: 'none', kinds: ['windowInstall'], task: 'Install aluminium windows.', designs: [{ id: 'loadDrawing', what: 'Structural engineer\'s drawing for the load limits', status: 'notIssued' }] });
  const load = window.designs.find((item) => item.id === 'loadDrawing');
  if (load && !load.steps.length) assert.ok(!/the steps that rely on it/.test(load.statusText), load.statusText);
});

test('a pipe cement goes in the step that installs the pipe, not the labelling step', () => {
  const steps = ['Before starting', 'Install sprinkler pipework', 'Label pipes, ducts and equipment', 'Finish and clean up'].map((step) => ({ step, hazards: [], controls: [] }));
  assert.equal(rules.stepOf({ product: 'BlazeMaster CPVC one step cement', type: 'Adhesives' }, steps), 'Install sprinkler pipework');
});

// ---- 4. Repeats and order ----

test('one grinding step with no saw lines, no fragment, the own grinding step beside it, not after the flood test', () => {
  const input = { state: 'tas', fallRisk: 'yes', crane: 'none', task: WATERPROOF,
    ownSteps: [{ part: '', name: 'grind hi spots on slab', hazards: ['silica dust from grinding the slab', 'hearing damage from grinder noise'], controls: ['shrouded grinder with H class vac', 'P2 mask and ear muffs'], who: 'Leading hand' }] };
  const first = draftOf(input);
  const draft = draftOf({ ...input, plantChoice: confirmAll(first, { added: [{ item: 'floor grinder', licence: 'No' }] }) });
  const list = names(draft);
  assert.ok(!list.includes('Grind concrete'), list.join('; '));
  assert.ok(!/Hand-held saws are not slewed|Striking hidden services/.test(lines(draft)));
  assert.ok(!/^If it cannot be determined/m.test(lines(draft)), 'no sentence without its subject');
  // The written assessment stays in the grinding step, whole.
  assert.ok(draft.jobSteps.find((step) => step.step === 'Prepare surfaces by grinding').controls.some((line) => /^Assess in writing\b[^]*cannot be determined/.test(line)));
  const own = list.findIndex((name) => /^grind hi spots/.test(name));
  assert.ok(own > list.indexOf('Prepare surfaces by grinding') && own < list.indexOf('Set up the flood test'), list.join('; '));
});

test('the hiab unload comes before the roof work it supplies', () => {
  const task = 'strip old roof sheets and replace with new colorbond trimdek on 2 storey comercial building, remove old sisalation and lay new anticon blanket and safty mesh, new box guters and flashngs, crane truck to lift sheets onto the roof';
  const draft = draftOf({ state: 'vic', fallRisk: 'yes', crane: 'company', slinging: 'crane', task });
  const list = names(draft);
  const unload = list.indexOf('Unload with the truck loading crane (hiab)');
  if (unload >= 0) assert.ok(unload < list.indexOf('Fix new roofing') && unload < list.indexOf('Replace the box gutter'), list.join('; '));
});

// ---- 5. Plant changes ----

const CRANE_TASK = 'Mobile and crawler crane lifting: travel and set up the mobile crane, check the ground and outriggers, plan and rig the lifts, lift, dog and land loads, and pack up. 60 tonne all terrain crane to lift six units, 2.8 tonne each.';

test('an all terrain crane in a "mobile and crawler crane" task is a mobile crane; an own crane added in its place keeps the plant stop question, with one licence line', () => {
  const input = { state: 'act', fallRisk: 'no', crane: 'own', kinds: ['crane'], facts: CHART, task: CRANE_TASK };
  const draft = draftOf(input);
  assert.ok(draft.plantInferred.some((item) => item.item === 'Mobile crane (60 t)'), draft.plantInferred.map((item) => item.item).join('; '));
  const crane = draft.plantInferred.find((item) => /crane \(/.test(item.item)).item;
  const swapped = draftOf({ ...input, plantChoice: { used: draft.plantInferred.map((item) => item.item).filter((name) => name !== crane), notUsed: [crane], added: [{ item: 'All terrain mobile crane, Liebherr LTM 1060-3.1 (60 t)', licence: 'C6 slewing mobile crane licence, up to 60 t' }] } });
  const craneLicences = swapped.qualifications.filter((name) => /crane/i.test(name));
  assert.deepEqual(craneLicences, ['All terrain mobile crane, Liebherr LTM 1060-3.1 (60 t): C6 slewing mobile crane licence, up to 60 t']);
  assert.ok(swapped.emergency.some((row) => row.type === 'Mobile plant'), swapped.emergency.map((row) => row.type).join('; '));
  // Unticked with none in its place, its licence goes.
  const none = draftOf({ ...input, plantChoice: { used: [], notUsed: [crane], added: [] } });
  assert.ok(!none.qualifications.some((name) => /crane \(60 t\)/i.test(name)), none.qualifications.join('; '));
});

test('an unticked nail gun takes its own lines, an added drill keeps the power tools, and an own step\'s drill is offered', () => {
  const carpentry = { state: 'nsw', fallRisk: 'no', crane: 'none', task: 'Hang the doors and fix skirting and architraves.' };
  const first = draftOf(carpentry);
  assert.match(lines(first), /^Nail guns/m);
  const off = draftOf({ ...carpentry, plantChoice: { used: first.plantInferred.map((item) => item.item).filter((name) => name !== 'Nail gun'), notUsed: ['Nail gun'], added: [] } });
  assert.ok(!/^Nail guns? (?:are used|have)|^Nail guns:|^Nail gun injuries/m.test(lines(off)), lines(off));
  const roof = { state: 'vic', fallRisk: 'yes', crane: 'none', task: 'Fix new roofing with tek screws, cut sheets with the nibbler, drill and chemset anchors into the concrete parapet.' };
  const before = draftOf(roof);
  const added = draftOf({ ...roof, plantChoice: confirmAll(before, { added: [{ item: 'Hilti rotary hammer drill with H class vacuum', licence: 'No' }] }) });
  assert.ok(added.plant.some((item) => item.item === 'Electric power tools and leads'), added.plant.map((item) => item.item).join('; '));
  const own = draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'none', task: 'Erect structural steel columns and beams.', ownSteps: [{ part: '', name: 'Drill dyna-bolt holes with the hilti hammer drill', hazards: ['Silica dust'], controls: ['On-tool extraction and P2 mask'], who: 'Leading hand' }] });
  assert.ok(own.plantInferred.some((item) => item.item === 'Electric power tools and leads'), own.plantInferred.map((item) => item.item).join('; '));
});

test('a confirmed EWP brings no telehandler; an added lighting tower brings fuel as a product type', () => {
  const draft = draftOf({ state: 'vic', fallRisk: 'yes', crane: 'none', task: 'Install the facade signage from an EWP.' });
  const confirmed = draftOf({ state: 'vic', fallRisk: 'yes', crane: 'none', task: 'Install the facade signage from an EWP.', plantChoice: confirmAll(draft) });
  assert.ok(!confirmed.plantInferred.some((item) => item.item === 'Telehandler'), confirmed.plantInferred.map((item) => item.item).join('; '));
  const road = { state: 'nt', residential: 'no', fallRisk: 'no', crane: 'none', task: 'Install road signs along the service road at night with traffic controllers.' };
  const lit = draftOf({ ...road, plantChoice: confirmAll(draftOf(road), { added: [{ item: 'lighting tower', licence: 'No' }] }) });
  assert.ok(lit.substances.items.some((item) => /^Fuels/.test(item.product)), lit.substances.items.map((item) => item.product).join('; '));
});

// ---- 6. The user's own engineering control ----

test('an own truck mounted attenuator line lowers the step\'s High rating, and the builder check asks no more', () => {
  const input = { state: 'nt', residential: 'no', fallRisk: 'no', crane: 'none', task: 'Lay and roll asphalt on the service road with the paver and rollers, lane open to traffic.' };
  const base = draftOf(input);
  const step = base.jobSteps.find((item) => item.step === 'Lay and roll asphalt');
  assert.ok(step, names(base).join('; '));
  const line = 'A truck mounted attenuator sits behind the paver crew.';
  const edited = draftOf({ ...input, controlEdits: { 'Lay and roll asphalt': { added: [line] } } });
  const after = edited.jobSteps.find((item) => item.step === 'Lay and roll asphalt');
  assert.notEqual(after.risk.after.level, 'High');
  const findings = checkSwms(fromDraft(edited, { state: 'nt', swms: { signatures: [{ name: 'Jo Smith' }] } }), { state: 'nt' }).findings.filter((item) => !item.pass).flatMap((item) => item.fixes || []).join('\n');
  assert.ok(!/engineering control to: Lay and roll asphalt/.test(findings), findings);
  assert.equal(require('../control-level').controlLevel(line), 'Isolate or engineer');
});

// ---- 7. Minor ----

test('buried cables and pits named in the live services answer bring a service strike row where the crew cuts', () => {
  const draft = draftOf({ state: 'nt', residential: 'no', fallRisk: 'no', crane: 'none', task: 'Saw cut the asphalt joints at the tie ins and lay asphalt.', site: { liveServices: 'street light cables and telstra pits along the verge' } });
  assert.ok(draft.emergency.some((row) => row.type === 'Service strike'), draft.emergency.map((row) => row.type).join('; '));
  const none = draftOf({ state: 'nt', residential: 'no', fallRisk: 'no', crane: 'none', task: 'Saw cut the asphalt joints at the tie ins and lay asphalt.', site: { liveServices: 'none' } });
  assert.ok(!none.emergency.some((row) => row.type === 'Service strike'));
});

test('the spray step\'s overalls are ticked for that step', () => {
  const input = { state: 'sa', fallRisk: 'no', crane: 'none', task: 'Paint all internal walls and ceilings.' };
  const draft = draftOf({ ...input, plantChoice: confirmAll(draftOf(input), { added: [{ item: 'Airless paint sprayer', licence: 'No' }] }) });
  const coveralls = draft.ppe.flatMap((group) => group.items).find((item) => item.id === 'coveralls');
  assert.ok(coveralls.ticked && (coveralls.steps || []).includes('Spray paint with airless sprayers'), JSON.stringify(coveralls));
});

test('hospitals with an emergency department come nearest first, whichever search found them', async () => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  const at = (latitude, longitude) => ({ latitude, longitude });
  const place = (id, name, location) => ({ id, displayName: { text: name }, formattedAddress: 'ACT, Australia', location, primaryType: 'hospital' });
  const reply = (body) => ({ ok: true, json: async () => body });
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.endsWith(':searchText') && body.pageSize === 1) return reply({ places: [{ location: at(-35.2800, 149.1500) }] });
    if (url.endsWith(':searchText') && body.textQuery === 'public hospital emergency department') return reply({ places: [place('q', 'Queanbeyan Hospital Emergency Department', at(-35.3530, 149.2300))] });
    if (url.endsWith(':searchText') && body.textQuery === 'hospital emergency department') return reply({ places: [place('c', 'Canberra Hospital', at(-35.3450, 149.1000))] });
    if (url.endsWith(':searchText')) return reply({ places: [] });
    if (body.includedPrimaryTypes.includes('hospital')) return reply({ places: [] });
    return reply({ places: [] });
  };
  const result = await places.nearbyCare('21 Constitution Avenue, Campbell ACT 2612', { fetchImpl });
  assert.deepEqual(result.hospitals.map((item) => item.name), ['Canberra Hospital', 'Queanbeyan Hospital Emergency Department']);
  delete process.env.GOOGLE_PLACES_API_KEY;
});

test('the pick list\'s crane task stays a crane task', () => {
  const preset = Object.values(TRADES).flatMap((trade) => trade.tasks).find((item) => item.id === 'mobile-crane');
  assert.ok(preset);
  assert.ok(!suggestedKinds(preset.task, {}, { state: 'act', ownCrane: true }).includes('roofAccess'));
});
