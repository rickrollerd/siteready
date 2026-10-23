// Messy test round 15 (19 October 2026, staging), flow faults: a Recommended step lost on re-preparing and after
// sign-in, questions that outlive their step (and "Not applicable" typed to get past one), the harness asked where none
// is used, a stale "not saved yet" note, a rescue answer filled across where it does not fit, weak answers and lower
// case or "n" in printed answers, chips that do not fit their question, plant adding a step unsaid, a Word file in the
// Logo box, and Google's address and hospital lists. The page faults are also run in a browser (scratchpad/flow16).
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps } = require('../download-gate');
const { categoriesFor, emergencyQuestions, harnessUsed } = require('../emergency');
const gate = require('../public/gate-rules');
const nameCase = require('../sitelink-answers');
const scopeTask = require('../public/scope-task');
const rules = require('../public/substance-rules');
const { answersFor } = require('../presets');
const places = require('../places');
const { ANSWERED, ready } = require('./helpers');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

// Every question answered, with SiteWrite's own answer where it has one, then the plant and emergency (ready).
function answered(input) {
  let out = { ...input, facts: { ...(input.facts || {}) } };
  for (let pass = 0; pass < 4; pass += 1) {
    for (const item of questionsFor(draftBody(out)).required || []) {
      if (out.facts[item.id]) continue;
      if (item.choices) { out.facts[item.id] = item.default || (item.choices[0] && (item.choices[0].value || item.choices[0].id)); continue; }
      const pick = (item.suggestions || answersFor(item.id, input.task) || []).find((one) => !/_{3,}/.test(one.text));
      out.facts[item.id] = pick ? pick.text : 'Our supervisor checks it each day before work starts, and the records are kept in the site folder.';
    }
    out = ready(out);
  }
  return out;
}

// ---- 1. A Recommended step the user never unticked stays ticked ----

const SCAFFOLD = 'erect n dismantel 3 lift scafold across the front of a 2 storey shop for the roofers n painters. 18m long 6m high, ties into the brick wall, base plates n sole boards on the footpth, loading bay for roof sheets. hoist gear up by hand rope';
const POWER_SITE = { ...ANSWERED.site, liveServices: 'power lines out front' };

test('a Recommended step a site answer brings is kept with the user\'s picks unless they unticked it', () => {
  // A run 4: "Plan the work near overhead power lines", from the Live services answer "power lines out front", was step
  // 2; after an unrelated untick it showed Recommended but unticked, and Prepare dropped it.
  const base = { state: 'wa', task: SCAFFOLD, fallRisk: 'yes', crane: 'none' };
  const seen = questionsFor(draftBody(base)).steps.suggested;
  assert.ok(!seen.includes('power'));
  const picks = seen.filter((id) => id !== 'masonryMortar');
  const body = draftBody({ ...base, site: POWER_SITE, kinds: picks, kindsOff: ['masonryMortar'], kindsSeen: seen });
  assert.deepEqual(body.kindsKept, ['power']);
  assert.ok(questionsFor(body).steps.chosen.includes('power'));
  const draft = prepareDraft(draftBody(answered({ ...base, ...ANSWERED, site: POWER_SITE, kinds: picks, kindsOff: ['masonryMortar'], kindsSeen: seen })));
  assert.ok(draft.jobSteps.some((step) => step.step === 'Plan the work near overhead power lines'), draft.jobSteps.map((step) => step.step).join(' / '));
  // Unticked by hand, or already in the list the user saw, it stays as the user left it.
  assert.equal(draftBody({ ...base, site: POWER_SITE, kinds: picks, kindsOff: ['masonryMortar', 'power'], kindsSeen: seen }).kindsKept, undefined);
  const seenWith = questionsFor(draftBody({ ...base, site: POWER_SITE })).steps.suggested;
  assert.equal(draftBody({ ...base, site: POWER_SITE, kinds: picks, kindsSeen: seenWith }).kindsKept, undefined);
  // Without the list the user saw (a scope's own picks), the picks are as sent.
  assert.equal(draftBody({ ...base, site: POWER_SITE, kinds: picks }).kindsKept, undefined);
});

