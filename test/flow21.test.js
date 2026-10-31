// Messy test round 20 (31 October 2026, staging), flow faults: a finished scope reading whose package list was blank after the
// user left and came back, Prepare with no package ticked, the scaffold supervisor asked only at checking, and a step an answer
// brought ("Use mobile scaffolds") unticked once the plant was confirmed. One test for each, on the page code.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { stepLibrary } = require('../steps');
const { answersFor } = require('../presets');
const { ready } = require('./helpers');
const { settlePackages, packageHighRisk } = require('../ai-scope');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

const SCRIPTS = ['app.js', 'account.js', 'read-progress.js', 'scope-task.js', 'scope-hrcw.js', 'scope-choice.js', 'scope-conflicts.js', 'scope.js'];
const row = (activity, pack) => ({ activity, type: 'Site work', package: pack, crew: '', clause: '', quotes: [], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' });
const READING = {
  activities: [
    row('Supply and install formwork and propping to suspended slabs', 'Trade installation: formwork'),
    row('Place, tie and chair reinforcement to suspended slabs', 'Trade installation: reinforcement'),
    row('Install and remove temporary handrails to leading edges', 'Edge protection'),
  ],
  packages: [
    { package: 'Trade installation: formwork', groups: ['formwork'], unmatched: [], byOthers: [] },
    { package: 'Trade installation: reinforcement', groups: ['reo'], unmatched: [], byOthers: [] },
    { package: 'Edge protection', groups: ['edgeProtectionInstall'], unmatched: [], byOthers: [] },
  ],
  byOthers: [],
  conflicts: [],
};

// A signed-in server. The reading runs for `asks` answers, then is done. `failOn` is the poll that fails, as a phone's network
// does when the page is in the background.
function server(done, { asks = 0, failOn = 0 } = {}) {
  let polls = 0;
  return (method, route) => {
    if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
    if (route === '/api/me') return { body: { user: { email: 'a@b.example', name: 'Sam', hasPasskey: true }, company: { name: 'Co', abn: '1', hasAccess: true, planStatus: 'active' } } };
    if (route === '/api/sites') return { body: { sites: [] } };
    if (route === '/api/swms') return { body: { swms: [] } };
    if (route === '/api/steps') return { body: { groups: [] } };
    if (route === '/api/scope/ai' && method === 'GET') return { body: { enabled: true } };
    if (route === '/api/scope/ai' && method === 'POST') return { body: asks ? { id: 'r1', status: 'reading', progress: { stage: 'reading', elapsedSeconds: 1, stageSeconds: 1, expectedSeconds: 174 } } : done };
    if (route.startsWith('/api/scope/ai/r1')) {
      polls += 1;
      if (failOn && polls === failOn) throw new Error('Failed to fetch');
      if (polls <= asks) return { body: { id: 'r1', status: 'reading', progress: { stage: 'reading', elapsedSeconds: polls, stageSeconds: 1, expectedSeconds: 174 } } };
      return { body: done };
    }
    return { body: {} };
  };
}
async function finished() {
  const settled = settlePackages(READING);
  return { id: 'r1', status: 'done', state: 'nsw', reading: { ...settled, highRisk: await packageHighRisk(settled, 'nsw') }, checks: { passed: true } };
}
const results = (p) => p.document.getElementById('scope-results').innerHTML;
async function readPasted(p) {
  p.document.getElementById('scope-file').files = [];
  p.document.getElementById('scope-text').value = 'Scope text.';
  p.document.getElementById('scope-read').click();
  await settle(60);
}
const signedIn = (respond, stored = {}) => loadPage(SCRIPTS, respond, { stored: { 'sitewrite.session': 'token', ...stored } });
const keptRecord = (p) => JSON.parse(p.window.localStorage.getItem('sitewrite-scope-reading'));
// A press on a button inside an element, as it reaches the element's listener in a browser.
function press(p, id, on) {
  const event = new FakeEvent('click', { bubbles: true });
  event.target = p.document.getElementById(id);
  p.document.getElementById(on).dispatchEvent(event);
}

// ---- 1. A finished reading's list comes back ----

test('a finished reading keeps its package list: Choose the SWMS draws it again, and a page seen again picks the reading up', async () => {
  const done = await finished();

  // The message said the scope was read, and the list was gone (the page lost it between the two). Choose the SWMS draws the list from
  // the server's reading, with the ticks kept with it.
  const p = signedIn(server(done, { asks: 1 }));
  await settle(40);
  await readPasted(p);
  assert.match(results(p), /class="scope-packages"/);
  assert.equal(keptRecord(p).done, true);
  p.document.getElementById('scope-results').innerHTML = '<p class="note">The AI is reading every word of the scope.</p>';
  assert.doesNotMatch(results(p), /scope-packages/);
  const before = p.calls.filter((call) => call.route.startsWith('/api/scope/ai/r1')).length;
  const go = new FakeEvent('click', { bubbles: true });
  go.target = { closest: (selector) => (String(selector).includes('data-read-done-go') ? go.target : null) };
  p.document.getElementById('read-done').dispatchEvent(go);
  await settle(40);
  assert.ok(p.calls.filter((call) => call.route.startsWith('/api/scope/ai/r1')).length > before, 'the list was asked for again from the server');
  assert.match(results(p), /class="scope-packages"/);
  assert.match(results(p), /Formwork and falsework/);
  assert.match(results(p), /Prepare the SWMS ticked/);
  assert.equal(p.calls.filter((call) => call.route === '/api/scope/ai' && call.method === 'POST').length, 1, 'not read again');

  // The user left while it was read, and the network failed: the finished reading is not forgotten, and the page seen again shows its list.
  const q = signedIn(server(done, { asks: 2, failOn: 2 }));
  await settle(40);
  await readPasted(q);
  assert.doesNotMatch(results(q), /scope-packages/);
  assert.equal(keptRecord(q).id, 'r1', 'a reading that could not be reached is kept');
  q.document.visibilityState = 'visible';
  q.document.body.dispatchEvent(new FakeEvent('visibilitychange', { bubbles: true }));
  await settle(60);
  assert.match(results(q), /class="scope-packages"/);
  assert.equal(keptRecord(q).done, true);

  // A reading that is gone is still forgotten without a word.
  const gone = signedIn((method, route) => (route.startsWith('/api/scope/ai/r1') ? { status: 404, body: { message: 'That reading was not found.' } } : server(done)(method, route)), { 'sitewrite-scope-reading': JSON.stringify({ id: 'r1', state: '', done: true }) });
  await settle(80);
  assert.equal(gone.window.localStorage.getItem('sitewrite-scope-reading'), null);
});

// ---- 2. Prepare with no package ticked says so ----

test('Prepare with no package ticked always says to tick one, also where the list was lost', async () => {
  const done = await finished();
  const p = signedIn(server(done));
  await settle(40);
  await readPasted(p);
  assert.match(results(p), /Prepare the SWMS ticked/);
  assert.match(results(p), /id="scope-choice-error"/);
  press(p, 'scope-confirm', 'scope-results');
  await settle(20);
  assert.equal(p.document.getElementById('scope-choice-error').textContent, 'Tick at least one work package.');
  assert.equal(p.window.localStorage.getItem('sitewrite.project'), null, 'no SWMS was made');

  // The list is not on the page (the line under the button with it): the press draws the list again and still says it.
  const q = signedIn(server(done));
  await settle(40);
  await readPasted(q);
  q.document.getElementById('scope-results').innerHTML = '';
  press(q, 'scope-confirm', 'scope-results');
  await settle(40);
  assert.match(results(q), /class="scope-packages"/);
  assert.equal(q.document.getElementById('scope-choice-error').textContent, 'Tick at least one work package.');

  // A package ticked and unticked again: the same message, not a silent press.
  const tick = (checked) => { const event = new FakeEvent('change', { bubbles: true }); event.target = { dataset: { package: '0' }, checked, name: '' }; q.document.getElementById('scope-results').dispatchEvent(event); };
  tick(true);
  assert.equal(q.document.getElementById('scope-confirm').textContent, 'Prepare this SWMS');
  tick(false);
  press(q, 'scope-confirm', 'scope-results');
  await settle(20);
  assert.equal(q.document.getElementById('scope-choice-error').textContent, 'Tick at least one work package.');
});

// ---- 3. The scaffold supervisor is asked where a scaffold is involved, before checking ----

test('the scaffold supervisor box shows on the questions page where a scaffold is involved, and stays off where none is', async () => {
  const p = loadPage(['app.js'], () => ({ body: {} }));
  await settle();
  const field = p.document.getElementById('scaffold-supervisor-field');
  const task = p.document.getElementById('task');
  const fall = p.document.getElementById('fact-fallControl');
  const typed = (el, text) => { el.value = text; p.document.body.dispatchEvent(new FakeEvent('input', { bubbles: true })); };
  const hidden = () => field.classList.contains('hidden');
  field.classList.add('hidden');

  // No scaffold named: it stays off (D237).
  typed(task, 'Fix roof sheeting to the warehouse.');
  assert.equal(hidden(), true);
  typed(fall, 'Work from an EWP with a harness.');
  assert.equal(hidden(), true);
  typed(fall, 'No scaffold is used. Edge protection by the builder.');
  assert.equal(hidden(), true);
  // The fall answer names a mobile scaffold, or the task a scaffold.
  typed(fall, 'Work above 2 m is done from an EWP or a mobile scaffold with guardrails.');
  assert.equal(hidden(), false);
  typed(fall, '');
  assert.equal(hidden(), true);
  typed(task, 'Erect tube and coupler scaffold up the side of the building for the renderers.');
  assert.equal(hidden(), false);
  typed(task, 'Fix roof sheeting to the warehouse.');
  assert.equal(hidden(), true);
  // A plant item ticked, or the plant confirmed with one.
  p.run('plantChoice = { used: ["Scaffold"], notUsed: [], added: [] }');
  p.run('showScaffoldField()');
  assert.equal(hidden(), false);
  p.run('plantChoice = null');
  p.run('showScaffoldField()');
  assert.equal(hidden(), true);
  // The draft's own check still shows it.
  p.run('shownChecks = [{ id: "scaffoldSupervisor" }]');
  p.run('showScaffoldField()');
  assert.equal(hidden(), false);

  // The project page: a SWMS naming a scaffold shows the box on the questions page, before Prepare all; one that names none does not.
  const shown = [];
  const els = new Map();
  const element = (id) => {
    if (!els.has(id)) els.set(id, { id, value: '', innerHTML: '', textContent: '', hidden: false, dataset: {}, classList: { toggle() {}, add() {}, remove: (name) => { if (id === 'scaffold-supervisor-field' && name === 'hidden') shown.push(true); }, contains: () => false }, focus() {}, scrollIntoView() {}, closest: () => null, parentElement: null });
    return els.get(id);
  };
  const document = { getElementById: element, querySelector: (selector) => (selector === 'input[name="state"]:checked' ? { value: 'qld' } : null), querySelectorAll: () => [], addEventListener() {}, activeElement: null };
  const S = {
    api: (route) => route,
    esc: (value) => String(value || ''),
    payload: () => ({ state: 'qld' }),
    confirmBlock: () => '',
    canDownload: () => true,
    signedIn: () => true,
    getProfile: () => ({ name: 'Co', abn: '33102417000' }),
    scaffoldMentioned: p.window.SiteWrite.scaffoldMentioned,
  };
  const window = { SiteWrite: S };
  const context = vm.createContext({ window, document, fetch: async () => ({ ok: true, json: async () => ({}) }), setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0), console, globalThis: null });
  context.globalThis = context;
  for (const name of ['design-fill.js', 'substance-rules.js', 'gate-rules.js', 'scope-task.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8'), context);
  window.SiteWriteDesignFill = context.SiteWriteDesignFill;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'project-go.js'), 'utf8'), context);
  const hooks = { save() {}, render() {}, statusOf: () => 'needs' };
  const item = (title, task, extra = {}) => ({ title, task, fallRisk: 'yes', status: 'todo', body: null, ...extra });
  const render = (items) => window.SiteWriteProjectGo.render(element('project-panel'), { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items }, hooks);
  render([item('Roofing', 'Fix roof sheeting.'), item('Render', 'Render the walls.')]);
  assert.equal(shown.length, 0, 'no scaffold named: the box stays off');
  render([item('Roofing', 'Fix roof sheeting.'), item('Render', 'Render the walls from a mobile scaffold.')]);
  assert.equal(shown.length, 1);
  render([item('Roofing', 'Fix roof sheeting.', { facts: { fallControl: 'Edge protection and a scaffold with a handover tag.' } })]);
  assert.equal(shown.length, 2);
});

