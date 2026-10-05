// The page keeps the user's changes while they work: a reopened SWMS saves as a revision of
// itself however many times it is prepared again, and a project SWMS opened again comes back
// with its changes. The page scripts run in a small stand-in for the browser (fake-dom.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

const DRAFT = {
  kind: 'draft', state: 'Queensland', task: 'Dig a trench.', highRisk: [], controls: [], site: [], ppe: [], references: [], sources: { legislation: [], codes: [] },
  jobSteps: [{ step: 'Excavate', hazards: ['Collapse.'], controls: ['Spoil is kept back from the edge.', 'Plant is inspected daily.'], responsible: 'Plant operator' }],
};
const EDITS = { Excavate: { removed: ['Plant is inspected daily.'], changed: [], added: [] } };

// A signed-in account with access, one saved SWMS, and the server's draft for any input.
function server(extra = () => null) {
  return (method, route, body) => {
    const own = extra(method, route, body);
    if (own) return own;
    if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
    if (route === '/api/me') return { body: { user: { email: 'a@b.example', name: 'Sam' }, company: { name: 'Co', abn: '1', hasAccess: true, planStatus: 'active' } } };
    if (route === '/api/sites') return { body: { sites: [] } };
    if (route === '/api/steps') return { body: { groups: [] } };
    if (route === '/api/draft') return { body: { ...DRAFT, controlLegal: [[]] } };
    if (route === '/api/draft/questions') return { body: { required: [], steps: { chosen: [] } } };
    if (/^\/api\/swms\/[\w-]+$/.test(route) && method === 'PUT') return { body: { swms: { id: route.split('/').pop(), title: 'Trench', revision: 2 } } };
    if (route === '/api/swms' && method === 'POST') return { status: 201, body: { swms: { id: 'new-one', title: 'Trench', revision: 1 } } };
    return { body: {} };
  };
}

const page = (respond, stored = {}) => loadPage(['app.js', 'account.js', 'scope.js'], respond, { stored: { 'siteready.session': 'token', ...stored } });

async function prepare(p) {
  p.document.getElementById('facts').dispatchEvent(new FakeEvent('submit'));
  await settle();
}

async function save(p) {
  p.document.getElementById('new-confirm').checked = true;
  p.document.getElementById('new-name').value = 'Sam Lee';
  p.document.getElementById('new-save').click();
  await settle();
}

test('a reopened SWMS saves as a revision of itself after a control is changed (bug A)', async () => {
  const p = page(server());
  await settle();
  // Change: the saved SWMS goes into the form, as the account script does.
  await p.window.SiteReady.fillForm({ state: 'qld', task: 'Dig a trench.', fallRisk: 'no' });
  p.window.SiteReady.editing = { id: 'saved-1', title: 'Trench' };
  await prepare(p);
  const actions = () => p.document.getElementById('result-actions').innerHTML;
  assert.match(actions(), />Save changes<\/button>/);
  assert.match(actions(), /Saving changes to "Trench" as its next revision/);
  // A control is removed: the draft is prepared again and the buttons are drawn again.
  p.run("applyLineEdit(shownDraft.jobSteps[0], 'Plant is inspected daily.', '')");
  await settle();
  assert.match(actions(), />Save changes<\/button>/, 'still saving changes to the same SWMS');
  await save(p);
  const saved = p.calls.filter((call) => call.route.startsWith('/api/swms') && ['POST', 'PUT'].includes(call.method));
  assert.deepEqual(saved.map((call) => `${call.method} ${call.route}`), ['PUT /api/swms/saved-1']);
  assert.deepEqual(saved[0].body.input.controlEdits, EDITS);
});

test('a new SWMS, once saved, saves its later changes as revisions of itself', async () => {
  const p = page(server());
  await settle();
  p.document.getElementById('task').value = 'Dig a trench.';
  await prepare(p);
  await save(p);
  p.run("applyLineEdit(shownDraft.jobSteps[0], 'Plant is inspected daily.', '')");
  await settle();
  await save(p);
  const saved = p.calls.filter((call) => call.route.startsWith('/api/swms') && ['POST', 'PUT'].includes(call.method));
  assert.deepEqual(saved.map((call) => `${call.method} ${call.route}`), ['POST /api/swms', 'PUT /api/swms/new-one']);
});

