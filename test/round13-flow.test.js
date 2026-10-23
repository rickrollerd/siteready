// Messy test round 13 (18 October 2026, local), flow faults: "na" and "n/a" filling a standard answer's blanks and
// printing, the working at height question and its step lost when the step ticks changed, a high risk work row and
// the user's own step lost or moved once the placing boom was unticked, a pasted numbered heading in the task line,
// weak answers that passed or printed oddly, SiteWrite's own scope chips refused or too thin, rescue equipment
// refused for naming first aid beside the ground controls, a roof's fall control filled into work with no roof, and
// Continue saying nothing while the job address waited to be picked. The on-screen faults are also run in a browser
// (scratchpad/flow14).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prepareDraft, questionsFor, taskLine, weakAnswers } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps } = require('../download-gate');
const { checkSwms, fromDraft } = require('../builder-check');
const gate = require('../public/gate-rules');
const nameCase = require('../sitelink-answers');
const scopeTask = require('../public/scope-task');
const rules = require('../public/substance-rules');
const { titleFor } = require('../accounts');
const { ANSWERED, ready } = require('./helpers');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

// ---- 1. "na" and "n/a" in a blank are refused, wherever the blank is ----

const TRENCH_TASK = 'Excavate a trench 2.4 m deep with the excavator and lay 600 mm stormwater pipes, then backfill. Spoil is stockpiled and carted away.';
const shield = (rated) => `Trenches 1.5 m deep or more are shored with a trench shield rated for ${rated} m, as designed by the supplier's engineer.`;
const spoil = (report, kept) => `Spoil is classified as clean fill, tested by GeoLabs (report ${report}), and taken to the Dandenong tip, with the waste records the state environment regulator requires. Stockpiles are kept only at ${kept}, as the principal contractor allows, and covered with plastic.`;

test('a blank of a standard answer filled with "na", "n/a" or "-" is not an answer, and the SWMS waits for it', () => {
  // A run 2: "rated for na m", "report na" and "kept only at n/a" printed, while "TBC" and "-" were refused.
  const asked = (facts) => {
    const input = draftBody({ state: 'vic', task: TRENCH_TASK, fallRisk: 'no', crane: 'none', facts });
    return { weak: weakAnswers(input), draft: prepareDraft(input) };
  };
  const good = asked({ trenchSupport: shield('3'), spoilPlan: spoil('GL-221', 'the laydown area') });
  assert.equal(good.draft.kind, 'draft');
  assert.deepEqual(good.weak, []);
  for (const [facts, id, typed] of [
    [{ trenchSupport: shield('na'), spoilPlan: spoil('GL-221', 'the laydown area') }, 'trenchSupport', 'na'],
    [{ trenchSupport: shield('-'), spoilPlan: spoil('GL-221', 'the laydown area') }, 'trenchSupport', '-'],
    [{ trenchSupport: shield('3'), spoilPlan: spoil('na', 'the laydown area') }, 'spoilPlan', 'na'],
    [{ trenchSupport: shield('3'), spoilPlan: spoil('GL-221', 'n/a') }, 'spoilPlan', 'n/a'],
    [{ trenchSupport: shield('TBC'), spoilPlan: spoil('GL-221', 'the laydown area') }, 'trenchSupport', 'TBC'],
  ]) {
    const got = asked(facts);
    assert.equal(got.draft.kind, 'stand-down', JSON.stringify(facts));
    const weak = got.weak.find((item) => item.id === id);
    assert.ok(weak && weak.why.includes(`"${typed}"`), `${id} ${typed}: ${JSON.stringify(got.weak)}`);
    assert.ok((got.draft.missingHelp || []).some((item) => item.id === id && /is not an answer/.test(item.why || '')), JSON.stringify(got.draft.missingHelp));
  }
  // In Victoria the answers keep their wording, and the blanks are found in it.
  assert.equal(gate.presetFillNeed([shield('____')], shield('na')), '"na" is not an answer. Fill in the blank with what applies on this job.');
});

