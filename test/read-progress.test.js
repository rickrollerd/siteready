// The progress bar while the AI reads a scope or a methodology, the message with a chime when it is
// finished, and the scope panel's sign-in wording (owner's staging feedback, 13 October 2026). The AI
// does not report its progress: the bar follows the reading's stage on the server and the time a
// document of its length usually takes, and shows 100% only once the reading is done.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setupAccounts } = require('./helpers');
const aiScope = require('../ai-scope');
const methodRead = require('../method-read');
const { expectedSeconds, percent } = require('../public/read-progress');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

// ---- The percentage ----

test('the expected time grows with the document and matches the recorded readings', () => {
  assert.equal(expectedSeconds(0), 60);
  assert.equal(expectedSeconds(500), 60);
  let last = 0;
  for (const characters of [2000, 8000, 13000, 20000, 50000, 120000, 350000]) {
    const seconds = expectedSeconds(characters);
    assert.ok(seconds >= last, `${characters} characters`);
    last = seconds;
  }
  // A typical 13,000 to 15,000 character scope took 94 to 186 seconds; a 300,000 character one about 11 to 13 minutes.
  assert.ok(expectedSeconds(13457) >= 150 && expectedSeconds(13457) <= 200);
  assert.ok(expectedSeconds(300000) >= 660 && expectedSeconds(300000) <= 840);
});

test('before the reading is done the bar never passes 95%, keeps moving, and reaches 100% only when done', () => {
  for (const expected of [30, 60, 174, 830]) {
    for (const stage of ['', 'reading', 'steps']) {
      let previous = -1;
      for (let seconds = 0; seconds <= expected * 20; seconds += Math.max(1, expected / 50)) {
        const value = percent({ elapsed: seconds, stageElapsed: seconds, expected, stage });
        assert.ok(value >= 0 && value <= 95, `${stage} ${seconds}s of ${expected}s gave ${value}`);
        assert.ok(value >= previous, 'never goes back');
        previous = value;
      }
      // Past the expected time it still creeps forward rather than stalling.
      const at = (share) => percent({ elapsed: expected * share, stageElapsed: expected * share, expected, stage });
      assert.ok(at(3) > at(2) && at(2) > at(1.2), `${stage} keeps creeping`);
    }
    assert.equal(percent({ done: true, elapsed: 1, expected }), 100);
  }
  assert.equal(percent({ elapsed: 1e9, expected: 60 }) < 95, true);
  // Step 1 (reading the document) stays below 80%; step 2 (matching the job steps) starts at 80%.
  assert.ok(percent({ elapsed: 1e6, expected: 174, stage: 'reading' }) < 80);
  assert.equal(percent({ stageElapsed: 0, expected: 174, stage: 'steps' }), 80);
  // About 81% at the expected time when the stage is not known.
  assert.ok(Math.abs(percent({ elapsed: 174, expected: 174 }) - 80.75) < 0.01);
});

// ---- The server: the stage of each reading, with no paid call ----

const SCOPE = 'Supply and install all ductwork, including straight and curved sections.';
const READING = { activities: [{ activity: 'Install ductwork', type: 'Site work', package: 'Ductwork', crew: '', clause: '1', quotes: [SCOPE], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' }], byOthers: [], conflicts: [] };

// A stand-in for the model whose second call (matching the job steps) waits until released.
function heldStandIn(first, second) {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const answer = (body) => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify(body) }] });
  return {
    release: () => release(),
    beta: { messages: { stream(params) {
      const mapping = Boolean(params.output_config.format.schema.properties.packages);
      return { finalMessage: async () => { if (mapping) { await held; return answer(second); } return answer(first); } };
    } } },
  };
}
const until = async (check) => { for (let i = 0; i < 200 && !(await check()); i += 1) await new Promise((resolve) => { setImmediate(resolve); }); };

test.before(async () => {
  await setupAccounts();
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
});
test.after(() => {
  delete process.env.ANTHROPIC_API_KEY;
  aiScope.useClient(null);
});

