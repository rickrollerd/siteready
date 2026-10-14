// Messy round 3 (14 October 2026) on the one-go project page: prepared SWMS kept when an answer
// changes, Prepare all saying what is missing, the crane left unanswered, the scope's site conditions
// offered, work with no job steps listed early, and standard answers replacing thin ones.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'project-go.js'), 'utf8');
const FILL = fs.readFileSync(path.join(__dirname, '..', 'public', 'design-fill.js'), 'utf8');
const RULES = fs.readFileSync(path.join(__dirname, '..', 'public', 'substance-rules.js'), 'utf8');
const GATE = fs.readFileSync(path.join(__dirname, '..', 'public', 'gate-rules.js'), 'utf8');
const TASK = fs.readFileSync(path.join(__dirname, '..', 'public', 'scope-task.js'), 'utf8');
const settle = () => new Promise((resolve) => { setTimeout(resolve, 30); });

function page({ people = {}, profile = { name: 'Co', abn: '33102417000' }, answer = () => ({}) } = {}) {
  const els = new Map();
  const listeners = { input: [], change: [], click: [] };
  const element = (id) => {
    if (!els.has(id)) els.set(id, { id, value: people[id] || '', innerHTML: '', textContent: '', hidden: false, dataset: {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, focus() {}, scrollIntoView() {}, closest: () => null, parentElement: null });
    return els.get(id);
  };
  const calls = [];
  const document = {
    getElementById: element,
    querySelector: (selector) => (selector === 'input[name="state"]:checked' ? { value: 'qld' } : null),
    querySelectorAll: () => [],
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    activeElement: null,
  };
  const S = {
    api: (route) => route,
    esc: (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]),
    payload: () => ({ state: 'qld', workplace: people.workplace || '', principalContractor: people.principal || '', company: 'Co' }),
    confirmBlock: () => '<input id="project-confirm">',
    canDownload: () => true,
    signedIn: () => true,
    getProfile: () => profile,
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
  vm.runInContext(FILL, context);
  window.SiteReadyDesignFill = context.SiteReadyDesignFill;
  vm.runInContext(RULES, context);
  vm.runInContext(GATE, context);
  vm.runInContext(TASK, context);
  vm.runInContext(SOURCE, context);
  const hooks = { saved: 0, rendered: 0, save() { this.saved += 1; }, render() { this.rendered += 1; }, statusOf: (item) => (item.kind !== 'draft' || (item.needs || []).length ? 'needs' : 'ready') };
  // A stand-in event: its target answers closest() for the attributes the page looks for.
  const fire = (type, target) => {
    const node = { dataset: {}, tagName: 'TEXTAREA', type: 'textarea', value: '', ...target };
    node.closest = (selector) => (selector === '#project-panel' ? {} : String(selector).split(',').some((part) => { const m = /\[data-([a-z-]+)\]|#([\w-]+)/.exec(part.trim()); return m && (m[2] ? node.id === m[2] : node.attrs && node.attrs.includes(m[1])); }) ? node : null);
    for (const fn of listeners[type] || []) fn({ target: node });
  };
  return { window, document, els, element, calls, hooks, fire, go: window.SiteReadyProjectGo };
}


const PEOPLE = { workplace: '1 A St, Brisbane QLD 4000', principal: 'B Builders Pty Ltd', 'compliance-responsible': 'S', reviewer: 'S', 'works-manager': 'W', 'works-manager-phone': '0412 345 678', 'first-aider': 'J', 'muster-point': 'Front gate on Smith Street' };
const questions = (route) => {
  if (route === '/api/draft/questions') return { body: { required: [{ id: 'fallControl', label: 'Fall control', prompt: 'How falls are prevented.', suggestions: [{ label: 'Scaffold', text: 'Work is done from a scaffold with guardrails.' }] }], weak: [] } };
  if (route === '/api/draft') return { body: { kind: 'draft', gate: [] } };
  return {};
};
const two = (extra = {}) => ({ stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [{ title: 'Formwork', task: 'Erect formwork.', fallRisk: 'yes', status: 'todo', body: null }, { title: 'Pour', task: 'Pour the slab.', fallRisk: 'yes', status: 'todo', body: null }], ...extra });

test('a shared answer changed after Prepare all keeps the prepared list, marks the SWMS that use it, and says so', async () => {
  const p = page({ people: PEOPLE, answer: questions });
  const project = two();
  const panel = p.element('project-panel');
  p.go.render(panel, project, p.hooks);
  await settle();
  p.fire('click', { id: 'go-prepare', attrs: [] });
  await settle();
  assert.equal(project.stage, 'review');
  // Back on the questions (as "Site question: Access" in the list does), a site answer every SWMS shares changes.
  project.stage = 'questions';
  p.go.render(panel, project, p.hooks);
  p.fire('input', { dataset: { goSharedSite: '', siteId: 'access' }, value: 'Through gate 2 on Smith Street.', attrs: ['go-shared-site'] });
  assert.equal(JSON.stringify(project.items.map((entry) => Boolean(entry.stale))), '[true,true]');
  assert.match(p.element('go-kept-box').innerHTML, /Your 2 prepared SWMS are kept\.<\/strong> You changed an answer 2 of them use, so they need preparing again: SWMS 1 \(Formwork\); SWMS 2 \(Pour\)\./);
  assert.match(p.element('go-kept-box').innerHTML, /id="go-to-review">Back to the list of prepared SWMS<\/button><button type="button" class="small secondary" id="go-prepare-stale">Prepare them again<\/button>/);
  // On the list they stay, marked, and do not download until prepared again.
  project.stage = 'review';
  p.go.render(panel, project, p.hooks);
  assert.match(panel.innerHTML, /<strong>2 SWMS need preparing again<\/strong>, because an answer they use changed\./);
  assert.match(panel.innerHTML, /Needs preparing again: a site answer every SWMS shares changed\./);
  assert.match(panel.innerHTML, /id="project-zip" disabled/);
  p.fire('click', { id: 'go-prepare-stale', attrs: [] });
  await settle();
  assert.equal(JSON.stringify(project.items.map((entry) => Boolean(entry.stale))), '[false,false]');
  const last = p.calls.filter((call) => call.route === '/api/draft').slice(-2);
  assert.equal(JSON.stringify(last.map((call) => call.body.site.access)), JSON.stringify(['Through gate 2 on Smith Street.', 'Through gate 2 on Smith Street.']));
});

test('Prepare all pressed early says what is missing at each question and by the button; the crane is left unanswered, and "No crane" where no task names one', async () => {
  const p = page({ people: PEOPLE, answer: questions });
  const project = { stage: 'questions', shared: { emergency: {}, designs: {} }, items: [{ title: 'Ceilings', task: 'Install ceilings.', status: 'todo', body: null }, { title: 'Lifting', task: 'Lift the plant with a mobile crane.', fallRisk: 'yes', status: 'todo', body: null }] };
  const panel = p.element('project-panel');
  p.go.render(panel, project, p.hooks);
  // Unanswered: no crane answer is ticked (messy round 3).
  assert.doesNotMatch(panel.innerHTML, /name="go-crane" value="\w+" checked/);
  p.fire('click', { id: 'go-prepare', attrs: [] });
  await settle();
  assert.equal(p.calls.filter((call) => call.route === '/api/draft').length, 0);
  const said = p.element('go-status').innerHTML;
  assert.match(said, /Before Prepare all, answer these 2:/);
  assert.match(said, /SWMS 1 \(Ceilings\): could a person fall more than 2 metres\? Answer Yes or No\./);
  assert.match(said, /A task names a crane: say whether a crane is used, and who operates it\./);
  assert.equal(p.element('go-crane-error').textContent, 'A task names a crane. Say whether a crane is used, and who operates it.');
  // With no task naming a crane, Prepare all answers "No crane".
  const q = page({ people: PEOPLE, answer: questions });
  const plain = { stage: 'questions', shared: { emergency: {}, designs: {} }, items: [{ title: 'Ceilings', task: 'Install ceilings.', fallRisk: 'no', status: 'todo', body: null }] };
  q.go.render(q.element('project-panel'), plain, q.hooks);
  await settle();
  q.fire('click', { id: 'go-prepare', attrs: [] });
  await settle();
  assert.equal(plain.shared.crane, 'none');
  assert.equal(q.calls.find((call) => call.route === '/api/draft').body.crane, 'none');
});

test('the scope\'s site conditions are offered under the box, not filled in, and the work with no job steps is listed before Prepare all', async () => {
  const p = page({ people: PEOPLE, answer: (route) => (route === '/api/draft/questions' ? { body: { required: [], weak: [], notCovered: ['Install pizza oven flue'], notCoveredLeft: ['Install pizza oven flue'], notCoveredMain: [] } } : {}) });
  const project = two({ items: [{ title: 'Kitchens', task: 'Install kitchen exhaust.', fallRisk: 'no', status: 'todo', body: null, site: { liveServices: 'Energised buildings. Energised HV.' } }, { title: 'Plant room', task: 'Install pack units.', fallRisk: 'no', status: 'todo', body: null, site: { liveServices: 'Energised buildings. Access: Security guards.' } }] });
  const panel = p.element('project-panel');
  p.go.render(panel, project, p.hooks);
  assert.equal(JSON.stringify(project.shared.site), '{}');
  assert.match(panel.innerHTML, /From the scope\. Press one to use it, then check it for this site:<\/span><button type="button" class="pick-button" data-go-suggest="liveServices" data-n="0" aria-pressed="false">Energised buildings\.<\/button><button type="button" class="pick-button" data-go-suggest="liveServices" data-n="1" aria-pressed="false">Energised HV\.<\/button><button type="button" class="pick-button" data-go-suggest="liveServices" data-n="2" aria-pressed="false">Security guards\.<\/button>/);
  assert.match(panel.innerHTML, /<textarea id="go-site-liveServices" data-go-shared-site data-site-id="liveServices"><\/textarea>/);
  await settle();
  assert.match(p.element('go-body-0').innerHTML, /<strong>SiteReady has no job steps for:<\/strong> Install pizza oven flue\./);
  assert.match(p.element('go-cover-sum').innerHTML, /SWMS 1 \(Kitchens\): Install pizza oven flue\. <button type="button" class="link" data-go-cover="0">Go to it<\/button>/);
});

test('a standard answer replaces a refused or thin answer, and the fall answer is not filled into a SWMS whose own work says otherwise', async () => {
  const p = page({ people: PEOPLE, answer: questions });
  const project = { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [{ title: 'Facade', task: 'Clad the facade.', status: 'todo', body: null }, { title: 'Ground floor', task: 'Ground floor partitions.', fallHint: 'no', status: 'todo', body: null }, { title: 'Roof', task: 'Roof sheeting.', status: 'todo', body: null }] };
  const panel = p.element('project-panel');
  p.go.render(panel, project, p.hooks);
  p.fire('change', { dataset: { goFall: '0' }, value: 'yes', type: 'radio', attrs: ['go-fall'] });
  assert.equal(JSON.stringify(project.items.map((entry) => entry.goFall || '')), JSON.stringify(['yes', '', 'yes']));
  await settle();
  const box = p.element('go-0-fallControl');
  box.value = 'harnes';
  p.fire('click', { dataset: { goPick: '0', q: 'fallControl', n: '0' }, attrs: ['go-pick'] });
  assert.equal(box.value, 'Work is done from a scaffold with guardrails.');
  box.value = 'Edge protection to every open edge of the deck before work starts.';
  p.fire('click', { dataset: { goPick: '0', q: 'fallControl', n: '0' }, attrs: ['go-pick'] });
  assert.equal(box.value, 'Edge protection to every open edge of the deck before work starts. Work is done from a scaffold with guardrails.');
});
