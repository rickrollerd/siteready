// The builder SWMS check (task #106), its email (#99) and the AI reading of an uploaded SWMS,
// with a stand-in for the model so no request is made or billed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkSwms, fromDraft, emailDraft, bandFor, controlLevel, isVague } = require('../builder-check');
const { readSwms, validSwms, CHECK_BRIEF, CHECK_SCHEMA } = require('../check-read');
const aiScope = require('../ai-scope');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const scenarios = require('../scenarios/scenarios.json');

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
  const unsigned = checkSwms(variant({ signatures: [{ name: '', date: '' }] }));
  assert.deepEqual(failed(unsigned), ['H7']);
  assert.match(unsigned.findings.find((item) => item.rule === 'H7').message, /no worker has signed/);
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
  const hard = checkSwms(variant({ signatures: [] }));
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

  const rejected = emailDraft(checkSwms(variant({ signatures: [], revision: '' })));
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
function draftCheck(index, signed = true) {
  const s = scenarios[index];
  const input = draftBody({ state: 'qld', task: s.task, fallRisk: s.fallRisk, facts: s.facts, ...SITE });
  const draft = prepareDraft(input);
  assert.equal(draft.kind, 'draft');
  return checkSwms(fromDraft(draft, { state: 'qld', swms: signed ? { signatures: [{ name: 'Jo Smith' }] } : {} }), { state: 'qld' });
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
  // A draft is checked before the crew signs, so H7 fails until they do.
  assert.ok(failed(draftCheck(8, false)).includes('H7'));
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
  for (const rule of ['W10', 'W11', 'W12']) assert.match(item(checkSwms(GOOD), rule).source, /Multiplex SWMS for HRCW review checklist rev 9 \(evidence/);
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
  assert.equal(item(checkSwms(variant({ steps: steps({ ...weld, controls: [...weld.controls, 'Welding starts only under a hot work permit from the principal contractor.'] }) })), 'W12').points, 5);
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
  assert.match(item(checkSwms(variant({ steps: steps(isolate) })), 'W12').message, /isolation permit/);
  assert.equal(item(checkSwms(variant({ steps: steps({ ...isolate, controls: ['An isolation permit is issued and each worker fits a personal lock.'] }) })), 'W12').points, 5);
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
