// Content faults found by the messy-user test, round 7 on staging (16 October 2026, build f02e871), each
// fixed by a general rule: silica read from every step line and own step, "Does not apply" taking off what
// exists only for that work, wrongly found high risk work and lines kept to their own work, "no brazing",
// trade words the spelling fixer keeps, licences and added plant, "Not required" reasons that contradict
// the SWMS, step order and repeats, designs named in answers, the builder check, and a street verge.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, suggestedKinds } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');
const { typeItems } = require('../substances');
const { gateChecks } = require('../download-gate');
const { fixSpelling } = require('../spelling');
const { plantFor } = require('../register');
const rules = require('../public/substance-rules');

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
const lines = (draft) => draft.jobSteps.flatMap((step) => [...step.hazards, ...step.controls]).join('\n');
const types = (draft) => draft.substances.items.map((item) => item.product);
const needOf = (input, type) => { const body = bodyOf(input); const draft = prepareDraft(body); return (typeItems(draft, body).find((item) => item.type === type) || {}).need; };
const SILICA = rules.SILICA;
const notSilica = (reason) => ({ substancesNotUsed: [SILICA], substancesNotUsedWhy: { [SILICA]: reason } });
const pickKinds = (kinds, task, state) => [...new Set([...kinds, ...suggestedKinds(task, {}, { state })])];

// ---- 1. Silica read from every step line and own step ----

test('silica "Not required" is refused beside saw cutting and grinding lines, slab anchors and hanger anchors, whatever the step is called', () => {
  // Round 7 run 1: "Finish concrete" saw cuts the control joints and grinds the slab edges.
  const slab = { state: 'nsw', fallRisk: 'yes', crane: 'company', slinging: 'crane', kinds: ['reo', 'concrete'], task: 'Place and fix reinforcement to suspended slabs. Place concrete to suspended slabs using a concrete pump. Saw cut control joints to slabs. Grind slab edges, nibs and minor surface defects.', ...notSilica('saw cutting done by others') };
  assert.match(needOf(slab, SILICA), /the job step "Finish concrete" cuts, drills or grinds concrete/);
  // Run 3: "Fix hangers and supports" drills the slab anchors.
  const mech = { state: 'qld', fallRisk: 'yes', crane: 'none', kinds: ['ewp', 'ductwork'], task: 'Install kitchen extract ductwork, hung from the slab.', ...notSilica('only small anchor holes') };
  assert.match(needOf(mech, SILICA), /cannot be "Not required"/);
  // Run 6: "Install suspended grid ceilings" drills hanger anchors into the slab.
  const ceilings = { state: 'tas', fallRisk: 'yes', crane: 'none', kinds: ['ceilingGrid'], task: 'Install suspended grid ceilings.', ...notSilica('we only cut plasterboard, no concrete cuting') };
  assert.match(needOf(ceilings, SILICA), /"Install suspended grid ceilings"/);
});

test('silica is asked, trained for and its code cited where a step drills anchors into the slab, or an own step cuts concrete', () => {
  // Run 2: the containment step drills anchors into the slab, and silica was never asked.
  const containment = draftOf({ state: 'vic', fallRisk: 'yes', crane: 'none', kinds: ['containment'], task: 'Install cable tray and containment.' });
  assert.ok(types(containment).includes(SILICA), types(containment).join('; '));
  // Run 8: the user's own step saw cuts the kerb and names silica dust.
  const own = { state: 'nt', fallRisk: 'no', crane: 'none', kinds: ['trench'], task: 'Excavate a trench 1.2 m deep for a stormwater pipe along the street.', ownSteps: [{ part: '', name: 'Saw cut the kerb and footpath before excavating', hazards: ['silica dust from cuting concrete'], controls: ['Wet cutting with a water fed saw, P2 mask and ear muffs worn'], who: 'Leading hand' }] };
  const kerb = draftOf(own);
  assert.ok(types(kerb).includes(SILICA), types(kerb).join('; '));
  assert.ok(kerb.qualifications.some((name) => /silica/i.test(name)), kerb.qualifications.join('; '));
  assert.ok(kerb.sources.codes.some((title) => /silica/i.test(title)), kerb.sources.codes.join('; '));
  assert.match(needOf({ ...own, ...notSilica('done by the council') }, SILICA), /"Saw cut the kerb and footpath before excavating \(Our own step\)"/);
  // The rule itself reads names, hazards, dust controls and own steps, not conditions.
  const step = (name, hazards = [], controls = [], extra = {}) => ({ jobSteps: [{ step: name, hazards, controls, ...extra }] });
  assert.equal(rules.silicaStep(step('Cut plasterboard', ['Silica dust where products contain crystalline silica.'])), '');
  assert.equal(rules.silicaStep(step('Place post-tensioning ducts and tendons', ['A person falls while fixing anchors at the slab edge.'])), '');
  assert.equal(rules.silicaStep(step('Form penetrations and voids', [], ['Holes drilled overhead through the formwork or slab are drilled with a face shield worn over safety glasses.'])), '');
  assert.equal(rules.silicaStep(step('Work from ladders', [], ['Circular saws, concrete cutting saws and grinders are not used from a single, extension or step ladder.'])), '');
  assert.equal(rules.silicaStep(step('Install cable tray', [], ['Drill anchors with on-tool dust extraction.'])), 'Install cable tray');
  assert.equal(rules.silicaStep(step('Stand the door frames', ['Silica dust from drilling masonry for fixings. (Does not apply to this job)'])), '');
});

