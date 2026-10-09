// Parts of a task with no job steps (owner decision D184, 6 October 2026): listed on the draft
// as notCovered in the user's words and shown above it, refused for saving and downloading until
// the user ticks that they have dealt with them, left out of a project download until ticked,
// and never printed in the SWMS.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const JSZip = require('jszip');
const { app } = require('../server');
const { prepareDraft } = require('../draft');
const { draftToDocx } = require('../docx-draft');
const { draftToPdf } = require('../pdf-draft');
const { setupAccounts, lastLinkToken, ANSWERED, ready } = require('./helpers');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

const FACTS = { safetyDataSheet: 'The diesel safety data sheet is kept at the work area.' };
const GENERATOR = { state: 'qld', task: 'Install the generator and leak test the fuel line.', fallRisk: 'no', residential: 'no', date: '6 October 2026', facts: FACTS };
const draft = (task, extra = {}) => prepareDraft({ ...GENERATOR, task, ...extra });

test('a part of the task with no job steps is listed in the user\'s words', () => {
  const d = draft(GENERATOR.task);
  assert.equal(d.kind, 'draft');
  assert.ok(d.jobSteps.some((step) => step.step === 'Install the generators'), 'the generator has its steps');
  assert.deepEqual(d.notCovered, ['leak test the fuel line']);
});

test('work that has job steps is not listed', () => {
  assert.deepEqual(draft('Install the generator.').notCovered, []);
  // A step named for the work covers it: "Grout the tiles", "Clean out and seal floor joints".
  assert.deepEqual(draft('Lay the floor tiles, grout the tiles and seal the joints.').notCovered, []);
  // Access covered by the access step, and a lift covered by the lifting steps.
  assert.deepEqual(draft('Install the generator, working from a scissor lift.').notCovered, []);
  assert.deepEqual(draft('Lift the generator onto the plinth with a mobile crane and install it.', { crane: 'company' }).notCovered, []);
  // A pressure test is asked about as a fact, so its answer covers it.
  assert.deepEqual(draft('Install the generator and pressure test the fuel line.', { facts: { ...FACTS, pressureTesting: 'Tested with air at 1.5 times working pressure behind barriers.' } }).notCovered, []);
});

test('duties, paperwork, conditions, standards and work by others are not listed', () => {
  const d = draft('Install the generator. Attend the weekly site meetings, provide the test certificates and supply the fuel. The plant room is next to a live road. All work is to comply with AS 3000.');
  assert.equal(d.kind, 'draft');
  assert.deepEqual(d.notCovered, []);
  assert.deepEqual(draft('Install the generator and leak test the fuel line (by others).').notCovered, []);
  assert.deepEqual(draft('Install the generator. The fuel line is leak tested by others.').notCovered, []);
});

test('access, lifting and cutting steps cover only what the draft\'s steps name', () => {
  assert.deepEqual(draft('Install the generator and erect a mobile scaffold.').notCovered, []);
  assert.deepEqual(draft('Install the generator and saw cut the slab.', { facts: { ...FACTS, silicaControls: 'Wet cutting with an M class vacuum.' } }).notCovered, []);
  assert.deepEqual(draft('Install the generator. Unload the fuel tank with the forklift.', { facts: { ...FACTS, loadLimits: 'The forklift is rated for 2.5 t.' } }).notCovered, []);
  // Working from the scissor lift is covered by its steps; hanging the artwork is not.
  assert.deepEqual(draft('Install the generator and hang the artwork from the scissor lift.').notCovered, ['hang the artwork from the scissor lift']);
});

test('work the user took the steps off is not listed: SiteReady has steps for it', () => {
  const d = draft('Install the generator and hang the doors.', { kinds: ['generatorPlant'] });
  assert.ok(!d.jobSteps.some((step) => step.step === 'Hang the doors'));
  assert.deepEqual(d.notCovered, []);
});

test('a stood-down draft keeps its own message and lists nothing more', () => {
  const d = prepareDraft({ ...GENERATOR, facts: {} });
  assert.equal(d.kind, 'stand-down');
  assert.equal(d.notCovered, undefined);
});

