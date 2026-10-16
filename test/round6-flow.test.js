// Messy test round 6 (15 and 16 October 2026), flow faults: work a ticked step already covers is not
// listed as having no job steps, and the user can say which step covers it; their own steps go where
// their work is done; pasted scope lines never name the SWMS by a number; SiteWrite's own words are never
// "fixed"; site answers never run into one control; a box drawn again keeps the whole text; unticked plant
// stays unticked; changing the job steps keeps the draft; own steps can be rated again; replacing the task
// keeps the fall and crane answers; and the smaller fixes. (The finished scope reading kept through a
// reload is tested with the reading's other page tests, in read-progress.test.js.)
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { prepareDraft, questionsFor, taskLine, stepCoveringPart, notCoveredLeft, notCoveredRefusal } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps } = require('../download-gate');
const { fixSpelling } = require('../spelling');
const { titleFor } = require('../accounts');
const { draftToPdf } = require('../pdf-draft');
const { loadPage, settle, FakeEvent, checkAll, selfCheck } = require('./fake-dom');
const { setupAccounts, lastLinkToken, ANSWERED, ready, checked } = require('./helpers');

const draftOf = (input) => prepareDraft(draftBody({ fallRisk: 'no', residential: 'no', crane: 'none', ...ANSWERED, ...input }));
const names = (draft) => draft.jobSteps.map((step) => step.step);

// ---- 2. Work a ticked step already covers ----

test('work a ticked step\'s own lines already cover is not listed as having no job steps', () => {
  // Run 1: canopies lifted and fixed to the slab, beside a step whose line says hoods are "supported until fixed to structure".
  assert.deepEqual(draftOf({ state: 'nsw', task: 'instal stainles steel benches, combi ovens, fryers and exhaust canopys in the comercial kitchen, lift canopys up to ceiling and fix to slab above' }).notCovered, []);
  // Run 2: heat welded joins beside "Weld vinyl seams with the hot air gun".
  assert.deepEqual(draftOf({ state: 'vic', task: '1. Installation of Vinyl to Buildings 2B, 2A & Building 1. Allowing for heat weld to all joins and coving 100mm to ALL walls as specified in tender documentation.' }).notCovered, []);
  // Run 3: sleepers lifted in by machine and the fill compacted, in "Build the retaining wall".
  const wall = draftOf({ state: 'qld', kinds: ['retainingWall', 'wallDrainage', 'smallPlant', 'carpLoad'], task: 'Segmental block and concrete sleeper retaining walls: build the concrete sleeper wall. lift sleepers in with the excavator and chains, compact with a plate compactor' });
  assert.ok(names(wall).includes('Build the retaining wall'));
  assert.deepEqual(wall.notCovered, []);
  // Run 4, rows a scope reading matched to no job steps: frame fixing is in "Stand the door frames".
  const doors = draftOf({ state: 'wa', task: 'Supply and install door frames, doors and hardware.', unmatched: ['Fix frames with Dyna-bolts and masonry bolts', 'Protect adjacent and finished surfaces and replace damaged materials'] });
  assert.deepEqual(doors.notCovered, ['Protect adjacent and finished surfaces and replace damaged materials']);
  assert.equal(stepCoveringPart('Fix frames with Dyna-bolts and masonry bolts', doors.jobSteps), 'Stand the door frames');
});

test('the match stays tight: what the work is done with or where is not what it is done to', () => {
  const steps = draftOf({ state: 'qld', task: 'Install the generator and hang the artwork from the scissor lift.' });
  assert.deepEqual(steps.notCovered, ['hang the artwork from the scissor lift']);
  const wall = draftOf({ state: 'qld', task: 'Build the concrete sleeper retaining wall. cut sleepers with a quick cut saw' });
  assert.equal(stepCoveringPart('cut sleepers with a quick cut saw', wall.jobSteps), '');
  // A part of several pieces is named by the pieces no step covers.
  const sleepers = draftOf({ state: 'qld', task: 'Build the concrete sleeper retaining wall. lift sleepers in with the excavator and chains, cut sleepers with quick cut saw, flush the stormwater pits' });
  assert.ok(!sleepers.notCovered.some((part) => /lift sleepers/.test(part)), sleepers.notCovered.join('; '));
});

