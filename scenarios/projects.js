// Stress tests a project's SWMS set: each SWMS in every state, without and with
// its facts, and with the task reworded the ways people write it.
//
//   node scenarios/projects.js [project file]

const path = require('path');
const { prepareDraft } = require('../draft');
const { STATES, highRiskLabel } = require('../legislation');

const files = process.argv[2] ? [process.argv[2]] : ['brisbane-tower.json', 'brisbane-tower-electrical.json', 'brisbane-tower-plumbing.json', 'brisbane-tower-mechanical.json', 'brisbane-tower-ict.json', 'brisbane-tower-facade.json'].map((name) => path.join(__dirname, 'projects', name));
let exitCode = 0;
for (const file of files) exitCode = Math.max(exitCode, runProject(require(path.resolve(file))));
process.exit(exitCode);

function runProject(project) {
const failures = [];
let runs = 0;
const fail = (where, message) => failures.push(`${where}: ${message}`);


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
  ['refrigerant pipework', 'refrigerant lines'],
  ['air handling units', 'AHUs'],
  ['fan coil units', 'FCUs'],
  ['CCTV cameras', 'security cameras'],
  ['optical fibre', 'fibre optic'],
  ['unitised curtain wall panels', 'facade panels'],
  ['swing stages', 'suspended scaffolds'],
];


function check(where, state, swms, task) {
  runs += 1;
  const base = { state: state.id, task, fallRisk: swms.fallRisk, residential: 'no' };
  const extra = (state.panelFacts || []).length && /precast/i.test(task) ? { regulatorNotified: 'Regulator notified 15 working days before.' } : {};
  const bare = prepareDraft(base);
  if (swms.expect.missing.length && bare.kind !== 'stand-down') fail(where, `without facts expected a stand-down, got ${bare.kind}`);
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

// Every rule taken from a regulation or code must appear, with its source, in the
// SWMS it belongs to. A rule missing from a draft fails here.
for (const rule of project.rules || []) {
  for (const id of rule.swms) {
    const swms = project.swms.find((item) => item.id === id);
    runs += 1;
    const done = prepareDraft({ state: project.state, task: swms.task, fallRisk: swms.fallRisk, residential: 'no', facts: swms.facts });
    const text = JSON.stringify(done.jobSteps || []);
    const line = (done.jobSteps || []).flatMap((step) => step.controls).find((item) => item.includes(rule.phrase));
    if (!text.includes(rule.phrase)) fail(`${project.state} ${id}`, `rule missing: ${rule.phrase} (${rule.source})`);
    else if (!line || !rule.source.split(/,|;/)[0].trim().split(' s ')[0].split(' ').every((word) => line.includes(word))) fail(`${project.state} ${id}`, `rule not cited: ${rule.phrase} (${rule.source})`);
  }
}

console.log(`${project.title}: ${runs} runs, ${failures.length} failures`);
for (const item of failures) console.log(`  ${item}`);
return failures.length ? 1 : 0;
}
