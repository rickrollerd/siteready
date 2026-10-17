// Messy round 11, SiteLink: the one-go page of a builder's list (public/project-go.js), run in the same
// small stand-in for the browser as test/sitelink-round9-page.test.js. Made-up names only.
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

const PEOPLE = { workplace: '25 Grenfell St, Kent Town SA 5067', principal: 'Quokka Ridge Constructions Pty Ltd', 'compliance-responsible': 'S', reviewer: 'S', 'works-manager': 'W', 'works-manager-phone': '0412 345 678' };
const SITE = {
  liveServices: 'Live water main in the street.',
  publicInterface: 'Public footpath on Grenfell St.',
  otherTrades: 'Electricians nearby.',
  ground: 'Open trench along the entry road, about 1.8 m deep, shored.',
  access: 'Stairs and the builders hoist. Scissor lift on the slab.',
};
const ROOF_ACCESS = "Roof access by the builder's scaffold stair tower. Materials lifted by the builder's crane.";
const body = (title, site) => ({ task: `${title} work.`, state: 'sa', site: { ...site } });
const prepared = (title, extra = {}) => ({ title, task: `${title} work.`, fallRisk: 'no', kind: 'draft', status: 'ready', needs: [], body: body(title, SITE), ...extra });

test('a SWMS that changed one site answer keeps following the shared answers it has not changed (smaller fault)', async () => {
  const p = page({ people: PEOPLE });
  const project = { stage: 'questions', shared: { emergency: {}, designs: {}, site: { ...SITE } }, items: [
    prepared('In-ground drainage'),
    prepared('Roof works', { siteOwn: { ...SITE, access: ROOF_ACCESS }, body: body('Roof works', { ...SITE, access: ROOF_ACCESS }) }),
  ] };
  const panel = p.element('project-panel');
  const hooks = { ...p.hooks, render: () => p.go.render(panel, project, hooks) };
  p.go.render(panel, project, hooks);
  // The shared Other trades answer changes: Roof works takes it, and keeps its own Access answer.
  p.fire('input', { dataset: { goSharedSite: '', siteId: 'otherTrades' }, value: 'Electricians, civil crew, ceiling fixers and the roofer working nearby.' });
  await settle();
  assert.equal(project.items[1].siteOwn.otherTrades, 'Electricians, civil crew, ceiling fixers and the roofer working nearby.');
  assert.equal(project.items[1].siteOwn.access, ROOF_ACCESS);
  assert.ok(project.items[1].stale, 'Roof works is prepared again with it');
  // What it sends: its own Access answer, and the four others still as the project gave them.
  const sent = p.go.payloadFor(1);
  assert.equal(sent.site.otherTrades, 'Electricians, civil crew, ceiling fixers and the roofer working nearby.');
  assert.equal(JSON.stringify(sent.siteShared), JSON.stringify(['liveServices', 'publicInterface', 'otherTrades', 'ground']));
  // The SWMS with no answers of its own sends them all as shared (no change at all).
  assert.equal(p.go.payloadFor(0).siteShared, true);
  // An answer Roof works changed for itself does not follow the shared one.
  p.fire('input', { dataset: { goSharedSite: '', siteId: 'access' }, value: 'Stairs only.' });
  await settle();
  assert.equal(project.items[1].siteOwn.access, ROOF_ACCESS);
  assert.equal(JSON.stringify(p.go.payloadFor(1).siteShared), JSON.stringify(['liveServices', 'publicInterface', 'otherTrades', 'ground']));
});