test('a scope reading reports its stage, its time and the expected time while it runs, and none once done', async () => {
  const company = { id: 'company-progress-1' };
  const model = heldStandIn(READING, { packages: [{ package: 'Ductwork', groups: ['ductwork'], unmatched: [] }] });
  aiScope.useClient(model);
  const started = await aiScope.startReading(company, SCOPE);
  assert.equal(started.status, 'reading');
  assert.deepEqual(started.progress, { stage: 'reading', elapsedSeconds: 0, stageSeconds: 0, expectedSeconds: expectedSeconds(SCOPE.length) });
  // The first call has answered; the second (matching the job steps) is running.
  await until(async () => (await aiScope.getReading(company, started.id)).progress.stage === 'steps');
  const middle = await aiScope.getReading(company, started.id);
  assert.equal(middle.status, 'reading');
  assert.equal(middle.progress.stage, 'steps');
  assert.equal(middle.progress.expectedSeconds, 60);
  assert.ok(middle.progress.elapsedSeconds >= 0 && middle.progress.stageSeconds >= 0);
  model.release();
  await started.done;
  const done = await aiScope.getReading(company, started.id);
  assert.equal(done.status, 'done');
  assert.equal(done.progress, null);
});

test('a methodology reading reports its stage the same way', async () => {
  const D = require('./method-read.data');
  const company = { id: 'company-progress-2' };
  const model = heldStandIn(D.EXCAVATION_READING, D.EXCAVATION_STEPS);
  aiScope.useClient(model);
  const text = D.EXCAVATION.join('\n');
  const started = await methodRead.startReading(company, { text });
  assert.equal(started.progress.stage, 'reading');
  assert.equal(started.progress.expectedSeconds, expectedSeconds(text.length));
  await until(async () => (await methodRead.getReading(company, started.id)).progress.stage === 'steps');
  model.release();
  await started.done;
  assert.equal((await methodRead.getReading(company, started.id)).progress, null);
});

// ---- The page ----

const PAGE_READING = {
  activities: [{ package: 'Roofing', activity: 'Fix roof sheeting', type: 'Work', clause: '2.1', quotes: ['Supply and fix roof sheeting.'] }],
  packages: [],
  conflicts: [],
};

// A signed-in server whose reading runs for the given answers to the page's asks, then is done or failed.
function server({ asks = [], end = 'done', start = 'reading', me = { hasAccess: true }, signedIn = true } = {}) {
  let i = 0;
  const progress = (n) => ({ stage: n < 1 ? 'reading' : 'steps', elapsedSeconds: 30 * n, stageSeconds: 10, expectedSeconds: 174 });
  return (method, route) => {
    if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
    if (route === '/api/me') return signedIn ? { body: { user: { email: 'a@b.example', name: 'Sam', hasPasskey: true }, company: { name: 'Co', abn: '1', hasAccess: me.hasAccess, planStatus: me.hasAccess ? 'active' : 'ended', trialEndsAt: '2020-01-01' } } } : { status: 401, body: {} };
    if (route === '/api/sites') return { body: { sites: [] } };
    if (route === '/api/swms') return { body: { swms: [] } };
    if (route === '/api/steps') return { body: { groups: [] } };
    if (route === '/api/scope/ai' && method === 'GET') return { body: { enabled: true } };
    if (route === '/api/scope/ai' && method === 'POST') {
      return { body: start === 'done' ? { id: 'r1', status: 'done', reading: PAGE_READING, checks: { passed: true } } : { id: 'r1', status: 'reading', progress: progress(0) } };
    }
    if (route.startsWith('/api/scope/ai/r1')) {
      if (i < asks.length) { i += 1; return { body: { id: 'r1', status: 'reading', progress: progress(i) } }; }
      if (end === 'failed') return { body: { id: 'r1', status: 'failed', error: 'The AI\'s answer could not be read. Try again.' } };
      if (end === 'gone') return { status: 404, body: { message: 'That reading was not found.' } };
      return { body: { id: 'r1', status: 'done', reading: PAGE_READING, checks: { passed: true } } };
    }
    return { body: {} };
  };
}

const SCRIPTS = ['app.js', 'account.js', 'read-progress.js', 'scope-task.js', 'scope-hrcw.js', 'scope-conflicts.js', 'scope.js'];

