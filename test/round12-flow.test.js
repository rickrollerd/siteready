// Messy test round 12 (18 October 2026, local), flow faults: a paid scope reading started on its own at sign-in
// after the scope box was cleared, an unticked step back after a reload or sign-in, fall, harness and trench
// answers filled across into SWMS whose work does not fit them, a half-typed own step lost on reload on the
// project page, "na" in a legal control's blank and a working platform read as Administrative, a step tick
// labelled "no", weak answers that print, the crane chart and ground skipped while a step was unticked, and
// "questions show once the state is set" after a reload with the state set. The on-screen faults are also
// run in a browser (scratchpad/flow13).
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { app } = require('../server');
const { prepareDraft, questionsFor, taskLine } = require('../draft');
const { draftBody } = require('../input');
const gate = require('../public/gate-rules');
const nameCase = require('../sitelink-answers');
const { validAbn } = require('../accounts');
const { setupAccounts, lastLinkToken, ANSWERED, ready, checked } = require('./helpers');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

let server;
let base;
test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

// ---- 1. A scope reading starts only from a scope still in the scope box, and only at sign-in ----

const SCOPE = 'Paint all internal plasterboard walls and ceilings in Building 4 in a 3 coat system.';
const READING = { id: 'r1', status: 'done', reading: { activities: [{ package: 'Painting', activity: 'Paint walls', type: 'Work', clause: '1', quotes: [SCOPE] }], packages: [], conflicts: [] }, checks: { passed: true } };

