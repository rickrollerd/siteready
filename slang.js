// Australian site slang and shorthand, read the way it is meant before the job steps are
// picked. The SWMS keeps the task as the user typed it. Each change gives words the rest
// of SiteReady already knows, and reading a task twice gives the same result.
const SLANG = [
  // Shorthand
  [/\bw\/(?=\s|$)/gi, 'with '],
  [/\bw\/(?=\w)/gi, 'with '],
  [/\bthru\b/gi, 'through'],
  [/\binst(?:al)?\b/gi, 'install'],
  [/\brd\b/gi, 'road'],
  [/\bhwy\b/gi, 'highway'],
  [/\bmwy\b/gi, 'motorway'],
  [/\bfwy\b/gi, 'freeway'],
  [/\bdia\b/gi, 'diameter'],
  [/\blvl\b/gi, 'level'],
  [/\bL(\d{1,3})\b/g, 'level $1'],
  [/\bcar ?park\b/gi, 'car park'],
  [/\bTC\b/g, 'tower crane'],
  [/\bMEWPs?\b/g, 'EWP'],
  [/\bPT (slabs?|beams?|bands?)\b/g, 'post-tensioned $1'],
  [/\bRCP\b/g, 'reinforced concrete pipe'],
  [/\bRCBCs?\b/g, 'reinforced concrete box culvert'],
  [/\bGPOs?\b/g, 'power points'],
  [/\bs\/s\b|\bSS\b/g, 'stainless steel'],
  [/\bpenos?\b/gi, 'penetrations'],
  [/\bpowerlines?\b/gi, 'power lines'],
  // Asbestos cement: "AC pipe" or "AC sheet" is asbestos cement. "AC pipework" and "AC unit" are air conditioning.
  [/\bAC (pipes?|mains?|sheets?|sheeting)\b/g, 'asbestos cement $1'],
  [/\baircon\b|\ba\/c\b/gi, 'air conditioning'],
  [/\bAC (units?|systems?)\b/g, 'air conditioning $1'],
  // Demolition
  [/\bdemo'?d\b/gi, 'demolished'],
  [/\bdemo(?:'?ing)\b/gi, 'demolishing'],
  [/\bdemo\b(?!nstrat)/gi, 'demolish'],
  // Trades
  [/\bsparkies\b/gi, 'electricians'],
  [/\bsparky\b/gi, 'electrician'],
  [/\bchippies\b/gi, 'carpenters'],
  [/\bchippy\b/gi, 'carpenter'],
  [/\bbrickies\b/gi, 'bricklayers'],
  [/\bbrickie\b/gi, 'bricklayer'],
  [/\bscaffies\b/gi, 'scaffolders'],
  [/\bscaffy\b/gi, 'scaffolder'],
  [/\bsubbies\b/gi, 'subcontractors'],
  [/\bsubbie\b/gi, 'subcontractor'],
  // Plant and gear known by brand
  [/\bkangas?\b/gi, 'jackhammer'],
  [/\bdingos?\b/gi, 'mini loader'],
  [/\bhi-?abs?\b/gi, 'vehicle loading crane'],
  [/\bacrows?\b/gi, 'props'],
  [/\bdunn(?:y|ies)\b/gi, 'toilets'],
];

function readSlang(text) {
  let out = String(text || '');
  for (const [pattern, replacement] of SLANG) out = out.replace(pattern, replacement);
  return out.replace(/\s+/g, ' ').trim();
}

module.exports = { readSlang };