test('"A step in this SWMS covers it" deals with the work while that step is in the SWMS', () => {
  const base = { state: 'wa', task: 'Supply and install door frames, doors and hardware.', unmatched: ['Protect adjacent and finished surfaces and replace damaged materials'] };
  const part = 'Protect adjacent and finished surfaces and replace damaged materials';
  const before = draftOf(base);
  assert.deepEqual(notCoveredLeft(before), [part]);
  assert.match(notCoveredRefusal(before, {}), /say which step in this SWMS covers it/);
  const named = draftOf({ ...base, notCoveredInStep: { [part]: 'Hang the doors' } });
  assert.deepEqual(named.notCoveredInStep, [{ part, step: 'Hang the doors' }]);
  assert.deepEqual(notCoveredLeft(named), []);
  assert.equal(notCoveredRefusal(named, {}), '');
  // A step that is not in this SWMS, or work that is all the task's work (D211), is not covered by naming it.
  assert.deepEqual(notCoveredLeft(draftOf({ ...base, notCoveredInStep: { [part]: 'Erect the scaffold' } })), [part]);
  const skate = draftOf({ state: 'qld', task: 'Skate the transformer into the plant room', notCoveredInStep: { 'Skate the transformer into the plant room': 'Before starting' } });
  assert.deepEqual(notCoveredLeft(skate), ['Skate the transformer into the plant room']);
});

test('the page offers the steps of this SWMS by number, and shows the work covered by the step named', () => {
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  const part = 'Protect adjacent and finished surfaces and replace damaged materials';
  const data = draftOf({ state: 'wa', task: 'Supply and install door frames, doors and hardware.', unmatched: [part] });
  const block = p.run(`notCoveredBlock(${JSON.stringify(data)})`);
  assert.match(block, /<label for="cover-step-0">A step in this SWMS covers it<\/label><select id="cover-step-0" data-cover-step="0" class="plain"><option value="">Choose the step that covers it<\/option><option value="Use power tools">Step 2: Use power tools<\/option>/);
  assert.doesNotMatch(block, /Step 1: Before starting|Finish and clean up<\/option>/);
  assert.match(block, /SiteWrite has no job steps for: Protect adjacent and finished surfaces and replace damaged materials\. Write your own step for it, say which step in this SWMS covers it, or say which SWMS covers it\./);
  const covered = draftOf({ state: 'wa', task: 'Supply and install door frames, doors and hardware.', unmatched: [part], notCoveredInStep: { [part]: 'Hang the doors' } });
  p.run(`coverInStep = ${JSON.stringify({ [part]: 'Hang the doors' })}`);
  const done = p.run(`notCoveredBlock(${JSON.stringify(covered)})`);
  assert.match(done, /Each piece of work SiteWrite has no job steps for is dealt with\./);
  assert.match(done, /Covered by step 4: Hang the doors\.<\/span> <button type="button" class="link" data-cover-step-undo="0">Not covered by that step<\/button>/);
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(payload().notCoveredInStep)')), { [part]: 'Hang the doors' });
});

test('the user\'s own steps go where their work is done, not always last', () => {
  const own = (name, part = '') => ({ name, part, hazards: ['Hand injury from the tools used'], controls: ['Use the tool with its guard fitted and wear gloves'], who: 'Supervisor' });
  const doors = draftOf({ state: 'wa', task: 'Supply and install door frames, doors and hardware. Fit locks and closers.', ownSteps: [own('Fix frames with Dyna-bolts and masonry bolts'), own('Seal bottoms of doors before hanging'), own('Cut out doors for locks with the router'), own('Protect finished surfaces')] });
  assert.deepEqual(names(doors), ['Before starting', 'Use power tools', 'Stand the door frames', 'Fix frames with Dyna-bolts and masonry bolts (Our own step)', 'Seal bottoms of doors before hanging (Our own step)', 'Hang the doors', 'Fit locks, closers and other hardware', 'Cut out doors for locks with the router (Our own step)', 'Protect finished surfaces (Our own step)', 'Finish and clean up']);
  const vinyl = draftOf({ state: 'vic', task: 'Lay vinyl and carpet tiles, skim the subfloor.', ownSteps: [own('heat weld vinyl joins and cove up walls')] });
  assert.equal(names(vinyl)[names(vinyl).indexOf('Lay floor coverings') + 1], 'heat weld vinyl joins and cove up walls (Our own step)');
  // Moved by the user, it stays where they put it.
  const moved = draftOf({ state: 'vic', task: 'Lay vinyl and carpet tiles, skim the subfloor.', ownSteps: [own('heat weld vinyl joins and cove up walls')], stepOrder: ['Before starting', 'heat weld vinyl joins and cove up walls (Our own step)', 'Apply primers and levelling compounds', 'Lay floor coverings', 'Finish and clean up'] });
  assert.equal(names(moved)[1], 'heat weld vinyl joins and cove up walls (Our own step)');
});

