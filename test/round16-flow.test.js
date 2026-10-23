// Messy test round 16 (19 October 2026, staging), flow faults: a ticked step lost on re-preparing after a task edit, a
// Recommended step lost after a changed crane answer, "No crane" not queried for a crane truck, a harness asked where none
// is used, questions that outlive their step, the stale "not saved yet" note after a reload, a plant-added step not in the
// step list, printing, weak answers that pass, and Google's hospital list. The page faults are also run in a browser
// (scratchpad/flow17).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prepareDraft, questionsFor, foundKinds, taskLine } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps } = require('../download-gate');
const gate = require('../public/gate-rules');
const nameCase = require('../sitelink-answers');
const rules = require('../public/substance-rules');
const substances = require('../substances');
const { fileStem } = require('../accounts');
const { answersFor } = require('../presets');
const places = require('../places');
const { ANSWERED, ready } = require('./helpers');
const { loadPage, settle } = require('./fake-dom');

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
const names = (draft) => (draft.jobSteps || []).map((step) => step.step);
const page = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');

// ---- 1. A ticked box prints its step; "Go back to the suggested steps" gives what the words suggest ----

const PICKED_WINDOWS = 'Install aluminium windows, external doors and louvres: move the glass and frames to the levels, install the windows, fit the door hardware, and seal the glazing and flashings.';
const RETYPED_WINDOWS = 'replace the aluminium windows n louvres on levels 2 to 5 of a 6 storey office refurb. old windows come out from inside n new ones go in from inside, open edge while window is out. glass goes up in the builders hoist n we use a vacuum lifter on the floor. seal the glazing n flashings';

test('a box ticked for work the retyped words no longer find still prints the step it names', () => {
  // A run 4: after the task was retyped, "Install windows" stayed ticked but only "Install louvres" printed.
  const picks = questionsFor(draftBody({ state: 'wa', task: PICKED_WINDOWS, fallRisk: 'yes', crane: 'none' })).steps.chosen;
  assert.ok(picks.includes('windowInstall'));
  const base = { ...ANSWERED, state: 'wa', task: RETYPED_WINDOWS, fallRisk: 'yes', crane: 'none' };
  // content17 now reads "replace the ... windows" as window installing on its own; the ticked box must print either way.
  const draft = prepareDraft(draftBody(answered({ ...base, kinds: picks })));
  assert.ok(names(draft).includes('Install windows'), names(draft).join(' / '));
  assert.ok(names(draft).includes('Install louvres'));
  // Unticked, it prints neither.
  const off = prepareDraft(draftBody(answered({ ...base, kinds: picks.filter((id) => id !== 'windowInstall') })));
  assert.ok(!names(off).includes('Install windows') && !names(off).includes('Install louvres'), names(off).join(' / '));
});

test('a box ticked for work the words name prints its step; one the words do not name at all is left as it was', () => {
  // The communications box ticked for a cabling task that names the containment prints it beside the cable pull.
  const ict = prepareDraft(draftBody(answered({ ...ANSWERED, state: 'qld', task: 'Pull the data cables through the new cable tray containment in the ceilings.', fallRisk: 'no', crane: 'none', kinds: ['ictCabling'] })));
  assert.ok(names(ict).includes('Install communications containment'), names(ict).join(' / '));
  // A scope reading's windows box in a ceilings package, whose words name only the window frames it seals, adds no window step (qa-all: it would
  // have printed "Install windows" in a ceilings SWMS).
  const ceilings = prepareDraft(draftBody(answered({ ...ANSWERED, state: 'qld', task: 'Frame the walls and bulkheads in steel stud, install the suspended grid ceilings and fix the plasterboard. Seal and caulk the setting beads to the window and door frames.', fallRisk: 'no', crane: 'none', kinds: ['carpFraming', 'ceilingGrid', 'windowInstall'] })));
  assert.ok(!names(ceilings).includes('Install windows'), names(ceilings).join(' / '));
});

