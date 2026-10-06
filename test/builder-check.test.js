// The builder SWMS check (task #106), its email (#99) and the AI reading of an uploaded SWMS,
// with a stand-in for the model so no request is made or billed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkSwms: check, fromDraft, emailDraft, bandFor, controlLevel, isVague, SOURCES } = require('../builder-check');
const { readSwms, validSwms, CHECK_BRIEF, CHECK_SCHEMA } = require('../check-read');
const aiScope = require('../ai-scope');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const scenarios = require('../scenarios/scenarios.json');

// Review dates are judged against a fixed day, so these results do not change as time passes.
const TODAY = '2026-10-05';
const checkSwms = (input, options = {}) => check(input, { today: TODAY, ...options });

// A good roofing SWMS: every hard rule passes and the weighted items score 90 or more.
const GOOD = Object.freeze({
  state: 'qld',
  task: 'Replace the metal roof sheets on a two storey house, 7 m to the eaves.',
  fallRisk: 'yes',
  site: { address: '12 Smith Street, Paddington QLD 4064', conditions: [
    'Access: scaffold stair on the east side; deliveries by the driveway.',
    'Exclusion zone: the drop zone under the roof edge is barricaded with para-webbing.',
    'Other trades: no other trades work on or under the roof while we are on it.',
    'Public: the footpath stays open behind a hoarding.',
    'Services: overhead power on the street is 6 m from the scaffold; the line is not within 3 m of any work.',
  ] },
  highRisk: ['Risk of a person falling more than 2 metres'],
  steps: [
    { step: 'Set up roof access', hazards: ['A fall from the ladder or stair while getting onto the roof.'], controls: [
      'Access is by the scaffold stair only, inspected and tagged by the scaffolder before use.',
      'The supervisor checks the scaffold tag before each shift.'] },
    { step: 'Install roof edge protection', hazards: ['Falling from the roof edge.', 'Falling through skylights.'], controls: [
      'A perimeter guardrail scaffold is installed around the roof edge before work starts, with the working deck no more than 300 mm below the eaves.',
      'Skylights are covered with fixed covers rated to take a fall before anyone goes onto the roof.'], responsible: 'Scaffolder' },
    { step: 'Remove and replace roof sheets', hazards: ['Falling through the open roof frame.', 'Cuts from sheet edges.'], controls: [
      'Safety mesh to AS/NZS 4389 is fixed under the new sheets before they are laid.',
      'Sheets are lifted to the roof by a materials hoist, not carried up the stair.',
      'Cut resistant gloves are worn when handling sheets.'], responsible: 'Leading hand' },
  ],
  ppe: ['Hard hat', 'Safety boots', 'Cut resistant gloves'],
  responsiblePerson: 'Sam Lee, roofing supervisor',
  consultation: 'The crew was briefed on this SWMS at the pre-start meeting on 5 October 2026.',
  signatures: [{ name: 'Jo Smith', date: '5 October 2026' }, { name: 'Ali Khan', date: '5 October 2026' }],
  revision: 'Rev 2',
  date: '5 October 2026',
  reviewDate: '5 November 2026',
  principalContractor: 'ABC Builders Pty Ltd',
  licences: ['White card (all crew)', 'Scaffolding licence SB (scaffolder)'],
  plant: ['Materials hoist: inspected before each shift and serviced to the log book.'],
  emergency: ['Call 000. First aid kit in the site shed; first aider Sam Lee.', 'Rescue: a person who falls onto the scaffold deck is helped down the stair; the rescue plan is in the site shed.'],
  review: 'The supervisor checks the controls before each shift. The SWMS is reviewed if the task or site changes, after an incident, or if a control is not working.',
  legislation: ['Work Health and Safety Regulation 2011 (Qld)'],
  riskMatrix: false,
});
const variant = (changes) => ({ ...structuredClone(GOOD), ...changes });
const failed = (result) => result.findings.filter((item) => item.hard && !item.pass).map((item) => item.rule);

test('a good SWMS passes every hard rule and is accepted', () => {
  const result = checkSwms(GOOD);
  assert.deepEqual(failed(result), []);
  assert.ok(result.score >= 90, `score ${result.score}`);
  assert.equal(result.band, 'Accepted');
  for (const item of result.findings) {
    assert.ok(item.rule && item.title && item.message && item.source, `${item.rule} has a rule, title, message and source`);
  }
  assert.equal(result.findings.filter((item) => !item.hard).reduce((sum, item) => sum + item.max, 0), 100);
});

test('H1: high risk work not listed, or a category the task implies is missing', () => {
  assert.deepEqual(failed(checkSwms(variant({ highRisk: [] }))), ['H1']);
  const trench = checkSwms(variant({ task: 'Replace the metal roof sheets, then excavate a trench 2 m deep for the stormwater line.' }));
  assert.ok(failed(trench).includes('H1'));
  assert.match(trench.findings.find((item) => item.rule === 'H1').message, /shaft or trench/);
  // A SWMS that keeps the trench under 1.5 m is not trench high risk work, unless the task says deeper.
  const shallowSteps = [...GOOD.steps, { step: 'Work in the trench', hazards: ['Collapse.'], controls: ['Before anyone enters, check the depth. The trench is kept shallower than 1.5 m. If it must go deeper, work stops and this SWMS is reviewed.'] }];
  assert.ok(!failed(checkSwms(variant({ steps: shallowSteps }))).includes('H1'));
  assert.ok(failed(checkSwms(variant({ steps: shallowSteps, task: 'Excavate a trench 2 m deep for the stormwater line.' }))).includes('H1'));
  assert.ok(failed(checkSwms(variant({ steps: [...GOOD.steps, { step: 'Work in the trench', hazards: ['Collapse.'], controls: ['Barricade the trench.'] }] }))).includes('H1'));
  // Nothing listed and nothing in the task is not a fail.
  const painting = checkSwms({ ...variant({ highRisk: [], fallRisk: 'no' }), task: 'Paint the walls of a ground floor shop.', steps: [{ step: 'Paint', hazards: ['Paint fumes.'], controls: ['Open the doors and run a fan.'] }] });
  assert.ok(!failed(painting).includes('H1'));
  assert.match(painting.findings.find((item) => item.rule === 'H1').message, /none was found in the task/);
});

test('H2: a listed high risk category has no controls', () => {
  const result = checkSwms(variant({ highRisk: [...GOOD.highRisk, 'Work on or near energised electrical installations'] }));
  assert.ok(failed(result).includes('H2'));
  assert.match(result.findings.find((item) => item.rule === 'H2').message, /energised electrical/);
});

test('H3: falls controlled by harness alone', () => {
  const steps = [
    { step: 'Work on the roof', hazards: ['Falling from the roof edge.'], controls: ['Workers wear a full body harness attached to a roof anchor rated to 15 kN.'] },
  ];
  const result = checkSwms(variant({ steps }));
  assert.ok(failed(result).includes('H3'));
  assert.match(result.findings.find((item) => item.rule === 'H3').message, /harness alone/);
  // The harness with a stated reason that edge protection is not reasonably practicable passes H3.
  const justified = checkSwms(variant({ steps: [{ ...steps[0], controls: [...steps[0].controls, 'Edge protection and scaffold are not reasonably practicable for this 20 minute repair; an EWP cannot reach the roof.'] }] }));
  assert.ok(!failed(justified).includes('H3'));
  assert.equal(controlLevel(GOOD.steps[1].controls[0]), 'Isolate or engineer');
  assert.equal(controlLevel(steps[0].controls[0]), 'PPE');
});

test('H4: not site specific', () => {
  assert.deepEqual(failed(checkSwms(variant({ site: { address: '', conditions: GOOD.site.conditions } }))), ['H4']);
  assert.deepEqual(failed(checkSwms(variant({ site: { address: 'To be completed', conditions: GOOD.site.conditions } }))), ['H4']);
  assert.deepEqual(failed(checkSwms(variant({ site: { address: GOOD.site.address, conditions: [] } }))), ['H4']);
});

