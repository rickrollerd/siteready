// Work the user writes the steps for (owner decision D211, 11 October 2026): jacking and skating heavy
// plant, winching loads, chain blocks and lifting beams, floating plant on or off floats, low loaders
// or barges, earthworks in waterways and creek crossings, bypass pumping and flow control, trenchless
// crossings other than directional drilling, and slipform paving. "Provide a warning that the specific
// steps will need to be inputted by the user (we need to gather this data for our own learning)." The
// work reads as work, is named above the draft in the user's words (D184) even where its words found
// another kind's steps, and where it is all the task's work it drafts rather than stands down, with
// the user's own step needed before download. Library steps that do cover it are kept. Heavy items
// named as installed by their weight, with no step that places them, are named too.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const { prepareDraft, questionsFor, notCoveredRefusal, notCoveredUnwritten } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps } = require('../download-gate');
const { setupAccounts, lastLinkToken, ANSWERED, ready } = require('./helpers');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

const BASE = { state: 'qld', fallRisk: 'no', residential: 'no', date: '11 October 2026' };
// The required questions answered with the first answer offered, as a user taking it would.
function answered(input) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 6; round += 1) {
    const asked = questionsFor(draftBody({ ...input, facts }));
    const open = (asked.required || []).filter((item) => !facts[item.id]);
    if (asked.standDown || !open.length) break;
    for (const item of open) facts[item.id] = item.choices ? item.choices[0].value : `As set out in the site plan for ${item.label.toLowerCase()}.`;
  }
  return facts;
}
const draft = (task, extra = {}) => prepareDraft(draftBody({ ...BASE, task, ...extra, facts: answered({ ...BASE, task, ...extra }) }));
const names = (d) => d.jobSteps.map((step) => step.step);
// Skating without jacking is named as not covered (D220); jacking and skating takes the jack and skid step (D219).
const TRANSFORMER = 'Skate the transformer into the plant room';
const MINE = { part: TRANSFORMER, name: 'Skate the transformer', hazards: ['The transformer tips off the skates and crushes a worker.'], controls: ['The transformer is lifted onto the skates only at its marked lifting points and packed with timber cribbing.', 'No one puts a hand or foot under the transformer while it is on the skates.'], who: 'Rigger' };

test('jacking, skating and winching read as work: the task drafts with the work named above it, not stood down', () => {
  for (const task of [TRANSFORMER, 'Winch the switchboard into the substation', 'Jack up the generator to remove its transport frame']) {
    const q = questionsFor(draftBody({ ...BASE, task }));
    assert.equal(q.standDown, undefined, task);
    const d = draft(task);
    assert.equal(d.kind, 'draft', task);
    assert.deepEqual(names(d), ['Before starting', 'Finish and clean up'], 'no step made up from the words');
    assert.deepEqual(d.notCovered, [task]);
    assert.deepEqual(d.notCoveredMain, [task], 'it is all the task\'s work');
  }
  // Other work with no job steps is still stood down as before.
  assert.equal(draft('Install the transformer').kind, 'stand-down');
});

test('each D211 kind of work is named, even where its words found another kind\'s steps', () => {
  const cases = [
    ['Install the chain blocks and lifting beams', 'Install the chain blocks and lifting beams'],
    ['Float the excavator onto the barge', 'Float the excavator onto the barge'],
    ['Load the dozer onto the low loader and float it to the next site', 'Load the dozer onto the low loader'],
    ['Earthworks in or next to waterways and creek crossings', 'Earthworks in or next to waterways and creek crossings'],
    ['Build the temporary causeway across the creek', 'Build the temporary causeway across the creek'],
    ['Bypass pumping of the sewer main', 'Bypass pumping of the sewer main'],
    ['Thrust bore under the rail line for the conduit', 'Thrust bore under the rail line for the conduit'],
    ['Pipe jacking under the highway', 'Pipe jacking under the highway'],
    ['Slipform paving of the concrete road pavement', 'Slipform paving of the concrete road pavement'],
  ];
  for (const [task, part] of cases) {
    const d = draft(task);
    assert.equal(d.kind, 'draft', task);
    assert.ok(d.notCovered.includes(part), `${task}: ${JSON.stringify(d.notCovered)}`);
  }
});