const STEP_GROUPS = { groups: [{ trade: 'Scaffolding', kinds: ['scaffold', 'masonryMortar', 'power'].map((id) => ({ id, label: id, steps: [id] })) }] };
test('the page sends the steps it showed, keeps the steps the server kept, and asks a brought-back SWMS with its site answers', async () => {
  const sent = [];
  const p = loadPage(['app.js'], (method, route, body) => {
    if (route.endsWith('/api/steps')) return { body: STEP_GROUPS };
    if (route.endsWith('/api/draft/questions')) {
      sent.push(body);
      const power = Boolean(body.site && /power lines/.test(body.site.liveServices || ''));
      const suggested = power ? ['power', 'scaffold', 'masonryMortar'] : ['scaffold', 'masonryMortar'];
      const kept = power && Array.isArray(body.kinds) && Array.isArray(body.kindsSeen) && !body.kindsSeen.includes('power') ? ['power'] : undefined;
      const chosen = Array.isArray(body.kinds) ? [...body.kinds, ...(kept || [])] : suggested;
      return { body: { required: [], weak: [], steps: { suggested, chosen, locked: power ? ['power'] : [] }, ...(kept ? { kindsKept: kept } : {}) } };
    }
    return { body: {} };
  });
  await settle();
  await p.run('loadQuestions({ stay: true })');
  await settle();
  // The Live services answer is typed after the list was drawn, and an unrelated step is unticked.
  p.run('siteMemory = { liveServices: "power lines out front" }');
  const list = p.document.getElementById('steps-block');
  p.document.querySelectorAll = (selector) => (selector === '#steps-block input[data-step]:checked' ? [{ value: 'scaffold' }] : []);
  const change = new FakeEvent('change');
  change.target = { matches: (selector) => selector === '[data-step]', checked: false, value: 'masonryMortar' };
  list.dispatchEvent(change);
  await settle();
  const last = sent[sent.length - 1];
  assert.deepEqual(last.kindsSeen, ['scaffold', 'masonryMortar']);
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(stepPicks)')), ['scaffold', 'power']);
  assert.match(list.innerHTML, /value="power" checked/);
  // Brought back after a sign-in, the first ask carries the site answers, so the step is found and offered.
  p.run('fillStart({ state: "wa", task: "scaffold", kinds: ["scaffold", "power"], kindsOff: ["masonryMortar"], kindsSeen: ["scaffold", "masonryMortar", "power"], site: { liveServices: "power lines out front" } })');
  await p.run('loadQuestions({ stay: true })');
  assert.equal(sent[sent.length - 1].site.liveServices, 'power lines out front');
  assert.deepEqual(sent[sent.length - 1].kindsSeen, ['scaffold', 'masonryMortar', 'power']);
});

// ---- 2. A question asked only for a step goes when the step is unticked ----

const RISERS = "Hydraulic pipework at height: install risers in shafts and pipework in ceilings in copper, PVC and polyethylene, joined by brazing, solvent cement and PE fusion welding. Nine storey apartment building: DN100 PVC sewer stacks and copper hot and cold water risers in the service shafts from basement 1 to level 9, then branch pipework in the corridor ceilings from a mobile scaffold and podium steps. Pipe lengths are lifted up the shaft with our chain block. The builder has handrails and penetration covers on the shaft openings.";
const RISER_FACTS = {
  fallControl: "The builder's handrails and penetration covers stay on the shaft openings. Ceiling pipework is done from a mobile scaffold with guardrails.",
  safetyDataSheet: 'PVC primer and solvent cement, brazing flux and MAPP gas: used with good airflow, away from flames, SDS in the site box.',
  hotWorkPermit: 'The builder issues the hot work permit each day and our apprentice keeps the fire watch for 60 minutes after.',
};
const NO_TRENCH = ['mobileScaffold', 'hydraulicRisers', 'hotWork', 'solventCement', 'peFusion'];

test('"Trench support" goes as soon as the trench steps are unticked, and its answer no longer prints', () => {
  // B run 5: after the trench group was unticked, "Trench support" stayed and blocked Prepare.
  // content16 reads the risers in service shafts as no excavation, so the trench steps are ticked here by hand, as the user had them.
  const base = { state: 'sa', task: RISERS, fallRisk: 'yes', crane: 'none' };
  assert.ok(!questionsFor(draftBody(base)).steps.suggested.includes('trench'));
  assert.ok(questionsFor(draftBody({ ...base, kinds: [...NO_TRENCH, 'trench'] })).required.some((item) => item.id === 'trenchSupport'));
  const asked = questionsFor(draftBody({ ...base, kinds: NO_TRENCH, kindsOff: ['trench'] }));
  assert.ok(!asked.required.some((item) => item.id === 'trenchSupport'), asked.required.map((item) => item.id).join());
  // A trench support answer left from before does not print as a control.
  const draft = prepareDraft(draftBody({ ...base, kinds: NO_TRENCH, facts: { ...RISER_FACTS, trenchSupport: 'Trench shields to full depth.' } }));
  assert.equal(draft.kind, 'draft');
  assert.ok(!draft.controls.some((item) => /Trench shields/.test(item.text)));
  // Nor are the trench rescue questions asked, with no step that digs or works in a trench.
  assert.ok(!categoriesFor(draft).includes('trench'), categoriesFor(draft).join());
  // A trench step still ticked keeps them.
  const dug = prepareDraft(draftBody(answered({ state: 'tas', task: 'Excavate a trench 2.2 m deep with trench shields and lay the stormwater pipe.', fallRisk: 'yes', crane: 'none', ...ANSWERED })));
  assert.ok(categoriesFor(dug).includes('trench'));
});

