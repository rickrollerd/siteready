// Work SiteReady has no job steps for is stood down at the draft (#185). The questions step says so
// first, in plain words, and does not tick the steps for where the work is done (the rail corridor,
// the road, work above traffic) as if they were the work (goals 2 and 7).
const test = require('node:test');
const assert = require('node:assert/strict');
const { questionsFor, prepareDraft } = require('../draft');
const { answersFor } = require('../presets');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

const ask = (task, extra = {}) => questionsFor({ state: 'qld', fallRisk: 'no', residential: 'no', task, ...extra });

// The draft after the questions are answered as a user picking the first answer would.
function drafted(task, extra = {}) {
  const input = { state: 'qld', fallRisk: 'no', residential: 'no', task, ...extra };
  const facts = {};
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id]) continue;
      facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : (answersFor(item.id, asked.task)[0] || {}).text || `As set out in the site plan: ${item.label}.`;
      added = true;
    }
    if (!added) break;
  }
  return prepareDraft({ ...input, facts });
}

test('a task with no job steps of its own is told at the questions that it will not be drafted', () => {
  const rail = ask('Thermite weld the rail joints');
  assert.equal(rail.kind, 'questions');
  assert.equal(rail.standDown.message, 'SiteReady has no job steps for this work yet, so it will not draft this SWMS. The steps found for where the work is done (Work in the rail corridor) are not the work itself, so they are not ticked. To go on, add the job steps that cover the work itself under Job steps, describe the work in more detail (what is installed, removed or built, and how), or write this SWMS yourself.');
  assert.deepEqual(rail.steps.suggested, ['railCorridor']);
  assert.deepEqual(rail.steps.chosen, [], 'the rail corridor is not ticked as if it were the work');
  assert.deepEqual(rail.steps.around, ['railCorridor']);
  const bridge = ask('Install bridge expansion joints on the overpass');
  assert.match(bridge.standDown.message, /^SiteReady has no job steps for this work yet, so it will not draft this SWMS\. The steps found for where the work is done \(Traffic management; Work above traffic or a rail line\) are not the work itself, so they are not ticked\. To go on/);
  assert.deepEqual(bridge.steps.chosen, []);
  assert.deepEqual(bridge.steps.around, ['road', 'workAbove']);
  // Which tasks stand down is unchanged: both still do at the draft.
  for (const task of ['Thermite weld the rail joints', 'Install bridge expansion joints on the overpass']) {
    const draft = drafted(task);
    assert.equal(draft.kind, 'stand-down', task);
    assert.match(draft.missing[0], /does not have job steps for the main work in this task/);
  }
});

test('work with no job steps at all is told too, and a task that drafts is not', () => {
  const unknown = ask('Recalibrate the tidal gauge');
  assert.match(unknown.standDown.message, /^SiteReady has no job steps for this work yet, so it will not draft this SWMS\. To go on/);
  assert.equal(drafted('Recalibrate the tidal gauge').kind, 'stand-down');
  for (const task of ['Install cable trays in the ceiling from a scissor lift', 'Replace a 3m length of timber fence.', 'Install a gas hot water system']) {
    const asked = ask(task);
    assert.equal(asked.standDown, undefined, task);
    assert.equal(asked.steps.around, undefined, task);
    assert.ok(asked.steps.chosen.length, task);
    assert.equal(drafted(task).kind, 'draft', task);
  }
});

test('plant and access steps stay ticked, since running them can be the work; the notice names them', () => {
  // The acoustic baffles have no job steps, so this stands down at the draft; the mobile scaffold stays ticked.
  for (const [task, kind, name] of [['Install the acoustic baffles from a mobile scaffold', 'mobileScaffold', 'Use mobile scaffolds']]) {
    const asked = ask(task);
    assert.deepEqual(asked.steps.chosen, [kind], task);
    assert.deepEqual(asked.steps.around, [], task);
    assert.match(asked.standDown.message, new RegExp(`The steps ticked \\(${name}\\) cover only the access, lifting or other work around it\\.`), task);
    assert.equal(drafted(task).kind, 'stand-down', task);
  }
});

test('the user\'s own picks stay as made; a step for the work itself lifts the notice; none ticked says so', () => {
  const only = ask('Install bridge expansion joints on the overpass', { kinds: ['road', 'workAbove'] });
  assert.deepEqual(only.steps.chosen, ['road', 'workAbove'], 'the user ticked them, so they stay ticked');
  assert.deepEqual(only.steps.around, []);
  assert.match(only.standDown.message, /^SiteReady has no job steps for this work yet, so it will not draft this SWMS\. The steps ticked \(Traffic management; Work above traffic or a rail line\) cover only the access, lifting or other work around it\./);
  const withWork = ask('Install bridge expansion joints on the overpass', { kinds: ['road', 'workAbove', 'hotWork'] });
  assert.equal(withWork.standDown, undefined);
  assert.equal(drafted('Install bridge expansion joints on the overpass', { kinds: ['road', 'workAbove', 'hotWork'] }).kind, 'draft');
  const none = ask('Install cable trays in the ceiling from a scissor lift', { kinds: [] });
  assert.equal(none.standDown.message, 'No job steps are ticked, so SiteReady will not draft this SWMS. Tick or add the job steps for the work under Job steps.');
  assert.equal(drafted('Install cable trays in the ceiling from a scissor lift', { kinds: [] }).kind, 'stand-down');
});

