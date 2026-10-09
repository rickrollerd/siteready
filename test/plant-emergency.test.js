// Goal 2 (owner, 7 October 2026): every SWMS names the plant to be used and the activity-specific
// emergency response. The plant SiteReady lists is a tick list the user confirms before download,
// and only the plant confirmed prints (register.js). For each high risk category the SWMS involves,
// the one or two facts a reviewer looks for are asked and printed in the emergency arrangements
// (emergency.js). Both are in the download gate (download-gate.js). The draft on screen shows the
// response line of a step still High after its controls, and the note naming the earlier step whose
// controls also apply, as the Word and PDF files do.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { app } = require('../server');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps } = require('../download-gate');
const { sharedNote } = require('../docx-draft');
const { QUESTIONS, emergencyQuestions } = require('../emergency');
const { setupAccounts, lastLinkToken, ANSWERED, ready } = require('./helpers');
const { loadPage, settle } = require('./fake-dom');

const EWP = { ...ANSWERED, state: 'qld', task: 'Install cable trays and pull cables through the ward ceilings and risers from scissor lifts.', fallRisk: 'yes', residential: 'no', facts: { fallControl: 'Scissor lifts with guardrails for all work above 2 m.', controlsConsidered: 'A scaffold is not practicable in the ward ceilings.' } };
const TRENCH = { ...ANSWERED, state: 'qld', task: 'Excavate a trench 2.5 m deep with an excavator and lay a 300 mm sewer main, with a trench shield.', fallRisk: 'no', residential: 'no', facts: { trenchSupport: 'Trench shield to 3 m, installed as digging goes.' } };
const EWP_ANSWERS = { ewpLower: 'Larry Leadinghand, leading hand, trained on the ground controls', ewpControls: 'Ground control panel at the rear of the base, key in the ignition', plantStop: 'The operator presses the red emergency stop on the platform' };
const TRENCH_ANSWERS = { trenchRescue: 'No one enters: lifted out from the top with the harness and line by Dave Digger', trenchKit: 'Tripod, winch, harness and line at the trench box', confinedRescue: 'Sam Spotter at the manhole, retrieval from outside by tripod and winch', confinedKit: 'Tripod and winch, harness and lifeline, gas detector at the entry', plantStop: 'The operator rests the bucket and turns the key off' };

const build = (input) => {
  const body = draftBody(input);
  const draft = prepareDraft(body);
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  return { draft, gaps: downloadGaps(body, draft) };
};
const ids = (input) => build(input).gaps.map((gap) => gap.id);
const names = (draft) => draft.plant.map((row) => row.item);

test('the plant SiteReady lists is asked about, not guessed: unconfirmed plant is one more item before download', () => {
  const { draft, gaps } = build({ ...EWP, emergency: EWP_ANSWERS });
  assert.deepEqual(draft.plantInferred, [{ item: 'Scissor lift', maybe: false }, { item: 'Cable winch or puller', maybe: false }, { item: 'Ladders', maybe: false }, { item: 'Forklift', maybe: true }]);
  // The preview still shows what SiteReady found, the forklift hedged.
  assert.deepEqual(names(draft), ['Scissor lift', 'Cable winch or puller', 'Ladders', 'Forklift']);
  assert.match(draft.plant.find((row) => row.item === 'Forklift').licence, /where one is used/);
  assert.deepEqual(gaps.map((gap) => gap.id), ['plant']);
  assert.equal(gaps[0].field, 'plant-ticks');
  assert.equal(gaps[0].label, 'Plant and equipment');
  assert.match(gaps[0].need, /press Confirm the plant/);
});

