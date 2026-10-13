// Messy-user testing on staging, 13 October 2026, and the owner's answers D239, D240, D251, D252:
// a SWMS is not stood down for a design "Not issued yet"; an answer too thin to print says what would do,
// with an accepted example; the company name and ABN are on the list before download; work typed comes
// back after a reload; work SiteReady has no job steps for is dealt with part by part; a task from a
// scope prints as a plain list of the work; the project zip holds Word and PDF; address suggestions
// prefer the state expected and never switch it without a word.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { prepareDraft, questionsFor, answerState } = require('../draft');
const { HELP, answerHelp, helpText } = require('../answer-help');
const { plainTask, scopeWords, scopeSite, scopePlant, packageTask } = require('../public/scope-task');
const { projectItems } = require('../public/scope-choice');
const places = require('../places');
const { setupAccounts, lastLinkToken, ANSWERED, ready } = require('./helpers');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

const FORMWORK = {
  state: 'qld', fallRisk: 'yes', residential: 'no', kinds: ['formwork'], date: '14 October 2026',
  task: 'Erect, strip and remove formwork and propping to suspended slabs.',
};
const NOT_ISSUED = [{ id: 'formwork', status: 'notIssued' }, { id: 'propping', status: 'notIssued' }, { id: 'loadDrawing', status: 'notIssued' }];
const GOOD = { fallControl: HELP.fallControl.example, systemInstructions: HELP.systemInstructions.example };

// ---- 1. Not issued yet is a hold point; a thin answer says what would do ----

