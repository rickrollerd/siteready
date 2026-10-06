// The AI reading of a scope, with a stand-in for the model so no request is made or billed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupAccounts } = require('./helpers');
const db = require('../db');
const aiScope = require('../ai-scope');
const { BRIEF, SCHEMA, BRIEF_VERSION } = require('../ai-brief');

const SCOPE = [
  '4.2 Mechanical Works',
  '(a) Supply and install all ductwork, including straight and curved sections.',
  '(b) Lift the chillers into the plant room using a mobile crane.',
  'C-1.10 Make all roof penetrations and water proofing of those roof penetrations.',
  'C-1.35 Cutting roof/ exterior cladding (if required).',
].join('\n');

const READING = {
  activities: [
    { activity: 'Install ductwork', type: 'Site work', package: 'Trade installation: ceilings', crew: 'Sheet metal', clause: '4.2 (a)', quotes: ['Supply and install all ductwork, including straight and curved sections.'], where: '', plant: '', conditions: '', unknowns: 'Working height', matrixColumn: '' },
    { activity: 'Lift chillers into the plant room', type: 'Site work', package: 'Plant lifting and cranage', crew: 'Crane company', clause: '4.2 (b)', quotes: ['Lift the chillers into the plant room using a mobile crane.'], where: 'Plant room', plant: 'Mobile crane', conditions: '', unknowns: 'Weights', matrixColumn: '' },
  ],
  byOthers: [],
  conflicts: [
    { clauseA: 'C-1.10', quoteA: 'Make all roof penetrations and water proofing of those roof penetrations.', clauseB: 'C-1.35', quoteB: 'Cutting roof/ exterior cladding (if required).', why: 'Making a roof penetration is cutting the cladding.', confidence: 'Medium' },
  ],
};

// A stand-in for the SDK client: records what was asked and answers with the given reading.
// The step mapping call (its schema has "packages") gets its own answer.
const STEPS = { packages: [
  { package: 'Trade installation: ceilings', groups: ['ductwork', 'madeUpGroup'], unmatched: [] },
  { package: 'Plant lifting and cranage', groups: ['plantLift'], unmatched: [] },
] };
function standIn(answer, extra = {}, steps = STEPS) {
  const calls = [];
  return {
    calls,
    stepCalls: [],
    beta: {
      messages: {
        stream(params) {
          const mapping = Boolean(params.output_config.format.schema.properties.packages);
          (mapping ? this.parent.stepCalls : calls).push(params);
          const body = mapping ? steps : answer;
          return { finalMessage: async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 1000, output_tokens: 500 }, content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body) }], ...(mapping ? {} : extra) }) };
        },
      },
    },
  };
}
const withParent = (client) => { client.beta.messages.parent = client; return client; };

const company = { id: 'company-ai-1', name: 'Test Mechanical', abn: '33102417000' };

test.before(async () => {
  await setupAccounts();
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
});

test.after(() => {
  delete process.env.ANTHROPIC_API_KEY;
  aiScope.useClient(null);
});

test('the brief is v3 and the answer schema is strict', () => {
  assert.equal(BRIEF_VERSION, 'v3.4');
  assert.match(BRIEF, /Access equipment and methods this subcontractor must use/);
  assert.match(BRIEF, /Clauses about locating, protecting or not damaging existing services are site conditions, not activities/);
  assert.match(BRIEF, /the exclusion wins/);
  assert.match(BRIEF, /software set-up and configuration, licences, remote or off-site support, and training/);
  assert.match(BRIEF, /Read every word of the document/);
  assert.match(BRIEF, /A carve-out \("except", "unless", "other than"\) or a sequence/);
  const strict = (schema) => schema.type !== 'object' || (schema.additionalProperties === false
    && Object.keys(schema.properties).every((key) => schema.required.includes(key)) && Object.values(schema.properties).every(strict))
    && (schema.type !== 'array' || strict(schema.items));
  assert.ok(strict(SCHEMA));
});

