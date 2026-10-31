// Messy test round 19 (23 October 2026, staging), flow faults: steps lost when a step was added or the task retyped, the crane
// in or out (a scope that gives the crew the cranage, a crane company with no crane step, "crane tie"), Builder check suggesting
// a plain "Approved" with a hold point open, a good live services answer refused, typed text printed as typed, weak answers
// and wording, plant slang, reasons on the project page, and the address and place lookups. The page faults are also run in a
// browser (scratchpad/flow20).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { checkSwms, fromDraft } = require('../builder-check');
const gate = require('../public/gate-rules');
const fill = require('../public/design-fill');
const rules = require('../public/substance-rules');
const choice = require('../public/scope-choice');
const address = require('../public/address');
const nameCase = require('../sitelink-answers');
const { stepLibrary } = require('../steps');
const { titleFor } = require('../accounts');
const places = require('../places');
const { answersFor } = require('../presets');
const { ANSWERED, ready } = require('./helpers');
const { loadPage, settle } = require('./fake-dom');

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
const names = (draft) => (draft.jobSteps || []).map((step) => step.step);
const lines = (draft) => (draft.jobSteps || []).flatMap((step) => step.controls.map((line) => `${step.step}: ${typeof line === 'string' ? line : line.text}`));
const page = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');

// ---- 1. A step the user or an answer chose stays chosen, and a ticked step prints ----

const MECH = 'DESCRIPTION OF WORK AREA:\n· All mechanical services to all building areas including the lobby, common areas and all back of house areas including air conditioning and mechanical ventilation systems.\n· All fire dampers required on duct passing through fire wall on grid 17.\n· kitchen extract ductwork to kitchens as detailed on the kitchen consultant\'s drawings and spec.';
const MECH_SITE = { ...ANSWERED.site, access: 'Through the Ocean St gate, stairs inside the buildings.' };
const EWP_OR_TOWER = 'Work above 2 m is done from an EWP or a mobile scaffold with guardrails, and platform ladders are used only for short work below 2 m.';

test('adding a step keeps a step the fall answer brought after the step list was drawn', () => {
  // A run 3: "Use mobile scaffolds", from the fall answer, went when "Work with the crane crew during lifts" was added.
  const base = { ...ANSWERED, state: 'qld', task: MECH, fallRisk: 'yes', crane: 'company', slinging: 'crane', site: MECH_SITE };
  const drawn = questionsFor(draftBody(base)).steps;
  assert.ok(!drawn.chosen.includes('mobileScaffold'));
  const facts = { fallControl: EWP_OR_TOWER };
  assert.ok(questionsFor(draftBody({ ...base, facts })).steps.chosen.includes('mobileScaffold'));
  const body = draftBody({ ...base, facts, kinds: [...drawn.chosen, 'craneInterface'], kindsSeen: drawn.suggested });
  assert.ok(body.kinds.includes('mobileScaffold') && body.kindsKept.includes('mobileScaffold'), JSON.stringify(body.kindsKept));
  const draft = prepareDraft(draftBody(answered({ ...base, facts, kinds: [...drawn.chosen, 'craneInterface'], kindsSeen: drawn.suggested })));
  assert.ok(names(draft).includes('Use mobile scaffolds') && names(draft).includes('Work with the crane crew during lifts'), names(draft).join(' | '));
  // A step the user unticked by hand stays off.
  assert.ok(!draftBody({ ...base, facts, kinds: [...drawn.chosen, 'craneInterface'], kindsSeen: drawn.suggested, kindsOff: ['mobileScaffold'] }).kinds.includes('mobileScaffold'));
});

const SCAFFOLD = 'erect n dismantel tube n coupler scafold up the side of a 3 storey bilding for the renderers, about 12m high, gear comes off our truck with the hiab, workin next to the footpath on st quentin ave, tie ins to the slab edges, handover tag b4 anyone uses it';
const RETYPED = 'erect n dismantel tube n coupler scafold up the front of a 3 storey bilding for the renderers, about 12m high, 4 lifts, base plates on sole boards on the footpath, gantry over the footpath, gear comes off our truck with the hiab, workin next to the footpath on st quentin ave, power lines out the front, tie ins to the slab edges, handover tag b4 anyone uses it, weekly inspections';

