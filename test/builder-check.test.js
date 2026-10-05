// The builder SWMS check (task #106), its email (#99) and the AI reading of an uploaded SWMS,
// with a stand-in for the model so no request is made or billed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkSwms, fromDraft, emailDraft, bandFor, controlLevel } = require('../builder-check');
const { readSwms, CHECK_BRIEF, CHECK_SCHEMA } = require('../check-read');
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
      'Skylights are covered with fixed covers rated to take a fall before anyone goes onto the roof.'] },
    { step: 'Remove and replace roof sheets', hazards: ['Falling through the open roof frame.', 'Cuts from sheet edges.'], controls: [
      'Safety mesh to AS/NZS 4389 is fixed under the new sheets before they are laid.',
      'Sheets are lifted to the roof by a materials hoist, not carried up the stair.',
      'Cut resistant gloves are worn when handling sheets.'] },
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
  assert.equal(full.points, 10);
  assert.match(full.source, /Bernie Leen/);
  const none = checkSwms(variant({ review: 'The supervisor checks the controls before each shift.' })).findings.find((item) => item.rule === 'W4');
  assert.equal(none.points, 7);
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
    // H5 fires on library lines with "where needed" or "as needed" (reported to the owner, rule kept).
    assert.deepEqual(failed(result).filter((rule) => rule !== 'H5'), [], `#${index}`);
  }
  // The printed SWMS has a risk matrix and no revision number, and loses those points.
  const roof = draftCheck(0);
  assert.equal(roof.findings.find((item) => item.rule === 'W8').points, 3);
  assert.match(roof.findings.find((item) => item.rule === 'W9').message, /revision number/);
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