// ---- 3. Pasted numbered scope lines ----

const PASTED = '1. Installation of Vinyl to Buildings 2B, 2A & Building 1. Allowing for heat weld to all joins and coving 100mm to ALL walls as specified in tender documentation.\n3. Supply and Install the specified commercial carpet tile to Building 2B as specified on the tender documentation, this is to be installed using the direct stick method.\n4. Preparation to skim subfloor 1mm to sheet Vinyl areas.';

test('pasted scope lines print without clause numbers or pointers to the tender papers, and never name the SWMS by a number', () => {
  assert.equal(taskLine(PASTED), 'Installation of Vinyl to Buildings 2B, 2A & Building 1. Allowing for heat weld to all joins and coving 100mm to ALL walls. Supply and Install the specified commercial carpet tile to Building 2B, this is to be installed using the direct stick method. Preparation to skim subfloor 1mm to sheet Vinyl areas.');
  assert.equal(taskLine('1.2 Supply and install frames. 3.4 Hang doors'), 'Supply and install frames. Hang doors.');
  // Numbers that are part of the work stay.
  assert.equal(taskLine('1.8m high concrete sleeper wall'), '1.8m high concrete sleeper wall');
  assert.equal(taskLine('Install 2 x 1.5 t units'), 'Install 2 x 1.5 t units');
  const draft = draftOf({ state: 'vic', task: PASTED });
  assert.match(draft.task, /^Installation of Vinyl to Buildings 2B/);
  assert.doesNotMatch(draft.task, /(?:^|\. )\d\.|tender documentation/);
  assert.equal(titleFor({}, { task: PASTED }), 'Installation of Vinyl to Buildings 2B, 2A & Building 1');
  assert.equal(titleFor({}, { task: '1.' }), 'Untitled SWMS');
});

// ---- 7. The spelling fixer and SiteWrite's own words ----

test('every pick list task and library step name goes through the spelling fixer unchanged', () => {
  const picks = require('../pick-lists.json');
  const { ACTIVITIES } = require('../activities');
  const texts = [
    ...picks.trades.flatMap((trade) => [trade.name, ...trade.tasks.flatMap((task) => [task.title, task.task])]),
    ...ACTIVITIES.flatMap((activity) => (activity.steps || []).map((step) => step.step)),
  ];
  assert.ok(texts.length > 1000);
  const changed = texts.map((text) => [text, fixSpelling(text).fixes]).filter(([, fixes]) => fixes.length);
  assert.deepEqual(changed, []);
  // Run 6: "electrofusion" stays, and a real typo beside it is still fixed.
  assert.deepEqual(fixSpelling('butt and electrofusion weld the pipe, dig the trentch').fixes, [{ from: 'trentch', to: 'trench' }]);
  const water = draftOf({ state: 'tas', task: 'Water mains: excavate the trench, lay PE and PVC mains, butt and electrofusion weld the pipe, and pressure test the main.' });
  assert.match(water.task, /electrofusion/);
  assert.equal(titleFor({}, { task: 'Water mains: butt and electrofusion weld the pipe.' }), 'Water mains: butt and electrofusion weld the pipe');
});

// ---- 8. Site answers print where they belong, whole ----

