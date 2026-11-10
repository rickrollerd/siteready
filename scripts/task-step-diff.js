// Before/after check for engine changes that must not change which steps a task gets (D316, D329).
// Builds the task-line corpus from the repo (task strings in the tests, the scenarios, the project
// fixtures' SWMS tasks, the tasks read from the real scope fixtures, and every work-like line of those
// scopes, typed with no trade and with the scope's own trades), then records for each line the kinds of
// work found, the job steps and a digest of the whole draft.
//   node scripts/task-step-diff.js record out.jsonl        (run on each side of the change)
//   node scripts/task-step-diff.js compare before.jsonl after.jsonl
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');

function corpus() {
  const { tasksFromScope } = require(path.join(ROOT, 'scope'));
  const lines = [];
  const seen = new Set();
  const add = (source, text, trade = '') => {
    for (const line of String(text).split('\n').map((l) => l.trim()).filter(Boolean)) {
      const key = `${trade}\u0000${line}`;
      if (!seen.has(key)) { seen.add(key); lines.push({ source, trade, task: line }); }
    }
  };
  const unquote = (s) => s.slice(1, -1).replace(/\\n/g, '\n').replace(/\\(['"\\])/g, '$1');
  for (const file of fs.readdirSync(path.join(ROOT, 'test')).filter((f) => f.endsWith('.js')).sort()) {
    const source = fs.readFileSync(path.join(ROOT, 'test', file), 'utf8');
    for (const match of source.matchAll(/\btask: ('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g)) add('tests', unquote(match[1]));
  }
  for (const scenario of require(path.join(ROOT, 'scenarios', 'scenarios.json'))) add('scenarios', scenario.task);
  for (const file of fs.readdirSync(path.join(ROOT, 'scenarios', 'projects')).filter((f) => f.endsWith('.json')).sort()) {
    for (const swms of require(path.join(ROOT, 'scenarios', 'projects', file)).swms || []) if (swms.task) add('projects', swms.task);
  }
  const scopes = fs.readdirSync(path.join(ROOT, 'scenarios', 'scopes')).filter((f) => f.endsWith('.txt')).sort().map((file) => fs.readFileSync(path.join(ROOT, 'scenarios', 'scopes', file), 'utf8'));
  const read = scopes.map((text) => tasksFromScope(text));
  for (const result of read) for (const task of result.tasks) add('scopes', task.task, task.id);
  scopes.forEach((text, n) => {
    const trades = (read[n].trades || []).map((t) => (typeof t === 'string' ? t : t.id)).filter(Boolean).join(',');
    for (const raw of text.replace(/\r/g, '').split('\n')) {
      const line = raw.trim();
      if (line.length < 20 || line.length > 400 || !/[a-z]{3,} [a-z]{3,}/.test(line)) continue;
      add('scopeLines', line);
      if (trades) add('scopeLinesTraded', line, trades);
    }
  });
  return lines;
}

function record(file) {
  const { prepareDraft, foundKinds } = require(path.join(ROOT, 'draft'));
  const { ready, ANSWERED } = require(path.join(ROOT, 'test', 'helpers'));
  const lines = corpus();
  const fd = fs.openSync(file, 'w');
  let errors = 0;
  lines.forEach((line, i) => {
    const input = ready({ ...ANSWERED, state: 'qld', task: line.task, fallRisk: 'no', residential: 'no', date: '5 October 2026', ...(line.trade ? { trade: line.trade } : {}) });
    let kinds; let steps; let digest;
    try {
      kinds = (foundKinds(input) || []).slice().sort();
      const draft = prepareDraft(input);
      steps = (draft.jobSteps || []).map((step) => step.step);
      digest = crypto.createHash('sha1').update(JSON.stringify(draft)).digest('hex').slice(0, 16);
    } catch (error) { errors += 1; kinds = [`ERROR ${error.message}`]; steps = []; digest = ''; }
    fs.writeSync(fd, `${JSON.stringify({ i, source: line.source, trade: line.trade, task: line.task, kinds, steps, digest })}\n`);
    if (i % 1000 === 0) process.stderr.write(`${i} of ${lines.length}\n`);
  });
  fs.closeSync(fd);
  console.log({ runs: lines.length, typed: lines.filter((l) => !l.trade).length, withTrade: lines.filter((l) => l.trade).length, errors });
}

function compare(before, after) {
  const read = (file) => fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const a = read(before); const b = read(after);
  if (a.length !== b.length) throw new Error(`different run counts: ${a.length} and ${b.length}`);
  const changed = { kinds: 0, steps: 0, draft: 0 }; const examples = [];
  a.forEach((x, i) => {
    const y = b[i];
    if (x.task !== y.task || x.trade !== y.trade) throw new Error(`the corpus differs at run ${i}`);
    const diff = { kinds: JSON.stringify(x.kinds) !== JSON.stringify(y.kinds), steps: JSON.stringify(x.steps) !== JSON.stringify(y.steps), draft: x.digest !== y.digest };
    for (const key of Object.keys(diff)) changed[key] += diff[key];
    if ((diff.kinds || diff.steps || diff.draft) && examples.length < 20) examples.push({ i, trade: x.trade, task: x.task.slice(0, 120), before: x.kinds, after: y.kinds });
  });
  console.log({ runs: a.length, changed });
  if (examples.length) console.log(examples);
  return changed.kinds + changed.steps + changed.draft;
}

if (require.main === module) {
  const [mode, ...files] = process.argv.slice(2);
  if (mode === 'record' && files.length === 1) record(files[0]);
  else if (mode === 'compare' && files.length === 2) process.exitCode = compare(files[0], files[1]) ? 1 : 0;
  else { console.error('Use: node scripts/task-step-diff.js record out.jsonl | compare before.jsonl after.jsonl'); process.exitCode = 2; }
}

module.exports = { corpus, record, compare };
