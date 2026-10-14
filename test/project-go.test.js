// The one-go project page and its review list (public/project-go.js; owner D239, D240, D278), run in a
// small stand-in for the browser: elements by id, with the HTML the page writes kept as text, and the
// page's own event handlers called with stand-in events. There is no jsdom in this project, and the
// shared fake-dom.js finds elements by id only, which this page needs more than.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'project-go.js'), 'utf8');
const FILL = fs.readFileSync(path.join(__dirname, '..', 'public', 'design-fill.js'), 'utf8');
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

const item = (title, extra = {}) => ({ title, task: `${title} work.`, fallRisk: 'yes', kind: 'draft', status: 'ready', needs: [], checked: true, body: { task: `${title} work.`, state: 'qld', workplace: '1 A St, Brisbane QLD 4000', principalContractor: 'B', company: 'Co' }, ...extra });
const PEOPLE = { workplace: '1 A St, Brisbane QLD 4000', principal: 'B', 'compliance-responsible': 'S', reviewer: 'S', 'first-aider': 'J', 'muster-point': 'Gate' };

test('with some SWMS not ready, the ready ones download, and each one not ready is named with what it needs (D278)', () => {
  const p = page({ people: PEOPLE });
  const project = { stage: 'review', shared: { emergency: {}, designs: {} }, items: [item('Formwork'), item('Reinforcement', { status: 'needs', needs: ['Plant and equipment', 'Emergency, work at height: Rescue'] }), item('Edge protection')] };
  const panel = p.element('project-panel');
  p.go.render(panel, project, p.hooks);
  const html = panel.innerHTML;
  assert.match(html, /<button type="button" id="project-zip">Download the 2 ready SWMS \(Word and PDF, one zip\)<\/button>/);
  assert.match(html, /<div class="note" id="go-not-ready"><p>2 of 3 SWMS are ready\. You can download them now, and the rest once they are ready\. Not ready yet:<\/p><ul>/);
  assert.match(html, /<li>SWMS 2 \(Reinforcement\): give plant and equipment; emergency, work at height: Rescue\. <button type="button" class="link" data-project-open="1">Go to it<\/button><\/li>/);
  // Downloaded: the note says how many, and still names the one not ready.
  project.lastDownload = { at: '2026-10-14T00:00:00Z', count: 2, total: 3 };
  p.go.render(panel, project, p.hooks);
  assert.match(panel.innerHTML, /<strong>Downloaded 2 of 3 SWMS<\/strong>, each saved under My SWMS as its own SWMS and revision\. Not ready yet:/);
  assert.match(panel.innerHTML, /SWMS 2 \(Reinforcement\): give plant and equipment/);
  assert.match(panel.innerHTML, /Download again once it is ready: the zip then has every ready SWMS\. One you have not changed keeps its revision\./);
  // All ready: one button for all of them.
  project.items[1] = item('Reinforcement');
  p.go.render(panel, project, p.hooks);
  assert.match(panel.innerHTML, />Download all 3 SWMS \(Word and PDF, one zip\)<\/button>/);
  assert.match(panel.innerHTML, /Every SWMS is now ready: download again to get them all\./);
});

test('with none ready, the button is off and the list says what each needs', () => {
  const p = page({ people: PEOPLE });
  const project = { stage: 'review', shared: { emergency: {}, designs: {} }, items: [item('Formwork', { status: 'needs', needs: ['Load limits'], kind: 'stand-down' }), item('Reinforcement', { status: 'needs', needs: ['Plant and equipment'] })] };
  const panel = p.element('project-panel');
  p.go.render(panel, project, p.hooks);
  assert.match(panel.innerHTML, /<button type="button" id="project-zip" disabled>Download all 2 SWMS \(Word and PDF, one zip\)<\/button>/);
  assert.match(panel.innerHTML, /None of the SWMS is ready to download yet\. Each one in the list above says what it still needs\./);
  assert.match(panel.innerHTML, /Not finished: Load limits need more\./);
  assert.match(panel.innerHTML, /Before download, open it to give: Plant and equipment\./);
});