test('one rule for every blank: the fill-in boxes, a control line\'s blanks, a design\'s details and a line typed in full', () => {
  for (const typed of ['na', 'n/a', 'N.A.', 'none', 'nil', '-', 'TBC', 'dont know', 'yes', 'nothing']) assert.ok(gate.blankFillNeed(typed), typed);
  for (const typed of ['3', 'GeoLabs', 'the laydown area', 'Sam Lee']) assert.equal(gate.blankFillNeed(typed), '', typed);
  // A control line's blanks, as the download gate judges them.
  assert.match(gate.answerNeed({ ask: 'Fill it in.', line: 'Energised work is authorised by: ____ (position).' }, ['n/a']), /"n\/a" is not an answer/);
  assert.equal(gate.answerNeed({ ask: 'Fill it in.', line: 'Energised work is authorised by: ____ (position).' }, ['Site manager']), '');
  // A design's number, by or revision.
  assert.match(gate.designNeed({ what: 'Formwork design', status: 'given', by: 'Smith Engineers', number: 'na', date: '2026-10-01' }), /document or drawing number/);
  assert.match(gate.designNeed({ what: 'Formwork design', status: 'given', by: 'Smith Engineers', number: 'S-101', revision: 'n/a', date: '2026-10-01' }), /its revision/);
  assert.equal(gate.designNeed({ what: 'Formwork design', status: 'given', by: 'Smith Engineers', number: 'S-101', revision: 'C', date: '2026-10-01' }), '');
  // An answer typed in full with "na" or "n/a" in a sentence.
  assert.match(gate.notAnswer('the trench shield is rated for na m'), /still has "na" in it/);
  assert.match(gate.notAnswer('kept only at n/a, covered'), /still has "n\/a" in it/);
  // "N/A" alone, a label's "N/A" and a name are left to their own rules.
  for (const text of ['N/A', 'n/a', 'Licence: N/A', 'Na Li', 'pipes n fittings']) assert.equal(gate.heldIn(text), '', text);
  // The page's fill-in boxes judge each blank by the same rule.
  const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(APP, /G\.blankFillNeed \? G\.blankFillNeed\(input\.value\)/);
});