test('within a task with other work, the part is named and the tick still covers it', () => {
  const d = draft('Install the cable tray, then skate the transformer');
  assert.ok(names(d).includes('Install cable tray and containment'));
  assert.deepEqual(d.notCovered, ['skate the transformer']);
  assert.deepEqual(d.notCoveredMain, undefined, 'the cable tray is the work SiteReady has steps for');
  assert.match(notCoveredRefusal(d, {}), /say which SWMS covers it/);
  assert.equal(notCoveredRefusal(d, { notCoveredConfirmed: ['skate the transformer'] }), '');
  // Plant moved into position on skates: the plant steps stay, and the skating is named.
  const plant = draft('Receive air handling units lifted by the tower crane to the roof, then move them into position on skates and pallet jacks and set them on their plinths.');
  assert.ok(names(plant).includes('Receive plant and move it into position'));
  assert.deepEqual(plant.notCovered, ['move them into position on skates and pallet jacks']);
});

test('moving plant with a forklift, crane or pallet jack is the plant moving step\'s work, and installing plant is covered', () => {
  for (const task of ['Move the chillers into position with a forklift', 'Install the chillers', 'Install the mechanical plant on the roof', 'Receive the air handling units and move them into the plant room with pallet jacks', 'Lift the chillers onto the roof with the crane and set them on their plinths']) {
    const d = draft(task, { crane: 'company' });
    assert.equal(d.kind, 'draft', task);
    assert.deepEqual(d.notCovered, [], task);
  }
});

test('library steps that do cover the work are kept, and nothing is named', () => {
  const kept = [
    ['Jack the bridge deck and replace the elastomeric bearings at pier 2', 'Jack the deck and replace the bearings'],
    ['Directional drilling under the road for the water main', 'Bore under the road or ground with a directional drill'],
    ['Climb the tower crane', 'Erect or dismantle the tower crane'],
    ['Erect the luffing tower crane, then climb it as the core rises', 'Erect or dismantle the tower crane'],
    ['Install, climb and dismantle the jumpform on the lift core', 'Climb the jumpform'],
    ['Pull the consumer mains through the riser with a cable winch', 'Pull cables and handle cable drums'],
    ['Replace the lift motor in the machine room with the lifting beam and chain block', 'Replace the lift motor in the machine room'],
    ['Move the bridge span into place with self-propelled modular transporters and jacks', 'Move the load with the transporters'],
    ['Jack and skid the transformer into the substation on the skidding system', 'Jack and skid the load into place'],
  ];
  for (const [task, step] of kept) {
    const d = draft(task, { crane: 'company' });
    assert.equal(d.kind, 'draft', task);
    assert.ok(names(d).includes(step), `${task}: ${names(d).join(' / ')}`);
    assert.deepEqual(d.notCovered, [], task);
  }
});

test('the same words used another way are not the work: tools, valves, finishes and places', () => {
  for (const task of [
    'Break out the slab with a jack hammer',
    'Drive the wharf piles from a jack-up barge with a crawler crane',
    'Erect the scaffold on base jacks and sole boards',
    'Power float and trowel the slab',
    'Install the flow control valves on the chilled water pipework',
    'Unload pallets with the forklift and move them to the lift lobby with a pallet jack',
    'Build the concrete skate park bowls',
    'Excavate the trench with a 5 tonne excavator and lay the stormwater pipes',
  ]) {
    const d = draft(task, { crane: 'company' });
    if (d.kind !== 'draft') continue;
    assert.ok(!d.notCovered.some((part) => /jack|skat|float|flow|tonne/i.test(part)), `${task}: ${JSON.stringify(d.notCovered)}`);
  }
});

test('work by others is not named', () => {
  assert.deepEqual(draft('Install the cable tray. Transformer jacked and skated into the plant room by others.').notCovered, []);
  assert.deepEqual(draft('Install the cable tray. Jacking and skating of the transformer by the rigger.').notCovered, []);
});