// Signed in with a session kept in this browser, as after the email link.
function signedInPage(respond, stored = {}) {
  return loadPage(SCRIPTS, respond, { stored: { 'siteready.session': 'token', ...stored } });
}

async function readPasted(p) {
  p.document.getElementById('scope-file').files = [];
  p.document.getElementById('scope-text').value = 'Supply and fix roof sheeting.';
  p.document.getElementById('scope-read').click();
  await settle(60);
}

const results = (p) => p.document.getElementById('scope-results').innerHTML;
const body = (p) => p.document.body.innerHTML;

test('the session key the page tests use is the one account.js keeps', () => {
  assert.match(fs.readFileSync(path.join(__dirname, '../public/account.js'), 'utf8'), /SESSION_KEY = 'siteready.session'/);
});

test('while the AI reads, the bar shows a percentage and the steps; when done, a message with a button to choose the SWMS', async () => {
  // The bar as it is drawn while the reading runs.
  const bar = loadPage(['read-progress.js'], () => ({ body: {} }));
  const tracker = bar.run("SiteReadyProgress.track({ what: 'scope', lead: 'The AI is reading every word of the scope, including tables and appendices.', steps: ['reading every word of the scope', 'matching each work package to SiteReady\\'s job steps'] })");
  tracker.update({ stage: 'reading', elapsedSeconds: 30, stageSeconds: 30, expectedSeconds: 174 });
  const html = tracker.html();
  assert.match(html, /role="progressbar" aria-label="Reading the scope" aria-valuemin="0" aria-valuemax="100" aria-valuenow="20"/);
  assert.match(html, /<strong class="rp-pc">20%<\/strong>/);
  assert.match(html, /Step 1 of 2: reading every word of the scope/);
  assert.match(html, /For a scope this long it usually takes about 3 minutes\. You can leave this page open and come back\. A message shows when it is finished\./);
  assert.match(html, /<svg class="rp-worker-svg"/);
  assert.match(html, /class="meta rp-slow hidden"/);
  // The server saying less time has passed never moves the bar back.
  tracker.update({ stage: 'reading', elapsedSeconds: 5, stageSeconds: 5, expectedSeconds: 174 });
  assert.equal(tracker.value(), 20);
  // Past the expected time it says so, and still moves.
  tracker.update({ stage: 'steps', elapsedSeconds: 400, stageSeconds: 60, expectedSeconds: 174 });
  assert.match(tracker.html(), /Step 2 of 2: matching each work package to SiteReady&#39;s job steps/);
  assert.match(tracker.html(), /class="meta rp-slow">Taking longer than usual\. It is still reading\./);
  assert.ok(tracker.value() > 80 && tracker.value() <= 95);
  tracker.finish();
  assert.equal(tracker.value(), 100);

  // The scope page from start to finish.
  const p = signedInPage(server({ asks: [1, 2] }));
  await settle(40);
  p.document.title = 'SiteReady';
  p.document.hidden = true;
  await readPasted(p);
  const asked = p.calls.filter((call) => call.route.startsWith('/api/scope/ai/r1'));
  assert.equal(asked.length, 3, 'asked until done');
  assert.match(results(p), /The AI found 1 activities in 1 work packages/);
  assert.match(body(p), /<dialog class="read-done" id="read-done" role="alertdialog" aria-modal="true" aria-labelledby="read-done-title" aria-describedby="read-done-text">/);
  assert.match(body(p), /<h2 id="read-done-title">The scope has been read<\/h2>/);
  assert.match(body(p), /The AI has finished reading the scope\. You can now choose the SWMS you want to start on\./);
  assert.match(body(p), /<button type="button" data-read-done-go>Choose the SWMS<\/button>/);
  // While the page is not seen, the tab's title says it is ready; it is restored once seen.
  assert.equal(p.document.title, 'Ready: scope read | SiteReady');
  p.document.hidden = false;
  p.document.body.dispatchEvent(new FakeEvent('visibilitychange', { bubbles: true }));
  assert.equal(p.document.title, 'SiteReady');
  // Nothing is kept once the reading is done.
  assert.equal(p.window.localStorage.getItem('siteready-scope-reading'), null);
});

test('the chime is made in the browser, set up on the press that starts the reading, and silent when sound is blocked', async () => {
  const made = [];
  class FakeAudio {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; made.push(this); this.tones = 0; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createOscillator() { this.tones += 1; return { type: '', frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  }
  const p = signedInPage(server({ asks: [1] }));
  p.window.AudioContext = FakeAudio;
  await settle(40);
  await readPasted(p);
  await settle(20);
  assert.equal(made.length, 1, 'one sound set-up, made on the press');
  assert.equal(made[0].tones, 3, 'three notes');
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../public/read-progress.js'), 'utf8'), /\.(mp3|wav|ogg)\b|new Audio\(/);

  // Sound blocked: the message still shows.
  const q = signedInPage(server({ asks: [1] }));
  q.window.AudioContext = class { constructor() { throw new Error('blocked'); } };
  await settle(40);
  await readPasted(q);
  assert.match(body(q), /The scope has been read/);
});

test('a scope read before shows at once, with no bar and no message', async () => {
  const p = signedInPage(server({ start: 'done' }));
  await settle(40);
  await readPasted(p);
  assert.match(results(p), /The AI found 1 activities/);
  assert.doesNotMatch(body(p), /read-done/);
});

test('a failed reading stops the bar and shows the error as before, with no message', async () => {
  const p = signedInPage(server({ asks: [1], end: 'failed' }));
  await settle(40);
  await readPasted(p);
  assert.match(results(p), /class="read-progress" id="read-progress-\d+" data-state="failed"/);
  assert.match(results(p), /<span class="rp-stage" aria-live="polite">Stopped<\/span>/);
  assert.match(results(p), /The AI&#39;s answer could not be read\. Try again\. Or write the tasks in the Task box below\./);
  assert.doesNotMatch(results(p), /You can leave this page open/);
  assert.doesNotMatch(body(p), /read-done/);
});

test('a reading refused at the start (a trial ended) shows the error, and no "reading" note is left behind', async () => {
  const base = server({});
  const p = signedInPage((method, route, sent) => (route === '/api/scope/ai' && method === 'POST'
    ? { status: 402, body: { message: 'Your free trial has ended. Subscribe to keep downloading, saving and sharing SWMS.' } }
    : base(method, route, sent)));
  await settle(40);
  await readPasted(p);
  assert.equal(results(p), '');
  assert.equal(p.document.getElementById('scope-error').textContent, 'Your free trial has ended. Subscribe to keep downloading, saving and sharing SWMS.');
});

test('a reading still running when the page was left is picked up when the user comes back, and its message shows when found done', async () => {
  const p = signedInPage(server({ asks: [1] }), { 'siteready-scope-reading': JSON.stringify({ id: 'r1', state: 'nsw' }) });
  await settle(80);
  const asked = p.calls.filter((call) => call.route.startsWith('/api/scope/ai/r1'));
  assert.ok(asked.length >= 2);
  assert.match(asked[0].route, /state=nsw/);
  assert.equal(p.calls.filter((call) => call.route === '/api/scope/ai' && call.method === 'POST').length, 0, 'not read again');
  assert.match(results(p), /The AI found 1 activities/);
  assert.match(body(p), /The scope has been read/);
  assert.equal(p.window.localStorage.getItem('siteready-scope-reading'), null);

  // Found done at once on coming back: the message still shows.
  const q = signedInPage(server({}), { 'siteready-scope-reading': JSON.stringify({ id: 'r1', state: '' }) });
  await settle(80);
  assert.match(body(q), /The scope has been read/);

  // A reading that is gone is forgotten without a word.
  const r = signedInPage(server({ end: 'gone' }), { 'siteready-scope-reading': JSON.stringify({ id: 'r1', state: '' }) });
  await settle(80);
  assert.equal(r.document.getElementById('scope-error').textContent, '');
  assert.equal(r.window.localStorage.getItem('siteready-scope-reading'), null);
});

test('the methodology reading uses the same bar and says when its suggested steps are ready', () => {
  const script = fs.readFileSync(path.join(__dirname, '../public/method-read.js'), 'utf8');
  assert.match(script, /SiteReadyProgress\.track\(\{ what: 'methodology'/);
  assert.match(script, /SiteReady has finished reading the methodology\. The suggested job steps are ready to check\./);
  assert.match(script, /button: any \? 'Check the suggested steps'/);
});

// ---- The scope panel's wording (owner's items 2 and 3) ----

const INTRO = 'Attach the scope of works or your quote, or copy and paste the wording in the below box. The AI reads every word and lists the work packages in it that need a SWMS, and then you decide which ones you need.';

test('the scope panel says the user decides which work packages they need', () => {
  const page = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.ok(page.includes(INTRO));
  assert.doesNotMatch(page, /for you to confirm\. Sign in/);
  // The sign-in sentence is hidden until the account is known.
  assert.ok(page.includes('<span class="signed-out-only hidden"> Sign in, or start the free trial, to have a scope read.</span>'));
  assert.ok(page.includes('<span class="no-access-only hidden"> Your free trial has ended. Subscribe to have a scope read.</span>'));
  assert.match(page, /<script src="\/read-progress.js"><\/script>\s*<script src="\/method-read.js"><\/script>/);
});

// The page's spans for the sign-in sentences, found by their class as the browser does.
function withNotes(p) {
  const out = p.document.createElement('span');
  const noAccess = p.document.createElement('span');
  out.classList.add('signed-out-only', 'hidden');
  noAccess.classList.add('no-access-only', 'hidden');
  const all = p.document.querySelectorAll;
  p.document.querySelectorAll = (selector) => (selector === '.signed-out-only' ? [out] : selector === '.no-access-only' ? [noAccess] : all(selector));
  return { out, noAccess };
}

test('"Sign in, or start the free trial" shows only to someone signed out, and goes on signing in without a reload', async () => {
  // Signed in when the page opens: never shown.
  const p = signedInPage(server({}));
  const notes = withNotes(p);
  await settle(40);
  assert.equal(notes.out.classList.contains('hidden'), true);
  assert.equal(notes.noAccess.classList.contains('hidden'), true);

  // Signed out: shown. Signing in with Face ID on the same page hides it, with no reload.
  let signed = false;
  const base = server({});
  const q = loadPage(SCRIPTS, (method, route, sent) => {
    if (route === '/api/auth/passkey/login/options') return { body: { options: { challenge: 'AA' }, challengeId: 'c1' } };
    if (route === '/api/auth/passkey/login') { signed = true; return { body: { token: 'token' } }; }
    if (route === '/api/me' && !signed) return { status: 401, body: {} };
    return base(method, route, sent);
  });
  const shown = withNotes(q);
  await settle(40);
  assert.equal(shown.out.classList.contains('hidden'), false, 'signed out: shown');
  const buffer = () => new ArrayBuffer(1);
  q.window.navigator.credentials = {
    get: async () => ({ id: 'k', rawId: buffer(), type: 'public-key', response: { clientDataJSON: buffer(), authenticatorData: buffer(), signature: buffer(), userHandle: null }, getClientExtensionResults: () => ({}) }),
  };
  q.document.getElementById('faceid-signin').click();
  await settle(40);
  assert.equal(signed, true);
  assert.equal(shown.out.classList.contains('hidden'), true, 'signed in: hidden');
  // Signing out shows it again.
  q.document.getElementById('sign-out').click();
  await settle(40);
  assert.equal(shown.out.classList.contains('hidden'), false, 'signed out again: shown');

  // Signed in with the trial ended: the subscribe sentence instead.
  const s = signedInPage(server({ me: { hasAccess: false } }));
  const ended = withNotes(s);
  await settle(40);
  assert.equal(ended.out.classList.contains('hidden'), true);
  assert.equal(ended.noAccess.classList.contains('hidden'), false);

  // With accounts off, neither shows.
  const off = loadPage(SCRIPTS, (method, route) => (route === '/api/config' ? { body: { accounts: false } } : { body: {} }));
  const none = withNotes(off);
  await settle(40);
  assert.equal(none.out.classList.contains('hidden'), true);
  assert.equal(none.noAccess.classList.contains('hidden'), true);
});
