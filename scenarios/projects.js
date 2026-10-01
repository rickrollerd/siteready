// Stress tests a project's SWMS set: each SWMS in every state, without and with
// its facts, and with the task reworded the ways people write it.
//
//   node scenarios/projects.js [project file]

const path = require('path');
const { prepareDraft } = require('../draft');
const { STATES, highRiskLabel } = require('../legislation');

const project = require(path.resolve(process.argv[2] || path.join(__dirname, 'projects', 'brisbane-tower.json')));

// Other ways the same work is written on site.
const REWORDINGS = [
  ['tower cranes', 'tower crane'],
  ['jumpform', 'jump form'],
  ['jumpform', 'self-climbing formwork'],
  ['post-tensioning', 'post tensioning'],
  ['post-tensioned', 'PT'],
  ['reo', 'reinforcement'],
  ['reinforcement', 'rebar'],
  ['forklift', 'telehandler'],
  ['placing boom', 'concrete placing boom'],
  ['formwork', 'Formwork'],
];

const failures = [];
let runs = 0;
const fail = (where, message) => failures.push(`${where}: ${message}`);

function check(where, state, swms, task) {
  runs += 1;
  const base = { state: state.id, task, fallRisk: swms.fallRisk, residential: 'no' };
  const extra = (state.panelFacts || []).length && /precast/i.test(task) ? { regulatorNotified: 'Regulator notified 15 working days before.' } : {};
  const bare = prepareDraft(base);
  if (bare.kind !== 'stand-down') fail(where, `without facts expected a stand-down, got ${bare.kind}`);
  const done = prepareDraft({ ...base, facts: { ...swms.facts, ...extra } });
  if (done.kind !== 'draft') return fail(where, `with facts expected a draft, got ${done.kind} (${(done.missing || []).join('; ')})`);
  for (const id of swms.expect.highRisk) {
    if (!done.highRisk.includes(highRiskLabel(state, id))) fail(where, `high risk category missing: ${id}`);
  }
  const names = done.jobSteps.map((step) => step.step);
  for (const step of swms.expect.steps) if (!names.includes(step)) fail(where, `job step missing: ${step}`);
  if (names[0] !== 'Before starting' || names[names.length - 1] !== 'Finish and clean up') fail(where, 'opening or closing step missing');
  if (done.jobSteps.some((step) => !step.hazards.length || !step.controls.length)) fail(where, 'a job step has no hazards or no controls');
  return done;
}

for (const state of STATES.filter((item) => item.loaded)) {
  for (const swms of project.swms) {
    check(`${state.id} ${swms.id}`, state, swms, swms.task);
    // Exact missing facts are checked in the project's own state.
    if (state.id === project.state) {
      const bare = prepareDraft({ state: state.id, task: swms.task, fallRisk: swms.fallRisk, residential: 'no' });
      const missing = (bare.missing || []).slice().sort();
      if (JSON.stringify(missing) !== JSON.stringify(swms.expect.missing.slice().sort())) {
        fail(`${state.id} ${swms.id}`, `missing facts were ${missing.join('; ')}, expected ${swms.expect.missing.join('; ')}`);
      }
      for (const [from, to] of REWORDINGS) {
        if (swms.task.includes(from)) check(`${state.id} ${swms.id} [${from} -> ${to}]`, state, swms, swms.task.split(from).join(to));
      }
      check(`${state.id} ${swms.id} [UPPER CASE]`, state, swms, swms.task.toUpperCase());
      check(`${state.id} ${swms.id} [extra spaces]`, state, swms, swms.task.replace(/ /g, '   '));
    }
  }
}

console.log(`${project.title}: ${runs} runs, ${failures.length} failures`);
for (const item of failures) console.log(`  ${item}`);
process.exit(failures.length ? 1 : 0);