test('a scope reading lists the rows the reader matched to no job steps', () => {
  const rows = ['Leak test the fuel line (Plant room 2)', 'Attend the weekly site meetings', 'Install the generator'];
  assert.deepEqual(draft(GENERATOR.task, { unmatched: rows }).notCovered, ['Leak test the fuel line']);
  // Every row matched: nothing is listed.
  assert.deepEqual(draft(GENERATOR.task, { unmatched: [] }).notCovered, []);
});

// The text drawn in a PDF: each compressed page stream inflated, and its hex strings read.
function pdfText(buffer) {
  const raw = buffer.toString('latin1');
  const out = [];
  const streams = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (let match = streams.exec(raw); match; match = streams.exec(raw)) {
    let body;
    try { body = zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'); } catch { continue; }
    for (const array of body.match(/\[[^\]]*\]\s*TJ/g) || []) {
      out.push((array.match(/<([0-9a-fA-F]*)>/g) || []).map((hex) => Buffer.from(hex.slice(1, -1), 'hex').toString('latin1')).join(''));
    }
  }
  return out.join('\n');
}

test('the list is not printed in the Word or PDF file', async () => {
  const d = draft(GENERATOR.task);
  assert.equal(d.notCovered.length, 1);
  const zip = await JSZip.loadAsync(await draftToDocx(d, { confirmation: { name: 'Sam Lee', date: '6 October 2026' } }));
  const word = (await Promise.all(Object.keys(zip.files).filter((name) => /^word\/.*\.xml$/.test(name)).map((name) => zip.file(name).async('string')))).join(' ').replace(/<[^>]+>/g, '');
  assert.match(word, /leak test the fuel line/, 'the task itself is printed');
  assert.doesNotMatch(word, /no job steps|separate SWMS|have added steps/i);
  const pdf = pdfText(Buffer.from(await draftToPdf(d, {})));
  assert.ok(pdf.length > 1000, 'the PDF text was read');
  assert.doesNotMatch(pdf, /no job steps|separate SWMS|have added steps/i);
});

// ---- The routes ----

let server;
let base;

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

