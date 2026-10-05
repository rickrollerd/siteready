// Where a control sits in the hierarchy of control (WHS Regulations s 36), read from its wording.
// One ranking for the builder check (W2, W10) and for the order SiteReady prints each step's
// controls in, so a SiteReady draft is checked by the same rule it was written to.
const { HIERARCHY } = require('./legislation');

function controlLevel(line) {
  if (/\b(eliminat\w*|do not place a person|from the ground|stay(?:s|ing)? on the ground|prefabricat\w*|off[- ]?site|not (?:done|carried out) at height)\b/i.test(line)) return 'Eliminate';
  if (/\b(substitut\w*|instead of|replaced? with|low[- ]voc|water[- ]based|lighter)\b/i.test(line)) return 'Substitute';
  if (/\b(edge protection|guard\s?rails?|handrails?|scaffold\w*|elevating work platforms?|\bewps?\b|scissor lifts?|boom lifts?|safety mesh|catch platforms?|perimeter screens?|edge screens?|screens|gates?|fenc\w*|barriers?|barricad\w*|hoardings?|covers?|covered|isolat\w*|lock ?out|lockout|de-?energi[sz]\w*|shor\w*|trench (?:shields?|box\w*)|batter\w*|bench\w*|extraction|on-tool|water suppression|wet (?:cut\w*|method)|interlock\w*|guards?|guarded|ventilat\w*|propp?\w*|props?|exclusion zones?|travel restraint)\b/i.test(line)
    && !(/\b(harness|fall arrest|lanyard)\b/i.test(line) && !/\b(edge protection|guard\s?rails?|scaffold\w*|ewps?|elevating work platforms?|safety mesh)\b/i.test(line))) return 'Isolate or engineer';
  if (/\b(harness\w*|lanyards?|fall arrest|ppe|respirators?|p2|gloves|glasses|goggles|hearing protection|ear ?(?:plugs|muffs)|hard hats?|helmets?|boots|hi-?vis|life jackets?|face shields?|coveralls)\b/i.test(line)) return 'PPE';
  return 'Administrative';
}

// Elimination, substitution, isolation and engineering controls.
const HIGHER = new Set(['Eliminate', 'Substitute', 'Isolate or engineer']);

const RANK = Object.fromEntries(HIERARCHY.map((level, index) => [level, index]));

// A step's controls in hierarchy order: elimination, substitution, isolation and engineering,
// administrative, then PPE. Lines of the same level keep the order they were written in.
function inHierarchyOrder(controls) {
  return controls
    .map((line, index) => ({ line, index, rank: RANK[controlLevel(line)] }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.line);
}

module.exports = { controlLevel, HIGHER, inHierarchyOrder };