// The browser's store for a scope kept for sign-in (IndexedDB), as small as scope.js needs.
function fakeIndexedDb(kept = new Map()) {
  return {
    kept,
    open() {
      const request = {};
      setImmediate(() => {
        request.result = {
          createObjectStore() {},
          transaction() {
            const tx = {};
            const store = {
              put(value, key) { kept.set(key, JSON.parse(JSON.stringify(value))); return { result: undefined }; },
              get(key) { return { result: kept.has(key) ? JSON.parse(JSON.stringify(kept.get(key))) : undefined }; },
              delete(key) { kept.delete(key); return { result: undefined }; },
            };
            tx.objectStore = () => store;
            setImmediate(() => { if (tx.oncomplete) tx.oncomplete(); });
            return tx;
          },
        };
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    },
  };
}

function scopeServer({ signedIn = false } = {}) {
  let on = signedIn;
  return (method, route) => {
    if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
    if (route === '/api/auth/passkey/login/options') return { body: { options: { challenge: 'AA' }, challengeId: 'c1' } };
    if (route === '/api/auth/passkey/login' || route === '/api/auth/verify') { on = true; return { body: { token: 'token' } }; }
    if (route === '/api/me') return on ? { body: { user: { email: 'a@b.example', name: 'Sam', hasPasskey: true }, company: { name: 'Co', abn: '1', hasAccess: true, planStatus: 'active' } } } : { status: 401, body: {} };
    if (route === '/api/sites') return { body: { sites: [] } };
    if (route === '/api/swms') return { body: { swms: [] } };
    if (route === '/api/steps') return { body: { groups: [] } };
    if (route === '/api/scope/ai' && method === 'GET') return { body: { enabled: true } };
    if (route === '/api/scope/ai' && method === 'POST') return { body: READING };
    return { body: {} };
  };
}
function scopePage({ signedIn = false, kept = null, login = '' } = {}) {
  const store = new Map(kept ? [['scope', kept]] : []);
  const p = loadPage(['app.js', 'account.js', 'scope-task.js', 'scope-choice.js', 'scope.js'], scopeServer({ signedIn }), { stored: signedIn ? { 'sitewrite.session': 'token' } : {} });
  p.window.indexedDB = fakeIndexedDb(store);
  if (login) p.window.location.search = `?login=${login}`;
  return { ...p, store };
}
function faceId(p) {
  const buffer = () => new ArrayBuffer(1);
  p.window.navigator.credentials = { get: async () => ({ id: 'k', rawId: buffer(), type: 'public-key', response: { clientDataJSON: buffer(), authenticatorData: buffer(), signature: buffer(), userHandle: null }, getClientExtensionResults: () => ({}) }) };
  p.document.getElementById('faceid-signin').click();
}
const readings = (p) => p.calls.filter((call) => call.route === '/api/scope/ai' && call.method === 'POST');
const typeIn = (p, id, value) => { const box = p.document.getElementById(id); box.value = value; box.dispatchEvent(new FakeEvent('input', { bubbles: true })); };

test('a scope taken out of its box before sign-in is not read when the user signs in', async () => {
  // Run 5: the lines were pasted in the scope box and Find pressed signed out; the box was cleared and the lines
  // pasted in the Task box; signing in started a paid reading 2 s later.
  const p = scopePage();
  await settle();
  p.document.getElementById('scope-file').files = [];
  p.document.getElementById('scope-text').value = SCOPE;
  p.document.getElementById('scope-read').click();
  await settle();
  assert.equal(p.store.has('scope'), true, 'kept for sign-in');
  assert.match(p.document.getElementById('scope-results').innerHTML, /Once you are signed in, the reading starts on its own/);
  typeIn(p, 'scope-text', '');
  await settle();
  assert.equal(p.store.has('scope'), false, 'cleared box, nothing kept');
  assert.doesNotMatch(p.document.getElementById('scope-results').innerHTML, /reading starts on its own/, 'the promise goes with it');
  p.document.getElementById('task').value = SCOPE;
  faceId(p);
  await settle(40);
  assert.equal(readings(p).length, 0, 'no reading');
});

test('a scope kept for sign-in comes back in its box after a reload; read at sign-in only while it is still there', async () => {
  // Reloaded signed out: the words go back in the box, so it does not look empty.
  const still = scopePage({ kept: { text: SCOPE, state: 'sa' } });
  await settle(40);
  assert.equal(still.document.getElementById('scope-text').value, SCOPE);
  faceId(still);
  await settle(60);
  assert.equal(readings(still).length, 1);
  assert.equal(readings(still)[0].body.text, SCOPE);
  assert.equal(still.store.has('scope'), false, 'taken once read');
  // Cleared after the reload: nothing is read.
  const cleared = scopePage({ kept: { text: SCOPE, state: 'sa' } });
  await settle(40);
  typeIn(cleared, 'scope-text', '');
  await settle();
  faceId(cleared);
  await settle(60);
  assert.equal(readings(cleared).length, 0);
  // Changed: the words in the box are read, not the old ones.
  const changed = scopePage({ kept: { text: SCOPE, state: 'sa' } });
  await settle(40);
  typeIn(changed, 'scope-text', `${SCOPE} Paint the soffits.`);
  await settle();
  faceId(changed);
  await settle(60);
  assert.equal(readings(changed).length, 1);
  assert.equal(readings(changed)[0].body.text, `${SCOPE} Paint the soffits.`);
});

test('the sign-in link in a new tab reads the scope kept in the box; a reload or Back while signed in reads nothing new', async () => {
  // The email link opens the page again with ?login=: the scope kept is put back in the box and read.
  const linked = scopePage({ kept: { text: SCOPE, state: 'sa' }, login: 'abc' });
  await settle(60);
  assert.equal(readings(linked).length, 1);
  assert.equal(linked.document.getElementById('scope-text').value, SCOPE);
  // Opened again already signed in (a reload or Back): the scope waits in its box for Find.
  const reloaded = scopePage({ signedIn: true, kept: { text: SCOPE, state: 'sa' } });
  await settle(60);
  assert.equal(readings(reloaded).length, 0, 'no reading on a reload');
  assert.equal(reloaded.document.getElementById('scope-text').value, SCOPE);
  assert.match(reloaded.document.getElementById('scope-results').innerHTML, /Press "Find the tasks that need a SWMS" to read it/);
  reloaded.document.getElementById('scope-file').files = [];
  reloaded.document.getElementById('scope-read').click();
  await settle(40);
  assert.equal(readings(reloaded).length, 1, 'read when Find is pressed');
  assert.equal(reloaded.store.has('scope'), false, 'and no longer kept for a later sign-in');
  // A file kept for sign-in, opened again signed in: named under the file box, and Find reads it.
  const file = scopePage({ signedIn: true, kept: { file: { name: 'scope.pdf', data: 'AAAA' }, state: 'sa' } });
  await settle(60);
  assert.equal(readings(file).length, 0);
  assert.match(file.document.getElementById('scope-drop-note').textContent, /scope\.pdf is kept on this device\. Press "Find the tasks that need a SWMS" to read it\./);
  file.document.getElementById('scope-file').files = [];
  file.document.getElementById('scope-read').click();
  await settle(40);
  assert.equal(readings(file).length, 1);
  assert.deepEqual(readings(file)[0].body.file, { name: 'scope.pdf', data: 'AAAA' });
});

// ---- 2. A step unticked by hand stays unticked after a reload or sign-in ----

test('the steps unticked by hand are kept with the work on the device and on the server', async () => {
  // B run 8: "Work with the crane crew during lifts" came back after a reload. A run 2: "Move membrane rolls"
  // came back after sign-in ("Your work is back as you left it").
  const TASK = 'Mill and resheet 400 m of Lee Point Road with 50 mm AC14 asphalt, profiler, paver, rollers and tippers.';
  const stored = { at: Date.now() - 60 * 1000, stage: 'facts', input: { state: 'nt', task: TASK, fallRisk: 'no', crane: 'none', kindsOff: ['craneCrew'], facts: {}, site: {} }, editing: null };
  const respond = (method, route) => {
    if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
    if (route === '/api/states') return { body: { states: [{ id: 'nt', name: 'Northern Territory', loaded: true, versionLabel: 'current' }] } };
    if (route === '/api/me') return { status: 401, body: {} };
    if (route === '/api/steps') return { body: { groups: [] } };
    if (route === '/api/draft/questions') return { body: { required: [], steps: { chosen: [] } } };
    return { body: {} };
  };
  const p = loadPage(['app.js', 'account.js'], respond, { stored: { 'sitewrite.unsaved': JSON.stringify(stored) } });
  p.document.stateTicked = 'nt';
  await settle(40);
  const asked = p.calls.filter((call) => call.route === '/api/draft/questions');
  assert.ok(asked.length >= 1, 'the questions are asked again');
  assert.deepEqual(asked[asked.length - 1].body.kindsOff, ['craneCrew'], 'the untick comes back with the work');
  // On the server: the input saved keeps the unticks beside the picks, so a saved SWMS opened again keeps them.
  const input = draftBody({ state: 'nt', task: TASK, crane: 'none', kindsOff: ['roadPlant'] });
  assert.deepEqual(input.kindsOff, ['roadPlant']);
  assert.ok(Array.isArray(input.kinds) && !input.kinds.includes('roadPlant'));
  assert.deepEqual(draftBody({ state: 'nt', task: TASK, kinds: ['asphalt'], kindsOff: ['roadPlant'] }).kindsOff, ['roadPlant']);
  // The page sends them whether or not it has picks of its own, and brings them back from a saved input.
  const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(APP, /kindsOff: stepsOff\.size \? \[\.\.\.stepsOff\] : undefined/);
  assert.match(APP, /stepsOff = new Set\(Array\.isArray\(input\.kindsOff\)/);
});

// ---- 3. Fall, harness and trench answers fill across only where they fit ----

test('a fall control, harness or trench answer fills another SWMS only where its own work fits it', () => {
  // A run 1: "Connections are made from boom lifts ... No one climbs the steel" went from Steel into Access
  // equipment. A run 3: "No harness is used. Trenches deeper than 1.5 m are shielded" went into three SWMS.
  const BOOM = 'Connections are made from boom lifts with harnesses clipped in the basket. No one climbs the steel.';
  const TRENCH = 'No harness is used. Trenches deeper than 1.5 m are shielded with trench boxes before anyone goes in.';
  assert.equal(gate.workFits(BOOM, 'Structural steel\nErect and connect steel from boom lifts.'), true);
  assert.equal(gate.workFits(BOOM, 'Access equipment\nMobile scaffolds, trestles and ladders for the fit-out.'), false);
  assert.equal(gate.workFits(TRENCH, 'In-ground fire services\nExcavate and lay the in-ground fire mains.'), true);
  for (const words of ['Testing and commissioning\nTest and commission the fire systems.', 'Sprinkler and hydrant pipework at height', 'Penetrations and core drilling']) assert.equal(gate.workFits(TRENCH, words), false, words);
  // An answer that names none of these, or says one is not used, goes anywhere.
  assert.equal(gate.workFits('Edge protection is installed at every open edge before work starts.', 'Anything'), true);
  assert.equal(gate.workFits('No EWP is used. All work is from the ground.', 'Anything'), true);
  // The energised testing choice too (messy round 15, SiteLink blocker 3).
  assert.deepEqual(gate.ACROSS_WORK_IDS, ['fallControl', 'fallAccess', 'controlsConsidered', 'harnessSystem', 'trenchSupport', 'energisedWork']);
});

const GO = fs.readFileSync(path.join(__dirname, '..', 'public', 'project-go.js'), 'utf8');
// The one-go project page in a small stand-in for the browser (as round11-flow.test.js), with each SWMS asked
// the questions given and the state ticked or not.
function goPage({ required = [], state = 'vic', restoring = null } = {}) {
  const els = new Map();
  const listeners = { input: [], change: [], click: [] };
  const element = (id) => {
    if (!els.has(id)) els.set(id, { id, value: '', innerHTML: '', textContent: '', hidden: false, dataset: {}, tagName: /^go-\d+-/.test(id) ? 'TEXTAREA' : 'DIV', classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, focus() {}, scrollIntoView() {}, closest: () => null, parentElement: null, insertAdjacentHTML(_where, html) { this.innerHTML += html; }, remove() {} });
    return els.get(id);
  };
  const ticked = { state };
  const document = { getElementById: element, querySelector: (selector) => (selector === 'input[name="state"]:checked' ? (ticked.state ? { value: ticked.state } : null) : null), querySelectorAll: () => [], addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); }, activeElement: null };
  const S = { api: (route) => route, esc: (value) => String(value == null ? '' : value).replace(/"/g, '&quot;'), payload: () => ({ state: ticked.state || '' }), confirmBlock: () => '', canDownload: () => true, signedIn: () => true, getProfile: () => ({ name: 'Co', abn: '33102417000' }) };
  if (restoring) Object.assign(S, restoring);
  const window = { SiteWrite: S };
  const asks = [];
  const fetch = async (route, options) => { if (route === '/api/draft/questions') asks.push(JSON.parse(options.body)); return { ok: true, json: async () => (route === '/api/draft/questions' ? { required, weak: [] } : {}) }; };
  const context = vm.createContext({ window, document, fetch, setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0), console, globalThis: null });
  context.globalThis = context;
  for (const file of ['design-fill.js', 'substance-rules.js', 'gate-rules.js', 'scope-task.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', file), 'utf8'), context);
  window.SiteWriteDesignFill = context.SiteWriteDesignFill;
  vm.runInContext(GO, context);
  const saved = [];
  const hooks = { save() { saved.push(1); }, render() {}, statusOf: () => 'needs' };
  const fire = (type, target) => {
    const node = { dataset: {}, tagName: 'INPUT', value: '', insertAdjacentHTML(_where, html) { element(`after-${this.id || 'button'}`).innerHTML += html; }, ...target };
    node.closest = (selector) => (selector === '#project-panel' ? {} : String(selector).split(',').some((part) => { const m = /\[data-([a-z-]+)\]|#([\w-]+)/.exec(part.trim()); return m && (m[2] ? node.id === m[2] : node.attrs && node.attrs.includes(m[1])); }) ? node : null);
    for (const fn of listeners[type] || []) fn({ target: node });
  };
  return { element, fire, go: window.SiteWriteProjectGo, hooks, ticked, asks, saved };
}
const wait = (ms = 900) => new Promise((resolve) => { setTimeout(resolve, ms); });

test('on the project page, a boom lift fall control is not filled into a SWMS with no boom lift, and comes back out as it is typed', async () => {
  const p = goPage({ required: [{ id: 'fallControl', label: 'Fall control', prompt: 'How a fall is prevented.' }] });
  const project = { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [
    { title: 'Structural steel', task: 'Erect and connect structural steel, bolt the connections from boom lifts.', fallRisk: 'yes', status: 'todo', body: null },
    { title: 'Access equipment', task: 'Use mobile scaffolds, trestles and ladders for access.', fallRisk: 'yes', status: 'todo', body: null },
    { title: 'Roof sheeting', task: 'Fix the roof sheets and flashings at the roof edge.', fallRisk: 'yes', status: 'todo', body: null },
  ] };
  p.go.render(p.element('project-panel'), project, p.hooks);
  await wait(100);
  // As typed: the first words fit anywhere and fill across; once "boom lifts" is typed, the answer is taken
  // back out of the SWMS whose work has no boom lift.
  p.fire('input', { dataset: { goFact: '0', q: 'fallControl' }, tagName: 'TEXTAREA', value: 'Connections are made from' });
  assert.equal(project.items[1].facts.fallControl, 'Connections are made from');
  p.fire('input', { dataset: { goFact: '0', q: 'fallControl' }, tagName: 'TEXTAREA', value: 'Connections are made from boom lifts. No one climbs the steel.' });
  assert.equal(project.items[1].facts.fallControl, '', 'taken back out of Access equipment');
  assert.equal((project.items[1].filledFrom || {}).fallControl, undefined);
  assert.equal(project.items[2].facts.fallControl, '', 'and out of Roof sheeting');
  // An answer that fits every SWMS fills all.
  p.fire('input', { dataset: { goFact: '0', q: 'fallControl' }, tagName: 'TEXTAREA', value: 'Edge protection at every open edge before work starts.' });
  assert.equal(project.items[1].facts.fallControl, 'Edge protection at every open edge before work starts.');
  assert.equal(project.items[1].filledFrom.fallControl, 0);
  // A trench answer reaches only a SWMS whose work names a trench or excavation.
  const t = goPage({ required: [{ id: 'fallControl', label: 'Fall control', prompt: 'How a fall is prevented.' }] });
  const fire = { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [
    { title: 'In-ground and under-slab fire services', task: 'Excavate trenches and lay the in-ground fire mains.', fallRisk: 'yes', status: 'todo', body: null },
    { title: 'Testing and commissioning', task: 'Test and commission all fire systems.', fallRisk: 'yes', status: 'todo', body: null },
    { title: 'Pits', task: 'Excavate and install the valve pits.', fallRisk: 'yes', status: 'todo', body: null },
  ] };
  t.go.render(t.element('project-panel'), fire, t.hooks);
  await wait(100);
  t.fire('input', { dataset: { goFact: '0', q: 'fallControl' }, tagName: 'TEXTAREA', value: 'No harness is used. Trenches deeper than 1.5 m are shielded with trench boxes.' });
  assert.equal((fire.items[1].facts || {}).fallControl || '', '', 'not into Testing');
  assert.equal(fire.items[2].facts.fallControl, 'No harness is used. Trenches deeper than 1.5 m are shielded with trench boxes.', 'into the pits SWMS');
});

// ---- 4. A half-typed own step on the project page survives a reload ----

test('a step of your own half typed on the project page comes back as typed after a reload', async () => {
  const p = goPage({ required: [] });
  const project = { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [{ title: 'Access equipment', task: 'Use trestles as working platforms.', fallRisk: 'yes', status: 'todo', body: null }] };
  p.go.render(p.element('project-panel'), project, p.hooks);
  await wait(100);
  p.fire('click', { dataset: { goOwnWrite: '0', part: '' }, attrs: ['go-own-write'], id: 'write-0' });
  assert.match(p.element('after-write-0').innerHTML, /id="go-own-form-0"/);
  assert.ok(project.ownForm, 'kept as soon as it opens');
  // Half typed: kept with the project as it is typed.
  p.element('go-own-name-0').value = 'Work from trestle platf';
  p.element('go-own-hazards-0').value = 'A fall from the trestle';
  p.fire('input', { id: 'go-own-name-0', tagName: 'INPUT', value: 'Work from trestle platf' });
  assert.equal(project.ownForm.name, 'Work from trestle platf');
  assert.equal(project.ownForm.hazards, 'A fall from the trestle');
  // The page opened again with the project kept on the device: the form is drawn again, as typed.
  const again = goPage({ required: [] });
  const kept = JSON.parse(JSON.stringify(project));
  again.go.render(again.element('project-panel'), kept, again.hooks);
  await wait(100);
  const drawn = again.element('go-cover-0').innerHTML + again.element('go-body-0').innerHTML;
  assert.match(drawn, /id="go-own-form-0"/);
  assert.match(drawn, /value="Work from trestle platf"/);
  assert.match(drawn, />A fall from the trestle<\/textarea>/);
  // Saved or cancelled, it is no longer kept.
  again.fire('click', { dataset: { goOwnCancel: '0' }, attrs: ['go-own-cancel'] });
  assert.equal(kept.ownForm, undefined);
});

// ---- 5. Placeholders in blanks, and misspelt platform words ----

const PAINT = 'Paint all internal plasterboard walls and ceilings in Building 4. Paint the external cladding, soffits and fascia linings of Building 4.';
const PAINT_SDS = { safetyDataSheet: 'Water based acrylic paint: SDS on site, nitrile gloves and safety glasses, lids back on after use.' };
test('a misspelt scaffold, platform or EWP is read as the working platform it is, and "na" does not fill a blank', () => {
  // B run 5: "mobile scafold with rails ..." read as Administrative, which printed "Edge protection, a working
  // platform or an EWP was considered first ... not reasonably practicable for this work because na."
  for (const fallControl of ['mobile scafold with rails for the soffits n fascia on bldg 4, platform ladders inside', 'work from the e.w.p with the gate shut', 'from the scaffolding platfrom with handrails']) {
    const draft = prepareDraft(draftBody(ready({ ...ANSWERED, state: 'sa', fallRisk: 'yes', residential: 'no', crane: 'none', task: PAINT, facts: { fallControl, ...PAINT_SDS } })));
    assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
    const lines = draft.controls.filter((item) => /\bbecause\b|scaf|e\.w\.p|platf/i.test(item.text));
    assert.ok(!lines.some((item) => /not reasonably practicable/.test(item.text)), fallControl);
    const line = lines.find((item) => item.text.toLowerCase().startsWith(fallControl.slice(0, 12)));
    assert.equal(line.level, 'Isolate or engineer', fallControl);
    assert.match(line.text, /^[A-Z]/, 'with a capital');
  }
  // A harness alone is still PPE, with the line asking why nothing higher is used.
  const harness = prepareDraft(draftBody(ready({ ...ANSWERED, state: 'sa', fallRisk: 'yes', residential: 'no', crane: 'none', task: PAINT, facts: { fallControl: 'harness clipped to the roof anchor', harnessSystem: 'Full body harness, inspected 3 monthly, anchors rated 15 kN by the installer.', ...PAINT_SDS } })));
  assert.ok(harness.controls.some((item) => /not reasonably practicable for this work because ____/.test(item.text)));
  // The blank: "na" and the like are refused, a reason is taken.
  const rule = { line: 'Edge protection, a working platform or an EWP was considered first for any fall of more than 2 metres, and is not reasonably practicable for this work because ____.', ask: 'Fill in the blank.' };
  for (const typed of ['na', 'n/a', 'N.A.', 'none', '-', 'no', 'nil']) assert.match(gate.answerNeed(rule, [typed]), /is not an answer|is not an answer yet/, typed);
  assert.equal(gate.answerNeed(rule, ['the soffit is over a glass roof that cannot take a scaffold or EWP']), '');
});

// ---- 6. No step tick labelled "no" ----

test('only the Job steps list gives the steps picked, and a step the library does not hold is not listed', async () => {
  // Run 3: unticking "Install the fire detection and alarm system" picked up the scope review's "No, leave it out"
  // tick (also data-step), and a tick labelled "no" showed in its place.
  const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.doesNotMatch(APP, /querySelectorAll\('\[data-step\]:checked'\)/);
  assert.match(APP, /querySelectorAll\('#steps-block input\[data-step\]:checked'\)/);
  const respond = (method, route) => {
    if (route === '/api/config') return { body: { accounts: false } };
    if (route === '/api/states') return { body: { states: [{ id: 'qld', name: 'Queensland', loaded: true, versionLabel: 'current' }] } };
    if (route === '/api/steps') return { body: { groups: [{ trade: 'Fire', kinds: [{ id: 'fireLive', label: 'Work on live fire systems', steps: ['Work on live fire systems'] }, { id: 'fireAlarm', label: 'Install the fire detection and alarm system', steps: ['Install the fire detection and alarm system'] }] }] } };
    return { body: {} };
  };
  const p = loadPage(['app.js'], respond);
  await settle(20);
  await p.run('loadStepLibrary ? loadStepLibrary() : null');
  await settle(20);
  p.run('stepsOff.add("fireAlarm"); renderSteps({ suggested: ["fireLive", "no"], chosen: ["fireLive"] })');
  const list = p.document.getElementById('steps-block').innerHTML;
  assert.match(list, /value="fireLive" checked/);
  assert.doesNotMatch(list, /value="no"/, 'no tick for an id the library does not hold');
  assert.match(list, /value="fireAlarm">.*Install the fire detection and alarm system/, 'the step unticked by hand stays in the list, unticked');
});

// ---- 7. Weak answers that print ----

test('weak answers are queried, and answers print with their capitals', () => {
  // First aiders: a crew role, and the box's own words.
  assert.match(gate.fieldWeak('firstAider', 'the dogman'), /is a role, not a person/);
  assert.match(gate.fieldWeak('firstAider', 'first aider on site'), /does not name a first aider/);
  assert.equal(gate.fieldWeak('firstAider', 'Main contractor\'s site first aider'), '');
  // Printed: a role run into the name is split off, and "the builders first aider" reads as a role.
  assert.equal(nameCase.tidyPersonRole('tara nguyen hse'), 'Tara Nguyen, HSE');
  assert.equal(nameCase.tidyPersonRole('mel tran leading hand'), 'Mel Tran, Leading hand');
  assert.equal(nameCase.tidyPersonRole('the builders first aider'), 'The builder\'s first aider');
  assert.equal(nameCase.tidyPersonRole('kev'), 'Kev');
  // Typed with capitals, the role is split off too, the capitals kept (messy round 13, B run 7: "Mick Tanner foreman").
  assert.equal(nameCase.tidyPersonRole('Tara Nguyen HSE'), 'Tara Nguyen, HSE', 'capitals typed are kept');
  // The scaffold supervisor prints with capitals.
  const roof = prepareDraft(draftBody(ready({ ...ANSWERED, state: 'vic', fallRisk: 'yes', residential: 'no', crane: 'none', task: 'Erect the perimeter scaffold, then fix the roof sheets.', scaffoldSupervisor: 'dave, westside scaffolding supervisor', facts: { fallControl: 'Guardrails on the scaffold and edge protection on the roof.', scaffoldType: 'modular' } })));
  assert.equal(roof.scaffoldSupervisor, 'Dave, Westside scaffolding supervisor');
  // Other trades: SiteWrite's own scope chip names no trade; ground and access: one word or a gate.
  assert.match(gate.answerNeed({ ask: gate.SITE_NEED.otherTrades, name: 'Other trades', none: true, kind: gate.SITE_KIND.otherTrades }, 'Coordination with preceding and following trades.'), /does not say which trades/);
  assert.equal(gate.answerNeed({ ask: gate.SITE_NEED.otherTrades, name: 'Other trades', none: true, kind: 'trades' }, 'electricians and plumbers on level 2'), '');
  assert.equal(gate.answerNeed({ ask: gate.SITE_NEED.otherTrades, name: 'Other trades', none: true, kind: 'trades' }, 'None'), '');
  assert.match(gate.answerNeed({ ask: gate.SITE_NEED.ground, name: 'Ground', none: true, kind: gate.SITE_KIND.ground }, 'slab'), /does not say what the ground or deck is like/);
  assert.equal(gate.answerNeed({ ask: gate.SITE_NEED.ground, name: 'Ground', none: true, kind: 'ground' }, 'concrete yard'), '');
  assert.match(gate.answerNeed({ ask: gate.SITE_NEED.access, name: 'Access', kind: gate.SITE_KIND.access }, 'site gate'), /does not say how the crew gets to the work/);
  assert.equal(gate.answerNeed({ ask: gate.SITE_NEED.access, name: 'Access', kind: 'access' }, 'scaffold stair'), '');
  // The checker's role is not a place.
  assert.match(gate.checkerRoleNeed('office'), /is a place, not a role/);
  assert.equal(gate.checkerRoleNeed('Admin'), '');
  assert.equal(gate.checkerRoleNeed('Office manager'), '');
  // The task line is not cut short at "or" when a pointer to the maker's specifications comes off it.
  assert.equal(taskLine('Paint the tops and bottoms of doors to receive 3 coats minimum or as per door manufacturers specifications.'), 'Paint the tops and bottoms of doors to receive 3 coats minimum.');
  assert.equal(taskLine('Paint the doors, 3 coats minimum or as per door manufacturers specifications'), 'Paint the doors, 3 coats minimum');
  // Answers printed as controls start with a capital.
  const crane = prepareDraft(draftBody(ready({ ...ANSWERED, state: 'vic', fallRisk: 'no', residential: 'no', crane: 'own', task: 'Unload the roof sheets with our hiab and lift them to the roof.', facts: { craneChart: 'hiab chart 1.2t at 8m', groundBearing: 'the builders site manager checked the yard slab for the hiab, we use 600mm outrigger pads', harnessSystem: 'No harness is used. The sheets are landed on the roof from the ground.' } })));
  const printed = crane.jobSteps.flatMap((step) => step.controls);
  assert.ok(printed.includes('Hiab chart 1.2t at 8m.'), printed.filter((line) => /hiab/i.test(line)).join(' | '));
});

test('the server refuses a site answer that says too little and a place as the checker\'s role', async () => {
  const { downloadGaps } = require('../download-gate');
  const input = draftBody(ready({ ...ANSWERED, state: 'qld', fallRisk: 'no', residential: 'no', crane: 'none', task: 'Replace a 3m length of timber fence.', site: { ...ANSWERED.site, ground: 'slab', access: 'site gate', otherTrades: 'Coordination with preceding and following trades.' } }));
  const gaps = downloadGaps(input, prepareDraft(input));
  for (const id of ['site.ground', 'site.access', 'site.otherTrades']) assert.ok(gaps.some((gap) => gap.id === id), id);
  // The checker's role: "office" is refused by the server too.
  let seed = 0;
  const abn = () => { for (;;) { seed += 1; const digits = crypto.createHash('sha256').update(`r12f-${seed}`).digest('hex').replace(/\D/g, '').slice(0, 11); if (digits.length === 11 && digits[0] !== '0' && validAbn(digits)) return digits; } };
  const call = (method, route, { body, token } = {}) => fetch(`${base}${route}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  await call('POST', '/api/auth/email', { body: { email: 'role@r12.example' } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken('role@r12.example') } })).json();
  assert.equal((await call('PUT', '/api/company', { token, body: { name: 'R12 Role Pty Ltd', abn: abn() } })).status, 200);
  const FENCE = ready({ ...ANSWERED, state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no', crane: 'none' });
  const refused = await call('POST', '/api/draft.docx', { token, body: checked({ ...FENCE }, null, { name: 'Tanya Russo', role: 'office' }) });
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).message, /"office" is a place, not a role/);
  assert.equal((await call('POST', '/api/draft.docx', { token, body: checked({ ...FENCE }, null, { name: 'Tanya Russo', role: 'Office manager' }) })).status, 200);
});

// ---- 8. The crane chart and ground, asked the same way with a step unticked ----

test('with our own hiab, the crane chart and ground are asked while its step is ticked, whatever else is unticked', () => {
  // A run 2: "Move membrane rolls" unticked in the signed-out preview took the crane chart and ground questions
  // away; after sign-in (the untick lost) they were asked.
  const TASK = 'reroof the warehouse, strip old corugated iron n replace with new colorbond trimdek sheets n flashings, new box gutter with torch on membrane, roof is about 7m high. scafold round the edge is by the builder. we use our hiab to lift the sheets up';
  const asked = (extra) => questionsFor(draftBody({ state: 'vic', fallRisk: 'yes', crane: 'own', task: TASK, ...extra })).required.map((item) => item.id);
  const all = questionsFor(draftBody({ state: 'vic', fallRisk: 'yes', crane: 'own', task: TASK })).steps.chosen;
  assert.ok(all.includes('loaderCrane') && all.includes('wpRolls'));
  for (const extra of [{}, { kinds: all.filter((id) => id !== 'wpRolls') }, { kindsOff: ['wpRolls'] }]) {
    const ids = asked(extra);
    assert.ok(ids.includes('craneChart') && ids.includes('groundBearing'), JSON.stringify(extra));
  }
  // With the hiab's own step unticked, they are not.
  const none = asked({ kinds: all.filter((id) => id !== 'loaderCrane') });
  assert.ok(!none.includes('craneChart') && !none.includes('groundBearing'));
});

// ---- 9. No "state is not set" while the state is still coming back ----

test('after a reload, the project page waits for the state it brings back before saying the state is not set', async () => {
  let done;
  const restored = new Promise((resolve) => { done = resolve; });
  let restoring = true;
  const p = goPage({ required: [], state: '', restoring: { restoring: () => restoring, restored } });
  const project = { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [{ title: 'Painting', task: 'Paint the walls.', fallRisk: 'no', status: 'todo', body: null }] };
  p.go.render(p.element('project-panel'), project, p.hooks);
  await wait(50);
  const drawn = () => p.element('go-body-0').innerHTML + p.element('project-panel').innerHTML;
  assert.doesNotMatch(drawn(), /questions show once the state is set/);
  assert.equal(p.asks.length, 0);
  // The work comes back with its state: the questions are asked, with no note on the way.
  p.ticked.state = 'sa';
  restoring = false;
  done();
  await wait(50);
  assert.equal(p.asks.length, 1);
  assert.doesNotMatch(drawn(), /questions show once the state is set/);
  // With no state to come back, the page says so as before.
  const empty = goPage({ required: [], state: '' });
  empty.go.render(empty.element('project-panel'), { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [{ title: 'Painting', task: 'Paint the walls.', fallRisk: 'no', status: 'todo', body: null }] }, empty.hooks);
  await wait(50);
  assert.match(empty.element('go-body-0').innerHTML, /questions show once the state is set/);
  // The state is then set, and the page stops waiting.
  empty.ticked.state = 'sa';
  await wait(700);
  assert.equal(empty.asks.length, 1);
});
