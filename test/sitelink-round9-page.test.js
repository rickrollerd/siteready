// Messy round 9, SiteLink: the one-go page of a builder's list (public/project-go.js), run in the same
// small stand-in for the browser as test/project-go.test.js. Made-up names only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'project-go.js'), 'utf8');
const FILL = fs.readFileSync(path.join(__dirname, '..', 'public', 'design-fill.js'), 'utf8');
const RULES = fs.readFileSync(path.join(__dirname, '..', 'public', 'substance-rules.js'), 'utf8');
const PARTS = fs.readFileSync(path.join(__dirname, '..', 'public', 'check-parts.js'), 'utf8');
const settle = () => new Promise((resolve) => { setTimeout(resolve, 30); });

function page({ people = {}, profile = { name: 'Co', abn: '33102417000' }, answer = () => ({}) } = {}) {
  const els = new Map();
  const listeners = { input: [], change: [], click: [] };
  const element = (id) => {
    if (!els.has(id)) els.set(id, { id, value: people[id] || '', innerHTML: '', textContent: '', hidden: false, dataset: {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, focus() {}, scrollIntoView() {}, insertAdjacentHTML() {} });
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
    // Each SWMS's own check, given under its draft (scope.js, D286).
    projectCheckOf: (entry) => (entry && entry.check && entry.check.name ? entry.check : null),
    canDownload: () => true,
    signedIn: () => true,
    getProfile: () => profile,
    // The page's own fetch, as app.js gives it.
    call: async (method, route, body) => { const r = await fetch(route, { method, body: body ? JSON.stringify(body) : undefined }); if (!r.ok) throw Object.assign(new Error('SiteWrite could not reach the server. Try again.'), { status: 502 }); return r.json(); },
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
  vm.runInContext(FILL, context);
  window.SiteWriteDesignFill = context.SiteWriteDesignFill;
  vm.runInContext(RULES, context);
  vm.runInContext(PARTS, context);
  vm.runInContext(SOURCE, context);
  const hooks = { saved: 0, rendered: 0, save() { this.saved += 1; }, render() { this.rendered += 1; }, statusOf: (item) => (item.kind !== 'draft' || (item.needs || []).length ? 'needs' : 'ready') };
  // A stand-in event: its target answers closest() for the attributes the page looks for.
  const fire = (type, target) => {
    const node = { dataset: {}, tagName: 'TEXTAREA', type: 'textarea', value: '', ...target };
    node.closest = (selector) => (selector === '#project-panel' ? {} : String(selector).split(',').some((part) => { const m = /\[data-([a-z-]+)\]|#([\w-]+)/.exec(part.trim()); return m && (m[2] ? node.id === m[2] : node.attrs && node.attrs.includes(m[1])); }) ? node : null);
    for (const fn of listeners[type] || []) fn({ target: node });
  };
  return { window, document, els, element, calls, hooks, fire, go: window.SiteWriteProjectGo };
}

// A SWMS checked part by part under its draft (D286), unless the test says otherwise.
const CHECK = { parts: { steps: true, hazards: true, plant: true, emergency: true, site: true }, partHashes: { steps: 'a', hazards: 'b', plant: 'c', emergency: 'd', site: 'e' }, name: 'Sam Lee', role: 'Supervisor', ack: true };
const item = (title, extra = {}) => ({ title, task: `${title} work.`, fallRisk: 'yes', kind: 'draft', status: 'ready', needs: [], check: CHECK, body: { task: `${title} work.`, state: 'qld', workplace: '1 A St, Brisbane QLD 4000', principalContractor: 'B', company: 'Co' }, ...extra });
const PEOPLE = { workplace: '1 A St, Brisbane QLD 4000', principal: 'B', 'compliance-responsible': 'S', reviewer: 'S', 'works-manager': 'W', 'works-manager-phone': '0412 345 678', 'first-aider': 'J', 'muster-point': 'Gate', hospital: 'Royal Brisbane and Women\'s Hospital' };


// A builder's list as scope.js keeps it (project.sitelink), with what was submitted.
const HASHES = { steps: 'a', hazards: 'b', plant: 'c', emergency: 'd', site: 'e' };
function listHooks(p, sent = null) {
  const sitelink = { id: 'list-1', builder: { name: 'Bowerbird Creek Constructions', verified: true }, project: { name: 'Noosa Junction aged care', workplace: '22 Sunshine Beach Road' }, subcontractor: { name: 'Wallaroo Bend Electrical Pty Ltd' }, due: null, contact: null, answers: [], listItems: [{ requiredId: 'r1' }, { requiredId: 'r2' }], sent };
  return { ...p.hooks, builder: () => sitelink };
}

// ---- Stuck point 2: a condition's typed note is kept until it is sent ----

test('a condition\'s typed note stays when another condition is marked, and goes with its own (stuck point 2)', async () => {
  const sent = () => ({ items: { r1: { latest: { channel: 'sitewrite', revision: 1, on: '17 October 2026', partHashes: { ...HASHES }, overrides: [], review: { label: 'Approved with conditions', name: 'Marnie Calloway', company: 'B', date: '17 October 2026' } }, earlier: [],
    conditions: [{ id: 'c1', status: 'outstanding', text: 'Add the permit number to step 2.' }, { id: 'c2', status: done ? 'done' : 'outstanding', text: 'Attach the gas fitter licence.', doneBy: 'Rory Haddleton', doneOn: '17 October 2026' }] } }, log: [] });
  let done = false;
  let lost = 0;
  const p = page({ people: PEOPLE, answer: (route, body) => {
    if (/conditions\/c2\/done/.test(route)) { done = true; return { body: { sent: sent(), message: 'Marked done.' } }; }
    // The first press on c1 meets a 502 (messy round 9, 01:16:30 UTC); the second goes through.
    if (/conditions\/c1\/done/.test(route)) { lost += 1; return lost === 1 ? { status: 502, body: {} } : { body: { sent: sent(), message: 'Marked done.', note: body.note } }; }
    return {};
  } });
  const project = { stage: 'review', shared: { emergency: {}, designs: {} }, items: [item('Hydraulic services', { requiredId: 'r1', check: { ...CHECK, partHashes: { ...HASHES } } })] };
  const hooks = listHooks(p, sent());
  hooks.render = () => p.go.render(panel, project, hooks);
  const panel = p.element('project-panel');
  p.go.render(panel, project, hooks);
  assert.match(panel.innerHTML, /data-cond-note="c1" autocomplete="off" value=""/);
  // Typed for c1, then c2 marked done: the page is drawn again, and c1's note is still there.
  p.fire('input', { dataset: { condNote: 'c1' }, value: 'permit EX-0417 added to step 2', tagName: 'INPUT' });
  p.fire('click', { dataset: { condDone: 'c2' }, attrs: ['cond-done'], disabled: false });
  await settle();
  assert.ok(p.calls.some((one) => /conditions\/c2\/done/.test(one.route)), JSON.stringify(p.calls.map((one) => one.route)));
  assert.match(panel.innerHTML, /data-cond-note="c1" autocomplete="off" value="permit EX-0417 added to step 2"/);
  // c1 marked: a 502, then pressed again. Each press sends the kept note.
  p.fire('click', { dataset: { condDone: 'c1' }, attrs: ['cond-done'], disabled: false });
  await settle();
  p.fire('click', { dataset: { condDone: 'c1' }, attrs: ['cond-done'], disabled: false });
  await settle();
  const c1 = p.calls.filter((one) => /conditions\/c1\/done/.test(one.route));
  assert.equal(c1.length, 2);
  assert.deepEqual(c1.map((one) => one.body.note), ['permit EX-0417 added to step 2', 'permit EX-0417 added to step 2']);
});

// ---- Smaller fault: a fall control filled across into the company's own SWMS ----

test('answers on a builder\'s list do not fill into the company\'s own SWMS, nor its falls answer', async () => {
  const p = page({ people: PEOPLE, answer: (route) => (/questions/.test(route) ? { body: { kind: 'questions', required: [{ id: 'fallControl', label: 'Fall control', prompt: 'How falls are prevented.' }] } } : {}) });
  const bare = (title, extra) => ({ title, task: `${title} work.`, kind: '', status: 'todo', needs: [], body: null, ...extra });
  const project = { stage: 'questions', shared: { emergency: {}, designs: {}, site: {} }, items: [bare('Hydraulic services', { requiredId: 'r1', goFall: 'yes' }), bare('Penetrations and core drilling', { requiredId: 'r2', goFall: 'yes' }), bare('Unload pipe deliveries', { own: true, goFall: 'yes' })] };
  const hooks = listHooks(p);
  const panel = p.element('project-panel');
  hooks.render = () => p.go.render(panel, project, hooks);
  p.go.render(panel, project, hooks);
  await new Promise((resolve) => { setTimeout(resolve, 1500); });
  p.fire('input', { dataset: { goFact: '0', q: 'fallControl' }, value: 'Risers and shafts are screened at each level.' });
  await settle();
  assert.equal(project.items[1].facts.fallControl, 'Risers and shafts are screened at each level.', 'filled across the list');
  assert.equal((project.items[2].facts || {}).fallControl, undefined, 'not into the company\'s own SWMS');
  // The falls answer: filled across the list, not into the company's own SWMS.
  for (const one of project.items) delete one.goFall;
  p.fire('change', { dataset: { goFall: '0' }, value: 'yes', tagName: 'INPUT', type: 'radio' });
  await settle();
  assert.equal(project.items[1].goFall, 'yes');
  assert.equal(project.items[2].goFall, undefined);
});

// ---- Wording 4 ----

test('"Not finished: Fall control needs more." with one answer, "need" with more', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'project-go.js'), 'utf8');
  assert.match(source, /\$\{own\.length === 1 \? 'needs' : 'need'\} more\./);
});