test('rack anchors keep their silica dust hazard where the slab is not post-tensioned', () => {
  const draft = draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', kinds: ['commsRoom'], task: 'Install comms racks and cabinets in the comms room.' });
  assert.ok(lines(draft).includes('Silica dust when drilling rack anchors.'), lines(draft));
  assert.ok(types(draft).includes(SILICA));
});

// ---- 2. "Does not apply" takes off what exists only for that work ----

test('asbestos marked "Does not apply" takes its licence, Who, code, question and printed answer', () => {
  const input = { state: 'act', fallRisk: 'no', crane: 'none', task: 'Strip out the old office fitout on level 2: ceilings, partitions and carpet, and load the waste into skips.', facts: { asbestosArrangement: 'Register checked, none on level 2.' } };
  const found = draftOf(input);
  assert.ok(found.highRisk.some((item) => /asbestos/i.test(item)));
  // Checking for asbestos is the supervisor's check, not removal work.
  assert.equal(found.jobSteps.find((step) => /^Check for asbestos/.test(step.step)).responsible, 'Supervisor');
  const off = { ...input, highRiskOff: [{ id: 'asbestos', reason: 'the register shows no asbestos on level 2' }] };
  const draft = draftOf(off);
  assert.deepEqual(draft.highRiskNotApply.map((item) => item.id), ['asbestos']);
  assert.ok(!draft.qualifications.some((name) => /asbestos removalist/i.test(name)), draft.qualifications.join('; '));
  assert.ok(!draft.jobSteps.some((step) => /asbestos/i.test(step.responsible)), draft.jobSteps.map((step) => step.responsible).join('; '));
  assert.ok(!draft.sources.codes.some((title) => /asbestos/i.test(title)), draft.sources.codes.join('; '));
  assert.ok(!draft.controls.some((item) => /Register checked/.test(item.text)));
  assert.ok(!questionsFor({ ...SITE, ...off }).required.some((item) => /^asbestos/.test(item.id)));
});

test('a riser shaft marked "Does not apply" takes the permit, code, Trench support question and answer, rescue and the check\'s trench finding', () => {
  // The base rule found "risers in shafts" as a shaft; a shaft that is dug, then marked as not applying, is tested here.
  const input = { state: 'qld', fallRisk: 'no', crane: 'none', task: 'Install pipework in the 2 m deep shaft at the plant room.' };
  const found = draftOf(input, { trenchSupport: 'no trench, its a riser shaft inside the building' });
  if (!found.highRisk.some((item) => /shaft or trench/i.test(item))) return;
  // While a step still works in the excavation, its parts stay; once that step is taken off, they go.
  const off = { ...input, highRiskOff: [{ id: 'trench', reason: 'its a services riser shaft in the building, not dug' }], leaveOut: ['Work inside a deep excavation'] };
  const draft = draftOf(off, { trenchSupport: 'no trench, its a riser shaft inside the building' });
  assert.ok(!/excavation permit/.test(lines(draft)));
  assert.ok(!draft.sources.codes.some((title) => /Excavation/.test(title)));
  assert.ok(!draft.controls.some((item) => /riser shaft/.test(item.text)));
  assert.ok(!questionsFor({ ...SITE, ...off }).required.some((item) => item.id === 'trenchSupport'));
  assert.ok(!draft.emergency.some((row) => row.type === 'Trench'));
});