test('site answers print whole in the site table, as typed, and never run into a control', () => {
  const site = { liveServices: 'old main is live till cut over, telstra pit near the hwy', publicInterface: 'Bass Hwy, one lane closed under our traffic management plan run by our ticketed traffic controllers, footpath on the other side', otherTrades: 'nil', ground: 'clay and some rock, spoil kept 1m back from the edge', access: 'ute and the excavater from the road shoulder, ladder in the shield' };
  const trench = 'Trenches 1.5 m deep or more are shored with a trench shield rated for 2.4 m, as designed by the supplier\'s engineer.';
  const input = { state: 'tas', fallRisk: 'yes', task: 'Water mains: excavate the trench, lay PE and PVC mains, and pressure test the main. our job is 300 DICL on the bass hwy with rubber ring joints, no welding, trentch 1.8m', site, facts: { trenchSupport: trench, fallControl: 'barrier mesh fence round the open trench', pressureTesting: 'Tested with water to 1200 kPa, with the area barricaded and signed during the test.', hotWorkPermit: 'No hot work on this job.' } };
  const draft = prepareDraft(draftBody(ready({ ...ANSWERED, crane: 'none', residential: 'no', ...input })));
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  const controls = draft.controls.map((item) => item.text);
  assert.ok(controls.includes(trench), controls.join('\n'));
  for (const answer of Object.values(site)) assert.ok(!controls.some((line) => line.includes(answer.slice(0, 25))), `"${answer}" is not in a control`);
  assert.ok(!controls.some((line) => /highway/.test(line)));
  const printed = Object.fromEntries(draft.site.map((field) => [field.id, field.text]));
  assert.equal(printed.liveServices, site.liveServices);
  assert.equal(printed.access, site.access);
});

// ---- 9. A box drawn again keeps the whole text ----

test('a box drawn again while typed in takes the whole text and the focus, and its answer is saved from it', () => {
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  const fresh = p.document.getElementById('site-access');
  fresh.tagName = 'TEXTAREA';
  fresh.value = 'ute and the excavater from the road shoulde';
  let focused = false;
  let saved = '';
  fresh.focus = () => { focused = true; };
  p.document.addEventListener('input', (event) => { if (event.target === fresh) saved = fresh.value; });
  // The box the person was typing in, taken off the page as the questions were drawn again.
  p.run(`typingIn = { el: { id: 'site-access', tagName: 'TEXTAREA', isConnected: false, value: 'ute and the excavater from the road shoulder, ladder in the shield' }, id: 'site-access', value: '', start: 66, end: 66 }; keepTyping();`);
  assert.equal(fresh.value, 'ute and the excavater from the road shoulder, ladder in the shield');
  assert.equal(saved, fresh.value, 'the answer is saved whole');
  assert.ok(focused, 'the typing goes on in the new box');
});

// ---- 10. Plant ping-pong ----

test('unticking plant never brings its alternative back ticked, and the plant can be confirmed with neither', () => {
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  p.run(`plantChoice = { used: ['Excavator'], notUsed: ['Concrete placing boom'], added: [] }`);
  assert.equal(p.run(`plantTicked({ item: 'Concrete line pump' })`), false, 'listed since the confirm: offered unticked');
  assert.equal(p.run(`plantTicked({ item: 'Excavator' })`), true);
  const next = JSON.parse(p.run(`JSON.stringify(confirmedPlant({ 'Excavator': true, 'Concrete line pump': false }, []))`));
  assert.deepEqual(next, { used: ['Excavator'], notUsed: ['Concrete line pump', 'Concrete placing boom'], added: [] });
  // The server takes that as confirmed: nothing else is asked.
  const base = { ...ANSWERED, state: 'tas', fallRisk: 'no', residential: 'no', crane: 'none', task: 'Water mains: excavate the trench, lay PE and PVC mains, form and pour the concrete thrust blocks in the trench, and pressure test the main.', facts: { trenchSupport: 'Trench shield rated for 2.4 m, as designed by the supplier\'s engineer.', pressureTesting: 'Tested with water to 1200 kPa behind barricades.' } };
  const listed = prepareDraft(draftBody(base)).plantInferred.map((item) => item.item);
  assert.ok(listed.includes('Concrete placing boom'));
  const others = listed.filter((item) => !/boom|pump/i.test(item));
  const gap = (notUsed) => { const input = draftBody({ ...base, plantChoice: { used: others, notUsed, added: [] } }); return (downloadGaps(input, prepareDraft(input)).find((item) => item.kind === 'plant') || {}).need || ''; };
  assert.match(gap(['Concrete placing boom']), /SiteWrite now also lists Concrete line pump/);
  assert.equal(gap(['Concrete placing boom', 'Concrete line pump']), '');
});

