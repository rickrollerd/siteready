// Daily caps on AI scope readings (D317).
// Unit-level tests with the in-memory db pattern.
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupAccounts } = require('./helpers');
const db = require('../db');
const aiScope = require('../ai-scope');

const SCOPE = [
  '4.2 Mechanical Works',
  '(a) Supply and install all ductwork.',
].join('\n');

const READING = {
  activities: [
    { activity: 'Install ductwork', type: 'Site work', package: 'Trade installation: ceilings', crew: 'Sheet metal', clause: '4.2 (a)', quotes: ['Supply and install all ductwork.'], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' },
  ],
  byOthers: [],
  conflicts: [],
};

function standIn(answer) {
  return {
    beta: {
      messages: {
        stream(params) {
          const mapping = Boolean(params.output_config.format.schema.properties.packages);
          const body = mapping ? { packages: [{ package: 'Trade installation: ceilings', groups: ['ductwork'], unmatched: [], byOthers: [] }] } : answer;
          return { finalMessage: async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 1000, output_tokens: 500 }, content: [{ type: 'text', text: JSON.stringify(body) }] }) };
        },
      },
    },
  };
}

const company = { id: 'company-cap-1', name: 'Test Cap', abn: '33102417000' };

async function seedCompanyReading(companyId, text, status = 'done') {
  const hash = aiScope.fingerprint(text);
  const id = crypto.randomUUID();
  const now = new Date();
  await db.query('INSERT INTO ai_readings (id, company_id, org_id, doc_hash, brief_version, model, status, characters, created_at, stage, stage_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $9)',
    [id, companyId, '', hash, 'v3.5', 'claude-opus-5-5', status, text.length, now, status === 'reading' ? 'reading' : 'done']);
  return id;
}

async function seedOrgReading(orgId, text, status = 'done') {
  const hash = aiScope.fingerprint(text);
  const id = crypto.randomUUID();
  const now = new Date();
  await db.query('INSERT INTO ai_readings (id, company_id, org_id, project_id, doc_hash, brief_version, model, status, characters, created_at, stage, stage_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $10)',
    [id, '', orgId, 'project-cap-1', hash, 'v3.5', 'claude-opus-5-5', status, text.length, now, status === 'reading' ? 'reading' : 'done']);
  return id;
}

test.before(async () => {
  await setupAccounts();
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  delete process.env.OPENROUTER_API_KEY;
});

test.after(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  aiScope.useClient(null);
});

test('company daily cap defaults to 10 and is configurable', () => {
  delete process.env.AI_COMPANY_DAILY_READINGS;
  assert.equal(aiScope.companyDailyReadings(), 10);
  process.env.AI_COMPANY_DAILY_READINGS = '5';
  assert.equal(aiScope.companyDailyReadings(), 5);
  process.env.AI_COMPANY_DAILY_READINGS = '0';
  assert.equal(aiScope.companyDailyReadings(), 0);
  delete process.env.AI_COMPANY_DAILY_READINGS;
});

test('org daily cap defaults to 30 and is configurable', () => {
  delete process.env.AI_ORG_DAILY_READINGS;
  assert.equal(aiScope.orgDailyReadings(), 30);
  process.env.AI_ORG_DAILY_READINGS = '3';
  assert.equal(aiScope.orgDailyReadings(), 3);
  process.env.AI_ORG_DAILY_READINGS = '0';
  assert.equal(aiScope.orgDailyReadings(), 0);
  delete process.env.AI_ORG_DAILY_READINGS;
});