test('a placeholder that slips into a printed line is caught by the download gate and by SiteWrite\'s check', () => {
  const input = draftBody(ready({ ...ANSWERED, state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no', crane: 'none' }));
  const draft = prepareDraft(input);
  assert.equal(draft.kind, 'draft');
  assert.deepEqual(downloadGaps(input, draft).filter((gap) => gap.id.startsWith('held.')), []);
  const slipped = { ...draft, jobSteps: draft.jobSteps.map((step, index) => (index === 1 ? { ...step, controls: [...step.controls, 'Trenches are shored with a trench shield rated for na m.'] } : step)) };
  const gaps = downloadGaps(input, slipped);
  assert.ok(gaps.some((gap) => gap.id.startsWith('held.') && /"na" is not an answer/.test(gap.need)), JSON.stringify(gaps));
  const h8 = checkSwms(fromDraft(slipped)).findings.find((item) => item.rule === 'H8');
  assert.equal(h8.pass, false);
  assert.match(h8.message, /rated for na m/);
  assert.doesNotMatch(JSON.stringify(checkSwms(fromDraft(draft))), /Blanks or placeholders are left/);
});

// ---- 2. The working at height question and its step stay through a change of step ticks ----

test('a way of working at height chosen keeps its question and its step when the step ticks change', () => {
  // A run 1, "all tiled areas": falls Yes, "on a floor with edge protection"; after the ticks changed and the
  // statement was prepared again, "Work at edges" and "Working at height" both went.
  const TASK = 'Lay floor tiles to unit bathrooms and balconies. Cut tiles. Install screed, bedding and pointing. Grout the tiles.';
  const facts = { safetyDataSheet: 'Cement adhesive and grout: nitrile gloves, P2 when mixing, safety data sheets in the site folder.', silicaControls: 'Tiles are cut wet on the bridge saw, P2 respirators worn.', fallControl: 'Edge protection is installed around every open edge before work starts, and no one works outside it.' };
  const kinds = ['tileCut', 'tileMix', 'tileLay', 'caulking'];
  const run = (extra, answer = 'edge') => {
    const input = draftBody({ state: 'nsw', task: TASK, fallRisk: 'yes', crane: 'none', kinds: [...kinds, ...extra], facts: { ...facts, loadLimits: '3 kPa on the deck', ...(answer ? { fallAccess: answer } : {}) } });
    return { asked: questionsFor(input).required.map((item) => item.id), steps: prepareDraft(input).jobSteps.map((step) => step.step) };
  };
  assert.ok(run([]).asked.includes('fallAccess'));
  // A step ticked whose own lines stop a fall elsewhere (the plumber's rough-in, the reo on the deck).
  for (const extra of [['plumbingFitOff'], ['reo']]) {
    const got = run(extra);
    assert.ok(got.asked.includes('fallAccess'), `${extra}: the question stays`);
    assert.ok(got.steps.includes('Work at edges'), `${extra}: the step stays`);
  }
  // With no way chosen yet, the question is asked only where no step stops a fall, as before.
  assert.ok(!run(['plumbingFitOff'], '').asked.includes('fallAccess'));
  // Falls answered No takes it away.
  const no = questionsFor(draftBody({ state: 'nsw', task: TASK, fallRisk: 'no', crane: 'none', kinds: [...kinds, 'plumbingFitOff'], facts: { ...facts, fallAccess: 'edge' } }));
  assert.ok(!no.required.some((item) => item.id === 'fallAccess'));
});

// ---- 3. Unticking the placing boom keeps the high risk work row and the user's own step where it was ----

test('a step renamed by a plant choice keeps the high risk work it brings and its place in the user\'s order', () => {
  // A run 2: "Powered mobile plant (from the job step Set up the concrete pump)" went, and SiteWrite's check then
  // made it a must-fix; the user's own step slipped from before the pump set-up to after it.
  const TASK = 'Fill the 3 existing cable trenches in the main switchroom with concrete, pumped in through the switchroom door. Switchboards stay live.';
  const ownSteps = [{ name: 'Work in the live switchroom', hazards: ['Electric shock from the live switchboards.'], controls: ['Boards stay closed and locked; no one opens a board, and the electrician isolates where needed.'], who: 'Marco Rinaldi, foreman' }];
  const stepOrder = ['Before starting', 'Work in the live switchroom (Our own step)', 'Set up the concrete pump and placing boom', 'Pump and place concrete', 'Finish the concrete', 'Finish concrete', 'Use power tools', 'Cure the concrete', 'Finish and clean up'];
  const plantChoice = { used: ['Concrete truck', 'Concrete vibrator', 'Electric power tools and leads'], notUsed: ['Concrete placing boom', 'Power trowel', 'Generator', 'Air compressor'], added: [{ item: 'line pump', licence: 'No' }] };
  const PLANT = 'At workplaces where there is any movement of powered mobile plant';
  const base = { state: 'vic', task: TASK, fallRisk: 'no', crane: 'none', kinds: ['concrete', 'slabPour', 'carpentryWork'], ownSteps, stepOrder };
  const before = prepareDraft(draftBody(base));
  const after = prepareDraft(draftBody({ ...base, plantChoice }));
  const names = (draft) => draft.jobSteps.map((step) => step.step);
  assert.deepEqual(names(before).slice(0, 3), ['Before starting', 'Work in the live switchroom (Our own step)', 'Set up the concrete pump and placing boom']);
  assert.deepEqual(names(after).slice(0, 3), ['Before starting', 'Work in the live switchroom (Our own step)', 'Set up the concrete pump']);
  assert.ok(before.highRisk.includes(PLANT));
  assert.ok(after.highRisk.includes(PLANT), JSON.stringify(after.highRisk));
  assert.equal(after.highRiskFrom[PLANT], 'the job step "Set up the concrete pump"');
  // SiteWrite's check finds nothing missing for it.
  assert.doesNotMatch(JSON.stringify(checkSwms(fromDraft(after))), /movement of powered mobile plant[^"]*(?:not listed|missing)/i);
  // Marked "Does not apply" with a reason, it stays off.
  const off = prepareDraft(draftBody({ ...base, plantChoice, highRiskOff: [{ id: 'plant', reason: 'the line pump is towed in and left, no plant moves while we work' }] }));
  assert.ok(!off.highRisk.includes(PLANT));
});

// ---- 4. A pasted heading, numbered or not, and "n" for "and" ----

test('a pasted section heading comes off the task line and the title, numbered or not; a lone "n" reads "and"', () => {
  // B run 6: "DESCRIPTION OF WORK AREA:" started the task line, title, file name and My SWMS entry.
  const PASTED = '2.1 DESCRIPTION OF WORK AREA:\nThe scope of work includes but is not limited to the following principal areas: -\n1. Shop draw, fabricate, supply, deliver, install and certify all front of house joinery items as per the interior designer\'s documents and the Section "6.1 Subcontract Sum Breakdown", including but not limited to:\n· Front of house bathroom joinery\n· Main bar structure and finishes';
  const line = taskLine(PASTED);
  assert.doesNotMatch(line, /DESCRIPTION|WORK AREA|2\.1/);
  assert.match(line, /^Shop draw, fabricate, supply, deliver, install and certify all front of house joinery items/);
  assert.match(titleFor({}, { task: PASTED }), /^Shop draw, fabricate, supply, deliver, install and certify all front of house joinery items/);
  for (const [typed, want] of [
    ['2.1 DESCRIPTION OF WORK AREA: Install joinery.', 'Install joinery.'],
    ['3) SCOPE OF WORKS:\nPaint the walls.', 'Paint the walls.'],
    ['B. MECHANICAL SERVICES:\nInstall the ducts.', 'Install the ducts.'],
    ['DESCRIPTION OF WORK AREA:\nInstall joinery.', 'Install joinery.'],
    // Numbered work lines stay work: only the number goes, as before.
    ['1. Install the kitchen joinery.\n2. Fit the benchtops.', 'Install the kitchen joinery. Fit the benchtops.'],
    // One word in capitals before the work names it, as before.
    ['CCTV: fix the cameras to the poles.', 'CCTV: fix the cameras to the poles.'],
  ]) assert.equal(taskLine(typed), want, typed);
  // B run 7: "n" for "and" stays in the task line and title; decision 1 A reads it as "and" there.
  const bridge = prepareDraft(draftBody({ state: 'act', residential: 'no', fallRisk: 'yes', crane: 'none', task: 'replace bridge bearings n expansion joints, saw cut n jackhammer out the old joint' }));
  assert.equal(bridge.task, 'Replace bridge bearings and expansion joints, saw cut and jackhammer out the old joint');
  assert.equal(titleFor({}, { task: 'replace bridge bearings n expansion joints' }), 'Replace bridge bearings and expansion joints');
  // A company name's lone "n" reads "and" since messy round 17 (flow18 decision 1); a person's "n" is an initial.
  assert.equal(nameCase.tidyCompany('tamar joinery n fitout'), 'Tamar Joinery and Fitout');
  assert.equal(nameCase.tidyCompany('dandenong civil n concrete'), 'Dandenong Civil and Concrete');
  assert.equal(nameCase.tidyName('sam n lee'), 'Sam N Lee');
  const d = prepareDraft(draftBody({ ...ANSWERED, state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', crane: 'none', company: 'dandenong civil n concrete', principalContractor: 'tamar joinery n fitout' }));
  assert.equal(d.subcontractor, 'Dandenong Civil and Concrete');
  assert.equal(d.principalContractor, 'Tamar Joinery and Fitout');
});

// ---- 5. Weak answers that passed or printed oddly ----

test('one-word site answers, the builder as a trade, a vehicle as the muster point and "on the lift" are queried', () => {
  const site = (id, value) => gate.siteNeed(id, value);
  assert.match(site('publicInterface', 'footpath'), /does not say where the public or traffic is/);
  assert.equal(site('publicInterface', 'Public footpath beside the hoarding on Chung Wah Tce'), '');
  assert.equal(site('publicInterface', 'None'), '');
  assert.match(site('access', 'truck'), /does not say how the crew gets to the work/);
  assert.match(site('access', 'drive in'), /does not say how the crew gets to the work/);
  for (const ok of ['scaffold stair', 'Through the Smith Street gate, then the stair tower', 'Through the main site gate.']) assert.equal(site('access', ok), '', ok);
  assert.match(site('ground', 'asphalt'), /names the surface but not how it is/);
  for (const ok of ['boggy', 'concrete yard', 'Level asphalt car park', 'None']) assert.equal(site('ground', ok), '', ok);
  assert.match(site('otherTrades', 'builder'), /is not a trade working near you/);
  assert.match(site('otherTrades', 'the builders'), /is not a trade working near you/);
  assert.equal(site('otherTrades', 'Electricians on the same level'), '');
  assert.match(site('liveServices', 'Existing services.'), /does not say which services/);
  for (const ok of ['Live power in the ceiling', 'None', 'na', 'Energised switchboards in the switchroom']) assert.equal(site('liveServices', ok), '', ok);
  // The download gate judges them the same way.
  const input = draftBody(ready({ ...ANSWERED, state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no', crane: 'none', site: { liveServices: 'Existing services.', publicInterface: 'footpath', otherTrades: 'builder', ground: 'asphalt', access: 'truck' } }));
  const gaps = downloadGaps(input, prepareDraft(input));
  for (const id of ['site.liveServices', 'site.publicInterface', 'site.otherTrades', 'site.ground', 'site.access']) assert.ok(gaps.some((gap) => gap.id === id), id);
  // A vehicle is not a muster point, with its street or not; a gate named for trucks is a place.
  assert.match(gate.fieldWeak('place', 'the hiab truck on chung wah tce'), /is a vehicle, which moves/);
  assert.match(gate.fieldWeak('place', 'beside the ute'), /does not say where|is a vehicle/);
  assert.equal(gate.fieldWeak('place', 'Truck gate on Smith Street'), '');
  // "on the lift" does not say where the ground controls are.
  const controls = { ask: 'Where are the ground controls?', emergency: true, involves: 'an EWP', controls: true };
  assert.match(gate.answerNeed(controls, 'on the lift'), /does not say where on the machine/);
  assert.equal(gate.answerNeed(controls, 'Ground control panel at the rear of the base, key kept in the machine'), '');
  // "dont use any" is no reason for "Not required".
  for (const reason of ['dont use any', 'not needed', 'we dont use it']) assert.equal(rules.reasonNeed(reason), 'weak', reason);
  assert.equal(rules.reasonNeed('no sealing in our work'), '');
});

test('names, roles and places print with the capitals and commas a person would write', () => {
  assert.equal(nameCase.tidyPersonRole('Sione Leading Hand'), 'Sione, Leading Hand');
  assert.equal(nameCase.tidyPersonRole('Mick Tanner foreman'), 'Mick Tanner, Foreman');
  assert.equal(nameCase.tidyPersonRole('rob, our supervisor'), 'Rob, our supervisor');
  assert.equal(nameCase.tidyPersonRole('Sam Foreman'), 'Sam Foreman', 'a surname that is a role word stays a name');
  assert.equal(nameCase.tidyPersonRole('Builder\'s Site Manager'), 'Builder\'s Site Manager');
  assert.equal(nameCase.tidyPersonRole('Nat Okafor, HSE'), 'Nat Okafor, HSE');
  assert.equal(nameCase.tidyPlace('assembly area on chung wah tce'), 'Assembly area on Chung Wah Tce');
  assert.equal(nameCase.tidyPlace('main gate smith st'), 'Main gate Smith St');
  // Printed in the SWMS.
  const d = prepareDraft(draftBody(ready({ ...ANSWERED, state: 'nt', residential: 'no', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', crane: 'none', firstAider: 'Sione Leading Hand', complianceResponsible: 'Mick Tanner foreman', reviewer: 'rob, our supervisor', musterPoint: 'assembly area on chung wah tce' })));
  assert.equal(d.firstAider, 'Sione, Leading Hand');
  assert.equal(d.complianceResponsible, 'Mick Tanner, Foreman');
  assert.equal(d.reviewer, 'Rob, our supervisor');
  assert.equal(d.musterPoint, 'Assembly area on Chung Wah Tce');
  // A crane chart answer of figures alone says what the figures are.
  const hiab = prepareDraft(draftBody({ state: 'nt', residential: 'no', task: 'Plant 14 trees in 200L bags along the street with our hiab truck and a 1.7t mini excavator', fallRisk: 'no', crane: 'own', facts: { craneChart: '2.1t at 6m.', groundBearing: 'the head contractors site manager checked the verge, 600mm pads' } }));
  const lines = hiab.jobSteps.flatMap((step) => step.controls);
  assert.ok(lines.includes('Crane chart rated capacity at the working radius: 2.1t at 6m.'), lines.filter((line) => /6 ?m/.test(line)).join(' | '));
  assert.ok(!lines.includes('2.1t at 6m.'));
});

// ---- 6. SiteWrite never offers a site answer its own check refuses or calls too thin ----

test('a scope condition is offered for a site question only where SiteWrite would accept it as the answer', () => {
  // A run 2: "Existing services." was offered and taken for Live services, naming no service. A run 4: "Other trades
  // working on site." was offered for Other trades, then refused.
  const site = scopeTask.scopeSite([{ conditions: 'Existing services' }, { conditions: 'Other trades working on site' }, { conditions: 'Live 11 kV cables in the switchroom' }, { conditions: 'Plumbers and tilers working above' }]);
  assert.equal(site.liveServices, 'Live 11 kV cables in the switchroom.');
  assert.equal(site.otherTrades, 'Plumbers and tilers working above.');
  assert.deepEqual(scopeTask.siteSuggestions(['Existing services.', 'Live power in the switchroom.'], 'liveServices'), ['Live power in the switchroom.']);
  assert.deepEqual(scopeTask.siteSuggestions(['Other trades working on site.'], 'otherTrades'), []);
  // Each suggestion offered passes the site check for its question.
  for (const [id, texts] of [['otherTrades', ['Shared work areas with other trades.', 'Other trades working on site.', 'Concurrent works by the builder\'s trades on level 2.']], ['publicInterface', ['Public footpath next to the work.', 'Occupied building.']], ['ground', ['Wet ground.', 'Suspended slab, 3 kPa limit.']]]) {
    for (const line of scopeTask.siteSuggestions(texts, id)) assert.equal(gate.siteNeed(id, line), '', `${id}: ${line}`);
  }
  // The project page asks for them by question.
  const GO = fs.readFileSync(path.join(__dirname, '..', 'public', 'project-go.js'), 'utf8');
  assert.match(GO, /T\.siteSuggestions\(texts, id\)/);
  // SiteWrite's other standard answers pass its own rules too: each emergency answer, and each question's answer
  // that has no blank to fill.
  const { QUESTIONS } = require('../emergency');
  for (const item of QUESTIONS) {
    for (const pick of item.suggestions || []) assert.equal(gate.answerNeed({ ask: item.ask, emergency: true, involves: 'this work', ...(item.rescue ? { rescue: true } : {}), ...(item.kit ? { kit: true } : {}), ...(item.stop ? { stop: true } : {}), ...(item.controls ? { controls: true } : {}) }, pick.text), '', `${item.id}: ${pick.label}`);
  }
  const { answerTexts } = require('../presets');
  const { answerState } = require('../draft');
  const ids = [...fs.readFileSync(path.join(__dirname, '..', 'presets.js'), 'utf8').matchAll(/^ {2}(\w+): \[/gm)].map((m) => m[1]);
  for (const id of ids) for (const text of answerTexts(id).filter((line) => !/_{3,}/.test(line))) assert.equal(answerState(id, text), 'supplied', `${id}: ${text.slice(0, 60)}`);
});

// ---- 7. Rescue equipment that names first aid and something else ----

test('rescue equipment is refused as first aid only when first aid is all it names', () => {
  // A run 3: "the scissor lift ground controls n key on the machine, first aid kit in the ute" was refused.
  const kit = { ask: 'What rescue equipment is on site, and where is it kept?', emergency: true, involves: 'a fall', kit: true };
  assert.equal(gate.answerNeed(kit, 'the scissor lift ground controls n key on the machine, first aid kit in the ute'), '');
  assert.equal(gate.answerNeed(kit, 'harness and rope at the work, first aid kit in the ute'), '');
  for (const only of ['first aid kit', 'first aid kit in the ute', 'first aid kit and first aider in the site office']) assert.match(gate.answerNeed(kit, only), /is first aid, not rescue equipment/, only);
});

// ---- 8. A roof's fall control fills only work with a roof ----

test('a roof fall control is not filled into a SWMS whose work names no roof', () => {
  const ROOF = 'The roof top has the builder\'s parapet and temporary edge guardrail at every open edge before we start. We do not remove or alter them.';
  assert.equal(gate.workFits(ROOF, 'Tiling work, all tiled areas\nSupply and install acoustic matting under tiled and hard surfaces. Cut tiles.'), false);
  assert.equal(gate.workFits(ROOF, 'Roof works\nTile the roof top terrace.'), true);
  assert.equal(gate.workFits('Edge protection is installed at every open edge before work starts.', 'Tiling work, all tiled areas'), true);
  assert.equal(gate.workFits('Safety mesh is fixed under the sheets before sheeting starts.', 'Install insulation batts in the ceilings'), false);
});

// ---- 9. Continue says where the job address is waiting to be picked ----

test('Continue with a job address typed but not picked says so beside the address box', async () => {
  const respond = (method, route) => {
    if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
    if (route === '/api/states') return { body: { states: [{ id: 'tas', name: 'Tasmania', loaded: true, versionLabel: 'current' }] } };
    if (route === '/api/me') return { status: 401, body: {} };
    if (route === '/api/steps') return { body: { groups: [] } };
    return { body: {} };
  };
  const p = loadPage(['address.js', 'gate-rules.js', 'app.js', 'account.js'], respond);
  await settle(20);
  p.document.stateTicked = '';
  const box = p.document.getElementById('workplace');
  box.value = '18 brisbane st launcestn';
  p.document.getElementById('task').value = 'Install joinery and benchtops.';
  // Pressed, before the browser checks the form (it would stop at an unanswered question below): the note is beside
  // the address box, and the page goes there rather than on.
  const press = new FakeEvent('click', { bubbles: true });
  p.document.getElementById('continue').dispatchEvent(press);
  assert.ok(press.defaultPrevented, 'Continue stops at the address');
  assert.match(p.document.getElementById('workplace-state').innerHTML, /Pick the job address from the list under the box/);
  assert.match(p.document.getElementById('start-error').textContent, /Pick the job address/);
  assert.ok(box.classList.contains('address-change'));
  // And the form, once sent, says it by Continue too and asks for nothing.
  p.document.getElementById('start').dispatchEvent(new FakeEvent('submit', { bubbles: true }));
  await settle(10);
  assert.match(p.document.getElementById('start-error').textContent, /Pick the job address from the list under the box/);
  assert.ok(!p.calls.some((call) => call.route === '/api/draft/questions'));
  // An address the state can be read from needs no pick.
  const q = loadPage(['address.js', 'gate-rules.js', 'app.js', 'account.js'], respond);
  await settle(20);
  q.document.stateTicked = '';
  q.document.getElementById('workplace').value = '18 Brisbane Street, Launceston TAS';
  const fine = new FakeEvent('click', { bubbles: true });
  q.document.getElementById('continue').dispatchEvent(fine);
  assert.ok(!fine.defaultPrevented);
  assert.doesNotMatch(q.document.getElementById('workplace-state').innerHTML, /Pick the job address/);
});
