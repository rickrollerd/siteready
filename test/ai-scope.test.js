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
  assert.equal(BRIEF_VERSION, 'v3.2');
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
