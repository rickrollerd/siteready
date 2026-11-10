// The job step library as the form's step picker shows it: each kind of work with
// a short name and its steps, grouped by the trades that do it. Kinds no trade owns
// are listed under "Any trade".
const { ACTIVITIES } = require('./activities');
const { TRADES } = require('./trades');
const { TITLES } = require('./scope');

// Names for kinds of work whose every step prints only for its own variant.
const VARIANT_LABELS = { carpJoinery: 'Joinery, doors and trim (as the task names them)', tileMix: 'Tile screed, adhesive, grout and sealer (as the task names them)', landscape: 'Soil, mulch and planting (as the task names them)',
  // Messy round 14, A run 4: "Stand the door frames" showed ticked and "Hang the doors" printed.
  doorHang: 'Door frames and doors (as the task names them)',
  // Messy round 15, B run 6: "Set the joints" and "Sand the joints" could not be found by their own names.
  plasterSanding: 'Cut, set and sand plasterboard (as the task names them)',
  // Messy round 16, A run 2: "downpipe" found only the gutter cleaning, fascia and box gutter steps.
  gutters: 'Fascia, gutters and downpipes (as the task names them)',
  // Messy round 19, A run 4: "Erect temporary fencing" showed ticked for a footpath gantry, and only "Erect the gantry" printed.
  siteEstablish: 'Site fencing, hoardings and gantries (as the task names them)' };

