// SiteReady's own drafts pass SiteReady's own builder check (owner approved, 5 October 2026):
// 90 or more and no hard fails, with controls in hierarchy order, a responsible position for
// each step, and the permits that digging and work near electric lines need.
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { checkSwms, fromDraft, isVague } = require('../builder-check');
const { controlLevel, inHierarchyOrder } = require('../control-level');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { ACTIVITIES } = require('../activities');
const { localControl } = require('../citations');
const { draftToDocx } = require('../docx-draft');
const { HIERARCHY } = require('../legislation');
const scenarios = require('../scenarios/scenarios.json');

// Filled in as a user would before sending the SWMS to the builder.
const SITE = {
  workplace: '12 Smith Street, Paddington QLD 4064', principalContractor: 'ABC Builders Pty Ltd', complianceResponsible: 'Sam Lee, supervisor',
  date: '5 October 2026', reviewDate: '5 November 2026',
  site: { liveServices: 'Overhead power on the street, 6 m from the work.', publicInterface: 'The footpath stays open behind a hoarding.', otherTrades: 'No other trades work under ours.', ground: 'Level, firm ground.', access: 'Side gate on the east boundary; deliveries by the driveway.' },
};
const STATES = ['qld', 'nsw', 'vic', 'wa', 'sa', 'tas', 'act', 'nt'];
// Other trades, typed as a user would type them.
const TYPED = [
  { task: 'Replace an electric hot water system in the laundry of a house.' },
  { task: 'Tile a bathroom floor and walls in a house.' },
  { task: 'Build a timber deck at the back of a house, with post holes dug by hand.' },
  { task: 'Install a pool fence around an inground pool.' },
  { task: 'Dig a trench 600 mm deep across the front yard to lay a new stormwater pipe.' },
  { task: 'Install a split system air conditioner in a house.' },
  { task: 'Plasterboard walls and ceilings in a new office fit-out.' },
  { task: 'Replace a sewer line under a driveway, in a trench 1.8 m deep.', facts: { trenchSupport: 'Trenches 1.5 m deep or more are shored with a trench shield rated for 2.4 m, as designed by the supplier\'s engineer.' } },
];

function drafted(state, item) {
  const draft = prepareDraft(draftBody({ state, fallRisk: 'no', ...item, ...SITE }));
  assert.equal(draft.kind, 'draft', `${state}: ${item.task}`);
  return draft;
}
const checked = (state, draft) => checkSwms(fromDraft(draft, { state, swms: { signatures: [{ name: 'Jo Smith' }] } }), { state });
const points = (result, rule) => result.findings.find((item) => item.rule === rule).points;
function scenario(index) {
  const { task, fallRisk, facts, residential, crane } = scenarios[index];
  return { task, fallRisk, facts, residential, crane };
}

test('SiteReady drafts across trades and states score 90 or more with no hard fails', () => {
  const samples = [
    ...STATES.flatMap((state) => scenarios.map((item, index) => [state, scenario(index)])),
    ...TYPED.map((item) => ['qld', item]),
  ];
  for (const [state, item] of samples) {
    const result = checked(state, drafted(state, item));
    const label = `${state}: ${item.task.slice(0, 70)}`;
    assert.deepEqual(result.hardFails, [], label);
    assert.ok(result.score >= 90, `${label} scores ${result.score}`);
    for (const rule of ['W10', 'W11', 'W12']) assert.equal(points(result, rule), 5, `${label} ${rule}`);
  }
});

test('no library control leaves the decision to the worker, in any state', () => {
  for (const activity of ACTIVITIES) {
    for (const step of activity.steps) {
      for (const control of step.controls) {
        if (!control || (typeof control !== 'string' && typeof control.text !== 'string')) continue;
        const text = typeof control === 'string' ? control : control.text;
        for (const state of STATES) {
          const line = localControl(text, typeof control === 'string' ? '' : control.source || '', state);
          assert.ok(!isVague(line), `${state} ${activity.when} / ${step.step}: ${line}`);
        }
      }
    }
  }
});

test('each step lists its controls in hierarchy order, keeping the written order within a level', () => {
  const rank = (line) => HIERARCHY.indexOf(controlLevel(line));
  for (const index of scenarios.keys()) {
    for (const step of drafted('qld', scenario(index)).jobSteps) {
      const ranks = step.controls.map(rank);
      assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), step.step);
    }
  }
  assert.deepEqual(inHierarchyOrder(['Wear gloves.', 'Read the plan.', 'Fit guardrails.', 'Check the plan.', 'Eliminate the task.']),
    ['Eliminate the task.', 'Fit guardrails.', 'Read the plan.', 'Check the plan.', 'Wear gloves.']);
});

test('digging needs an excavation permit after the services are located; work near electric lines needs a permit to work and the network operator\'s written permission', () => {
  const trench = drafted('qld', scenario(1));
  const locate = trench.jobSteps.find((step) => step.step === 'Locate underground services');
  assert.ok(locate.controls.some((line) => /^No digging starts until an excavation permit is issued/.test(line) && /Before You Dig Australia plans are on site and the underground services .* are located and marked/.test(line)));
  const deck = drafted('qld', TYPED[2]);
  assert.ok(deck.jobSteps.find((step) => step.step === 'Dig post holes').controls.some((line) => /excavation permit/.test(line)));
  const carport = drafted('qld', scenario(6));
  const plan = carport.jobSteps.find((step) => step.step === 'Plan the work near overhead power lines');
  assert.ok(plan.controls.some((line) => /a permit to work near the lines is issued/.test(line) && /network operator's written permission or approval/.test(line)));
  // Work with no digging and no lines gets neither.
  const paint = drafted('qld', scenario(7)).jobSteps.flatMap((step) => step.controls).join('\n');
  assert.doesNotMatch(paint, /excavation permit|permit to work near the lines/);
});

test('each step names a responsible position, printed in the Who column', async () => {
  const trench = drafted('qld', scenario(1));
  const who = Object.fromEntries(trench.jobSteps.map((step) => [step.step, step.responsible]));
  assert.equal(who['Before starting'], 'Supervisor');
  assert.equal(who['Locate underground services'], 'Supervisor');
  assert.equal(who.Excavate, 'Plant operator');
  assert.equal(who['Connect to the live sewer'], 'Licensed plumber');
  assert.ok(trench.jobSteps.every((step) => step.responsible));
  assert.equal(drafted('qld', scenario(8)).jobSteps.find((step) => step.step === 'Erect the scaffold').responsible, 'Licensed scaffolder');
  const xml = await (await JSZip.loadAsync(await draftToDocx(trench, {}))).file('word/document.xml').async('string');
  assert.match(xml, />Who</);
  assert.match(xml, />Plant operator</);
  assert.match(xml, />Licensed plumber</);
});
