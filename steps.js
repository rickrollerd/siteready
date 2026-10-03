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

// Site words for the same thing, so a search finds the step whichever word is typed.
const SYNONYMS = {
  tc: ['traffic'], traffic: ['traffic'], spoil: ['spoil', 'stockpil', 'muck', 'excavated material'], stockpile: ['stockpil', 'spoil'],
  muck: ['spoil', 'muck'], tip: ['tip', 'spoil'], hiab: ['hiab', 'loading crane'], ewp: ['ewp', 'elevating work platform', 'boom lift', 'scissor'],
  scaff: ['scaffold'], reo: ['reo', 'reinforc'], pour: ['pour', 'concrete'], demo: ['demoli'], sparky: ['electric'], chippy: ['carpent', 'timber'],
  dig: ['dig', 'excavat', 'trench'], hole: ['hole', 'excavat', 'trench'], lift: ['lift', 'crane'], height: ['height', 'fall', 'edge'],
  earthwork: ['earthmov', 'earthwork', 'excavat', 'trench', 'cut and fill', 'compaction', 'grader', 'dozer', 'spoil', 'batters'],
  earthworks: ['earthmov', 'earthwork', 'excavat', 'trench', 'cut and fill', 'compaction', 'grader', 'dozer', 'spoil', 'batters'],
  bulk: ['bulk excavat', 'bulk earthwork', 'earthmov', 'excavat'], civil: ['civil', 'road', 'pavement', 'kerb', 'drain', 'earthmov', 'excavat'], roadworks: ['road', 'pavement', 'traffic', 'asphalt', 'kerb'],
  asbestos: ['asbestos', 'fibro'], silica: ['silica', 'dust'], dust: ['dust', 'silica'], noise: ['noise', 'hearing'], confined: ['confined'],
};

// A word reduced to its stem, so "controls" finds "control" and "stockpiles" finds "stockpil".
function stem(word) {
  return word.replace(/(?:ies)$/, 'y').replace(/(?:ing|ed|es|s)$/, '').replace(/e$/, '');
}

const SEARCH_TEXT = (() => {
  const text = new Map();
  for (const activity of ACTIVITIES) {
    if (!activity.when || !activity.steps) continue;
    const parts = activity.steps.flatMap((step) => [step.step, ...(step.hazards || []), ...(step.controls || [])].map((item) => (typeof item === 'string' ? item : item && item.text) || ''));
    text.set(activity.when, `${text.get(activity.when) || ''} ${parts.join(' ')}`.toLowerCase());
  }
  return text;
})();

// The kinds of work whose name, hazards or controls hold every word searched, best match first.
function searchSteps(query) {
  const words = String(query || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const terms = words.filter((word) => word.length > 1 && !['the', 'and', 'for', 'with', 'of', 'to', 'a', 'an', 'on', 'in'].includes(word)).map((word) => SYNONYMS[word] || SYNONYMS[stem(word)] || [stem(word)]);
  if (!terms.length) return [];
  const results = [];
  for (const group of LIBRARY.groups) {
    for (const kind of group.kinds) {
      if (results.some((item) => item.id === kind.id)) continue;
      const name = `${kind.label} ${kind.steps.join(' ')}`.toLowerCase();
      const body = (SEARCH_TEXT.get(kind.id) || name).replace(/[^a-z0-9]+/g, ' ');
      // A term matches from the start of a word, so "dozer" does not find "bulldozer" text by accident and "lift" not "forklift".
      const has = (text, term) => text.includes(` ${term}`) || text.startsWith(term);
      if (!terms.every((options) => options.some((term) => has(body, term) || has(name, term)))) continue;
      const score = terms.filter((options) => options.some((term) => has(name, term))).length;
      results.push({ id: kind.id, score });
    }
  }
  return results.sort((a, b) => b.score - a.score).map((item) => item.id);
}

module.exports = { stepLibrary: () => LIBRARY, searchSteps };
