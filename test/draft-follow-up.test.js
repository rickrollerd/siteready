// A later Prepare, or a later step edit, is not dropped while one draft is already on its way (D374).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPage, settle } = require('./fake-dom');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');

const DRAFT = (task) => ({
  kind: 'draft',
  state: 'Queensland',
  task,
  jobSteps: [],
  controls: [],
  site: [],
  ppe: [],
  references: [],
  sources: { legislation: [], codes: [] },
  highRisk: [],
});

test('a later Prepare is queued and sent once the first draft settles', () => {
  const src = read('app.js');
  assert.match(src, /let prepareAgain = null;/);
  assert.match(src, /prepareAgain = \{ scroll, keep \};/);
  assert.match(src, /if \(!prepareAgain\) return result;/);
});

test('a later Prepare is not dropped while one is already on its way', async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const p = loadPage(['app.js'], async (method, route, body) => {
    if (String(route).endsWith('/api/draft/questions')) {
      return { body: { kind: 'questions', required: [], ppe: [], site: [], steps: { suggested: [], chosen: [], locked: [] } } };
    }
    if (String(route).endsWith('/api/steps')) return { body: { groups: [] } };
    if (String(route).endsWith('/api/draft')) {
      await held;
      return { body: DRAFT(body && body.task) };
    }
    return { body: {} };
  });
  await settle();
  p.document.getElementById('task').value = 'First wording of the task';
  const first = p.run('prepareDraft({ scroll: false })');
  await settle();
  p.document.getElementById('task').value = 'Second wording after the edit';
  const second = p.run('prepareDraft({ scroll: false })');
  await settle();
  const whileHeld = p.calls.filter((call) => String(call.route).endsWith('/api/draft'));
  assert.equal(whileHeld.length, 1, 'the second Prepare waits for the first');
  assert.equal(whileHeld[0].body.task, 'First wording of the task');
  release();
  await first;
  await second;
  await settle();
  await settle();
  const drafts = p.calls.filter((call) => String(call.route).endsWith('/api/draft'));
  assert.equal(drafts.length, 2, 'the later Prepare is sent once the first settles');
  assert.equal(drafts[1].body.task, 'Second wording after the edit');
});