test('the whole document is sent with the brief, on Claude Opus 5.5, and the reading is kept', async () => {
  const model = standIn(READING);
  aiScope.useClient(withParent(model));
  const started = await aiScope.startReading(company, SCOPE);
  assert.equal(started.status, 'reading');
  await started.done;
  const params = model.calls[0];
  assert.equal(params.model, 'claude-opus-5-5');
  assert.deepEqual(params.thinking, { type: 'adaptive' });
  assert.equal(params.output_config.format.type, 'json_schema');
  assert.equal(params.system[0].text, BRIEF);
  assert.ok(params.messages[0].content.includes(SCOPE), 'every word of the document is sent');
  const reading = await aiScope.getReading(company, started.id);
  assert.equal(reading.status, 'done');
  assert.equal(reading.reading.activities.length, 2);
  assert.equal(reading.checks.passed, true);
  assert.equal(reading.checks.quotesNotFound.length, 0);
  // Both calls are counted: 2 x (1,000 in at $4 + 500 out at $20 per million).
  const row = await db.one('SELECT cost_usd FROM ai_readings WHERE id = $1', [started.id]);
  assert.equal(Number(row.cost_usd), 0.028);
  // The step mapping sees each work package with site work, and the library; a made-up id never reaches the reading.
  const asked = model.stepCalls[0];
  assert.match(asked.system[0].text, /<library>[^]*ductwork: Fix hangers and supports/);
  assert.match(asked.messages[0].content, /Work package: Plant lifting and cranage\n- Lift chillers into the plant room \| plant: Mobile crane/);
  assert.equal(asked.output_config.effort, 'medium');
  assert.deepEqual(reading.reading.packages.map((item) => item.groups), [['ductwork'], ['plantLift']]);
  assert.deepEqual(reading.checks.unknownStepIds, ['madeUpGroup']);
});

test('the same document for the same company is not read again; another company cannot see it', async () => {
  const model = standIn(READING);
  aiScope.useClient(withParent(model));
  const again = await aiScope.startReading(company, SCOPE);
  assert.equal(again.kept, true);
  assert.equal(again.status, 'done');
  assert.equal(model.calls.length, 0);
  await assert.rejects(aiScope.getReading({ id: 'someone-else' }, again.id), /not found/);
  const other = await aiScope.startReading({ id: 'someone-else' }, SCOPE);
  assert.equal(other.kept, false);
  await other.done;
  assert.equal(model.calls.length, 1);
});

test('a quote not in the document, or shortened with "...", fails the check against the brief', () => {
  const made = {
    ...READING,
    activities: [
      { ...READING.activities[0], quotes: ['Supply and install all ductwork ... sections.'] },
      { ...READING.activities[1], quotes: ['Lift the boilers into the basement.'], package: 'Big lifts' },
    ],
  };
  const checks = aiScope.checkReading(made, SCOPE);
  assert.equal(checks.passed, false);
  assert.equal(checks.quotesShortened.length, 1);
  assert.equal(checks.quotesNotFound.length, 1);
  assert.deepEqual(checks.otherPackages, ['Big lifts']);
  // Curly quote marks and spacing differences still count as the same words.
  const tidy = aiScope.checkReading({ ...READING, activities: [{ ...READING.activities[0], quotes: ['Supply  and install all ductwork, including straight and curved sections.'] }] }, SCOPE);
  assert.equal(tidy.quotesNotFound.length, 0);
  // Only the closing punctuation differs: still found. One word changed: not found.
  const ends = aiScope.checkReading({ ...READING, activities: [{ ...READING.activities[0], quotes: ['Supply and install all ductwork, including straight and curved sections;', 'Supply and install all ductwork, including straight and curve sections.'] }] }, SCOPE);
  assert.equal(ends.quotesNotFound.length, 1);
  // An ellipsis the document itself has is not a shortened quote.
  const etc = aiScope.checkReading({ ...READING, activities: [{ ...READING.activities[0], quotes: ['all tie downs, restraints etc…required for delivery'] }] }, `${SCOPE}\nProvide all tie downs, restraints etc…required for delivery;`);
  assert.equal(etc.quotesShortened.length, 0);
  assert.equal(etc.quotesNotFound.length, 0);
});

test('a refusal, a cut-off answer or a malformed answer fails the reading with a plain message', async () => {
  const cases = [
    [standIn(READING, { stop_reason: 'refusal' }), /could not read this document/],
    [standIn(READING, { stop_reason: 'max_tokens' }), /Split it into parts/],
    [standIn('not json'), /could not be read/],
    [standIn({ activities: 'none' }), /not in the expected form/],
  ];
  for (const [model, message] of cases) {
    aiScope.useClient(withParent(model));
    const started = await aiScope.startReading(company, `${SCOPE}\n${message.source}`);
    await started.done;
    const reading = await aiScope.getReading(company, started.id);
    assert.equal(reading.status, 'failed');
    assert.match(reading.error, message);
  }
});