test('details every SWMS shares are asked for once above the list, including the company ABN', () => {
  const p = page({ people: { ...PEOPLE, 'first-aider': '' }, profile: { name: 'Co', abn: '' } });
  const project = { stage: 'review', shared: { emergency: {}, designs: {} }, items: [item('Formwork', { status: 'needs', needs: ['First aider', 'Plant and equipment'] })] };
  const panel = p.element('project-panel');
  p.go.render(panel, project, p.hooks);
  assert.match(panel.innerHTML, /For every SWMS, still to give:<\/strong><\/p><ul class="go-people"><li><button type="button" class="link" data-go-field="profile-abn">ABN<\/button><\/li><li><button type="button" class="link" data-go-field="first-aider">First aider<\/button><\/li>/);
  // The SWMS's own line leaves the shared details out.
  assert.match(panel.innerHTML, /Before download, open it to give: Plant and equipment\./);
});

test('the questions page asks each SWMS its questions, fills an answer across, and Prepare all prepares every SWMS', async () => {
  const p = page({
    people: PEOPLE,
    answer: (route) => {
      if (route === '/api/draft/questions') return { body: { required: [{ id: 'loadLimits', label: 'Load limits', prompt: 'The allowable loads.', suggestions: [] }], weak: [] } };
      if (route === '/api/draft') return { body: { kind: 'draft', gate: [{ kind: 'plant', label: 'Plant and equipment' }] } };
      return {};
    },
  });
  const project = { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [{ title: 'Formwork', task: 'Erect formwork.', fallRisk: 'yes', status: 'todo', body: null }, { title: 'Pour', task: 'Pour the slab.', fallRisk: 'yes', status: 'todo', body: null }] };
  const panel = p.element('project-panel');
  p.go.render(panel, project, p.hooks);
  assert.match(panel.innerHTML, /<button type="button" id="go-prepare">Prepare all 2 SWMS<\/button>/);
  assert.match(panel.innerHTML, /SWMS 1 of 2: Formwork/);
  await settle();
  assert.equal(p.calls.filter((call) => call.route === '/api/draft/questions').length, 2, 'each SWMS is asked its own questions');
  assert.match(p.element('go-body-0').innerHTML, /<textarea id="go-0-loadLimits" data-go-fact="0" data-q="loadLimits">/);
  // An answer given in SWMS 1 fills the same question in SWMS 2, marked so.
  p.element('go-1-loadLimits').tagName = 'TEXTAREA';
  p.fire('input', { dataset: { goFact: '0', q: 'loadLimits' }, value: '3 kPa on the deck', attrs: ['go-fact'] });
  assert.equal(project.items[0].facts.loadLimits, '3 kPa on the deck');
  assert.equal(project.items[1].facts.loadLimits, '3 kPa on the deck');
  assert.equal(project.items[1].filledFrom.loadLimits, 0);
  assert.equal(p.element('go-1-loadLimits').value, '3 kPa on the deck');
  assert.equal(p.element('go-1-loadLimits-across').textContent, 'Filled from SWMS 1. Change it here if this SWMS differs.');
  // Changed in SWMS 2, it is its own and no longer follows SWMS 1.
  p.fire('input', { dataset: { goFact: '1', q: 'loadLimits' }, value: '2 kPa', attrs: ['go-fact'] });
  p.fire('input', { dataset: { goFact: '0', q: 'loadLimits' }, value: '4 kPa', attrs: ['go-fact'] });
  assert.equal(project.items[1].facts.loadLimits, '2 kPa');
  // Prepare all: one draft for each, with the page's details and each SWMS's own answers, then the list.
  p.fire('click', { id: 'go-prepare', attrs: [] });
  await settle();
  const drafts = p.calls.filter((call) => call.route === '/api/draft');
  assert.equal(drafts.length, 2);
  assert.deepEqual(drafts.map((call) => [call.body.task, call.body.facts.loadLimits, call.body.workplace]), [['Erect formwork.', '4 kPa', PEOPLE.workplace], ['Pour the slab.', '2 kPa', PEOPLE.workplace]]);
  assert.equal(project.stage, 'review');
  assert.equal(JSON.stringify(project.items.map((entry) => entry.needs)), JSON.stringify([['Plant and equipment'], ['Plant and equipment']]));
  assert.ok(p.hooks.rendered >= 1);
});