// ---- 11. Changing the job steps keeps the draft ----

test('changing the job steps keeps the draft and the review being fixed, and updates it in place', async () => {
  const fence = ready({ ...ANSWERED, state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no' });
  const p = loadPage(['gate-rules.js', 'app.js'], (method, route) => (route === '/api/draft/questions' ? { body: questionsFor(draftBody(fence)) } : route === '/api/draft' ? { body: prepareDraft(draftBody(fence)) } : route === '/api/steps' ? { body: { groups: [] } } : { body: {} }));
  p.run(`questions = { required: [] }; shownDraft = { kind: 'draft', jobSteps: [] }; resultEl.classList.remove('hidden'); stepPicks = ['formwork'];
    window.SiteWrite.showActions = () => {};
    window.SiteWrite.editing = { id: 's1', review: { text: '1. Add the auger step', label: 'Not approved', name: 'Mara', company: 'NT Build', date: '15 October 2026', response: 'changes' } };`);
  await p.run('refreshSteps()');
  await settle();
  assert.equal(p.document.getElementById('facts-error').textContent, '');
  assert.equal(p.run(`resultEl.classList.contains('hidden')`), false, 'the draft stays on the page');
  const routes = p.calls.map((call) => call.route);
  assert.ok(routes.indexOf('/api/draft') > routes.indexOf('/api/draft/questions'), 'and is prepared again in place');
  assert.match(p.document.getElementById('result').innerHTML, /Fixing for the principal contractor's review/);
});

// ---- 12. Own steps can be rated again ----

test('a step of the user\'s own has "Change the rating", and its rating prints as theirs', () => {
  const own = { name: 'Sweep and wash the internal site roads', part: '', hazards: ['Struck by a vehicle on the site road'], controls: ['Work only inside the barricaded zone with a spotter watching for vehicles'], who: 'Supervisor' };
  const draft = draftOf({ state: 'act', task: 'Builders clean of the apartments.', ownSteps: [own] });
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  const html = p.run(`render(${JSON.stringify(draft)}, { movable: true })`);
  const row = html.slice(html.indexOf('data-own-row="Sweep and wash the internal site roads"'));
  assert.match(row.slice(0, row.indexOf('</tr>')), /data-rate-open="\d+">Change the rating</);
  const rated = draftOf({ state: 'act', task: 'Builders clean of the apartments.', ownSteps: [own], stepRatings: { 'Sweep and wash the internal site roads (Our own step)': { likelihood: 1, consequence: 3 } } });
  assert.equal(rated.jobSteps.find((step) => step.own).risk.after.label, 'Rare x Moderate, our rating');
});

// ---- 13. Replacing the task keeps the fall and crane answers ----

test('replacing the task names the fall and crane answers kept', () => {
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  p.run(`replaceTask(true, { fall: 'yes', crane: 'none' })`);
  assert.equal(p.document.getElementById('task-replaced').textContent, 'Task replaced. Kept: your fall answer (Yes), your crane answer. Dropped: the task you wrote. Press Continue to see this task\'s job steps and questions.');
});

// ---- 5. Part ticks for a part that now prints differently come off at once ----

test('a tick kept for a part this draft prints differently comes off as the draft is shown, before the check answers', () => {
  const p = loadPage(['gate-rules.js', 'app.js', 'check-parts.js', 'human-check.js'], () => new Promise(() => {}));
  const parts = p.window.SiteWriteCheckParts;
  const before = parts.partHashes({ jobSteps: [{ step: 'A' }, { step: 'B' }] });
  const after = parts.partHashes({ jobSteps: [{ step: 'A' }] });
  p.window.localStorage.setItem('sitewrite.check', JSON.stringify({ 'draft::fence': { ticks: { ...before }, ack: true, at: 1 } }));
  p.window.SiteWrite.call = () => new Promise(() => {});
  p.window.SiteWrite.humanCheck.bind('new', { key: 'draft::fence', parts: after, body: () => ({}) });
  const kept = JSON.parse(p.window.localStorage.getItem('sitewrite.check'))['draft::fence'].ticks;
  assert.equal(kept.steps, undefined, 'the job steps tick is off');
  assert.equal(kept.plant, before.plant, 'the others stay');
});

// ---- 14. The smaller fixes ----

test('"none" for the products used is said under its box, with why', () => {
  const asked = (value) => (questionsFor(draftBody({ state: 'wa', fallRisk: 'no', residential: 'no', crane: 'none', task: 'Seal the door bottoms with sealant and prime them.', facts: { safetyDataSheet: value } })).weak || []).find((item) => item.id === 'safetyDataSheet');
  assert.equal(asked('none').why, '"none" does not answer this question.');
  assert.match(asked('none').help, /^Name the product and say where its safety data sheet is kept\./);
  assert.equal(asked('TBC').why, '"TBC" is not an answer yet.');
});

test('a control line said word for word inside another prints once', () => {
  const fall = 'Every landing opening has a lockable full-height screen or barricade until the landing door is fitted and locked. Work in the shaft is from the engineered shaft platform with toe boards and guardrails, installed and inspected before each shift.';
  const draft = prepareDraft(draftBody(ready({ ...ANSWERED, state: 'sa', fallRisk: 'yes', residential: 'no', crane: 'none', task: 'Install the lift rails and car in the shaft, working from the shaft platform with a harness.', facts: { fallControl: fall, harnessSystem: 'Work in the shaft is from the engineered shaft platform with toe boards and guardrails, installed and inspected before each shift. Full body harness to the rated anchor on the lifting beam, inspected every 6 months.' } })));
  const lines = draft.controls.map((item) => item.text);
  assert.equal(lines.filter((line) => line.includes('Work in the shaft is from the engineered shaft platform')).length, 1, lines.join('\n'));
  assert.ok(lines.includes(fall));
});

test('the lifting gear\'s licence column says plainly what is needed', () => {
  const pick = require('../pick-lists.json').trades.flatMap((trade) => trade.tasks).find((task) => task.title === 'Installing rails, landing doors, car and counterweight');
  const facts = { fallControl: 'Every landing opening has a lockable full-height screen until the landing door is fitted and locked. Work in the shaft is from the engineered shaft platform with guardrails.', harnessSystem: 'Full body harness to the rated anchor on the lifting beam, inspected every 6 months.' };
  const draft = prepareDraft(draftBody(ready({ ...ANSWERED, state: 'sa', fallRisk: 'yes', residential: 'no', crane: 'none', kinds: pick.kinds, facts, task: `${pick.task} Rails and the car frame are lifted in the shaft with a chain block on the lifting beam; our crew slings the loads.` })));
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  const rows = draft.plant.filter((row) => /^Lifting (?:gear|beam)/.test(row.item));
  assert.ok(rows.length);
  for (const row of rows) assert.equal(row.licence, 'None for the gear itself. Slinging loads with it needs a dogging or rigging licence.');
});

// The PDF's pages as a reader sees them (pdftotext), one string each.
function pdfPages(buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r6-pdf-'));
  const file = path.join(dir, 'swms.pdf');
  fs.writeFileSync(file, buffer);
  try { return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' }).split('\f').filter((page) => page.trim()); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('the review blocks at the end of the PDF are each kept on one page', async () => {
  const base = ready({ ...ANSWERED, state: 'qld', fallRisk: 'no', residential: 'no', task: 'Replace a 3m length of timber fence.' });
  const confirmation = { kind: 'parts', name: 'Sam Lee', role: 'Supervisor', date: '16 October 2026', parts: { steps: true, hazards: true, plant: true, emergency: true, site: true } };
  const split = [];
  // Site answers of growing length move the blocks down the page, so each falls on a page break in turn.
  for (let n = 0; n < 60; n += 1) {
    const draft = prepareDraft(draftBody({ ...base, site: { ...base.site, access: `Through the main site gate. ${'The crew walks in along the marked path. '.repeat(n)}` } }));
    const pages = pdfPages(await draftToPdf(draft, { confirmation }));
    for (const [label, last] of [['Prepared by', 'Date given to the principal contractor'], ['Checked by', 'Date'], ['Principal contractor review', 'Signature']]) {
      const heading = new RegExp(`\\n\\s*${label}\\s*\\n`);
      const page = pages.find((text) => heading.test(`\n${text}`));
      assert.ok(page, `${label} prints (length ${n})`);
      if (!`\n${page}`.slice(`\n${page}`.search(heading)).includes(last)) split.push(`${label} at length ${n}`);
    }
  }
  assert.deepEqual(split, []);
});

test('a control line that only points to another step is refused, and a short real control is accepted', () => {
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  const problem = (controls) => JSON.parse(p.run(`JSON.stringify(ownStepProblem(${JSON.stringify({ name: 'Prime the door bottoms', hazards: ['Primer fumes in the room'], controls })}, [], ''))`));
  assert.deepEqual(problem(['as per step 2']), ['own-controls', '"as per step 2" points to another step. Write the control itself on this line, for example "Wear nitrile gloves while priming". Each step prints on its own.']);
  assert.deepEqual(problem(['Same as step 3 controls']), ['own-controls', '"Same as step 3 controls" points to another step. Write the control itself on this line, for example "Wear nitrile gloves while priming". Each step prints on its own.']);
  assert.equal(problem(['nitrile gloves']), null);
  assert.equal(problem(['Brush on primer with the doors open', 'dust extraction']), null);
  assert.match(problem(['be careful'])[1], /"be careful" is too short to act on\./);
});

// ---- 6. A host's error on a download ----

test('a download is asked again once after a host\'s error, and saving it twice finds the first save', async (t) => {
  await setupAccounts();
  const { app } = require('../server');
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, route, { token, body } = {}) => fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  await call('POST', '/api/auth/email', { body: { email: 'retry@round6.example' } });
  const token = (await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken('retry@round6.example') } })).json()).token;
  assert.equal((await call('PUT', '/api/company', { token, body: { name: 'Retry Co', abn: '53004085616' } })).status, 200);
  const fence = ready({ state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no', ...ANSWERED });
  const body = checked({ ...fence, reviewConfirmed: true, reviewedBy: 'Sam Lee', requestKey: 'press-one-abc' });
  const first = await call('POST', '/api/draft.docx', { token, body });
  assert.equal(first.status, 200);
  const again = await call('POST', '/api/draft.docx', { token, body });
  assert.equal(again.status, 200);
  assert.equal(again.headers.get('x-sitewrite-swms'), first.headers.get('x-sitewrite-swms'));
  assert.equal(again.headers.get('x-sitewrite-revision'), '1');
  assert.equal((await (await call('GET', '/api/swms', { token })).json()).swms.length, 1, 'saved once');
  // A new press, with its own key, saves a new SWMS as before.
  await call('POST', '/api/draft.docx', { token, body: { ...body, requestKey: 'press-two-def' } });
  assert.equal((await (await call('GET', '/api/swms', { token })).json()).swms.length, 2);
});

