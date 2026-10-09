// Goal 2 (owner, 7 October 2026): SiteReady will not produce a download until the site questions
// are answered. The gate (download-gate.js) on Word, PDF, the project zip, saving and saved SWMS;
// "None" or "Not applicable" where a question can truly have none; blanks (____) and "To be
// completed" filled before download; and the builder check failing them (H8).
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { app } = require('../server');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps, gateMessage } = require('../download-gate');
const { blankKey, fillLine, withFills } = require('../blanks');
const { checkSwms, fromDraft } = require('../builder-check');
const { setupAccounts, lastLinkToken, ANSWERED, ready } = require('./helpers');

const FENCE = { state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no' };
// Live testing in a switchboard brings two library lines with blanks in them.
const LIVE = { state: 'qld', task: 'Test the switchboard live and fault find on energised circuits in the plant room.', fallRisk: 'no', facts: { energisedWork: 'testing', isolationProcedure: 'Isolate at the main switch, lock and tag, and test before touching.' } };
const AUTHORISED = 'Energised work is authorised by: ____________ (position), after consulting ____________ (position) for the person with management or control of the workplace, usually the principal contractor.';
const SIGNS = 'The principal contractor\'s ____________ (position) signs the permit.';
const LIVE_FILLS = { [AUTHORISED]: ['Electrical supervisor', 'Site manager'], [SIGNS]: ['site manager'] };

// The plant and emergency response are confirmed (ready) for the tests about the other questions.
const gaps = (input, confirm = true) => {
  const body = draftBody(confirm ? ready(input) : input);
  const draft = prepareDraft(body);
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  return { gaps: downloadGaps(body, draft), draft };
};
const ids = (input) => gaps(input).gaps.map((gap) => gap.id);

test('a SWMS with every site question and key person blank lists each one as needed before download', () => {
  const list = gaps(FENCE).gaps;
  assert.deepEqual(list.map((gap) => gap.id), ['workplace', 'principalContractor', 'complianceResponsible', 'reviewer', 'firstAider', 'musterPoint',
    'site.liveServices', 'site.publicInterface', 'site.otherTrades', 'site.ground', 'site.access']);
  // Each says where it is answered on the page and what is needed, in plain words.
  assert.deepEqual(list.map((gap) => gap.field), ['workplace', 'principal', 'compliance-responsible', 'reviewer', 'first-aider', 'muster-point',
    'site-liveServices', 'site-publicInterface', 'site-otherTrades', 'site-ground', 'site-access']);
  for (const gap of list) assert.ok(gap.need.length > 20 && !/\u2014/.test(gap.need), gap.id);
  assert.match(gateMessage(list), /^SiteReady does not produce a SWMS until the site questions are answered/);
  assert.match(gateMessage(list), /Principal contractor; Person who makes sure the SWMS is followed/);
  // Answered, nothing is left to do.
  assert.deepEqual(ids({ ...FENCE, ...ANSWERED }), []);
});

test('"None" or "Not applicable" is accepted only where the question can truly have none, and prints as given', () => {
  const none = { ...FENCE, ...ANSWERED, principalContractor: 'N/A', site: { liveServices: 'None', publicInterface: 'none', otherTrades: 'Nil', ground: 'Not applicable', access: 'Stairs from the car park.' } };
  const { gaps: list, draft } = gaps(none);
  assert.deepEqual(list, []);
  assert.equal(draft.principalContractor, 'Not applicable');
  assert.deepEqual(draft.site.map((row) => row.text), ['None', 'None', 'None', 'Not applicable', 'Stairs from the car park.']);
  // A "None" adds nothing to the method or the hazards.
  assert.ok(!(draft.method || []).some((line) => /^(Live services|Public interface|Other trades|Ground): (None|Not applicable)/.test(line)));
  // There is always a way to the work, a person checking the controls, a first aider and a muster point.
  for (const [key, value] of [['complianceResponsible', 'None'], ['reviewer', 'n/a'], ['firstAider', 'No first aider'], ['musterPoint', 'Not applicable']]) {
    const found = gaps({ ...FENCE, ...ANSWERED, [key]: value }).gaps;
    assert.deepEqual(found.map((gap) => gap.id), [key], key);
    assert.match(found[0].need, /cannot be/);
  }
  const access = gaps({ ...FENCE, ...ANSWERED, site: { ...ANSWERED.site, access: 'None' } }).gaps;
  assert.deepEqual(access.map((gap) => gap.id), ['site.access']);
});

test('a placeholder is not an answer: TBC, To be completed, a blank or a question mark', () => {
  for (const value of ['TBC', 'To be completed before submitting for approval', '____', '?', 'Unknown']) {
    assert.deepEqual(ids({ ...FENCE, ...ANSWERED, musterPoint: value }), ['musterPoint'], value);
    assert.deepEqual(ids({ ...FENCE, ...ANSWERED, site: { ...ANSWERED.site, otherTrades: value } }), ['site.otherTrades'], value);
  }
  // An optional box may be empty, but a placeholder in it would print.
  assert.deepEqual(ids({ ...FENCE, ...ANSWERED, siteManager: 'TBA' }), ['siteManager']);
  assert.deepEqual(ids({ ...FENCE, ...ANSWERED, siteManager: '' }), []);
});

test('the scaffold supervisor is asked for and printed only where the SWMS involves a scaffold', () => {
  const fence = gaps({ ...FENCE, ...ANSWERED, scaffoldSupervisor: '' });
  assert.equal(fence.draft.scaffoldSupervisor, '', 'no scaffold, no row');
  assert.deepEqual(fence.gaps, []);
  // Where it is answered for the site, it is still left off a SWMS with no scaffold.
  assert.equal(gaps({ ...FENCE, ...ANSWERED }).draft.scaffoldSupervisor, '');
  const paint = { state: 'qld', task: 'Paint the facade from the scaffold.', fallRisk: 'yes', facts: { fallControl: 'Guardrails on the scaffold platform.', safetyDataSheet: 'Water-based acrylic paint SDS at the work area.' } };
  const open = gaps({ ...paint, ...ANSWERED, scaffoldSupervisor: '' });
  assert.equal(open.draft.scaffoldSupervisor, 'To be completed before submitting for approval');
  assert.deepEqual(open.gaps.map((gap) => gap.id), ['scaffoldSupervisor']);
  const named = gaps({ ...paint, ...ANSWERED });
  assert.equal(named.draft.scaffoldSupervisor, 'Pat Doyle, Doyle Scaffolding');
  assert.deepEqual(named.gaps, []);
  // "Not applicable" is accepted, so a scaffold named only in passing never forces a false answer.
  const none = gaps({ ...paint, ...ANSWERED, scaffoldSupervisor: 'Not applicable' });
  assert.equal(none.draft.scaffoldSupervisor, '');
  assert.deepEqual(none.gaps, []);
  // A mobile scaffold the crew sets up is not a scaffold handed over by a scaffolder.
  const mobile = gaps({ state: 'qld', task: 'Plaster the ceiling from a mobile scaffold.', fallRisk: 'yes', facts: { fallControl: 'Guardrails on the mobile scaffold platform.' }, ...ANSWERED, scaffoldSupervisor: '' });
  assert.equal(mobile.draft.scaffoldSupervisor, '');
});

test('a control line with a blank is filled with the user\'s answer, and nothing else in it changes', () => {
  const open = gaps({ ...LIVE, ...ANSWERED });
  const lines = open.gaps.filter((gap) => gap.kind === 'line');
  assert.deepEqual(lines.map((gap) => gap.key), [AUTHORISED, SIGNS]);
  assert.deepEqual(lines[0].parts, ['Energised work is authorised by: ', ' (position), after consulting ', ' (position) for the person with management or control of the workplace, usually the principal contractor.']);
  assert.equal(lines[0].step, 'Work on or near energised parts');
  // The printed line carries its sources; the blank is filled by the line's own words.
  const printed = open.draft.jobSteps.flatMap((step) => step.controls).find((line) => line.startsWith('Energised work is authorised by'));
  assert.equal(blankKey(printed), AUTHORISED);
  const filled = gaps({ ...LIVE, ...ANSWERED, fills: LIVE_FILLS });
  assert.deepEqual(filled.gaps, []);
  const after = filled.draft.jobSteps.flatMap((step) => step.controls);
  const line = after.find((text) => text.startsWith('Energised work is authorised by'));
  assert.equal(line, printed.replace('____________', 'Electrical supervisor').replace('____________', 'Site manager'));
  assert.ok(after.includes('The principal contractor\'s site manager (position) signs the permit.'));
  assert.ok(!after.some((text) => /_{3,}/.test(text)));
  // A blank left unanswered stays a blank, and the gate still asks for it, in the line as it now reads.
  const part = { [AUTHORISED]: ['Electrical supervisor', ''] };
  const half = gaps({ ...LIVE, ...ANSWERED, fills: part });
  const rest = AUTHORISED.replace('____________', 'Electrical supervisor');
  assert.deepEqual(half.gaps.map((gap) => gap.key), [rest, SIGNS]);
  assert.deepEqual(ids({ ...LIVE, ...ANSWERED, fills: { ...part, [rest]: ['Site manager'], [SIGNS]: ['site manager'] } }), []);
  assert.equal(fillLine('Rated for ____ t at ____ m.', ['5.', ' 12 ']), 'Rated for 5 t at 12 m.');
  assert.equal(fillLine('Rated for ____ t.', ['____']), 'Rated for ____ t.', 'a blank is not an answer');
  assert.equal(withFills({ kind: 'stand-down' }, LIVE_FILLS).kind, 'stand-down');
});

test('a standard answer with its blank left in is filled in its own box, not in the line', () => {
  const crane = { state: 'qld', task: 'Paint the interior walls of a shop with water-based paint.', fallRisk: 'no', facts: { safetyDataSheet: 'The products used are ____. They are used with good ventilation and away from ignition sources, with the gloves and eye protection their safety data sheets list.' } };
  const open = gaps({ ...crane, ...ANSWERED });
  assert.deepEqual(open.gaps.map((gap) => [gap.kind, gap.field]), [['fact', 'fact-safetyDataSheet']]);
  assert.match(open.gaps[0].need, /still has a blank/);
  assert.deepEqual(ids({ ...crane, ...ANSWERED, facts: { safetyDataSheet: crane.facts.safetyDataSheet.replace('____', 'Dulux Wash and Wear acrylic') } }), []);
});

test('the builder check fails a blank or a "To be completed" left in the SWMS (H8), and passes it once filled', () => {
  const failed = (draft) => checkSwms(fromDraft(draft, { state: 'qld', swms: { signatures: [{ name: 'Jo Smith', date: '5 October 2026' }] } }), { state: 'qld', today: '2026-10-05' });
  const open = failed(prepareDraft(draftBody({ ...LIVE, ...ANSWERED, musterPoint: '' })));
  assert.ok(open.hardFails.includes('H8'));
  assert.equal(open.band, 'Not accepted');
  const message = open.findings.find((item) => item.rule === 'H8').message;
  assert.match(message, /Energised work is authorised by: ____________/);
  assert.match(message, /Muster point: To be completed before submitting for approval/);
  const done = failed(prepareDraft(draftBody({ ...LIVE, ...ANSWERED, fills: LIVE_FILLS })));
  assert.ok(!done.hardFails.includes('H8'), done.hardFails.join());
  // An instruction that a permit is to be completed is not a placeholder; "Supervisor: TBC" is.
  const swms = (controls) => ({ state: 'qld', task: 'Weld brackets.', site: { address: '1 Test St, Brisbane QLD 4000', conditions: ['Access: stairs.'] }, steps: [{ step: 'Weld', hazards: ['Fire.'], controls, responsible: 'Supervisor' }], responsiblePerson: 'Sam Lee' });
  const rule = (result) => result.findings.find((item) => item.rule === 'H8');
  assert.equal(rule(checkSwms(swms(['The hot work permit is to be completed before work starts.']))).pass, true);
  assert.equal(rule(checkSwms(swms(['Fire watch: TBC']))).pass, false);
  assert.equal(rule(checkSwms(swms(['Workers wear a harness clipped to anchors ____ rated by ____.']))).pass, false);
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
// Each business has its own ABN, so each has its own free trial.
async function signIn(email, abn) {
  await call('POST', '/api/auth/email', { body: { email } });
  const { token } = await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json();
  await call('PUT', '/api/company', { token, body: { name: `Gate test ${email}`, abn } });
  return token;
}
const CONFIRM = { reviewConfirmed: true, reviewedBy: 'Alex Chen' };
const wordText = async (buffer) => (await (await JSZip.loadAsync(buffer)).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ');

test('the preview stays open without signing in, and says what is needed before download', async () => {
  const response = await call('POST', '/api/draft', { body: LIVE });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.kind, 'draft');
  assert.ok(data.gate.some((gap) => gap.id === 'principalContractor'));
  assert.ok(data.gate.some((gap) => gap.key === AUTHORISED));
  const step = data.jobSteps.findIndex((item) => item.step === 'Work on or near energised parts');
  assert.ok(data.blankKeys.steps[step].includes(AUTHORISED));
});

test('Word and PDF are refused with the list of what is needed, then download with the answers printed and no blank left', async () => {
  const token = await signIn('gate@example.com', '51 824 753 556');
  for (const route of ['/api/draft.docx', '/api/draft.pdf']) {
    const refused = await call('POST', route, { token, body: { ...LIVE, ...CONFIRM } });
    assert.equal(refused.status, 400, route);
    const data = await refused.json();
    assert.match(data.message, /until the site questions are answered/);
    assert.ok(data.gate.some((gap) => gap.id === 'musterPoint'));
    assert.ok(data.gate.some((gap) => gap.key === SIGNS));
  }
  // Nothing was saved by the refused downloads.
  assert.equal((await (await call('GET', '/api/swms', { token })).json()).swms.length, 0);
  const body = ready({ ...LIVE, ...ANSWERED, fills: LIVE_FILLS, ...CONFIRM });
  const docx = await call('POST', '/api/draft.docx', { token, body });
  assert.equal(docx.status, 200, await docx.clone().text());
  const text = await wordText(Buffer.from(await docx.arrayBuffer()));
  for (const answer of ['ABC Builders Pty Ltd', 'Sam Lee, supervisor', 'Jo Smith', 'Front gate on Smith Street', 'Through the main site gate.', 'Electrical supervisor']) assert.ok(text.includes(answer), answer);
  assert.doesNotMatch(text, /_{3,}|To be completed/);
  assert.doesNotMatch(text, /Scaffold supervisor/, 'no scaffold in this work');
  const pdf = await call('POST', '/api/draft.pdf', { token, body });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get('content-type'), /pdf/);
});

test('saving, a saved SWMS kept from before the gate, and a copy are held until the answers are given', async () => {
  const db = require('../db');
  const token = await signIn('gate-save@example.com', '53 004 085 616');
  const refused = await call('POST', '/api/swms', { token, body: { input: FENCE, ...CONFIRM } });
  assert.equal(refused.status, 400);
  const data = await refused.json();
  assert.match(data.message, /Still to answer: Job address; Principal contractor/);
  assert.ok(data.gate.length >= 6);
  const { swms } = await (await call('POST', '/api/swms', { token, body: { input: ready({ ...FENCE, ...ANSWERED }), ...CONFIRM } })).json();
  assert.equal((await call('GET', `/api/swms/${swms.id}/docx`, { token })).status, 200);
  // Changes that blank an answer cannot be saved over it.
  assert.equal((await call('PUT', `/api/swms/${swms.id}`, { token, body: { input: ready({ ...FENCE, ...ANSWERED, musterPoint: '' }), ...CONFIRM } })).status, 400);
  // A SWMS saved before the gate with the site questions blank is not printed until it is revised.
  const row = await db.one('SELECT * FROM swms WHERE id = $1', [swms.id]);
  await db.query(
    `INSERT INTO swms (id, company_id, site_id, title, input, reviewed_by, created_by, signon_token, created_at, updated_at, last_reviewed_at, review_due_at)
     VALUES ('blank-swms', $1, NULL, 'Blank', $2, 'Alex Chen', $3, 'blank-token', $4, $4, $4, $4)`,
    [row.company_id, JSON.stringify(draftBody(FENCE)), row.created_by, new Date('2026-09-01T00:00:00Z')],
  );
  for (const format of ['docx', 'pdf']) {
    const held = await call('GET', `/api/swms/blank-swms/${format}`, { token });
    assert.equal(held.status, 400, format);
    assert.match((await held.json()).message, /save it as a new revision/);
  }
  assert.equal((await call('POST', '/api/swms/blank-swms/copy', { token, body: CONFIRM })).status, 400);
  // Revised with the answers, it prints.
  assert.equal((await call('PUT', '/api/swms/blank-swms', { token, body: { input: ready({ ...FENCE, ...ANSWERED }), ...CONFIRM } })).status, 200);
  assert.equal((await call('GET', '/api/swms/blank-swms/docx', { token })).status, 200);
});

test('the project zip leaves out a SWMS with site questions unanswered, and says what it needs', async () => {
  const token = await signIn('gate-zip@example.com', '33 102 417 000');
  const answered = ready({ ...FENCE, ...ANSWERED, swmsTitle: 'Fencing' });
  const blank = { ...FENCE, task: 'Replace a 6m length of timber fence.', swmsTitle: 'More fencing' };
  const response = await call('POST', '/api/project.zip', { token, body: { swms: [answered, blank], ...CONFIRM } });
  assert.equal(response.status, 200);
  const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
  assert.deepEqual(Object.keys(zip.files).sort(), ['01 Fencing.docx', 'Not included.txt']);
  assert.match(await zip.file('Not included.txt').async('string'), /2\. More fencing: still to answer: Job address; Principal contractor/);
  const none = await call('POST', '/api/project.zip', { token, body: { swms: [blank], ...CONFIRM } });
  assert.equal(none.status, 400);
  assert.match((await none.json()).message, /until the site questions are answered/);
});