test('the AI reading is off without an API key, and a long document is refused, never cut short', async () => {
  const key = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(aiScope.enabled(), false);
  await assert.rejects(aiScope.startReading(company, SCOPE), /not switched on/);
  process.env.ANTHROPIC_API_KEY = key;
  await assert.rejects(aiScope.startReading(company, 'x'.repeat(2500001)), /too long/);
});

test('a reading cut off by a restart is marked failed after 30 minutes, and the document can be read again', async () => {
  const text = `${SCOPE}\nCut off by a restart.`;
  await db.query('INSERT INTO ai_readings (id, company_id, doc_hash, brief_version, model, status, characters, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    ['stuck-reading', company.id, aiScope.fingerprint(text), 'v3', 'claude-opus-5-5', 'reading', text.length, new Date(Date.now() - 31 * 60 * 1000)]);
  const stuck = await aiScope.getReading(company, 'stuck-reading');
  assert.equal(stuck.status, 'failed');
  assert.match(stuck.error, /interrupted/);
  aiScope.useClient(withParent(standIn(READING)));
  const again = await aiScope.startReading(company, text);
  assert.equal(again.kept, false);
  await again.done;
  assert.equal((await aiScope.getReading(company, again.id)).status, 'done');
});

test('work the scope gives to others is kept only when the step is really in that group', async () => {
  const steps = { packages: [
    { package: 'Trade installation: ceilings', groups: ['ductwork'], unmatched: [], byOthers: [
      { group: 'ductwork', step: 'Fix hangers and supports', party: 'Builder', clause: '4.2 (c)', says: 'The builder fixes the hangers.' },
      { group: 'ductwork', step: 'Build the access ramp', party: 'Builder', clause: '4.2 (d)', says: 'Not a ductwork step.' },
      { group: 'madeUpGroup', step: 'Fix hangers and supports', party: 'Builder', clause: '4.2 (e)', says: 'Not a real group.' },
    ] },
  ] };
  aiScope.useClient(withParent(standIn(READING, {}, steps)));
  const started = await aiScope.startReading(company, `${SCOPE}\nBy others.`);
  await started.done;
  const reading = await aiScope.getReading(company, started.id);
  assert.deepEqual(reading.reading.packages[0].byOthers, [{ group: 'ductwork', step: 'Fix hangers and supports', party: 'Builder', clause: '4.2 (c)', says: 'The builder fixes the hangers.' }]);
  assert.deepEqual(reading.reading.packages[1].byOthers, []);
});

// Owner decisions of 7 October 2026, from his formwork subcontract: the same work at different
// locations is one SWMS for the project, and a jumpform is one SWMS for the whole lot.
const row = (activity, pack, where = '', plant = '', type = 'Site work') => ({ activity, type, package: pack, crew: '', clause: '', quotes: [], where, plant, conditions: '', unknowns: '', matrixColumn: '' });
const FORMWORK = {
  activities: [
    row('Erect and strip suspended slab and beam formwork in the basements', 'Trade installation: basement', 'Basement 2, Basement 1 and Ground'),
    row('Form kerbs, upstands and hobs', 'Trade installation: basement', 'Driveway ramps'),
    row('Erect and strip suspended slab and beam formwork in the Commercial tower', 'Trade installation: commercial tower', 'Level 1 to Level 12'),
    row('Form in situ columns', 'Trade installation: columns', 'Basement and Retail buildings'),
    row('Erect and strip formwork decks on Contractor-supplied high propping', 'Trade installation: towers', 'Level 2 voids'),
    row('Strip formwork and backprop slabs', 'Falsework and propping', 'All buildings', 'Props'),
    row('Install, maintain and remove perimeter safety screens', 'Perimeter safety screens', 'Building perimeter'),
    row('Form and strip rectangular penetrations in slabs', 'Penetrations and core drilling', 'All buildings'),
    row('Move materials with forklifts', 'Materials handling', 'All floors', 'Forklift'),
    row('Cut bars with oxy-acetylene set', 'Hot works', '', 'Oxy-acetylene set'),
    row('Erect, manage and dismantle crane-liftable Climbtrac platform', 'Access equipment', 'Commercial tower feature wall', 'Climbtrac platform, tower crane'),
    row('Use scissor lifts and boom lifts (EWP)', 'Access equipment', '', 'Scissor lifts, boom lifts'),
    row('Design, erect, operate and dismantle internal self-climbing formwork hoists', 'Plant lifting and cranage', 'Both towers', 'Self-climbing formwork hoist'),
    row('Lift formwork materials using the Contractor\'s tower cranes', 'Plant lifting and cranage', 'Site-wide', 'Tower cranes'),
    row('Inspect and certify formwork before each pour', 'Trade installation: basement', '', '', 'Duty'),
  ],
  packages: [
    { package: 'Trade installation: basement', groups: ['formwork', 'deckingStuds'], unmatched: [], byOthers: [] },
    { package: 'Trade installation: commercial tower', groups: ['formwork', 'edgeBracket'], unmatched: [], byOthers: [{ group: 'scaffold', step: 'Erect the scaffold', party: 'Contractor', clause: '', says: 'Scaffold by the Contractor.' }] },
    { package: 'Trade installation: columns', groups: ['formwork'], unmatched: [], byOthers: [] },
    { package: 'Trade installation: towers', groups: ['formwork'], unmatched: [], byOthers: [{ group: 'formwork', step: 'Erect falsework and shores', party: 'Contractor', clause: '', says: 'High propping by the Contractor.' }] },
    { package: 'Falsework and propping', groups: ['formwork'], unmatched: [], byOthers: [] },
    { package: 'Perimeter safety screens', groups: ['edgeProtectionInstall'], unmatched: [], byOthers: [] },
    { package: 'Penetrations and core drilling', groups: ['formwork'], unmatched: [], byOthers: [] },
    { package: 'Materials handling', groups: ['forklift'], unmatched: [], byOthers: [] },
    { package: 'Hot works', groups: ['oxyCutting'], unmatched: [], byOthers: [] },
    { package: 'Access equipment', groups: ['jumpform', 'craneInterface', 'ewp'], unmatched: [], byOthers: [] },
    { package: 'Plant lifting and cranage', groups: ['craneInterface', 'hoistInstall'], unmatched: [], byOthers: [] },
  ],
};
const packageOf = (reading, name) => reading.packages.find((item) => item.package === name);
const rowsOf = (reading, name) => reading.activities.filter((item) => item.package === name).map((item) => item.activity);

test('formwork read by location becomes one formwork SWMS for the project, falsework included', () => {
  const reading = aiScope.settlePackages(FORMWORK);
  const name = 'Formwork and falsework: whole project';
  assert.deepEqual(rowsOf(reading, name), [
    'Erect and strip suspended slab and beam formwork in the basements', 'Form kerbs, upstands and hobs',
    'Erect and strip suspended slab and beam formwork in the Commercial tower', 'Form in situ columns',
    'Erect and strip formwork decks on Contractor-supplied high propping', 'Strip formwork and backprop slabs', 'Inspect and certify formwork before each pour',
  ]);
  // Each activity keeps its location.
  const where = (activity) => reading.activities.find((item) => item.activity === activity).where;
  assert.equal(where('Form kerbs, upstands and hobs'), 'basement: Driveway ramps');
  assert.equal(where('Erect and strip suspended slab and beam formwork in the Commercial tower'), 'commercial tower: Level 1 to Level 12');
  assert.equal(where('Erect and strip suspended slab and beam formwork in the basements'), 'Basement 2, Basement 1 and Ground');
  assert.equal(where('Strip formwork and backprop slabs'), 'All buildings');
  const formwork = packageOf(reading, name);
  for (const id of ['formwork', 'deckingStuds', 'edgeBracket']) assert.ok(formwork.groups.includes(id), id);
  // High propping by others in two voids does not take falsework out where the crew erects it everywhere else.
  assert.deepEqual(formwork.byOthers.map((entry) => entry.step), ['Erect the scaffold']);
  // Different work stays its own SWMS.
  for (const other of ['Perimeter safety screens', 'Penetrations and core drilling', 'Materials handling', 'Hot works']) assert.equal(rowsOf(reading, other).length, 1, other);
  for (const gone of ['Trade installation: basement', 'Trade installation: commercial tower', 'Trade installation: columns', 'Falsework and propping']) assert.equal(packageOf(reading, gone), undefined, gone);
});

test('a jumpform is one SWMS: its platform and hoists come out of access equipment and cranage', () => {
  const reading = aiScope.settlePackages(FORMWORK);
  const name = 'Jumpform: install, climb, maintain and dismantle';
  assert.deepEqual(rowsOf(reading, name), ['Erect, manage and dismantle crane-liftable Climbtrac platform', 'Design, erect, operate and dismantle internal self-climbing formwork hoists']);
  const jumpform = packageOf(reading, name);
  for (const id of ['jumpform', 'craneInterface', 'hoistInstall']) assert.ok(jumpform.groups.includes(id), id);
  // Access equipment keeps the EWP and loses the jumpform and the crane its platform named.
  assert.deepEqual(rowsOf(reading, 'Access equipment'), ['Use scissor lifts and boom lifts (EWP)']);
  assert.deepEqual(packageOf(reading, 'Access equipment').groups, ['ewp']);
  // Cranage keeps the crane for its own lifts but not the hoist.
  assert.deepEqual(packageOf(reading, 'Plant lifting and cranage').groups, ['craneInterface']);
  // A mast climbing work platform or a self-climbing builder's hoist is not a jumpform.
  const other = aiScope.settlePackages({
    activities: [row('Use a mast climbing platform for the facade', 'Access equipment'), row('Install and climb the self-climbing hoist', 'Plant lifting and cranage')],
    packages: [{ package: 'Access equipment', groups: ['mastClimber'], unmatched: [], byOthers: [] }, { package: 'Plant lifting and cranage', groups: ['hoistInstall'], unmatched: [], byOthers: [] }],
  });
  assert.deepEqual(other.activities.map((item) => item.package), ['Access equipment', 'Plant lifting and cranage']);
});

test('areas are not merged when their work differs, or when only the AI\'s general group is shared', () => {
  const reading = aiScope.settlePackages({
    activities: [
      row('Install ductwork', 'Trade installation: level 1'),
      row('Install the main switchboard', 'Trade installation: plant room'),
      row('Install stainless steel security shrouds to exposed pipework', 'Trade installation: cells'),
      row('Install ventilated security cages for external gas regulators', 'Trade installation: LPG'),
    ],
    packages: [
      { package: 'Trade installation: level 1', groups: ['ductwork'], unmatched: [], byOthers: [] },
      { package: 'Trade installation: plant room', groups: ['commissioning'], unmatched: [], byOthers: [] },
      { package: 'Trade installation: cells', groups: ['fixtures'], unmatched: [], byOthers: [] },
      { package: 'Trade installation: LPG', groups: ['fixtures', 'gasLineTest'], unmatched: [], byOthers: [] },
    ],
  });
  assert.deepEqual(reading.activities.map((item) => item.package), ['Trade installation: level 1', 'Trade installation: plant room', 'Trade installation: cells', 'Trade installation: LPG']);
});

test('an area the AI found no job steps for joins the same work when its own words name it', () => {
  const reading = aiScope.settlePackages({
    activities: [
      row('Install pool fencing', 'Trade installation: pool area'),
      row('Install the boundary fence', 'Trade installation: boundary'),
      row('Install fixings and sundry items to complete the fences', 'Trade installation: fences and gates'),
      row('Seal airshafts airtight', 'Trade installation: shafts'),
    ],
    packages: [
      { package: 'Trade installation: pool area', groups: ['fenceBuild'], unmatched: [], byOthers: [] },
      { package: 'Trade installation: boundary', groups: ['fenceBuild'], unmatched: [], byOthers: [] },
      { package: 'Trade installation: fences and gates', groups: [], unmatched: [], byOthers: [] },
      { package: 'Trade installation: shafts', groups: [], unmatched: [], byOthers: [] },
    ],
  });
  assert.deepEqual(reading.activities.map((item) => item.package), ['Trade installation: whole project', 'Trade installation: whole project', 'Trade installation: whole project', 'Trade installation: shafts']);
  assert.deepEqual(reading.activities.map((item) => item.where), ['pool area', 'boundary', 'fences and gates', '']);
});