test('"Not issued yet" for the designs asked at their questions is a hold point, not a stand-down', () => {
  const facts = { ...GOOD, formworkDesign: '', temporarySupport: '', loadLimits: 'as per eng' };
  const without = prepareDraft({ ...FORMWORK, facts });
  assert.equal(without.kind, 'stand-down');
  assert.deepEqual(without.missingHelp.map((item) => [item.id, item.state]), [['temporarySupport', 'missing'], ['formworkDesign', 'missing'], ['loadLimits', 'vague']]);
  const held = prepareDraft({ ...FORMWORK, facts, designs: NOT_ISSUED });
  assert.equal(held.kind, 'draft');
  const lines = held.controls.map((item) => item.text);
  assert.ok(lines.includes('Hold point: the formwork design is not issued yet, so the work it covers does not start until it is issued and this SWMS is updated.'), lines.join('\n'));
  assert.ok(lines.some((line) => /^Hold point: the structural engineer's drawing for the load limits is not issued yet/.test(line)), '"as per eng" gives way to the hold point');
  assert.ok(!lines.some((line) => /as per eng/.test(line)));
  assert.deepEqual(held.designs.filter((row) => row.status === 'notIssued').map((row) => row.id).sort(), ['formwork', 'loadDrawing', 'propping']);
  // An answer that says enough is kept as typed, the hold point aside.
  const kept = prepareDraft({ ...FORMWORK, facts: { ...facts, loadLimits: HELP.loadLimits.example }, designs: NOT_ISSUED });
  assert.ok(kept.controls.some((item) => item.text.startsWith('3 kPa on the formwork deck')));
});

test('a stood-down draft names each answer it needs, in plain words with an accepted example', () => {
  const d = prepareDraft({ ...FORMWORK, facts: { ...GOOD, systemInstructions: 'as per supplier' }, designs: NOT_ISSUED });
  assert.equal(d.kind, 'stand-down');
  const item = d.missingHelp.find((entry) => entry.id === 'systemInstructions');
  assert.equal(item.state, 'vague');
  assert.equal(item.help, `${HELP.systemInstructions.need} For example: "${HELP.systemInstructions.example}"`);
  assert.equal(helpText({ id: 'loadLimits' }), 'Give the allowable load on the deck or slab, where it is shown on site, and who checks it. For example: "3 kPa on the formwork deck, signs at each stair, packs landed over bearers, checked by the leading hand."');
  // A question with no help of its own asks for what its prompt names and points to the standard answers.
  assert.equal(answerHelp({ id: 'spoilPlan', label: 'Spoil plan', prompt: 'Where the spoil goes.' }).need, 'Say where the spoil goes.');
  assert.equal(answerHelp({ id: 'pressureTesting', label: 'Pressure testing method', prompt: 'The test medium and the test pressure.' }).need, 'Give the test medium and the test pressure.');
  assert.match(helpText({ id: 'spoilPlan', prompt: 'What happens to the spoil?' }), /^Say what happens to the spoil\. A standard answer above, with its blanks filled in, is accepted\.$/);
});

test('every example the help gives is an answer SiteReady accepts', () => {
  for (const [id, help] of Object.entries(HELP)) assert.equal(answerState(id, help.example), 'supplied', `${id}: ${help.example}`);
  assert.equal(answerState('loadLimits', 'as per eng'), 'vague');
});

test('the questions name each answer given that is too thin to print, as the user types', () => {
  const asked = questionsFor({ ...FORMWORK, facts: { loadLimits: 'as per eng', systemInstructions: 'as per supplier', fallControl: HELP.fallControl.example } });
  assert.deepEqual(asked.weak.map((item) => item.id), ['loadLimits', 'systemInstructions']);
  assert.match(asked.weak[0].help, /^Give the allowable load/);
  // A design not issued yet covers its question: nothing to say about it.
  const held = questionsFor({ ...FORMWORK, facts: { loadLimits: 'as per eng' }, designs: NOT_ISSUED });
  assert.deepEqual(held.weak, []);
  // An empty answer is asked for, not called thin.
  assert.deepEqual(questionsFor({ ...FORMWORK, facts: {} }).weak, []);
});

// ---- The page ----

const STOOD = {
  kind: 'stand-down', state: 'Queensland', task: FORMWORK.task, missing: ['Load limits (the text given does not state it)'], statement: 'This task is stood down. It does not start.',
  missingHelp: [{ id: 'loadLimits', label: 'Load limits', state: 'vague', help: helpText({ id: 'loadLimits' }) }], method: [], hazards: [], controls: [], site: [],
};
const DRAFT = {
  kind: 'draft', state: 'Queensland', task: 'Install the generator and leak test the fuel line.', highRisk: [], controls: [], site: [], ppe: [], references: [], sources: { legislation: [], codes: [] },
  jobSteps: [{ step: 'Install the generators', hazards: ['Crush.'], controls: ['The generator is lifted by crane.'], responsible: 'Supervisor' }],
  notCovered: ['leak test the fuel line'],
};
function respond({ draft = DRAFT, company = { name: 'Co', abn: '33102417000' }, extra = () => null } = {}) {
  return (method, route, body) => {
    const own = extra(method, route, body);
    if (own) return own;
    if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
    if (route === '/api/states') return { body: { states: [{ id: 'qld', name: 'Queensland', loaded: true, versionLabel: 'current' }, { id: 'vic', name: 'Victoria', loaded: true, versionLabel: 'current' }] } };
    if (route === '/api/me') return { body: { user: { email: 'a@b.example', name: 'Sam' }, company: { ...company, hasAccess: true, planStatus: 'active' } } };
    if (route === '/api/sites') return { body: { sites: [] } };
    if (route === '/api/steps') return { body: { groups: [] } };
    if (route === '/api/draft') return { body: { ...draft, controlLegal: [[]] } };
    if (route === '/api/draft/questions') return { body: { required: [{ id: 'loadLimits', label: 'Load limits', prompt: 'The allowable loads.' }], weak: [], steps: { chosen: [] } } };
    if (route === '/api/company' && method === 'PUT') return { body: { company: { ...company, ...body } } };
    return { body: {} };
  };
}
const page = (options = {}, stored = {}) => loadPage(['app.js', 'account.js', 'scope.js'], respond(options), { stored: { 'siteready.session': 'token', ...stored } });
async function prepare(p) {
  p.document.getElementById('facts').dispatchEvent(new FakeEvent('submit'));
  await settle();
}

test('a stood-down draft says the SWMS is not finished, lists what each answer needs, and offers no download', async () => {
  const p = page({ draft: STOOD });
  await settle();
  p.document.getElementById('task').value = FORMWORK.task;
  await prepare(p);
  const result = p.document.getElementById('result').innerHTML;
  assert.match(result, /<h3 id="not-finished-title">This SWMS is not finished<\/h3>/);
  assert.match(result, /data-answer-go="loadLimits">Load limits<\/button><span class="meta">Too thin to print\. Give the allowable load on the deck or slab/);
  assert.match(result, /<button type="button" data-answer-go="first">Go to the first answer<\/button>/);
  assert.equal(p.document.getElementById('result-actions').innerHTML, '', 'nothing to download yet');
});

test('in a project, a SWMS not finished keeps the user on it: the next one is a small link, not the big button', async () => {
  const items = [{ title: 'Formwork', task: FORMWORK.task, status: 'todo', body: null }, { title: 'Reinforcement', task: 'Fix the reo.', status: 'todo', body: null }];
  const p = page({ draft: STOOD }, { 'siteready.project': JSON.stringify({ current: 0, items }) });
  await settle();
  p.window.SiteReady.onDraft(STOOD, { task: FORMWORK.task });
  const actions = p.document.getElementById('result-actions');
  // The box the page draws for the draft's actions.
  p.document.getElementById('result').innerHTML = '<div id="result-actions"></div>';
  p.window.SiteReady.onDraft(STOOD, { task: FORMWORK.task });
  const html = p.document.getElementById('result-actions').innerHTML;
  assert.match(html, /This SWMS is not finished\. <button type="button" class="link" data-project-open="1">Leave it unfinished for now and open SWMS 2<\/button>/);
  assert.doesNotMatch(html, /Next SWMS/);
  assert.ok(actions);
});

test('the company name and ABN are on the list before download, with a button to the profile', async () => {
  const p = page({ company: { name: 'Co', abn: '' }, draft: { ...DRAFT, notCovered: [] } });
  await settle();
  p.document.getElementById('task').value = DRAFT.task;
  await prepare(p);
  const gate = p.document.getElementById('result-gate').innerHTML;
  assert.match(gate, /data-gate-go="0">Company ABN<\/button><span class="meta">Add your ABN under Company profile\. They print on every SWMS\.<\/span>/);
  assert.equal(p.run('outstanding(shownDraft)[0].field'), 'profile-abn');
});

test('the profile saves itself once the name and ABN are in, and what is typed comes back after a reload', async () => {
  const p = page({ company: { name: '', abn: '' } });
  await settle();
  p.document.getElementById('profile-company').value = 'Messy Formwork';
  p.document.getElementById('profile-abn').value = '33 102 417 000';
  p.document.getElementById('profile').dispatchEvent(Object.assign(new FakeEvent('input', { bubbles: true }), { target: p.document.getElementById('profile-abn') }));
  p.run(`autoSaveProfile()`);
  await settle();
  const saved = p.calls.filter((call) => call.route === '/api/company' && call.method === 'PUT');
  assert.equal(saved.length, 1);
  assert.deepEqual([saved[0].body.name, saved[0].body.abn], ['Messy Formwork', '33 102 417 000']);
  assert.equal(p.window.localStorage.getItem('siteready.profileTyping'), null, 'nothing left to bring back once saved');
  // Typed but not saved (no ABN yet): kept on this device and brought back, said so.
  const q = page({ company: { name: '', abn: '' } }, { 'siteready.profileTyping': JSON.stringify({ name: 'Half Typed Pty Ltd', abn: '', address: '', phone: '', email: '' }) });
  await settle();
  assert.equal(q.document.getElementById('profile-company').value, 'Half Typed Pty Ltd');
  assert.match(q.document.getElementById('profile-status').textContent, /^Your company details are back as you typed them\. Press Save profile to keep them\.$/);
});

test('after a reload, the work comes back even when the browser has put the task back in its box', async () => {
  const INPUT = { state: 'qld', task: 'Dig a trench for the stormwater pipe.', fallRisk: 'no', workplace: '12 Smith Street, Paddington QLD 4064', principalContractor: 'ABC Builders Pty Ltd', facts: { loadLimits: '3 kPa' }, site: {} };
  const kept = JSON.stringify({ at: Date.now() - 60 * 1000, stage: 'draft', input: INPUT, editing: null });
  const p = page({}, { 'siteready.unsaved': kept });
  // The phone's browser has filled the task box back in as the page opens.
  p.document.getElementById('task').value = INPUT.task;
  await settle(40);
  assert.equal(p.document.getElementById('principal').value, INPUT.principalContractor);
  assert.ok(p.calls.some((call) => call.route === '/api/draft'), 'the draft is prepared again');
});

test('each part with no job steps is dealt with on its own: your step, or the SWMS that covers it', async () => {
  const items = [{ title: 'Generator', task: DRAFT.task, status: 'todo', body: null }, { title: 'Fuel system', task: 'Install the fuel system.', status: 'todo', body: null }];
  const p = page({}, { 'siteready.project': JSON.stringify({ current: 0, items }) });
  await settle();
  p.document.getElementById('task').value = DRAFT.task;
  await prepare(p);
  const block = p.run('notCoveredBlock(shownDraft)');
  assert.match(block, /Write your own step for it, or say which SWMS covers it\./);
  assert.match(block, /<select id="cover-where-0" data-cover-where="0" class="plain"><option value="">Not covered in another SWMS<\/option><option value="Fuel system">Fuel system<\/option><option value="__typed">Another SWMS: I will type its name<\/option><\/select>/);
  assert.doesNotMatch(block, /not-covered-confirm|I have added my own step/, 'no tick that can be ticked without it being true');
  assert.equal(p.run('outstanding(shownDraft).length'), 1);
  // Choosing the SWMS that covers it deals with it, and the SWMS named goes with the record.
  p.run(`coverElsewhere = { 'leak test the fuel line': 'Fuel system' }; syncCoverTicked();`);
  assert.equal(p.run('outstanding(shownDraft).length'), 0);
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(payload().notCoveredElsewhere)')), { 'leak test the fuel line': 'Fuel system' });
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(payload().notCoveredConfirmed)')), ['leak test the fuel line']);
  // A name too short to be one is not a free pass.
  p.run(`coverElsewhere = { 'leak test the fuel line': 'x' }; syncCoverTicked();`);
  assert.equal(p.run('outstanding(shownDraft).length'), 1);
  // Your own step saved for the part deals with it by itself.
  const written = { ...DRAFT, notCoveredWritten: ['leak test the fuel line'] };
  p.run(`ownSteps = [{ part: 'leak test the fuel line', name: 'Leak test the fuel line', hazards: ['Fuel spray.'], controls: ['Tested with air behind barriers.'], who: 'Supervisor' }]; coverElsewhere = {}; syncCoverTicked();`);
  assert.equal(p.run(`outstanding(${JSON.stringify(written)}).length`), 0);
  assert.match(p.run(`notCoveredBlock(${JSON.stringify(written)})`), /Done: your step "Leak test the fuel line" is in the job steps below\./);
});

// ---- 6. A task from a scope is a plain list of the work (D251, D252) ----

const ROWS = [
  { activity: 'Erect, strip and remove formwork and propping to suspended slabs', where: 'suspended slabs: Levels 1, 2 and roof', conditions: 'Working hours 6:30 am to 5:00 pm Monday to Friday unless otherwise approved by the builder', plant: '' },
  { activity: 'Install cast in items (cast in plates, ferrules, conduits)', where: 'suspended slabs', conditions: '', plant: '' },
  { activity: 'Place concrete to suspended slabs (Levels 1, 2 and roof)', where: 'Suspended slabs', conditions: 'Live or operating facility; near roads; Energised switchboards nearby', plant: 'Concrete pump, boom pump or line pump' },
  { activity: 'Install formwork for the Northside Correctional Centre', where: '', conditions: '', plant: 'Mobile crane' },
];

test('the task printed is a plain list of the work: no places, conditions, plant or project names', () => {
  const task = plainTask(ROWS);
  assert.equal(task, 'Erect, strip and remove formwork and propping to suspended slabs. Install cast in items: cast in plates, ferrules, conduits. Place concrete to suspended slabs. Install formwork.');
  assert.doesNotMatch(task, /[()]|conditions:|plant:|Levels 1, 2|Correctional|Working hours/);
  // The conditions go to the matching site questions; one that matches none (working hours) is left out.
  assert.deepEqual(scopeSite(ROWS), { publicInterface: 'Live or operating facility. Near roads.', liveServices: 'Energised switchboards nearby.' });
  assert.deepEqual(scopePlant(ROWS), ['Concrete pump', 'boom pump or line pump', 'Mobile crane']);
  const [item] = projectItems({ activities: ROWS.map((row) => ({ ...row, package: 'Formwork', type: 'Site work', quotes: [] })), packages: [{ package: 'Formwork', groups: ['formwork'], byOthers: [], unmatched: [] }] }, ['Formwork']);
  assert.equal(item.task, task);
  assert.deepEqual(item.scopeTask, scopeWords(ROWS));
  assert.equal(item.scopeTask.full, packageTask(ROWS));
});

test('SiteReady still reads the work from the scope\'s full words: the SWMS is the same but for the task printed', () => {
  const rows = [{ activity: 'Clean road surfaces by machine', plant: 'Road cleaning machine', conditions: 'Near roads' }, { activity: 'Fill existing trenches in switchroom with concrete', where: 'Switchroom', conditions: 'Existing trenches in switchroom; live existing facility' }];
  const words = scopeWords(rows);
  const base = { state: 'qld', fallRisk: 'no', residential: 'no', kinds: ['slabPour'], date: '14 October 2026' };
  const full = prepareDraft({ ...base, task: words.full });
  const plain = prepareDraft({ ...base, task: words.plain, scopeTask: words });
  assert.equal(plain.task, 'Clean road surfaces by machine. Fill existing trenches in switchroom with concrete.');
  assert.deepEqual(plain.highRisk, full.highRisk);
  assert.equal(JSON.stringify({ ...plain, task: '' }), JSON.stringify({ ...full, task: '' }));
  // Without the scope's words the road and the live switchroom would be missed.
  assert.ok(prepareDraft({ ...base, task: words.plain }).highRisk.length < full.highRisk.length);
  // The user's own change to the task is read with the scope's notes.
  const changed = prepareDraft({ ...base, task: 'Fill existing trenches in switchroom with concrete.', scopeTask: words });
  assert.equal(changed.task, 'Fill existing trenches in switchroom with concrete.');
  assert.ok(changed.highRisk.some((line) => /energised/i.test(line)));
  assert.equal(questionsFor({ ...base, task: words.plain, scopeTask: words }).task, plain.task);
});

// ---- 7. Address suggestions ----

const prediction = (main, rest, types) => ({ placePrediction: { text: { text: `${main}, ${rest}, Australia` }, structuredFormat: { mainText: { text: main }, secondaryText: { text: rest } }, types } });
test('address suggestions put the state expected first, ask again with it, and offer a business only with its street', async () => {
  const saved = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  const asked = [];
  const fetchImpl = async (url, options) => {
    const input = JSON.parse(options.body).input;
    asked.push(input);
    const list = /QLD$/.test(input)
      ? [prediction('10 Example Street', 'Woolloongabba QLD', ['street_address'])]
      : [prediction('10 Were Street', 'Brighton VIC', ['street_address']), prediction('Example Cafe', 'Woolloongabba QLD', ['establishment', 'cafe']), prediction('Example Yard', '12 Example Street, Woolloongabba QLD', ['establishment'])];
    return { ok: true, json: async () => ({ suggestions: list }) };
  };
  const result = await places.suggest('10 Example St Woolloongabba', { fetchImpl, near: 'qld' });
  assert.deepEqual(asked, ['10 Example St Woolloongabba', '10 Example St Woolloongabba QLD']);
  assert.deepEqual(result.suggestions, [
    { text: '10 Example Street, Woolloongabba QLD', state: 'qld' },
    { text: 'Example Yard, 12 Example Street, Woolloongabba QLD', state: 'qld', business: true },
    { text: '10 Were Street, Brighton VIC', state: 'vic' },
  ]);
  assert.ok(!result.suggestions.some((item) => /Example Cafe/.test(item.text)), 'a business with no street is not offered');
  // With no state expected, the lookup's own order stands and it is asked once.
  asked.length = 0;
  const plain = await places.suggest('10 Example St Woolloongabba East', { fetchImpl });
  assert.equal(asked.length, 1);
  assert.equal(plain.suggestions[0].state, 'vic');
  if (saved === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = saved;
});

test('an address in another state is never switched to silently', async () => {
  const p = loadPage(['address.js', 'app.js', 'account.js'], respond(), { stored: { 'siteready.session': 'token' } });
  await settle();
  const box = p.document.getElementById('workplace');
  box.value = '22 Logan Road, Woolloongabba QLD 4102';
  p.run('applyAddressState()');
  assert.equal(p.document.getElementById('workplace-state').textContent, 'State set to Queensland from the job address.');
  box.value = '10 Were Street, Brighton VIC';
  p.run('applyAddressState()');
  assert.match(p.document.getElementById('workplace-state').innerHTML, /^<strong>This address is in Victoria, so the SWMS uses Victorian law\. Change it\?<\/strong> <button type="button" class="link" data-state-change>Change the address<\/button> <button type="button" class="link" data-state-keep>Keep Victoria<\/button>$/);
  // Asked again, it still says so until the user keeps it or changes the address.
  p.run('applyAddressState()');
  assert.match(p.document.getElementById('workplace-state').innerHTML, /This address is in Victoria/);
  box.value = '22 Logan Road, Woolloongabba QLD 4102';
  p.run('applyAddressState()');
  assert.equal(p.document.getElementById('workplace-state').textContent, 'State set to Queensland from the job address.');
});

// ---- 5. The project zip holds Word and PDF (D240) ----

let server;
let base;
test.before(async () => {
  await setupAccounts();
  server = require('../server').app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());
const call = (method, route, { body, token } = {}) => fetch(`${base}${route}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });

test('Download all puts each SWMS in the zip as Word and PDF, each saved as its own SWMS', async () => {
  const email = 'project@flowfixes.example';
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  await call('PUT', '/api/company', { token, body: { name: 'Flow Fixes Pty Ltd', abn: '33102417000' } });
  const fence = (title) => ready({ state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no', swmsTitle: title, ...ANSWERED });
  const response = await call('POST', '/api/project.zip', { token, body: { swms: [fence('Fencing'), fence('Gates')], reviewConfirmed: true, reviewedBy: 'Sam Lee', pdf: true } });
  assert.equal(response.status, 200);
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
  assert.deepEqual(Object.keys(zip.files).sort(), ['01 Fencing.docx', '01 Fencing.pdf', '02 Gates.docx', '02 Gates.pdf']);
  assert.equal((await zip.file('01 Fencing.pdf').async('nodebuffer')).subarray(0, 4).toString(), '%PDF');
  const saved = JSON.parse(decodeURIComponent(response.headers.get('x-siteready-saved')));
  assert.equal(saved.length, 2);
  assert.notEqual(saved[0].id, saved[1].id);
  // Without pdf set, as before: Word only.
  const word = await call('POST', '/api/project.zip', { token, body: { swms: [fence('Fencing')], reviewConfirmed: true, reviewedBy: 'Sam Lee' } });
  assert.deepEqual(Object.keys((await JSZip.loadAsync(Buffer.from(await word.arrayBuffer()))).files), ['01 Fencing.docx']);
});
