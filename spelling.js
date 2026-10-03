// Spelling fixes for tasks. A word that is not an English word and not in SiteReady's own
// construction vocabulary is corrected when one vocabulary word is clearly closest, for
// example "plasterbord" to "plasterboard". The SWMS shows the corrected spelling.
const fs = require('fs');
const path = require('path');

let dictionary = null;
function englishWords() {
  if (dictionary) return dictionary;
  dictionary = new Set();
  try {
    // The word-list package (MIT) is ESM-only, so its word file is read directly.
    const file = path.join(__dirname, 'node_modules', 'word-list', 'words.txt');
    for (const word of fs.readFileSync(file, 'utf8').split('\n')) if (word) dictionary.add(word.toLowerCase());
  } catch {
    // Without the dictionary, only vocabulary words are used.
  }
  return dictionary;
}

// Construction words SiteReady knows: the words in its job steps, plus trade words.
// Site words and brands that are not in the dictionary, so they are never "corrected".
const SITE_WORDS = ['bunnings', 'bondek', 'highset', 'lowset', 'porte', 'cochere', 'bulkfill', 'flange', 'flanges', 'formworker', 'formworkers', 'switchroom', 'switchrooms', 'telehandler', 'telehandlers', 'hebel', 'gyprock', 'villaboard', 'colorbond', 'zincalume', 'kliplok', 'trimdek', 'speedpanel', 'ringlock', 'kwikstage', 'cuplock', 'layher', 'franna', 'frannas', 'hiabs', 'dincel', 'bondor', 'weatherboard', 'weatherboards', 'fibro', 'besser', 'versiclad', 'scyon', 'linea', 'axon', 'stria', 'matrix', 'cemintel', 'blueboard', 'aquaboard', 'fyrchek', 'boral', 'holcim', 'hanson', 'humes', 'reln', 'nylex', 'xypex', 'ardex', 'mapei', 'davco', 'wattyl', 'dulux', 'taubmans', 'haymes', 'stramit', 'lysaght', 'onesteel', 'liberty', 'ramset', 'hilti', 'makita', 'dewalt', 'genie', 'haulotte', 'manitou', 'merlo', 'skyjack', 'bobcat', 'dingo', 'kanga', 'acrow', 'acrows', 'formply', 'tilt', 'tiltup', 'shotcreting', 'spoon', 'screeding', 'screed', 'grano', 'mudmap', 'mudmaps', 'setout', 'setouts', 'downpipe', 'soffit', 'soffits', 'reveal', 'reveals', 'mullion', 'mullions', 'transom', 'transoms', 'plasterer', 'plasterers', 'renderer', 'renderers', 'tiler', 'tilers', 'glazier', 'glaziers', 'sparkies', 'chippies', 'brickies', 'scaffies', 'subbies', 'dogmen', 'riggers', 'concreter', 'concreters', 'concretor', 'concretors', 'demolisher', 'demolishers', 'hydrovac', 'vactruck', 'jetter', 'jetting', 'relining', 'bitumen', 'bituminous', 'geotextile', 'geofabric', 'geogrid', 'gabion', 'gabions', 'culvert', 'culverts', 'pavement', 'stabilised', 'stabilisation', 'crusher', 'crushers', 'screening', 'pugmill', 'shoring', 'shotcrete', 'secant', 'contiguous', 'soldier', 'whaler', 'whalers', 'waler', 'walers', 'formtie', 'formties', 'backprop', 'backprops', 'backpropping', 'reshore', 'reshoring', 'falsework', 'jumpform', 'jumpforms', 'slipform', 'tableform', 'tableforms', 'bracket', 'brackets'];
const EXTRA = ['plasterboard', 'formwork', 'falsework', 'scaffolding', 'scaffold', 'excavator', 'excavation', 'telehandler', 'balustrade', 'balustrades', 'waterproofing', 'downpipes', 'downpipe', 'blockwork', 'brickwork', 'blockwall', 'jumpform', 'precast', 'shotcrete', 'stormwater', 'switchboard', 'switchboards', 'subcontractor', 'penetrations', 'reinforcement', 'asbestos', 'demolition', 'demolish', 'concrete', 'electrical', 'plumbing', 'carpentry', 'skylight', 'sarking', 'flashing', 'flashings', 'guttering', 'cladding', 'insulation', 'sprinklers', 'hydrant', 'hydrants', 'ductwork', 'refrigerant', 'condenser', 'chiller', 'generator', 'substation', 'transformer', 'conduit', 'containment', 'trench', 'trenching', 'backfill', 'compaction', 'asphalt', 'bitumen', 'pavers', 'retaining', 'footings', 'lintel', 'lintels', 'pergola', 'decking', 'joinery', 'benchtop', 'benchtops', 'membrane', 'membranes', 'sealant', 'silicone', 'grandstand', 'stadium', 'concourse', 'hospital', 'classroom', 'basement', 'dewatering', 'piling', 'stockpile', 'stockpiles', 'spoil', 'kerb', 'kerbs', 'bollards', 'hoarding', 'gantry', 'crane', 'cranes', 'forklift', 'elevating', 'platform', 'scissor', 'electrician', 'plumber', 'carpenter', 'bricklayer', 'scaffolder', 'rigger', 'dogman'];

