// Messy round 4 (14 October 2026) on the one-go project page: the user's own steps written before
// Prepare all (B fault 1), messages that count and say what happened, a design answer kept (A fault 3),
// the state asked plainly (D292 item 1), a reason for "Not required" (D292 item 3), the hospital
// among the people (D292 item 2) and the steps still rated High named before download (D292 item 4).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');
const settle = () => new Promise((resolve) => { setTimeout(resolve, 30); });

function page({ people = {}, answer = () => ({}), state = 'qld' } = {}) {
  const els = new Map();
  const listeners = { input: [], change: [], click: [] };
  const element = (id) => {
    if (!els.has(id)) els.set(id, { id, value: people[id] || '', innerHTML: '', textContent: '', hidden: false, dataset: {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, focus() {}, scrollIntoView() {}, closest: () => null, parentElement: null, remove() { els.delete(id); } });
    return els.get(id);
  };
  const calls = [];
  const checked = { value: state };
  const document = {
    getElementById: element,
    querySelector: (selector) => (selector === 'input[name="state"]:checked' ? (checked.value ? { value: checked.value } : null) : null),
    querySelectorAll: () => [],
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    activeElement: null,
  };
  const S = {
    api: (route) => route,
    esc: (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]),
    payload: () => ({ state: checked.value, workplace: people.workplace || '', principalContractor: people.principal || '', company: 'Co' }),
    canDownload: () => true,
    signedIn: () => true,
    getProfile: () => ({ name: 'Co', abn: '33102417000' }),
  };
  const window = { SiteReady: S };
  const fetch = async (route, options) => {
    const body = options && options.body ? JSON.parse(options.body) : null;
    calls.push({ route, body });
    const out = answer(route, body) || {};
    return { ok: out.status === undefined || out.status < 400, json: async () => out.body || {} };
  };
  const context = vm.createContext({ window, document, fetch, setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0), console, globalThis: null });
  context.globalThis = context;
  for (const name of ['design-fill.js', 'substance-rules.js', 'gate-rules.js', 'scope-task.js']) vm.runInContext(read(name), context);
  window.SiteReadyDesignFill = context.SiteReadyDesignFill;
  vm.runInContext(read('project-go.js'), context);
  const hooks = { save() {}, render() {}, statusOf: (item) => (item.kind !== 'draft' || (item.needs || []).length ? 'needs' : 'ready') };
  const fire = (type, target) => {
    const node = { dataset: {}, tagName: 'TEXTAREA', type: 'textarea', value: '', insertAdjacentHTML() {}, ...target };
    node.closest = (selector) => (selector === '#project-panel' ? {} : String(selector).split(',').some((part) => { const m = /\[data-([a-z-]+)\]|#([\w-]+)/.exec(part.trim()); return m && (m[2] ? node.id === m[2] : node.attrs && node.attrs.includes(m[1])); }) ? node : null);
    for (const fn of listeners[type] || []) fn({ target: node });
  };
  return { window, document, els, element, calls, hooks, fire, checked, go: window.SiteReadyProjectGo };
}

const PEOPLE = { workplace: '45 Grenfell St, Adelaide SA', principal: 'B Builders Pty Ltd', 'compliance-responsible': 'Dean Russo', reviewer: 'Dean Russo', 'works-manager': 'Dean Russo', 'works-manager-phone': '0412 345 678', 'first-aider': 'Jo Smith', 'muster-point': 'Front gate on Grenfell Street', hospital: 'Royal Adelaide Hospital' };
const STOOD = 'SiteReady has no job steps for this work yet, so it will not draft this SWMS. To go on, add the job steps that cover the work itself under Job steps, or write your own step for the work with "Write a step for this".';
const NO_STEPS = 'Job steps for this work: SiteReady does not have job steps for this kind of work yet. Pick the job steps that cover the work under Job steps, or write your own step for the work with "Write a step for this".';
const storage = () => ({ stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [{ title: 'Painting', task: 'Paint the walls.', fallRisk: 'no', status: 'todo', body: null }, { title: 'Paint storage', task: 'Handle and store paint materials on site.', fallRisk: 'no', status: 'todo', body: null }] });

test('work with no job steps gets "Write a step for this" on the project page, and the step goes with Prepare all', async () => {
  const p = page({ people: PEOPLE, answer: (route, body) => {
    if (route === '/api/draft/questions') return { body: { required: [], weak: [], ...(/store paint/.test(body.task) && !(body.ownSteps || []).length ? { standDown: { message: STOOD } } : {}) } };
    if (route === '/api/draft') return { body: /store paint/.test(body.task) && !(body.ownSteps || []).length ? { kind: 'stand-down', missing: [NO_STEPS] } : { kind: 'draft', gate: [] } };
    return {};
  } });
  const project = storage();
  const panel = p.element('project-panel');
  p.go.render(panel, project, p.hooks);
  await settle();
  const body = p.element('go-body-1').innerHTML;
  assert.match(body, /<p class="warning">SiteReady has no job steps for this work yet/);
  assert.match(body, /data-go-own-write="1" data-part="">Write a step for this<\/button>/);
  // Prepare all without the step: the message counts what is prepared, with no doubled full stop.
  p.fire('click', { id: 'go-prepare', attrs: [] });
  await settle();
  const said = p.element('go-status').innerHTML;
  assert.match(said, /One SWMS is<\/strong>|One SWMS is not finished/);
  assert.match(said, /or write your own step for the work with &quot;Write a step for this&quot;\. <button type="button" class="link" data-go-to-item="1">Write a step for it<\/button>/);
  assert.doesNotMatch(said, /\.\./);
  assert.doesNotMatch(said, /write this SWMS yourself/);
  // Back on the questions, the kept box counts only the SWMS prepared as a draft.
  assert.match(p.element('go-kept-box').innerHTML || '', /^$|Your prepared SWMS is kept/);
  assert.doesNotMatch(p.go && JSON.stringify(project.items.map((item) => item.kind)), /"draft","draft"/);
  // The user writes their own step on the page.
  p.fire('click', { attrs: ['go-own-write'], dataset: { goOwnWrite: '1', part: '' } });
  p.element('go-own-name-1').value = 'Store paint in the locked paint store';
  p.element('go-own-hazards-1').value = 'Spilt paint and solvent fumes in the store\nStrain lifting 20 L drums';
  p.element('go-own-controls-1').value = 'Paint is kept on bunded shelves in the locked store with lids on\nDrums are moved on a trolley, with a two-person lift over 20 kg';
  p.element('go-own-who-1').value = 'Supervisor';
  p.fire('click', { attrs: ['go-own-save'], dataset: { goOwnSave: '1' } });
  await settle();
  assert.equal(project.items[1].body ? project.items[1].body.ownSteps.length : project.items[1].ownSteps.length, 1);
  assert.equal(p.go.payloadFor(1).ownSteps[0].name, 'Store paint in the locked paint store');
  assert.match(p.element('go-body-1').innerHTML, /Your own steps:<\/strong><\/p><ul class="go-own-list"><li>Store paint in the locked paint store/);
  // Prepare all again: the step is sent and the SWMS is prepared.
  p.fire('click', { id: 'go-prepare', attrs: [] });
  await settle();
  const last = p.calls.filter((call) => call.route === '/api/draft').pop();
  assert.equal(last.body.ownSteps[0].name, 'Store paint in the locked paint store');
  assert.equal(project.items[1].kind, 'draft');
});

test('"Your N prepared SWMS are kept" counts only the SWMS prepared as a draft, and "Prepare it again" says what happened', async () => {
  const p = page({ people: PEOPLE, answer: (route) => (route === '/api/draft/questions' ? { body: { required: [], weak: [] } } : route === '/api/draft' ? { body: { kind: 'draft', gate: [] } } : {}) });
  const project = { ...storage(), items: [
    { title: 'Painting', task: 'Paint the walls.', fallRisk: 'no', status: 'ready', kind: 'draft', body: { task: 'Paint the walls.' } },
    { title: 'Washout', task: 'Wash out.', fallRisk: 'no', status: 'needs', kind: 'stand-down', needs: [NO_STEPS], body: { task: 'Wash out.' } },
    { title: 'Paint storage', task: 'Store paint.', fallRisk: 'no', status: 'needs', kind: 'stand-down', needs: [NO_STEPS], body: { task: 'Store paint.' } },
  ] };
  const panel = p.element('project-panel');
  p.go.render(panel, project, p.hooks);
  assert.match(panel.innerHTML, /<strong>Your prepared SWMS is kept\.<\/strong>/);
  assert.doesNotMatch(panel.innerHTML, /Your 3 prepared SWMS are kept/);
  // A change to the first marks it to prepare again; preparing it again says so.
  p.go.markStale([0], 'Its task changed.');
  p.fire('click', { id: 'go-prepare-stale', attrs: [] });
  await settle();
  assert.equal(project.items[0].stale, undefined);
  assert.match(p.element('go-status').innerHTML, /SWMS 1 \(Painting\) is prepared again: check it before it downloads\./);
});

test('a design answered "Not issued yet" in the SWMS itself is kept when the project page prepares it again (A fault 3)', () => {
  const p = page({ people: PEOPLE });
  const project = { ...storage(), items: [{ title: 'Core drilling', task: 'Core drill the slab.', fallRisk: 'no', status: 'ready', kind: 'draft', body: { task: 'Core drill the slab.', designs: [{ id: 'coreHoles', what: 'Core hole layout', status: 'notIssued' }] } }] };
  p.go.render(p.element('project-panel'), project, p.hooks);
  assert.equal(JSON.stringify(p.go.payloadFor(0).designs.map((row) => [row.id, row.status])), JSON.stringify([['coreHoles', 'notIssued']]));
});

test('no state: each SWMS says its questions wait for it, and Prepare all asks for it plainly (D292 item 1)', async () => {
  const p = page({ people: PEOPLE, state: '', answer: (route) => (route === '/api/draft/questions' ? { body: { required: [], weak: [] } } : {}) });
  const project = storage();
  const panel = p.element('project-panel');
  p.go.render(panel, project, p.hooks);
  await settle();
  assert.match(p.element('go-body-0').innerHTML, /questions show once the state is set: pick the job address above from its list, or tick the state the job is in\./);
  assert.equal(p.calls.filter((call) => call.route === '/api/draft/questions').length, 0);
  p.fire('click', { id: 'go-prepare', attrs: [] });
  await settle();
  assert.match(p.element('go-status').innerHTML, /Which state or territory is this job in\? Pick the job address from the list under its box, or tick the state\./);
  // Once the state is set, the questions are asked.
  p.checked.value = 'sa';
  await new Promise((resolve) => { setTimeout(resolve, 700); });
  assert.ok(p.calls.some((call) => call.route === '/api/draft/questions'));
});

test('"Not required" for a type the SWMS\'s own words name asks why, and the reason goes with it (D292 item 3)', async () => {
  const p = page({ people: PEOPLE, answer: (route) => (route === '/api/draft/questions' ? { body: { required: [], weak: [], substanceTypes: ['Waterproofing membranes and primers', 'Respirable crystalline silica (concrete, masonry, tile and stone dust)'] } } : {}) });
  const project = { ...storage(), items: [{ title: 'Waterproofing', task: 'Waterproof the wet areas with a liquid membrane.', fallRisk: 'no', status: 'todo', body: null }] };
  const panel = p.element('project-panel');
  p.go.render(panel, project, p.hooks);
  await settle();
  p.fire('change', { dataset: { goNotused: '0', type: 'Waterproofing membranes and primers' }, checked: true, type: 'checkbox', attrs: ['go-notused'] });
  assert.match(p.element('go-body-0').innerHTML, /Why is it not required\?<span class="hint">This SWMS's task or answers name "Waterproof"/);
  // Silica is not named by the task: ticked, it needs no reason.
  p.fire('change', { dataset: { goNotused: '0', type: 'Respirable crystalline silica (concrete, masonry, tile and stone dust)' }, checked: true, type: 'checkbox', attrs: ['go-notused'] });
  assert.doesNotMatch(p.element('go-body-0').innerHTML, /name "silica"/);
  p.fire('input', { dataset: { goWhy: '0', type: 'Waterproofing membranes and primers' }, value: 'Supplied and applied by others', attrs: ['go-why'] });
  assert.deepEqual(JSON.parse(JSON.stringify(p.go.payloadFor(0).substancesNotUsedWhy)), { 'Waterproofing membranes and primers': 'Supplied and applied by others' });
});

test('the hospital is among the details every SWMS needs, and the download names the steps still rated High (D292 items 2 and 4)', () => {
  const { hospital, ...rest } = PEOPLE;
  const p = page({ people: rest });
  const project = { ...storage(), stage: 'review', items: [{ title: 'Washout', task: 'Wash out.', fallRisk: 'no', status: 'ready', kind: 'draft', needs: [], highAfter: ['step 3 (Load skips and bins)'], body: { task: 'Wash out.' }, check: { name: 'Dean Russo', role: 'Supervisor', partHashes: {} } }] };
  const panel = p.element('project-panel');
  p.go.render(panel, project, p.hooks);
  assert.match(panel.innerHTML, /data-go-field="hospital">Hospital or medical centre<\/button>/);
  assert.match(panel.innerHTML, /<strong>Still rated High after controls:<\/strong><\/p><ul><li>SWMS 1 \(Washout\): step 3 \(Load skips and bins\)\.<\/li><\/ul>/);
  assert.match(panel.innerHTML, /They still download\./);
});