test('"Not applicable" typed to get past a step\'s question is not an answer, and never prints as a control', () => {
  // B run 5: "Not applicable, there is no trench on this job." passed and printed as an "Isolate or engineer" control.
  const base = { state: 'sa', task: RISERS, fallRisk: 'yes', crane: 'none' };
  const typed = 'Not applicable, there is no trench on this job.';
  const held = prepareDraft(draftBody({ ...base, kinds: [...NO_TRENCH, 'trench'], facts: { ...RISER_FACTS, trenchSupport: typed } }));
  assert.equal(held.kind, 'stand-down');
  const item = held.missingHelp.find((one) => one.id === 'trenchSupport');
  assert.equal(item.state, 'vague');
  assert.match(item.why, /says this does not apply, so it cannot go in the SWMS as a control\. If this work is not done, untick its job steps under Job steps/);
  // With the steps unticked, it is not asked and nothing of it prints.
  const draft = prepareDraft(draftBody({ ...base, kinds: NO_TRENCH, facts: { ...RISER_FACTS, trenchSupport: typed } }));
  assert.equal(draft.kind, 'draft');
  assert.ok(!JSON.stringify([draft.controls, draft.jobSteps]).includes('Not applicable'));
  // "Not applicable, no harness is used" stays the harness answer. Since messy round 16 (flow17) a "no harness" answer
  // never prints as a control.
  const harness = prepareDraft(draftBody({ ...base, kinds: [...NO_TRENCH, 'carpEdge'], ppe: ['hardHat', 'boots', 'harness'], facts: { ...RISER_FACTS, harnessSystem: 'Not applicable, no harness is used on this job.' } }));
  assert.equal(harness.kind, 'draft', JSON.stringify(harness.missing));
  const said = harness.jobSteps.flatMap((step) => step.controls);
  assert.ok(!said.includes('No harness is used on this job.'), JSON.stringify(said.filter((line) => /harness/i.test(line))));
  assert.ok(!said.some((line) => /Not applicable/.test(line)));
});

// ---- 3. The harness, and its rescue wording, only where a harness is used or named ----

const STRIP = 'Soft strip of levels 2 and 3 of a vacant four storey office building: remove ceiling tiles and grid, non load bearing stud partitions, carpet and vinyl floor coverings, and loose fittings, working from mobile scaffolds and podium steps. Then demolish the single storey brick rear annexe with our 14 t excavator and hydraulic breaker: strip the metal roof sheeting from a scissor lift first, then knock down the brick walls and break up the slab. Asbestos has been removed by a licensed removalist and a clearance certificate is issued before we start. The builder has disconnected and made safe all services to the annexe. Waste is sorted into skip bins on site.';

test('the voids step asks no "Harness and anchors" where the fall control uses no harness', () => {
  // B run 5: the library step "Work near balcony edges, voids and penetrations" brought a required harness question.
  const base = { state: 'sa', task: RISERS, fallRisk: 'yes', crane: 'none', kinds: [...NO_TRENCH, 'carpEdge'], facts: RISER_FACTS };
  const asked = questionsFor(draftBody(base));
  assert.ok(!asked.required.some((item) => item.id === 'harnessSystem'), asked.required.map((item) => item.id).join());
  assert.ok(!asked.ppe.flatMap((group) => group.items).find((one) => one.id === 'harness').ticked);
  const draft = prepareDraft(draftBody(base));
  assert.equal(draft.kind, 'draft', JSON.stringify(draft.missing));
  assert.equal(harnessUsed(draft), false);
  assert.equal(emergencyQuestions(draft).find((one) => one.id === 'fallRescue').ask, 'How is a person who falls rescued straight away, and by whom?');
  // A fall control that uses a harness still asks it.
  const roped = questionsFor(draftBody({ ...base, facts: { ...RISER_FACTS, fallControl: 'Workers at the open shaft wear a full body harness clipped to the rated anchor.' } }));
  assert.ok(roped.required.some((item) => item.id === 'harnessSystem'));
});