const STEP_LIBRARY = { groups: [{ trade: 'Glazing', kinds: ['windowInstall', 'glassHandle', 'carpEdge', 'roofAccess'].map((id) => ({ id, label: id, steps: [id] })) }] };
test('"Go back to the suggested steps" asks with the words now and the picked steps they still name, as Continue does', async () => {
  const sent = [];
  const p = loadPage(['app.js'], (method, route, body) => {
    if (route.endsWith('/api/steps')) return { body: STEP_LIBRARY };
    if (route.endsWith('/api/draft/questions')) { sent.push(body); return { body: { required: [], weak: [], steps: { suggested: ['roofAccess'], chosen: body.kinds || ['roofAccess', 'windowInstall'], locked: [] } } }; }
    return { body: {} };
  });
  await settle();
  p.run(`pickedTask = { task: ${JSON.stringify(PICKED_WINDOWS)}, kinds: ['windowInstall', 'glassHandle', 'carpEdge'] }; stepPicks = ['windowInstall', 'glassHandle']; stepsOff = new Set(['carpEdge']); questions = { required: [] };`);
  p.document.getElementById('task').value = RETYPED_WINDOWS;
  p.document.getElementById('steps-reset').click();
  await settle();
  const last = sent[sent.length - 1];
  assert.equal(last.kinds, undefined);
  assert.deepEqual(last.priorKinds, ['windowInstall', 'glassHandle', 'carpEdge']);
  assert.equal(last.kindsOff, undefined);
  // The task still as picked starts from the pick list's own steps.
  p.document.getElementById('task').value = PICKED_WINDOWS;
  p.document.getElementById('steps-reset').click();
  await settle();
  assert.deepEqual(sent[sent.length - 1].kinds, ['windowInstall', 'glassHandle', 'carpEdge']);
});

// ---- 2. Steps a changed answer brings are Recommended and kept like any other ----

const CRANE_TRUCK = 'Vehicle loading crane (crane truck) work: set up the outriggers, load and unload materials, and lift the portable building onto its footings. also lift the roof trusses up onto the top plates for the chippies';

test('the hiab step a changed crane answer brings is kept with the user\'s picks, and said to the page', () => {
  // B run 7: after "No crane" was changed to "Our company", the hiab step came in, showed unticked, and an unrelated
  // untick dropped it.
  const base = { state: 'act', task: CRANE_TRUCK, fallRisk: 'no', crane: 'none' };
  const seen = questionsFor(draftBody(base)).steps.suggested;
  assert.ok(!seen.includes('loaderCrane'));
  const picks = seen.filter((id) => id !== 'steelErect');
  const body = draftBody({ ...base, crane: 'own', kinds: picks, kindsOff: ['steelErect'], kindsSeen: seen, answersSeen: { crane: 'none', fallRisk: 'no' } });
  assert.ok(body.kinds.includes('loaderCrane'), body.kinds.join());
  assert.deepEqual(body.kindsKept, ['loaderCrane']);
  assert.deepEqual(body.kindsBrought, ['loaderCrane']);
  const draft = prepareDraft(draftBody(answered({ ...ANSWERED, ...base, crane: 'own', kinds: picks, kindsOff: ['steelErect'], kindsSeen: seen, answersSeen: { crane: 'none', fallRisk: 'no' }, facts: { craneChart: '2.1 t at 8 m radius from the hiab chart', groundBearing: "The builder's site manager confirmed the gravel hardstand; 600 mm outrigger pads." } })));
  assert.ok(names(draft).includes('Unload with the truck loading crane (hiab)'), names(draft).join(' / '));
  // Unticked by hand, it stays off; with no answer changed, nothing is brought.
  assert.ok(!draftBody({ ...base, crane: 'own', kinds: picks, kindsOff: ['steelErect', 'loaderCrane'], kindsSeen: seen, answersSeen: { crane: 'none', fallRisk: 'no' } }).kinds.includes('loaderCrane'));
  assert.equal(draftBody({ ...base, crane: 'own', kinds: picks, kindsSeen: seen, answersSeen: { crane: 'own', fallRisk: 'no' } }).kindsBrought, undefined);
  // With no picks of the user's own, the step is found in the words and said to the page as brought.
  assert.deepEqual(draftBody({ ...base, crane: 'own', answersSeen: { crane: 'none', fallRisk: 'no' } }).kindsBrought, ['loaderCrane']);
});

test('a hiab confirmed in the plant brings its step back, unless it was unticked by hand', () => {
  // B run 7: confirming the hiab in the plant did not bring its step back.
  const base = { ...ANSWERED, state: 'act', task: CRANE_TRUCK, fallRisk: 'no', crane: 'own', kinds: ['steelLift', 'portableBuilding'], plantChoice: { used: ['Vehicle loading crane (hiab)'], added: [] }, facts: { craneChart: '2.1 t at 8 m radius from the hiab chart', groundBearing: "The builder's site manager confirmed the gravel hardstand; 600 mm outrigger pads." } };
  // The plant confirmed is set after the other answers (ready() confirms SiteWrite's own list).
  const confirmed = (input) => prepareDraft(draftBody({ ...answered(input), plantChoice: input.plantChoice }));
  assert.ok(names(confirmed(base)).includes('Unload with the truck loading crane (hiab)'));
  assert.ok(!names(confirmed({ ...base, kindsOff: ['loaderCrane'] })).includes('Unload with the truck loading crane (hiab)'));
  assert.ok(!names(confirmed({ ...base, plantChoice: { used: [], added: [] } })).includes('Unload with the truck loading crane (hiab)'));
});