test('the page asks for a download once more after a 502, and says plainly when it still fails', async () => {
  let tries = 0;
  const p = loadPage(['gate-rules.js', 'app.js', 'account.js'], (method, route) => {
    if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
    if (route === '/api/me') return { body: { user: { email: 'a@b.example', name: 'Sam' }, company: { name: 'Co', abn: '1', hasAccess: true, planStatus: 'active' } } };
    if (route.startsWith('/api/swms/s1/docx')) { tries += 1; return tries === 1 ? { status: 502, body: '<html>Bad Gateway</html>', headers: { 'content-type': 'text/html' } } : { headers: { 'content-type': 'application/octet-stream' } }; }
    if (route.startsWith('/api/swms/s2/docx')) return { status: 502, body: '<html>Bad Gateway</html>', headers: { 'content-type': 'text/html' } };
    return { body: {} };
  }, { stored: { 'sitewrite.session': 'token' } });
  await settle();
  await p.window.SiteWrite.download('/api/swms/s1/docx', 'SWMS.docx');
  assert.equal(tries, 2, 'asked again once');
  await assert.rejects(p.window.SiteWrite.download('/api/swms/s2/docx', 'SWMS.docx'), /SiteWrite could not reach the server, so the file was not downloaded\. Your SWMS and your ticks are kept\. Press the button again\./);
});