function stepLibrary() {
  const kinds = new Map();
  for (const activity of ACTIVITIES) {
    if (!activity.when || !activity.steps || !activity.steps.length) continue;
    // A step that prints only for one variant of the work ("Build and fill gabion baskets") is not named
    // beside the kind, so a ticked kind does not seem to bring it (messy round 6: gabions shown for a
    // sleeper wall). It still prints where its variant is in the task.
    const steps = activity.steps.filter((step) => !step.only).map((step) => step.step);
    const first = activity.steps[0].step;
    const entry = kinds.get(activity.when);
    // A kind whose every step prints only for its variant is named for the kind, not for its first variant (messy round 13:
    // "Lay the screed" and "Hang the doors" showed ticked, and neither printed, as the task named no screed and no doors).
    if (entry) entry.steps.push(...steps.filter((name) => !entry.steps.includes(name)));
    else kinds.set(activity.when, { id: activity.when, label: TITLES[activity.when] || VARIANT_LABELS[activity.when] || steps[0] || first, steps: steps.length ? steps : VARIANT_LABELS[activity.when] ? [] : [first] });
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
  tc: ['traffic'], traffic: ['traffic'], tack: ['tack coat'], profiling: ['profil', 'cold plan', 'mill'], milling: ['mill', 'profil', 'cold plan'], spoil: ['spoil', 'stockpil', 'muck', 'excavated material'], stockpile: ['stockpil', 'spoil'],
  muck: ['spoil', 'muck'], tip: ['tip', 'spoil'], hiab: ['hiab', 'loading crane'], ewp: ['ewp', 'elevating work platform', 'boom lift', 'scissor'],
  scaff: ['scaffold'], reo: ['reo', 'reinforc'], pour: ['pour', 'concrete'], demo: ['demoli'], sparky: ['electric'], chippy: ['carpent', 'timber'],
  dig: ['dig', 'excavat', 'trench'], hole: ['hole', 'excavat', 'trench'], lift: ['lift', 'crane'], height: ['height', 'fall', 'edge'],
  earthwork: ['earthmov', 'earthwork', 'excavat', 'trench', 'cut and fill', 'compaction', 'grader', 'dozer', 'spoil', 'batters'],
  earthworks: ['earthmov', 'earthwork', 'excavat', 'trench', 'cut and fill', 'compaction', 'grader', 'dozer', 'spoil', 'batters'],
  bulk: ['bulk excavat', 'bulk earthwork', 'earthmov', 'excavat'], civil: ['civil', 'road', 'pavement', 'kerb', 'drain', 'earthmov', 'excavat'], roadworks: ['road', 'pavement', 'traffic', 'asphalt', 'kerb'],
  mech: ['mechanical', 'duct', 'hvac', 'air condition', 'fan coil', 'chiller', 'refrigera', 'air handling'], hvac: ['mechanical', 'duct', 'hvac', 'air condition'],
  aircon: ['air condition', 'split system', 'refrigera'], plumber: ['plumb', 'drain'], plumbing: ['plumb', 'drain'],
  setting: ['set', 'setting'], stopping: ['set', 'stopping'], jointing: ['joint'], plasterboard: ['plasterboard', 'ceiling sheet', 'wall sheet'], gyprock: ['plasterboard'],
  asbestos: ['asbestos', 'fibro'], silica: ['silica', 'dust'], dust: ['dust', 'silica'], noise: ['noise', 'hearing'], confined: ['confined'],
};

// A word typed part way, or misspelt, read as the work it starts (messy round 13, B run 7: "jackham" found nothing).
const PREFIXES = [['jackham', ['break', 'jackhammer', 'breaker']], ['jackhm', ['break', 'jackhammer', 'breaker']], ['kango', ['break', 'jackhammer', 'breaker']], ['jack ham', ['break']]];

// A word reduced to its stem, so "controls" finds "control" and "stockpiles" finds "stockpil".
function stem(word) {
  return word.replace(/(?:ies)$/, 'y').replace(/(?:ing|ed|es|s)$/, '').replace(/e$/, '');
}

// Every step name of each kind of work whose steps print only for their variant, so a search finds a step by its own name
// (messy round 15, B run 6: "set the joints" found brazing and facade joints, not "Set the joints").
const ALL_STEP_NAMES = (() => {
  const names = new Map();
  for (const activity of ACTIVITIES) if (activity.when && activity.steps && VARIANT_LABELS[activity.when]) names.set(activity.when, `${names.get(activity.when) || ''} ${activity.steps.map((step) => step.step).join(' ')}`);
  return names;
})();
const SEARCH_TEXT = (() => {
  const text = new Map();
  for (const activity of ACTIVITIES) {
    if (!activity.when || !activity.steps) continue;
    const parts = activity.steps.flatMap((step) => [step.step, ...(step.hazards || []), ...(step.controls || [])].map((item) => (typeof item === 'string' ? item : item && item.text) || ''));
    text.set(activity.when, `${text.get(activity.when) || ''} ${parts.join(' ')}`.toLowerCase());
  }
  return text;
})();

// Words for kinds of work whose step names do not say them, read as part of the name in a search.
const ALIASES = {
  roadPlant: 'profiling profiler cold planing milling road plant',
  asphaltLay: 'asphalt paving paver',
  // Messy round 16: "dyna-bolt" found nothing and "masonry bolt" only demolition (A run 1); "remove old windows" offered the sill
  // and demolition steps, though "Install windows" takes the old windows out (A run 4).
  silicaDrill: 'dyna bolt dynabolt dynabolts masonry bolt masonry bolts anchor bolts anchors chemset holes fixings',
  windowInstall: 'remove old windows take out old windows replace windows window frames',
};

// The kinds of work a trade does: a scope trade (trades.js) or a pick list trade (pick-lists.json).
function tradeKinds(trade) {
  const id = String(trade || '').trim();
  if (!id) return new Set();
  const scope = TRADES.filter((item) => id.split(',').map((part) => part.trim()).includes(item.id));
  const pick = (require('./presets').TRADES || []).filter((item) => item && item.id === id);
  return new Set([...scope.flatMap((item) => [...item.kinds, ...(item.extra || [])]), ...pick.flatMap((item) => (item.tasks || []).flatMap((task) => task.kinds || []))].filter(Boolean));
}

// A term as a whole word, with its common endings ("store", "stored", "stores"; not "storage" or "tackle").
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const whole = (text, term) => new RegExp(`(?:^|[^a-z0-9])${escape(term)}(?:s|es|ed|ing|e|er|ers|d)?(?=[^a-z0-9]|$)`).test(text);

// The kinds of work whose name, hazards or controls hold every word searched, best match first (messy
// round 4: "store" listed 57 unrelated steps, "profil" blast holes, "tack" a staircase). Kinds whose name
// holds the words come first, then the trade's own kinds, ranked by whole words before parts of words.
// Kinds that only mention the words in a hazard or control are listed only where every word is a whole
// word there, and only a few of them.
function searchSteps(query, trade = '') {
  const words = String(query || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const terms = words.filter((word) => word.length > 1 && !['the', 'and', 'for', 'with', 'of', 'to', 'a', 'an', 'on', 'in'].includes(word)).map((word) => SYNONYMS[word] || SYNONYMS[stem(word)] || (PREFIXES.find(([start]) => word.startsWith(start)) || [])[1] || [stem(word)]);
  if (!terms.length) return [];
  const has = (text, term) => text.includes(` ${term}`) || text.startsWith(term);
  const own = tradeKinds(trade);
  // A search that names a trade ("mech", "plumbing") lists that trade's kinds of work first.
  const tradeGroups = LIBRARY.groups.filter((group) => group.trade !== 'Any trade' && terms.every((options) => options.some((term) => has(group.trade.toLowerCase(), term))));
  const results = tradeGroups.flatMap((group) => group.kinds.map((kind) => ({ id: kind.id, score: 1000, name: true })))
    .filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index);
  for (const group of LIBRARY.groups) {
    for (const kind of group.kinds) {
      if (results.some((item) => item.id === kind.id)) continue;
      const name = ` ${kind.label} ${kind.steps.join(' ')} ${ALL_STEP_NAMES.get(kind.id) || ''} ${ALIASES[kind.id] || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
      const body = ` ${SEARCH_TEXT.get(kind.id) || name}`.replace(/[^a-z0-9]+/g, ' ');
      // A term matches from the start of a word, so "dozer" does not find "bulldozer" text by accident and "lift" not "forklift".
      if (!terms.every((options) => options.some((term) => has(name, term) || has(body, term)))) continue;
      const named = terms.every((options) => options.some((term) => has(name, term)));
      const wholeWords = terms.every((options) => options.some((term) => whole(name, term) || whole(body, term)));
      if (!named && !wholeWords) continue;
      const score = terms.reduce((sum, options) => sum + Math.max(...options.map((term) => (whole(name, term) ? 100 : has(name, term) ? 40 : whole(body, term) ? 10 : 2))), 0) + (own.has(kind.id) ? 60 : 0);
      results.push({ id: kind.id, score, name: named, trade: own.has(kind.id) });
    }
  }
  const byScore = (a, b) => b.score - a.score;
  const named = results.filter((item) => item.name).sort(byScore);
  const others = results.filter((item) => !item.name).sort(byScore);
  // Kinds that only mention the words: the trade's own first, a few at most.
  const shown = named.length === 0 ? others : named.length >= 5 ? others.filter((item) => item.trade).slice(0, 3) : others.slice(0, 6);
  return [...named, ...shown].map((item) => item.id);
}

module.exports = { stepLibrary: () => LIBRARY, searchSteps };
