// Runs every scenario in every state and territory and compares the result
// with what the scenario expects.
//
//   node scenarios/run.js           print the results, and fail if any run fails
//   node scenarios/run.js --write   also write scenarios/results.md

const fs = require('fs');
const path = require('path');
const { prepareDraft } = require('../draft');
const { STATES, highRiskLabel } = require('../legislation');

const scenarios = JSON.parse(fs.readFileSync(path.join(__dirname, 'scenarios.json'), 'utf8'));

function difference(expected, actual) {
  return {
    missing: expected.filter((item) => !actual.includes(item)),
    extra: actual.filter((item) => !expected.includes(item)),
  };
}

function describe(label, diff) {
  const parts = [];
  if (diff.missing.length) parts.push(`${label} not found: ${diff.missing.join('; ')}`);
  if (diff.extra.length) parts.push(`${label} not expected: ${diff.extra.join('; ')}`);
  return parts;
}

function runLoaded(state, scenario) {
  const base = { state: state.id, task: scenario.task, fallRisk: scenario.fallRisk };
  const problems = [];

  // Without the facts, the task is stood down and names what is missing.
  const bare = prepareDraft(base);
  if (scenario.expect.missing.length) {
    if (bare.kind !== 'stand-down') problems.push(`Without facts: expected a stand-down, got ${bare.kind}`);
    else {
      // Some states ask for more, such as Western Australia's regulator notice for tilt-up work.
      const expected = [...scenario.expect.missing, ...((scenario.expect.missingByState || {})[state.id] || [])];
      problems.push(...describe('Without facts, missing fact', difference(expected, bare.missing)));
    }
  }

  // With the facts, a draft is prepared with the expected categories and hazards.
  const full = prepareDraft({ ...base, facts: scenario.facts });
  if (full.kind !== 'draft') {
    problems.push(`With facts: expected a draft, got ${full.kind}${full.missing ? ` (missing: ${full.missing.join('; ')})` : ''}`);
  } else {
    const expectedRisk = scenario.expect.highRisk.map((id) => highRiskLabel(state, id));
    problems.push(...describe('High risk category', difference(expectedRisk, full.highRisk)));
    const hazards = full.hazards.map((row) => row.hazard);
    problems.push(...describe('Hazard', { missing: difference(scenario.expect.hazards, hazards).missing, extra: [] }));
    if (!full.controls.length) problems.push('With facts: no controls');
  }
  return problems;
}

function runRefused(state, scenario) {
  const result = prepareDraft({ state: state.id, task: scenario.task, fallRisk: scenario.fallRisk, facts: scenario.facts });
  return result.kind === 'refused' ? [] : [`Expected refused (legislation not loaded), got ${result.kind}`];
}

const rows = [];
for (const state of STATES) {
  for (const scenario of scenarios) {
    const problems = state.loaded ? runLoaded(state, scenario) : runRefused(state, scenario);
    rows.push({ state, scenario, problems });
  }
}

const header = ['Scenario', ...STATES.map((state) => state.id.toUpperCase())];
const table = [
  `| ${header.join(' | ')} |`,
  `|${header.map(() => '---').join('|')}|`,
  ...scenarios.map((scenario) => {
    const cells = STATES.map((state) => {
      const row = rows.find((item) => item.state === state && item.scenario === scenario);
      if (!state.loaded) return row.problems.length ? 'FAIL' : 'Not loaded';
      return row.problems.length ? 'FAIL' : 'Pass';
    });
    return `| ${scenario.title} | ${cells.join(' | ')} |`;
  }),
];

const failures = rows.filter((row) => row.problems.length);
const details = failures.map((row) => `### ${row.scenario.title} (${row.state.name})\n\n${row.problems.map((line) => `- ${line}`).join('\n')}`);
const passed = rows.filter((row) => row.state.loaded && !row.problems.length).length;
const loadedRuns = rows.filter((row) => row.state.loaded).length;
const report = `# Scenario results\n\n${passed} of ${loadedRuns} runs in a loaded state passed. States without loaded legislation should refuse.\n\n${table.join('\n')}\n\n${details.length ? `## Failures\n\n${details.join('\n\n')}\n` : ''}`;

if (process.argv.includes('--write')) fs.writeFileSync(path.join(__dirname, 'results.md'), report);
console.log(report);
process.exitCode = failures.length ? 1 : 0;