test('the fall rescue says nothing of a harness for scissor lift and scaffold work with none', () => {
  // B runs 6 and 7: "or is left hanging in a harness" was asked for a scissor lift and mobile scaffold job.
  const input = { state: 'act', task: STRIP, fallRisk: 'yes', crane: 'none', facts: { fallControl: 'Roof sheeting is removed from a scissor lift with guardrails, working from below. Ceilings are removed from mobile scaffolds with guardrails.' } };
  const chosen = questionsFor(draftBody(input)).steps.chosen.filter((id) => !['floorLay', 'ceilingGrid', 'roof'].includes(id));
  const draft = prepareDraft(draftBody({ ...input, kinds: chosen }));
  assert.equal(draft.kind, 'draft', JSON.stringify(draft.missing));
  assert.equal(harnessUsed(draft), false);
  const ask = emergencyQuestions(draft).find((one) => one.id === 'fallRescue');
  assert.ok(ask);
  assert.doesNotMatch(ask.ask, /harness/);
  // Lines that only name a harness as a plan, a ban, training or a tool lanyard do not count; one worn does.
  const lines = (controls) => ({ kind: 'draft', highRisk: [], ppe: [], jobSteps: [{ step: 'Use an elevating work platform', hazards: ['A fall from the platform.'], controls }] });
  for (const line of ['A rescue plan is in place for anyone working from an elevating work platform or held by a harness.', 'Tools are secured to an anchor point with tool lanyards so they cannot fall from the platform.', 'Workers are trained in the safe use of fall arrest equipment and the emergency rescue procedures for the EWP before using it.', 'Where temporary edge protection must be opened, access to the opening is under a permit system. Workers at the opening use travel restraint so they cannot reach the edge. No one uses a fall arrest harness while working alone.']) {
    assert.equal(harnessUsed(lines([line])), false, line);
  }
  assert.equal(harnessUsed(lines(['Wear a full body harness clipped to the boom lift anchor point.'])), true);
});

// ---- 4. The "not saved yet" note goes once the work is saved or downloaded ----

test('"Your work is back as you left it (not saved yet ...)" goes once the work is saved or downloaded', async () => {
  // A run 1: it stayed after preparing and downloading.
  const p = loadPage(['app.js'], () => ({ body: {} }));
  await settle();
  let gone = 0;
  p.document.getElementById('unsaved-note').remove = () => { gone += 1; };
  p.run('window.SiteWrite.clearUnsaved()');
  assert.equal(gone, 1);
  p.run('window.SiteWrite.unsavedNoteOff()');
  assert.equal(gone, 2);
  // The account script and the project download both take it off after a download, and keep it off after a reload (flow17,
  // messy round 16: test/round16-flow.test.js).
  const account = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'account.js'), 'utf8');
  assert.match(account, /await download\(route, fallbackName, body\);\n\s*\/\/ Downloaded: the note that the work is not saved yet goes[^\n]*\n[^\n]*\n\s*if \(S\.unsavedDownloaded\) S\.unsavedDownloaded\(\); else if \(S\.unsavedNoteOff\) S\.unsavedNoteOff\(\);\n\s*if \(!saved\) return;/);
  const scope = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'scope.js'), 'utf8');
  assert.match(scope, /S\.download\('\/api\/project\.zip'[^\n]*\n(?:[^\n]*\n){2}\s*if \(S\.unsavedDownloaded\) S\.unsavedDownloaded\(\); else if \(S\.unsavedNoteOff\) S\.unsavedNoteOff\(\);/);
});

// ---- 5. A rescue answer fills across only where its way of rescue fits ----

test('a rescue answer that reaches the person from the floor below is not filled into an EWP SWMS', () => {
  // A run 2: the penetrations rescue was filled into the electrical SWMS, whose falls are from an EWP.
  const below = 'The supervisor and a second worker reach them from the floor below with the rescue kit, and the first aider treats them until the ambulance arrives.';
  assert.deepEqual(gate.acrossFor({ fallRescue: [below] }, {}, 'Install HV cabling and terminate cables.\nElevating work platform'), {});
  assert.equal(gate.acrossFor({ fallRescue: [below] }, {}, 'Core drill penetrations through the slab.').fallRescue, below);
  // An earlier answer that fits is taken instead, and one that names no way fits any SWMS.
  const plain = 'Two trained workers bring the person down with the rescue kit kept at the work.';
  assert.equal(gate.acrossFor({ fallRescue: [plain, below] }, {}, 'Install HV cabling.').fallRescue, plain);
  assert.equal(gate.acrossFor({ fallRescue: ['The leading hand reaches them from the scaffold.'] }, {}, 'Install HV cabling.').fallRescue, undefined);
  // Other answers are judged as before.
  assert.equal(gate.acrossFor({ plantStop: ['The operator turns the key off.'] }, {}, 'Install HV cabling.').plantStop, 'The operator turns the key off.');
});