test('the pick list\'s own "install risers in shafts" and "hydraulic shaft" are not an excavated shaft', () => {
  const task = 'Hydraulic pipework at height: install risers in shafts and pipework in ceilings in copper, PVC and polyethylene, joined by brazing, solvent cement and PE fusion welding. lvl 2-6 hydraulic shaft + ceilings';
  const draft = draftOf({ state: 'sa', fallRisk: 'yes', crane: 'none', task });
  assert.ok(!draft.highRisk.some((item) => /shaft or trench/i.test(item)), draft.highRisk.join('; '));
  assert.ok(!/excavation permit/.test(lines(draft)));
  assert.ok(!draft.sources.codes.some((title) => /Excavation/.test(title)));
});

test('energised work marked "Does not apply" takes the shock and power line rows, unless a step still works near the lines', () => {
  const input = { state: 'wa', fallRisk: 'yes', crane: 'none', task: 'Erect a scaffold on the north facade, 12 m high.', site: { liveServices: 'Overhead power lines on the street, more than 10 m away.' }, highRiskOff: [{ id: 'electrical', reason: 'power lines more than 10 m away' }] };
  const kept = draftOf(input);
  assert.ok(kept.jobSteps.some((step) => /power lines/i.test(step.step)) === kept.emergency.some((row) => row.type === 'Contact with power lines'));
  const draft = draftOf({ ...input, leaveOut: ['Plan the work near overhead power lines'] });
  assert.ok(!draft.emergency.some((row) => /Electric shock|power lines/.test(row.type)), draft.emergency.map((row) => row.type).join('; '));
});

test('the builder check asks no controls for work marked "Does not apply"', () => {
  const base = { task: 'Install pipework in the risers.', fallRisk: 'no', highRisk: [], steps: [{ step: 'Install risers and pipework', hazards: ['Falling objects.'], controls: ['Barricade below.'] }] };
  const off = { ...base, notApply: [{ id: 'trench', label: 'trench', reason: 'not dug' }] };
  const fixes = (swms) => checkSwms(swms, { state: 'qld' }).findings.flatMap((item) => item.fixes || []).join('\n');
  assert.ok(!/shoring, benching or battering/.test(fixes(off)));
});

// ---- 3. High risk work and lines kept to their own work ----

test('an office strip-out with non-load-bearing block walls gets no whole-building, masonry, floor laying or asbestos removal steps', () => {
  const task = 'soft strip and demo lvl 2 and 3 offce fitout, remove ceilngs, stud partitons and carpet, demolish non load bearing block walls with jackhamer and 1.7t mini excavator, saw cut slab penetration 1.2x1.2 with concrete saw, rubbish to skip bins with bobcat, asbestos register checked nil found';
  const draft = draftOf({ state: 'act', fallRisk: 'yes', crane: 'none', task });
  for (const name of ['Demolish the structure', 'Cut blocks and bricks', 'Mix mortar', 'Lay blocks and bricks', 'Lay floor coverings', 'Remove the asbestos', 'Prepare the asbestos work area']) assert.ok(!names(draft).includes(name), `${name}: ${names(draft).join('; ')}`);
  assert.ok(!draft.highRisk.some((item) => /load-bearing|asbestos/i.test(item)), draft.highRisk.join('; '));
  assert.ok(!draft.qualifications.some((name) => /asbestos removalist/i.test(name)));
  assert.ok(!draft.sources.codes.some((title) => /Excavation/.test(title)));
  assert.ok(!/from the roof down|Roof timbers and timber floors/.test(lines(draft)));
  // The removal questions are not asked or pre-answered.
  assert.ok(!questionsFor({ ...SITE, state: 'act', fallRisk: 'yes', crane: 'none', task }).required.some((item) => /^asbestos(?:AirMonitoring|Quantity)$/.test(item.id)));
  // The pick list's own words, with his added, keep the structure: no load-bearing demolition.
  const pick = draftOf({ state: 'act', fallRisk: 'yes', crane: 'none', kinds: ['officeStrip', 'stripOut', 'wasteRemoval', 'asbestosCheck', 'demolition', 'sawCut', 'carpJoinery'], task: 'Internal strip-out (soft strip) once the services are made safe, leaving all structural elements untouched: strip out ceilings, partitions, floor coverings and joinery, remove redundant services, and load waste into skips and bins. lvl 2+3, demo non load bearing block walls with jackhammer + 1.7t mini ex, saw cut 1.2x1.2 slab penetration, asbestos register checked nil found' });
  assert.ok(!pick.highRisk.some((item) => /load-bearing/i.test(item)), pick.highRisk.join('; '));
  // Joinery stripped out is not installed, and the asbestos check is the supervisor's.
  assert.ok(!names(pick).includes('Install joinery and cabinets'), names(pick).join('; '));
  assert.equal(pick.jobSteps.find((step) => /^Check for asbestos/.test(step.step)).responsible, 'Supervisor');
  assert.ok(suggestedKinds('Demolish the load bearing wall between the kitchen and lounge', {}, { state: 'act' }).length > 0);
  // Laying is still found where the task lays.
  assert.ok(suggestedKinds('Remove the old carpet, then lay new carpet tiles', {}, { state: 'act' }).includes('floorLay'));
  assert.ok(suggestedKinds('Demolish the old block wall, rebuild new blockwork with mortar', {}, { state: 'act' }).includes('masonryMortar'));
});