test('"Update the draft" says under the button that it is updating, trying again, or that it could not', async () => {
  const p = loadPage(['gate-rules.js', 'app.js'], (method, route) => (route === '/api/draft' ? { status: 502, body: '<html>Bad Gateway</html>', headers: { 'content-type': 'text/html' } } : { body: {} }));
  const said = [];
  const button = p.document.getElementById('emergency-update');
  button.tagName = 'BUTTON';
  button.isConnected = true;
  button.insertAdjacentHTML = (_where, html) => said.push(html);
  button.closest = () => null;
  p.run(`resultEl.contains = (el) => el && el.id === 'emergency-update'; lastPressed = { button: document.getElementById('emergency-update'), at: Date.now() };`);
  await p.run('prepareDraft({ scroll: false })');
  assert.match(said[0], /Updating the draft\./);
  assert.ok(said.some((html) => /The server did not answer straight away\. Trying again\./.test(html)));
  assert.match(said[said.length - 1], /role="alert" data-draft-note>SiteWrite could not reach the server, so the draft was not updated\. Your answers and the draft are kept as they were\. <button type="button" class="link" data-retry-prepare>Try again<\/button>/);
});

// ---- 4. A SWMS prepared again while it is checked is no longer marked as needing preparing again ----

test('a project SWMS prepared again as it is checked loses its "Needs preparing again" mark', async () => {
  const project = { current: 0, stage: 'check', from: null, shared: { crane: '', site: null, designs: {}, emergency: {} }, items: [
    { title: 'Doors and frames', task: 'Install the door frames.', body: { task: 'Install the door frames.' }, kind: 'draft', status: 'ready', stale: 'A site answer every SWMS shares changed.' },
  ] };
  const p = loadPage(['gate-rules.js', 'app.js', 'scope-task.js', 'scope-hrcw.js', 'scope-choice.js', 'scope-conflicts.js', 'scope.js'], () => ({ body: {} }), { stored: { 'sitewrite.project': JSON.stringify(project) } });
  await settle();
  p.window.SiteWrite.onDraft({ kind: 'draft', jobSteps: [], gate: [] }, { task: 'Install the door frames.' });
  const kept = JSON.parse(p.window.localStorage.getItem('sitewrite.project'));
  assert.equal(kept.items[0].stale, undefined);
  assert.equal(kept.items[0].kind, 'draft');
});