// ---- 6. Weak answers, and user text printed with its capitals and "and" ----

test('a person\'s name where the role is asked, a rescue that only lowers the platform, and "Boss" as a role are refused', () => {
  // A run 3: "Kim Nguyen" as who lowers the EWP, "spotter lowers the scissor lift" as the rescue; A run 4: "Boss".
  const draft = { kind: 'draft', highRisk: ['Involves a risk of a person falling more than 2 metres'], plant: [{ item: 'Scissor lift' }], ppe: [], jobSteps: [{ step: 'Work from ladders', hazards: ['A fall from the ladder.'], controls: ['Platform ladders only.'] }] };
  const need = (id, answer) => {
    const gaps = downloadGaps({ emergency: { [id]: answer } }, { ...draft, emergencyQuestions: emergencyQuestions(draft, { [id]: answer }) });
    const gap = gaps.find((one) => one.id === `emergency.${id}`);
    return gap ? gap.need || '' : '';
  };
  assert.match(need('ewpLower', 'Kim Nguyen'), /"Kim Nguyen" is a person's name, not a role: on a big site the person changes\. Who on the ground lowers the platform/);
  assert.match(need('ewpLower', 'kim nguyen'), /is a person's name/);
  assert.equal(need('ewpLower', 'The spotter on the ground, trained on the ground controls.'), '');
  assert.equal(need('ewpLower', 'Kim Nguyen, the spotter'), '');
  assert.match(need('fallRescue', 'spotter lowers the scissor lift'), /says how the platform comes down, not how a person who falls is rescued/);
  assert.equal(need('fallRescue', 'The spotter lowers the scissor lift, and the leading hand reaches the person from the platform with the rescue kit.'), '');
  assert.match(gate.checkerRoleNeed('Boss'), /is not a role a reviewer can read/);
  assert.match(gate.checkerRoleNeed('the boss'), /is not a role a reviewer can read/);
  assert.equal(gate.checkerRoleNeed('Owner'), '');
  assert.equal(gate.checkerRoleNeed('Director'), '');
});

test('"forklift is the builders" does not settle fuel while a forklift is in the plant list', () => {
  const FUEL = 'Fuels (diesel, petrol)';
  const draft = { plant: [{ item: 'Forklift' }, { item: 'Scissor lift' }], jobSteps: [] };
  assert.match(rules.notUsedNeed(FUEL, 'forklift is the builders', '', '', '', '', draft), /says the forklift is not yours, but it is in this SWMS's plant list\. Say who fuels it/);
  assert.equal(rules.notUsedNeed(FUEL, 'The builder\'s forklift is fuelled by the builder; we do not refuel on site.', '', '', '', '', draft), '');
  // With no forklift in the plant list, the reason is judged as before.
  assert.equal(rules.notUsedNeed(FUEL, 'forklift is the builders', '', '', '', '', { plant: [{ item: 'Scissor lift' }], jobSteps: [] }), '');
});

test('names, places and sentences print with their capitals, and a lone "n" as "and", wherever user text prints', () => {
  // A run 4: "jake morrow" in Scaffold supervisor and the rescue answer, "Pakenham St n High St" in the Emergency table,
  // "overloaded n collapses" in an own step and "gin wheel n rope" in the plant; B run 6: "liverpool st"; B run 8: "...
  // trench shields. barrier mesh fence".
  assert.equal(nameCase.tidyPersonRole('jake morrow - holds HRW scaffolding intermediate'), 'Jake Morrow - holds HRW scaffolding intermediate');
  const input = answered({
    state: 'wa', task: 'erect and dismantle 3 lift scaffold across the front of a 2 storey shop, ties into the brick wall, loading bay for roof sheets', fallRisk: 'yes', crane: 'none', ...ANSWERED,
    scaffoldSupervisor: 'jake morrow - holds HRW scaffolding intermediate',
    musterPoint: 'corner of pakenham st n high st, by the bus stop',
    site: { ...ANSWERED.site, publicInterface: 'public footpath on liverpool st under the scaffold' },
    facts: { fallControl: 'Scaffolders work from a fully decked platform with advance guardrails. barrier mesh fence on the footpath below.' },
    ownSteps: [{ name: 'build the loading bay for the roof sheets', hazards: ['loading bay overloaded n collapses', 'sheets fall on the footpath'], controls: ['loading bay built to the ringlock guide with the load rating sign on it', 'gate n toe boards on the bay'], who: 'Jake Morrow' }],
  });
  const rescue = 'jake morrow n the other scaffolder get them back onto the deck n down the ladder bay';
  const plantChoice = { ...input.plantChoice, added: [{ item: 'gin wheel n rope', licence: 'no' }] };
  const draft = prepareDraft(draftBody({ ...input, plantChoice, emergency: { ...input.emergency, fallRescue: rescue } }));
  assert.equal(draft.kind, 'draft', JSON.stringify(draft.missing));
  assert.equal(draft.scaffoldSupervisor, 'Jake Morrow - holds HRW scaffolding intermediate');
  const rows = JSON.stringify(draft.emergency);
  assert.match(rows, /Rescue: Jake Morrow and the other scaffolder get them back onto the deck and down the ladder bay/);
  assert.match(rows, /Corner of Pakenham St and High St, by the bus stop/);
  const own = draft.jobSteps.find((step) => step.own);
  assert.deepEqual(own.hazards, ['Loading bay overloaded and collapses', 'Sheets fall on the footpath']);
  assert.ok(own.controls.includes('Gate and toe boards on the bay'));
  assert.equal(draft.site.find((field) => field.id === 'publicInterface').text, 'Public footpath on Liverpool St under the scaffold');
  assert.ok(draft.plant.some((item) => item.item === 'gin wheel n rope' && item.shown === 'Gin wheel and rope'));
  assert.ok(!JSON.stringify(draft.controls).includes('. barrier'), JSON.stringify(draft.controls));
  // A company's lone "n" reads "and" since messy round 17 (flow18 decision 1).
  assert.equal(nameCase.tidyCompany('swan valley scaffold n access'), 'Swan Valley Scaffold and Access');
});

// ---- 7. Chips only where they answer the question for this crew ----

test('scope chips that do not fit their question are not offered there', () => {
  // A runs 2 and 4: a live HV network and isolated buildings offered as Public interface, "Vehicle access point." as Access.
  const site = scopeTask.scopeSite([{ conditions: 'Existing live HV network of an operating facility; Buildings isolated from the network in an operating facility; Vehicle access point; Public footpath on Smith Street; Access via Gate 3 off Smith St' }]);
  assert.equal(site.publicInterface, 'Public footpath on Smith Street.');
  assert.equal(site.liveServices, 'Existing live HV network of an operating facility.');
  assert.equal(site.access, 'Access via Gate 3 off Smith St.');
  assert.deepEqual(scopeTask.siteSuggestions(['Vehicle access point.', 'Deliveries through Gate 2 on Hope Street.'], 'access'), ['Deliveries through Gate 2 on Hope Street.']);
  assert.deepEqual(scopeTask.siteSuggestions(['Existing live HV network of an operating facility.', 'Patients and visitors in the corridors.'], 'publicInterface'), ['Patients and visitors in the corridors.']);
});

test('the fall chips fit the crew: no "handed over by a licensed scaffolder" for the erectors, and trench chips for a trench', () => {
  // A run 4: the "Scaffold" chip printed first in "Erect the scaffold"; B run 8: only building and roof chips for a trench.
  const erect = answersFor('fallControl', 'erect and dismantle 3 lift scaffold across the front of a 2 storey shop').map((one) => one.label);
  assert.ok(!erect.includes('Scaffold'), erect.join());
  assert.equal(erect[0], 'Advance guardrails');
  assert.ok(answersFor('fallControl', 'Paint the walls of the two storey building from the scaffold').some((one) => one.label === 'Scaffold'));
  const trench = 'Stormwater drainage: excavate trenches, including trenches deeper than 1.5 m with shoring or shields installed by workers competent in that system, lay and joint the pipes and subsoil drain pipes, place the precast pits and gully pits, and backfill. 90m of 600 RCP, trench about 2.6m deep at the low end, trench shield, our 20t excavator.';
  const chips = answersFor('fallControl', trench);
  assert.deepEqual(chips.map((one) => one.label), ['Excavation edge barriers', 'Shields above ground', 'Fenced or covered', 'Edge protection']);
  // Worded as the library's sourced trench lines (Excavation work code s 4.4).
  assert.equal(chips[1].text, 'Trench shields or trench sheets stand above ground level, or guardrails or mesh covers are fitted to them.');
  assert.equal(chips[2].text, 'Open trenches are fenced or covered when no one is working at them.');
  // No shields named, no shields chip; and none of the trench chips for building work.
  assert.ok(!answersFor('fallControl', 'Excavate a trench 1.8 m deep, battered sides, and lay the conduit.').some((one) => one.label === 'Shields above ground'));
  assert.ok(!answersFor('fallControl', 'Install ceilings on level 3').some((one) => ['Shields above ground', 'Fenced or covered'].includes(one.label)));
});

// ---- 8. The page says which step confirming the plant added ----

test('the plant box says which job step confirming the plant added, and no longer says the steps stay as they are', async () => {
  // A run 1: a cordless drill added "Drill or cut concrete, masonry or stone" while the page said the steps stay.
  const p = loadPage(['app.js'], () => ({ body: {} }));
  await settle();
  p.run('plantChoice = { used: [], notUsed: [], added: [{ item: "Cordless drill", licence: "No" }] }');
  p.run('plantAddedSteps = ["Drill or cut concrete, masonry or stone"]');
  const html = p.run('plantBlock({ plantInferred: [], gate: [] })');
  assert.doesNotMatch(html, /The job steps stay as they are/);
  assert.match(html, /Confirming it added the job step &quot;Drill or cut concrete, masonry or stone&quot;\. Untick it under Job steps if your crew does not do that work\./);
});

// ---- 9. A file that is not a picture in the Logo box gets a plain message ----

test('a Word file in the Logo box is refused with a plain message', async () => {
  const p = loadPage(['app.js'], () => ({ body: {} }));
  await settle();
  const box = p.document.getElementById('profile-logo');
  const change = new FakeEvent('change');
  change.target = { files: [{ name: 'Company letterhead.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }], value: 'C:\\fakepath\\Company letterhead.docx' };
  box.dispatchEvent(change);
  await settle();
  assert.equal(p.document.getElementById('profile-logo-error').textContent, '"Company letterhead.docx" is not a picture SiteWrite can use as a logo. Choose your logo as a PNG or JPEG image.');
  assert.equal(change.target.value, '');
});

// ---- 10. Google's address and hospital lists ----

const suggestion = (main, rest) => ({ placePrediction: { text: { text: `${main}, ${rest}, Australia` }, structuredFormat: { mainText: { text: main }, secondaryText: { text: rest } }, types: ['street_address'] } });
const answer = (data) => ({ ok: true, status: 200, json: async () => data });

test('the suggestion whose suburb is the one typed comes first', async () => {
  // A run 1: "22 hunter st newcastle" offered "22 Hunter St, Stockton Newcastle NSW" first.
  process.env.GOOGLE_PLACES_API_KEY = 'test-only';
  try {
    const fetchImpl = async () => answer({ suggestions: [suggestion('22 Hunter St', 'Stockton Newcastle NSW'), suggestion('22 Hunter St', 'Newcastle NSW')] });
    const found = await places.suggest('22 hunter st newcastle', { fetchImpl });
    assert.equal(found.suggestions[0].text, '22 Hunter St, Newcastle NSW');
    // A typed suburb that is the other one keeps it first.
    const other = await places.suggest('22 hunter st stockton', { fetchImpl: async () => answer({ suggestions: [suggestion('22 Hunter St', 'Newcastle NSW'), suggestion('22 Hunter St', 'Stockton Newcastle NSW')] }) });
    assert.equal(other.suggestions[0].text, '22 Hunter St, Stockton Newcastle NSW');
  } finally {
    delete process.env.GOOGLE_PLACES_API_KEY;
  }
});

// A stand-in for Google's place searches: the job's location, then the same places for every hospital search.
function careFetch(centre, list) {
  return async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.pageSize === 1) return answer({ places: [{ location: centre.at, formattedAddress: centre.address }] });
    const clinic = (body.includedPrimaryTypes && !body.includedPrimaryTypes.includes('hospital')) || /medical centre/.test(body.textQuery || '');
    if (clinic) return answer({ places: [] });
    return answer({ places: list.map(([name, lat, lng, address, type], i) => ({ id: `p${i}`, displayName: { text: name }, formattedAddress: `${address}, Australia`, location: { latitude: lat, longitude: lng }, primaryType: type || 'hospital' })) });
  };
}

test('hospitals: one entry per hospital, no health service body, the emergency department listing said, women\'s and children\'s after', async () => {
  process.env.GOOGLE_PLACES_API_KEY = 'test-only';
  try {
    // A run 4 (Fremantle): Fremantle Hospital first with no emergency department listing, and "North Metropolitan
    // Health Service" listed as a hospital. Google's own lists cannot show that Fremantle has none (Canberra Hospital
    // came back the same way and has one: content8), so the nearest stays first; the one with an emergency department
    // listing says so.
    const wa = await places.nearbyCare('41 Pakenham St, Fremantle WA 6160', { fetchImpl: careFetch({ at: { latitude: -32.056, longitude: 115.747 }, address: '41 Pakenham St, Fremantle WA 6160, Australia' }, [
      ['Fremantle Hospital', -32.0555, 115.7535, 'Alma St, Fremantle WA 6160'],
      ['North Metropolitan Health Service', -32.05, 115.75, '2 Alma St, Fremantle WA 6160'],
      ['Fiona Stanley Hospital', -32.0697, 115.8418, '11 Robin Warren Dr, Murdoch WA 6150'],
      ['Fiona Stanley Hospital Emergency Department', -32.0699, 115.8420, '11 Robin Warren Dr, Murdoch WA 6150'],
      ['St John of God Murdoch Hospital', -32.0675, 115.8355, '100 Murdoch Dr, Murdoch WA 6150'],
    ]) });
    const names = wa.hospitals.map((item) => item.name);
    assert.equal(names.filter((name) => /Fiona Stanley/.test(name)).length, 1, names.join(' | '));
    assert.ok(!names.includes('North Metropolitan Health Service'));
    const fiona = wa.hospitals.find((item) => /Fiona Stanley/.test(item.name));
    assert.equal(fiona.name, 'Fiona Stanley Hospital Emergency Department');
    assert.equal(fiona.emergencyListed, true);
    assert.equal(wa.hospitals.find((item) => item.name === 'Fremantle Hospital').emergencyListed, undefined);
    assert.equal(wa.hospitals.find((item) => /St John of God/.test(item.name)).private, true);
    // B run 7 (Canberra): "Main Reception Canberra Hospital" beside Canberra Hospital, and the women's and children's
    // hospital before the emergency department.
    const act = await places.nearbyCare('15 Lonsdale Street, Braddon ACT 2612', { fetchImpl: careFetch({ at: { latitude: -35.276, longitude: 149.133 }, address: '15 Lonsdale St, Braddon ACT 2612, Australia' }, [
      ['Centenary Hospital for Women and Children', -35.3455, 149.1000, 'Yamba Dr, Garran ACT 2605'],
      ['Main Reception Canberra Hospital', -35.3460, 149.1002, 'Yamba Dr, Garran ACT 2605'],
      ['Canberra Hospital', -35.3461, 149.1004, 'Yamba Dr, Garran ACT 2605'],
      ['Canberra Hospital Emergency Department', -35.3463, 149.1006, 'Yamba Dr, Garran ACT 2605'],
      ['North Canberra Hospital', -35.251, 149.091, 'Mary Potter Cct, Bruce ACT 2617'],
    ]) });
    const actNames = act.hospitals.map((item) => item.name);
    assert.equal(actNames.filter((name) => /^(?:Main Reception )?Canberra Hospital/.test(name)).length, 1, actNames.join(' | '));
    assert.ok(actNames.indexOf('Centenary Hospital for Women and Children') > actNames.findIndex((name) => /^Canberra Hospital/.test(name)), actNames.join(' | '));
    // A run 1 (Maitland): the hospital and its emergency room at one address are one entry.
    const nsw = await places.nearbyCare('22 Hunter St, Newcastle NSW 2300', { fetchImpl: careFetch({ at: { latitude: -32.73, longitude: 151.55 }, address: 'Maitland NSW 2320, Australia' }, [
      ['The Maitland Hospital: Emergency Room', -32.7300, 151.5600, '1 Metford Rd, Metford NSW 2323'],
      ['Maitland Hospital', -32.7301, 151.5601, '1 Metford Rd, Metford NSW 2323'],
      ['Maitland Private Hospital', -32.7350, 151.5500, '175 Chisholm Rd, East Maitland NSW 2323'],
    ]) });
    assert.equal(nsw.hospitals.filter((item) => /Maitland Hospital/.test(item.name) && !/Private/.test(item.name)).length, 1, nsw.hospitals.map((item) => item.name).join(' | '));
    // Two hospitals that share a word but stand apart stay two, and a private hospital beside a public one stays its own.
    assert.ok(actNames.includes('North Canberra Hospital'));
    assert.ok(nsw.hospitals.some((item) => item.name === 'Maitland Private Hospital'));
  } finally {
    delete process.env.GOOGLE_PLACES_API_KEY;
  }
});