test('a heavy item installed with no step that places it is named, not dropped', () => {
  assert.deepEqual(draft('Install the cable tray and the 2 tonne transformer').notCovered, ['install the 2 tonne transformer']);
  assert.deepEqual(draft('Install the cable tray and install the 2 tonne transformer').notCovered, ['install the 2 tonne transformer']);
  // A crane or forklift step places it; a step for the item covers it; light items are not named.
  assert.deepEqual(draft('Install the cable tray and lift the 2 tonne transformer onto its plinth with the crane', { crane: 'company' }).notCovered, []);
  assert.deepEqual(draft('Install the ductwork and the 3 tonne chiller').notCovered, []);
  assert.deepEqual(draft('Install the cable tray and the 20 kg junction boxes').notCovered, []);
});

test('work that is all the task\'s work needs the user\'s own step: the tick does not cover it', () => {
  const d = draft(TRANSFORMER);
  assert.deepEqual(notCoveredUnwritten(d), [TRANSFORMER]);
  const refused = notCoveredRefusal(d, { notCoveredConfirmed: [TRANSFORMER] });
  assert.equal(refused, `SiteReady has no job steps for: ${TRANSFORMER}. This is the work of the task, so write your own step for it ("Write a step for this" above the draft) before saving or downloading.`);
  const gaps = downloadGaps(draftBody({ ...BASE, task: TRANSFORMER, notCoveredConfirmed: [TRANSFORMER] }), d);
  assert.deepEqual(gaps.filter((gap) => gap.kind === 'cover').map((gap) => gap.label), ['Your own step for work SiteReady has no job steps for']);
  const written = draft(TRANSFORMER, { ownSteps: [MINE] });
  assert.deepEqual(notCoveredUnwritten(written), []);
  assert.equal(notCoveredRefusal(written, {}), '');
  assert.deepEqual(names(written), ['Before starting', 'Skate the transformer (Our own step)', 'Finish and clean up']);
});

// ---- Jacking and skating a heavy load: the engineered jack and skid step, checked by the user (D219) ----

const JACK_SKID_NOTE = "SiteReady's jack and skid steps are for engineered heavy moves. Check each line fits your task, and change or add lines where it does not.";

test('a heavy load jacked and skated takes the jack and skid step, with a note to check it, and nothing is named', () => {
  for (const task of ['Jack and skate the transformer into the plant room', 'Install the cable tray, then jack and skate the transformer', 'Jacking and skating the switchboards into the substation', 'Jack the generator onto skates and skate it into the plant room', 'Jack and skid the bridge span onto the piers on the skidding system']) {
    const d = draft(task);
    assert.equal(d.kind, 'draft', task);
    const step = d.jobSteps.find((item) => item.step === 'Jack and skid the load into place');
    assert.ok(step, `${task}: ${names(d).join(' / ')}`);
    assert.ok(step.controls.includes('Skid tracks are set level on supports designed for the load, the load is jacked only at its designed jacking points, and it is packed as it is raised or lowered so it cannot drop.'));
    assert.deepEqual(d.notCovered, [], task);
    assert.equal(d.notCoveredMain, undefined, task);
    assert.ok(d.warnings.includes(JACK_SKID_NOTE), task);
    assert.equal(notCoveredRefusal(d, {}), '', 'the note needs no tick');
  }
});

test('where the jack and skid step does not fit, the work is named as before and no note is shown', () => {
  const cases = [
    // Plant moved on skates, with no jacking (D220), and pallet jacks are not jacking.
    ['Receive air handling units lifted by the tower crane, then move them into position on skates and pallet jacks', 'move them into position on skates and pallet jacks'],
    ['Skate the generator into the plant room', 'Skate the generator into the plant room'],
    // Jacked but not moved, and skated with chain blocks.
    ['Jack up the switchboard to remove its transport frame', 'Jack up the switchboard to remove its transport frame'],
    ['Rig and skate the new chiller across the plant room floor with chain blocks and skates', 'Rig and skate the new chiller across the plant room floor with chain blocks and skates'],
  ];
  for (const [task, part] of cases) {
    const d = draft(task, { crane: 'company' });
    assert.ok(!names(d).includes('Jack and skid the load into place'), task);
    assert.ok(d.notCovered.includes(part), `${task}: ${JSON.stringify(d.notCovered)}`);
    assert.ok(!d.warnings.includes(JACK_SKID_NOTE), task);
  }
  // A house jacked on its stumps keeps its own step; a skid steer is not skidding.
  assert.ok(names(draft('Jack and raise the house and replace the stumps')).includes('Jack and raise the house'));
  assert.ok(!names(draft('Load the skid steer onto the trailer and jack up the trailer ramps')).includes('Jack and skid the load into place'));
  // Taken off by the user, the step and its note go.
  const off = draft('Install the cable tray, then jack and skate the transformer', { kinds: ['containment'] });
  assert.ok(!names(off).includes('Jack and skid the load into place'));
  assert.ok(!off.warnings.includes(JACK_SKID_NOTE));
});