let vocabulary = null;
function vocabularyWords() {
  if (vocabulary) return vocabulary;
  vocabulary = new Set([...EXTRA, ...SITE_WORDS]);
  try {
    const { ACTIVITIES } = require('./activities');
    const add = (text) => { for (const word of String(text || '').toLowerCase().match(/[a-z]{5,}/g) || []) vocabulary.add(word); };
    for (const activity of ACTIVITIES) {
      for (const step of activity.steps || []) {
        add(step.step);
        for (const item of [...(step.hazards || []), ...(step.controls || [])]) add(typeof item === 'string' ? item : item && item.text);
      }
    }
  } catch {
    // The extra list alone.
  }
  return vocabulary;
}

// Optimal string alignment distance (adjacent swaps count as one), stopping early past max.
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

// Common misspellings that happen to be old or rare dictionary words.
const KNOWN = { cieling: 'ceiling', cielings: 'ceilings', guage: 'gauge', seperate: 'separate', recieve: 'receive', recieved: 'received', accross: 'across', untill: 'until', occured: 'occurred', aluminum: 'aluminium', guttters: 'gutters', plasterbaord: 'plasterboard', scaffolf: 'scaffold' };

function correction(word) {
  const lower = word.toLowerCase();
  if (KNOWN[lower]) return word[0] === word[0].toUpperCase() ? KNOWN[lower][0].toUpperCase() + KNOWN[lower].slice(1) : KNOWN[lower];
  if (lower.length < 5) return null;
  const vocab = vocabularyWords();
  const known = (w) => vocab.has(w) || englishWords().has(w);
  if (known(lower)) return null;
  // A plural or singular of a known word is not a typo.
  if (known(lower.replace(/s$/, '')) || known(lower.replace(/ies$/, 'y')) || known(lower.replace(/es$/, '')) || known(`${lower}s`)) return null;
  const max = lower.length >= 8 ? 2 : 1;
  let bestDistance = max + 1;
  let closest = [];
  for (const candidate of vocab) {
    // The first letter is almost always typed right.
    if (candidate[0] !== lower[0]) continue;
    const gap = distance(lower, candidate, max);
    if (gap < bestDistance) { bestDistance = gap; closest = [candidate]; } else if (gap === bestDistance && gap <= max) closest.push(candidate);
  }
  if (!closest.length) return englishCorrection(lower, word);
  let best = closest.length === 1 ? closest[0] : null;
  // A tie is settled by a missed double letter, then by the English dictionary.
  if (!best && closest.filter((candidate) => doubled(lower, candidate)).length === 1) best = closest.find((candidate) => doubled(lower, candidate));
  if (!best) return englishCorrection(lower, word);
  // Only the ending differs by an s: a plural, not a typo.
  if (best === `${lower}s` || `${best}s` === lower) return null;
  // Keep a capital first letter.
  return word[0] === word[0].toUpperCase() ? best[0].toUpperCase() + best.slice(1) : best;
}

// A missed letter ("truses" for "trusses", "amenites" for "amenities") is the commonest
// slip, so a candidate that only adds one letter settles a tie.
const doubled = (typo, candidate) => candidate.length === typo.length + 1 && [...candidate].some((_ch, i) => candidate.slice(0, i) + candidate.slice(i + 1) === typo);

// Words outside the construction vocabulary, such as "resedential", are corrected to an
// English word only when one letter is wrong and one word is clearly meant.
let byStart = null;
function englishByStart(first, length) {
  if (!byStart) {
    byStart = new Map();
    for (const candidate of englishWords()) {
      const key = `${candidate[0]}${candidate.length}`;
      if (!byStart.has(key)) byStart.set(key, []);
      byStart.get(key).push(candidate);
    }
  }
  return byStart.get(`${first}${length}`) || [];
}

function englishCorrection(lower, word) {
  if (!englishWords().size) return null;
  const close = [];
  for (const length of [lower.length - 1, lower.length, lower.length + 1]) {
    for (const candidate of englishByStart(lower[0], length)) if (distance(lower, candidate, 1) === 1) close.push(candidate);
  }
  const pick = close.length === 1 ? close[0] : (close.filter((candidate) => doubled(lower, candidate)).length === 1 ? close.find((candidate) => doubled(lower, candidate)) : null);
  if (!pick || pick === `${lower}s` || `${pick}s` === lower) return null;
  return word[0] === word[0].toUpperCase() ? pick[0].toUpperCase() + pick.slice(1) : pick;
}

// { text, fixes: [{ from, to }] }
function fixSpelling(text) {
  const fixes = [];
  const out = String(text || '').replace(/[A-Za-z]{5,}/g, (word, at, whole) => {
    // Words in capitals are names or codes, and a capital inside a sentence is a name or brand.
    if (word === word.toUpperCase()) return word;
    const sentenceStart = /(?:^|[.!?]\s+)$/.test(whole.slice(0, at));
    if (!sentenceStart && word[0] === word[0].toUpperCase()) return word;
    // A word after a name, such as a plant's species name, is part of the name.
    if (/[A-Z][a-z]+\s+$/.test(whole.slice(0, at)) && !/(?:^|[.!?]\s+)[A-Z][a-z]+\s+$/.test(whole.slice(0, at))) return word;
    // Part of a word joined with a hyphen, a number or an apostrophe is left alone.
    if (/[-'’0-9]$/.test(whole.slice(0, at)) || /^[-'’0-9]/.test(whole.slice(at + word.length))) return word;
    const fixed = correction(word);
    if (!fixed) return word;
    fixes.push({ from: word, to: fixed });
    return fixed;
  });
  return { text: out, fixes };
}

module.exports = { fixSpelling, distance };
