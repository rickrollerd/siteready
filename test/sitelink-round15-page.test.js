// Messy round 15, SiteLink: the one-go page of a project (public/project-go.js), run in the same small
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

test('a standard answer filled across is never doubled, and its blank\'s words go into the same blank (blocker 2)', async () => {
  const p = page({ people: PEOPLE, answer: asks });
  const project = { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [item('Electrical installation', 'Install cable joints in the pits.'), item('Electrical fit-out', 'Fit off power outlets.'), item('Switchboards', 'Install the main switchboard.')] };
  p.go.render(p.element('project-panel'), project, p.hooks);
  await settle();
  // SWMS 1's standard answer, with its blank typed, fills across into SWMS 2 and 3.
  pick(p, 0, 'safetyDataSheet');
  const filled = SDS.replace('____', 'cable jointing resin and silicone sealant');
  typed(p, 0, 'safetyDataSheet', filled);
  assert.equal(project.items[1].facts.safetyDataSheet, filled);
  assert.equal(project.items[2].facts.safetyDataSheet, filled);
  // SWMS 2 presses the same standard answer where it was filled across: kept once, now its own.
  pick(p, 1, 'safetyDataSheet');
  assert.equal(p.element('go-1-safetyDataSheet').value, filled);
  assert.equal(project.items[1].facts.safetyDataSheet, filled);
  assert.equal((project.items[1].filledFrom || {}).safetyDataSheet, undefined, 'its own answer now');
  // "Lock out and test" pressed where it was filled across prints once.
  pick(p, 0, 'isolationProcedure');
  assert.equal(project.items[2].facts.isolationProcedure, LOCK);
  pick(p, 2, 'isolationProcedure');
  assert.equal(p.element('go-2-isolationProcedure').value, LOCK);
  assert.equal(project.items[2].facts.isolationProcedure, LOCK);
});

test('a blank typed in one SWMS fills the same blank of the same standard answer chosen in another (blocker 2)', async () => {
  const p = page({ people: PEOPLE, answer: asks });
  const project = { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [item('Electrical installation', 'Install cable joints in the pits.'), item('Electrical fit-out', 'Fit off power outlets.')] };
  p.go.render(p.element('project-panel'), project, p.hooks);
  await settle();
  // SWMS 2 chose the standard answer first, its blank still empty; then SWMS 1 chose it and typed its blank.
  pick(p, 1, 'safetyDataSheet');
  assert.equal(project.items[1].facts.safetyDataSheet, SDS);
  pick(p, 0, 'safetyDataSheet');
  typed(p, 0, 'safetyDataSheet', SDS.replace('____', 'silicone sealant'));
  assert.equal(project.items[1].facts.safetyDataSheet, SDS.replace('____', 'silicone sealant'), 'the words go into its blank, not the whole sentence');
  // An answer of its own in other words is never changed.
  typed(p, 1, 'safetyDataSheet', 'Silicone sealant only, used with gloves. Its safety data sheet is in the site folder.');
  typed(p, 0, 'safetyDataSheet', SDS.replace('____', 'cable jointing resin'));
  assert.equal(project.items[1].facts.safetyDataSheet, 'Silicone sealant only, used with gloves. Its safety data sheet is in the site folder.');
});

test('a penetration fall control and the energised testing choice fill across only into work that fits (blocker 3)', async () => {
  const p = page({ people: PEOPLE, answer: asks });
  const project = { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [
    item('Penetrations', 'Core drill and cut penetrations through the slabs.'),
    item('Temporary electrical services', 'Erect pole mounted temporary flood lights. Install temporary power boards.'),
    item('Testing and commissioning', 'Test and commission the new switchboards.'),
    item('Risers', 'Install cable ladders in the risers.'),
  ] };
  p.go.render(p.element('project-panel'), project, p.hooks);
  await settle();
  pick(p, 0, 'fallControl');
  assert.equal(project.items[0].facts.fallControl, COVERS);
  assert.equal((project.items[1].facts || {}).fallControl || '', '', 'not into the pole lights and boards');
  assert.equal((project.items[2].facts || {}).fallControl || '', '');
  assert.equal(project.items[3].facts.fallControl, COVERS, 'the risers name an opening of their own kind');
  // "Testing or commissioning on or near energised parts" from Testing and commissioning.
  p.fire('change', { dataset: { goFact: '2', q: 'energisedWork' }, type: 'radio', value: 'testing', tagName: 'INPUT' });
  assert.equal(project.items[2].facts.energisedWork, 'testing');
  assert.equal((project.items[1].facts || {}).energisedWork || '', '', 'not into temporary services');
  // "None" fits any work.
  p.fire('change', { dataset: { goFact: '0', q: 'energisedWork' }, type: 'radio', value: 'none', tagName: 'INPUT' });
  assert.equal(project.items[1].facts.energisedWork, 'none');
});

