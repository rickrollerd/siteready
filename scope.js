// Reads a scope of works and lists the tasks in it that need a SWMS.
// A scope mixes site work with commercial terms, exclusions, work by others and
// paperwork. Only the subcontractor's own site work is kept. Each line of site
// work is matched to the kinds of work the drafting library knows, and lines of
// the same kind become one proposed task. A task is marked as needing a SWMS when
// it is high risk construction work.
const { workFlags, highRiskMatches } = require('./draft');
const { ACTIVITIES } = require('./activities');
const { findState, highRiskList } = require('./legislation');

// Headings that start a part of the scope that is not the subcontractor's site work.
const OUT_HEADING = /\b(exclu\w*|by others|not included|not in scope|omitted|n\.?i\.?c\.?|builder'?s? (?:responsibilit\w*|works?|scope)|by (?:the )?(?:builder|client|principal|head contractor)|free issue|payment|insurance|warrant\w*|retention|variations?|programme|price|pricing|tender\w*|schedule of rates|rates|invoic\w*|claims?|definitions?|interpretation|general conditions|special conditions|contract conditions|documentation|submissions?|shop drawings|o ?& ?m|operation and maintenance|as[- ]?builts?|defects?|liquidated|security of payment|commercial|qualifications?|clarifications?|hold points?|inspection and test plans?|quality assurance)\b/i;
// Headings that bring the reader back to the work.
const WORK_HEADING = /\b(scope of works?|works? included|inclusions?|the works|work to be (?:done|carried out)|description of (?:the )?works?|specific (?:works|requirements)|trade works?|installation|supply and install|general scope|subcontract works)\b/i;

// A line that is not the subcontractor's site work.
const NOT_OURS = /\b(by others|by (?:the )?(?:builder|client|principal|head contractor|main contractor|electrician|plumber|other trades?)|excluded|exclusions?|not included|not part of|n\.?i\.?c\b|supply only|supplied by (?:the )?(?:builder|client|others)|free issued?|builder (?:will|to) (?:supply|provide|install)|(?:client|builder) supplied)\b/i;
// Paperwork, money and meetings: no site work.
const PAPERWORK = /\b(shop drawings?|submit\w*|submissions?|certificat\w*|warrant\w*|manuals?|as[- ]?built|samples?|invoice\w*|payment|price\w*|pricing|rates?\b|cost\w*|insurance|meetings?|programme|schedule|retention|variation\w*|tender\w*|quotation|documentation|records?|registers?|reports?|approvals?|permits? fees?|nominat\w*|allowance|provisional sum|prime cost|liquidated|defects liability|ITPs?\b|inspection and test plans?|design\w*|engineer\w* (?:certif\w*|sign\w*)|fabricat\w* (?:off[- ]site|in the (?:shop|factory|workshop))|off[- ]site)\b/i;
// Words that describe work done on site.
const SITE_WORK = /\b(install\w*|supply and install|supply,? (?:deliver|install)|erect\w*|dismantl\w*|fix\w*|lay\w*|construct\w*|demoli\w*|remov\w*|strip\w*|excavat\w*|trench\w*|backfill\w*|pour\w*|plac\w*|cut\w*|cor(?:e|ing)\b|core[- ]drill\w*|drill\w*|weld\w*|braz\w*|paint\w*|appl(?:y|ied|ication)|spray\w*|connect\w*|terminat\w*|test\w*|commission\w*|seal\w*|caulk\w*|grout\w*|til(?:e|es|ing)\b|hang\w*|set ?out|lift\w*|hoist\w*|craneage|crane|unload\w*|deliver\w* to (?:site|the site|the work)|break\w* out|grind\w*|polish\w*|clean\w*|membrane\w*|waterproof\w*|torch\w*|screed\w*|render\w*|plaster\w*|sheet\w*|clad\w*|glaz\w*|roof\w*|pipe\w*|duct\w*|cabl\w*|wir(?:e|es|ing)\b|plant\b|pump\w*|scaffold\w*|form ?work|reinforc\w*|reo\b|concrete\w*|footings?|piers?|piles?|piling|compact\w*|level\w*|bolt\w*|anchor\w*|mount\w*|hung|suspend\w*|penetrat\w*|isolat\w*|energis\w*|charg\w*|purg\w*|pressure test\w*|flush\w*|landscap\w*|turf\w*|plant(?:ing|s)\b|mulch\w*|irrigat\w*|fenc\w*|gates?\b|pav\w*|kerb\w*|asphalt\w*|line ?mark\w*|carpet\w*|vinyl\w*|floor\w*|ceiling\w*|partition\w*|stud\w*|door\w*|hardware|joinery|cabinet\w*|benchtops?|balustrad\w*|handrails?|window\w*|steel\w*|purlins?|rigg\w*|dogg\w*)\b/i;

const MIN_WORDS = 4;

function words(line) {
  return line.split(/\s+/).filter(Boolean).length;
}

// Removes bullets, clause numbers and spare spaces from the start of a line.
function cleanLine(line) {
  return line
    .replace(/ /g, ' ')
    .replace(/^\s*(?:[•·▪◦‣○●■□\-–—*>]+|\(?[a-z]{1,3}\)|\(?[ivx]{1,5}\)|\d+(?:\.\d+)*\.?\)?)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// A short line with no full stop, often numbered or in capitals, starts a part of the scope.
function isHeading(raw, line) {
  if (!line || words(line) > 10 || /[.;]$/.test(line)) return false;
  return /^\s*\d+(?:\.\d+)*\.?\s+\S/.test(raw) || line === line.toUpperCase() || /:$/.test(line) || words(line) <= 5;
}

function splitLines(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    // A long paragraph with several items separated by semicolons is several lines.
    .flatMap((raw) => (raw.length > 240 && raw.includes(';') ? raw.split(/;\s+/) : [raw]));
}

// The lines that describe the subcontractor's own site work.
function siteWorkLines(text) {
  let out = false;
  const kept = [];
  const seen = new Set();
  for (const raw of splitLines(text)) {
    const line = cleanLine(raw);
    if (!line) continue;
    if (isHeading(raw, line)) {
      if (OUT_HEADING.test(line)) out = true;
      else if (WORK_HEADING.test(line) || SITE_WORK.test(line)) out = false;
      continue;
    }
    if (out || words(line) < MIN_WORDS) continue;
    if (NOT_OURS.test(line) || !SITE_WORK.test(line)) continue;
    // A paperwork line is kept only if it also names work done on site.
    if (PAPERWORK.test(line) && !/\b(install\w*|erect\w*|lay\w*|fix\w*|construct\w*|demoli\w*|excavat\w*|pour\w*|weld\w*|cut\w*|core[- ]drill\w*|lift\w*)\b/i.test(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(line.replace(/[;,:]$/, '').replace(/([^.])$/, '$1.'));
  }
  return kept;
}

// The kinds of work with their own job steps, in the library's order.
const KINDS = ACTIVITIES.filter((activity) => activity.when && (activity.steps || []).length);
// Kinds that only add detail to another kind (a post-tensioned slab, a crane company's lifts)
// do not make a task of their own.
const DETAIL = new Set(['ptSlab', 'craneInterface', 'cite', 'ewp', 'mobileScaffold', 'forklift']);
const MAX_LINES = 8;
const MAX_TASK = 900;

function taskText(lines) {
  let text = '';
  for (const line of lines) {
    if ((text + ' ' + line).length > MAX_TASK) break;
    text = text ? `${text} ${line}` : line;
  }
  return text;
}

function tasksFromScope(text, stateId = 'qld') {
  const state = findState(stateId);
  const lines = siteWorkLines(text);
  if (!lines.length) {
    return { tasks: [], lines: 0, note: 'No site work was found in this text. If it is a contract or a cover letter, attach the scope of works on its own.' };
  }
  const groups = new Map();
  for (const line of lines) {
    const flags = workFlags(line);
    const kinds = KINDS.filter((kind) => flags[kind.when] && !DETAIL.has(kind.when));
    for (const kind of kinds) {
      if (!groups.has(kind.when)) groups.set(kind.when, { kind, lines: [] });
      groups.get(kind.when).lines.push(line);
    }
  }
  const order = (when) => KINDS.findIndex((kind) => kind.when === when);
  const tasks = [...groups.values()]
    .sort((a, b) => order(a.kind.when) - order(b.kind.when))
    .map(({ kind, lines: found }) => {
      const used = found.slice(0, MAX_LINES);
      const task = taskText(used);
      const highRisk = highRiskMatches(task, '', state).map((item) => item.label);
      return {
        id: kind.when,
        title: kind.steps[0].step,
        task,
        lines: found,
        highRisk,
        fallRisk: highRisk.some((label) => /falling/i.test(label)) ? 'yes' : '',
        needsSwms: highRisk.length > 0,
      };
    })
    // High risk construction work needs a SWMS by law, so it comes first.
    .sort((a, b) => Number(b.needsSwms) - Number(a.needsSwms));
  return {
    tasks,
    lines: lines.length,
    note: tasks.length ? '' : 'Site work was found, but none matched a kind of work SiteReady drafts. Write the task in the form instead.',
  };
}

module.exports = { tasksFromScope, siteWorkLines };
