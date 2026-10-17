// The check panel under the draft (public/human-check.js, D286), run in the browser stand-in:
// SiteWrite's check first (must-fix items keep the parts locked), then each part ticked, a name and a
// role. A change to a part after it is ticked clears that tick with a line saying so; the server's
// refusal of a stale tick does the same. The ticks stay while the draft is prepared again unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage, settle, FakeEvent, checkAll, selfCheck } = require('./fake-dom');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { gateChecks } = require('../download-gate');
const { AS_GIVEN } = require('../public/gate-rules');
const { ANSWERED, ready } = require('./helpers');

const FENCE = ready({ ...ANSWERED, state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no' });
// What the page sends, on top of the fence as answered: its own changes, and the answers typed.
const inputFor = (body = {}) => ({
  ...FENCE,
  ...Object.fromEntries(AS_GIVEN.filter((key) => body[key] && (typeof body[key] !== 'object' || Object.keys(body[key]).length)).map((key) => [key, body[key]])),
  controlEdits: body.controlEdits, hazardEdits: body.hazardEdits, whoEdits: body.whoEdits,
});
function draftFor(body) {
  const input = draftBody(inputFor(body));
  const draft = prepareDraft(input);
  const checks = gateChecks(input, draft);
  return { ...draft, controlLegal: draft.jobSteps.map((step) => step.controls.map(() => '')), gate: checks.filter((check) => check.need).map(({ rule: _rule, ...gap }) => gap), gateChecks: checks };
}

function respond(extra = () => null) {
  return async (method, route, body) => {
    const own = await extra(method, route, body);
    if (own) return own;
    if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
    if (route === '/api/me') return { body: { user: { email: 'a@b.example', name: 'Sam Lee' }, company: { name: 'Co', abn: '1', hasAccess: true, planStatus: 'active' } } };
    if (route === '/api/sites') return { body: { sites: [] } };
    if (route === '/api/steps') return { body: { groups: [] } };
    if (route === '/api/draft') return { body: draftFor(body) };
    if (route === '/api/draft/check') return { body: selfCheck(inputFor(body)) };
    if (route === '/api/draft/questions') return { body: { required: [], steps: { chosen: [] } } };
    if (route === '/api/draft.docx') return { headers: { 'content-type': 'application/octet-stream', 'x-sitewrite-swms': 's1', 'x-sitewrite-revision': '1', 'x-sitewrite-title': 'Fence' } };
    return { body: {} };
  };
}

async function shown(extra) {
  const p = loadPage(['gate-rules.js', 'app.js', 'account.js'], respond(extra), { stored: { 'sitewrite.session': 'token' } });
  await settle();
  p.document.getElementById('task').value = FENCE.task;
  // The people and site answers are on the page, as a user gives them.
  for (const [id, value] of [['workplace', ANSWERED.workplace], ['principal', ANSWERED.principalContractor], ['compliance-responsible', ANSWERED.complianceResponsible], ['reviewer', ANSWERED.reviewer], ['first-aider', ANSWERED.firstAider], ['muster-point', ANSWERED.musterPoint], ['hospital', ANSWERED.hospital], ['works-manager', ANSWERED.worksManager], ['works-manager-phone', ANSWERED.worksManagerPhone]]) p.document.getElementById(id).value = value;
  for (const [id, value] of Object.entries(ANSWERED.site)) p.document.getElementById(`site-${id}`).value = value;
  p.document.getElementById('facts').dispatchEvent(new FakeEvent('submit'));
  await settle();
  return p;
}
const el = (p, id) => p.document.getElementById(id);
const note = (p) => el(p, 'new-gate-note').innerHTML;

test('SiteWrite\'s check shows its score and findings, then the parts unlock in order', async () => {
  const p = await shown();
  const self = el(p, 'new-check-self').innerHTML;
  assert.match(self, /<strong>\d+ out of 100<\/strong> \((Accepted|Accepted with changes)\)\. Nothing must be fixed\./);
  assert.match(self, /Other findings \(\d+\), for you to judge/);
  assert.equal(el(p, 'new-part-steps').disabled, false);
  assert.equal(el(p, 'new-docx').disabled, true);
  // The name is filled from the account; the role is asked for.
  assert.equal(el(p, 'new-name').value, 'Sam Lee');
  assert.equal(note(p), 'To download or save, tick each part as checked, give your role and tick the last box.');
  const html = el(p, 'result-actions').innerHTML;
  const order = ['Job steps', 'Hazards and controls', 'Plant', 'Emergency', 'Site details', 'Your name (printed on the SWMS)', 'Your role (printed on the SWMS)', 'I understand this is a draft.'].map((text) => html.indexOf(text));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), 'the parts, then the name, role and date, then the acknowledgement last');
});

