// Goals 1, 2 and 7: answers that bring in another question. The page asks for the questions again
// as the answers change (the browser run is in follow-up-page.test.js); here, each such answer
// brings its question from the questions route, a stood down draft names only questions that route
// asks, and the page asks again on each answer and after a stood down draft.
const test = require('node:test');
const assert = require('node:assert/strict');
const { questionsFor, prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { answersFor, TRADES } = require('../presets');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

const ids = (input) => questionsFor(draftBody(input)).required.map((item) => item.id);
const INTUMESCENT = { state: 'qld', task: 'Intumescent fire spray to the steel beams', fallRisk: 'yes', crane: 'company', kinds: ['paintSpray'] };

// Every answer on the questions page that brings in another question.
test('each answer that brings in a question brings it from the questions route', () => {
  // The fall control names a harness (a standard answer such as Boom lifts or Travel restraint).
  const boom = answersFor('fallControl', INTUMESCENT.task).find((answer) => answer.label === 'Boom lifts').text;
  assert.ok(!ids({ ...INTUMESCENT, facts: { fallAccess: 'ewp' }, ppe: ['hardHat'] }).includes('harnessSystem'));
  assert.ok(ids({ ...INTUMESCENT, facts: { fallAccess: 'ewp', fallControl: boom }, ppe: ['hardHat'] }).includes('harnessSystem'));
  for (const words of ['travel restraint', 'fall arrest', 'a static line', 'lifelines', 'restraint lanyards']) {
    assert.ok(ids({ ...INTUMESCENT, facts: { fallControl: `Workers use ${words}.` }, ppe: ['hardHat'] }).includes('harnessSystem'), words);
  }
  // A harness or life jacket ticked in the PPE.
  assert.ok(ids({ ...INTUMESCENT, ppe: ['hardHat', 'harness'] }).includes('harnessSystem'));
  const jetty = { state: 'qld', task: 'Paint the handrails on the jetty over the river.', fallRisk: 'no' };
  assert.ok(!ids({ ...jetty, ppe: ['hardHat'] }).includes('lifeJacketDetails'));
  assert.ok(ids({ ...jetty, ppe: ['hardHat', 'lifeJacket'] }).includes('lifeJacketDetails'));
  // The transformer's oil is listed with the pole question and shown by the page once the answer is Yes.
  const pole = questionsFor(draftBody({ state: 'qld', task: 'Remove temporary 11kV poles and transformers.', fallRisk: 'no', trade: 'electrical' }));
  assert.deepEqual(pole.required.find((item) => item.id === 'transformerOil').showIf, { poleTransformer: 'yes' });
  // A fall control that names an EWP of no stated type suggests a harness, which the page then ticks.
  const suggested = questionsFor(draftBody({ ...INTUMESCENT, facts: { fallControl: 'Work is done from an EWP with guardrails.' } }));
  assert.ok(suggested.ppe.some((group) => group.items.some((item) => item.id === 'harness' && item.ticked)));
  // Start details (on Continue): the crane run by the subcontractor, and the job steps picked.
  assert.ok(ids({ state: 'qld', task: 'Lift the steel beams into place with the mobile crane.', fallRisk: 'no', crane: 'own' }).includes('craneChart'));
  // Work with no job steps of its own asks no Working at height until a step is added.
  assert.ok(!ids({ state: 'qld', task: 'Install the bridge expansion joints', fallRisk: 'yes', crane: 'company' }).includes('fallAccess'));
  assert.ok(ids(INTUMESCENT).includes('fallAccess'));
});

// The page relies on this: what the draft stands down for, the questions route asks, for the same
// answers. Checked for the task found in browser testing and the pick list tasks with a fall.
test('a stood down draft names only questions the questions route asks for the same answers', () => {
  const firstAnswer = (item, task) => (item.choices ? item.default || item.choices[0].value : (answersFor(item.id, task)[0] || {}).text || `As on the site plan: ${item.label}.`);
  const inputs = [INTUMESCENT, ...TRADES.flatMap((trade) => trade.tasks).filter((item) => item.fallRisk === 'yes').map((item) => ({ state: 'qld', task: item.task, fallRisk: 'yes', crane: item.crane }))];
  let followed = 0;
  for (const input of inputs) {
    const first = questionsFor(draftBody(input));
    const ppe = first.ppe.flatMap((group) => group.items.filter((item) => item.ticked).map((item) => item.id));
    const facts = Object.fromEntries(first.required.filter((item) => !item.showIf).map((item) => [item.id, firstAnswer(item, first.task)]));
    const draft = prepareDraft(draftBody({ ...input, facts, ppe }));
    if (draft.kind !== 'stand-down') continue;
    const asked = questionsFor(draftBody({ ...input, facts, ppe })).required.map((item) => item.label);
    const facts2 = draft.missing.filter((line) => !/^Job steps for this work/.test(line)).map((line) => line.replace(/ \(the text given does not state it\)$/, ''));
    for (const label of facts2) assert.ok(asked.includes(label), `${input.task.slice(0, 60)}: "${label}" is not asked`);
    if (facts2.includes('Harness and anchors') && !first.required.some((item) => item.id === 'harnessSystem')) followed += 1;
  }
  assert.ok(followed >= 3, `pick list tasks whose first answers bring in Harness and anchors: ${followed}`);
});

// The page script in a small stand-in for the browser: it asks again when an answer changes, while
// typing pauses, and after a stood down draft.
function page(draft) {
  const asks = [];
  const p = loadPage(['app.js'], (method, route, body) => {
    if (route.endsWith('/api/draft/questions')) {
      asks.push(body);
      return { body: { kind: 'questions', task: body.task, required: [{ id: 'fallControl', label: 'Fall control', prompt: 'How a fall is prevented.' }], ppe: [], site: [], steps: { suggested: [], chosen: [], locked: [] } } };
    }
    if (route.endsWith('/api/draft')) return { body: draft };
    if (route.endsWith('/api/steps')) return { body: { groups: [] } };
    return { body: {} };
  });
  return { p, asks };
}
const factEvent = (type) => {
  const event = new FakeEvent(type, { bubbles: true });
  event.target = { dataset: { fact: 'fallControl' }, id: 'fact-fallControl', matches: () => false, closest: () => null };
  return event;
};

test('the page asks for the questions again when an answer changes or the typing pauses', async () => {
  const { p, asks } = page({ kind: 'draft' });
  await settle();
  p.document.getElementById('task').value = 'Intumescent fire spray to the steel beams';
  await p.run('loadQuestions()');
  await settle();
  assert.equal(asks.length, 1);
  p.document.getElementById('required-block').dispatchEvent(factEvent('change'));
  await settle();
  assert.equal(asks.length, 2, 'a changed answer asks again');
  p.document.getElementById('required-block').dispatchEvent(factEvent('input'));
  await settle();
  assert.equal(asks.length, 3, 'typing asks again once it pauses');
  assert.equal(asks[2].task, 'Intumescent fire spray to the steel beams');
});

test('a stood down draft asks for the questions again, so each missing fact is on the page', async () => {
  const { p, asks } = page({ kind: 'stand-down', state: 'Queensland', task: 'Intumescent fire spray to the steel beams', missing: ['Harness and anchors'], statement: 'This task is stood down. It does not start.', method: [], hazards: [], controls: [], site: [] });
  await settle();
  p.document.getElementById('task').value = 'Intumescent fire spray to the steel beams';
  await p.run('loadQuestions()');
  await settle();
  const before = asks.length;
  await p.run('prepareDraft({ scroll: false })');
  await settle();
  assert.equal(asks.length, before + 1);
});