test('Prepare all asks the questions a SWMS asks once opened, and counts only SWMS that are ready (stuck point 2)', async () => {
  const HARNESS = { id: 'harnessSystem', label: 'Harness and anchors', prompt: 'The harness and its anchor points.' };
  const answer = (route, body) => {
    if (route === '/api/draft/questions') return { body: { required: [{ id: 'fallControl', label: 'Fall control', prompt: 'How falls are prevented.', suggestions: [] }, ...(Array.isArray(body.ppe) && body.ppe.includes('harness') ? [HARNESS] : [])], weak: [] } };
    if (route === '/api/draft') {
      const ewp = /EWP/.test(body.task);
      // The opened SWMS sends its PPE, and then needs the harness answered.
      if (Array.isArray(body.ppe) && body.ppe.includes('harness') && !String((body.facts || {}).harnessSystem || '').trim()) return { body: { kind: 'stand-down', missing: ['Harness and anchors'], missingHelp: [{ id: 'harnessSystem', label: 'Harness and anchors', help: 'Name the harness and where it is clipped.', state: 'missing' }] } };
      return { body: { kind: 'draft', gate: [], jobSteps: [], ppe: [{ items: [{ id: 'hardHat', ticked: true }, { id: 'harness', ticked: ewp }] }] } };
    }
    return {};
  };
  const p = page({ people: PEOPLE, answer });
  const project = { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [item('Testing and commissioning', 'Test the boards from an EWP.'), item('Fit-out', 'Fit off power outlets.')] };
  p.go.render(p.element('project-panel'), project, p.hooks);
  await settle();
  p.fire('click', { id: 'go-prepare', attrs: [] });
  for (let i = 0; i < 20; i += 1) await settle();
  assert.equal(project.items[0].kind, 'stand-down', 'not counted as prepared');
  assert.deepEqual(JSON.parse(JSON.stringify(project.items[0].needs)), ['Harness and anchors']);
  assert.equal(project.items[1].kind, 'draft');
  // Its section now asks the harness question, asked with the PPE its draft ticks.
  const asked = p.calls.filter((one) => one.route === '/api/draft/questions' && Array.isArray(one.body.ppe));
  assert.ok(asked.length && asked.every((one) => one.body.task === 'Test the boards from an EWP.'), JSON.stringify(asked.map((one) => one.body.task)));
  assert.match(p.element('go-body-0').innerHTML, /data-go-q="harnessSystem"/);
  // Answered, it prepares.
  typed(p, 0, 'harnessSystem', 'Full body harness clipped to the EWP basket anchor point, as the maker\'s instructions say.');
  p.fire('click', { id: 'go-prepare', attrs: [] });
  for (let i = 0; i < 20; i += 1) await settle();
  assert.equal(project.items[0].kind, 'draft');
});

test('a detail given while the list is being brought up to date is put in once that is done (smaller fault)', async () => {
  const people = { ...PEOPLE, scaffold: '' };
  const sent = [];
  // The first refresh is slow, as on mobile data: the second change comes while it is on its way.
  const answer = async (route, body) => {
    if (route !== '/api/draft') return {};
    sent.push(body.scaffoldSupervisor || '');
    if (sent.length === 1) await new Promise((resolve) => { setTimeout(resolve, 1500); });
    return { body: { kind: 'draft', gate: /Doyle/.test(body.scaffoldSupervisor || '') ? [] : [{ kind: 'field', label: 'Scaffold supervisor' }], jobSteps: [], ppe: [] } };
  };
  const p = page({ people, answer });
  const project = { stage: 'review', shared: { crane: 'none', emergency: {}, designs: {} }, items: [{ title: 'Scaffold', task: 'Erect the scaffold.', fallRisk: 'yes', kind: 'draft', status: 'needs', needs: ['Scaffold supervisor'], body: { task: 'Erect the scaffold.', state: 'qld', scaffoldSupervisor: '' } }] };
  const panel = p.element('project-panel');
  const hooks = { ...p.hooks, render: () => p.go.render(panel, project, hooks) };
  p.go.render(panel, project, hooks);
  // She types the scaffold supervisor; the list is brought up to date. She is still typing while it is.
  people.scaffold = 'Pat';
  p.fire('input', { id: 'job-details', attrs: [] });
  await new Promise((resolve) => { setTimeout(resolve, 950); });
  people.scaffold = 'Pat Doyle, Tallow Scaffolding, 0412 345 678';
  p.fire('input', { id: 'job-details', attrs: [] });
  await new Promise((resolve) => { setTimeout(resolve, 3500); });
  assert.equal(sent[sent.length - 1], 'Pat Doyle, Tallow Scaffolding, 0412 345 678', JSON.stringify(sent));
  assert.deepEqual(JSON.parse(JSON.stringify(project.items[0].needs)), []);
});
