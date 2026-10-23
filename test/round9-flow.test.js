// Messy test round 9 (17 October 2026), flow faults: work done inside a project SWMS kept when its task is
// reworded there, and Prepare all puts in only what changed on its own page (so it never clears the ticks
// of a SWMS that did not change); the falls check names every step and says when No leaves an edge step out;
// answers print whole in their own place; refusals quote the words whole and refuse only what the rule is
// for; weak answers; section and price pointers off the task line; one ABN wording; address suggestions
// ranked by the number and suburb typed; a 502 on the questions said; the scaffold supervisor's note once.
// The on-screen faults are also run in a browser (scratchpad/flow9).
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { prepareDraft, questionsFor, taskLine } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps } = require('../download-gate');
const { titleFor } = require('../accounts');
const gate = require('../public/gate-rules');
const places = require('../places');
const { loadPage, settle } = require('./fake-dom');
const { setupAccounts, lastLinkToken, ANSWERED, ready } = require('./helpers');

const draftOf = (input) => prepareDraft(draftBody(ready({ fallRisk: 'no', residential: 'no', crane: 'none', ...ANSWERED, ...input })));

// ---- 1. Work done inside a project SWMS is never dropped ----

const SCOPE_PAGE = ['gate-rules.js', 'app.js', 'scope-task.js', 'scope-hrcw.js', 'scope-choice.js', 'scope-conflicts.js', 'scope.js'];
const POOL = 'Construct the pool structure: formwork, reinforcement and concrete to swimming stage.';
const REWORDED = 'Construct the in-ground pool shell: wall forms, reo and concrete to swimming stage.';

test('a project SWMS whose task is reworded while it is open keeps every change made in it, and the list follows', async () => {
  // Run 4: the pool SWMS was "not finished"; its task was reworded inside it, then its answer, plant,
  // products, own control, step order and ticks were all dropped, and the list still said "Not finished".
  const project = { current: 0, stage: 'check', from: null, shared: { crane: 'none', site: null, designs: {}, emergency: {} }, items: [
    { title: 'Trade installation: swimming pool', task: POOL, kind: 'stand-down', status: 'needs', needs: ['How the deck is laid'], body: { task: POOL } },
    { title: 'In-ground civil', task: 'Dig the pool.', kind: 'draft', status: 'ready', body: { task: 'Dig the pool.' } },
  ] };
  const p = loadPage(SCOPE_PAGE, () => ({ body: {} }), { stored: { 'sitewrite.project': JSON.stringify(project) } });
  await settle();
  p.document.getElementById('task').value = REWORDED;
  const sent = { task: REWORDED, facts: { deckMethod: 'onTop' }, stepOrder: ['Before starting', 'Pour the tank walls', 'Render the walls'], plantChoice: { ticks: { pump: true } }, substances: [{ type: 'Cement', product: 'GP cement' }] };
  p.window.SiteWrite.onDraft({ kind: 'draft', jobSteps: [], gate: [] }, sent);
  let kept = JSON.parse(p.window.localStorage.getItem('sitewrite.project'));
  assert.equal(kept.items[0].kind, 'draft');
  assert.equal(kept.items[0].status, 'ready');
  assert.deepEqual(kept.items[0].needs, []);
  assert.equal(kept.items[0].body.task, REWORDED);
  assert.deepEqual(kept.items[0].body.stepOrder, sent.stepOrder);
  assert.equal(kept.items[0].body.substances[0].product, 'GP cement');
  assert.equal(kept.items[0].goTask, REWORDED, 'the one-go page shows the task as reworded');
  // The answers given under the draft, and the check, go with it too.
  p.window.SiteWrite.onAnswers({ task: REWORDED, needs: [], answers: { emergency: { rescueEquipment: 'Spine board and ladder at the pool ramp.' } }, stale: false });
  const check = { name: 'Dean Marsh', role: 'Pool foreman', partHashes: { steps: 'a', hazards: 'b', plant: 'c', emergency: 'd', site: 'e' } };
  p.window.SiteWrite.onCheckDone({ task: REWORDED }, check, '');
  kept = JSON.parse(p.window.localStorage.getItem('sitewrite.project'));
  assert.equal(kept.items[0].body.emergency.rescueEquipment, 'Spine board and ladder at the pool ramp.');
  assert.equal(kept.items[0].check.name, 'Dean Marsh');
  assert.equal(p.window.SiteWrite.projectCheck({ task: REWORDED }).role, 'Pool foreman');
  // A draft for another task, arriving for the SWMS left (the box shows another task), is not taken.
  p.window.SiteWrite.onDraft({ kind: 'stand-down', jobSteps: [], gate: [], missing: ['x'] }, { task: 'Some other job altogether.' });
  assert.equal(JSON.parse(p.window.localStorage.getItem('sitewrite.project')).items[0].kind, 'draft');
});

