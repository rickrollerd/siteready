// Messy round 16, SiteLink: the one-go page of a project (public/project-go.js), run in the same small
// stand-in for the browser as test/project-go-round3.test.js. Made-up names only.
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

function page({ people = {}, answer = () => ({}) } = {}) {
  const els = new Map();
  const listeners = { input: [], change: [], click: [] };
  const element = (id) => {
    if (!els.has(id)) els.set(id, { id, value: people[id] || '', innerHTML: '', textContent: '', hidden: false, dataset: {}, tagName: 'TEXTAREA', classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, focus() {}, scrollIntoView() {}, closest: () => null, parentElement: null });
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
    payload: () => ({ state: 'qld', workplace: people.workplace || '', principalContractor: people.principal || '', company: 'Co', scaffoldSupervisor: people.scaffold || '' }),
    confirmBlock: () => '<input id="project-confirm">',
    canDownload: () => true,
    signedIn: () => true,
    getProfile: () => ({ name: 'Co', abn: '33102417000' }),
  };
  const window = { SiteWrite: S };
  const fetch = async (route, options) => {
    const body = options && options.body ? JSON.parse(options.body) : null;
    calls.push({ route, body });
    const out = (await answer(route, body)) || {};
    return { ok: out.status === undefined || out.status < 400, json: async () => out.body || {} };
  };
  const context = vm.createContext({ window, document, fetch, setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0), console, globalThis: null });
  context.globalThis = context;
  vm.runInContext(FILL, context);
  window.SiteWriteDesignFill = context.SiteWriteDesignFill;
  vm.runInContext(RULES, context);
  vm.runInContext(GATE, context);
  vm.runInContext(TASK, context);
  vm.runInContext(SOURCE, context);
  const hooks = { saved: 0, rendered: 0, save() { this.saved += 1; }, render() { this.rendered += 1; }, statusOf: (item) => (item.kind !== 'draft' || (item.needs || []).length ? 'needs' : 'ready') };
  const fire = (type, target) => {
    const node = { dataset: {}, tagName: 'TEXTAREA', type: 'textarea', value: '', ...target };
    node.closest = (selector) => (selector === '#project-panel' ? {} : String(selector).split(',').some((part) => { const m = /\[data-([a-z-]+)\]|#([\w-]+)/.exec(part.trim()); return m && (m[2] ? node.id === m[2] : node.attrs && node.attrs.includes(m[1])); }) ? node : null);
    for (const fn of listeners[type] || []) fn({ target: node });
  };
  return { element, calls, hooks, fire, go: window.SiteWriteProjectGo };
}

const PEOPLE = { workplace: '41 Boundary St, South Brisbane QLD 4101', principal: 'Bilby Range Constructions Pty Ltd', 'compliance-responsible': 'S', reviewer: 'S', 'works-manager': 'W', 'works-manager-phone': '0412 345 678', 'first-aider': 'J', 'muster-point': 'Grassed area by gate 2 off Boundary St', hospital: 'Northside General Hospital' };
const SDS = 'The products used are ____. They are used with good ventilation and away from ignition sources, with the gloves and eye protection their safety data sheets list.';
const LOCK = 'Circuits are isolated, locked with personal locks and danger tagged, and tested de-energised by a licensed electrician before work.';
const COVERS = 'Each penetration is covered with a fixed, marked cover as soon as it is formed, and the area below is barricaded.';
const QUESTIONS = [
  { id: 'safetyDataSheet', label: 'Safety data sheet', prompt: 'Name the hazardous products.', suggestions: [{ label: 'Kept at the work area', text: SDS }] },
  { id: 'isolationProcedure', label: 'Isolation and testing procedure', prompt: 'How circuits are isolated.', suggestions: [{ label: 'Lock out and test', text: LOCK }] },
  { id: 'fallControl', label: 'Fall control', prompt: 'How falls are prevented.', suggestions: [{ label: 'Penetration covers', text: COVERS }] },
  { id: 'energisedWork', label: 'Work on or near energised parts', prompt: 'Choose one.', choices: [{ value: 'none', label: 'None' }, { value: 'testing', label: 'Testing or commissioning on or near energised parts (within 3 m)' }] },
];
const asks = (route) => (route === '/api/draft/questions' ? { body: { required: QUESTIONS, weak: [] } } : {});
const item = (title, task) => ({ title, task, fallRisk: 'yes', status: 'todo', body: null });
const pick = (p, index, q) => p.fire('click', { dataset: { goPick: String(index), q, n: '0' }, attrs: ['go-pick'] });
const typed = (p, index, q, value) => { const box = p.element(`go-${index}-${q}`); box.value = value; p.fire('input', { ...box, dataset: { goFact: String(index), q }, tagName: 'TEXTAREA' }); };

test('Prepared by on the project page is judged as each SWMS judges it, and the reason shows under its box (stuck point 2)', async () => {
  const p = page({ people: { ...PEOPLE, 'prepared-by': 'priya dalgarno office' }, answer: asks });
  const project = { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [item('Roof works', 'Make and flash the roof penetrations.')] };
  p.go.render(p.element('project-panel'), project, p.hooks);
  await settle();
  p.fire('input', { id: 'prepared-by', value: 'priya dalgarno office' });
  assert.equal(p.element('go-need-prepared-by').textContent, 'Needed before download: "priya dalgarno office" ends in "office", which is a place, not a role. Give their name and role, for example "Priya Dalgarno, office manager".');
  assert.equal(p.element('go-need-prepared-by').hidden, false);
  // Left empty, it is not asked: the box may be left empty.
  p.element('prepared-by').value = '';
  p.fire('input', { id: 'prepared-by', value: '' });
  assert.equal(p.element('go-need-prepared-by').hidden, true);
  // Once prepared, a SWMS waiting only for it is sent to the box above, not into the SWMS.
  p.element('prepared-by').value = 'priya dalgarno office';
  const review = { stage: 'review', shared: { crane: 'none', emergency: {}, designs: {} }, items: [{ title: 'Roof works', task: 'Make and flash the roof penetrations.', fallRisk: 'yes', kind: 'draft', status: 'needs', needs: ['Prepared by'], body: { task: 'Make and flash the roof penetrations.', state: 'qld' } }] };
  const panel = p.element('project-panel');
  p.go.render(panel, review, p.hooks);
  assert.doesNotMatch(panel.innerHTML, /open it to give: Prepared by/);
  assert.match(panel.innerHTML, /For every SWMS, still to give:.*data-go-field="prepared-by">Prepared by</);
});

test('the products the safety data sheet answer names are that SWMS\'s products when it is prepared (smaller fault)', async () => {
  const drafts = [];
  const answer = (route, body) => {
    if (route === '/api/draft/questions') return { body: { required: [{ id: 'safetyDataSheet', label: 'Safety data sheet', prompt: 'Name the hazardous products.', suggestions: [] }], weak: [] } };
    if (route === '/api/draft') { drafts.push(body); return { body: { kind: 'draft', gate: [], jobSteps: [], ppe: [] } }; }
    return {};
  };
  const p = page({ people: PEOPLE, answer });
  const project = { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [item('Hot work', 'Cut and thread sprinkler pipe on site.'), item('Cast-in', 'Cast in sleeves.')] };
  p.go.render(p.element('project-panel'), project, p.hooks);
  await settle();
  typed(p, 0, 'safetyDataSheet', 'The products used are pipe thread sealant, cutting oil and pvc solvent cement. They are used with good ventilation.');
  // SWMS 2 ticked the sealant "Not required": it is left as ticked.
  project.items[1].substancesNotUsed = ['Sealants, mastics and silicone'];
  p.fire('click', { id: 'go-prepare', attrs: [] });
  for (let i = 0; i < 20; i += 1) await settle();
  const first = drafts.find((one) => one.task === 'Cut and thread sprinkler pipe on site.');
  assert.deepEqual(JSON.parse(JSON.stringify(first.substances)).map((one) => [one.type, one.product]), [['Sealants, mastics and silicone', 'Pipe thread sealant'], ['PVC primer and solvent cement', 'PVC solvent cement']]);
  const second = drafts.find((one) => one.task === 'Cast in sleeves.');
  assert.deepEqual(JSON.parse(JSON.stringify(second.substances || [])).map((one) => one.type), ['PVC primer and solvent cement'], 'the ticked type is left as ticked');
});