test('the page asks again when the crane answer changes, and marks the steps it brought Recommended', async () => {
  const sent = [];
  const p = loadPage(['app.js'], (method, route, body) => {
    if (route.endsWith('/api/steps')) return { body: { groups: [{ trade: 'Cranes', kinds: ['steelLift', 'portableBuilding', 'loaderCrane'].map((id) => ({ id, label: id, steps: [id] })) }] } };
    if (route.endsWith('/api/draft/questions')) {
      sent.push(body);
      const own = body.crane === 'own';
      const suggested = own ? ['steelLift', 'portableBuilding', 'loaderCrane'] : ['steelLift', 'portableBuilding'];
      const brought = own && body.answersSeen && body.answersSeen.crane === 'none' ? ['loaderCrane'] : undefined;
      return { body: { required: [], weak: [], steps: { suggested, chosen: body.kinds || suggested, locked: [] }, ...(brought ? { kindsBrought: brought } : {}) } };
    }
    return { body: {} };
  });
  await settle();
  let crane = 'none';
  const realQuery = p.document.querySelector;
  p.document.querySelector = (selector) => (selector === 'input[name="crane"]:checked' ? { value: crane } : realQuery(selector));
  await p.run('loadQuestions({ stay: true })');
  await settle();
  assert.deepEqual(sent[sent.length - 1].answersSeen, undefined);
  p.run('factsForm.classList.remove("hidden")');
  crane = 'own';
  // The change listener on each crane radio asks again, as refreshSteps does (its wiring is checked below).
  await p.run('refreshSteps()');
  await settle();
  const last = sent[sent.length - 1];
  assert.deepEqual(last.answersSeen, { crane: 'none', fallRisk: '' });
  const list = p.document.getElementById('steps-block').innerHTML;
  assert.match(list, /value="loaderCrane" checked><span>loaderCrane<span class="tag">Recommended<\/span>/);
  // The source wires the crane, slinging and fall radios to ask again.
  assert.match(page('app.js'), /input\[name="crane"\], input\[name="slinging"\], input\[name="fallRisk"\]'\)\.forEach\(\(input\) => input\.addEventListener\('change', \(\) => \{\n\s*if \(input\.name === 'crane'\) craneNoKept = false;\n\s*if \(!questions \|\| factsForm\.classList\.contains\('hidden'\)\) return;\n\s*showCraneWarning\(\);\n\s*refreshSteps\(\);/);
});

// ---- 3. "No crane" queried where the task names a crane, crane truck or hiab ----

test('"No crane" for a crane truck task is queried on the questions page and above the draft, and the download waits', () => {
  // B run 7: nothing asked about the clash.
  const base = { ...ANSWERED, state: 'act', task: CRANE_TRUCK, fallRisk: 'no', crane: 'none', kinds: ['loaderCrane', 'portableBuilding'] };
  const asked = questionsFor(draftBody(base));
  assert.match(asked.crane.warning, /You answered No crane, but the task names "vehicle loading crane"/);
  const draft = prepareDraft(draftBody(answered(base)));
  assert.deepEqual(draft.craneConflict, { words: 'vehicle loading crane', kept: false });
  const gaps = downloadGaps(draftBody(answered(base)), draft);
  assert.ok(gaps.some((gap) => gap.id === 'craneCheck' && /press Keep No crane/.test(gap.need)), JSON.stringify(gaps.map((gap) => gap.id)));
  // Kept, it is not asked again and the download does not wait for it.
  const kept = prepareDraft(draftBody(answered({ ...base, craneNoKept: true })));
  assert.equal(kept.craneConflict.kept, true);
  assert.ok(!downloadGaps(draftBody(answered({ ...base, craneNoKept: true })), kept).some((gap) => gap.id === 'craneCheck'));
  assert.equal(questionsFor(draftBody({ ...base, craneNoKept: true })).crane.warning, '');
  // Who operates it answered, or no crane named, or a crane only by others or denied: nothing to check.
  assert.equal(questionsFor(draftBody({ ...base, crane: 'own' })).crane, undefined);
  for (const task of ['Paint the shop front walls and ceilings.', 'Form and pour the crane pad for the builder\'s tower crane.', 'Unload the pallets by hand, no crane.', 'Fix the cladding panels. Crane lifts by others.']) {
    assert.equal(questionsFor(draftBody({ state: 'qld', task, fallRisk: 'no', crane: 'none' })).crane, undefined, task);
  }
});

test('the page shows the crane check with its three answers, and Keep No crane is sent with the work', async () => {
  const p = loadPage(['app.js'], (method, route) => (route.endsWith('/api/steps') ? { body: { groups: [] } } : route.endsWith('/api/draft/questions') ? { body: { required: [], weak: [], steps: { suggested: [], chosen: [], locked: [] }, crane: { words: 'hiab', kept: false, warning: 'You answered No crane, but the task names "hiab".' } } } : { body: {} }));
  await settle();
  p.document.querySelector = ((real) => (selector) => (selector === 'input[name="crane"]:checked' ? { value: 'none' } : real(selector)))(p.document.querySelector);
  await p.run('loadQuestions({ stay: true })');
  const box = p.document.getElementById('crane-warning');
  assert.match(box.innerHTML, /You answered No crane, but the task names &quot;hiab&quot;\.|You answered No crane, but the task names "hiab"\./);
  assert.match(box.innerHTML, /data-crane-set="own"/);
  assert.match(box.innerHTML, /data-crane-keep>Keep No crane: none is used/);
  assert.equal(box.classList.contains('hidden'), false);
  const block = p.run('craneCheckBlock({ kind: "draft", craneConflict: { words: "crane truck", kept: false } })');
  assert.match(block, /id="crane-check"/);
  assert.match(block, /Check your answer on the crane\./);
  p.run('craneNoKept = true');
  assert.equal(JSON.parse(p.run('JSON.stringify(payload())')).craneNoKept, true);
  assert.equal(p.run('craneCheckBlock({ kind: "draft", craneConflict: { words: "crane truck", kept: true } })'), '');
});

// ---- 4. A harness asked only where one is used; a "no harness" answer never prints as a control ----

test('"none" and "we dont use a harness" are taken as no harness, and print as nothing', () => {
  // B run 7: "none" was refused, and "we dont use a harness" printed as a control among the steel step's harness lines.
  const base = { ...ANSWERED, state: 'act', task: CRANE_TRUCK, fallRisk: 'no', crane: 'none', craneNoKept: true };
  for (const typed of ['none', 'na', 'we dont use a harness', "We don't use harnesses on this job."]) {
    const asked = questionsFor(draftBody({ ...base, facts: { harnessSystem: typed } }));
    assert.ok(!asked.weak.some((item) => item.id === 'harnessSystem' && item.why), `${typed}: ${JSON.stringify(asked.weak)}`);
    const draft = prepareDraft(draftBody(answered({ ...base, facts: { harnessSystem: typed } })));
    assert.equal(draft.kind, 'draft', `${typed}: ${JSON.stringify(draft.missing)}`);
    const lines = draft.jobSteps.flatMap((step) => step.controls);
    assert.ok(!lines.some((line) => /\bharness/i.test(line)), `${typed}: ${lines.filter((line) => /harness/i.test(line)).join(' | ')}`);
    assert.ok(!draft.controls.some((item) => /\bharness/i.test(item.text)));
  }
  // What else the answer says still prints.
  const said = prepareDraft(draftBody(answered({ ...base, facts: { harnessSystem: 'No harness is used. Trusses are landed from the ground with tag lines.' } })));
  const lines = said.jobSteps.flatMap((step) => step.controls);
  assert.ok(lines.includes('Trusses are landed from the ground with tag lines.'), lines.filter((line) => /Trusses/.test(line)).join());
  assert.ok(!lines.some((line) => /No harness is used/.test(line)));
});

test('a project\'s shared Access answer naming a boom lift does not ask "Harness and anchors" of the mobile scaffold SWMS', () => {
  // A run 1: the shared Access answer "Workers reach the steel by boom lift and mobile scaffold" asked it for Access equipment.
  const task = 'Mobile scaffolds, A-frames and trestles for access to the steel connections at low level.';
  const site = { ...ANSWERED.site, access: 'Main gate on Tweed Coast Rd, then the site haul road to each building. Workers reach the steel by boom lift and mobile scaffold.' };
  const ask = (siteShared) => questionsFor(draftBody({ ...ANSWERED, state: 'nsw', task, fallRisk: 'yes', crane: 'none', site, siteShared })).required.map((item) => item.id);
  assert.ok(!ask(true).includes('harnessSystem'), ask(true).join());
  // Given for this SWMS itself, it still does.
  assert.ok(ask(undefined).includes('harnessSystem'));
  assert.ok(ask(['liveServices', 'publicInterface', 'otherTrades', 'ground']).includes('harnessSystem'));
});

// ---- 5. A step's questions are held while the draft updates for the change ----

test('a step change holds the draft\'s step questions until the draft is updated, or until an open question is answered', () => {
  const source = page('app.js');
  assert.match(source, /if \(drafted\) draftUpdating\('Updating the draft for your change to the job steps\.'\);/);
  assert.match(source, /const STEP_PANELS = '#substances-panel, #emergency-panel, #plant-panel, \.design-card';/);
  assert.match(source, /if \(note\) panel\.setAttribute\('inert', ''\); else panel\.removeAttribute\('inert'\);/);
  assert.match(source, /draftUpdating\(`This part updates once you answer "\$\{open\[0\]\.label\}" above and press Prepare the statement\.`\);/);
  // The substance types the flashing step brought go with it once the draft is updated (A run 2).
  // content17 prints the flashing step's mortar and silica lines only where the flashing is chased into a wall.
  const task = 'strip old roof sheets n replace with new colourbond on a 2 storey shop, new box gutter n downpipes, rake out the mortar n chase the new flashings into the brick parapet wall.';
  const base = { ...ANSWERED, state: 'vic', task, fallRisk: 'yes', crane: 'none' };
  const kinds = questionsFor(draftBody(base)).steps.chosen;
  const types = (draft) => ((draft.substances && draft.substances.items) || []).map((item) => item.product).join(' | ');
  const withFlashing = prepareDraft(draftBody(answered({ ...base, kinds: [...kinds, 'flashingReplace'] })));
  assert.match(types(withFlashing), /Respirable crystalline silica/);
  const off = ['flashingReplace', 'repointing', 'silicaDrill'];
  const without = prepareDraft(draftBody(answered({ ...base, kinds: kinds.filter((id) => !off.includes(id)), kindsOff: off })));
  // Silica came only from the unticked steps; the task's own word "mortar" still asks for cement.
  assert.doesNotMatch(types(without), /Respirable crystalline silica/);
});

// ---- 6. The "not saved yet" note stays gone after a reload once the work is downloaded ----

test('work downloaded comes back after a reload without the "not saved yet" note, until it is changed', async () => {
  // A runs 1 and 3: after the zip download, a reload showed "Your work is back as you left it (not saved yet ...)".
  const p = loadPage(['app.js'], () => ({ body: {} }));
  await settle();
  p.document.getElementById('task').value = 'Erect the steel portal frames.';
  p.document.getElementById('workplace').value = '38 Tweed Coast Rd, Cabarita Beach NSW';
  p.run('window.SiteWrite.unsavedDownloaded()');
  const kept = JSON.parse(p.window.localStorage.getItem('sitewrite.unsaved'));
  assert.equal(kept.downloaded, JSON.stringify(kept.input));
  // Kept again unchanged, it stays marked; changed, the mark goes.
  p.run('keepUnsaved()');
  assert.ok(JSON.parse(p.window.localStorage.getItem('sitewrite.unsaved')).downloaded);
  p.document.getElementById('task').value = 'Erect the steel portal frames and purlins.';
  p.run('keepUnsaved()');
  assert.equal(JSON.parse(p.window.localStorage.getItem('sitewrite.unsaved')).downloaded, undefined);
  // On a reload, work kept as downloaded brings no note.
  p.run('window.SiteWrite.unsavedDownloaded()');
  const stored = { 'sitewrite.unsaved': p.window.localStorage.getItem('sitewrite.unsaved') };
  const again = loadPage(['app.js'], () => ({ body: {} }), { stored });
  await settle();
  let noted = false;
  const start = again.document.getElementById('start');
  start.before = () => { noted = true; };
  again.document.getElementById('job-details').before = () => { noted = true; };
  await again.run('restoreUnsaved()');
  assert.equal(noted, false);
  // The account and project downloads mark it.
  assert.match(page('account.js'), /if \(S\.unsavedDownloaded\) S\.unsavedDownloaded\(\); else if \(S\.unsavedNoteOff\) S\.unsavedNoteOff\(\);/);
  assert.match(page('scope.js'), /if \(S\.unsavedDownloaded\) S\.unsavedDownloaded\(\); else if \(S\.unsavedNoteOff\) S\.unsavedNoteOff\(\);/);
});

// ---- 7. A step the plant brings is in the step list, where it can be unticked ----

test('a step the plant brings shows ticked in the step list, named as the plant\'s, and unticking it takes it off', () => {
  // A run 4: an added hammer drill brought "Drill or cut concrete, masonry or stone", which was not under Job steps to untick.
  const base = { ...ANSWERED, state: 'wa', task: 'Install the timber skirting and architraves in the offices.', fallRisk: 'no', crane: 'none', plantChoice: { used: [], added: [{ item: 'hammer drill', licence: 'no' }] } };
  const steps = questionsFor(draftBody(base)).steps;
  assert.ok(steps.chosen.includes('silicaDrill'), steps.chosen.join());
  assert.deepEqual(steps.plant, ['silicaDrill']);
  const confirmed = (input) => prepareDraft(draftBody({ ...answered(input), plantChoice: input.plantChoice }));
  assert.ok(names(confirmed(base)).includes('Drill or cut concrete, masonry or stone'), names(confirmed(base)).join(' / '));
  const off = { ...base, kindsOff: ['silicaDrill'] };
  assert.ok(!questionsFor(draftBody(off)).steps.chosen.includes('silicaDrill'));
  assert.ok(!names(confirmed(off)).includes('Drill or cut concrete, masonry or stone'));
  // The page names it and asks the step list again once the plant has added a step.
  const source = page('app.js');
  assert.match(source, /Added by the plant you confirmed\. Untick it if your crew does not do that work\./);
  assert.match(source, /if \(plantAddedSteps\.length\) await loadQuestions\(\{ stay: true, keepDraft: true \}\)/);
});

// ---- 8. Printing ----

test('places, people and roads print with the right capitals', () => {
  const place = (text) => nameCase.tidyPlace(nameCase.typedWords(text));
  // A run 4, A run 1, B runs 6 and 8.
  assert.equal(place('front of building on st georges tce n the corner'), 'Front of building on St Georges Tce and the corner');
  assert.equal(place('Main gate on Tweed Coast Rd, then the site haul road to each building.'), 'Main gate on Tweed Coast Rd, then the site haul road to each building.');
  assert.equal(place('traffic stays in the open lane'), 'Traffic stays in the open lane');
  assert.equal(place('the Bagot Rd service lane'), 'The Bagot Rd service lane');
  assert.equal(place('corner elizabeth n bathurst st'), 'Corner Elizabeth and Bathurst St');
  // Those already right stay so.
  assert.equal(place('corner of pakenham st n high st, by the bus stop'), 'Corner of Pakenham St and High St, by the bus stop');
  assert.equal(place('meet at henry st gate'), 'Meet at Henry St gate');
  assert.equal(place('st kilda rd gate'), 'St Kilda Rd gate');
  assert.equal(nameCase.tidyPersonRole('tony russo our leading hand'), 'Tony Russo, our leading hand');
  assert.equal(nameCase.tidyPersonRole('jason pike owner'), 'Jason Pike, Owner');
});

test('typed lines print tidied: products, the plant licence, the approval line, the task and the file name', () => {
  // A run 4 and B run 8: SDS lines as typed, and capitals after a semicolon.
  const line = rules.stepLine({ type: 'Sealants and caulking', product: 'neutral cure glazing silicone', controls: ['wear gloves n safety glasses', 'wear p2 mask'], sdsDate: '2025-01-01' });
  assert.match(line, /: wear gloves and safety glasses; wear P2 mask; see its safety data sheet\.$/);
  const fuel = rules.stepLine({ type: 'Fuels', product: 'Diesel', controls: ['avoid breathing fumes; work upwind; Cool burns with water', 'wear nitrile gloves; Spill kit at the refuelling point'], sdsDate: '2025-01-01' });
  assert.match(fuel, /avoid breathing fumes; work upwind; cool burns with water; wear nitrile gloves; spill kit at the refuelling point; see its safety data sheet\.$/);
  assert.equal(rules.stepLine({ product: 'diesel', controls: ['wear gloves'], sdsDate: '2025-01-01' }), 'Diesel: wear gloves; see its safety data sheet.');
  const rows = substances.tableRows({ substances: { products: [{ product: 'neutral cure glazing silicone', type: 'Sealants and caulking', hazards: [], controls: ['wear p2 mask', 'wear gloves n safety glasses'], firstAid: [], storage: [], sdsDate: '2025-01-01' }] } });
  assert.match(rows[0][0], /^Neutral cure glazing silicone/);
  assert.equal(rows[0][2], 'Wear P2 mask\nWear gloves and safety glasses');
  // The draft page's approval line, the plant licence, the task and the file name (A run 2, B run 5).
  const painting = answered({ ...ANSWERED, company: 'geelong roof n gutter', state: 'vic', task: 'Paint the shop front, including but not limited to the following: walls and doors.', fallRisk: 'no', crane: 'none' });
  const draft = prepareDraft(draftBody({ ...painting, plantChoice: { ...painting.plantChoice, added: [{ item: 'gin wheel n rope', licence: 'no' }] } }));
  assert.equal(draft.status, 'Approval by Geelong Roof n Gutter: not signed yet.');
  assert.equal(draft.plant.find((item) => item.item === 'gin wheel n rope').licence, 'No');
  assert.equal(taskLine('Painting works including but not limited to the following items: walls, ceilings'), 'Painting works including the following items: walls, ceilings');
  assert.equal(fileStem('Strip old roof sheets and replace with new colorbond on a 2 storey shop in Geelong'), 'Strip old roof sheets and replace with new colorbond');
  assert.equal(fileStem('Replace the aluminium windows and louvres on levels 2 to 5'), 'Replace the aluminium windows and louvres on levels 2 to 5');
});

test('a harness blank filled with the word before it prints the word once, and an own step\'s name prints as a title', async () => {
  // A run 2: "clipped to anchors ridge anchors".
  const template = answersFor('harnessSystem')[0].text;
  const filled = template.replace('____', '2').replace('____', 'ridge anchors').replace('____', 'Height Safety Co').replace('____', '6').replace('____', 'Leanne Choi');
  const draft = prepareDraft(draftBody(answered({ ...ANSWERED, state: 'vic', task: 'Replace the roof sheets on a 2 storey shop.', fallRisk: 'yes', crane: 'none', ppe: ['hardHat', 'boots', 'harness'], facts: { harnessSystem: filled, fallControl: 'Workers wear a full body harness in travel restraint, clipped to the ridge anchors.' } })));
  const lines = draft.jobSteps.flatMap((step) => step.controls);
  assert.ok(lines.some((one) => /clipped to ridge anchors installed and rated by Height Safety Co/.test(one)), lines.filter((one) => /clipped/.test(one)).join(' | '));
  assert.ok(!lines.some((one) => /anchors ridge anchors/.test(one)));
  // A run 4: "take out the old windows n put in the new frames".
  const p = loadPage(['app.js'], () => ({ body: {} }));
  await settle();
  assert.equal(p.run('stepTitle("take out the old windows n put in the new frames")'), 'Take out the old windows and put in the new frames');
});

// ---- 9. Weak answers ----

test('answers that name no one, "me" for a role, and "None" or "na" where the work plainly needs an answer are refused', () => {
  // A run 2: "the scaffold mob", "a training mob", "the anchor installer".
  assert.match(gate.fieldWeak('person', 'the scaffold mob'), /does not name a person/);
  assert.equal(gate.fieldWeak('person', 'Pat Doyle, Doyle Scaffolding'), '');
  const templates = answersFor('harnessSystem').map((item) => item.text);
  const fill = (installer, trainer) => templates[0].replace('____', '2').replace('____', 'on the ridge').replace('____', installer).replace('____', '6').replace('____', trainer);
  assert.match(gate.presetFillNeed(templates, fill('the anchor installer', 'Leanne Choi')), /"the anchor installer" does not say who/);
  assert.match(gate.presetFillNeed(templates, fill('Height Safety Co', 'a training mob')), /"a training mob" does not say who/);
  assert.equal(gate.presetFillNeed(templates, fill('Height Safety Co', 'Leanne Choi, our HSE advisor')), '');
  // B run 7: "me, e stop on the remote".
  const stop = { ask: 'Say where the stop is and which role stops it.', emergency: true, involves: 'plant', role: true, stop: true };
  assert.match(gate.answerNeed(stop, 'me, e stop on the remote'), /says "me": on a big site the person changes/);
  assert.equal(gate.answerNeed(stop, 'The operator at the emergency stop on the remote; the spotter calls all stop.'), '');
  // A run 4 and A run 2: "None" for Public interface over a street, "na" for Ground under a boom lift and for Other trades.
  const input = answered({ ...ANSWERED, state: 'wa', task: RETYPED_WINDOWS, fallRisk: 'yes', crane: 'none', site: { ...ANSWERED.site, publicInterface: 'none', otherTrades: 'na' }, ownSteps: [{ name: 'Take out the old windows', hazards: ['Frames fall onto the street below.'], controls: ['The footpath on St Georges Tce below is barricaded while frames come out.'] }] });
  const draft = prepareDraft(draftBody(input));
  const gaps = downloadGaps(draftBody(input), draft);
  const publicGap = gaps.find((gap) => gap.id === 'site.publicInterface');
  assert.ok(publicGap, JSON.stringify(gaps.map((gap) => gap.id)));
  assert.match(publicGap.need, /names "(?:footpath|street)", so the public or traffic is near the work/);
  assert.match(gaps.find((gap) => gap.id === 'site.otherTrades').need, /"na" says the question does not apply/);
  const ewp = answered({ ...ANSWERED, state: 'vic', task: 'Replace the roof sheets on a 2 storey shop. We use a cherry picker in the back lane.', fallRisk: 'yes', crane: 'none', kinds: ['roof', 'roofStrip', 'ewp'], site: { ...ANSWERED.site, ground: 'na', otherTrades: 'None', publicInterface: 'Back lane traffic is stopped by our spotter while the cherry picker works.' } });
  const ewpGaps = downloadGaps(draftBody(ewp), prepareDraft(draftBody(ewp)));
  assert.match((ewpGaps.find((gap) => gap.id === 'site.ground') || {}).need || '', /sets plant up on the ground/);
  assert.ok(!ewpGaps.some((gap) => gap.id === 'site.otherTrades'));
  // A site's own haul road is not a public way.
  const haul = answered({ ...ANSWERED, state: 'nsw', task: 'Erect the steel portal frames from boom lifts.', fallRisk: 'yes', crane: 'none', site: { ...ANSWERED.site, access: 'Main gate, then the site haul road to each building.' } });
  assert.ok(!downloadGaps(draftBody(haul), prepareDraft(draftBody(haul))).some((gap) => gap.id === 'site.publicInterface'));
});

// ---- 10. Google's hospital list ----

const answer = (data) => ({ ok: true, status: 200, json: async () => data });
function careFetch(centre, list) {
  return async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.pageSize === 1) return answer({ places: [{ location: centre.at, formattedAddress: centre.address }] });
    const clinic = (body.includedPrimaryTypes && !body.includedPrimaryTypes.includes('hospital')) || /medical centre/.test(body.textQuery || '');
    if (clinic) return answer({ places: [] });
    return answer({ places: list.map(([name, lat, lng, address], i) => ({ id: `p${i}`, displayName: { text: name }, formattedAddress: `${address}, Australia`, location: { latitude: lat, longitude: lng }, primaryType: 'hospital' })) });
  };
}