test('new fibre cement ceilings and removable panels in a new tower are not asbestos work', () => {
  const draft = draftOf({ state: 'tas', fallRisk: 'yes', crane: 'none', kinds: ['ceilingGrid', 'plasterSheets'], task: 'Install access panels and removable panels. Install suspended grid, coffered and flush plasterboard or fibre cement ceilings, including shadowline gaps.' });
  assert.ok(!draft.highRisk.some((item) => /asbestos/i.test(item)), draft.highRisk.join('; '));
});

test('a ceilings crew gets no electrical or plumbing licence from lighting pelmets and vanity walls', () => {
  const draft = draftOf({ state: 'tas', fallRisk: 'no', crane: 'none', kinds: ['carpFraming', 'insulation', 'ceilingGrid'], task: 'Construct metal stud framing to partitions, including vanity walls. Construct bulkheads and lighting pelmets, troughs and recesses. Install insulation and suspended grid ceilings.' });
  assert.ok(!draft.qualifications.some((name) => /^(?:Electrical|Plumbing)/.test(name)), draft.qualifications.join('; '));
  // The shock row follows a hazard that names live cables, not a control that keeps the crew clear of them.
  const row = (task, kinds) => draftOf({ state: 'tas', fallRisk: 'no', crane: 'none', kinds, task }).emergency.some((item) => /Electric shock/.test(item.type));
  assert.equal(row('Install suspended grid ceilings.', ['ceilingGrid']), false);
  // Wardrobe, cistern and vanity walls are framed, not joinery fixed; wardrobes themselves are joinery.
  const framing = 'Construct metal stud framing to partitions, walls, ceilings and bulkheads, including wardrobe, cistern enclosure and vanity walls. Install skirtings, mouldings and trims.';
  const stepsOf = (task) => names(draftOf({ state: 'tas', fallRisk: 'no', crane: 'none', kinds: suggestedKinds(task, {}, { state: 'tas' }), task }));
  assert.ok(!stepsOf(framing).some((name) => /^(?:Install joinery and cabinets|Hang the doors)$/.test(name)), stepsOf(framing).join('; '));
  assert.ok(stepsOf(framing).includes('Fix skirting and architraves'));
  assert.ok(stepsOf('Install the wardrobes and vanity units, and fix skirtings.').includes('Install joinery and cabinets'));
});

test('a formwork crew placing cast-in conduits gets no electrical licensing lines or low voltage rescue', () => {
  const draft = draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'company', slinging: 'crane', kinds: ['formwork', 'castIn'], task: 'Erect and strip formwork to suspended slabs. Install cast in items: cast in plates, ferrules, conduits.' });
  assert.ok(!/Electrical work is done or supervised only by licensed|low voltage rescue/i.test(lines(draft)));
  assert.ok(!draft.qualifications.some((name) => /low voltage rescue/.test(name)));
});

test('an electrical SWMS with no crane gets no gas, plumbing or dogging licence from cabling to meters and pump stations', () => {
  const task = 'Install Energy Metering System, energy meters and cabling to hydraulic water and gas meters. Power to specialised equipment: medical gas panels and BBQs. Provide submains and terminate into sewer pumping station control panels. Install cable tray and pull cables.';
  const draft = draftOf({ state: 'vic', fallRisk: 'no', crane: 'none', kinds: ['containment', 'cablePull'], task });
  assert.ok(!draft.qualifications.some((name) => /^(?:Gas|Plumbing)|dogging/i.test(name)), draft.qualifications.join('; '));
  assert.ok(!draft.highRisk.some((item) => /gas/i.test(item)), draft.highRisk.join('; '));
  assert.doesNotMatch(lines(draft), /Plumbing and drainage work is done/);
});