test('a SWMS whose answers are too thin keeps the user on the questions page, with each named', async () => {
  const p = page({
    people: PEOPLE,
    answer: (route, body) => {
      if (route === '/api/draft/questions') return { body: { required: [], weak: [] } };
      if (route === '/api/draft') return { body: body.task === 'Erect formwork.' ? { kind: 'stand-down', missingHelp: [{ id: 'loadLimits', label: 'Load limits', state: 'vague', help: 'Give the allowable load.' }] } : { kind: 'draft', gate: [] } };
      return {};
    },
  });
  const project = { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [{ title: 'Formwork', task: 'Erect formwork.', fallRisk: 'yes', status: 'todo', body: null }, { title: 'Pour', task: 'Pour the slab.', fallRisk: 'yes', status: 'todo', body: null }] };
  const panel = p.element('project-panel');
  p.go.render(panel, project, p.hooks);
  await settle();
  p.fire('click', { id: 'go-prepare', attrs: [] });
  await settle();
  assert.equal(project.stage, 'questions');
  assert.match(p.element('go-status').innerHTML, /One SWMS is not finished\. The others are prepared\.<\/strong> These answers need more\. Each one says under its box what would do\.<\/p><ul><li>SWMS 1, Formwork: Load limits\. <button type="button" class="link" data-go-to-item="0">Go to it<\/button><\/li><\/ul>/);
});

test('once every SWMS is downloaded, the note says so and asks for nothing more', () => {
  const p = page({ people: PEOPLE });
  const project = { stage: 'review', shared: { emergency: {}, designs: {} }, items: [item('Formwork'), item('Edge protection')], lastDownload: { at: '2026-10-14T00:00:00Z', count: 2, total: 2 } };
  const panel = p.element('project-panel');
  p.go.render(panel, project, p.hooks);
  assert.match(panel.innerHTML, /<strong>Downloaded all 2 SWMS<\/strong>, each saved under My SWMS as its own SWMS and revision\.<\/p>/);
  assert.doesNotMatch(panel.innerHTML, /download again/);
});

test('with a crane company, who slings the loads is asked once for every SWMS, and Prepare waits for it (D258)', async () => {
  const p = page({
    people: PEOPLE,
    answer: (route) => {
      if (route === '/api/draft/questions') return { body: { required: [], weak: [] } };
      if (route === '/api/draft') return { body: { kind: 'draft', gate: [] } };
      return {};
    },
  });
  const project = { stage: 'questions', from: { crane: 'company', slinging: '' }, shared: { crane: 'company', emergency: {}, designs: {} }, items: [{ title: 'Formwork', task: 'Erect formwork.', fallRisk: 'yes', crane: 'company', status: 'todo', body: null }, { title: 'Cranage', task: 'Lift the formwork.', fallRisk: 'yes', crane: 'company', status: 'todo', body: null }] };
  const panel = p.element('project-panel');
  p.go.render(panel, project, p.hooks);
  assert.match(panel.innerHTML, /<fieldset class="field choice" id="go-slinging"><legend>Who slings the loads and directs the crane\?<\/legend><label><input type="radio" name="go-slinging" value="crane"> Crane company's dogman<\/label> <label><input type="radio" name="go-slinging" value="ours"> Our crew<\/label>/);
  await settle();
  p.fire('click', { id: 'go-prepare', attrs: [] });
  await settle();
  assert.equal(p.calls.filter((call) => call.route === '/api/draft').length, 0, 'nothing is prepared until it is answered');
  assert.equal(p.element('go-status').textContent, 'Say who slings the loads and directs the crane: the crane company\'s dogman, or our crew.');
  // Answered once, every SWMS gets it, on this page and when opened on its own.
  p.fire('change', { name: 'go-slinging', value: 'ours', attrs: [] });
  assert.deepEqual(project.items.map((entry) => entry.slinging), ['ours', 'ours']);
  p.fire('click', { id: 'go-prepare', attrs: [] });
  await settle();
  const drafts = p.calls.filter((call) => call.route === '/api/draft');
  assert.deepEqual(drafts.map((call) => [call.body.crane, call.body.slinging]), [['company', 'ours'], ['company', 'ours']]);
  // Back on the questions, no crane: the question goes, and no slinging answer is kept.
  project.stage = 'questions';
  p.fire('change', { name: 'go-crane', value: 'none', attrs: [] });
  assert.equal(p.element('go-slinging').hidden, true);
  assert.deepEqual(project.items.map((entry) => [entry.crane, entry.slinging]), [['none', ''], ['none', '']]);
});