test('the server starts no more workers than its memory holds, unless WEB_CONCURRENCY says how many', () => {
  const { workerCount } = require('../server');
  const os = require('node:os');
  const was = process.env.WEB_CONCURRENCY;
  try {
    delete process.env.WEB_CONCURRENCY;
    const memory = Math.min(Number(process.constrainedMemory && process.constrainedMemory()) || Infinity, os.totalmem());
    assert.ok(workerCount() >= 1);
    assert.ok(workerCount() <= Math.max(1, Math.floor(memory / (512 * 1024 * 1024))));
    assert.ok(workerCount() <= os.availableParallelism());
    process.env.WEB_CONCURRENCY = '3';
    assert.equal(workerCount(), 3);
  } finally {
    if (was === undefined) delete process.env.WEB_CONCURRENCY; else process.env.WEB_CONCURRENCY = was;
  }
});

test('the download check says the same of the user\'s own lines as the page does', () => {
  const own = (controls) => ({ name: 'Prime the door bottoms', part: '', hazards: ['Primer fumes in the room'], controls, who: 'Supervisor' });
  const gaps = (controls) => { const input = draftBody(ready({ ...ANSWERED, state: 'wa', fallRisk: 'no', residential: 'no', crane: 'none', task: 'Supply and install door frames, doors and hardware.', ownSteps: [own(controls)] })); return downloadGaps(input, prepareDraft(input)).filter((gap) => gap.kind === 'own').map((gap) => gap.need); };
  assert.deepEqual(gaps(['nitrile gloves']), []);
  assert.deepEqual(gaps(['as per step 2']), ['"as per step 2" points to another step. Write the control itself on this line, for example "Wear nitrile gloves while priming". Each step prints on its own. Change your step to say what is done and how.']);
  assert.deepEqual(gaps(['be careful']), ['"be careful" is too short to act on. Change your step to say what is done and how.']);
});