test('only the plant confirmed prints: unticked rows drop, ticked "where one is used" rows become plain, and the user adds their own', () => {
  const choice = { used: ['Scissor lift', 'Cable winch or puller', 'Forklift'], notUsed: ['Ladders'], added: [{ item: 'Battery cable drum trailer', licence: 'No. Operator trained in its use' }, { item: 'Telehandler', licence: '' }] };
  const { draft, gaps } = build({ ...EWP, emergency: EWP_ANSWERS, plantChoice: choice });
  assert.deepEqual(gaps, []);
  assert.deepEqual(names(draft), ['Scissor lift', 'Cable winch or puller', 'Forklift', 'Battery cable drum trailer', 'Telehandler']);
  assert.equal(draft.plant.find((row) => row.item === 'Forklift').licence, 'Yes (LF)');
  assert.ok(!draft.plant.some((row) => /where one is used/.test(row.licence)));
  // The forklift's licence is needed, as it is used.
  assert.ok(draft.qualifications.includes('High risk work licence: forklift (LF)'), draft.qualifications.join('; '));
  // An item of the user's own that SiteReady knows takes its notes; another takes the pre-start check and the licence given.
  const own = draft.plant.find((row) => row.item === 'Battery cable drum trailer');
  assert.equal(own.inspection, "Pre-start check each shift. Serviced to the manufacturer's instructions. Drum shaft, brakes and hitch checked.");
  assert.equal(own.licence, 'No. Operator trained in its use');
  const jacks = build({ ...EWP, emergency: EWP_ANSWERS, plantChoice: { ...choice, added: [{ item: 'Cable drum jacks', licence: 'No' }] } }).draft.plant.find((row) => row.item === 'Cable drum jacks');
  assert.deepEqual(jacks, { item: 'Cable drum jacks', inspection: "Pre-start check each shift. Serviced to the manufacturer's instructions.", licence: 'No', own: true });
  assert.match(draft.plant.find((row) => row.item === 'Telehandler').licence, /^No Schedule 3 class names telehandlers/);
  // Unticked, the forklift and its licence are gone.
  const without = build({ ...EWP, emergency: EWP_ANSWERS, plantChoice: { used: ['Scissor lift', 'Cable winch or puller'], notUsed: ['Ladders', 'Forklift'], added: [] } }).draft;
  assert.deepEqual(names(without), ['Scissor lift', 'Cable winch or puller']);
  assert.ok(!without.qualifications.some((line) => /forklift/i.test(line)));
});

test('plant listed after the user confirmed is asked about, and an unknown item of their own needs its licence', () => {
  const choice = { used: ['Scissor lift'], notUsed: [], added: [] };
  const { gaps } = build({ ...EWP, emergency: EWP_ANSWERS, plantChoice: choice });
  assert.deepEqual(gaps.map((gap) => gap.id), ['plant']);
  assert.match(gaps[0].need, /^SiteReady now also lists Cable winch or puller, Ladders, Forklift\. Tick each one if your crew uses it/);
  const own = build({ ...EWP, emergency: EWP_ANSWERS, plantChoice: { used: ['Scissor lift'], notUsed: ['Cable winch or puller', 'Ladders', 'Forklift'], added: [{ item: 'Cable drum jacks', licence: '' }] } });
  assert.deepEqual(own.gaps.map((gap) => gap.id), ['plant']);
  assert.match(own.gaps[0].need, /Give the licence or ticket to operate Cable drum jacks, or write No/);
});

