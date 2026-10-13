// A hazard the user adds to a job step (D254, D255, owner, 13 October 2026). "I added my own hazard/risk
// into the swms 'ground onsite is very boggy' but nothing then occurs for the controls or risk rating.
// How should this be handled?"
//
// D254: SiteReady offers matching controls from its library to tick, plus a box to write their own; at
// least one control is needed before download (download-gate.js). The offers are found by the hazard's
// words: the library's hazard lines that share its rarer words (weighted by how few hazard lines use
// them), and the sourced controls of those lines' steps that share its words. Only lines with a source
// are offered (D181); each prints with its citation for the state, as the library's own lines do.
// D255: the hazard gets its own likelihood and consequence, before and after its controls, suggested
// from its words and controls as SiteReady rates any step (register.js), and the user's choice where
// made. The step shows the higher of its own rating and each of its own hazards' ratings.
const { ACTIVITIES } = require('./activities');
const { localControl } = require('./citations');

const OWN_CONTROL = ' (Our own control)';
const MAX_OFFERS = 5;
// Words that say nothing about the kind of hazard.
const STOP = new Set(('a an the is are be can could may might very on in at of to for and or with from by into onto around about this that it its as when '
  + 'while there here our we they them site onsite job work works working area areas dangerous danger risk risks hazard hazards issue issues problem '
  + 'problems some any all also get gets got being been was were has have had will would should not no people person workers worker crew lot lots '
  + 'really quite bit always sometimes often due because cause causes caused make makes').split(' '));
// Everyday words for a hazard and the words the library uses for it.
const SYNONYMS = {
  boggy: ['wet', 'mud', 'soft', 'slips', 'ground'], muddy: ['mud', 'wet', 'slips'], slippery: ['slips', 'wet'], walking: ['slips', 'trips'],
  uneven: ['trips', 'ground'], potholes: ['trips', 'ground'], hot: ['heat'], sunny: ['sun', 'heat'], snakes: ['snakes', 'wildlife'], spiders: ['wildlife', 'bites'],
  windy: ['wind'], gusty: ['wind'], rain: ['wet', 'rain', 'weather'], raining: ['wet', 'rain', 'weather'], storms: ['weather', 'lightning'],
  dark: ['lighting'], night: ['lighting'], noisy: ['noise'], dusty: ['dust'], fumes: ['fumes'], smoke: ['fumes'], icy: ['slips', 'cold'], cold: ['cold'],
  public: ['public'], pedestrians: ['public'], kids: ['public'], children: ['public'], traffic: ['traffic', 'vehicles'], cars: ['traffic', 'vehicles'],
};
const stem = (word) => word.replace(/(?:ing|ed|es|s|y)$/, '');
function wordsOf(text, withSynonyms = false) {
  const out = new Set();
  for (const word of String(text || '').toLowerCase().match(/[a-z]+/g) || []) {
    if (STOP.has(word) || word.length < 3) continue;
    out.add(stem(word));
    if (withSynonyms) for (const other of SYNONYMS[word] || SYNONYMS[word.replace(/s$/, '')] || []) out.add(stem(other));
  }
  return out;
}

// The library's hazard lines, each with its step's sourced controls, and how rare each word is.
let index = null;
function libraryIndex() {
  if (index) return index;
  const hazards = [];
  for (const activity of ACTIVITIES) {
    for (const step of activity.steps || []) {
      const sourced = (step.controls || []).filter((line) => line && typeof line === 'object' && line.text && line.source);
      for (const line of step.hazards || []) hazards.push({ words: wordsOf(line), step, sourced });
    }
  }
  const counts = new Map();
  for (const item of hazards) for (const word of item.words) counts.set(word, (counts.get(word) || 0) + 1);
  const weight = (word) => Math.log((hazards.length + 1) / ((counts.get(word) || 0) + 1));
  const lines = new Map();
  for (const item of hazards) for (const line of item.sourced) if (!lines.has(line.text)) lines.set(line.text, line);
  index = { hazards, weight, lines };
  return index;
}

// The library lines offered for a hazard: { key (the library's words), text (as printed, with its
// citation for the state) }, best first. exclude: lines the step already prints.
function offersFor(hazard, stateId = 'qld', exclude = []) {
  const { hazards, weight } = libraryIndex();
  const own = wordsOf(hazard, true);
  if (!own.size) return [];
  // Each of the hazard's own words, with the library's words for it.
  const said = [...wordsOf(hazard)].map((word) => {
    const raw = (String(hazard).toLowerCase().match(/[a-z]+/g) || []).find((item) => stem(item) === word) || word;
    return { word, also: new Set([word, ...(SYNONYMS[raw] || SYNONYMS[raw.replace(/s$/, '')] || []).map(stem)]) };
  });
  const total = said.reduce((sum, item) => sum + weight(item.word), 0);
  const scored = [];
  for (const item of hazards) {
    const shared = [...own].filter((word) => item.words.has(word));
    if (!shared.length || !item.sourced.length) continue;
    // Most of what the user said must be in the library's hazard: "wasps nest in the roof space" is
    // not the roof space's heat.
    const covered = said.filter((entry) => [...entry.also].some((word) => item.words.has(word))).reduce((sum, entry) => sum + weight(entry.word), 0);
    if (covered < total * 0.5) continue;
    scored.push({ item, shared, score: shared.reduce((sum, word) => sum + weight(word), 0) / Math.sqrt(item.words.size) });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.length ? scored[0].score : 0;
  // Close matches only: a hazard line sharing a common word or two is not offered.
  const near = scored.filter((entry) => entry.score >= Math.max(3, top * 0.7)).slice(0, 12);
  const printed = new Set(exclude.map((line) => String(line).replace(/\s*\([^()]*\)\s*$/, '').trim().toLowerCase()));
  const found = new Map();
  for (const { item, shared } of near) {
    const concept = new Set([...shared, ...[...item.words].filter((word) => own.has(word))]);
    for (const line of item.sourced) {
      const words = wordsOf(line.text);
      const hits = [...concept].filter((word) => words.has(word));
      if (!hits.length || printed.has(line.text.toLowerCase())) continue;
      const score = hits.reduce((sum, word) => sum + weight(word), 0);
      if (!found.has(line.text) || found.get(line.text).score < score) found.set(line.text, { line, score, hits: hits.length });
    }
  }
  // Lines that share two or more of the hazard's ideas ("wet" and "slips") come first and alone; where
  // none does, the two closest that share one.
  const all = [...found.values()].sort((a, b) => b.hits - a.hits || b.score - a.score);
  const strong = all.filter((item) => item.hits >= 2);
  return (strong.length ? strong : all.slice(0, 2)).map(({ line }) => ({ key: line.text, text: localControl(line.text, line.source, stateId) }))
    .filter((offer) => offer.text).slice(0, MAX_OFFERS);
}

// The printed line for a library line the user ticked, or null where it is not a sourced library line.
function libraryLine(key, stateId = 'qld') {
  const line = libraryIndex().lines.get(String(key || ''));
  return line ? localControl(line.text, line.source, stateId) : null;
}

module.exports = { offersFor, libraryLine, wordsOf, OWN_CONTROL };
