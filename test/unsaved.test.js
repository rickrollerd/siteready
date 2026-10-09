// Goal 7: what the user has typed for a SWMS not yet saved (task, answers, site details and their
// changes to the draft) is kept in this browser, so a reload or lost signal does not lose it. It
// comes back when the page opens again, and is cleared when the SWMS is saved, on Start again, on
// sign out and after 14 days. The page scripts run in a small stand-in for the browser (fake-dom.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

const KEY = 'siteready.unsaved';
const DRAFT = {
  kind: 'draft', state: 'Queensland', task: 'Dig a trench.', highRisk: [], controls: [], site: [], ppe: [], references: [], sources: { legislation: [], codes: [] },
  jobSteps: [{ step: 'Excavate', hazards: ['Collapse.'], controls: ['Spoil is kept back from the edge.'], responsible: 'Plant operator' }],
};

function server({ signedIn = true } = {}) {
  return (method, route) => {
    if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
    if (route === '/api/states') return { body: { states: [{ id: 'qld', name: 'Queensland', loaded: true, versionLabel: 'current' }] } };
    if (route === '/api/me') return signedIn ? { body: { user: { email: 'a@b.example', name: 'Sam' }, company: { name: 'Co', abn: '1', hasAccess: true, planStatus: 'active' } } } : { status: 401, body: {} };
    if (route === '/api/sites') return { body: { sites: [] } };
    if (route === '/api/steps') return { body: { groups: [] } };
    if (route === '/api/draft') return { body: { ...DRAFT, controlLegal: [[]] } };
    if (route === '/api/draft/questions') return { body: { required: [], steps: { chosen: [] } } };
    if (route === '/api/swms' && method === 'POST') return { status: 201, body: { swms: { id: 'new-one', title: 'Trench', revision: 1 } } };
    return { body: {} };
  };
}

const kept = (input, extra = {}) => JSON.stringify({ at: Date.now() - 60 * 1000, stage: 'start', input, editing: null, ...extra });
const INPUT = { state: 'qld', task: 'Dig a trench for the stormwater pipe.', fallRisk: 'no', workplace: '12 Smith Street, Paddington QLD 4064', principalContractor: 'ABC Builders Pty Ltd', firstAider: 'Jo Smith', musterPoint: 'Front gate', facts: {}, site: {} };

const page = (stored = {}, options = {}) => loadPage(['app.js', 'account.js'], server(options), { stored: { 'siteready.session': 'token', ...stored } });
const stored = (p) => { const value = p.window.localStorage.getItem(KEY); return value ? JSON.parse(value) : null; };

test('the task and site details typed before a reload come back', async () => {
  const p = page({ [KEY]: kept(INPUT) });
  await settle();
  const value = (id) => p.document.getElementById(id).value;
  assert.equal(value('task'), INPUT.task);
  assert.equal(value('workplace'), INPUT.workplace);
  assert.equal(value('principal'), INPUT.principalContractor);
  assert.equal(value('first-aider'), 'Jo Smith');
  assert.equal(value('muster-point'), 'Front gate');
  // Kept at the task: the questions are not asked for again until Continue.
  assert.equal(p.calls.filter((call) => call.route === '/api/draft/questions').length, 0);
});

test('a draft that was showing comes back with the user\'s changes, ready to save', async () => {
  const edits = { Excavate: { removed: [], changed: [], added: ['A spotter watches the edge.'] } };
  const p = page({ [KEY]: kept({ ...INPUT, controlEdits: edits, fills: { 'A line ____': ['3 m'] } }, { stage: 'draft' }) });
  await settle(40);
  const sent = p.calls.filter((call) => call.route === '/api/draft');
  assert.equal(sent.length, 1, 'the draft is prepared again');
  assert.equal(sent[0].body.task, INPUT.task);
  assert.deepEqual(sent[0].body.controlEdits, edits);
  assert.deepEqual(sent[0].body.fills, { 'A line ____': ['3 m'] });
  assert.match(p.document.getElementById('result-actions').innerHTML, />Save SWMS<\/button>/);
});

test('work kept for more than 14 days is dropped', async () => {
  const p = page({ [KEY]: kept(INPUT, { at: Date.now() - 15 * 24 * 60 * 60 * 1000 }) });
  await settle();
  assert.equal(p.document.getElementById('task').value, '');
  assert.equal(stored(p), null);
});

test('broken or missing storage does not stop the page', async () => {
  const p = page({ [KEY]: '{not json' });
  await settle();
  assert.equal(p.document.getElementById('task').value, '');
  // Storage that throws (private browsing on some phones).
  p.window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  p.document.getElementById('task').value = 'Dig a trench.';
  assert.doesNotThrow(() => p.window.SiteReady.keepUnsaved());
});

test('what is typed is kept, without the business details kept in the company profile', async () => {
  const p = page();
  await settle();
  // As the page opens: the questions and the draft are not shown yet.
  ['facts', 'result'].forEach((id) => p.document.getElementById(id).classList.add('hidden'));
  p.window.SiteReady.keepUnsaved();
  assert.equal(stored(p), null, 'nothing typed, nothing kept');
  p.document.getElementById('task').value = 'Dig a trench.';
  p.document.getElementById('principal').value = 'ABC Builders Pty Ltd';
  p.window.SiteReady.keepUnsaved();
  const record = stored(p);
  assert.equal(record.stage, 'start');
  assert.equal(record.input.task, 'Dig a trench.');
  assert.equal(record.input.principalContractor, 'ABC Builders Pty Ltd');
  for (const key of ['companyAbn', 'companyAddress', 'companyPhone', 'companyEmail', 'logo']) assert.equal(key in record.input, false, key);
});

test('saving the SWMS clears the copy kept on the phone', async () => {
  const p = page();
  await settle();
  p.document.getElementById('task').value = 'Dig a trench.';
  p.document.getElementById('facts').dispatchEvent(new FakeEvent('submit'));
  await settle();
  assert.equal(stored(p).stage, 'draft', 'kept once the draft is shown');
  p.document.getElementById('new-confirm').checked = true;
  p.document.getElementById('new-name').value = 'Sam Lee';
  p.document.getElementById('new-save').click();
  await settle();
  assert.ok(p.calls.some((call) => call.route === '/api/swms' && call.method === 'POST'));
  assert.equal(stored(p), null);
});

test('signing out clears it; a session that has run out keeps it', async () => {
  const expired = page({ [KEY]: kept(INPUT) }, { signedIn: false });
  await settle();
  assert.equal(stored(expired).input.task, INPUT.task, 'kept, to carry on after signing in again');
  const p = page({ [KEY]: kept(INPUT) });
  await settle();
  p.document.getElementById('sign-out').click();
  await settle();
  assert.equal(stored(p), null);
});