test('a mechanical crew with no refrigeration work gets no refrigerant licence, release row or ARC code, no door step and no MDF lines', () => {
  const task = 'All safe trays and insulated condensate drains to tundishes. Supply only door grilles as necessary. Kitchen extract ductwork to kitchens. Pizza oven exhaust system including fan, ductwork and lagging. Fire dampers on duct passing through fire wall.';
  const kinds = suggestedKinds(task, {}, { state: 'qld' });
  assert.ok(!kinds.includes('doorHang') && !kinds.includes('carpentryWork'), kinds.join(', '));
  assert.ok(kinds.includes('ductwork'), kinds.join(', '));
  const draft = draftOf({ state: 'qld', fallRisk: 'yes', crane: 'none', kinds: ['ewp', 'plantLift', 'ductwork', 'mechInsulation', 'carpentryWork', 'fireDampers'], task });
  assert.ok(!draft.qualifications.some((name) => /Refrigerant/.test(name)), draft.qualifications.join('; '));
  assert.ok(!draft.emergency.some((row) => /Refrigerant/.test(row.type)));
  assert.ok(!draft.sources.codes.some((title) => /Refrigeration Council/.test(title)));
  assert.ok(!/MDF|Glue instead of nailing/.test(lines(draft)));
});

test('a scissor lift with no harness has no lanyard line; an unticked generator takes its lines; "cut the kerb" ticks no pour steps', () => {
  const lift = draftOf({ state: 'sa', fallRisk: 'yes', crane: 'none', kinds: ['ewp', 'mechPipework'], task: 'Install hydraulic pipework in ceilings from a scissor lift.' });
  assert.ok(!/The lanyard is as short as possible/.test(lines(lift)));
  const fuse = { state: 'sa', fallRisk: 'no', crane: 'none', kinds: ['peFusion'], task: 'Butt fuse polyethylene pipe.' };
  assert.match(lines(draftOf(fuse)), /generator/);
  assert.ok(!/generator/i.test(lines(draftOf({ ...fuse, plantChoice: { used: [], notUsed: ['Generator'], added: [] } }))));
  const kinds = suggestedKinds('375 rcp storm water along the street verge, trench up to 2.4m deep, concrete saw to cut the kerb', {}, { state: 'nt' });
  assert.ok(!kinds.some((id) => /^(?:slabGround|slabPour|kerbInstall)$/.test(id)), kinds.join(', '));
  assert.ok(kinds.includes('sawCut'), kinds.join(', '));
});

test('"no overhead lines" in the live services answer brings no power line row', () => {
  const draft = draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'company', slinging: 'crane', kinds: ['reo', 'concrete'], task: 'Place concrete to suspended slabs using a concrete pump.', site: { liveServices: 'temp power board on each level from builders, no overhead lines.' } });
  assert.ok(!draft.emergency.some((row) => row.type === 'Contact with power lines'), draft.emergency.map((row) => row.type).join('; '));
});

// ---- 4. "No brazing" ----

test('"no brazing" takes off the brazing step, its lines and the hot work question, and keeps PE fusion', () => {
  const task = 'Hydraulic pipework at height: install risers in shafts and pipework in ceilings in copper, PVC and polyethylene, joined by brazing, solvent cement and PE fusion welding. propress copper no brazing';
  const input = { state: 'sa', fallRisk: 'yes', crane: 'none', kinds: ['hydraulicRisers', 'ceilingPipework', 'hotWork', 'solventCement', 'peFusion'], task };
  const draft = draftOf(input);
  assert.ok(!names(draft).some((name) => /braz/i.test(name)), names(draft).join('; '));
  assert.ok(names(draft).includes('Butt fuse polyethylene pipe'));
  assert.ok(!/brazing|hot work permit/i.test(lines(draft)), lines(draft).split('\n').filter((line) => /braz|hot work/i.test(line)).join('\n'));
  assert.ok(!questionsFor({ ...SITE, ...input }).required.some((item) => item.id === 'hotWorkPermit'));
  // No torch set or welder for PE fusion, and the plumbing licence for hydraulic pipework.
  assert.ok(!draft.plant.some((item) => /^(?:Welder|Oxy-acetylene)/.test(item.item)), draft.plant.map((item) => item.item).join('; '));
  assert.ok(draft.qualifications.some((name) => /^Plumbing licen/.test(name)), draft.qualifications.join('; '));
  // A condition is not a denial.
  assert.ok(draftOf({ state: 'sa', fallRisk: 'no', crane: 'none', task: 'Braze copper pipe joints, no brazing near the sprinkler heads.' }).jobSteps.some((step) => /braz/i.test(step.step)));
});