function call(method, route, { body, token } = {}) {
  return fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// A valid ABN: nine digits, and the two leading digits that make the ABN check work.
function abn(tail) {
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  for (let head = 10; head <= 99; head += 1) {
    const digits = `${head}${tail}`;
    if ([...digits].reduce((sum, d, i) => sum + (Number(d) - (i === 0 ? 1 : 0)) * weights[i], 0) % 89 === 0) return digits;
  }
  return abn(String(Number(tail) + 1).padStart(9, '0'));
}

async function signIn(email, tail) {
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  await call('PUT', '/api/company', { token, body: { name: 'Generator Co Pty Ltd', abn: abn(tail) } });
  return token;
}

const CONFIRM = { reviewConfirmed: true, reviewedBy: 'Sam Lee' };
const COVERED = 'SiteReady has no job steps for: leak test the fuel line. Tick the box above the draft to say you have added your own steps and controls, or covered this work in a separate SWMS, before saving or downloading.';
const TICKED = { notCoveredConfirmed: ['leak test the fuel line'] };
// The site questions answered (goal 2), so only the tick is outstanding.
const READY = ready({ ...GENERATOR, ...ANSWERED });

test('the preview lists the parts, and downloads are refused until the user ticks that they are covered', async () => {
  const token = await signIn('generator@notcovered.example', '512345678');
  const preview = await (await call('POST', '/api/draft', { body: READY })).json();
  assert.deepEqual(preview.notCovered, ['leak test the fuel line']);
  for (const route of ['/api/draft.docx', '/api/draft.pdf']) {
    const refused = await call('POST', route, { token, body: { ...READY, ...CONFIRM } });
    assert.equal(refused.status, 400, route);
    assert.equal((await refused.json()).message, COVERED);
  }
  assert.equal((await (await call('GET', '/api/swms', { token })).json()).swms.length, 0, 'nothing was saved');
  // A tick given for another list does not pass this one.
  assert.equal((await call('POST', '/api/draft.docx', { token, body: { ...READY, ...CONFIRM, notCoveredConfirmed: ['something else'] } })).status, 400);
  const word = await call('POST', '/api/draft.docx', { token, body: { ...READY, ...CONFIRM, ...TICKED } });
  assert.equal(word.status, 200);
  assert.match(word.headers.get('content-type'), /wordprocessingml/);
  const pdf = await call('POST', '/api/draft.pdf', { token, body: { ...READY, ...CONFIRM, ...TICKED } });
  assert.equal(pdf.status, 200);
  // A task with every part covered needs no tick.
  const fence = await call('POST', '/api/draft.docx', { token, body: ready({ state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no', ...ANSWERED, ...CONFIRM }) });
  assert.equal(fence.status, 200);
});

test('with the site questions blank as well, the refusal names both, and the project note lists all it needs', async () => {
  const token = await signIn('both@notcovered.example', '545678901');
  const refused = await call('POST', '/api/draft.docx', { token, body: { ...GENERATOR, ...CONFIRM } });
  assert.equal(refused.status, 400);
  const data = await refused.json();
  assert.match(data.message, /^SiteReady does not produce a SWMS until the site questions are answered, the plant is confirmed, the emergency response is given and no blank is left in it\. Still to answer: Job address; Principal contractor;/);
  assert.ok(data.message.endsWith(COVERED), data.message);
  assert.ok(data.gate.some((gap) => gap.kind === 'cover') && data.gate.some((gap) => gap.id === 'musterPoint'));
  // Ticked, only the site questions are left; answered, only the tick.
  assert.doesNotMatch((await (await call('POST', '/api/draft.docx', { token, body: { ...GENERATOR, ...TICKED, ...CONFIRM } })).json()).message, /no job steps/);
  assert.equal((await (await call('POST', '/api/draft.docx', { token, body: { ...READY, ...CONFIRM } })).json()).message, COVERED);
  assert.equal((await call('POST', '/api/draft.docx', { token, body: { ...READY, ...TICKED, ...CONFIRM } })).status, 200);
  const zip = await call('POST', '/api/project.zip', { token, body: { swms: [{ ...READY, ...TICKED, swmsTitle: 'Ready' }, { ...GENERATOR, swmsTitle: 'Generator' }], ...CONFIRM } });
  const note = await (await JSZip.loadAsync(Buffer.from(await zip.arrayBuffer()))).file('Not included.txt').async('string');
  assert.match(note, /2\. Generator: still to answer: Tick for work SiteReady has no job steps for; Job address;/);
});

test('saving is refused until ticked, and the sign-on page does not show the list', async () => {
  const token = await signIn('save@notcovered.example', '523456789');
  const refused = await call('POST', '/api/swms', { token, body: { input: READY, ...CONFIRM } });
  assert.equal(refused.status, 400);
  assert.equal((await refused.json()).message, COVERED);
  const saved = await call('POST', '/api/swms', { token, body: { input: { ...READY, ...TICKED }, ...CONFIRM } });
  assert.equal(saved.status, 201);
  const { swms } = await saved.json();
  // Changes from the form need the tick again: a new part, ticked or not.
  const changed = { ...READY, task: 'Install the generator, leak test the fuel line and hang the artwork.' };
  assert.equal((await call('PUT', `/api/swms/${swms.id}`, { token, body: { input: { ...changed, ...TICKED }, ...CONFIRM } })).status, 400);
  assert.equal((await call('PUT', `/api/swms/${swms.id}`, { token, body: { input: { ...changed, notCoveredConfirmed: ['leak test the fuel line', 'hang the artwork'] }, ...CONFIRM } })).status, 200);
  const signToken = new URL(swms.signonPath, base).searchParams.get('t');
  const page = await (await call('GET', `/api/sign/${signToken}`)).text();
  assert.match(page, /leak test the fuel line/, 'the task is shown');
  assert.doesNotMatch(page, /notCovered|no job steps|separate SWMS/);
});

test('a project download leaves out a SWMS whose parts with no job steps are not ticked', async () => {
  const token = await signIn('project@notcovered.example', '534567890');
  const fence = ready({ state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no', swmsTitle: 'Fencing', ...ANSWERED });
  const download = async (generator) => {
    const response = await call('POST', '/api/project.zip', { token, body: { swms: [fence, { ...generator, swmsTitle: 'Generator' }], ...CONFIRM } });
    assert.equal(response.status, 200);
    return JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
  };
  const unticked = await download(READY);
  assert.deepEqual(Object.keys(unticked.files).filter((name) => name.endsWith('.docx')), ['01 Fencing.docx']);
  const note = await unticked.file('Not included.txt').async('string');
  assert.match(note, /SiteReady has no job steps for part of these SWMS, and the box above the draft was not ticked/);
  assert.match(note, /2\. Generator: leak test the fuel line/);
  assert.doesNotMatch(note, /Fencing/);
  const ticked = await download({ ...READY, ...TICKED });
  assert.equal(Object.keys(ticked.files).filter((name) => name.endsWith('.docx')).length, 2, 'both SWMS are in the download');
  assert.equal(ticked.file('Not included.txt'), null);
});

// ---- The page ----

const GENERATOR_DRAFT = {
  kind: 'draft', state: 'Queensland', task: GENERATOR.task, highRisk: [], controls: [], site: [], ppe: [], references: [], sources: { legislation: [], codes: [] },
  jobSteps: [{ step: 'Install the generators', hazards: ['Crush.'], controls: ['The generator is lifted by crane.'], responsible: 'Supervisor' }],
  notCovered: ['leak test the fuel line'],
};

function respond(extra = () => null) {
  return (method, route, body) => {
    const own = extra(method, route, body);
    if (own) return own;
    if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
    if (route === '/api/me') return { body: { user: { email: 'a@b.example', name: 'Sam' }, company: { name: 'Co', abn: '1', hasAccess: true, planStatus: 'active' } } };
    if (route === '/api/sites') return { body: { sites: [] } };
    if (route === '/api/steps') return { body: { groups: [] } };
    if (route === '/api/draft') return { body: { ...GENERATOR_DRAFT, controlLegal: [[]] } };
    if (route === '/api/draft/questions') return { body: { required: [], steps: { chosen: [] } } };
    if (route === '/api/swms' && method === 'POST') return { status: 201, body: { swms: { id: 'new-one', title: 'Generator', revision: 1 } } };
    return { body: {} };
  };
}

const page = (stored = {}) => loadPage(['app.js', 'account.js', 'scope.js'], respond(), { stored: { 'siteready.session': 'token', ...stored } });

async function prepare(p) {
  p.document.getElementById('facts').dispatchEvent(new FakeEvent('submit'));
  await settle();
}

// Ticks the box above the draft, as the user does.
function tick(p, on = true) {
  const box = p.document.getElementById('not-covered-confirm');
  box.checked = on;
  box.dataset.parts = JSON.stringify(GENERATOR_DRAFT.notCovered);
  box.dispatchEvent(new FakeEvent('change', { bubbles: true }));
}

test('the page names the parts above the draft, and saving waits for the tick', async () => {
  const p = page();
  await settle();
  p.document.getElementById('task').value = GENERATOR.task;
  await prepare(p);
  const result = p.document.getElementById('result').innerHTML;
  assert.ok(result.indexOf('SiteReady has no job steps for: leak test the fuel line. Add your own step and controls for it, or cover it in a separate SWMS.') >= 0);
  assert.ok(result.indexOf('not-covered-confirm') < result.indexOf('class="sheet"'), 'the warning is above the draft');
  p.document.getElementById('new-confirm').checked = true;
  p.document.getElementById('new-confirm').dispatchEvent(new FakeEvent('change'));
  p.document.getElementById('new-name').value = 'Sam Lee';
  p.document.getElementById('new-name').dispatchEvent(new FakeEvent('input'));
  assert.equal(p.document.getElementById('new-save').disabled, true, 'not until the box above the draft is ticked');
  assert.equal(p.document.getElementById('new-docx').disabled, true);
  // Above the buttons, one list of everything outstanding (with the site questions of goal 2), its
  // item for this going to the box; beside the buttons, a line says why they wait.
  const gate = p.document.getElementById('result-gate').innerHTML;
  assert.match(gate, /Before you can download this SWMS/);
  assert.match(gate, /data-cover-jump>Work SiteReady has no job steps for</);
  const actions = p.document.getElementById('result-actions').innerHTML;
  assert.ok(actions.indexOf('Download and save wait for the item listed above under "Before you can download this SWMS".') >= 0 && actions.indexOf('Download and save wait') < actions.indexOf('id="new-save"'));
  assert.match(actions, /data-gate-list>Go to the list</);
  assert.equal(p.document.getElementById('new-gate-note').classList.contains('hidden'), false);
  tick(p);
  assert.equal(p.document.getElementById('new-save').disabled, false);
  assert.equal(p.document.getElementById('new-gate-note').classList.contains('hidden'), true, 'the line goes once ticked');
  assert.equal(p.document.getElementById('result-gate').innerHTML, '', 'and so does the list');
  p.document.getElementById('new-save').click();
  await settle();
  const saved = p.calls.filter((call) => call.route === '/api/swms' && call.method === 'POST');
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].body.input.notCoveredConfirmed, ['leak test the fuel line']);
  // Prepared again, the tick for the same list stays.
  await prepare(p);
  assert.match(p.document.getElementById('result').innerHTML, /id="not-covered-confirm"[^>]* checked/);
});

test('a fully covered draft shows no warning', async () => {
  const p = loadPage(['app.js', 'account.js', 'scope.js'], respond((method, route) => (route === '/api/draft' ? { body: { ...GENERATOR_DRAFT, notCovered: [], controlLegal: [[]] } } : null)), { stored: { 'siteready.session': 'token' } });
  await settle();
  p.document.getElementById('task').value = 'Install the generator.';
  await prepare(p);
  assert.doesNotMatch(p.document.getElementById('result').innerHTML, /no job steps|not-covered/);
  assert.doesNotMatch(p.document.getElementById('result-actions').innerHTML, /new-gate-note/);
});

test('in a project, a SWMS with parts that have no job steps is ready once ticked', async () => {
  // A scope package's task has one sentence to a line in the task box.
  const task = 'Install the generator (Plant yard). Leak test the fuel line (Plant yard).';
  const project = { current: 0, items: [{ title: 'Generator', task, trade: '', kinds: null, leaveOut: null, unmatched: ['Leak test the fuel line'], fallRisk: 'no', body: null, status: 'todo' }] };
  const p = page({ 'siteready.project': JSON.stringify(project) });
  await settle();
  const typed = task.replace('. ', '.\n');
  p.document.getElementById('task').value = typed;
  p.window.siteReadyScopeTask = { task: typed, unmatched: ['Leak test the fuel line'] };
  p.document.getElementById('start').dispatchEvent(new FakeEvent('submit'));
  await settle();
  await prepare(p);
  const drafts = p.calls.filter((call) => call.route === '/api/draft');
  assert.deepEqual(drafts[drafts.length - 1].body.unmatched, ['Leak test the fuel line'], 'the scope reader\'s rows go with the task');
  const stored = () => JSON.parse(p.window.localStorage.getItem('siteready.project')).items[0];
  assert.equal(stored().status, 'tick');
  assert.match(p.document.getElementById('project-panel').innerHTML, /Needs a tick/);
  assert.match(p.document.getElementById('project-panel').innerHTML, /SWMS 1, Generator, waits for the box above its draft[^<]*<button type="button" class="link" data-cover-jump>Go to the box/);
  tick(p);
  assert.equal(stored().status, 'ready');
  assert.doesNotMatch(p.document.getElementById('project-panel').innerHTML, /waits for the box/);
  assert.deepEqual(stored().body.notCoveredConfirmed, ['leak test the fuel line']);
  tick(p, false);
  assert.equal(stored().status, 'tick');
});