test('a must-fix item keeps the parts locked and the buttons off, and says what to fix', async () => {
  const p = await shown((method, route, body) => (route === '/api/draft/check' ? { body: { ...selfCheck(inputFor(body)), builder: { score: 70, band: 'Not accepted', mustFix: [{ rule: 'H5', title: 'Controls are definite', message: 'Controls for high risk hazards leave the decision to the worker: "Be careful near the edge."' }], findings: [] } } } : null));
  assert.match(el(p, 'new-check-self').innerHTML, /Fix this before you can tick the parts:<\/strong><\/p><ul><li>Controls for high risk hazards leave the decision to the worker: &quot;Be careful near the edge\.&quot; <button type="button" class="link" data-must-go="new" data-must-n="0">Go to Job steps<\/button><\/li><\/ul><p class="meta">Go to it and fix it there\. SiteWrite then checks the draft again\.<\/p>/);
  assert.equal(el(p, 'new-part-hazards').disabled, true);
  checkAll(p);
  assert.equal(el(p, 'new-part-hazards').checked, false, 'a tick does not take while it is locked');
  assert.equal(el(p, 'new-docx').disabled, true);
  assert.equal(note(p), 'Fix the must-fix item SiteWrite&#39;s check found above.');
});

test('a name with no role waits for the role', async () => {
  const p = await shown();
  checkAll(p, 'new', { role: '' });
  assert.equal(el(p, 'new-docx').disabled, true);
  assert.equal(note(p), 'To download or save, give your role.');
  el(p, 'new-role').value = 'Leading hand';
  el(p, 'new-role').dispatchEvent(new FakeEvent('input'));
  assert.equal(el(p, 'new-docx').disabled, false);
});

test('a control changed after ticking clears only Hazards and controls, which is ticked again', async () => {
  const p = await shown();
  checkAll(p);
  assert.equal(el(p, 'new-docx').disabled, false);
  const step = prepareDraft(draftBody(FENCE)).jobSteps[1];
  p.run(`applyLineEdit(shownDraft.jobSteps[1], ${JSON.stringify(step.controls[0])}, 'Old palings are stacked on pallets as they come off.')`);
  await settle();
  assert.equal(el(p, 'new-part-hazards').checked, false);
  for (const id of ['steps', 'plant', 'emergency', 'site']) assert.equal(el(p, `new-part-${id}`).checked, true, `${id} stays ticked`);
  assert.equal(el(p, 'new-check-stale').textContent, 'You changed the hazards and controls after ticking them. Tick them again.');
  assert.equal(el(p, 'new-docx').disabled, true);
  assert.equal(note(p), 'To download or save, tick Hazards and controls as checked.');
  el(p, 'new-part-hazards').checked = true;
  el(p, 'new-part-hazards').dispatchEvent(new FakeEvent('change'));
  assert.equal(el(p, 'new-docx').disabled, false);
  el(p, 'new-docx').click();
  await settle();
  const sent = p.calls.find((call) => call.route === '/api/draft.docx').body.check;
  assert.deepEqual(Object.keys(sent).sort(), ['ack', 'name', 'partHashes', 'parts', 'role']);
  assert.equal(sent.role, 'Supervisor');
  assert.equal(sent.partHashes.hazards, selfCheck(inputFor(p.calls.filter((call) => call.route === '/api/draft/check').pop().body)).partHashes.hazards);
});

test('the ticks stay when the draft is prepared again unchanged (Back, then Prepare)', async () => {
  const p = await shown();
  checkAll(p);
  p.document.getElementById('facts').dispatchEvent(new FakeEvent('submit'));
  await settle();
  for (const id of ['steps', 'hazards', 'plant', 'emergency', 'site']) assert.equal(el(p, `new-part-${id}`).checked, true);
  assert.equal(el(p, 'new-confirm').checked, true);
  assert.equal(el(p, 'new-docx').disabled, false);
  // Kept on the device for a reload.
  assert.ok(JSON.parse(p.window.localStorage.getItem('sitewrite.check'))[`draft::${FENCE.task.toLowerCase()}`].ticks.site);
});

test('the server\'s refusal of a stale tick unticks the part and says so', async () => {
  const p = await shown((method, route) => (route === '/api/draft.docx' ? { status: 409, body: { kind: 'error', message: 'You changed the site details after ticking them. Tick them again.', field: 'parts', stale: ['site'] } } : null));
  checkAll(p);
  el(p, 'new-docx').click();
  await settle();
  assert.equal(el(p, 'new-part-site').checked, false);
  assert.equal(el(p, 'new-check-stale').textContent, 'You changed the site details after ticking them. Tick them again.');
  assert.match(el(p, 'new-status').textContent, /You changed the site details after ticking them/);
  assert.equal(el(p, 'new-docx').disabled, true);
});

test('a role typed on after the last tick is recorded as typed, not as its first letter (messy round 5)', async () => {
  const p = await shown();
  const seen = [];
  p.window.SiteWrite.onCheckDone = (_input, check) => seen.push(check ? check.role : null);
  checkAll(p, 'new', { role: 'f' });
  for (const role of ['fo', 'foreman']) {
    el(p, 'new-role').value = role;
    el(p, 'new-role').dispatchEvent(new FakeEvent('input'));
  }
  // Typed in lower case, it is recorded with its capital (sl9: "Checked by rory haddleton, foreman").
  assert.equal(seen[seen.length - 1], 'Foreman');
  assert.ok(seen.includes('F'), 'each change is told, the last one as typed');
});