// ---- The routes ----

let server;
let base;
test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

function call(method, route, { body, token } = {}) {
  return fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}
function abn(tail) {
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  for (let head = 10; head <= 99; head += 1) {
    const digits = `${head}${tail}`;
    if ([...digits].reduce((sum, d, i) => sum + (Number(d) - (i === 0 ? 1 : 0)) * weights[i], 0) % 89 === 0) return digits;
  }
  return abn(String(Number(tail) + 1).padStart(9, '0'));
}
async function signIn(email, tail) {
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  await call('PUT', '/api/company', { token, body: { name: 'Rigging Co Pty Ltd', abn: abn(tail) } });
  return token;
}

test('the Word download waits for the user\'s step, then prints it', async () => {
  const token = await signIn('rigger@ownstepwork.example', '523456789');
  const body = ready({ ...BASE, task: TRANSFORMER, ...ANSWERED, reviewConfirmed: true, reviewedBy: 'Sam Lee' });
  const preview = await (await call('POST', '/api/draft', { body })).json();
  assert.deepEqual(preview.notCoveredMain, [TRANSFORMER]);
  const refused = await call('POST', '/api/draft.docx', { token, body: { ...body, notCoveredConfirmed: [TRANSFORMER] } });
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).message, /write your own step for it/);
  const word = await call('POST', '/api/draft.docx', { token, body: { ...body, ownSteps: [MINE] } });
  assert.equal(word.status, 200);
  assert.match(word.headers.get('content-type'), /wordprocessingml/);
});

// ---- The page ----

const DRAFT = {
  kind: 'draft', state: 'Queensland', task: TRANSFORMER, highRisk: [], controls: [], site: [], ppe: [], references: [], sources: { legislation: [], codes: [] },
  jobSteps: [{ step: 'Before starting', hazards: ['Unplanned work.'], controls: ['A pre-start meeting is held.'], responsible: 'Supervisor' }],
  notCovered: [TRANSFORMER], notCoveredMain: [TRANSFORMER], controlLegal: [[]],
};
function respond(method, route) {
  if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
  if (route === '/api/me') return { body: { user: { email: 'a@b.example', name: 'Sam' }, company: { name: 'Co', abn: '1', hasAccess: true, planStatus: 'active' } } };
  if (route === '/api/sites') return { body: { sites: [] } };
  if (route === '/api/steps') return { body: { groups: [] } };
  if (route === '/api/draft') return { body: DRAFT };
  if (route === '/api/draft/questions') return { body: { required: [], steps: { chosen: [] } } };
  return { body: {} };
}

test('the page offers "Write a step for this" with no choice of another SWMS, and lists the step as still needed', async () => {
  const p = loadPage(['app.js', 'account.js', 'scope.js'], respond, { stored: { 'siteready.session': 'token' } });
  await settle();
  p.document.getElementById('task').value = TRANSFORMER;
  p.document.getElementById('facts').dispatchEvent(new FakeEvent('submit'));
  await settle();
  const result = p.document.getElementById('result').innerHTML;
  assert.match(result, /SiteReady has no job steps for: Skate the transformer into the plant room\. Add your own step and controls for it\./);
  assert.match(result, /is the work of this task, so the SWMS needs your own step for it before you save or download\. Another SWMS does not cover it\./);
  assert.match(result, /data-own-write="0">Write a step for this</);
  assert.doesNotMatch(result, /data-cover-where|data-cover-name/, 'no choice of another SWMS');
  assert.match(p.document.getElementById('result-gate').innerHTML, /data-cover-jump>Your own step for work SiteReady has no job steps for</);
});
