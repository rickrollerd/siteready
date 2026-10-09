// The download gate as the user answers (goals 2 and 8). The list "Before you can download this
// SWMS", its count and the note under each box change as soon as an answer passes, by the rule the
// server uses (public/gate-rules.js), not only when the draft is prepared again. The download buttons
// work once the list is empty, unless something typed since needs the draft prepared again, which
// the line beside them says. The server still checks before any download.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { gateChecks, downloadGaps } = require('../download-gate');
const { answerNeed, AS_GIVEN } = require('../public/gate-rules');
const { ANSWERED, ready } = require('./helpers');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

const FENCE = { state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no' };
// Live testing in a switchboard: two library lines with blanks, and emergency questions.
const LIVE = { state: 'qld', task: 'Test the switchboard live and fault find on energised circuits in the plant room.', fallRisk: 'no', facts: { energisedWork: 'testing', isolationProcedure: 'Isolate at the main switch, lock and tag, and test before touching.' } };
const AUTHORISED = 'Energised work is authorised by: ____________ (position), after consulting ____________ (position) for the person with management or control of the workplace, usually the principal contractor.';

// The answer a check judges, as the page reads it from its box.
function valueFor(check, input) {
  if (check.kind === 'line') return (input.fills || {})[check.key] || [];
  if (check.kind === 'site') return (input.site || {})[check.id.slice(5)];
  if (check.kind === 'emergency') return (input.emergency || {})[check.id.slice(10)];
  if (check.kind === 'fact') return (input.facts || {})[check.id.slice(5)];
  return input[check.id];
}

test('the page judges each answer by the same rule as the server, for every check it can judge', () => {
  const inputs = [
    FENCE,
    { ...FENCE, ...ANSWERED },
    { ...FENCE, ...ANSWERED, principalContractor: 'N/A', complianceResponsible: 'None', firstAider: 'TBC', musterPoint: 'To be confirmed', siteManager: 'To be completed', site: { liveServices: 'none', publicInterface: '?', otherTrades: '____', ground: 'Not applicable', access: 'None' } },
    ready({ ...LIVE, ...ANSWERED }),
    ready({ ...LIVE, ...ANSWERED, emergency: { electricalRescue: 'N/A', electricalIsolate: 'unknown' }, fills: { [AUTHORISED]: ['Electrical supervisor'] } }),
    { ...ready({ ...LIVE, ...ANSWERED }), facts: { ...LIVE.facts, isolationProcedure: 'Isolate at ____ and lock it.' } },
  ];
  let judged = 0;
  for (const input of inputs) {
    const body = draftBody(input);
    const draft = prepareDraft(body);
    assert.equal(draft.kind, 'draft');
    const checks = gateChecks(body, draft);
    for (const check of checks.filter((item) => item.rule)) {
      assert.equal(answerNeed(check.rule, valueFor(check, body)), check.need, `${check.id} in ${input.task}`);
      judged += 1;
    }
    // What still needs doing is the checks that did not pass.
    assert.deepEqual(downloadGaps(body, draft).map((gap) => gap.id), checks.filter((check) => check.need).map((check) => check.id));
  }
  assert.ok(judged > 60, `${judged} answers judged`);
});

test('the rule clears an answer as it is typed and brings the need back if it is taken out', () => {
  const field = { ask: 'Name the principal contractor.', name: 'Principal contractor', none: true };
  assert.equal(answerNeed(field, ''), 'Name the principal contractor.');
  assert.equal(answerNeed(field, 'C'), '');
  assert.equal(answerNeed(field, 'Not applicable'), '');
  assert.match(answerNeed({ ...field, none: false }, 'n/a'), /cannot be "n\/a"/);
  assert.match(answerNeed(field, 'TBC'), /is not an answer yet/);
  const emergency = { ask: 'Who isolates the supply?', emergency: true, involves: 'live electrical work' };
  assert.match(answerNeed(emergency, 'N/A'), /^"N\/A" is not an answer here: this SWMS involves live electrical work/);
  assert.equal(answerNeed(emergency, 'No one touches the person until the supply is off.'), '');
  const line = { ask: 'Fill in the blank.', line: 'Authorised by ____ after consulting ____' };
  assert.equal(answerNeed(line, ['Supervisor']), 'Fill in the blank.', 'one blank of two');
  assert.equal(answerNeed(line, ['Supervisor', '____']), 'Fill in the blank.', 'a blank typed is not an answer');
  assert.equal(answerNeed(line, ['Supervisor', 'site manager.']), '');
  assert.equal(answerNeed({ optional: true }, ''), '');
  assert.match(answerNeed({ optional: true }, 'To be advised'), /Fill it in, or leave the box empty/);
});

// What the SWMS reads for its hazards, steps and plant.
const shape = (draft, withControls = true) => JSON.stringify({
  highRisk: draft.highRisk,
  steps: (draft.jobSteps || []).map((step) => [step.step, step.hazards, withControls ? step.controls : step.controls.length]),
  questions: (draft.emergencyQuestions || []).map((item) => item.id),
  plant: draft.plantInferred,
  ppe: draft.ppe,
});

test('the answers that need no new draft change nothing in the SWMS but where they print; a site answer can', () => {
  assert.deepEqual(AS_GIVEN.filter((key) => !['emergency', 'fills'].includes(key)).sort(), ['complianceResponsible', 'firstAider', 'hospital', 'musterPoint', 'preparedBy', 'principalContractor', 'reviewDate', 'reviewer', 'scaffoldSupervisor', 'siteManager', 'swmsRef', 'workplace', 'worksManager', 'worksManagerPhone'].sort());
  const people = { workplace: '12 Smith Street, Paddington QLD 4064', principalContractor: 'Not applicable', complianceResponsible: 'Sam Lee', reviewer: 'Jo Doe', scaffoldSupervisor: 'Pat Doyle', firstAider: 'Jo Smith', musterPoint: 'Front gate', siteManager: 'Kim', worksManager: 'Lee', worksManagerPhone: '0400 000 000', hospital: 'Royal Brisbane', reviewDate: '1 December 2026', preparedBy: 'Sam Lee', swmsRef: 'SW-12' };
  const tasks = [FENCE, LIVE,
    { state: 'nsw', task: 'Erect a mobile scaffold and paint the ceiling of the foyer.', fallRisk: 'yes', facts: { safetyDataSheet: 'The paint safety data sheet is kept at the work area.', fallControl: 'Mobile scaffold with full guardrails, wheels locked.' } },
    { state: 'qld', task: 'Dig a 1.8 m deep trench with an excavator for the stormwater pipe.', fallRisk: 'no', facts: { trenchSupport: 'Trench shields designed by the supplier\'s engineer.' } },
    { state: 'vic', task: 'Install ceiling grid in the level 2 fit out.', fallRisk: 'no' }];
  for (const task of tasks) {
    const base = ready(task);
    const blank = prepareDraft(draftBody(base));
    assert.equal(blank.kind, 'draft', task.task);
    assert.equal(shape(prepareDraft(draftBody({ ...base, ...people }))), shape(blank), task.task);
    const emergency = Object.fromEntries((blank.emergencyQuestions || []).map((item) => [item.id, 'The supervisor calls 000 and isolates the supply.']));
    assert.equal(shape(prepareDraft(draftBody({ ...base, emergency }))), shape(blank), `${task.task}: emergency answers`);
  }
  // Words typed in a control line's blanks go into that line only.
  const live = ready(LIVE);
  assert.equal(shape(prepareDraft(draftBody({ ...live, fills: { [AUTHORISED]: ['Electrical supervisor', 'Site manager'] } })), false), shape(prepareDraft(draftBody(live)), false));
  // A site answer is read for the hazards, so the draft is prepared again before it prints.
  const fence = ready(FENCE);
  assert.notEqual(shape(prepareDraft(draftBody({ ...fence, site: { publicInterface: 'Traffic on the road beside the work.' } }))), shape(prepareDraft(draftBody(fence))));
});

// ---- The page ----

// The server's answer to /api/draft for what the page sends: the switchboard task with the site
// questions answered and the plant confirmed before the draft, and the people, emergency answers and
// blanks as typed on the page.
const LIVE_READY = ready({ ...LIVE, site: ANSWERED.site });
function server(body) {
  const input = { ...LIVE_READY, ...Object.fromEntries(AS_GIVEN.map((key) => [key, body[key]])) };
  const draft = prepareDraft(draftBody(input));
  const checks = gateChecks(draftBody(input), draft);
  return { ...draft, controlLegal: draft.jobSteps.map((step) => step.controls.map(() => '')), gate: checks.filter((check) => check.need).map(({ rule: _rule, ...gap }) => gap), gateChecks: checks };
}

function respond(method, route, body) {
  if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
  if (route === '/api/me') return { body: { user: { email: 'a@b.example', name: 'Sam' }, company: { name: 'Co', abn: '1', hasAccess: true, planStatus: 'active' } } };
  if (route === '/api/sites') return { body: { sites: [] } };
  if (route === '/api/steps') return { body: { groups: [] } };
  if (route === '/api/draft') return { body: server(body) };
  if (route === '/api/draft/questions') return { body: { required: [], steps: { chosen: [] } } };
  if (route === '/api/draft.docx') return { headers: { 'content-type': 'application/octet-stream', 'x-siteready-swms': 's1', 'x-siteready-revision': '1', 'x-siteready-title': 'Switchboard' } };
  return { body: {} };
}

// Typing in a box. A box in the draft (an emergency answer, a blank) is heard by the draft's own
// listeners, as the event bubbles through it in a browser.
const type = (p, id, value, inDraft = null) => {
  const box = p.document.getElementById(id);
  box.value = value;
  const event = new FakeEvent('input', { bubbles: true });
  if (!inDraft) { box.dispatchEvent(event); return; }
  Object.assign(box.dataset, inDraft.dataset);
  box.closest = (selector) => (selector === inDraft.selector ? box : null);
  event.target = box;
  p.document.getElementById('result').dispatchEvent(event);
};
const listCount = (p) => (p.document.getElementById('result-gate').innerHTML.match(/<li>/g) || []).length;
const topLine = (p) => p.document.getElementById('result-gate-top').innerHTML;

test('on the page, the list and its count drop each item as it is answered, and the buttons work once it is empty', async () => {
  const p = loadPage(['gate-rules.js', 'app.js', 'account.js'], respond, { stored: { 'siteready.session': 'token' } });
  await settle();
  p.document.getElementById('task').value = LIVE.task;
  // The site questions were answered before the draft was prepared.
  for (const [id, value] of Object.entries(ANSWERED.site)) p.document.getElementById(`site-${id}`).value = value;
  p.document.getElementById('facts').dispatchEvent(new FakeEvent('submit'));
  await settle();
  const draft = server({});
  const first = draft.gate.length;
  assert.ok(draft.gate.some((gap) => gap.kind === 'emergency') && draft.gate.some((gap) => gap.kind === 'line') && draft.gate.some((gap) => gap.id === 'principalContractor'), 'people, emergency questions and blanks are asked');
  assert.equal(listCount(p), first);
  assert.match(topLine(p), new RegExp(`${first} items need dealing with`));
  p.document.getElementById('new-confirm').checked = true;
  p.document.getElementById('new-confirm').dispatchEvent(new FakeEvent('change'));
  p.document.getElementById('new-name').value = 'Sam Lee';
  p.document.getElementById('new-name').dispatchEvent(new FakeEvent('input'));
  assert.equal(p.document.getElementById('new-docx').disabled, true);

  // One answer: the item comes off the list and the count drops at once, with no new draft.
  const drafts = () => p.calls.filter((call) => call.route === '/api/draft').length;
  const before = drafts();
  type(p, 'principal', 'Corbel Build Pty Ltd');
  assert.equal(listCount(p), first - 1);
  assert.match(topLine(p), new RegExp(`${first - 1} items need`));
  assert.doesNotMatch(p.document.getElementById('result-gate').innerHTML, /Principal contractor</);
  // Taken out again, it is back.
  type(p, 'principal', '');
  assert.equal(listCount(p), first);
  // "Not applicable" is not an answer to an emergency question: the item stays, saying why.
  const question = draft.gate.find((gap) => gap.kind === 'emergency');
  type(p, question.field, 'N/A', { selector: '[data-emergency]', dataset: { emergency: question.id.slice(10) } });
  assert.match(p.document.getElementById('result-gate').innerHTML, /&quot;N\/A&quot; is not an answer here/);

  // Everything answered: the list goes and the buttons work, still with no new draft.
  type(p, 'principal', 'Corbel Build Pty Ltd');
  for (const [id, value] of [['workplace', '14 Ferndale Street, Herston QLD 4006'], ['compliance-responsible', 'Larry Lead, supervisor'], ['reviewer', 'Wendy Works'], ['first-aider', 'Fiona Aid'], ['muster-point', 'Gate 2 car park']]) type(p, id, value);
  for (const gap of draft.gate.filter((item) => item.kind === 'emergency')) type(p, gap.field, `${gap.label} answer for this site.`, { selector: '[data-emergency]', dataset: { emergency: gap.id.slice(10) } });
  for (const gap of draft.gate.filter((item) => item.kind === 'line')) {
    for (let n = 0; n < gap.parts.length - 1; n += 1) type(p, `fill-${gap.id}-${n}`, 'Electrical supervisor', { selector: '.blank-input', dataset: { fillKey: gap.key, fillN: String(n) } });
  }
  assert.equal(listCount(p), 0);
  assert.equal(p.document.getElementById('result-gate').innerHTML, '');
  assert.equal(topLine(p), '');
  assert.equal(p.document.getElementById('new-docx').disabled, false);
  assert.equal(p.document.getElementById('new-gate-note').classList.contains('hidden'), true);
  assert.equal(drafts(), before, 'no new draft was needed');

  // The download sends the answers as they are now, and the server, judging them again, passes them.
  p.document.getElementById('new-docx').click();
  await settle();
  const sent = p.calls.find((call) => call.route === '/api/draft.docx').body;
  assert.equal(sent.principalContractor, 'Corbel Build Pty Ltd');
  assert.equal(sent.musterPoint, 'Gate 2 car park');
  assert.ok(Object.values(sent.emergency).every((answer) => /answer for this site/.test(answer)));
  assert.ok(Object.values(sent.fills).every((answers) => answers.every((answer) => answer === 'Electrical supervisor')));
  const input = { ...LIVE_READY, ...Object.fromEntries(AS_GIVEN.map((key) => [key, sent[key]])) };
  assert.deepEqual(downloadGaps(draftBody(input), prepareDraft(draftBody(input))), []);
});

test('on the page, a change that needs a new draft says so beside the buttons, which wait for it', async () => {
  const p = loadPage(['gate-rules.js', 'app.js', 'account.js'], (method, route, body) => (route === '/api/draft' ? { body: { ...server({ ...ANSWERED, ...body }), gate: [], gateChecks: [] } } : respond(method, route, body)), { stored: { 'siteready.session': 'token' } });
  await settle();
  p.document.getElementById('task').value = LIVE.task;
  p.document.getElementById('facts').dispatchEvent(new FakeEvent('submit'));
  await settle();
  p.document.getElementById('new-confirm').checked = true;
  p.document.getElementById('new-confirm').dispatchEvent(new FakeEvent('change'));
  p.document.getElementById('new-name').value = 'Sam Lee';
  p.document.getElementById('new-name').dispatchEvent(new FakeEvent('input'));
  assert.equal(p.document.getElementById('new-docx').disabled, false);
  // A person's name prints as given: nothing more is needed.
  type(p, 'first-aider', 'Fiona Aid');
  assert.equal(p.document.getElementById('new-docx').disabled, false);
  // The work itself changed: the draft is prepared again before it prints.
  type(p, 'task', `${LIVE.task} Replace the main switch.`);
  assert.equal(p.document.getElementById('new-docx').disabled, true);
  const note = p.document.getElementById('new-gate-note');
  assert.equal(note.classList.contains('hidden'), false);
  assert.match(note.innerHTML, /^Press Update the draft to put your answers in the SWMS\. <button type="button" class="link" data-gate-update>Update the draft<\/button>$/);
  // Update the draft prepares it again, and the buttons work.
  const update = p.document.getElementById('gate-redraw');
  update.closest = (selector) => (selector.includes('[data-gate-update]') ? update : null);
  update.click();
  await settle();
  assert.equal(p.calls.filter((call) => call.route === '/api/draft').length, 2);
  p.document.getElementById('new-confirm').checked = true;
  p.document.getElementById('new-confirm').dispatchEvent(new FakeEvent('change'));
  p.document.getElementById('new-name').value = 'Sam Lee';
  p.document.getElementById('new-name').dispatchEvent(new FakeEvent('input'));
  assert.equal(p.document.getElementById('new-docx').disabled, false);
});