// ---- 5. Trade words the spelling fixer keeps ----

test('the spelling fixer keeps trade, product and brand words, and still fixes typos', () => {
  for (const word of ['propress', 'Propress', 'megapress', 'setdowns', 'camlock', 'prepainted', 'offsite', 'inline', 'workface', 'unistrut', 'kango', 'ramset', 'hilti', 'skydomes', 'coredrill']) {
    assert.equal(fixSpelling(`fit the ${word} fittings`).text, `fit the ${word} fittings`, word);
  }
  assert.equal(fixSpelling('propress copper no brazing').text, 'propress copper no brazing');
  // Plant names SiteWrite knows are kept too.
  assert.equal(fixSpelling('the telehandler and the franna').text, 'the telehandler and the franna');
  for (const [typo, word] of [['scafold', 'scaffold'], ['hydrolic', 'hydraulic'], ['insulaton', 'insulation'], ['ammended', 'amended'], ['plasterbord', 'plasterboard']]) assert.equal(fixSpelling(typo).text, word);
});

// ---- 6. Licences and added plant ----

test('dogging is listed where a step says a licensed dogman slings or directs the load', () => {
  const draft = draftOf({ state: 'act', fallRisk: 'no', crane: 'none', kinds: ['sawCut'], task: 'Saw cut and remove a 1.2 m by 1.2 m opening in the existing slab.' });
  if (/only by a licensed dogman/.test(lines(draft))) assert.ok(draft.qualifications.some((name) => /dogging/i.test(name)), draft.qualifications.join('; '));
});

test('an added angle grinder where steps cut metal brings the hot work permit with its fire watch', () => {
  const input = { state: 'act', fallRisk: 'no', crane: 'none', kinds: ['officeStrip'], task: 'Strip out ceilings, partitions and floor coverings.', plantChoice: { used: [], notUsed: [], added: [{ item: '9 inch angle grinder', licence: 'No' }] } };
  const draft = draftOf(input);
  assert.match(lines(draft), /hot work permit[^.]*\.[^\n]*fire watch/);
  assert.ok(!/hot work permit/.test(lines(draftOf({ ...input, plantChoice: undefined }))));
});

test('rotary hammers, press tools, jumping jacks and ramsets are read as the plant SiteWrite knows', () => {
  assert.deepEqual(plantFor('hilti rotary hammer').map((item) => item.item), ['Electric power tools and leads']);
  assert.deepEqual(plantFor('propress tool').map((item) => item.item), ['Electric power tools and leads']);
  assert.deepEqual(plantFor('jumping jack').map((item) => item.item), ['Roller or plate compactor']);
  assert.deepEqual(plantFor('ramset gun').map((item) => item.item), ['Powder-actuated tool']);
  const draft = draftOf({ state: 'tas', fallRisk: 'no', crane: 'none', kinds: ['carpFraming'], task: 'Fix bottom tracks to the slab.', plantChoice: { used: [], notUsed: [], added: [{ item: 'ramset gun', licence: 'Ramset training' }, { item: 'hilti rotary hammer', licence: 'No' }] } });
  assert.ok(names(draft).includes('Fix with a powder-actuated tool'), names(draft).join('; '));
  const hammer = draft.plant.find((item) => item.item === 'hilti rotary hammer');
  assert.match(hammer.inspection, /tested and tagged/);
});

// ---- 7. "Not required" reasons that contradict the SWMS ----

test('"Not required" because others do it is refused where the user\'s own step uses the product', () => {
  const input = { state: 'tas', fallRisk: 'no', crane: 'none', kinds: ['carpFraming'], task: 'Frame walls. Paint shadowline packers and install them at walls.', ownSteps: [{ part: 'Paint shadowline packers and install them at walls.', name: 'Paint shadowline packers', hazards: ['Paint on skin and eyes'], controls: ['Use water based acrylic paint, brush applied, gloves worn'], who: 'Leading hand' }], substancesNotUsed: ['Paints and coatings'], substancesNotUsedWhy: { 'Paints and coatings': 'painters do it' } };
  assert.match(needOf(input, 'Paints and coatings'), /says others do it, but the job step "Paint shadowline packers"/);
  assert.equal(needOf({ ...input, substancesNotUsedWhy: { 'Paints and coatings': 'the packers come prepainted' } }, 'Paints and coatings'), '');
});