// The one-go project page (project-go.js) on its own, as round4-project.test.js loads it.
const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');
const wait = () => new Promise((resolve) => { setTimeout(resolve, 30); });
function goPage({ people = {}, answer = () => ({}) } = {}) {
  const els = new Map();
  const listeners = { input: [], change: [], click: [] };
  const element = (id) => {
    if (!els.has(id)) els.set(id, { id, value: people[id] || '', innerHTML: '', textContent: '', hidden: false, dataset: {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, focus() {}, scrollIntoView() {}, closest: () => null, parentElement: null, remove() { els.delete(id); } });
    return els.get(id);
  };
  const calls = [];
  const document = {
    getElementById: element,
    querySelector: (selector) => (selector === 'input[name="state"]:checked' ? { value: 'wa' } : null),
    querySelectorAll: () => [],
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    activeElement: null,
  };
  const S = {
    api: (route) => route,
    esc: (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]),
    payload: () => ({ state: 'wa', workplace: people.workplace || '', principalContractor: people.principal || '', company: 'Co' }),
    canDownload: () => true,
    signedIn: () => true,
    getProfile: () => ({ name: 'Co', abn: '33102417000' }),
  };
  const window = { SiteWrite: S };
  const fetch = async (route, options) => {
    const body = options && options.body ? JSON.parse(options.body) : null;
    calls.push({ route, body });
    const out = answer(route, body) || {};
    return { ok: out.status === undefined || out.status < 400, json: async () => out.body || {} };
  };
  const context = vm.createContext({ window, document, fetch, setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0), console, globalThis: null });
  context.globalThis = context;
  for (const name of ['design-fill.js', 'substance-rules.js', 'gate-rules.js', 'scope-task.js']) vm.runInContext(read(name), context);
  window.SiteWriteDesignFill = context.SiteWriteDesignFill;
  vm.runInContext(read('project-go.js'), context);
  const hooks = { save() {}, render() {}, statusOf: (item) => (item.kind !== 'draft' || (item.needs || []).length ? 'needs' : 'ready') };
  const fire = (type, target) => {
    const node = { dataset: {}, tagName: 'TEXTAREA', type: 'textarea', value: '', insertAdjacentHTML() {}, ...target };
    node.closest = (selector) => (selector === '#project-panel' ? {} : String(selector).split(',').some((part) => { const m = /\[data-([a-z-]+)\]|#([\w-]+)/.exec(part.trim()); return m && (m[2] ? node.id === m[2] : node.attrs && node.attrs.includes(m[1])); }) ? node : null);
    for (const fn of listeners[type] || []) fn({ target: node });
  };
  return { element, calls, hooks, fire, go: window.SiteWriteProjectGo };
}
const PEOPLE = { workplace: '40 Geographe Bay Road, Dunsborough WA', principal: 'Capeline Resort Builders Pty Ltd' };

test('Prepare all leaves a prepared SWMS nothing changed for as it is, with its ticks, and keeps the steps added inside it', async () => {
  // Run 4: "Prepare all 3 SWMS" cleared SWMS 1's ticks ("You changed the job steps ..."), though nothing in it
  // had changed: the one-go page's step choices went back over the step the user added inside it.
  const drafts = [];
  const p = goPage({ people: PEOPLE, answer: (route, body) => {
    if (route === '/api/draft/questions') return { body: { required: /Dig the pool/.test(body.task) ? [{ id: 'trenchSupport', label: 'Trench support' }] : [], weak: [] } };
    if (route === '/api/draft') { drafts.push(body); return { body: { kind: 'draft', gate: [] } }; }
    return {};
  } });
  const project = { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {}, site: { liveServices: 'None', publicInterface: 'None', otherTrades: 'None', ground: 'Sand', access: 'Gate 2' } }, items: [
    { title: 'In-ground civil', task: 'Dig the pool and lay the pipework.', fallRisk: 'no', kinds: ['bulkExcavation'], facts: { trenchSupport: 'Battered 1:1.' }, status: 'todo', body: null },
    { title: 'Plant room', task: 'Install the pool plant.', fallRisk: 'no', kinds: ['poolPlant'], status: 'todo', body: null },
  ] };
  p.go.render(p.element('project-panel'), project, p.hooks);
  await wait();
  p.fire('click', { id: 'go-prepare', attrs: [] });
  await wait();
  assert.equal(drafts.length, 2);
  assert.equal(project.items[0].kind, 'draft');
  // Inside SWMS 1 the user adds a job step, moves a step, and ticks the parts (scope.js keeps them in its body).
  project.items[0].body = { ...project.items[0].body, kinds: ['bulkExcavation', 'trench'], stepOrder: ['Before starting', 'Dig the trench'] };
  project.items[0].check = { name: 'Dean Marsh', role: 'Pool foreman', partHashes: { steps: 'a' } };
  project.stage = 'questions';
  p.go.render(p.element('project-panel'), project, p.hooks);
  await wait();
  // Prepare all again, nothing changed on this page: SWMS 1 is not prepared over, and keeps its ticks.
  p.fire('click', { id: 'go-prepare', attrs: [] });
  await wait();
  assert.equal(drafts.length, 2, 'nothing was prepared again');
  assert.equal(project.items[0].check.name, 'Dean Marsh');
  assert.deepEqual(project.items[0].body.kinds, ['bulkExcavation', 'trench']);
  // Back on this page, an answer changed goes in, over the SWMS's own work, which stays.
  project.stage = 'questions';
  p.fire('input', { dataset: { goFact: '0', q: 'trenchSupport' }, value: 'Trench shield to 1.8 m, checked each morning by the foreman.' });
  project.stage = 'questions';
  p.fire('click', { id: 'go-prepare', attrs: [] });
  await wait();
  const last = drafts.filter((body) => /Dig the pool/.test(body.task)).pop();
  assert.equal(last.facts.trenchSupport, 'Trench shield to 1.8 m, checked each morning by the foreman.');
  assert.deepEqual(last.kinds, ['bulkExcavation', 'trench'], 'the step added inside it stays');
  assert.deepEqual(last.stepOrder, ['Before starting', 'Dig the trench']);
  assert.ok(!drafts.slice(2).some((body) => /pool plant/.test(body.task)), 'SWMS 2, unchanged, was not prepared again');
});

// ---- 2. Falls answered No ----

const CCTV = 'CCTV: fix the cameras inside, on facades and at roof edges from EWPs, stand the camera poles on their footings with a crane truck, and fit the pole enclosures and surge protection. 12 cams total in the cribb st carpark and lobby, core drill holes in slab for pole base plates, brennocks sparky does the 240v';
const CCTV_FACTS = { ...ANSWERED.facts, craneChart: '25 t at 20 m radius from the crane chart', groundBearing: 'Geotechnical report GR-12 rev B: allowable 200 kPa; 1.2 m x 1.2 m timber mats under each outrigger.', silicaControls: 'Core drilling is done wet and the driller wears a fit tested P2 respirator.', harnessSystem: 'harness in the ewp basket.' };
const PODIUM = 'Podium and roof garden planting: get soil and plants to the roof by crane, install the green roof layers and the green wall, and plant next to the edges.\nShopping centre podium on the trower rd side, planter boxes with drip irrigation.';

test('EWP work at roof edges with falls No gets the "Keep No" check, not only the note under the question', () => {
  // Run 3: the file said no one could fall 2 m beside harness and anchor lines.
  const input = draftBody(ready({ ...ANSWERED, state: 'qld', residential: 'no', fallRisk: 'no', crane: 'own', task: CCTV, facts: CCTV_FACTS }));
  const draft = prepareDraft(input);
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  // The EWP step's own fall, a person going over with the platform, counts too (messy round 10, run 8).
  assert.deepEqual(draft.fallConflict, { steps: ['Use an elevating work platform', 'Install security devices'], metres: 2, kept: false });
  assert.ok(downloadGaps(input, draft).some((gap) => gap.kind === 'fall'));
  // Kept as No, the download goes on.
  const kept = prepareDraft({ ...input, fallNoKept: true });
  assert.ok(!downloadGaps({ ...input, fallNoKept: true }, kept).some((gap) => gap.kind === 'fall'));
  // A fall from a ladder inside, with no height in the task, is still not asked about.
  const inside = draftOf({ state: 'qld', task: 'Fix CCTV cameras to the ceilings of the ground floor shop from a platform ladder.' });
  assert.equal(inside.fallConflict, undefined);
});

test('the falls check names every step that rates a fall High, and says when No leaves a ticked edge step out', () => {
  // Run 8: it named "Get onto the roof" and "Set up roof fall protection" only, and "Work at podium edges" went with no word.
  const input = draftBody(ready({ ...ANSWERED, state: 'nt', residential: 'no', fallRisk: 'no', crane: 'company', slinging: 'crane', task: PODIUM }));
  const draft = prepareDraft(input);
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.deepEqual(draft.fallConflict.steps, ['Get onto the roof', 'Set up roof fall protection', 'Use an elevating work platform', 'Install the green wall', 'Install the green roof layers', 'Plant the green roof']);
  assert.deepEqual(draft.fallConflict.leftOut, ['Work at podium edges']);
  assert.ok(!draft.jobSteps.some((step) => step.step === 'Work at podium edges'));
  const need = downloadGaps(input, draft).find((gap) => gap.kind === 'fall').need;
  assert.equal(need, 'You answered No to a fall of more than 2 metres, but the steps "Get onto the roof", "Set up roof fall protection", "Use an elevating work platform", "Install the green wall", "Install the green roof layers" and "Plant the green roof" rate a fall from height High, and with No the step "Work at podium edges" is left out of this SWMS. Answer Yes if anyone could fall more than 2 metres. If the step is not part of this job, untick it. If no one can fall that far, press Keep No.');
  // The same words on the page, above the draft.
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  const block = p.run(`fallCheckBlock(${JSON.stringify({ kind: 'draft', fallConflict: draft.fallConflict })})`);
  assert.match(block, /the steps "Get onto the roof", "Set up roof fall protection", "Use an elevating work platform", "Install the green wall", "Install the green roof layers" and "Plant the green roof" rate a fall from height High, and with No the step "Work at podium edges" is left out of this SWMS\./);
  // Answered Yes, the edge step is in and nothing is asked.
  const yes = prepareDraft(draftBody(ready({ ...ANSWERED, state: 'nt', residential: 'no', fallRisk: 'yes', crane: 'company', slinging: 'crane', task: PODIUM, facts: { fallControl: 'Builder\'s glass balustrade on the podium edge; temporary guardrails where panels are out.' } })));
  assert.equal(yes.fallConflict, undefined);
  assert.ok(yes.jobSteps.some((step) => step.step === 'Work at podium edges'));
});

test('the note that No disagrees with the task goes once the answer is Yes, and a length or a level crossing is not a height', () => {
  // Run 8: "You answered No, but the task mentions work at height" stayed after Yes.
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  const note = p.document.getElementById('fall-warning');
  note.textContent = 'You answered No, but the task mentions work at height.';
  note.classList.remove('hidden');
  const query = p.document.querySelector;
  p.document.querySelector = (selector) => (selector === 'input[name="fallRisk"]:checked' ? { value: 'yes' } : query(selector));
  p.run('showFallExplanation()');
  assert.equal(note.classList.contains('hidden'), true);
  p.document.querySelector = (selector) => (selector === 'input[name="fallRisk"]:checked' ? { value: 'no' } : query(selector));
  p.run('showFallExplanation()');
  assert.equal(note.classList.contains('hidden'), false);
  // Run 5: "600m of track ... at grange rd level xing" read as work 600 m up.
  const rail = 'repalce 400 timber sleepers with concrete and resurface 600m of track on the grange line at grange rd level xing, possesion sat nite';
  assert.equal(questionsFor(draftBody({ ...ANSWERED, state: 'sa', fallRisk: 'no', task: rail })).fall.warning, '');
  assert.match(questionsFor(draftBody({ ...ANSWERED, state: 'sa', fallRisk: 'no', task: 'Paint the plant room ceiling 6 m above the floor level from a scissor lift.' })).fall.warning, /^You answered No/);
});

// ---- 3. Answers print whole in their own place ----

test('an answer with its own row prints there whole, a "not needed" answer says so, and the harness answer is not a control', () => {
  // Run 2: "slabs on ground only, no suspended deck." and "timber edge forms, no proprietary system." printed
  // as Administrative controls as well as in their rows. Run 3: "harness in the ewp basket." was a control.
  const facts = { fallControl: 'Edge protection to every open slab edge before work starts.', loadLimits: 'slabs on ground only, no suspended deck', systemInstructions: 'timber edge forms, no proprietary system', formworkDesign: 'timber edge forms on ground slabs and kerbs, checked by our leading hand before each pour', temporarySupport: 'Props to the engineer\'s design TS-2 rev A, checked by the foreman before loading.' };
  const draft = prepareDraft({ ...ANSWERED, state: 'qld', fallRisk: 'yes', residential: 'no', kinds: ['formwork'], task: 'Erect, strip and remove formwork and propping to suspended slabs.', facts });
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  const controls = draft.controls.map((item) => item.text).join('\n');
  assert.doesNotMatch(controls, /slabs on ground only|no proprietary system|checked by our leading hand before each pour/);
  const rows = Object.fromEntries(draft.references.map((item) => [item.label, item.text]));
  assert.equal(rows['Load limits'], 'Not needed for this work: slabs on ground only, no suspended deck');
  assert.equal(rows['System and supplier instructions'], 'Not needed for this work: timber edge forms, no proprietary system');
  // With its first capital, as typed answers print since messy round 17 (flow18).
  assert.equal(rows['Formwork design'], 'Timber edge forms on ground slabs and kerbs, checked by our leading hand before each pour');
  const cctv = prepareDraft(draftBody(ready({ ...ANSWERED, state: 'qld', residential: 'no', fallRisk: 'yes', crane: 'own', task: CCTV, facts: { ...CCTV_FACTS, fallControl: 'Work at the roof edge is done from the boom EWP.' } })));
  assert.equal(cctv.kind, 'draft', (cctv.missing || []).join('; '));
  assert.ok(!cctv.controls.some((item) => /harness in the ewp basket/i.test(item.text)));
  const holding = cctv.jobSteps.filter((step) => step.controls.some((line) => /harness in the ewp basket/i.test(line)));
  assert.deepEqual(holding.map((step) => step.step), ['Use an elevating work platform']);
});

// ---- 4. Refusals quote the words whole, and refuse only what the rule is for ----

const KIT = { ask: 'Say what is used to get the person out, and where it is kept.', emergency: true, kit: true, involves: 'work from a slung platform' };
const RESCUE = { ask: 'Say who rescues the person and how.', emergency: true, rescue: true, involves: 'work in a trench' };

test('a second rescue kit in the ute beside one at the work is accepted, and a refusal never cuts the words', () => {
  // Run 7: '"Rescue kit with a rescue pole and rescue line on the slung p" keeps the rescue equipment away from the work.'
  assert.equal(gate.answerNeed(KIT, 'Rescue kit with a rescue pole and rescue line on the slung platform, a second kit and the first aid kit in the ute at the lane closure.'), '');
  const far = 'Rescue rope, tripod and harness are kept in the site ute, parked out on the access road near the gate';
  assert.equal(gate.answerNeed(KIT, far), `"${far}" keeps the rescue equipment away from the work. Say what is used to get the person out, and that it is kept at the work area.`);
  // Run 4: "help the person out" is a rescue, not only a call for help.
  assert.equal(gate.answerNeed(RESCUE, 'The pipe trenches are battered and no deeper than 1.2 m. The foreman and a labourer help the person out from the low end, without going under a slumped batter. The foreman calls 000 if they cannot walk out.'), '');
  assert.match(gate.answerNeed(RESCUE, 'call 000 and wait for the ambulance'), /only calls for help/);
  // Every quoted answer is whole.
  const long = 'dont know yet, the builder has not told us who the first aider on this level of the carpark will be';
  assert.ok(gate.notAnswer(long).startsWith(`"${long}"`));
});

// ---- 5. Weak answers ----

test('a vehicle as the muster point, a trade, a bare role or an amount is refused; a name and role passes', () => {
  const rule = (field) => gate.fieldRule(gate.PEOPLE_FIELDS.find((item) => item.field === field));
  // Run 5: "the ute" was accepted as the muster point.
  assert.match(gate.answerNeed(rule('muster-point'), 'the ute'), /^"the ute" does not say where\./);
  assert.match(gate.answerNeed(rule('muster-point'), 'ute'), /does not say where/);
  assert.equal(gate.answerNeed(rule('muster-point'), 'Trower Rd car park entry, gate 3'), '');
  // Run 1: "the tilers"; run 6: "leading hand".
  assert.equal(gate.answerNeed(rule('compliance-responsible'), 'the tilers'), '"the tilers" does not name a person. Give their name and role, for example "Sam Lee, supervisor".');
  assert.equal(gate.answerNeed(rule('compliance-responsible'), 'leading hand'), '"leading hand" is a role, not a person. Give their name and role, for example "Sam Lee, leading hand".');
  assert.equal(gate.answerNeed(rule('compliance-responsible'), 'Danny Kostopolous, leading hand'), '');
  // First names alone were accepted (flow8 decision 1) until messy round 14: a full name is asked for.
  assert.match(gate.answerNeed(rule('reviewer'), 'Leah'), /gives one name only/);
  // Run 6: "heaps" for the other trades.
  assert.equal(gate.answerNeed({ ask: gate.SITE_NEED.otherTrades, name: 'Other trades', none: true }, 'heaps'), `"heaps" gives an amount, not who or what. Name them, or say what applies on this job. ${gate.SITE_NEED.otherTrades}`);
});

test('a company name typed in lower case prints with its capitals, as SiteLink gives them', async () => {
  // Run 3: "lockwise security" printed so in the header.
  const draft = draftOf({ state: 'qld', company: 'lockwise security', task: 'Fix CCTV cameras to the ceilings of the ground floor shop.' });
  assert.equal(draft.subcontractor, 'Lockwise Security');
  assert.equal(draftOf({ state: 'qld', company: 'ABC Security Pty Ltd', task: 'Fix CCTV cameras to the ceilings of the ground floor shop.' }).subcontractor, 'ABC Security Pty Ltd');
});

test('the company profile saves a lower case name with its capitals, and capitals alone are not a change of name', async (t) => {
  const { app } = require('../server');
  await setupAccounts();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, route, { body, token } = {}) => fetch(`${base}${route}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const email = 'jordan@lockwise.example';
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  const saved = await (await call('PUT', '/api/company', { token, body: { name: 'lockwise security', abn: '83 914 571 673' } })).json();
  assert.equal(saved.company.name, 'Lockwise Security');
  const again = await call('PUT', '/api/company', { token, body: { name: 'lockwise security', abn: '83 914 571 673', phone: '07 3333 4444' } });
  assert.equal(again.status, 200);
});

// ---- 6. Section and price pointers off the task line ----

test('a price section reference and "including but not limited to" come off the task line and title', () => {
  // Run 6: 'as per ... the Section "6.1 Subcontract Sum Breakdown", including but not limited to:' stayed.
  const paste = fs.readFileSync(path.join(__dirname, '..', 'scenarios', 'scopes', 'a-joinery.txt'), 'utf8').split('\n').slice(38, 45).join('\n');
  const line = taskLine(paste);
  assert.equal(line, 'Shop draw, fabricate, supply, deliver, install and certify all front of house joinery items: Front of house bathroom joinery. Main bar structure and finishes. Library shelving, cabinet and wall finishes. Restaurant servery areas. Restaurant waiter stations.');
  assert.doesNotMatch(titleFor({}, draftBody({ task: paste })), /Section|Subcontract Sum|limited to|as per/);
  assert.equal(taskLine('Supply and install the kitchen joinery as per Clause 4.2 of the Subcontract, including but not limited to: benches and cupboards.'), 'Supply and install the kitchen joinery: benches and cupboards.');
  assert.equal(taskLine('Hang the doors in accordance with the Schedule of Rates and the price breakdown.'), 'Hang the doors.');
  assert.equal(taskLine('Lay pavers, including (but not limited to) the forecourt and paths.'), 'Lay pavers, including the forecourt and paths.');
  // The work's own sections stay.
  assert.equal(taskLine('Replace fence section 2 of the boundary.'), 'Replace fence section 2 of the boundary.');
});

// ---- 7. One ABN wording ----

test('a wrong ABN has one wording, at its box, and the profile saved shows "Saved" in view', async () => {
  // Run 6: three wordings, one repeated in the "Saved on this device" note.
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  assert.equal(p.run('abnProblem("51 824 753 557")'), 'That ABN is not valid. Check the 11 digits.');
  p.document.getElementById('profile-company').value = 'Tamar Shopfit and Joinery';
  p.document.getElementById('profile-abn').value = '51 824 753 557';
  p.run('saveProfile()');
  assert.equal(p.document.getElementById('profile-status').textContent, 'Saved on this device, but the ABN needs fixing before a SWMS can be saved or downloaded. See the note under the ABN.');
  assert.equal(p.document.getElementById('abn-error').textContent, 'That ABN is not valid. Check the 11 digits.');
  // Run 8: on a phone the view jumped and "Saved" was out of sight.
  let shown = false;
  p.document.getElementById('profile-summary').scrollIntoView = () => { shown = true; };
  p.document.getElementById('profile-abn').value = '51 824 753 556';
  p.run('saveProfile()');
  assert.equal(p.document.getElementById('profile-summary').textContent, '· Tamar Shopfit and Joinery · Saved');
  assert.equal(shown, true);
  // The register lookup and the server's save say it in the same words.
  const guid = process.env.ABR_GUID;
  process.env.ABR_GUID = 'test-guid';
  try {
    assert.equal((await require('../abn').lookupAbn('12345678901', { fetchImpl: () => { throw new Error('not asked'); } })).error, 'That ABN is not valid. Check the 11 digits.');
  } finally {
    if (guid === undefined) delete process.env.ABR_GUID; else process.env.ABR_GUID = guid;
  }
});

// ---- 8. Address suggestions ----

const prediction = (main, rest, types = ['street_address']) => ({ placePrediction: { text: { text: `${main}, ${rest}, Australia` }, structuredFormat: { mainText: { text: main }, secondaryText: { text: rest } }, types } });
async function withKey(fn) {
  const saved = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  try { await fn(); } finally { if (saved === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = saved; }
}
const answers = (table) => async (_url, options) => ({ ok: true, json: async () => ({ suggestions: table(JSON.parse(options.body).input) }) });

test('suggestions with the street number and the suburb typed come first, a slip in the suburb allowed', async () => {
  await withKey(async () => {
    // Run 1: "Macquarie St, Sydney NSW" (no number, wrong suburb) came first.
    const one = await places.suggest('14 macquarie st parramtta', { fetchImpl: answers(() => [prediction('Macquarie St', 'Sydney NSW', ['route']), prediction('14 Macquarie St', 'Parramatta NSW')]) });
    assert.equal(one.suggestions[0].text, '14 Macquarie St, Parramatta NSW');
    // Run 5: "Grange Rd, Eastern Heights QLD" (wrong state, no number) came first.
    const five = await places.suggest('2 grange rd woodvile', { fetchImpl: answers(() => [prediction('Grange Rd', 'Eastern Heights QLD', ['route']), prediction('2 Grange Rd', 'Allenby Gardens SA')]) });
    assert.equal(five.suggestions[0].text, '2 Grange Rd, Allenby Gardens SA');
    // Retyped after a wrong Queensland pick, the suburb typed wins and Queensland is not asked for.
    const asked = [];
    const retype = await places.suggest('2 grange rd allenby gardns', { near: 'qld', fetchImpl: async (url, options) => { asked.push(JSON.parse(options.body).input); return answers((input) => (/QLD$/.test(input) ? [prediction('2 Grange Rd', 'Eastern Heights QLD')] : [prediction('2 Grange Rd', 'Eastern Heights QLD'), prediction('2 Grange Rd', 'Ipswich QLD'), prediction('2 Grange Rd', 'Allenby Gardens SA')]))(url, options); } });
    assert.equal(retype.suggestions[0].text, '2 Grange Rd, Allenby Gardens SA');
    assert.deepEqual(asked, ['2 grange rd allenby gardns']);
  });
});

test('an address picked in the box since the page opened does not set the state the next lookup is near', () => {
  const p = loadPage(['address.js', 'gate-rules.js', 'app.js'], () => ({ body: {} }), { stored: { 'sitewrite.fieldMemory': JSON.stringify({ workplace: ['2 Grange Rd, Eastern Heights QLD 4305', '10 Smith St, Adelaide SA 5000'] }) } });
  assert.equal(p.run('lookupNear()'), 'qld');
  const box = p.document.getElementById('workplace');
  box.value = '2 Grange Rd, Eastern Heights QLD 4305';
  box.dispatchEvent(new p.window.Event('change'));
  assert.equal(p.run('lookupNear()'), 'sa');
});

// ---- 9. A 502 on the questions ----

test('the questions are asked again by themselves after a 502, the page says so if it still fails, and a save is sent once', async () => {
  // Run 6: an HTTP 502 on POST /api/draft/questions showed nothing.
  let asks = 0;
  let saves = 0;
  const p = loadPage(['gate-rules.js', 'app.js'], (method, route) => {
    if (route === '/api/draft/questions') { asks += 1; return { status: 502, body: '<html>Bad Gateway</html>', headers: { 'content-type': 'text/html' } }; }
    if (route === '/api/swms') { saves += 1; return { status: 502, body: '<html>Bad Gateway</html>', headers: { 'content-type': 'text/html' } }; }
    return { body: {} };
  });
  p.run('questions = { required: [] }; factsForm.classList.remove("hidden");');
  await p.run('askAgain()');
  assert.ok(asks >= 2, 'asked again by itself');
  const said = p.document.getElementById('facts-error').innerHTML;
  assert.match(said, /^SiteWrite could not reach the server to check the questions for your change, so they may be out of date\. Your answers are kept\. <button type="button" class="link" data-retry-ask>Try again<\/button>$/);
  await assert.rejects(p.run('postJson("/api/swms", { task: "x" })'));
  assert.equal(saves, 1, 'a write is never sent twice');
});

// ---- 10. Minor ----

test('the scaffold supervisor\'s note shows once on the project page, and one answer "needs more"', async () => {
  // Run 4: the note left by the SWMS open before showed under the box as well as the project page's own.
  const p = goPage({ people: { ...PEOPLE, 'scaffold-supervisor': '' } });
  const left = p.element('need-scaffold-supervisor');
  left.hidden = false;
  const project = { stage: 'review', tried: true, shared: { crane: 'none', emergency: {}, designs: {} }, items: [
    { title: 'Pool', task: 'Build the pool.', fallRisk: 'no', kind: 'stand-down', status: 'needs', needs: ['How the deck is laid', 'Scaffold supervisor'], body: { task: 'Build the pool.' } },
  ] };
  p.go.render(p.element('project-panel'), project, p.hooks);
  assert.equal(left.hidden, true);
  assert.match(p.element('project-panel').innerHTML, /Not finished: How the deck is laid needs more\./);
});