test('H5: vague controls for a high risk hazard', () => {
  for (const line of ['Use appropriate PPE.', 'Take care near the roof edge.', 'Install edge protection as required.', 'Workers to be aware of the roof edge.', 'Supervisor to ensure the edge is safe.', 'Use caution near skylights.', 'Cover skylights where necessary.']) {
    const steps = structuredClone(GOOD.steps);
    steps[1].controls.push(line);
    const result = checkSwms(variant({ steps }));
    assert.deepEqual(failed(result), ['H5'], line);
    assert.ok(result.findings.find((item) => item.rule === 'H5').message.includes(line));
  }
});

test('H6 and H7: no responsible person; no worker signatures', () => {
  assert.deepEqual(failed(checkSwms(variant({ responsiblePerson: '' }))), ['H6']);
  assert.deepEqual(failed(checkSwms(variant({ responsiblePerson: '____' }))), ['H6']);
  // On site, a SWMS no worker has signed fails H7.
  const unsigned = checkSwms(variant({ signatures: [{ name: '', date: '' }] }), { stage: 'on-site' });
  assert.deepEqual(failed(unsigned), ['H7']);
  assert.match(unsigned.findings.find((item) => item.rule === 'H7').message, /no worker has signed/);
});

test('H7 (owner decision): at review stage the sign-on is a condition before work starts; consultation is still required', () => {
  const review = checkSwms(variant({ signatures: [] }));
  assert.equal(review.stage, 'review');
  assert.deepEqual(failed(review), []);
  assert.deepEqual(review.preStart, ['Workers must sign on before work starts.']);
  assert.match(item(review, 'H7').message, /Workers must sign on before work starts/);
  assert.match(emailDraft(review).body, /Before work starts: Workers must sign on before work starts\./);
  assert.deepEqual(checkSwms(GOOD).preStart, []);
  // No consultation statement and no named supervisor or responsible person: H7 still fails.
  assert.ok(failed(checkSwms(variant({ signatures: [], consultation: '', responsiblePerson: '' }))).includes('H7'));
  assert.ok(!failed(checkSwms(variant({ signatures: [], consultation: '' }))).includes('H7'));
  // On site, the sign-on is required.
  assert.ok(failed(checkSwms(variant({ signatures: [] }), { stage: 'on-site' })).includes('H7'));
  // A supervisor's or director's name printed in the sign-off table, with no signature or date, is not a sign-on.
  assert.ok(failed(checkSwms(variant({ signatures: [{ name: 'Wayne Pitts (director, in the sign-off table)', date: '' }] }), { stage: 'on-site' })).includes('H7'));
  assert.ok(!failed(checkSwms(variant({ signatures: [{ name: 'Jo Smith', date: '' }] }), { stage: 'on-site' })).includes('H7'));
});

test('W4: the SWMS says it is revised when the work changes, and after an incident', () => {
  const full = checkSwms(GOOD).findings.find((item) => item.rule === 'W4');
  assert.equal(full.points, 7);
  assert.match(full.source, /Bernie Leen/);
  const none = checkSwms(variant({ review: 'The supervisor checks the controls before each shift.' })).findings.find((item) => item.rule === 'W4');
  assert.equal(none.points, 4);
  assert.match(none.message, /revised when the work stage, method or site changes/);
  assert.match(none.message, /after an incident/);
});

test('bands: 90 to 100 accepted, 60 to 89 with changes, below 60 or a hard fail not accepted', () => {
  assert.equal(bandFor(100, false), 'Accepted');
  assert.equal(bandFor(90, false), 'Accepted');
  assert.equal(bandFor(89, false), 'Accepted with changes');
  assert.equal(bandFor(60, false), 'Accepted with changes');
  assert.equal(bandFor(59, false), 'Not accepted');
  assert.equal(bandFor(100, true), 'Not accepted');
  // A good SWMS without document control and with a matrix and legislation list drops into the middle band.
  const middle = checkSwms(variant({ revision: '', reviewDate: '', principalContractor: '', riskMatrix: true, legislation: ['a', 'b', 'c', 'd', 'e', 'f'], emergency: [] }));
  assert.deepEqual(failed(middle), []);
  assert.equal(middle.band, 'Accepted with changes');
  // A hard fail is not accepted however high the score.
  const hard = checkSwms(variant({ signatures: [] }), { stage: 'on-site' });
  assert.ok(hard.score >= 90);
  assert.equal(hard.band, 'Not accepted');
});

test('email: accepted is a short approval; otherwise the changes by priority, hard fails first', () => {
  const accepted = emailDraft(checkSwms(GOOD), { to: 'Jo', from: 'Clive' });
  assert.equal(accepted.body, 'Hi Jo,\n\nGreat SWMS, approved, see attached my approved and signed copy.\n\nRegards,\nClive');
  assert.match(accepted.subject, /^SWMS approved: Replace the metal roof sheets/);

  const changes = emailDraft(checkSwms(variant({ revision: '', reviewDate: '', principalContractor: '', riskMatrix: true, legislation: ['a', 'b', 'c', 'd', 'e', 'f'], emergency: [] })));
  assert.match(changes.subject, /^SWMS accepted with changes/);
  assert.match(changes.body, /^Hi,\n\nThanks for the SWMS for "Replace the metal roof sheets[^"]*"\. It is accepted with changes \(score \d+ out of 100\)/);
  assert.match(changes.body, /Changes needed:\n1\. /);
  assert.doesNotMatch(changes.body, /Must fix/);
  // The item that lost the most points comes first: emergency and rescue (10 points) before document control.
  assert.ok(changes.body.indexOf('first aid') < changes.body.indexOf('revision number'));

  const rejected = emailDraft(checkSwms(variant({ signatures: [], revision: '' }), { stage: 'on-site' }));
  assert.match(rejected.subject, /^SWMS not accepted/);
  assert.match(rejected.body, /It is not accepted yet \(score \d+ out of 100, 1 must-fix item\)\. Work under it cannot start until these are fixed\./);
  assert.match(rejected.body, /Must fix before work starts:\n1\. Consultation is recorded, but no worker has signed the SWMS\.\n\nAlso fix:\n2\. Add a revision number\./);
});

// SiteReady's own drafts, checked as a builder would check the printed SWMS. Site details, the
// person responsible and the principal contractor are filled in, as a user would before sending.
const SITE = {
  workplace: '12 Smith Street, Paddington QLD 4064', principalContractor: 'ABC Builders Pty Ltd', complianceResponsible: 'Sam Lee, supervisor', reviewDate: '5 November 2026',
  site: { liveServices: 'Overhead power on the street, 6 m from the work.', publicInterface: 'The footpath stays open behind a hoarding.', otherTrades: 'No other trades work under ours.', ground: 'Level, firm ground.', access: 'Scaffold stair on the east side; deliveries by the driveway.' },
};
function draftCheck(index, signed = true, stage = 'review') {
  const s = scenarios[index];
  const input = draftBody({ state: 'qld', task: s.task, fallRisk: s.fallRisk, facts: s.facts, ...SITE });
  const draft = prepareDraft(input);
  assert.equal(draft.kind, 'draft');
  return checkSwms(fromDraft(draft, { state: 'qld', swms: signed ? { signatures: [{ name: 'Jo Smith' }] } : {} }), { state: 'qld', stage });
}

test('SiteReady drafts score sensibly', () => {
  // Scaffold erection (#8), roof sheets (#0), trench (#1), asbestos eaves (#3).
  const scaffold = draftCheck(8);
  assert.deepEqual(failed(scaffold), []);
  assert.equal(scaffold.band, 'Accepted');
  for (const index of [0, 1, 3]) {
    const result = draftCheck(index);
    assert.ok(result.score >= 80, `#${index} scores ${result.score}`);
    // The library no longer says "where needed" or "as needed", so H5 passes too (see own-drafts-check.test.js).
    assert.deepEqual(failed(result), [], `#${index}`);
  }
  // The printed SWMS has a risk matrix, which is not marked down, and a revision number (5 Oct).
  const roof = draftCheck(0);
  assert.equal(roof.findings.find((item) => item.rule === 'W8').points, 5);
  assert.doesNotMatch(roof.findings.find((item) => item.rule === 'W9').message, /revision number/);
  // A draft sent for review is not signed yet: the sign-on is a condition before work starts.
  // On site, H7 fails until the crew signs.
  assert.ok(!failed(draftCheck(8, false)).includes('H7'));
  assert.deepEqual(draftCheck(8, false).preStart, ['Workers must sign on before work starts.']);
  assert.ok(failed(draftCheck(8, false, 'on-site')).includes('H7'));
});