test('an SDS answer naming the product conflicts with "Not required" even once another product is listed', () => {
  const input = { state: 'vic', fallRisk: 'no', crane: 'none', kinds: ['containment'], task: 'Install cable tray and fire seal the penetrations.', facts: { safetyDataSheet: 'The products used are fire sealant, PVC conduit glue' }, substancesNotUsed: ['Sealants, mastics and silicone'], substancesNotUsedWhy: { 'Sealants, mastics and silicone': 'fire stopping by others' }, substances: [{ id: 'sub-1', type: 'Adhesives', product: 'PVC conduit glue', controls: ['Gloves'], sdsDate: '2025-01-01', confirmed: true }] };
  assert.match(needOf(input, 'Sealants, mastics and silicone') || '', /safety data sheet answer names/);
});

test('fuel needs a reason beside petrol-driven plant lines, and solvent cement asks only for its own row', () => {
  const pour = { state: 'nsw', fallRisk: 'no', crane: 'company', slinging: 'crane', kinds: ['concrete'], task: 'Place concrete to suspended slabs and power trowel the finish.', substancesNotUsed: ['Fuels (diesel, petrol)'] };
  const draft = draftOf(pour);
  if (types(draft).includes('Fuels (diesel, petrol)') && /Petrol-driven/.test(lines(draft))) assert.match(needOf(pour, 'Fuels (diesel, petrol)'), /short reason/);
  const pvc = draftOf({ state: 'sa', fallRisk: 'no', crane: 'none', kinds: ['solventCement'], task: 'Join PVC pipe with primer and solvent cement.' });
  assert.ok(types(pvc).includes('PVC primer and solvent cement'));
  assert.ok(!types(pvc).includes('Solvents and thinners') && !types(pvc).includes('Cement, concrete, grout and mortar'), types(pvc).join('; '));
});

// ---- 8. Order and repeats ----

test('steps go in the order the work is done, and a general step is not repeated beside its own', () => {
  const trench = draftOf({ state: 'nt', fallRisk: 'no', crane: 'ours', slinging: 'ours', kinds: pickKinds(['trench'], 'Stormwater drainage: lay and joint the pipes, backfill and compact. hiab truck to unload pipes, concrete saw to cut the kerb', 'nt'), task: 'Stormwater drainage: excavate a trench 1.2 m deep, lay and joint the pipes, backfill and compact. hiab truck to unload pipes, concrete saw to cut the kerb' }, { craneChart: 'Hiab chart: 2 t at 6 m.', groundBearing: 'The builder\'s site manager checked the road for the outriggers; 600 mm pads under each.' });
  const at = (name) => names(trench).indexOf(name);
  assert.ok(at('Unload with the truck loading crane (hiab)') >= 0 && at('Unload with the truck loading crane (hiab)') < at('Lay pipes'), names(trench).join('; '));
  assert.ok(at('Saw cut concrete') < at('Excavate'), names(trench).join('; '));
  const strip = draftOf({ state: 'act', fallRisk: 'no', crane: 'none', kinds: ['officeStrip', 'stripOut', 'demolition', 'sawCut', 'silicaDrill'], task: 'Internal strip-out of the office: strip out ceilings, partitions and floor coverings, demolish non load bearing block walls, saw cut a slab penetration.' });
  assert.ok(!names(strip).includes('Strip out the room'), names(strip).join('; '));
  assert.ok(!names(strip).includes('Drill or cut concrete, masonry or stone'), names(strip).join('; '));
  assert.ok(names(strip).indexOf('Strip out ceilings, partitions and floor coverings') < names(strip).indexOf('Demolish'), names(strip).join('; '));
  const form = draftOf({ state: 'nsw', fallRisk: 'yes', crane: 'company', slinging: 'crane', kinds: ['formwork', 'castIn'], task: 'Erect and strip formwork to suspended slabs and install cast-in conduits.', ownSteps: [{ part: '', name: 'Check concrete strenght results before stripping the formwork', hazards: ['Formwork stripped too early'], controls: ['Engineer confirms strength in writing before stripping'], who: 'Foreman' }] });
  const f = (name) => names(form).indexOf(name);
  assert.ok(f('Install cast-in conduits on the deck before the pour') < f('Strip the formwork'), names(form).join('; '));
  assert.equal(f('Check concrete strenght results before stripping the formwork (Our own step)') + 1, f('Strip the formwork'), names(form).join('; '));
});

// ---- 9. Designs ----