test('company daily cap blocks the (limit+1)th distinct new reading', async () => {
  process.env.AI_COMPANY_DAILY_READINGS = '2';
  aiScope.useClient(standIn(READING));
  const c = { id: 'company-cap-2', name: 'Two a Day', abn: '33102417001' };

  // First reading starts.
  const first = await aiScope.startReading(c, `${SCOPE}\nfirst`);
  assert.equal(first.kept, false);
  assert.equal(first.status, 'reading');
  await first.done;

  // Second distinct document starts.
  const second = await aiScope.startReading(c, `${SCOPE}\nsecond`);
  assert.equal(second.kept, false);
  assert.equal(second.status, 'reading');
  await second.done;

  // Third distinct document is blocked.
  try {
    await aiScope.startReading(c, `${SCOPE}\nthird`);
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(err.status, 402);
    assert.equal(err.limit, true);
    assert.match(err.message, /You have used today's 2 AI readings for this company. Try again tomorrow./);
  }

  delete process.env.AI_COMPANY_DAILY_READINGS;
});

test('a kept fingerprint still returns kept:true under the company cap', async () => {
  process.env.AI_COMPANY_DAILY_READINGS = '1';
  aiScope.useClient(standIn(READING));
  const c = { id: 'company-cap-3', name: 'One a Day', abn: '33102417002' };

  const first = await aiScope.startReading(c, `${SCOPE}\nkept`);
  assert.equal(first.kept, false);
  await first.done;

  // Same document again: kept, not counted as new.
  const again = await aiScope.startReading(c, `${SCOPE}\nkept`);
  assert.equal(again.kept, true);
  assert.equal(again.status, 'done');

  // A new document is still blocked.
  try {
    await aiScope.startReading(c, `${SCOPE}\nnew`);
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(err.status, 402);
    assert.equal(err.limit, true);
    assert.match(err.message, /You have used today's 1 AI readings for this company. Try again tomorrow./);
  }

  delete process.env.AI_COMPANY_DAILY_READINGS;
});

test('failed readings do not count toward the company daily cap', async () => {
  process.env.AI_COMPANY_DAILY_READINGS = '1';
  aiScope.useClient(standIn(READING));
  const c = { id: 'company-cap-4', name: 'Fail Does Not Count', abn: '33102417003' };

  // Seed a failed reading.
  await seedCompanyReading(c.id, `${SCOPE}\nfail`, 'failed');
  assert.equal(await aiScope.countCompanyReadingsToday(c.id), 0);

  // A new reading is allowed because the failed one does not count.
  const first = await aiScope.startReading(c, `${SCOPE}\nnew`);
  assert.equal(first.kept, false);
  await first.done;

  // The done reading now counts.
  assert.equal(await aiScope.countCompanyReadingsToday(c.id), 1);

  delete process.env.AI_COMPANY_DAILY_READINGS;
});

test('org daily cap blocks the (limit+1)th distinct new reading', async () => {
  process.env.AI_ORG_DAILY_READINGS = '2';
  process.env.PROJECT_FREE_READINGS = '100';
  aiScope.useClient(standIn(READING));
  const org = { id: 'org-cap-1', name: 'Org Cap' };
  const project = { id: 'project-cap-1', name: 'Project Cap' };

  // First reading starts.
  const first = await aiScope.startProjectReading({ org, project }, `${SCOPE}\nfirst-org`);
  assert.equal(first.kept, false);
  assert.equal(first.status, 'reading');
  await first.done;

  // Second distinct document starts.
  const second = await aiScope.startProjectReading({ org, project }, `${SCOPE}\nsecond-org`);
  assert.equal(second.kept, false);
  assert.equal(second.status, 'reading');
  await second.done;

  // Third distinct document is blocked by the org cap.
  try {
    await aiScope.startProjectReading({ org, project }, `${SCOPE}\nthird-org`);
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(err.status, 402);
    assert.equal(err.limit, true);
    assert.match(err.message, /You have used today's 2 AI readings for this account. Try again tomorrow./);
  }

  delete process.env.AI_ORG_DAILY_READINGS;
  delete process.env.PROJECT_FREE_READINGS;
});

test('a kept fingerprint still returns kept:true under the org cap', async () => {
  process.env.AI_ORG_DAILY_READINGS = '1';
  process.env.PROJECT_FREE_READINGS = '100';
  aiScope.useClient(standIn(READING));
  const org = { id: 'org-cap-2', name: 'Org One' };
  const project = { id: 'project-cap-2', name: 'Project One' };

  const first = await aiScope.startProjectReading({ org, project }, `${SCOPE}\nkept-org`);
  assert.equal(first.kept, false);
  await first.done;

  // Same document again: kept, not counted as new.
  const again = await aiScope.startProjectReading({ org, project }, `${SCOPE}\nkept-org`);
  assert.equal(again.kept, true);
  assert.equal(again.status, 'done');

  // A new document is still blocked.
  try {
    await aiScope.startProjectReading({ org, project }, `${SCOPE}\nnew-org`);
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(err.status, 402);
    assert.equal(err.limit, true);
    assert.match(err.message, /You have used today's 1 AI readings for this account. Try again tomorrow./);
  }

  delete process.env.AI_ORG_DAILY_READINGS;
  delete process.env.PROJECT_FREE_READINGS;
});

test('failed readings do not count toward the org daily cap', async () => {
  process.env.AI_ORG_DAILY_READINGS = '1';
  process.env.PROJECT_FREE_READINGS = '100';
  aiScope.useClient(standIn(READING));
  const org = { id: 'org-cap-3', name: 'Org Fail' };

  // Seed a failed reading.
  await seedOrgReading(org.id, `${SCOPE}\nfail-org`, 'failed');
  assert.equal(await aiScope.countOrgReadingsToday(org.id), 0);

  delete process.env.AI_ORG_DAILY_READINGS;
  delete process.env.PROJECT_FREE_READINGS;
});

test('the existing project free-reading limit still works alongside the org cap', async () => {
  process.env.AI_ORG_DAILY_READINGS = '100';
  process.env.PROJECT_FREE_READINGS = '2';
  aiScope.useClient(standIn(READING));
  const org = { id: 'org-cap-4', name: 'Org Free' };
  const project = { id: 'project-cap-4', name: 'Project Free' };

  // Use up the project's free readings.
  for (let i = 0; i < 2; i += 1) {
    const started = await aiScope.startProjectReading({ org, project }, `${SCOPE}\nfree-${i}`);
    assert.equal(started.kept, false);
    await started.done;
  }

  // Next is blocked by project limit, not org cap.
  try {
    await aiScope.startProjectReading({ org, project }, `${SCOPE}\nover`);
    assert.fail('should have thrown');
  } catch (err) {
    assert.equal(err.status, 402);
    assert.equal(err.limit, true);
    assert.match(err.message, /You have used this project's 2 free readings. Contact SiteWrite to add more./);
  }

  delete process.env.AI_ORG_DAILY_READINGS;
  delete process.env.PROJECT_FREE_READINGS;
});