test('adding a step keeps the step the Access answer brought, and a step added by hand stays through a retype', () => {
  // A run 4: "Work from ladders", from the Access answer, went when the barriers step was added; the added step went when the
  // task was retyped and Continue pressed.
  const base = { state: 'wa', task: SCAFFOLD, fallRisk: 'yes', crane: 'own' };
  const drawn = questionsFor(draftBody(base)).steps;
  const site = { access: 'ladder' };
  assert.ok(questionsFor(draftBody({ ...base, site })).steps.chosen.includes('ladderUse'));
  const picked = draftBody({ ...base, site, kinds: [...drawn.chosen.filter((id) => id !== 'rendering'), 'footpathClosure'], kindsSeen: drawn.suggested, kindsOff: ['rendering'] });
  assert.ok(picked.kinds.includes('ladderUse') && picked.kinds.includes('footpathClosure'), picked.kinds.join());
  // Retyped: the steps follow the new words again, with the step added by hand and without the one unticked by hand.
  const retyped = draftBody({ ...base, task: RETYPED, site, kindsAdded: ['footpathClosure'], kindsOff: ['rendering'] });
  assert.ok(retyped.kinds.includes('footpathClosure') && !retyped.kinds.includes('rendering') && retyped.kinds.includes('scaffold'), retyped.kinds.join());
  assert.ok(questionsFor(retyped).steps.chosen.includes('footpathClosure'));
  assert.deepEqual(retyped.kindsAdded, ['footpathClosure']);
  // An added step unticked by hand is not brought back.
  assert.ok(!draftBody({ ...base, task: RETYPED, kindsAdded: ['footpathClosure'], kindsOff: ['footpathClosure'] }).kinds.includes('footpathClosure'));
});