test('the page shows the notice above the job steps, leaves the steps around the work unticked, and ticks them again with a step for the work', async () => {
  const QUESTIONS = ask('Install bridge expansion joints on the overpass');
  const bodies = [];
  const page = loadPage(['app.js'], (method, route, body) => {
    if (route.endsWith('/api/draft/questions')) {
      bodies.push(body);
      return { body: Array.isArray(body.kinds) ? ask('Install bridge expansion joints on the overpass', { kinds: body.kinds }) : QUESTIONS };
    }
    if (route.endsWith('/api/steps')) return { body: { groups: [{ trade: 'Any trade', kinds: [{ id: 'road', label: 'Traffic management', steps: [] }, { id: 'workAbove', label: 'Work above traffic or a rail line', steps: [] }, { id: 'hotWork', label: 'Hot work', steps: [] }] }] } };
    return { body: {} };
  });
  await settle();
  page.document.getElementById('task').value = 'Install bridge expansion joints on the overpass';
  await page.run('loadQuestions()');
  await settle();
  const notice = page.document.getElementById('steps-notice');
  assert.equal(notice.textContent, QUESTIONS.standDown.message);
  assert.equal(notice.classList.contains('hidden'), false);
  const list = page.document.getElementById('steps-block').innerHTML;
  assert.doesNotMatch(list, /checked/, 'nothing is ticked as if it were the work');
  assert.equal((list.match(/For where the work is done, not the work itself\./g) || []).length, 2);
  assert.doesNotMatch(list, /Make sure traffic is managed/, 'not warned as if the user took the step off');
  // Adding a step for the work brings the steps around it back, ticked.
  const add = page.document.getElementById('step-add');
  add.value = 'hotWork';
  add.dispatchEvent(new FakeEvent('change'));
  await settle();
  assert.deepEqual(bodies[bodies.length - 1].kinds, ['road', 'workAbove', 'hotWork']);
  assert.equal(page.document.getElementById('steps-notice').classList.contains('hidden'), true);
});

// Typed tasks that stood down or were misread, though the library has job steps for the work.
test('typed tasks the library has job steps for are drafted with the steps for the work', () => {
  const middle = (draft) => draft.jobSteps.map((step) => step.step).filter((name) => !['Before starting', 'Finish and clean up'].includes(name));
  for (const [task, steps] of [
    // The hoist driver's own SWMS, and erecting a mobile scaffold ("scaff"), are the work itself.
    ['Builders\' hoist operation', ['Operate the hoist']],
    ['run the builders hoist', ['Operate the hoist']],
    ['build the mobile scaff in the foyer', ['Use mobile scaffolds']],
    ['Put up two mobile scaffolds', ['Use mobile scaffolds']],
    // The verb after the loading platform ("instal" is spelt "install").
    ['loading platform instal', ['Install loading platforms']],
    // Grinding off old lines is removing line marking, as the kind reads it.
    ['grind off old lines', ['Remove old line marking']],
    // Planting trees with a vehicle loading crane is not tree removal, nor a lift to a podium.
    ['plant advanced trees with a HIAB', ['Unload with the truck loading crane (hiab)', 'Plant']],
    // Removing units is removal, not installation.
    ['remove aircon units', ['Isolate and make safe the old services', 'Remove the old services']],
    // Resealing windows is sealing glazing, from the building maintenance unit.
    ['reseal the windows from the BMU', ['Work from a swing stage', 'Seal glazing']],
    ['install downpipes and rainwater heads', ['Install downpipes']],
  ]) {
    const asked = ask(task);
    assert.equal(asked.standDown, undefined, task);
    const draft = drafted(task);
    assert.equal(draft.kind, 'draft', task);
    assert.deepEqual(middle(draft), steps, task);
  }
  // Riding the hoist, or doing other work from a mobile scaffold, still is not the work.
  assert.equal(drafted('Build the wall from the mobile scaffold').kind, 'stand-down');
  assert.equal(drafted('Install the acoustic baffles from a mobile scaffold').kind, 'stand-down');
  // A tree removed with a crane is still tree removal; soil lifted to a level by crane is still lifted.
  assert.ok(middle(drafted('Remove the dead tree with a crane')).includes('Remove trees'));
  assert.ok(middle(drafted('Lift the soil and plants to level 5 with the tower crane and plant the planters')).includes('Get soil and plants to the podium'));
  // Old water lines under a road are not line marking.
  assert.ok(!(ask('Remove the old water lines under the road').steps.suggested || []).includes('lineMarking'));
  // Resealing pavers is still pressure cleaning and sealing.
  assert.ok(middle(drafted('Reseal the driveway')).includes('Apply sealers to concrete, pavers or timber'));
});
