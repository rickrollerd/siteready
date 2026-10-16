// Messy round 8, SiteLink: the one-go page of a builder's list (public/project-go.js), run in the same
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
    if (!els.has(id)) els.set(id, { id, value: people[id] || '', innerHTML: '', textContent: '', hidden: false, dataset: {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, focus() {}, scrollIntoView() {} });
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

test('the list draws before builder-set.js has loaded, with no endless loop (stuck point 6)', () => {
  const p = page({ people: PEOPLE });
  assert.equal(p.window.SiteWriteBuilderSet, undefined, 'builder-set.js is not loaded in this page');
  const project = { stage: 'review', shared: { emergency: {}, designs: {} }, items: [item('After hours shutdowns', { requiredId: 'r1', draftNotes: [{ text: 'CCTV and Duress are listed as exclusions.', clause: '2.3', settled: 'Yes, CCTV and duress are in this scope.' }] })] };
  const panel = p.element('project-panel');
  p.go.render(panel, project, listHooks(p));
  assert.match(panel.innerHTML, /on Bowerbird Creek Constructions&#39; list/);
  // Blocker 3, on the questions page: a note the lead's answer settles says so, with the answer.
  project.stage = 'questions';
  p.go.render(panel, project, listHooks(p));
  assert.match(panel.innerHTML, /CCTV and Duress are listed as exclusions\. <span class="meta">\(clause 2\.3\)<\/span> <span class="go-note-settled"><strong>Settled:<\/strong> Bowerbird Creek Constructions&#39; answer is "Yes, CCTV and duress are in this scope"\.<\/span>/);
});

test('"Changed since you submitted it" follows the parts as submitted, on any device and after a reload (stuck point 1)', () => {
  const p = page({ people: PEOPLE });
  const sent = { items: { r1: { latest: { channel: 'sitewrite', revision: 1, on: '17 October 2026, 5:08 am', partHashes: { ...HASHES }, overrides: [], review: null }, earlier: [], conditions: [] } }, log: [] };
  // Opened on a second device: this page never submitted it, so it holds no submittedKey.
  const project = { stage: 'review', shared: { emergency: {}, designs: {} }, items: [item('After hours shutdowns', { requiredId: 'r1', check: { ...CHECK, partHashes: { ...HASHES } } })] };
  const panel = p.element('project-panel');
  p.go.render(panel, project, listHooks(p, sent));
  assert.doesNotMatch(panel.innerHTML, /Changed since you submitted it/);
  assert.doesNotMatch(panel.innerHTML, /data-go-submit="0"/, 'nothing new to submit');
  // A part changed and ticked again: changed, and Submit shows.
  project.items[0].check = { ...CHECK, partHashes: { ...HASHES, emergency: 'z' } };
  p.go.render(panel, project, listHooks(p, sent));
  assert.match(panel.innerHTML, /<b>Changed since you submitted it\.<\/b> Submit it again to send the new revision\./);
  assert.match(panel.innerHTML, /data-go-submit="0"/);
  // Checked again by someone else with nothing changed: the same revision, nothing to send.
  project.items[0].check = { ...CHECK, name: 'Ben Hollis', role: 'Foreman', partHashes: { ...HASHES } };
  p.go.render(panel, project, listHooks(p, sent));
  assert.doesNotMatch(panel.innerHTML, /Changed since you submitted it/);
});

test('a detail the builder set, changed for one SWMS, stays that SWMS\'s own (stuck point 4); site answers filled across are marked (blocker 2)', () => {
  const p = page({ people: PEOPLE });
  p.window.SiteWriteBuilderSet = require('../public/builder-set');
  const project = { stage: 'review', shared: { emergency: {}, designs: {}, site: { ground: 'Open trenches near building 5 during pit work.' } }, items: [
    item('Testing and commissioning', { requiredId: 'r1', pageOwn: { firstAidLocation: 'Site office first aid room' } }),
    item('After hours shutdowns', { requiredId: 'r2' }),
  ] };
  const panel = p.element('project-panel');
  p.go.render(panel, project, listHooks(p));
  assert.match(panel.innerHTML, /For this SWMS only, you changed a detail Bowerbird Creek Constructions set: first aid location\./);
  assert.equal((panel.innerHTML.match(/For this SWMS only/g) || []).length, 1, 'only on the SWMS it was changed in');
  const own = p.go.payloadFor(0);
  assert.equal(own.firstAidLocation, 'Site office first aid room');
  assert.equal(own.siteShared, true);
  const other = p.go.payloadFor(1);
  assert.notEqual(other.firstAidLocation, 'Site office first aid room');
  // A SWMS with its own site answers is not marked: they are its own.
  project.items[1].siteOwn = { ground: 'Open trench beside the switchroom.' };
  assert.equal(p.go.payloadFor(1).siteShared, undefined);
});