// ---- Reading an uploaded SWMS with the AI (stand-in client) ----

const DOCUMENT = [
  'SAFE WORK METHOD STATEMENT  Rev 2  Date: 5 October 2026',
  'Site: 12 Smith Street, Paddington QLD 4064',
  'Task: Replace the metal roof sheets on a two storey house.',
  'High risk work: Risk of a person falling more than 2 metres',
  'Step 1 Work on the roof. Hazard: Falling from the roof edge. Control: Use appropriate PPE.',
].join('\n');
const READ = {
  state: 'qld', task: 'Replace the metal roof sheets on a two storey house.', fallRisk: 'yes', siteAddress: '12 Smith Street, Paddington QLD 4064', siteConditions: [],
  highRisk: ['Risk of a person falling more than 2 metres'],
  steps: [{ step: 'Work on the roof', hazards: ['Falling from the roof edge.'], controls: ['Use appropriate PPE.', 'Wear a harness at all times.'] }],
  ppe: [], responsiblePerson: '', consultation: '', signatures: [], revision: 'Rev 2', date: '5 October 2026', reviewDate: '', principalContractor: '',
  licences: [], plant: [], emergency: [], review: '', legislation: [], riskMatrix: false,
};
function standIn(answer) {
  const calls = [];
  return { calls, beta: { messages: { stream(params) {
    calls.push(params);
    return { finalMessage: async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 2000, output_tokens: 400 }, content: [{ type: 'text', text: JSON.stringify(answer) }] }) };
  } } } };
}

test('the check brief extracts and quotes, and its schema is strict', () => {
  assert.match(CHECK_BRIEF, /Extract, do not judge/);
  assert.match(CHECK_BRIEF, /Quote the document/);
  const strict = (schema) => schema.type !== 'object' || (schema.additionalProperties === false
    && Object.keys(schema.properties).every((key) => schema.required.includes(key)) && Object.values(schema.properties).every(strict))
    && (schema.type !== 'array' || strict(schema.items));
  assert.ok(strict(CHECK_SCHEMA));
});

test('an uploaded SWMS is read into the form, lines not in the document are flagged, and it is scored', async (t) => {
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  t.after(() => { delete process.env.ANTHROPIC_API_KEY; aiScope.useClient(null); });
  const model = standIn(READ);
  aiScope.useClient(model);
  const read = await readSwms(DOCUMENT);
  const params = model.calls[0];
  assert.equal(params.model, 'claude-opus-5-5');
  assert.equal(params.system[0].text, CHECK_BRIEF);
  assert.equal(params.output_config.format.schema, CHECK_SCHEMA);
  assert.ok(params.messages[0].content.includes(DOCUMENT));
  assert.deepEqual(read.notFound, ['Wear a harness at all times.']);
  const result = checkSwms(read.swms);
  assert.equal(result.band, 'Not accepted');
  for (const rule of ['H3', 'H4', 'H5', 'H6', 'H7']) assert.ok(result.hardFails.includes(rule), rule);
  assert.ok(!result.hardFails.includes('H1'));
});

test('the AI reading is refused when switched off, and a malformed answer is not used', async (t) => {
  delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(readSwms(DOCUMENT), (error) => error.status === 503);
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  t.after(() => { delete process.env.ANTHROPIC_API_KEY; aiScope.useClient(null); });
  aiScope.useClient(standIn({ task: 'x' }));
  await assert.rejects(readSwms(DOCUMENT), (error) => error.status === 502);
});

// ---- v1.1: owner decisions of 5 October 2026 ----

const item = (result, rule) => result.findings.find((finding) => finding.rule === rule);