test('the page keeps the steps added by hand through a retype, and "Go back" keeps the user\'s own ticks and unticks', async () => {
  const app = page('app.js');
  assert.match(app, /stepPicks = \[\.\.\.new Set\(\[\.\.\.current, id\]\)\];\n\s*stepsOff\.delete\(id\);\n\s*stepsAdded\.add\(id\);/);
  assert.match(app, /kindsAdded: stepsAdded\.size \? \[\.\.\.stepsAdded\] : undefined,/);
  assert.match(app, /if \(stepPicks && stepsAdded\.size\) stepPicks = /);
  // After a draft the step list is drawn again from the answers now, and the draft shown is not marked out of date for it.
  assert.match(app, /if \(data\.kind === 'draft'\) await syncStepList\(data\);\n\s*showGate\(\);/);
  assert.match(app, /async function syncStepList\(draft\) \{\n  if \(!questions/);
  const sent = [];
  const LIBRARY = { groups: [{ trade: 'Scaffolding', kinds: ['scaffold', 'rendering', 'footpathClosure', 'loaderCrane'].map((id) => ({ id, label: id, steps: [id] })) }] };
  const p = loadPage(['app.js'], (method, route, body) => {
    if (route.endsWith('/api/steps')) return { body: LIBRARY };
    if (route.endsWith('/api/draft/questions')) { sent.push(body); return { body: { required: [], weak: [], steps: { suggested: ['scaffold', 'rendering', 'loaderCrane'], chosen: body.kinds || ['scaffold', 'rendering', 'loaderCrane'], locked: [] } } }; }
    return { body: {} };
  });
  await settle();
  p.run(`pickedTask = { task: ${JSON.stringify(SCAFFOLD)}, kinds: ['scaffold', 'rendering', 'loaderCrane'] }; stepPicks = ['scaffold', 'loaderCrane', 'footpathClosure']; stepsOff = new Set(['rendering']); stepsAdded = new Set(['footpathClosure']); questions = { required: [] };`);
  // The task still as picked: its own steps, less the one unticked, with the one added.
  p.document.getElementById('task').value = SCAFFOLD;
  p.document.getElementById('steps-reset').click();
  await settle();
  const last = sent[sent.length - 1];
  assert.deepEqual(last.kinds, ['scaffold', 'loaderCrane', 'footpathClosure']);
  assert.deepEqual(last.kindsOff, ['rendering']);
  assert.deepEqual(last.kindsAdded, ['footpathClosure']);
  // Retyped: the steps follow the words, and the unticked and added steps go with them.
  p.document.getElementById('task').value = RETYPED;
  p.document.getElementById('steps-reset').click();
  await settle();
  const again = sent[sent.length - 1];
  assert.equal(again.kinds, undefined);
  assert.deepEqual(again.kindsOff, ['rendering']);
  assert.deepEqual(again.kindsAdded, ['footpathClosure']);
});

test('the fencing, hoardings and gantries box says what it is, and ticked by hand it prints a step', () => {
  // A run 4: "Erect temporary fencing" showed ticked for the footpath gantry, and only "Erect the gantry" printed.
  const kind = stepLibrary().groups.flatMap((group) => group.kinds).find((item) => item.id === 'siteEstablish');
  assert.equal(kind.label, 'Site fencing, hoardings and gantries (as the task names them)');
  const gantry = prepareDraft(draftBody(answered({ ...ANSWERED, state: 'wa', task: RETYPED, fallRisk: 'yes', crane: 'company', slinging: 'crane' })));
  assert.ok(names(gantry).includes('Erect the gantry'), names(gantry).join(' | '));
  const byHand = prepareDraft(draftBody(answered({ ...ANSWERED, state: 'wa', task: 'Erect tube and coupler scaffold to the 3 storey building.', fallRisk: 'yes', crane: 'none', kinds: ['scaffold', 'siteEstablish'] })));
  assert.ok(names(byHand).includes('Erect temporary fencing'), names(byHand).join(' | '));
});

// ---- 2. The crane in or out ----

const FRP_READING = {
  activities: [
    { activity: 'Erect, strip and remove formwork and propping to suspended slabs', type: 'Site work', package: 'Suspended slabs and stairs', quotes: ['The Subcontractor shall erect and strip all formwork to suspended slabs.'] },
    { activity: 'Place and fix reinforcement and mesh', type: 'Site work', package: 'Suspended slabs and stairs', quotes: ['Place and fix all reinforcement.'] },
    { activity: 'Lift formwork, reinforcement and stair forms by crane', type: 'Site work', package: 'Plant lifting and cranage', quotes: ['The Subcontractor must allow for all associated cranage for the installation of stair forms or other item associated with concrete works.'] },
  ],
  packages: [{ package: 'Suspended slabs and stairs', groups: ['formwork', 'reo'] }],
};

test('No crane is queried where the scope gives the crew the cranage, and with No crane no crane lines print', () => {
  // A run 1: the scope reading had a cranage package, the task line named no crane, No crane brought no query, and "Load ply
  // onto the deck" printed crane loads, crane crews and a licensed dogger.
  const [item] = choice.projectItems(FRP_READING, ['Suspended slabs and stairs']);
  assert.match(item.scopeTask.crane, /allow for all associated cranage/);
  assert.ok(!/\bcrane/i.test(item.task));
  const base = { ...ANSWERED, state: 'nsw', task: item.task, scopeTask: item.scopeTask, kinds: item.kinds, fallRisk: 'yes', crane: 'none' };
  const asked = questionsFor(draftBody(base)).crane;
  assert.equal(asked.words, 'cranage');
  assert.match(asked.warning, /^You answered No crane, but the scope says you supply the cranage: "The Subcontractor must allow/);
  const draft = prepareDraft(draftBody(answered(base)));
  assert.equal(draft.craneConflict.kept, false);
  assert.match(draft.craneConflict.scope, /cranage/);
  assert.match(page('app.js'), /crane\.scope \? `the scope says you supply the cranage/);
  const kept = prepareDraft(draftBody(answered({ ...base, craneNoKept: true })));
  for (const one of [draft, kept]) {
    const crane = lines(one).filter((line) => /\bcrane/i.test(line));
    assert.deepEqual(crane, [], crane.join('\n'));
    assert.ok(lines(one).some((line) => /Formply packs are strapped and lifted flat with a full sheet under the load, joists and bearers are strapped together\./.test(line)));
  }
  assert.equal(kept.craneConflict.kept, true);
  // Without the scope's words, a task that names no crane brings no query, as before.
  assert.equal(questionsFor(draftBody({ ...base, scopeTask: undefined })).crane, undefined);
  // The project page asks the crane question for it too.
  assert.match(page('project-go.js'), /\(item\.scopeTask && item\.scopeTask\.crane\) \|\| ''/);
});

test('"A crane company" named in the site answers brings the crane step and the "Crane operated by" row', () => {
  // A run 3: the crane company lifted the plant, as her Access answer said, and the SWMS had no crane step and no row.
  const site = { ...MECH_SITE, ground: 'Slabs on ground. The crane sets up on the hardstand beside Building 2.', access: 'Through the Ocean St gate. Plant comes by truck to the hardstand and is lifted by the crane company.' };
  const base = { ...ANSWERED, state: 'qld', task: MECH, fallRisk: 'yes', crane: 'company', slinging: 'crane', site };
  assert.ok(questionsFor(draftBody(base)).steps.chosen.includes('craneInterface'));
  const draft = prepareDraft(draftBody(answered(base)));
  assert.ok(names(draft).includes('Work with the crane crew during lifts'), names(draft).join(' | '));
  assert.equal(draft.craneOperator, 'Crane company');
  // The step added by hand brings the row too.
  const byHand = prepareDraft(draftBody(answered({ ...base, site: MECH_SITE, kinds: [...questionsFor(draftBody({ ...base, site: MECH_SITE })).steps.chosen, 'craneInterface'] })));
  assert.equal(byHand.craneOperator, 'Crane company');
  // No crane named anywhere, and no crane step: no row.
  assert.equal(prepareDraft(draftBody(answered({ ...base, site: MECH_SITE }))).craneOperator, '');
});

test('a crane tie named as a place in the work is not a crane the crew uses', () => {
  // B run 6: 'You answered No crane, but the task names "crane"' for "crane tie" in a facade task.
  const task = 'Install the CFC facade panels and trimdeck, and close in around the tower crane tie at level 6 once it is removed.';
  assert.equal(questionsFor(draftBody({ state: 'tas', task, fallRisk: 'yes', crane: 'none' })).crane, undefined);
  assert.ok(questionsFor(draftBody({ state: 'tas', task: 'Lift the facade panels with the crane.', fallRisk: 'yes', crane: 'none' })).crane);
});

// ---- 3. Builder check never suggests a plain "Approved" with a hold point open ----

test('an open hold point makes Builder check suggest "Approved with conditions", naming the step', () => {
  // B run 7: 91, Accepted, 'Builder check suggests "Approved". Work can start under this SWMS', while W16 said "Demolish the
  // structure" was on hold until the demolition plan was issued.
  const task = 'Demolish the two storey brick office building with our 30 t excavator, breaker and pulveriser, and load the trucks.';
  const base = { ...ANSWERED, state: 'act', task, fallRisk: 'no', crane: 'none' };
  const draft = prepareDraft(draftBody(answered(base)));
  const design = (draft.designs || []).find((row) => /demolition/i.test(row.what || ''));
  assert.ok(design, JSON.stringify(draft.designs));
  const held = prepareDraft(draftBody(answered({ ...base, designs: [{ id: design.id, what: design.what, status: 'notIssued' }] })));
  const check = checkSwms(fromDraft(held), { state: 'act' });
  assert.ok(check.holdPoints && check.holdPoints.length, JSON.stringify(check.findings.find((item) => item.rule === 'W16')));
  assert.equal(check.band, 'Accepted');
  assert.equal(check.suggests, 'conditions');
  assert.equal(check.suggestsWhy, '"Demolish the structure" waits for the engineer\'s demolition plan. Approve with the condition that these steps do not start until the design is issued and the SWMS is updated.');
  const issued = checkSwms(fromDraft(draft), { state: 'act' });
  assert.equal(issued.suggests, undefined);
  const review = page('review.js');
  assert.match(review, /const suggestFor = \(data\) => \(data && data\.suggests && LABELS\[data\.suggests\] \? data\.suggests : PICK\[data && data\.band\] \|\| 'changes'\);/);
  assert.ok(!/suggest\(PICK\[/.test(review));
});

// ---- 4. A live services answer that names the service passes ----

test('"None" for live services that goes on to name a live service and where it is passes', () => {
  // B run 7: refused with "there are live services at the work. Name them".
  const rule = { ask: 'Name them and where they are.', name: 'Live services', none: true, kind: 'services', noneRefused: 'The step has a live supply.' };
  assert.equal(gate.answerNeed(rule, 'None. All services disconnected and capped by others before demolition. Overhead power line on the Barry Drive frontage, kept 6 m clear.'), '');
  assert.match(gate.answerNeed(rule, 'None. All services disconnected and capped by others.'), /live supply/);
  assert.match(gate.answerNeed(rule, 'none'), /live supply/);
});

// ---- 5. Typed text prints with its fixes ----

test('a slip in the task is fixed after a retype though the muster point repeats it, and the muster point is fixed too', () => {
  // A run 4: after the retype "bilding" printed in the task, the muster point, the title and the review page.
  const input = { ...ANSWERED, state: 'wa', task: RETYPED, fallRisk: 'yes', crane: 'own', musterPoint: 'front of the bilding on st quentin ave', workplace: '45 St Quentin Ave, Claremont WA', companyAddress: '3/18 sorbonne cres canning vale wa 6155' };
  const asked = questionsFor(draftBody(input));
  assert.ok(asked.spellingFixes.some((fix) => fix.from === 'bilding' && fix.to === 'building'), JSON.stringify(asked.spellingFixes));
  const draft = prepareDraft(draftBody(answered(input)));
  assert.match(draft.task, /3 storey building/);
  assert.equal(draft.musterPoint, 'Front of the building on St Quentin Ave');
  assert.ok(!/bilding/.test(titleFor({}, input)), titleFor({}, input));
  // The company address typed in lower case prints with its capitals; one typed with capitals is left as typed.
  assert.match(draft.companyDetails, /3\/18 Sorbonne Cres Canning Vale WA 6155/);
  const typed = prepareDraft(draftBody(answered({ ...input, companyAddress: '3/18 Sorbonne cres, CANNING VALE' })));
  assert.match(typed.companyDetails, /3\/18 Sorbonne cres, CANNING VALE/);
});

test('"bout", "rcp", "byda" and "telstra" print as they should, and a reviewer\'s changes take their capitals', () => {
  // B run 8: the task kept "bout" and "375 rcp", and live services printed "Byda plans checked, telstra pit".
  const task = '60m of 375 rcp along the carpark, trench bout 1.8m deep with our 8t digger n a trench box, pipes n pits come off the truck with the hiab';
  const draft = prepareDraft(draftBody(answered({ ...ANSWERED, state: 'nt', residential: 'no', task, fallRisk: 'no', crane: 'company', slinging: 'crane', site: { ...ANSWERED.site, liveServices: 'byda plans checked, telstra pit at the boundary, kept clear' } })));
  assert.match(draft.task, /^60m of 375 RCP along the carpark, trench about 1\.8m deep/);
  assert.equal(draft.site.find((row) => row.label === 'Live services').text, 'BYDA plans checked, Telstra pit at the boundary, kept clear');
  // B run 7: "the act demolition licence for molonglo demolition", "theres" and "engineers" kept as typed.
  const said = nameCase.tidyLines('the engineers demolition plan has to be issued n named before any demolition\nlist the ACT demolition licence for molonglo demolition under licences\ntheres no crane or ropes on this job', ['Molonglo Demolition Pty Ltd'], []);
  assert.equal(said, "The engineer's demolition plan has to be issued and named before any demolition\nList the ACT demolition licence for Molonglo Demolition under licences\nThere's no crane or ropes on this job");
  assert.equal(nameCase.hurried('hes in the trench box n they dont have there own crane'), "he's in the trench box and they don't have their own crane");
  const reviews = fs.readFileSync(path.join(__dirname, '..', 'reviews.js'), 'utf8');
  assert.match(reviews, /typedText\.replace\(\/\\b\(the\|in\|an\?\) act\\b/);
  assert.match(reviews, /\[printed\.subcontractor, printed\.principalContractor\]/);
});

// ---- 6. Weak answers and wording ----

test('weak answers are refused with the right reason', () => {
  const rescue = { ask: 'Say who rescues the person and how.', emergency: true, involves: 'a trench', rescue: true, role: true };
  // B run 8: "pull him out" was refused as a person's name.
  assert.match(gate.answerNeed(rescue, 'pull him out'), /does not say who rescues the person or how/);
  assert.match(gate.answerNeed(rescue, 'Kim Nguyen'), /is a person's name/);
  // A run 4: "me" as a muster point was told to name a role.
  assert.match(gate.answerNeed({ ask: 'Say where everyone meets.', kind: 'place' }, 'me'), /^"me" is not a place\./);
  // B run 8: "front gate" passed as the muster point: a note under the box as soon as it is left, not a refusal.
  assert.match(gate.answerNeed({ ask: 'Say where everyone meets.', kind: 'musterEarly' }, 'front gate'), /does not say which street or side the gate is on/);
  assert.equal(gate.answerNeed({ ask: 'Say where everyone meets.', kind: 'musterEarly' }, 'Front gate on Bishop St'), '');
  assert.equal(gate.answerNeed({ ask: 'Say where everyone meets.', kind: 'place' }, 'front gate'), '');
  assert.match(gate.answerNeed({ ask: 'Say where everyone meets.', kind: 'musterEarly' }, 'me'), /^"me" is not a place\./);
  // B run 8: Prepared by with no position: a note under the box only (the box is filled with the account's name), not a refusal.
  assert.equal(gate.answerNeed({ optional: true, kind: 'person' }, 'dylan hart'), '');
  assert.match(gate.answerNeed({ optional: true, kind: 'preparer' }, 'dylan hart'), /gives no position\. Give your name and position, for example "Dylan Hart, supervisor"/);
  assert.equal(gate.answerNeed({ optional: true, kind: 'preparer' }, 'Dylan Hart, foreman'), '');
  assert.equal(gate.answerNeed({ optional: true, kind: 'preparer' }, 'Dylan Hart supervisor'), '');
  assert.match(gate.answerNeed({ optional: true, kind: 'preparer' }, 'tina office'), /place, not a role/);
  // A run 1: Ground "deck loads per engineer" passed.
  assert.match(gate.answerNeed({ ask: 'Say what the ground is like.', kind: 'ground', none: true }, 'deck loads per engineer'), /does not say what the ground or deck takes/);
  assert.equal(gate.answerNeed({ ask: 'Say what the ground is like.', kind: 'ground', none: true }, 'Deck rated 3 kPa per engineer'), '');
  // A run 4: "dave" as site manager is judged as soon as the box is left, as "jake" is.
  assert.match(gate.answerNeed({ optional: true, kind: 'person' }, 'dave'), /gives one name only/);
  assert.match(page('app.js'), /const EARLY_PEOPLE = \{ 'site-manager': \{ optional: true, kind: 'person' \}, 'prepared-by': \{ optional: true, kind: 'preparer' \}, 'muster-point': \{ ask: 'Say where everyone meets in an emergency\.', kind: 'musterEarly' \} \};/);
});

test('Public "None" is refused beside the concrete pump, and the rescue gear must match a first aid kit answer', () => {
  // A run 1: Public "None" beside the pump and the concrete trucks at the gate.
  const task = 'Pump and place concrete to the suspended slab from the concrete pump at the site gate, then finish the concrete.';
  const base = { ...ANSWERED, state: 'nsw', task, fallRisk: 'yes', crane: 'none', site: { ...ANSWERED.site, publicInterface: 'None' } };
  const draft = prepareDraft(draftBody(answered(base)));
  assert.ok(names(draft).some((name) => /concrete pump/i.test(name)), names(draft).join(' | '));
  const gaps = require('../download-gate').gateChecks(draftBody(answered(base)), draft).filter((gap) => gap.id === 'site.publicInterface' && gap.need);
  assert.ok(gaps.length && /mobile plant/.test(gaps[0].need), JSON.stringify(gaps));
  // B run 8: "ladder n first aid kit at the trench box" passed beside a rescue with a harness and line.
  const dg = fs.readFileSync(path.join(__dirname, '..', 'download-gate.js'), 'utf8');
  assert.match(dg, /const NO_GEAR_NEEDED = \/\\b\(\?:rescue kit\|\(\?<!first aid \)kit\)\\b\/i;/);
});

test('Public "None" is refused for awning work, and "None" with how the public is kept away passes', () => {
  // B run 6: Public "none" passed for the external awning soffits, worked from an EWP over the street frontages.
  const { gateChecks } = require('../download-gate');
  const need = (publicInterface) => {
    const input = draftBody(answered({ ...ANSWERED, state: 'tas', task: 'Install the external awning soffits and the CFC facade panels from an EWP.', fallRisk: 'yes', crane: 'none', site: { ...ANSWERED.site, publicInterface } }));
    return (gateChecks(input, prepareDraft(input)).find((gap) => gap.id === 'site.publicInterface') || {}).need || '';
  };
  assert.match(need('none'), /names "external awning", which is usually built over a footpath or street frontage/);
  assert.equal(need('None. The awning is inside the site hoarding, no public access.'), '');
});

test('the crane chart blanks are named plainly, and a design "Not issued yet" is not waited for', () => {
  // A run 4: 'Fill in the blanks: crane chart (tonnes); t (metres) (2 blanks); gear rigging (tonnes).'
  const chart = answersFor('craneChart', 'crane lift')[0].text;
  assert.equal(fill.blankWarning(chart), 'Fill in the blanks: the rated capacity in tonnes; the working radius in metres; the heaviest gross load in tonnes; the radius of the heaviest load in metres.');
  assert.deepEqual(fill.blankLabels(chart), ['rated capacity (tonnes)', 'working radius (metres)', 'heaviest load (tonnes)', 'radius of the heaviest load (metres)']);
  // A run 1: "This part updates once you answer "Formwork design" above" after "Not issued yet" was chosen.
  assert.match(page('app.js'), /&& !notIssued\(item\)\);/);
});

// ---- 7. Plant slang ----

test('"wacker plate" is read as the plate compactor in the fuel reason', () => {
  // B run 8: "digger n wacker plate all fuelled at our yard" passed only reworded.
  const draft = { plant: [{ item: 'Excavator' }, { item: 'Roller or plate compactor' }], jobSteps: [] };
  const fuel = 'Fuels (diesel, petrol)';
  assert.equal(rules.notUsedNeed(fuel, 'digger n wacker plate all fuelled at our yard', 'trench with our 8t digger', '', '', '', draft), '');
  assert.match(rules.notUsedNeed(fuel, 'digger fuelled at our yard', 'trench with our 8t digger', '', '', '', draft), /plate compactor/);
});

// ---- 8. The project page says why a site question is still to give ----

test('the project page gives each site question still to give its reason', () => {
  // A run 1 and B run 6: "Site question: Ground" and "Site question: Live services" were listed with no reason.
  const go = page('project-go.js');
  assert.match(go, /item\.siteWhy = draft\.kind === 'draft' \? Object\.fromEntries\(\(draft\.gate \|\| \[\]\)\.filter\(\(gap\) => gap\.kind === 'site' && gap\.need\)/);
  assert.match(go, /Site question: \$\{esc\(need\.label\)\}<\/button>\$\{siteWhy\(need\.id\) \?/);
  assert.match(go, /const need = siteNeed\(id, tried\) \|\| \(String\(sharedSite\(\)\[id\] \|\| ''\)\.trim\(\) \? siteWhy\(id\) : ''\);/);
});

// ---- 9. The address ----

test('a capital typed one letter out sets the state, and a suggestion naming the suburb typed comes first', async () => {
  // B run 8: "12 bishop st stuart park darwn" gave "12 Bishop Street, Woolner NT" first.
  assert.deepEqual(address.stateFromTyped('12 bishop st stuart park darwn'), { state: 'nt', from: 'place' });
  assert.deepEqual(address.stateFromTyped('65 murray st hobrat'), { state: 'tas', from: 'place' });
  assert.deepEqual(address.stateFromTyped('12 bishop st stuart park'), { state: '', from: '' });
  const before = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  try {
    const p = (main, rest) => ({ placePrediction: { text: { text: `${main}, ${rest}, Australia` }, structuredFormat: { mainText: { text: main }, secondaryText: { text: rest } }, types: ['street_address'] } });
    const fetchImpl = async () => ({ ok: true, json: async () => ({ suggestions: [p('12 Bishop Street', 'Woolner NT'), p('12 Bishop Street', 'Stuart Park NT')] }) });
    const found = await places.suggest('12 bishop st stuart park darwn', { fetchImpl });
    assert.equal(found.suggestions[0].text, '12 Bishop Street, Stuart Park NT');
    // A run 2: the place found for the job address is the one in the suburb typed.
    const asked = [];
    const careFetch = async (url, options) => {
      const body = JSON.parse(options.body);
      asked.push(body);
      const east = { location: { latitude: -37.770, longitude: 144.971 }, formattedAddress: '210 Lygon St, Brunswick East VIC 3057, Australia' };
      if (body.textQuery && body.pageSize === 1) return { ok: true, json: async () => ({ places: [east] }) };
      if (body.textQuery && body.pageSize === 3) return { ok: true, json: async () => ({ places: [east, { location: { latitude: -37.799, longitude: 144.967 }, formattedAddress: '210 Lygon St, Carlton VIC 3053, Australia' }] }) };
      return { ok: true, json: async () => ({ places: [] }) };
    };
    await places.nearbyCare('210 Lygon St, Carlton VIC', { fetchImpl: careFetch, raw: true });
    const near = asked.find((body) => body.locationRestriction);
    assert.ok(near, JSON.stringify(asked));
    assert.equal(near.locationRestriction.circle.center.latitude, -37.799);
  } finally {
    if (before === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = before;
  }
});
