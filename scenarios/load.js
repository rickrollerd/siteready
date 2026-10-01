// Many people across the country at once. Each virtual user is a different
// site, from a different address, working through every scenario in every
// state: questions, the draft, then the Word file. Every answer is checked
// against the same draft prepared directly, so a busy server cannot hand one
// user another user's statement.
//
//   node scenarios/load.js [users] [seconds] [server address]
//
// With no address, the server is started here with one worker per core and
// limits raised so the test measures capacity, not the rate limit.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { prepareDraft } = require('../draft');
const { STATES } = require('../legislation');

const USERS = Number(process.argv[2]) || 200;
const SECONDS = Number(process.argv[3]) || 30;
let base = process.argv[4] && !process.argv[4].startsWith('--') ? process.argv[4] : '';
// --project <file> loads a project's SWMS set in its own state instead.
const projectAt = process.argv.indexOf('--project');
const project = projectAt > 0 ? JSON.parse(fs.readFileSync(path.resolve(process.argv[projectAt + 1]), 'utf8')) : null;
const scenarios = project ? project.swms : JSON.parse(fs.readFileSync(path.join(__dirname, 'scenarios.json'), 'utf8'));
const states = project ? STATES.filter((state) => state.id === project.state) : STATES;
const jobs = states.flatMap((state) => scenarios.map((scenario) => ({ state, scenario })));

const timings = { questions: [], draft: [], docx: [] };
const failures = [];
const seen = new Set();
let errors = 0;

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function call(route, body, address) {
  const started = performance.now();
  const response = await fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address },
    body: JSON.stringify(body),
  });
  const data = route.endsWith('.docx') ? Buffer.from(await response.arrayBuffer()) : await response.json();
  timings[route.endsWith('.docx') ? 'docx' : route.endsWith('questions') ? 'questions' : 'draft'].push(performance.now() - started);
  return { status: response.status, data };
}

function compare(label, actual, expected) {
  for (const key of ['kind', 'state', 'subcontractor', 'highRisk', 'missing', 'hazards', 'controls', 'method']) {
    if (JSON.stringify(actual[key]) !== JSON.stringify(expected[key])) return `${label}: ${key} differs`;
  }
  return '';
}

async function user(number, until) {
  const address = `10.${(number >> 8) & 255}.${number & 255}.${1 + (number % 250)}`;
  const company = `Test company ${number}`;
  let next = number % jobs.length;
  while (Date.now() < until) {
    const { state, scenario } = jobs[next];
    next = (next + 1) % jobs.length;
    const input = { state: state.id, task: scenario.task, fallRisk: scenario.fallRisk, residential: scenario.residential || 'no', company };
    const name = `${state.id} ${scenario.id}`;
    try {
      const asked = await call('/api/draft/questions', input, address);
      if (asked.status !== 200) throw new Error(`questions answered ${asked.status}`);
      const bare = await call('/api/draft', input, address);
      const full = await call('/api/draft', { ...input, facts: scenario.facts }, address);
      for (const [label, result, body] of [['without facts', bare, input], ['with facts', full, { ...input, facts: scenario.facts }]]) {
        if (result.status !== 200) throw new Error(`draft ${label} answered ${result.status}`);
        const problem = compare(`${name} ${label}`, result.data, prepareDraft(body));
        if (problem) failures.push(problem);
      }
      const word = await call('/api/draft.docx', { ...input, facts: scenario.facts, reviewConfirmed: true, reviewedBy: 'Load test' }, address);
      if (word.status !== 200 || word.data.subarray(0, 2).toString() !== 'PK') throw new Error(`Word file answered ${word.status}`);
      seen.add(name);
    } catch (error) {
      errors += 1;
      if (errors <= 5) console.error(`${name}: ${error.message}${error.cause ? ` (${error.cause.code || error.cause.message})` : ''}`);
    }
  }
}

async function startServer() {
  const port = 3900 + Math.floor(Math.random() * 90);
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), RATE_LIMIT_MAX_REQUESTS: '1000000', RATE_LIMIT_WORD_REQUESTS: '1000000' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve) => server.stdout.on('data', (chunk) => { if (/running/.test(chunk)) resolve(); }));
  base = `http://127.0.0.1:${port}`;
  // Give every worker time to start listening.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return server;
}

(async () => {
  const server = base ? null : await startServer();
  console.log(`${USERS} users for ${SECONDS} seconds against ${base}, ${jobs.length} state and scenario pairs`);
  const started = Date.now();
  const until = started + SECONDS * 1000;
  await Promise.all(Array.from({ length: USERS }, (_, index) => user(index, until)));
  const elapsed = (Date.now() - started) / 1000;
  if (server) server.kill();

  console.log('');
  console.log('| Request | Count | Per second | Median ms | 95% ms | 99% ms | Slowest ms |');
  console.log('|---|---|---|---|---|---|---|');
  for (const [route, values] of Object.entries(timings)) {
    const row = [route, values.length, (values.length / elapsed).toFixed(1), percentile(values, 50), percentile(values, 95), percentile(values, 99), Math.max(0, ...values)]
      .map((value) => (typeof value === 'number' && !Number.isInteger(value) ? Math.round(value) : value));
    console.log(`| ${row.join(' | ')} |`);
  }
  console.log('');
  console.log(`State and scenario pairs completed: ${seen.size} of ${jobs.length}`);
  console.log(`Failed requests: ${errors}`);
  console.log(`Answers that differed from the expected draft: ${failures.length}`);
  failures.slice(0, 10).forEach((item) => console.log(`  ${item}`));
  process.exit(errors || failures.length || seen.size < jobs.length ? 1 : 0);
})();