// ---- 4. Confirming the plant leaves a step the fall answer brought ticked ----

const MECH = 'DESCRIPTION OF WORK AREA:\n· All mechanical services to all building areas including the lobby, common areas and all back of house areas including air conditioning and mechanical ventilation systems.\n· All fire dampers required on duct passing through fire wall on grid 17.\n· kitchen extract ductwork to kitchens as detailed on the kitchen consultant\'s drawings and spec.';
const EWP_OR_TOWER = 'Work above 2 m is done from an EWP or a mobile scaffold with guardrails, and platform ladders are used only for short work below 2 m.';
const BASE = { state: 'qld', task: MECH, fallRisk: 'yes', crane: 'company', slinging: 'crane' };
const GENERATOR = { used: ['Elevating work platform', 'Mobile scaffold', 'Ladders'], notUsed: [], added: [{ item: 'Generator', licence: 'No' }] };
const names = (draft) => (draft.jobSteps || []).map((step) => step.step);
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

test('confirming a generator keeps "Use mobile scaffolds" from the fall answer in the draft and ticked in the step list, with picks of the user\'s own', async () => {
  const facts = { fallControl: EWP_OR_TOWER };
  const drawn = questionsFor(draftBody({ ...BASE })).steps;
  assert.ok(!drawn.chosen.includes('mobileScaffold'), 'the list was drawn before the fall answer');
  // The server: the step stays in the draft with the generator confirmed, with and without picks of the user's own.
  for (const extra of [{}, { kinds: drawn.chosen, kindsSeen: drawn.suggested }]) {
    const input = { ...BASE, facts, plantChoice: GENERATOR, ...extra };
    const body = draftBody(input);
    if (extra.kinds) assert.ok(body.kinds.includes('mobileScaffold') && body.kindsKept.includes('mobileScaffold'), JSON.stringify(body.kindsKept));
    const draft = prepareDraft(draftBody(answered(input)));
    assert.equal(draft.kind, 'draft');
    assert.ok(names(draft).includes('Use mobile scaffolds'), names(draft).join(' | '));
  }

  // The page: with picks of its own, the list drawn after the draft shows the step ticked, as the draft has it.
  const library = { groups: stepLibrary().groups };
  const asked = [];
  const p = loadPage(['app.js'], (method, route, body) => {
    if (route.endsWith('/api/steps')) return { body: library };
    if (route.endsWith('/api/draft/questions')) {
      asked.push(body);
      const input = { ...BASE, ...body, state: 'qld', task: MECH, fallRisk: 'yes', crane: 'company', slinging: 'crane' };
      const sent = draftBody(input);
      return { body: { ...questionsFor(sent), ...(sent.kindsKept ? { kindsKept: sent.kindsKept } : {}) } };
    }
    return { body: {} };
  });
  await settle();
  p.document.getElementById('task').value = MECH;
  p.run(`questions = { required: [] }; stepPicks = ${JSON.stringify(drawn.chosen)}; stepsSeen = ${JSON.stringify(drawn.suggested)}; factMemory = ${JSON.stringify(facts)}; plantChoice = ${JSON.stringify(GENERATOR)};`);
  const list = p.document.getElementById('steps-block');
  const boxes = () => [...list.innerHTML.matchAll(/value="(\w+)"( checked)?/g)].map((m) => ({ value: m[1], checked: Boolean(m[2]) }));
  p.document.querySelectorAll = (selector) => (selector === '#steps-block input[data-step]:checked' ? boxes().filter((box) => box.checked).map((box) => ({ value: box.value })) : []);
  list.innerHTML = drawn.chosen.map((id) => `<input type="checkbox" data-step value="${id}" checked>`).join('');
  // The draft the server made with the generator confirmed, and the steps it kept with the picks (keepFoundSteps).
  const sent = draftBody({ ...BASE, facts, plantChoice: GENERATOR, kinds: drawn.chosen, kindsSeen: drawn.suggested });
  const draft = prepareDraft(draftBody(answered({ ...BASE, facts, plantChoice: GENERATOR, kinds: drawn.chosen, kindsSeen: drawn.suggested })));
  p.run(`keepFoundSteps(${JSON.stringify({ kindsKept: sent.kindsKept })})`);
  await p.run(`syncStepList(${JSON.stringify(draft)})`);
  await settle();
  assert.ok(asked.length >= 1, 'the list was asked for again');
  assert.match(list.innerHTML, /value="mobileScaffold" checked/);
  assert.match(list.innerHTML, /value="ewp" checked/);
  assert.match(list.innerHTML, /value="fireDampers" checked/);
  // A step the user unticked by hand stays unticked.
  p.run('stepsOff = new Set(["mobileScaffold"])');
  list.innerHTML = '<input type="checkbox" data-step value="fireDampers" checked>';
  await p.run(`syncStepList(${JSON.stringify(draft)})`);
  await settle();
  assert.doesNotMatch(list.innerHTML, /value="mobileScaffold" checked/);
});