test('a private hospital named with a curly apostrophe is known as private, and one with an emergency department says both', async () => {
  // B run 5: St Andrew's, with its emergency department listed, showed no private note.
  process.env.GOOGLE_PLACES_API_KEY = 'test-only';
  try {
    const sa = await places.nearbyCare('45 Port Road, Hindmarsh SA 5007', { fetchImpl: careFetch({ at: { latitude: -34.907, longitude: 138.57 }, address: '45 Port Road, Hindmarsh SA 5007, Australia' }, [
      ['Royal Adelaide Hospital', -34.9205, 138.5870, 'Port Rd, Adelaide SA 5000'],
      ['St Andrew’s Hospital', -34.9300, 138.6100, '350 South Tce, Adelaide SA 5000'],
      ['St Andrew’s Hospital Emergency Centre', -34.9301, 138.6101, '350 South Tce, Adelaide SA 5000'],
    ]) });
    const standrews = sa.hospitals.find((item) => /St Andrew/.test(item.name));
    assert.equal(standrews.private, true, JSON.stringify(sa.hospitals));
    assert.match(standrews.name, /^St Andrew's Hospital/);
  } finally {
    delete process.env.GOOGLE_PLACES_API_KEY;
  }
  assert.match(page('app.js'), /place\.emergencyListed && place\.private \? '<br><span class="meta">Private hospital, emergency department listed: it may charge for emergency care<\/span>'/);
});