test('typing in the task box keeps the changes, and Continue keeps the steps picked for the same task (B1, B3)', async () => {
  const p = page(server());
  await settle();
  await p.window.SiteReady.fillForm({ state: 'qld', task: 'Dig a trench.', fallRisk: 'no', kinds: ['excavation'], leaveOut: ['Backfill'], stepOrder: ['Excavate'], controlEdits: EDITS });
  const task = p.document.getElementById('task');
  task.value = 'Dig a trench 1 m deep.';
  task.dispatchEvent(new FakeEvent('input', { bubbles: true }));
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(controlEdits)')), EDITS);
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(stepOrder)')), ['Excavate']);
  // Continue with the same task keeps the picks and the steps left out.
  task.value = 'Dig a trench.';
  p.document.getElementById('start').dispatchEvent(new FakeEvent('submit'));
  await settle();
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(stepPicks)')), ['excavation']);
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(leaveOut)')), ['Backfill']);
});

test('a project SWMS opened again comes back with its changes (B2)', async () => {
  const body = { state: 'qld', task: 'Dig a trench.', fallRisk: 'no', kinds: ['excavation'], controlEdits: EDITS };
  const project = { current: 1, items: [
    { title: 'Trench', task: 'Dig a trench.', trade: '', kinds: ['excavation'], leaveOut: null, fallRisk: 'no', body, status: 'ready' },
    { title: 'Paint', task: 'Paint the walls.', trade: '', kinds: null, leaveOut: null, fallRisk: 'no', body: null, status: 'todo' },
  ] };
  const p = page(server(), { 'siteready.project': JSON.stringify(project) });
  await settle();
  const open = { closest: (selector) => (selector === '[data-project-open]' ? { dataset: { projectOpen: '0' } } : null), matches: () => false, dataset: {} };
  const event = new FakeEvent('click', { bubbles: true });
  event.target = open;
  p.document.body.dispatchEvent(event);
  await settle();
  assert.equal(p.document.getElementById('task').value, 'Dig a trench.');
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(controlEdits)')), EDITS, 'the changes are back in the form');
  await prepare(p);
  const drafts = p.calls.filter((call) => call.route === '/api/draft');
  assert.deepEqual(drafts[drafts.length - 1].body.controlEdits, EDITS, 'and go with the next prepare');
});

test('starting a new SWMS clears the changes and saves it as a new SWMS', async () => {
  const p = page(server());
  await settle();
  await p.window.SiteReady.fillForm({ state: 'qld', task: 'Dig a trench.', fallRisk: 'no', controlEdits: EDITS, stepOrder: ['Excavate'] });
  p.window.SiteReady.editing = { id: 'saved-1', title: 'Trench' };
  p.window.SiteReady.newSwms();
  assert.equal(p.run('controlEdits'), null);
  assert.equal(p.run('stepOrder'), null);
  assert.equal(p.window.SiteReady.editing, null);
  p.document.getElementById('task').value = 'Paint the walls.';
  await prepare(p);
  assert.match(p.document.getElementById('result-actions').innerHTML, />Save SWMS<\/button>/);
  await save(p);
  assert.ok(p.calls.some((call) => call.method === 'POST' && call.route === '/api/swms'));
});

test('downloading saves the SWMS, and later changes save as its next revision', async () => {
  const p = page(server((method, route) => (route === '/api/draft.docx'
    ? { body: {}, headers: { 'content-type': 'application/octet-stream', 'x-siteready-swms': 'dl-1', 'x-siteready-revision': '1', 'x-siteready-title': 'Dig%20a%20trench' } } : null)));
  await settle();
  p.document.getElementById('task').value = 'Dig a trench.';
  await prepare(p);
  const tick = () => {
    p.document.getElementById('new-confirm').checked = true;
    p.document.getElementById('new-name').value = 'Sam Lee';
  };
  tick();
  p.document.getElementById('new-docx').click();
  await settle();
  const download = p.calls.find((call) => call.route === '/api/draft.docx');
  assert.equal(download.body.swmsId, undefined, 'a new SWMS');
  assert.deepEqual(JSON.parse(JSON.stringify(p.window.SiteReady.editing)), { id: 'dl-1', title: 'Dig a trench' });
  assert.match(p.document.getElementById('new-status').textContent, /Saved as "Dig a trench", revision 1, and downloaded/);
  p.run("applyLineEdit(shownDraft.jobSteps[0], 'Plant is inspected daily.', '')");
  await settle();
  tick();
  p.document.getElementById('new-docx').click();
  await settle();
  const again = p.calls.filter((call) => call.route === '/api/draft.docx');
  assert.equal(again[1].body.swmsId, 'dl-1', 'the second download is the same SWMS, saved as its next revision when changed');
  assert.deepEqual(again[1].body.controlEdits, EDITS);
});