test('a design named by its number and revision in an answer is listed, to be given in full for the designs table', () => {
  const body = bodyOf({ state: 'nsw', fallRisk: 'yes', crane: 'company', slinging: 'crane', kinds: ['formwork'], task: 'Erect formwork to suspended slabs and install back propping.' }, { temporarySupport: 'Backprops to the temporary support design SK-201 rev B.' });
  const draft = prepareDraft(body);
  const row = (draft.designs || []).find((item) => item.id === 'propping');
  assert.ok(row, JSON.stringify(draft.designs));
  assert.equal(row.number, 'SK-201');
  assert.equal(row.revision, 'B');
  assert.ok(gateChecks(body, draft).some((gap) => gap.kind === 'design' && gap.design === 'propping' && gap.need));
});

// ---- 10. The builder check ----

test('the builder check marks silica "Not required" beside a cutting step, whole-building lines in internal work, and other trades\' licences', () => {
  const steps = [{ step: 'Finish concrete', hazards: ['Silica dust and noise from saw cutting joints.'], controls: ['Saw cuts are done wet.'] }];
  const fixesOf = (swms) => checkSwms({ fallRisk: 'no', highRisk: [], ...swms }, { state: 'qld' }).findings.flatMap((item) => item.fixes || []).join('\n');
  assert.match(fixesOf({ task: 'Pour and finish slabs.', steps, notRequired: [SILICA] }), /Silica is marked "Not required"/);
  assert.doesNotMatch(fixesOf({ task: 'Pour and finish slabs.', steps }), /Silica is marked/);
  assert.match(fixesOf({ task: 'Internal strip-out of non load bearing walls.', steps: [{ step: 'Demolish the structure', hazards: ['Falling debris.'], controls: ['The structure is demolished in the reverse order to its construction, from the roof down.'] }] }), /demolishing a whole building/);
  assert.doesNotMatch(fixesOf({ task: 'Demolish the old house.', steps: [{ step: 'Demolish the structure', hazards: ['Falling debris.'], controls: ['The structure is demolished in the reverse order to its construction, from the roof down.'] }] }), /demolishing a whole building/);
  assert.match(fixesOf({ task: 'Install cabling to the gas meters.', steps: [{ step: 'Pull cables', hazards: ['Strain.'], controls: ['Team lift drums.'] }], licences: ['Gas work licence'] }), /gas work licence/);
  assert.match(fixesOf({ task: 'Strip out ceilings, asbestos register checked nil found.', steps: [{ step: 'Strip out ceilings', hazards: ['Dust.'], controls: ['Wet down.'] }], licences: ['Licensed asbestos removalist (Class A for friable asbestos)'] }), /asbestos removalist/);
  assert.match(fixesOf({ task: 'Install kitchen exhaust ductwork.', steps: [{ step: 'Install ductwork', hazards: ['Falls.'], controls: ['Use an EWP.'] }], licences: ['Refrigerant handling licence (ARC)'] }), /refrigerant handling licence/);
  assert.doesNotMatch(fixesOf({ task: 'Install split system air conditioners.', steps: [{ step: 'Install split systems', hazards: ['Falls.'], controls: ['Use an EWP.'] }], licences: ['Refrigerant handling licence (ARC)'] }), /refrigerant handling licence/);
});

test('a SiteWrite draft passes the silica types it marks "Not required" to the builder check', () => {
  const body = bodyOf({ state: 'nsw', fallRisk: 'no', crane: 'company', slinging: 'crane', kinds: ['concrete'], task: 'Place concrete to suspended slabs. Saw cut control joints to slabs.', ...notSilica('saw cutting done by others') });
  const draft = prepareDraft(body);
  assert.ok(fromDraft(draft, { state: 'nsw' }).notRequired.includes(SILICA));
});

// ---- 11. A trench in a street verge is next to the road ----

test('a trench along a street verge is work next to a road in use (the traffic corridor)', () => {
  const draft = draftOf({ state: 'nt', fallRisk: 'no', crane: 'none', task: '375 rcp storm water along mitchel st verge, trench up to 2.4m deep, trench shield, 13t excavator.' });
  assert.ok(draft.highRisk.some((item) => /traffic corridor/.test(item)), draft.highRisk.join('; '));
  assert.ok(!draftOf({ state: 'nt', fallRisk: 'no', crane: 'none', task: 'Lay a stormwater pipe in a trench 1.2 m deep in the rear yard of the site.' }).highRisk.some((item) => /traffic corridor/.test(item)));
});