test('the 100 points are split as decided: three new items taken from the items they overlap', () => {
  const maxima = Object.fromEntries(checkSwms(GOOD).findings.filter((finding) => !finding.hard).map((finding) => [finding.rule, finding.max]));
  assert.deepEqual(maxima, { W1: 15, W2: 15, W3: 10, W4: 7, W5: 8, W6: 10, W7: 10, W8: 5, W9: 5, W10: 5, W11: 5, W12: 5 });
  for (const rule of ['W10', 'W11', 'W12']) assert.match(item(checkSwms(GOOD), rule).source, /a tier 1 builder's published SWMS review checklist \(evidence/);
  assert.match(item(checkSwms(GOOD), 'W10').source, /s 36/);
  assert.match(item(checkSwms(GOOD), 'W12').source, /Code of Practice: Construction Work/);
});

test('H5: "where reasonably practicable" is the legal test, not vague; "as needed" and the like still are', () => {
  for (const line of ['Install edge protection where reasonably practicable.', 'So far as is reasonably practicable, work is done from the ground.',
    'If it is not reasonably practicable to use a scaffold, an EWP is used.']) {
    assert.equal(isVague(line), false, line);
    const steps = structuredClone(GOOD.steps);
    steps[1].controls.push(line);
    assert.deepEqual(failed(checkSwms(variant({ steps }))), [], line);
  }
  for (const line of ['Install edge protection as needed.', 'Cover skylights where needed.', 'Barricade the edge where necessary.',
    'Use a harness if required.', 'Fit mesh as required.', 'Where reasonably practicable, fit edge protection, and add covers as needed.']) {
    assert.equal(isVague(line), true, line);
    const steps = structuredClone(GOOD.steps);
    steps[1].controls.push(line);
    assert.deepEqual(failed(checkSwms(variant({ steps }))), ['H5'], line);
  }
});

test('W8: a printed risk matrix is not marked down; a long legislation list and a long SWMS still are', () => {
  const matrix = item(checkSwms(variant({ riskMatrix: true })), 'W8');
  assert.equal(matrix.points, 5);
  assert.doesNotMatch(matrix.message, /risk matrix/);
  assert.match(matrix.source, /risk matrix is not marked down/);
  assert.equal(item(checkSwms(variant({ legislation: ['a', 'b', 'c', 'd', 'e', 'f'] })), 'W8').points, 2);
  const long = structuredClone(GOOD.steps);
  long[2].controls.push(...Array.from({ length: 120 }, (_, n) => `Sheet ${n + 1} is fixed with screws at 300 mm centres.`));
  assert.equal(item(checkSwms(variant({ steps: long })), 'W8').points, 3);
});

test('W9: a revision number is credited, as text or as a number', () => {
  for (const revision of ['Rev 2', '1', 1, 0]) assert.equal(item(checkSwms(variant({ revision })), 'W9').points, 5, String(revision));
  for (const revision of ['', 'TBC', null]) assert.match(item(checkSwms(variant({ revision })), 'W9').message, /Add a revision number/, String(revision));
  // A SiteReady draft that carries draft.revision gets the point for it.
  const s = scenarios[0];
  const draft = prepareDraft(draftBody({ state: 'qld', task: s.task, fallRisk: s.fallRisk, facts: s.facts, ...SITE }));
  for (const revision of ['2', 0]) {
    const w9 = item(checkSwms(fromDraft({ ...draft, revision }, { state: 'qld' }), { state: 'qld' }), 'W9');
    assert.equal(w9.points, 5, String(revision));
    assert.doesNotMatch(w9.message, /revision number/);
  }
});

test('W10: higher order controls are listed before administrative controls and PPE within each step', () => {
  assert.equal(item(checkSwms(GOOD), 'W10').points, 5);
  const steps = structuredClone(GOOD.steps);
  // Gloves first, then the mesh: out of order in the one step that has both kinds.
  steps[2].controls = [steps[2].controls[2], steps[2].controls[0], steps[2].controls[1]];
  const result = item(checkSwms(variant({ steps })), 'W10');
  assert.equal(result.points, 0);
  assert.match(result.message, /in: Remove and replace roof sheets\./);
  // With a second step in order, half the judged steps are in order.
  const ordered = { step: 'Fix the flashings', hazards: ['Falling from the roof edge.'], controls: ['Flashings are fixed from inside the guardrail.', 'Gloves are worn.'] };
  assert.equal(item(checkSwms(variant({ steps: [...steps, ordered] })), 'W10').points, 3);
  // A step with no higher order control is not judged here (W2 marks it).
  const admin = [{ step: 'Plan the work', hazards: ['Working at height.'], controls: ['The supervisor briefs the crew.', 'Gloves are worn.'] }];
  assert.equal(item(checkSwms(variant({ steps: [...GOOD.steps, ...admin] })), 'W10').points, 5);
});

test('W11: each step names a responsible position, not only one person for the SWMS', () => {
  assert.equal(item(checkSwms(GOOD), 'W11').points, 5);
  // Named in a control ("The supervisor checks ..."), or against the step.
  const none = GOOD.steps.map((step, n) => ({ ...step, responsible: '', controls: n ? step.controls : ['Access is by the scaffold stair only, inspected and tagged before use.'] }));
  const result = checkSwms(variant({ steps: none }));
  assert.equal(item(result, 'W11').points, 0);
  assert.match(item(result, 'W11').message, /3 of 3 steps name none/);
  assert.deepEqual(failed(result), [], 'one responsible person for the SWMS still passes H6');
  assert.equal(item(checkSwms(variant({ steps: none.map((step, n) => (n ? step : { ...step, responsible: 'Leading hand' })) })), 'W11').points, 2);
});

test('W12: work that needs a permit names it', () => {
  const steps = (extra) => [...GOOD.steps, extra];
  assert.equal(item(checkSwms(GOOD), 'W12').points, 5);
  // Hot work.
  const weld = { step: 'Weld the box gutter brackets', hazards: ['Sparks and fire.'], controls: ['A fire extinguisher is at the work area.'] };
  const unnamed = item(checkSwms(variant({ steps: steps(weld) })), 'W12');
  assert.equal(unnamed.points, 0);
  assert.match(unnamed.message, /a hot work permit \(hot work\)/);
  assert.equal(item(checkSwms(variant({ steps: steps({ ...weld, controls: [...weld.controls, 'Welding starts only under a hot work permit from the principal contractor.', 'A fire watch stays for 30 minutes after welding stops.'] }) })), 'W12').points, 5);
  // Heat welded vinyl, solvent welded pipe and painting welds are not hot work.
  for (const step of ['Lay the vinyl with heat-welded joins', 'Paint the site welds', 'Solvent weld the PVC pipe']) {
    assert.equal(item(checkSwms(variant({ steps: steps({ step, hazards: ['Fumes.'], controls: ['The area is ventilated.'] }) })), 'W12').points, 5, step);
  }
  // Confined space entry.
  const tank = { step: 'Enter the confined space', hazards: ['Low oxygen.'], controls: ['The air is tested before entry.'] };
  assert.equal(item(checkSwms(variant({ steps: steps(tank) })), 'W12').points, 0);
  assert.equal(item(checkSwms(variant({ steps: steps({ ...tank, controls: [...tank.controls, 'A confined space entry permit is issued for each entry.'] }) })), 'W12').points, 5);
  // Digging near services.
  const dig = { step: 'Dig the footings', hazards: ['Striking underground services.'], controls: ['Services are located before digging.'] };
  assert.equal(item(checkSwms(variant({ steps: steps(dig) })), 'W12').points, 0);
  assert.equal(item(checkSwms(variant({ steps: steps({ ...dig, controls: [...dig.controls, 'Digging starts only under the principal contractor\'s excavation permit.'] }) })), 'W12').points, 5);
  // Overhead lines, and isolation.
  const lines = { step: 'Work near the overhead power lines', hazards: ['Contact with the lines.'], controls: ['A safety observer watches the crane.'] };
  assert.match(item(checkSwms(variant({ steps: steps(lines) })), 'W12').message, /network operator's written permission/);
  assert.equal(item(checkSwms(variant({ steps: steps({ ...lines, controls: ['Work starts only under the network operator\'s written permission.'] }) })), 'W12').points, 5);
  const isolate = { step: 'Isolate the switchboard', hazards: ['Electric shock.'], controls: ['The electrician tests for dead.'] };
  const shop = 'Replace the metal roof sheets on a two storey commercial building, 7 m to the eaves.';
  assert.match(item(checkSwms(variant({ task: shop, steps: steps(isolate) })), 'W12').message, /isolation permit/);
  assert.equal(item(checkSwms(variant({ task: shop, steps: steps({ ...isolate, controls: ['An isolation permit is issued and each worker fits a personal lock.'] }) })), 'W12').points, 5);
  // Domestic work (a house, or a Northern Territory "Yes" to residential work) needs no isolation permit.
  assert.equal(item(checkSwms(variant({ steps: steps(isolate) })), 'W12').points, 5);
  assert.equal(item(checkSwms(variant({ task: 'Replace the roof sheets on a carport.', residential: 'Yes', steps: steps(isolate) })), 'W12').points, 5);
  assert.match(item(checkSwms(variant({ task: 'Replace the roof sheets on a carport.', residential: 'No', steps: steps(isolate) })), 'W12').message, /isolation permit/);
  // Roof access: only where the SWMS says the site runs a permit system.
  const permitSite = { ...GOOD.site, conditions: [...GOOD.site.conditions, 'The site runs a permit system: permits are issued by the principal contractor.'] };
  assert.match(item(checkSwms(variant({ site: permitSite })), 'W12').message, /a roof access permit/);
  assert.equal(item(checkSwms(variant({ site: { ...permitSite, conditions: [...permitSite.conditions, 'Roof access permit obtained each day.'] } })), 'W12').points, 5);
  // Two kinds needed, one named: half the points, rounded.
  assert.equal(item(checkSwms(variant({ steps: [...GOOD.steps, weld, { ...tank, controls: ['A confined space entry permit is issued for each entry.'] }] })), 'W12').points, 3);
});

test('the AI reading gives a responsible position per step; answers without it are still read', () => {
  assert.ok(CHECK_SCHEMA.properties.steps.items.required.includes('responsible'));
  assert.match(CHECK_BRIEF, /responsible: the person or position/);
  assert.ok(validSwms(READ));
  const withPosition = { ...READ, steps: READ.steps.map((step) => ({ ...step, responsible: 'Leading hand' })) };
  assert.ok(validSwms(withPosition));
  assert.ok(!validSwms({ ...READ, steps: READ.steps.map((step) => ({ ...step, responsible: 3 })) }));
  const read = { ...withPosition, site: { address: READ.siteAddress, conditions: [] } };
  assert.equal(item(checkSwms(read), 'W11').points, 5);
  assert.equal(item(checkSwms({ ...read, steps: READ.steps }), 'W11').points, 0);
});

// ---- Practice documents (owner decision, 6 October 2026) ----

test('no company is named in the check\'s sources', () => {
  for (const source of Object.values(SOURCES)) assert.doesNotMatch(source, /Multiplex/);
  assert.match(SOURCES.W10, /a tier 1 builder's published SWMS review checklist/);
});

test('H5 and W3: "correct lifting technique", "lift correctly" and "proper lifting" leave the decision to the worker', () => {
  for (const line of ['Use correct lifting technique.', 'Use the correct technique when lifting sheets.', 'Lift correctly and get help with heavy items.', 'Proper lifting technique is used.', 'Use proper lifting.']) {
    assert.equal(isVague(line), true, line);
  }
  for (const line of ['Sheets over 20 kg are team lifted or moved on a trolley.', 'The lifting technique is shown at the pre-start.']) assert.equal(isVague(line), false, line);
  const lifting = { step: 'Remove and replace roof sheets', hazards: ['Falling through the open roof frame.'], controls: ['Use correct lifting technique.'] };
  const result = checkSwms(variant({ steps: [...GOOD.steps, lifting] }));
  assert.match(item(result, 'H5').message, /correct lifting technique/);
});

test('W5: a scissor lift needs operator competency, an EWP operator card or a verification of competency', () => {
  const scissor = { step: 'Fix the ceiling brackets from a scissor lift', hazards: ['Crushing against the ceiling.'], controls: ['The scissor lift is checked at the pre-start.'], responsible: 'Leading hand' };
  const without = item(checkSwms(variant({ steps: [...GOOD.steps, scissor] })), 'W5');
  assert.match(without.message, /Match a licence or ticket to the plant and work: scissor lift/);
  for (const proof of ['Scissor lift operators hold an EWP operator card.', 'Operators are trained and competent on the scissor lift.', 'A verification of competency is held for the scissor lift.']) {
    const result = item(checkSwms(variant({ steps: [...GOOD.steps, { ...scissor, controls: [...scissor.controls, proof] }] })), 'W5');
    assert.doesNotMatch(result.message, /scissor lift/, proof);
  }
});

test('W12: hot work under a permit also needs a fire watch and an extinguisher', () => {
  const weld = (controls) => ({ step: 'Weld the box gutter brackets', hazards: ['Sparks and fire.'], controls: ['Welding starts only under a hot work permit from the principal contractor.', ...controls] });
  const run = (controls) => item(checkSwms(variant({ steps: [...GOOD.steps, weld(controls)] })), 'W12');
  const neither = run([]);
  assert.ok(neither.points < 5);
  assert.match(neither.message, /a fire watch during and after the work and a fire extinguisher at the work/);
  assert.match(run(['A fire extinguisher is kept at the work.']).message, /add a fire watch/);
  assert.match(run(['A fire watch stays for 30 minutes after the work.']).message, /add a fire extinguisher/);
  assert.equal(run(['A fire extinguisher is kept at the work.', 'A fire watch stays for 30 minutes after the work.']).points, 5);
  assert.equal(run(['Fire-fighting equipment is at hand, and a fire watch checks the area afterwards.']).points, 5);
  // No hot work, nothing asked.
  assert.equal(item(checkSwms(GOOD), 'W12').points, 5);
});

// ---- Calibration against real subcontractor SWMS (October 2026) ----

test('H2: a barricaded trench is an isolation control for the trench', () => {
  const steps = [...GOOD.steps, { step: 'Dig the stormwater trench', hazards: ['Falling into the open trench.'], controls: ['Ensure open trenches are barricaded.'] }];
  const listed = variant({ highRisk: [...GOOD.highRisk, 'Excavations'], steps });
  assert.ok(!failed(checkSwms(listed)).includes('H2'));
  assert.ok(failed(checkSwms({ ...listed, steps: [...GOOD.steps, { ...steps[3], controls: ['Workers keep clear.'] }] })).includes('H2'));
});

test('H1: live boards in the hazards, mobile equipment, plant at height and step names that only check', () => {
  // Live boards named as a hazard are there: energised electrical work is implied.
  const generator = { step: 'Connect the generator', hazards: ['Live boards.', 'Electric shock.'], controls: ['The supervisor confirms the isolation before connecting.'] };
  assert.match(item(checkSwms(variant({ steps: [...GOOD.steps, generator] })), 'H1').message, /does not list: .*energised electrical/);
  // "Mobile equipment" is the mobile plant category.
  const plant = { step: 'Load out with the skid steer', hazards: ['Struck by the skid steer.'], controls: ['An exclusion zone is kept around the skid steer.'] };
  assert.ok(failed(checkSwms(variant({ steps: [...GOOD.steps, plant] }))).includes('H1'));
  assert.ok(!failed(checkSwms(variant({ highRisk: [...GOOD.highRisk, 'Mobile equipment'], steps: [...GOOD.steps, plant] }))).includes('H1'));
  // A step that only checks, inspects or warns does not make the work high risk.
  for (const step of ['Check walls and ceilings for services and confirm the location of any gas lines', 'Check site conditions. Inspect the area, in particular be aware of overhead power lines.']) {
    assert.deepEqual(failed(checkSwms(variant({ steps: [...GOOD.steps, { step, hazards: ['Striking a service.'], controls: ['Services are located before drilling.'] }] }))), [], step);
  }
  assert.ok(failed(checkSwms(variant({ steps: [...GOOD.steps, { step: 'Cut into the live gas main', hazards: ['Gas leak.'], controls: ['The main is isolated and purged.'] }] }))).includes('H1'));
  // An EWP or scaffold in the plant list puts people at height, unless the SWMS says no one could fall 2 m.
  const painting = { ...variant({ highRisk: [], fallRisk: '' }), task: 'Paint the window frames of a shop.', steps: [{ step: 'Paint', hazards: ['Paint fumes.'], controls: ['Open the doors and run a fan.'] }], plant: ['Ladders, scaffold, EWP'] };
  assert.match(item(checkSwms(painting), 'H1').message, /falling more than 2/);
  assert.doesNotMatch(item(checkSwms({ ...painting, fallRisk: 'no' }), 'H1').message, /falling more than 2/);
  // A lifting accessory used under a crane is not a crane.
  assert.doesNotMatch(item(checkSwms({ ...painting, fallRisk: 'no', plant: ['Vacuum lifter: lifting gear when used under a crane.'] }), 'H1').message, /mobile plant/);
});

test('H1: non-structural strip-out is not load-bearing demolition; concrete boom pumping is mobile plant', () => {
  const strip = { ...variant({ highRisk: [], fallRisk: 'no', state: 'nsw' }), task: 'Demolition or removal of non-structural internal components of a building or structure.',
    steps: [{ step: 'Demolition of partitions', hazards: ['Dust.'], controls: ['Dust is extracted at the tool.'] }] };
  assert.ok(!failed(checkSwms(strip)).includes('H1'));
  assert.ok(failed(checkSwms({ ...strip, task: 'Demolish the structural walls of the building.' })).includes('H1'));
  // Listed in the SWMS's own words, boom pumping names the mobile plant category; in the task, it implies it.
  const pump = { ...variant({ fallRisk: 'no' }), task: 'Concrete Boom Pumping', highRisk: ['Concrete Boom Pumping'],
    steps: [{ step: 'Pumping', hazards: ['Struck by the boom.'], controls: ['An exclusion zone is kept under the boom.'] }] };
  assert.ok(!failed(checkSwms(pump)).includes('H1'));
  const unlisted = item(checkSwms({ ...pump, highRisk: ['Risk of a person falling more than 2 metres'] }), 'H1').message;
  assert.match(unlisted, /mobile plant/);
  // Near power lines only where the SWMS says so: boom pumping alone does not imply it.
  assert.doesNotMatch(unlisted, /energised/);
});

test('H3: only a physical fall control counts, so a harness-only roof SWMS fails', () => {
  const roof = (controls, plant = GOOD.plant) => checkSwms(variant({ plant, steps: [{ step: 'Work on the roof', hazards: ['Falling from the roof edge.'], controls }] }));
  // An isolation line or a barricade under the work is not a fall control.
  assert.ok(failed(roof(['Isolate the solar array at the DC isolator.', 'Barricade the area below the work area.', 'Workers wear a harness on a roof anchor.'])).includes('H3'));
  assert.match(item(roof(['Isolate the solar array.', 'Workers wear a harness on a roof anchor.']), 'H3').message, /harness alone/);
  assert.ok(!failed(roof(['Edge protection is installed around the roof before work starts.'])).includes('H3'));
  assert.ok(failed(roof(['There is no edge protection; workers wear a harness.'])).includes('H3'));
  // An EWP in the plant list is the platform the work is done from.
  assert.ok(!failed(roof(['Workers wear a harness in the basket.'], ['Boom lift: inspected before each shift.'])).includes('H3'));
  // A barricade at a trench edge stops a fall into it.
  assert.ok(!failed(checkSwms(variant({ steps: [{ step: 'Work beside the trench', hazards: ['Falling into the trench.'], controls: ['The trench edge is barricaded.'] }] }))).includes('H3'));
});

test('H5: "be aware of" followed by the control, and PPE that lists the items, are not vague; "where deemed necessary" and "using caution" are', () => {
  for (const line of ['Be aware of voids in recently backfilled trenches and avoid placing screw jacks over unprotected drains.',
    'Be aware of overhead power lines; keep the boom 6 m clear.', 'Use appropriate PPE to protect skin (long sleeve shirt, long pants, safety footwear).',
    'Wear suitable PPE: safety glasses, gloves and steel cap boots.']) assert.equal(isVague(line), false, line);
  for (const line of ['Be aware of soft or uneven ground when stepping down.', 'Be aware of other moving plant when getting in and out of the truck.',
    'Workers to be aware of the roof edge.', 'Use appropriate PPE.', 'Install edge protection where deemed necessary.', 'Climb the ladder using caution at all times.',
    'Exercise caution near the roof edge.']) assert.equal(isVague(line), true, line);
});

test('H6 and W11: "all workers" names the signatories, not a person or position who checks', () => {
  const result = checkSwms(variant({ responsiblePerson: 'All workers who sign on to this SWMS' }));
  assert.deepEqual(failed(result), ['H6']);
  assert.match(item(result, 'H6').message, /names the workers who sign on/);
  const steps = GOOD.steps.map((step) => ({ ...step, responsible: 'All workers who sign on to this SWMS', controls: step.controls.filter((line) => !/supervisor|scaffolder/i.test(line)) }));
  assert.equal(item(checkSwms(variant({ steps })), 'W11').points, 0);
  assert.equal(item(checkSwms(variant({ steps: steps.map((step) => ({ ...step, responsible: 'All workers and the supervisor' })) })), 'W11').points, 5);
});

test('W11: pass is judged on the points shown, so 4.5 shows and passes as 5 of 5', () => {
  const steps = Array.from({ length: 10 }, (_, n) => ({ step: `Fix sheet run ${n + 1}`, hazards: ['Cuts from sheet edges.'], controls: ['Cut resistant gloves are worn.'], responsible: n ? 'Leading hand' : '' }));
  const w11 = item(checkSwms(variant({ steps })), 'W11');
  assert.equal(w11.points, 5);
  assert.equal(w11.pass, true);
});

test('W2: steps with no controls count against the hierarchy score', () => {
  const bare = Array.from({ length: 6 }, (_, n) => ({ step: `Remove roof sheet run ${n + 1}`, hazards: [], controls: [] }));
  const full = item(checkSwms(GOOD), 'W2').points;
  const partial = item(checkSwms(variant({ steps: [...GOOD.steps, ...bare] })), 'W2').points;
  assert.ok(partial <= full - 5, `${partial} against ${full}`);
});

test('W3: crane set-up wording is measurable', () => {
  for (const line of ['Outriggers are fully extended and locked on outrigger pads.', 'No one stands under the load or the boom.', 'The hopper grille stays closed while pumping.']) {
    const steps = [{ step: 'Set up the crane', hazards: ['The crane overturns.'], controls: [line] }];
    assert.equal(item(checkSwms(variant({ steps })), 'W3').points, 10, line);
  }
});

test('W4: review triggers are read where the SWMS says it is reviewed', () => {
  const w4 = (review) => item(checkSwms(variant({ review, steps: GOOD.steps.map((step) => ({ ...step, controls: step.controls.filter((line) => !/before each shift/.test(line)) })) })), 'W4');
  assert.equal(w4('The supervisor checks the controls daily. The SWMS is reviewed when changes to the workplace occur. If controls are inadequate, stop work, review the SWMS and re-brief the team.').points, 7);
  // An emergency step is not a review trigger.
  assert.match(w4('The supervisor checks the controls daily. The SWMS is reviewed when changes to the workplace occur. In an emergency, activate the site incident response procedure.').message, /after an incident/);
});

test('W5: licences are matched to the task, step names and plant list, not to passing mentions', () => {
  const w5 = (extra, plant = GOOD.plant) => item(checkSwms(variant({ plant, steps: [...GOOD.steps, extra] })), 'W5').message;
  assert.doesNotMatch(w5({ step: 'Use power tools', hazards: ['Electric shock from a live electrical installation.'], controls: ['Check the RCD on the switchboard before use.', 'Ladders used near live electrical installations are non-conductive.'] }), /Match a licence/);
  assert.doesNotMatch(w5({ step: 'Jackhammer the beam over the roller door', hazards: ['Dust.'], controls: ['Dust is extracted at the tool.'] }), /roller/);
  assert.doesNotMatch(w5({ step: 'Install security cabling', hazards: ['Electrical installations nearby.'], controls: ['Cable is pulled by hand.'] }), /Match a licence/);
  assert.match(w5({ step: 'Upgrade the switchboard', hazards: ['Electric shock.'], controls: ['The board is isolated first.'] }), /Match a licence or ticket to the plant and work: Upgrade the switchboard/);
  assert.match(item(checkSwms(variant({ licences: ['White card (all crew)'], plant: ['Smooth drum roller'], steps: [{ step: 'Compact the base', hazards: ['Noise.'], controls: ['Hearing protection is worn.'] }] })), 'W5').message, /Smooth drum roller/);
});

test('W7: generic control wording is not site detail; a template with no site gets nothing for it', () => {
  const generic = ['Access is by the side gate only.', 'Coordinate with other trades on site.', 'The public are kept clear with barricades.', 'Dial before you dig for underground services.'];
  const steps = [{ ...GOOD.steps[1], controls: [...GOOD.steps[1].controls, ...generic] }];
  assert.equal(item(checkSwms(variant({ steps })), 'W7').points, 10);
  const noConditions = item(checkSwms(variant({ steps, site: { address: GOOD.site.address, conditions: [] } })), 'W7');
  assert.equal(noConditions.points, 6);
  assert.equal(item(checkSwms(variant({ steps, site: { address: '', conditions: [] } })), 'W7').points, 2);
});

test('W9: an expired review date and an old SWMS never reviewed lose their points; placeholders are blank', () => {
  const w9 = (changes) => item(checkSwms(variant(changes)), 'W9');
  assert.equal(w9({}).points, 5);
  assert.match(w9({ date: '09/08/2018', reviewDate: '09/08/2020' }).message, /review date \(09\/08\/2020\) has passed/);
  assert.equal(w9({ date: '09/08/2018', reviewDate: '09/08/2020' }).points, 3);
  assert.match(w9({ date: '13/03/2024', reviewDate: '' }).message, /more than two years ago/);
  assert.equal(w9({ date: '13/03/2024', reviewDate: '' }).points, 3);
  // Reviewed and still current: no penalty for an old first date.
  assert.equal(w9({ date: '13/03/2024', reviewDate: '1 March 2027' }).points, 5);
  // Template and sample stand-ins are not answers.
  for (const address of ['Various sites', 'Multiple – Various sites per day.', 'Level 7 Example St Surry Hills NSW']) {
    assert.ok(failed(checkSwms(variant({ site: { address, conditions: GOOD.site.conditions } }))).includes('H4'), address);
  }
  assert.ok(failed(checkSwms(variant({ signatures: [{ name: 'Mr Example' }] }), { stage: 'on-site' })).includes('H7'));
  assert.ok(failed(checkSwms(variant({ responsiblePerson: 'Mr Example (Site Person in Charge of Job)' }))).includes('H6'));
  assert.equal(w9({ principalContractor: 'Sample Builder Pty Ltd' }).points, 3);
});

test('W12: work permit systems, fire suppression, power line permits, grinding as hot work, and energised work', () => {
  const w12 = (extra, changes = {}) => item(checkSwms(variant({ ...changes, steps: [...GOOD.steps, extra] })), 'W12');
  const shop = 'Replace the metal roof sheets on a two storey commercial building, 7 m to the eaves.';
  // A work permit system answers an isolation (a roof task would then need a roof access permit too);
  // charged and tagged fire suppression is an extinguisher.
  const isolate = { step: 'Isolate the switchboard', hazards: ['Electric shock.'], controls: ['Use a work permit system to control access.'] };
  assert.equal(item(checkSwms(variant({ task: 'Replace the light fittings in a commercial building.', steps: [isolate] })), 'W12').points, 5);
  assert.equal(w12({ step: 'Weld the gutter brackets', hazards: ['Fire.'], controls: ['Work under a hot work permit.', 'A fire watch stays for 30 minutes.', 'Fire suppression of the correct class is available, charged and tagged.'] }).points, 5);
  // Power lines: an access permit or the network operator's permission names it; kept outside the approach distance, none is needed.
  const lines = { step: 'Work near the overhead power lines', hazards: ['Contact with the lines.'], controls: ['A safety observer watches the crane.'] };
  assert.equal(w12({ ...lines, controls: ['Work starts only under an electrical access permit.'] }).points, 5);
  assert.equal(w12({ ...lines, controls: ['Work starts only with written permission from the network operator.'] }).points, 5);
  assert.equal(w12({ ...lines, controls: ['Keep all plant and people outside the approach distance for the lines.'] }).points, 5);
  assert.equal(w12({ step: 'Inspect the area, in particular be aware of overhead power lines', hazards: ['Contact with the lines.'], controls: ['Look up before moving the scaffold.'] }).points, 5);
  // Angle grinding throws sparks: hot work, wherever the SWMS says it is done.
  assert.match(w12({ step: 'Removal of bolts', hazards: ['Sparks.'], controls: ['Use an angle grinder to cut the bolts flush.', 'Keep a fire extinguisher close by.'] }).message, /a hot work permit \(hot work\)/);
  assert.equal(w12({ step: 'Cut in the skylight', hazards: ['Cuts.'], controls: ['Roof sheet is cut with snips, not a grinder, to avoid sparks.'] }).points, 5);
  // Energised electrical work needs an authorisation for it and a risk assessment, not an isolation permit.
  const live = w12({ step: 'Test and fault find on energised low voltage equipment', hazards: ['Electric shock.'], controls: ['A safety observer trained in rescue is present.'] }, { task: shop });
  assert.match(live.message, /written authorisation for the energised work, with its risk assessment/);
  assert.doesNotMatch(live.message, /isolation permit/);
  assert.equal(w12({ step: 'Test and fault find on energised low voltage equipment', hazards: ['Electric shock.'], controls: ['Live work starts only with a written energised work authorisation and a recorded risk assessment.'] }, { task: shop }).points, 5);
});

test('with no state given, the result says so and uses the national categories, not Queensland\'s', () => {
  const none = checkSwms({ ...GOOD, state: '' });
  assert.equal(none.state, 'unknown');
  assert.match(item(none, 'H1').message, /No state was given, so the national model WHS Regulations categories were used/);
  assert.equal(checkSwms(GOOD).state, 'qld');
  assert.equal(checkSwms({ ...GOOD, state: '' }, { state: 'nsw' }).state, 'nsw');
  assert.doesNotMatch(item(checkSwms(GOOD), 'H1').message, /No state was given/);
});

// ---- Calibration: asbestos, civil and plant SWMS, and regulator investigation reports ----

test('H3: an option left open, or a way of lowering material, is not a chosen fall control', () => {
  const roof = (line) => checkSwms(variant({ steps: [{ step: 'Remove the sheets at height', hazards: ['Falls from a height.'], controls: [line, 'Workers wear a harness.'] }] }));
  for (const line of ['Do not drop sheets from height, always lower to ground using a safe method such as a scissor lift or scaffold.', 'Use edge protection where required.', 'Use approved ladders, scaffolds and EWPs etc.']) {
    assert.ok(failed(roof(line)).includes('H3'), line);
  }
  assert.ok(!failed(roof('Work from a scissor lift with guardrails.')).includes('H3'));
});

test('H1 and H2: plant and water wording, steps marked HRCW, rail detonators, and categories that do not apply', () => {
  const plant = { step: 'Pour the kerb', hazards: ['Struck by the kerb machine.'], controls: ['An exclusion zone is kept around the machine.'] };
  const task = 'Pour kerbs with the excavator and kerb machine.';
  assert.ok(!failed(checkSwms(variant({ task, highRisk: [...GOOD.highRisk, 'Working around plant'], steps: [...GOOD.steps, plant] }))).includes('H1'));
  // A creek listed is the drowning category.
  assert.ok(failed(checkSwms(variant({ highRisk: [...GOOD.highRisk, 'Work beside the creek'] }))).includes('H2'));
  // Steps marked HRCW with no category listed.
  const marked = { ...variant({ highRisk: [], fallRisk: 'no' }), task: 'High pressure water cleaner', steps: [{ step: 'HRCW Operating the pressure cleaner', hazards: ['Water jet injury.'], controls: ['The gun has a dead-man trigger.'] }] };
  assert.match(item(checkSwms(marked), 'H1').message, /marked as high risk construction work/);
  assert.ok(failed(checkSwms(marked)).includes('H1'));
  // Railway detonators are track signals, not the use of explosives.
  const rail = variant({ task: 'Protection officer in the rail corridor', highRisk: [...GOOD.highRisk, 'Use of explosives'], plant: ['Railway signalling devices (detonators)'] });
  assert.ok(!failed(checkSwms(rail)).includes('H2'));
  // A category that has no controls: add them, or delete it if it does not apply.
  assert.match(item(checkSwms(variant({ highRisk: [...GOOD.highRisk, 'Structural alterations that require temporary support'] })), 'H2').message, /delete any category that does not apply/);
});

test('H2: a step that clears, cleans or digs at a conveyor, feeder or chute isolates and locks it out', () => {
  const step = { step: 'Use a shovel to dig out under the tail of the plate feeder', hazards: ['Caught in the feeder.'], controls: ['Stand clear of moving parts.'] };
  const result = checkSwms(variant({ steps: [...GOOD.steps, step] }));
  assert.match(item(result, 'H2').message, /Isolate and lock out the plant/);
  assert.ok(!failed(checkSwms(variant({ steps: [...GOOD.steps, { ...step, controls: ['The feeder is isolated and each worker fits a personal lock before digging.'] }] }))).includes('H2'));
  // A conditional isolation is not the control; a landscaping "dig" with no fixed plant asks nothing.
  assert.ok(failed(checkSwms(variant({ steps: [...GOOD.steps, { ...step, controls: ['If a blockage occurs, isolate the feeder.'] }] }))).includes('H2'));
  assert.ok(!failed(checkSwms(variant({ steps: [...GOOD.steps, { step: 'Digging and planting', hazards: ['Strain.'], controls: ['Use the auger with two people.'] }] }))).includes('H2'));
});

test('H2: explosives work needs a measured exclusion zone and a sentry at each access point, not the word "blast"', () => {
  const blast = (controls) => checkSwms(variant({ task: 'Drill and blast the quarry bench.', highRisk: [...GOOD.highRisk, 'Work involving the use of explosives'],
    steps: [...GOOD.steps, { step: 'Charge and fire the blast', hazards: ['Flyrock.'], controls: ['The blast is fired by a licensed shotfirer.', ...controls] }] }));
  const vagueZone = blast(['Blast exclusion zones set in place and controlled before lead-in line is run out.', 'Sentries to be posted as per blasting procedure.']);
  assert.ok(failed(vagueZone).includes('H2'));
  assert.match(item(vagueZone, 'H2').message, /measured exclusion zone distance from the blast and a sentry or blast guard at each access point/);
  assert.ok(!failed(blast(['The shotfirer measures the exclusion zone boundary with a laser range finder before loading.', 'A sentry is posted at each road and gate into the exclusion zone.'])).includes('H2'));
  assert.ok(!failed(blast(['The exclusion zone is 500 m from the blast.', 'Blast guards are posted at all access points.'])).includes('H2'));
  assert.match(item(blast(['The exclusion zone is 500 m from the blast.']), 'H2').message, /a sentry or blast guard at each access point/);
});

test('H5: more wording calibrated against real and regulator SWMS', () => {
  for (const line of ['Consult the asbestos register to identify where possible asbestos materials remain.', 'Crane operators hold a high risk work licence, and are licensed and VOC\'d as required.',
    'Assess the exposure of operators to noise and determine the required controls such as audiometric testing.', 'Appropriate PPE: respirator, gloves and safety boots.']) assert.equal(isVague(line), false, line);
  for (const line of ['Look out for other plant.', 'Keep an eye on the weather.', 'Stop the shot in the event of an unexpected risk occurrence.']) assert.equal(isVague(line), true, line);
  // A single "Whole task" step is read with the task text, so its vague controls are for high risk work.
  const whole = { ...variant({ highRisk: [], fallRisk: 'no' }), task: 'Blasting with explosives in the quarry.', steps: [{ step: 'Whole task', hazards: ['Fly rock.'], controls: ['Look out for people near the blast.'] }] };
  assert.ok(failed(checkSwms(whole)).includes('H5'));
});

test('W1: copied generic hazard lists, one whole-task step and hazard headings are marked down', () => {
  const generic = ['Falls on the same level.', 'Objects on ground.', 'Uneven or slippery surface.', 'Hazardous manual tasks.'];
  const copied = ['Plan', 'Set up', 'Remove sheets', 'Clean up'].map((step, n) => ({ step, hazards: [...generic, ['Work outdoors.', 'Work at height.', 'Dust.', 'Noise.'][n]], controls: ['Barricades are set up.'] }));
  assert.match(item(checkSwms(variant({ steps: copied })), 'W1').message, /copied into most steps/);
  const one = item(checkSwms(variant({ steps: [{ step: 'Whole task', hazards: ['Falls.'], controls: ['Edge protection is installed.'] }] })), 'W1');
  assert.ok(one.points <= 5, `${one.points}`);
  assert.match(one.message, /one step for the whole task/);
  const headings = ['Manual handling', 'Noise', 'Electrical hazards', 'Working at heights'].map((step) => ({ step, hazards: [`${step} injury.`], controls: ['Barricades are set up.'] }));
  assert.match(item(checkSwms(variant({ steps: headings })), 'W1').message, /hazard headings/);
});

test('W3: vague wording costs in proportion; specialist measures are checkable; unsafe controls and unmanaged silica are marked down', () => {
  const lines = Array.from({ length: 19 }, (_, n) => `Sheet ${n + 1} is fixed with screws at 300 mm centres.`);
  const steps = [{ step: 'Fix the sheets', hazards: ['Cuts.'], controls: [...lines, 'Use extra screws as required.'] }];
  assert.ok(item(checkSwms(variant({ steps })), 'W3').points >= 9);
  for (const line of ['Cover the floor with 200 micron plastic sheeting.', 'Clean up with an H class vacuum.', 'Wear a P2 respirator and Type 5 coveralls.', 'Air monitoring by an occupational hygienist.']) {
    assert.equal(item(checkSwms(variant({ steps: [{ step: 'Remove the sheets', hazards: ['Asbestos fibres.'], controls: [line] }] })), 'W3').points, 10, line);
  }
  const jet = item(checkSwms(variant({ steps: [...GOOD.steps, { step: 'Clean with the water jet', hazards: ['Jet injury.'], controls: ['The trigger is locked on for long runs.'] }] })), 'W3');
  assert.match(jet.message, /dead-man control/);
  const cut = item(checkSwms(variant({ steps: [...GOOD.steps, { step: 'Saw cut the concrete slab', hazards: ['Noise.'], controls: ['Hearing protection is worn.'] }] })), 'W3');
  assert.match(cut.message, /silica dust controls/);
});

test('W5: plant named is not a licence; asbestos sampling is an assessor\'s work; electrical licence numbers and non-electrical work', () => {
  const w5 = (changes) => item(checkSwms(variant(changes)), 'W5').message;
  assert.match(w5({ licences: ['White card'], plant: ['Tray truck with crane'] }), /crane/);
  assert.doesNotMatch(w5({ licences: ['White card'], plant: ['Forklift: pre-start each shift: LF licence held'] }), /forklift/i);
  const sampling = { task: 'Asbestos sampling and survey of plant rooms.', licences: ['White card'], steps: [{ step: 'Sample materials suspected of containing asbestos', hazards: ['Fibres.'], controls: ['Wet the material first.'] }] };
  assert.doesNotMatch(w5(sampling), /removal/i);
  assert.match(w5(sampling), /Match a licence/);
  assert.doesNotMatch(w5({ ...sampling, licences: ['Licensed asbestos assessor LAA001234'] }), /Match a licence/);
  assert.match(w5({ task: 'Remove asbestos cement sheets.', licences: ['White card'] }), /Remove asbestos/);
  const solar = { task: 'Install solar panels and connect the inverter to the switchboard.', licences: ['White card'] };
  assert.match(w5(solar), /Match a licence/);
  assert.doesNotMatch(w5({ ...solar, licences: ['CEC accredited installer, EC12345'] }), /Match a licence/);
  assert.doesNotMatch(w5({ task: 'Lock out the power before non-electrical work in the roof space.', licences: ['White card'] }), /Match a licence/);
});

test('W6: a promise to write an emergency plan is not one; no emergency section loses the rescue share too', () => {
  const w6 = (emergency, extra = []) => item(checkSwms(variant({ emergency, steps: [{ ...GOOD.steps[1], controls: [...GOOD.steps[1].controls, ...extra] }] })), 'W6');
  assert.equal(w6(GOOD.emergency).points, 10);
  assert.ok(w6(['Develop an emergency plan and site-specific rescue procedures.']).points <= 3);
  assert.equal(item(checkSwms(variant({ highRisk: [], fallRisk: 'no', task: 'Paint a shop.', emergency: [], steps: [{ step: 'Paint', hazards: ['Fumes.'], controls: ['A fan runs.'] }] })), 'W6').points, 0);
});

test('W9 and W11: template prompts left in; a position named in passing is not responsible', () => {
  assert.match(item(checkSwms(variant({ steps: [...GOOD.steps, { step: 'Enter Job Description', hazards: ['Falls.'], controls: ['Mobile plant - specify'] }] })), 'W9').message, /template prompts/);
  const steps = GOOD.steps.map((step) => ({ ...step, responsible: '', controls: ['Isolate the power and ensure the supervisor obtains written confirmation.'] }));
  assert.equal(item(checkSwms(variant({ steps })), 'W11').points, 0);
  assert.equal(item(checkSwms(variant({ steps: steps.map((step) => ({ ...step, controls: ['The supervisor checks the isolation before work starts.'] })) })), 'W11').points, 5);
});

test('W12: a hand auger or rural site with services located needs no dig permit; householders are domestic work', () => {
  const dig = { step: 'Bore the post holes with a hand held auger', hazards: ['Striking underground services.'], controls: ['Services are located with a cable locator before digging.'] };
  assert.equal(item(checkSwms(variant({ steps: [...GOOD.steps, dig] })), 'W12').points, 5);
  assert.equal(item(checkSwms(variant({ steps: [...GOOD.steps, { ...dig, step: 'Dig the footings with the excavator' }] })), 'W12').points, 0);
  const shop = 'Replace the roof insulation in roof spaces.';
  const lock = { step: 'Lock out the power at the switchboard', hazards: ['Electric shock.'], controls: ['The householder is told before the power is locked out.'] };
  assert.equal(item(checkSwms(variant({ task: shop, steps: [lock] })), 'W12').points, 5);
  assert.match(item(checkSwms(variant({ task: shop, steps: [{ ...lock, controls: ['The tenant is told before the power is locked out.'] }] })), 'W12').message, /isolation permit/);
});

test('control levels: lock-out hardware, switching off, sealing, wrapping, HEPA and no go zones are isolation or engineering; "proper", "propane" and "short" are not propping or shoring', () => {
  for (const line of ['Fit a LOTO hasp and personal padlock to the isolator.', 'Switch the circuit breaker off and tag it.', 'Seal the sheets with PVA before removal.',
    'Wrap the sheets in 200 micron plastic.', 'Vacuum with a HEPA vacuum.', 'Work inside an enclosure under negative pressure.', 'Set a no go zone around the crane.', 'No worker is in the drop area while lifting.']) {
    assert.equal(controlLevel(line), 'Isolate or engineer', line);
  }
  for (const line of ['Use proper lifting technique.', 'Keep the propane cylinder upright.', 'Take a short break each hour.', 'Communicate the exclusion zones at the pre-start.']) {
    assert.notEqual(controlLevel(line), 'Isolate or engineer', line);
  }
});
