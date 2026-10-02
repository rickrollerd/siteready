// The job step library as the form's step picker shows it: each kind of work with
// a short name and its steps, grouped by the trades that do it. Kinds no trade owns
// are listed under "Any trade".
const { ACTIVITIES } = require('./activities');
const { TRADES } = require('./trades');
const { TITLES } = require('./scope');

function stepLibrary() {
  const kinds = new Map();
  for (const activity of ACTIVITIES) {
    if (!activity.when || !activity.steps || !activity.steps.length) continue;
    const steps = activity.steps.map((step) => step.step);
    const entry = kinds.get(activity.when);
    if (entry) entry.steps.push(...steps.filter((name) => !entry.steps.includes(name)));
    else kinds.set(activity.when, { id: activity.when, label: TITLES[activity.when] || steps[0], steps });
  }
  const used = new Set();
  const groups = TRADES.map((trade) => {
    const ids = [...trade.kinds, ...(trade.extra || [])].filter((id) => kinds.has(id));
    ids.forEach((id) => used.add(id));
    return { trade: trade.name, kinds: ids.map((id) => kinds.get(id)) };
  }).filter((group) => group.kinds.length);
  const rest = [...kinds.keys()].filter((id) => !used.has(id));
  if (rest.length) groups.push({ trade: 'Any trade', kinds: rest.map((id) => kinds.get(id)) });
  return { groups };
}

// Built once: the library does not change while the server runs.
const LIBRARY = stepLibrary();

module.exports = { stepLibrary: () => LIBRARY };