test('each high risk category asks the facts a reviewer looks for, and "Not applicable" is not an answer', () => {
  const ewp = build({ ...EWP, plantChoice: { used: ['Scissor lift', 'Cable winch or puller', 'Ladders'], notUsed: ['Forklift'], added: [] } });
  // An EWP asks who lowers it and where the ground controls are; its rescue covers the fall.
  assert.deepEqual(ewp.draft.emergencyQuestions.map((item) => item.id), ['ewpLower', 'ewpControls', 'plantStop']);
  assert.deepEqual(ewp.gaps.map((gap) => gap.id), ['emergency.ewpLower', 'emergency.ewpControls', 'emergency.plantStop']);
  assert.deepEqual(ewp.gaps.map((gap) => gap.label), ['Emergency, EWP: Lowered in an emergency by', 'Emergency, EWP: Ground controls and key', 'Emergency, mobile plant: Stopped by']);
  assert.deepEqual(ewp.gaps.map((gap) => gap.field), ['emg-ewpLower', 'emg-ewpControls', 'emg-plantStop']);
  for (const value of ['Not applicable', 'N/A', 'None', 'na', 'No']) {
    const found = build({ ...EWP, plantChoice: { used: ['Scissor lift'], notUsed: ['Cable winch or puller', 'Ladders', 'Forklift'], added: [] }, emergency: { ...EWP_ANSWERS, ewpLower: value } }).gaps;
    assert.deepEqual(found.map((gap) => gap.id), ['emergency.ewpLower'], value);
    assert.match(found[0].need, /is not an answer here: this SWMS involves an elevating work platform/);
  }
  for (const value of ['TBC', 'To be advised', '____', '?']) {
    assert.deepEqual(build({ ...EWP, plantChoice: { used: ['Scissor lift'], notUsed: ['Cable winch or puller', 'Ladders', 'Forklift'], added: [] }, emergency: { ...EWP_ANSWERS, ewpControls: value } }).gaps.map((gap) => gap.id), ['emergency.ewpControls'], value);
  }
  // A trench asks for a rescue without entry and the rescue equipment; this one is a sewer, a confined space too.
  const trench = build(ready(TRENCH));
  assert.deepEqual(trench.draft.emergencyQuestions.map((item) => item.id), ['trenchRescue', 'trenchKit', 'confinedRescue', 'confinedKit', 'plantStop']);
  // An answer that starts with "No one" is still an answer.
  assert.deepEqual(build({ ...ready(TRENCH), emergency: TRENCH_ANSWERS }).gaps, []);
  // Without an EWP, a fall asks for the rescue of a person who falls or hangs in a harness.
  const roof = build(ready({ ...ANSWERED, state: 'qld', task: 'Replace the metal roof sheets on a two storey house, 7 m to the eaves.', fallRisk: 'yes', residential: 'yes', facts: { fallControl: 'Scaffold with edge protection at the eaves, and safety mesh under the new sheets.', controlsConsidered: 'Guardrails at every edge.' } }));
  assert.ok(roof.draft.emergencyQuestions.some((item) => item.id === 'fallRescue'), roof.draft.emergencyQuestions.map((item) => item.id).join());
  assert.ok(!roof.draft.emergencyQuestions.some((item) => /^ewp/.test(item.id)));
  // Energised electrical work asks who isolates and where the isolator is.
  const live = build(ready({ ...ANSWERED, state: 'qld', task: 'Test the switchboard live and fault find on energised circuits in the plant room.', fallRisk: 'no', facts: { energisedWork: 'testing', isolationProcedure: 'Isolate at the main switch, lock and tag, and test before touching.' } }));
  assert.deepEqual(live.draft.emergencyQuestions.map((item) => item.id).filter((id) => /^elec/.test(id)), ['elecIsolate', 'elecIsolator']);
  // A task with no such category asks nothing.
  assert.deepEqual(build(ready({ ...ANSWERED, state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no' })).draft.emergencyQuestions, []);
  // Every question has a source in the codes we hold, and plain words.
  for (const item of QUESTIONS) {
    assert.match(item.source, /Code|Reg/, item.id);
    assert.ok(!/\u2014/.test(`${item.ask}${item.hint}${item.short}`), item.id);
  }
});

test('the answers print in the emergency row of their category, not only the heading', () => {
  const { draft } = build({ ...ready(TRENCH), emergency: TRENCH_ANSWERS });
  const row = (type) => draft.emergency.find((item) => item.type === type);
  assert.equal(row('Trench').detail, 'Rescue: No one enters: lifted out from the top with the harness and line by Dave Digger\nRescue equipment: Tripod, winch, harness and line at the trench box');
  assert.equal(row('Confined space').detail, 'Stand-by person and rescue: Sam Spotter at the manhole, retrieval from outside by tripod and winch\nRescue equipment at the entry: Tripod and winch, harness and lifeline, gas detector at the entry');
  // Moving plant has a row of its own, citing the plant code in Queensland only.
  assert.match(row('Mobile plant').equipment, /Emergency stops on the plant are clearly marked.*\(Managing risks of plant in the workplace Code of Practice s 1\.4, s 4\.3\)$/);
  assert.equal(row('Mobile plant').detail, 'Stopped by: The operator rests the bucket and turns the key off');
  const nsw = prepareDraft(draftBody({ ...ready({ ...TRENCH, state: 'nsw', workplace: '14 Pitt Street, Sydney NSW 2000' }), emergency: TRENCH_ANSWERS }));
  assert.doesNotMatch(nsw.emergency.find((item) => item.type === 'Mobile plant').equipment, /Code of Practice/);
  // The muster point stays on its row; an answer is added after a row's own detail.
  assert.equal(row('Emergency').detail, ANSWERED.musterPoint);
  assert.deepEqual(emergencyQuestions({ kind: 'stand-down' }), []);
});

// ---- The page ----

const page = () => loadPage(['app.js'], () => ({ body: {} }));

test('the draft on screen shows the response line of a step still High and the note naming the earlier step, as printed', async () => {
  const p = page();
  await settle();
  const site = { workplace: '12 Smith Street, Paddington QLD 4064', principalContractor: 'ABC Builders Pty Ltd', complianceResponsible: 'Sam Lee, supervisor', reviewer: 'Sam Lee, supervisor' };
  const reo = prepareDraft({ state: 'qld', fallRisk: 'no', residential: 'no', task: 'Lift reo bundles onto the suspended slab deck by crane, then place and tie the reo.', facts: { loadLimits: 'The deck takes 2.5 kPa of stacked reo, as the formwork design shows.' }, ...site });
  const lift = reo.jobSteps.find((step) => step.step === 'Lift reo onto the deck');
  assert.ok(lift.risk.response);
  for (const movable of [true, false]) {
    const html = p.window.SiteReady.render(reo, { movable });
    assert.ok(html.includes(`<span class="risk-response">${lift.risk.response}</span>`), `response shown, movable ${movable}`);
  }
  const cabling = prepareDraft({ state: 'qld', fallRisk: 'no', residential: 'no', task: 'Install reticulation, cabling and cable management systems with supports. Provide task lighting.', kinds: ['containment', 'tempPower'], facts: { constructionTesting: 'Construction wiring is inspected and tested by our licensed electrician before first use and as AS/NZS 3012 sets.' }, ...site });
  const step = cabling.jobSteps.find((item) => item.step === 'Install cabling');
  const [note] = sharedNote(step, cabling.jobSteps);
  assert.match(note, /^The controls in step \d \(Install cable tray and containment\) also apply here\.$/);
  for (const movable of [true, false]) {
    const html = p.window.SiteReady.render(cabling, { movable });
    assert.equal(html.split(`<p class="ctl-shared">${note}</p>`).length - 1, 1, `note shown once, movable ${movable}`);
  }
});

test('the draft on screen asks for the plant and the emergency facts where the gate sends the user, and a saved SWMS shows neither box', async () => {
  const p = page();
  await settle();
  const input = draftBody(EWP);
  const draft = { ...prepareDraft(input) };
  draft.gate = downloadGaps(input, draft);
  const html = p.window.SiteReady.render(draft, { movable: true });
  // Each item in the gate has its place on the page.
  for (const gap of draft.gate) assert.ok(html.includes(`id="${gap.field}"`), gap.field);
  assert.match(html, /<input type="checkbox" data-plant-item="Scissor lift" checked>/);
  assert.match(html, /<input type="checkbox" data-plant-item="Forklift"><span>Forklift <span class="meta">SiteReady is not sure this is used/);
  assert.match(html, /<button type="button" id="plant-confirm">Confirm the plant<\/button>/);
  assert.match(html, /Not confirmed yet\. The download waits for it\./);
  assert.match(html, /<label for="emg-ewpLower">Who on the ground lowers the platform in an emergency\?/);
  const shown = p.window.SiteReady.render(draft);
  assert.doesNotMatch(shown, /plant-ticks|data-emergency|plant-confirm/);
});

// ---- The server routes ----

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
async function signIn(email, abn) {
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  await call('PUT', '/api/company', { token, body: { name: `Plant test ${email}`, abn } });
  return token;
}
const CONFIRM = { reviewConfirmed: true, reviewedBy: 'Alex Chen' };
const wordText = async (buffer) => (await (await JSZip.loadAsync(buffer)).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('Word and PDF wait for the plant and the emergency facts, then print them, and a saved SWMS keeps them', async () => {
  const token = await signIn('plant-gate@example.com', '51 824 753 556');
  for (const route of ['/api/draft.docx', '/api/draft.pdf']) {
    const refused = await call('POST', route, { token, body: { ...EWP, ...CONFIRM } });
    assert.equal(refused.status, 400, route);
    const data = await refused.json();
    assert.match(data.message, /Still to answer: Plant and equipment; Emergency, EWP: Lowered in an emergency by; Emergency, EWP: Ground controls and key; Emergency, mobile plant: Stopped by\./);
  }
  const body = { ...EWP, plantChoice: { used: ['Scissor lift', 'Cable winch or puller'], notUsed: ['Ladders', 'Forklift'], added: [{ item: 'Battery cable drum trailer', licence: 'No. Operator trained in its use' }] }, emergency: EWP_ANSWERS, ...CONFIRM };
  const docx = await call('POST', '/api/draft.docx', { token, body });
  assert.equal(docx.status, 200, await docx.clone().text());
  const text = await wordText(Buffer.from(await docx.arrayBuffer()));
  const register = text.slice(text.indexOf('Plant and equipment'), text.indexOf('Licences, tickets and training'));
  for (const item of ['Scissor lift', 'Cable winch or puller', 'Battery cable drum trailer']) assert.ok(register.includes(item), item);
  for (const item of ['Ladders', 'Forklift', 'where one is used']) assert.ok(!register.includes(item), item);
  for (const answer of ['Lowered in an emergency by: Larry Leadinghand, leading hand, trained on the ground controls', 'Ground controls and key: Ground control panel at the rear of the base', 'Stopped by: The operator presses the red emergency stop']) assert.ok(text.includes(answer), answer);
  const id = docx.headers.get('x-siteready-swms');
  const saved = await (await call('GET', `/api/swms/${id}`, { token })).json();
  assert.deepEqual(saved.input.plantChoice.notUsed, ['Ladders', 'Forklift']);
  assert.equal(saved.input.emergency.ewpLower, EWP_ANSWERS.ewpLower);
  const pdf = await call('POST', '/api/draft.pdf', { token, body: { ...body, swmsId: id } });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get('content-type'), /pdf/);
});
