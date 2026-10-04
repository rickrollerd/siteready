// Reads a scope of works and lists the tasks in it that need a SWMS.
// A scope mixes site work with commercial terms, exclusions, work by others and
// paperwork. Only the subcontractor's own site work is kept. Each line of site
// work is matched to the kinds of work the drafting library knows, and lines of
// the same kind become one proposed task. A task is marked as needing a SWMS when
// it is high risk construction work.
const { workFlags, highRiskMatches, groundSlabOnly, suggestedKinds } = require('./draft');
const { ACTIVITIES } = require('./activities');
const { findState, highRiskList } = require('./legislation');
const { TRADES, tradeIds } = require('./trades');

// Headings that start a part of the scope that is not the subcontractor's site work.
const OUT_HEADING = /\b(exclu\w*|by others|not included|not in scope|omitted|n\.?i\.?c\.?|builder'?s? (?:responsibilit\w*|works?|scope)|by (?:the )?(?:builder|client|principal|head contractor)|free issue|payment|insurance|warrant\w*|retention|variations?|programme|price|pricing|tender\w*|schedule of rates|rates|invoic\w*|claims?|definitions?|interpretation|general conditions|special conditions|contract conditions|documentation|submissions?|shop drawings|o ?& ?m|operation and maintenance|as[- ]?builts?|defects?|liquidated|security of payment|commercial(?=\s*$|\s+(?:terms|conditions|matters|information|requirements))|qualifications?|clarifications?|hold points?|inspection and test plans?|quality assurance|program(?:me)?|samples?|handover|maintenance|manufacture|storage|overview|introduction|background|project description|completion|witness\w*|levels? (?:of|for) testing|all (?:sub)?contracts|all trades)\b/i;
// Headings that bring the reader back to the work.
const WORK_HEADING = /\b(scope of works?|extent of (?:the )?works?|trade specific|specific inclusions|works? included|inclusions?|the works|work to be (?:done|carried out)|description of (?:the )?works?|specific (?:works|requirements)|trade works?|installation|supply and install|general scope|subcontract works)\b/i;

// A line that is not the subcontractor's site work.
const NOT_OURS = /\b(by others|by (?:the )?(?:builder|client|principal|head contractor|main contractor|contractor|electrician|plumber|other trades?)(?:'s)?\b(?! (?:sub)?contractor)|excluded|exclusions?|not included|not part of|n\.?i\.?c\b|supply only|supplied by (?:the )?(?:builder|client|others)|free issued?|builder (?:will|to) (?:supply|provide|install)|(?:client|builder) supplied)\b/i;
// Paperwork, money and meetings: no site work.
const PAPERWORK = /\b(shop drawings?|submit\w*|submissions?|certificat\w*|warrant\w*|manuals?|as[- ]?built|samples?|invoice\w*|payment|price\w*|pricing|rates?\b|cost\w*|insurance|meetings?|programme|schedule|retention|variation\w*|tender\w*|quotation|documentation|records?|registers?|reports?|approvals?|permits? fees?|nominat\w*|allowance|provisional sum|prime cost|liquidated|defects liability|ITPs?\b|inspection and test plans?|design\w*|engineer\w* (?:certif\w*|sign\w*)|fabricat\w* (?:off[- ]site|in the (?:shop|factory|workshop))|off[- ]site|train(?:ing)? (?:of |for )?(?:the )?(?:[\w-]+ ){0,3}(?:users?|staff|operators?|client|end users?|managers?|personnel)|(?:user|client|staff|operator) training)\b/i;
// Verbs for work done on site. A line naming only materials or a drawing is not work.
const SITE_WORK = /\b(install\w*|supply and install|erect\w*|dismantl\w*|fix\w*|lay(?:s|ing)?\b|construct\w*|demoli\w*|remov\w*|strip\w*|excavat\w*|trench\w*|backfill\w*|pour\w*|place(?:s|d)?\b|placing|cut(?:s|ting)?\b|core[- ]?drill\w*|coring|drill\w*|weld\w*|braz\w*|paint(?:s|ed|ing)?\b|apply|applied|application of|spray\w*|connect\w*|terminat\w*|test(?:s|ed|ing)?\b|commission\w*|seal(?:s|ed|ing)?\b|caulk\w*|grout\w*|tiling|hang(?:s|ing)?\b|set ?out|lift(?:s|ed|ing)?\b|hoist\w*|unload\w*|break(?:s|ing)? out|grind\w*|polish\w*|clean(?:s|ed|ing)?\b|torch\w*|screed\w*|render(?:s|ed|ing)?\b|sheet(?:ed|ing)\b|clad(?:ding)?\b|glaz(?:e|ed|ing)\b|pump(?:s|ed|ing)?\b|scaffold\w*|compact\w*|bolt(?:s|ed|ing)\b|anchor(?:s|ed|ing)\b|mount(?:s|ed|ing)\b|suspend\w*|penetrat\w*|isolat(?:e|es|ed|ing)\b|energis\w*|charg(?:e|ed|ing)\b|purg\w*|flush\w*|planting|mulch\w*|irrigat\w*|pav(?:e|ed|ing)\b|line ?mark\w*|rig(?:s|ged|ging)\b|dogg\w*|reinstat\w*|relocat\w*|pull(?:s|ed|ing)?\b|reticulat\w*|run(?:s|ning)? (?:the |all |new )?(?:cables?|pipes?|pipework|ducts?|ductwork|conduits?|services)|form(?:s|ed|ing)? (?:up|the|all)|tie(?:s|d)? (?:the |all )?(?:reo|reinforc\w*|bars?)|stress(?:ed|ing)\b|turf(?:ed|ing)\b|fill(?:ed|ing)?\b)\b/i;

// Not this trade's site work: drawing and document titles, and other subcontractors' work.
const NOT_WORK = /(\b(?:layout|sheet \d+|part \d+|drawing ____|document ____|specification\s*[-–:]|schedule\s*[-–:]|appendix\b|annexure\b|attachment\b)|\b(?!(?:the|this|our|each|a|any|all|such)\b)(?:\w+\/)?\w+ (?:sub)?contractors? (?:to|will|shall|is|are)\b|\bother (?:sub)?contractors?\b|\bpreliminar\w*|^comment by\b|\bnational code of practice\b|\bunderstood\b|^(?:all )?(?:labour|materials?|plant and equipment)\b(?! (?:hoist|lift))|^(?:section|document|clause|drawing) \d|\breproduction of\b|\bcopyright\b|\bbecomes? the property of\b|\bintellectual property\b|\bnot intended to (?:describe|be an? (?:exhaustive|complete))\b|\bin no way intended\b|\bfit for construction\b|\breserves? the right\b|\bunless noted otherwise\b|\b(?:is|are) to be (?:of )?(?:an? )?(?:class|grade|type) \w+ finish\b|^\W*\d*\.?\s*(?:screws|nails|bolts|fixings|fasteners)\b[^.]*\b(?:similar items|accessories|sundries)\b|\bcontain(?:s|ing)? no asbestos\b|\bban on the import\w* of\b|\basbestos[- ]free\b)/i;

// Quotes put the price at the end of each item, after leader dots, a dash or the
// quantity, unit and rate columns ("Precast pits (12 No.) set by crane .... $46,200").
const PRICE_TAIL = /(?:\s*(?:\.{3,}|…+|[-–=:]))?(?:\s+(?:\$\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?|t|kg|m|m2|m²|m3|m³|lm|l\/m|no\.?|nr|ea|each|items?|days?|hrs?|hours?|weeks?|ls|l\/s|lump sum|sum|\+|plus|gst|ex|excl?\.?|inc|incl?\.?))*\s*\$\s?\d[\d,]*(?:\.\d+)?\s*(?:\+?\s*(?:gst|ex\.? gst|excl?\.? gst|inc\.? gst|incl\.? gst))?\s*$/i;
// Quote lines that are terms, totals and rates rather than an item of work.
const QUOTE_TERMS = /^(?:excludes?|excluding|exclusions?|not included|rates?\b|schedule of rates|extra over|sub-?total|total|gst|price|quote\b|quotation|this (?:quote|quotation|price)|valid|validity|payment|progress claims?|terms|deposit)\b/i;

const MIN_WORDS = 4;

function words(line) {
  return line.split(/\s+/).filter(Boolean).length;
}

// Removes bullets, clause numbers and spare spaces from the start of a line.
function cleanLine(line) {
  return line
    .replace(/ /g, ' ')
    .replace(/^\s*(?:[•·▪◦‣○●■□\-–—*>]+|\(?[a-z]{1,3}\)|[a-z]\.(?=\s)|\(?[ivx]{1,5}[.)]|\d+(?:\.\d+)*\.?\)?)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// A bullet or lettered item ("· Roof frame", "(a) Ductwork", "b. Pipework") is never a heading.
function isBullet(raw) {
  return /^\s*(?:[•·▪◦‣○●■□\-–—*>]+|\(?[a-z]{1,3}\)|[a-z]\.|\(?[ivx]{1,5}\))\s+/i.test(raw);
}

// A short line with no full stop, often numbered or in capitals, starts a part of the scope.
function isHeading(raw, line) {
  if (!line || isBullet(raw) || words(line) > 10 || /[.;]$/.test(line)) return false;
  return /^\s*\d+(?:\.\d+)*\.?\s+\S/.test(raw) || line === line.toUpperCase() || /:$/.test(line) || words(line) <= 5;
}

function splitLines(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    // A long paragraph with several items separated by semicolons is several lines.
    .flatMap((raw) => (raw.length > 240 && raw.includes(';') ? raw.split(/;\s+/) : [raw]));
}

function isWork(line) {
  return SITE_WORK.test(line) || kindsOf(line).length > 0;
}

// Whether a line names a trade's own systems ("Wet pipe sprinkler protection", "Air
// handling units and fans"). A listed item under a work heading often has no verb.
function namesTrade(line) {
  const flags = workFlags(line);
  return TRADES.some((trade) => (trade.signal instanceof RegExp ? trade.signal.test(line) : Boolean(trade.signal && flags[trade.signal])));
}

// A line that only says the work must meet standards or codes.
const STANDARDS_ONLY = /^(?:all |the )?(?:works?|installations?|materials|workmanship|systems?|items?)\b[^.]{0,40}?\b(?:to be|shall be|must be|are to be|is to be|will be)\b[^.]{0,30}?\b(?:in accordance with|to comply with|compl\w* with|conform\w* (?:to|with)|to (?:the|a) (?:highest|high|best) (?:standard|quality))\b/i;
// Site rules and general duties, not a description of work: "It is a site requirement
// that no ...", "Provide any traffic control associated with their works".
const RULE = /^(?:it is an? (?:[\w-]+ ){0,3}requirement that\b|no (?:[\w-]+ ){1,3}(?:are|is|shall|may|will|to) (?:be )?\w+)|^(?:the )?(?:builder|principal|client|head contractor|main contractor|managing contractor|contractor|superintendent)(?:'s)? (?:has|have|will|is|are|shall|must|to)\b|\bunless there is no alternative\b|^(?:all|any) [^.]{0,60}\bmust (?:have|hold|only|be done)\b|\bmay only be (?:used|done|carried out)\b|\bany (?:required |necessary )?[\w/ -]{0,40}\bassociated with (?:their|its|the subcontract(?:or'?s)?) works?\b/i;
// The words of a line that describe its own work, for finding the kinds of work in it: a
// clause saying when ("once level 3 is poured"), exceptions and the trades it makes way for ("a clear
// deck for precast and reinforcement placement") name other work.
const MAKES_WAY = /\b(?:for|with) (?:the )?(?:[\w-]+,? (?:and |& )?){0,4}(?:placement|installation|fix(?:ing)?)\b|\bto allow (?:the )?following trades\b[^.;]*|\bexcept (?:where|for)\b[^.;]*|\(inc\.?[^)]*\)/gi;
function ownWork(line) {
  return line.replace(MAKES_WAY, ' ').replace(/\bonce [^,.;]*/gi, ' ').replace(/\s+/g, ' ');
}

// A sentence whose subject is another party ("The Contractor shall provide the benchmarks").
const OTHER_SUBJECT = /^(?:the )?(?:builder|principal|client|head contractor|main contractor|managing contractor|contractor|superintendent)(?:'s)? (?:has|have|will|is|are|shall|must|to)\b/i;
// Work left ready for the next trade ("supplied ready to be painted") is that trade's work.
const READY_FOR = /\bready (?:to be|for) (?:the )?\w+/i;
// Time clauses ("prior to concrete being poured") do not make a paperwork line site work.
const WHEN_CLAUSE = /\b(?:prior to|before|after|until|once|following|during)\b[^,.;]*/gi;
const PAPER_SITE_VERB = /\b(install\w*|erect\w*|lay\w*|fix(?:e[sd])?\b|fixing (?:of|to|the|all)\b|construct\w*|demoli\w*|excavat\w*|pour\w*|weld\w*|cut\w*|core[- ]drill\w*|lift\w*|rigg\w*)/i;

function paperworkOnly(line) {
  return PAPERWORK.test(line) && !PAPER_SITE_VERB.test(line.replace(WHEN_CLAUSE, ''));
}

// The part of a line that is the subcontractor's own work. A note in brackets or a
// sentence that leaves work to others ("(Fans and controls by others)", "Under flashings
// by the builder."), or that is only paperwork, is taken out and the rest is kept.
function ownPart(line) {
  const others = (text) => NOT_OURS.test(text) || READY_FOR.test(text) || OTHER_SUBJECT.test(text.trim());
  // A bare "(by others)" is about the whole line, so it stays and the line is left out.
  const text = line.replace(/\s*\([^()]*\)/g, (note) => (others(note) && /[a-z]{3,}/i.test(note.replace(NOT_OURS, '').replace(READY_FOR, '')) ? '' : note));
  // Sentences end at a full stop after a word, not after an abbreviation such as "No.".
  const sentences = text.split(/(?<=(?:[a-z]{2}|[)\d])[.;])\s+(?=[A-Z(])/);
  // A line that starts with others' work is not ours at all.
  if (sentences.length < 2 || others(sentences[0])) return text;
  return [sentences[0], ...sentences.slice(1).filter((sentence) => !others(sentence))].filter((sentence) => !paperworkOnly(sentence)).join(' ');
}

// Whether a line describes the subcontractor's own site work. A listed item counts
// when it names the trade's systems, even without a verb.
function keep(line, listed = false, short = false) {
  if (words(line) < (short ? 1 : MIN_WORDS)) return false;
  // Scopes often list the work without a verb ("Duct work including access panels"),
  // so a line that names a kind of work counts too.
  if (QUOTE_TERMS.test(line) || NOT_OURS.test(line) || READY_FOR.test(line) || NOT_WORK.test(line) || STANDARDS_ONLY.test(line) || RULE.test(line) || SUPPLY_ONLY.test(line)) return false;
  if (!isWork(line) && !(listed && namesTrade(line))) return false;
  // Mostly capitals is a title, not a description of work.
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length > 12 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6) return false;
  // A paperwork line is kept only if it also names work done on site.
  return !paperworkOnly(line);
}

// Interface matrices give each item a row with a mark ("X") under the party that does it.
// Rows marked for another party, and rows with no mark (group labels), are not our work;
// rows marked for the subcontractor are.
// Template rows still to be filled in ("<<Main Contractor / Subcontractor>>") are not ours either.
const MARK = /^[\s ]*(?:x|✓|✔)[\s ]*$/i;
const isBlankCell = (raw) => /^[\s ]*$/.test(raw) && /[\t ]/.test(raw);
const CHOICE = /^\s*<<[^>]*>>\s*$/;
const OTHER_PARTY = /\b(builder|principal|client|head contractor|main contractor|managing contractor|others?)\b/i;

function othersRows(raws) {
  const skip = new Set();
  const mine = new Set();
  let ours = 0;
  for (let i = 0; i < raws.length; i += 1) {
    const raw = raws[i];
    if (/^\s*responsib\w*\s*$/i.test(raw)) {
      // The parties are named in the cells after the heading; the first that is not
      // the builder or another party is the subcontractor's column.
      const names = raws.slice(i + 1, i + 8).filter((line) => line.trim() && !isBlankCell(line)).slice(0, 2);
      const index = names.findIndex((name) => !OTHER_PARTY.test(name));
      ours = index < 0 ? 0 : index;
      continue;
    }
    if (CHOICE.test(raw)) {
      skip.add(i);
      for (let j = i - 1; j >= Math.max(0, i - 3); j -= 1) {
        if (raws[j].trim()) {
          skip.add(j);
          break;
        }
      }
      continue;
    }
    if (!raw.trim() || MARK.test(raw) || isBlankCell(raw)) continue;
    const cells = [];
    for (let j = i + 1; j < raws.length && (MARK.test(raws[j]) || isBlankCell(raws[j])); j += 1) cells.push(MARK.test(raws[j]));
    if (cells.length < 2) continue;
    if (cells.indexOf(true) === ours) mine.add(i);
    else skip.add(i);
  }
  return { skip, mine };
}

// A line that leads into a list of items. A long lead-in of contract wording ("Document,
// fabricate, supply, deliver, install and certify the following items in accordance with
// ...:") says nothing of the work itself; each item under it is a line of its own.
const LIST_LEAD = /\b(?:the following|as follows|includ\w*|compris\w*|consist\w* of)\b/i;
const LONG_LEAD = 15;
// A rate or price in a list of items ("Day labour $____ per hour").
const RATE = /\$|\bper (?:hour|day|week|tonne|t|kg|m|m2|m²|m3|m³|square met\w*|lineal met\w*|linear met\w*|lm|item)\b|\b(?:agreed|schedule of) rates\b/i;
// Supplying, delivering or certifying is not site work in itself.
const HANDLING = /^(?:document|shop draw|design|fabricate|manufacture|supply|deliver|transport|unload|handle|hoist|certify|provide)$/i;
// "Supply only door grilles", "Supply all metal door frames": supplied, not installed.
const SUPPLY_ONLY = /^supply\b(?![^.]*\b(?:install|fix|lay|erect|plac|hang|fit|connect|commission)\w*)/i;

// The site work a lead-in of contract wording names, without the handling verbs:
// "Supply, deliver, hoist, install and certify the following items" gives "Install".
const LEAD_VERB = /^(?:install|erect|fix|lay|construct|place|connect|commission|test|hang|build|apply|fit)$/i;
// "The works include the supply and erection of formwork to the following" gives "Formwork to".
// A finite verb shows an item is a sentence of its own, not a name of the work.
// An item that starts with what is done ("Erect the safety screens", "Supply and install the columns").
const VERB_LED = /^(?:supply,? (?:and|&) |design,? )?(?:install|erect|fix|lay|construct|form|place|connect|commission|test|hang|build|apply|fit|strip|remove|cut|core|drill|weld|paint|seal|clean|provide and (?:install|fix))\w*\b/i;
// An item that already says what is done, or who does it, is not a name of the work.
const NAMES_WORK = /^(?:supply|provide|design|allow|the subcontractor|subcontractor|ensure)\b|\b(?:install\w*|erect\w*|strip(?:s|ped|ping)?|construct\w*|fix(?:es|ed|ing)?|demolish\w*|acknowledg\w*)\b/i;
const FINITE = /\b(?:is|are|was|were|will|shall|must|be|has|have|may|can)\b/i;
function leadPrefix(text) {
  const plain = text.replace(SUBJECT, '');
  const match = plain.match(/^((?:[a-z][a-z ]*?,\s*)*[a-z][a-z& ]*?)\s+(?=(?:the following|all|the)\b)/i);
  const verbs = match ? match[1].split(/\s*(?:,|&|\band\b)\s*/).map((verb) => verb.trim()).filter((verb) => LEAD_VERB.test(verb)) : [];
  const verb = verbs.map((word) => word.toLowerCase()).join(' and ');
  if (verb) return verb.charAt(0).toUpperCase() + verb.slice(1);
  const object = plain.match(/\b(?:supply|install\w*|erection|construction)\b[^.:]*?\bof ([a-z]+)(?: and (?:associated|related) items)? to the following\b/i);
  return object ? `${object[1].charAt(0).toUpperCase()}${object[1].slice(1).toLowerCase()} to` : '';
}

// The lines that describe the subcontractor's own site work. A short line that leads into
// a list ("Rigging of the structural steel for buildings 1 to 3:") is joined to its
// items ("Roof frame", "Window and door heads"), as the items alone do not say what the work is.
function readLines(text) {
  let out = false;
  let lead = null;
  const kept = [];
  // Items under a lead-in of the scope's own work, and matrix rows marked for the
  // subcontractor: whatever they mention, they are the scope's own trade's work.
  const owned = new Set();
  // Items in a list, which may name a system without saying which trade does it.
  const listedLines = new Set();
  const seen = new Set();
  // The heading of the part of the scope each line is in.
  const sections = new Map();
  let section = '';
  const add = (line, listed = false, own = false, short = false) => {
    const tidy = ownPart(line).trim().replace(/\.\s*\.$/, '.').replace(/[;,:\s-]+$/, '').replace(/([^.])$/, '$1.');
    // The same sentence repeated in another part of the scope is one line.
    const key = tidy.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!keep(tidy, listed, short) || seen.has(key)) return;
    seen.add(key);
    kept.push(tidy);
    sections.set(tidy, section);
    if (own) owned.add(tidy);
    if (listed) listedLines.add(tidy);
  };
  const flush = () => {
    // Items supplied only, and rates and prices, are not site work.
    const items = lead ? lead.items.filter((item) => !SUPPLY_ONLY.test(item) && !QUOTE_TERMS.test(item) && !RATE.test(item) && !paperworkOnly(item)) : [];
    if (lead && (items.length || !lead.split)) add(items.length ? `${lead.text.replace(/[:\s-]+$/, '')}: ${items.join(', ')}` : lead.text);
    lead = null;
  };
  // Items named under an exclusions heading ("CCTV", "Duress alarms").
  const excluded = [];
  let excluding = false;
  const raws = splitLines(text);
  const { skip, mine } = othersRows(raws);
  raws.forEach((raw, index) => {
    if (skip.has(index)) return;
    // A row of an interface matrix marked for the subcontractor is its work, wherever the matrix is.
    if (mine.has(index)) {
      flush();
      add(cleanLine(raw), true, true);
      return;
    }
    const full = cleanLine(raw);
    // A priced line is an item of work, never a heading. Its price is not part of the work.
    const priced = PRICE_TAIL.test(full);
    const line = priced ? full.replace(PRICE_TAIL, '').trim() : full;
    if (!line) return;
    if (lead && isBullet(raw) && (lead.split || words(line) <= 15)) {
      // Under a lead-in of contract wording, an item that says what the work is stands
      // on its own, and a bare name reads as the work the lead-in names ("Install the
      // refrigeration equipment", "Formwork to the suspended slabs").
      // A short item that the next item takes up ("Screens", then "Erect the safety screens
      // from level 3") is the heading of the items under it.
      const next = raws.slice(index + 1).find((later) => later.trim());
      const last = line.toLowerCase().replace(/[^a-z ]/g, '').split(' ').pop();
      if (lead.split && words(line) <= 2 && !SITE_WORK.test(line) && next && last.length > 3 && cleanLine(next).toLowerCase().includes(last)) section = line;
      else if (lead.split && words(line) >= MIN_WORDS && VERB_LED.test(line)) add(line, true, true);
      else if (lead.split && lead.prefix && !FINITE.test(line) && !NAMES_WORK.test(line) && !OTHER_SUBJECT.test(line) && !NOT_OURS.test(line) && !NOT_WORK.test(line)) add(`${lead.prefix} ${/^[A-Z][a-z]/.test(line) ? line.charAt(0).toLowerCase() + line.slice(1) : line}`, true, true, true);
      else if (lead.split && words(line) >= MIN_WORDS && (isWork(line) || namesTrade(line))) add(line, true, true);
      else if (lead.split && VERB_LED.test(line)) add(line, true, true, true);
      else lead.items.push(line.replace(/[.;,]+$/, ''));
      return;
    }
    // A lead-in of contract wording carries on over the headings of the parts of the work under it.
    if (lead && lead.split && !priced && isHeading(raw, line) && !OUT_HEADING.test(line)) {
      section = line.replace(/[:\s]+$/, '');
      return;
    }
    flush();
    const leadsList = /:\s*-?$/.test(line) || (/;\s*$/.test(line) && /\b(?:the following|as follows)\b/i.test(line));
    if (!out && leadsList && (isWork(line) || LIST_LEAD.test(line)) && !OUT_HEADING.test(line) && !NOT_OURS.test(line)) {
      const split = words(line) > LONG_LEAD && (OFF_SITE.test(line.replace(SUBJECT, '')) || /\bthe following\b/i.test(line));
      lead = { text: line, items: [], split, prefix: split ? leadPrefix(line) : '' };
      return;
    }
    if (!priced && isHeading(raw, line)) {
      section = line.replace(/[:\s]+$/, '');
      excluding = OUT_HEADING.test(line) && NOT_OURS.test(line);
      // A cell of a table ("Caulking" in a warranty table) can end the work, but does
      // not bring the reader back to it.
      if (OUT_HEADING.test(line)) out = true;
      else if (!/^\t/.test(raw) && (WORK_HEADING.test(line) || isWork(line))) out = false;
      return;
    }
    if (excluding && words(line) <= 8) excluded.push(line.toLowerCase().replace(/^supply (?:of )?/, '').replace(/[^a-z0-9 ]+/g, ' ').trim());
    // A listed or numbered item under a work heading may name the trade's systems without a verb.
    if (!out) add(line, isBullet(raw) || /^\s*\d+(?:\.\d+)*\.?\s+\S/.test(raw));
  });
  flush();
  // A short item that names something the exclusions list ("Install CCTV system") is not ours.
  const plain = (line) => ` ${line.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `;
  const ours = kept.filter((line) => words(line) > 8 || !excluded.some((item) => item && plain(line).includes(` ${item} `)));
  return { lines: ours, owned, listed: listedLines, sections };
}

function siteWorkLines(text) {
  return readLines(text).lines;
}

// The kinds of work with their own job steps, in the library's order.
const KINDS = ACTIVITIES.filter((activity) => activity.when && (activity.steps || []).length);
// Kinds that only add detail to another kind (a post-tensioned slab, a crane company's lifts)
// do not make a task of their own.
// Neither do incidental kinds that any trade does (power tools, moving materials,
// cleaning up, mixing): they are steps inside the trade's own tasks.
const DETAIL = new Set(['ptSlab', 'craneInterface', 'cite', 'ewp', 'mobileScaffold', 'forklift', 'carpentryWork', 'carpLoad', 'sitePlant', 'tileMix', 'masonryMortar', 'masonryGrout', 'wpRolls', 'glassHandling', 'glassWind', 'gasCylinders', 'neighbours', 'siteSheds', 'roofAccess', 'oxyCutting', 'silicaDrill', 'smallPlant', 'groundChemicals']);
// A kind found in fewer lines than this is a passing mention, unless it is high risk work.
const MIN_SUPPORT = 2;
// Kinds of work whose steps have a person falling from an edge, roof or platform,
// or through an opening. A task with one of them has a fall suggested.
const PERSON_FALL = /(?:\bperson |\bworkers? |^an? |^)(?:fall|falls|falling) (?:from (?!a ladder\b)|through\b|into (?:an? |the )?(?:open )?(?:riser|shaft|void|opening))/i;
const FALL_KINDS = new Set(KINDS.filter((kind) => kind.steps.some((step) => (step.hazards || []).some((line) => PERSON_FALL.test(typeof line === 'string' ? line : line.text)))).map((kind) => kind.when));
const CROSS = new Set(['demolition', 'servicesStrip', 'generatorTest', 'trench', 'coreDrill', 'sawCut', 'structuralOpening', 'asbestos', 'asbestosCheck', 'confined', 'roofSpace', 'power', 'road', 'water', 'liveHospital', 'stripOut', 'crane', 'towerCrane', 'scaffold']);
// A trade is the scope's trade when it is found in this share of the lines of the most found trade.
const TRADE_SHARE = 0.3;
// A scope usually names its trade at the top ("Scope of Works - Fire Services"). That trade
// is the scope's; another trade must then be found nearly as often to count as well.
const TITLE_SHARE = 0.6;
const TITLE_CHARS = 1500;
const TITLE_WORDS = {
  electrical: /\belectrical\b/i,
  communications: /\b(comms|communications|ict|data)\b/i,
  security: /\bsecurity\b/i,
  plumbing: /\b(hydraulics?|plumbing)\b/i,
  mechanical: /\b(mechanical|hvac|air[- ]conditioning)\b/i,
  fire: /\bfire (?:services|protection|sprinklers?)\b|\bsprinklers?\b/i,
  lifts: /\b(lifts?|elevators?)\b/i,
  facade: /\b(facade|curtain wall)\b/i,
  glazing: /\b(glazing|windows?|glass)\b/i,
  steel: /\bstructural steel\b/i,
  masonry: /\b(masonry|blockwork|brickwork)\b/i,
  plasterboard: /\b(ceilings?|partitions?|plasterboard|drywall)\b/i,
  carpentry: /\b(carpentry|joinery)\b/i,
  doors: /\b(doors|door hardware)\b/i,
  kitchens: /\b(commercial kitchens?|stainless)\b/i,
  tiling: /\btiling\b/i,
  stone: /\bstone\b/i,
  flooring: /\b(floor(?:ing)? coverings?|carpet|vinyl|flooring)\b/i,
  waterproofing: /\b(waterproof\w*|membranes?)\b/i,
  painting: /\bpainting\b/i,
  roofing: /\broofing\b/i,
  landscaping: /\blandscap\w*/i,
  piling: /\bpiling\b/i,
  structure: /\b(formwork|concrete|reinforc\w*|frp)\b/i,
  excavation: /\b(excavation|earthworks|civil)\b/i,
  scaffolding: /\bscaffold\w*/i,
  cleaning: /\bclean(?:ing|s)?\b/i,
  fencing: /\bfenc\w*/i,
};

const TITLE_LINES = 6;

// The document's own name for the work, such as "Commercial Kitchens & Stainless".
function documentTitle(text) {
  const lines = String(text || '').slice(0, TITLE_CHARS).split('\n').map((line) => line.trim()).filter(Boolean).slice(0, TITLE_LINES);
  const title = lines.find((line) => words(line) <= 8 && !/^(?:the project|scope of works?|schedule\b|revision\b|document\b)/i.test(line));
  return title ? title.replace(/\s*[-–]?\s*scope of works?\s*$/i, '').replace(/^\w/, (ch) => ch.toUpperCase()).replace(/\b([A-Z])([A-Z]+)\b/g, (_m, a, b) => a + b.toLowerCase()) : '';
}

function titleTrades(text) {
  const head = String(text || '').slice(0, TITLE_CHARS);
  const named = /\bscope of (?:the )?works?\b[^\n]{0,80}|\bcomprises? the [^\n]{0,80}/gi;
  // The document title is in its first few lines, often on a line of its own.
  // A line that excludes trades or leaves work to others names trades that are not ours.
  // A labelled package or trade line names ours, however long it is.
  const title = head.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, TITLE_LINES)
    .filter((line) => !NOT_OURS.test(line) && !/^(?:\d+(?:\.\d+)*\.?\s*)?(?:exclu\w*|by others|not included|not in scope|omitted|n\.?i\.?c\.?)\b/i.test(line))
    .map((line) => (/^(?:package|trade|subcontract|works? package|trade package)\s*:/i.test(line) ? line.replace(/\([^)]*\)/g, '').replace(/^[^:]*:\s*/, '') : line))
    .filter((line) => words(line) <= 8);
  const found = new Set();
  for (const match of [...title, ...(head.match(named) || [])]) {
    for (const [id, words] of Object.entries(TITLE_WORDS)) if (words.test(match)) found.add(id);
  }
  return found;
}
// Routine kinds of work are steps of the trade's main task, not SWMS of their own
// (a painter has one painting SWMS, not one for preparing and one for reaching ceilings).
// They join one task named after the trade. Other kinds, the distinct and riskier
// work such as formwork, roof work or painting outside at height, stay tasks of their own.
const ROUTINE = new Set([
  'fitOff', 'cablePull', 'plumbingFitOff', 'solventCement', 'pressureTest', 'hotWater', 'refrigerantTest', 'refrigerantCharge',
  'mechInsulation', 'mechCommissioning', 'securityDevices', 'ictCabling', 'carpFraming', 'carpJoinery', 'carpEdge', 'tileCut', 'tileLay',
  'masonryCut', 'masonryLay', 'plasterSheets', 'plasterHeight', 'plasterCeiling', 'plasterSanding', 'painting', 'paintAccess',
  'paintSolvent', 'floorAdhesive', 'floorLevel', 'floorLay', 'timberFloor', 'glazingSeal', 'glazingDrill', 'wpPrep', 'wpLiquid', 'wpEdge',
  'landscape', 'turf', 'paving', 'fenceBuild', 'cleaning', 'edgeBracket', 'facadeSeal', 'panelLoad', 'liftLifting', 'fireGrooving',
  'pileConcrete', 'pileTrim', 'steelWeld', 'houseFraming', 'deckBuild',
]);
// General wording that says nothing about the work itself. It stays in the lines found,
// but the task is written from the specific lines.
const GENERAL = /\b(scope of works? (?:generally )?(?:comprises?|includes?)|provide all (?:necessary )?(?:labour|materials)|all labour,? materials|complete the (?:entire|whole)|in accordance with the (?:drawings|specifications?|subcontract)|as (?:required|specified|noted) (?:in|by) the|but not limited to|the subcontractor (?:is deemed|has made provision|acknowledges))\b/i;
// "The Subcontractor shall paint ..." reads as "Paint ...".
const SUBJECT = /^(?:the )?subcontractor(?:'s)? (?:shall|is to|must|will|has allowed (?:for|to)|is required to|to)\s+(?:allow (?:for|to) )?/i;
// Task names for the kinds whose first job step does not name the work well.
const TITLES = Object.freeze({
  road: 'Traffic management', power: 'Work near overhead power lines', scaffold: 'Scaffolding', roof: 'Roof work', roofStrip: 'Removing old roofing',
  trench: 'Trenching and underground services', propping: 'Temporary works and propping', demolition: 'Demolition', crane: 'Crane lifts', towerCrane: 'Tower crane lifts',
  slabGround: 'Slabs on ground, paths and driveways', slabPour: 'Placing slabs on ground', formwork: 'Formwork and falsework', reo: 'Reinforcement', concrete: 'Concrete placing and finishing', precast: 'Precast installation',
  tempPower: 'Construction power and temporary lighting', castIn: 'Cast-in conduits', containment: 'Cable tray and containment at height',
  isolation: 'Terminations, testing and connection to supply', commissioning: 'Switchboards and mains', coreDrill: 'Core drilling and penetrations',
  sewerConnection: 'Connection to the live sewer', hydraulicRisers: 'Risers and pipework at height', hotWork: 'Brazing and soldering (hot work)',
  plantLift: 'Plant delivery and lifting', ductwork: 'Ductwork and mechanical units', roofPlant: 'Plant on the roof', commsRoom: 'Comms rooms, racks and UPS batteries',
  fibre: 'Optical fibre', generatorPlant: 'Generators and fuel systems', boilerPlant: 'Boilers and pressure vessels', fireLive: 'Work on live fire systems',
  fireAtHeight: 'Sprinkler and hydrant pipework at height', passiveFire: 'Fire stopping', paintExternal: 'External painting at height', paintSpray: 'Spray painting',
  tileEdge: 'Tiling near balcony and terrace edges', cleaningHeight: 'Window and balcony cleaning', panelInstall: 'Panel installation at the slab edge',
  sawCut: 'Saw cutting', asbestos: 'Asbestos removal', asbestosCheck: 'Asbestos check', confined: 'Confined space entry', roofSpace: 'Work in the roof space',
  floorGrind: 'Floor grinding', wpTorch: 'Torch-on membranes', stoneSilica: 'Cutting stone benchtops', steelErect: 'Steel erection at height',
  balustradeEdge: 'Balustrades at open edges', earthworks: 'Earthworks and compaction', water: 'Work in or near water', liftShaft: 'Work at open lift shafts', landscapeLift: 'Lifting soil and plants',
});
const MAX_LINES = 8;
const MAX_TASK = 900;

function kindsOf(line, flags = workFlags(line)) {
  return KINDS.filter((kind) => flags[kind.when] && !DETAIL.has(kind.when));
}

// "Shop draw, fabricate, supply, deliver, install and certify ..." keeps only the site work.
const OFF_SITE = /^(?:(?:document|shop draw|design|fabricate|manufacture|supply|deliver|transport|unload|handle|apply protective coating|complete their design & construct proposal),?\s*(?:&\s*|and\s+)?)+(?=\w)/i;

function taskLine(line) {
  const text = line.replace(SUBJECT, '').replace(OFF_SITE, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// "including but not limited to" is contract wording inside a line that names real work.
const notLimited = (line) => line.replace(/\b(including\s+)?but not limited to,?\s*/gi, '$1');

function taskText(found) {
  const cleaned = found.map(notLimited);
  const specific = cleaned.filter((line) => !GENERAL.test(line));
  const lines = [...new Set((specific.length ? specific : cleaned).map(taskLine))].slice(0, MAX_LINES);
  let text = '';
  for (const line of lines) {
    // A very long first line is cut at the last item that fits.
    if (!text && line.length > MAX_TASK) {
      text = `${line.slice(0, MAX_TASK).replace(/,[^,]*$/, '')}.`;
      break;
    }
    if ((text + ' ' + line).length > MAX_TASK) break;
    text = text ? `${text} ${line}` : line;
  }
  return text;
}

// High risk categories that a single line is enough to raise. Falls and mobile plant
// are mentioned in passing in most scopes, so they need more than one line.
// Matched by the item id, which is the same in every state (Victoria names its checks differently).
const STRONG = new Set(['demolition', 'asbestos', 'temporary', 'confined', 'explosives', 'gas', 'chemicalLine', 'electrical', 'atmosphere', 'precast', 'road', 'water', 'diving', 'tunnel', 'trench']);

function strongHighRisk(lines, state, when) {
  // Overhead lines are named in standard cabling clauses ("fixed to isolators in overhead lines").
  if (when === 'power') return false;
  return lines.some((line) => highRiskMatches(line, '', state).some((item) => STRONG.has(item.id)));
}

function tasksFromScope(text, stateId = 'qld') {
  const state = findState(stateId);
  const { lines, owned, listed, sections } = readLines(text);
  // A drawing or a scanned page gives almost no text to read.
  if (!lines.length && words(String(text || '')) < 40) {
    return { tasks: [], lines: 0, note: 'This file has almost no text SiteReady can read. It looks like a drawing or a scanned page. Attach the written scope of works or quote, or paste its text.' };
  }
  if (!lines.length) {
    return { tasks: [], lines: 0, note: 'No site work was found in this text. If it is a contract or a cover letter, attach the scope of works or quote on its own.' };
  }
  const groups = new Map();
  const tradeCount = new Map();
  const tradeLines = new Map();
  // The trades the scope names at the top.
  const titled = titleTrades(text);
  const titledKinds = new Set(TRADES.filter((trade) => titled.has(trade.id)).flatMap((trade) => trade.kinds));
  for (const line of lines) {
    const flags = workFlags(ownWork(line));
    const kinds = kindsOf(line, flags);
    for (const kind of kinds) {
      if (!groups.has(kind.when)) groups.set(kind.when, { kind, lines: [] });
      groups.get(kind.when).lines.push(line);
    }
    // A line of the named trade's own work that mentions another trade's materials ("mop
    // and polish the tiles" in a cleaning scope), or an item under a lead-in of its work,
    // does not show that other trade.
    const titledWork = owned.has(line) || kinds.some((kind) => titledKinds.has(kind.when));
    for (const trade of TRADES) {
      if (titled.size && !titled.has(trade.id) && titledWork) continue;
      const signal = trade.signal instanceof RegExp ? trade.signal.test(line) : Boolean(trade.signal && flags[trade.signal]);
      // A trade with its own signal is counted by that alone: its kinds of work are
      // found in passing in other trades' scopes (doors in a painting scope).
      if (trade.signal ? signal : kinds.some((kind) => trade.kinds.includes(kind.when))) {
        tradeCount.set(trade.id, (tradeCount.get(trade.id) || 0) + 1);
        if (!tradeLines.has(trade.id)) tradeLines.set(trade.id, []);
        tradeLines.get(trade.id).push(line);
      }
    }
    // An item under a lead-in of the scope's own work that shows no trade ("Install the
    // refrigeration equipment"), or a listed item that no trade of the scope took ("Fire
    // ring main and hydrants" in a hydraulic scope), is the named trade's work.
    const counted = [...tradeLines.values()].some((found) => found.includes(line));
    if (!kinds.length && (owned.has(line) || (listed.has(line) && !counted && namesTrade(line)))) {
      for (const id of titled) {
        if (!tradeLines.has(id)) tradeLines.set(id, []);
        if (!tradeLines.get(id).includes(line)) tradeLines.get(id).push(line);
      }
    }
  }
  // A scope with slab on ground work and no suspended slab: its formwork, reo, concrete
  // and saw cutting lines are all part of the slab on ground task.
  if (groups.has('slabGround') && groundSlabOnly(lines.join('\n'))) {
    const slab = groups.get('slabGround');
    for (const id of ['slabPour', 'formwork', 'reo', 'concrete', 'sawCut', 'propping']) {
      if (!groups.has(id)) continue;
      for (const line of groups.get(id).lines) if (!slab.lines.includes(line)) slab.lines.push(line);
      groups.delete(id);
    }
    // The lines that name the slabs come first, so the task says what is being poured.
    slab.lines.sort((a, b) => Number(groundSlabOnly(b)) - Number(groundSlabOnly(a)));
  } else if (groups.has('slabGround')) {
    // With suspended slabs too, a line already in the reo or concrete task is not repeated.
    const slab = groups.get('slabGround');
    slab.lines = slab.lines.filter((line) => !['reo', 'concrete', 'formwork'].some((id) => groups.has(id) && groups.get(id).lines.includes(line)));
    if (!slab.lines.length) groups.delete('slabGround');
  }
  // The scope's own trades, and the kinds of work they do.
  const count = (trade) => tradeCount.get(trade.id) || 0;
  const top = Math.max(0, ...tradeCount.values());
  const titleTop = Math.max(0, ...TRADES.filter((trade) => titled.has(trade.id)).map(count));
  const ours = TRADES.filter((trade) => titled.has(trade.id)
    || count(trade) >= Math.max(2, titled.size ? titleTop * TITLE_SHARE : top * TRADE_SHARE));
  const allowed = new Set(ours.flatMap((trade) => trade.kinds));
  const order = (when) => KINDS.findIndex((kind) => kind.when === when);
  const makeTask = (id, step, found, trades, groupKinds = []) => {
    const title = TITLES[id] || step;
    const task = taskText(found);
    const highRisk = highRiskMatches(task, '', state).map((item) => item.label);
    const kinds = [...new Set([...groupKinds, ...suggestedKinds(task, {}, { ownCrane: false, trades: tradeIds(trades.join(',')) })])];
    return {
      id,
      title,
      task,
      lines: found,
      highRisk,
      // The trades the task belongs to, so its SWMS uses only their job steps.
      trade: trades.join(','),
      // A fall is suggested where the work is at an edge, on a roof or at height; the user confirms it.
      fallRisk: highRisk.some((label) => /falling/i.test(label)) || /\b(slab edges?|edges?|roofs?|roofing|eaves|balcon\w*|scaffold\w*|ewps?|elevating work platforms?|boom lifts?|scissor lifts?|at height|voids?|risers?|shafts?|parapets?|ladders?|mezzanines?)\b/i.test(task) || kinds.some((kind) => FALL_KINDS.has(kind)) ? 'yes' : '',
      needsSwms: highRisk.length > 0,
      // The job steps to tick for this task when it is used.
      kinds,
    };
  };
  const tasks = [...groups.values()]
    // A short pasted scope may not show a trade; then every kind found in lines that say
    // what is done is kept (a description of the building names plant and rooms, not work).
    .filter((group) => allowed.has(group.kind.when)
      || (!ours.length && group.lines.filter((line) => SITE_WORK.test(line)).length >= MIN_SUPPORT)
      || (CROSS.has(group.kind.when) && (group.lines.length >= MIN_SUPPORT || strongHighRisk(group.lines, state, group.kind.when))))
    .sort((a, b) => order(a.kind.when) - order(b.kind.when))
    .filter((group) => !(ROUTINE.has(group.kind.when) && ours.some((trade) => trade.kinds.includes(group.kind.when))))
    .map(({ kind, lines: found }) => {
      const own = ours.filter((trade) => trade.kinds.includes(kind.when) || (trade.extra || []).includes(kind.when));
      return makeTask(kind.when, kind.steps[0].step, found, (own.length ? own : ours).map((trade) => trade.id), [kind.when]);
    });
  // Each trade's main task, named after the trade, holds its routine work and the lines
  // that name the trade's own systems but no kind of work ("Air handling units and fans").
  const position = (line) => lines.indexOf(line);
  for (const trade of ours) {
    const routine = [...groups.values()].filter((group) => ROUTINE.has(group.kind.when) && trade.kinds.includes(group.kind.when));
    // Only the scope's named trade takes these lines; another trade's are often passing mentions.
    const main = !titled.size || titled.has(trade.id);
    const own = main ? (tradeLines.get(trade.id) || []).filter((line) => !tasks.some((task) => task.lines.includes(line))) : [];
    const found = [...new Set([...routine.flatMap((group) => group.lines), ...(routine.length ? own : [])])].sort((a, b) => position(a) - position(b));
    if (found.length) tasks.push(makeTask(trade.id, trade.name, found, [trade.id], routine.map((group) => group.kind.when)));
  }
  // A trade of the scope with none of its routine work found still gets one task, from
  // the lines that show the trade and no other task used, so its work is not missed.
  for (const trade of ours) {
    if (tasks.some((task) => task.id === trade.id)) continue;
    const unused = lines.filter((line) => !tasks.some((task) => task.lines.includes(line)));
    // A trade named in the title but not found line by line takes the lines no other task used.
    const covered = tasks.some((task) => trade.kinds.includes(task.id));
    // The named trade with tasks of its own already takes only the lines no task used.
    const own = (tradeLines.get(trade.id) || []).filter((line) => unused.includes(line));
    const found = covered ? (!titled.size || titled.has(trade.id) ? own : []) : (tradeLines.get(trade.id) || (titled.has(trade.id) ? unused : []));
    if (found.length) tasks.push(makeTask(trade.id, trade.name, found, [trade.id]));
  }
  // Site work that matches no trade still makes one task, so the work is not lost. Only
  // lines that say what is done count: a description of the building that names rooms
  // and plant (a kitchen, a pool, a plant room) is not work.
  const doing = lines.filter((line) => SITE_WORK.test(line));
  if (!tasks.length && doing.length >= MIN_SUPPORT) tasks.push(makeTask('general', documentTitle(text) || 'Work in the scope', doing, []));
  const merged = mergeTasks(tasks)
    .flatMap((task) => splitBySection(task, sections, (found, part) => Object.assign(makeTask(task.id, task.title, found, task.trade.split(',').filter(Boolean), task.kinds), { title: `${task.title}: ${part}` })))
    // High risk construction work needs a SWMS by law, so it comes first.
    .sort((a, b) => Number(b.needsSwms) - Number(a.needsSwms));
  return {
    trades: ours.map((trade) => trade.id),
    tasks: merged,
    lines: lines.length,
    note: merged.length ? '' : 'Site work was found, but none matched a kind of work SiteReady drafts. Write the task in the form instead.',
  };
}

// A task with very many lines is the whole job, not one piece of work: it is split into the
// parts of the scope its lines come from ("Basement", "Commercial tower", "Safety screens").
// A part with only a few lines joins the largest part.
const SPLIT_AT = 25;
const MIN_PART = 4;
function splitBySection(task, sections, rebuild) {
  if (task.lines.length <= SPLIT_AT || TRADES.some((trade) => trade.id === task.id)) return [task];
  const parts = new Map();
  for (const line of task.lines) {
    const part = sections.get(line) || '';
    if (!parts.has(part)) parts.set(part, []);
    parts.get(part).push(line);
  }
  const big = [...parts.entries()].filter(([part, found]) => part && found.length >= MIN_PART).sort((a, b) => b[1].length - a[1].length);
  if (big.length < 2) return [task];
  for (const [part, found] of parts) if (!big.some(([name]) => name === part)) big[0][1].push(...found);
  const name = (part) => part.replace(/^[\d.\s]+/, '').replace(/\b([A-Z])([A-Z]+)\b/g, (_m, a, b) => a + b.toLowerCase()).replace(/\s+/g, ' ').trim();
  return big.map(([part, found]) => rebuild(found.sort((a, b) => task.lines.indexOf(a) - task.lines.indexOf(b)), name(part)));
}

// A task made from the same lines as another is the same work. So is a task made from
// some of the lines of another kind of work's task whose job steps already cover it
// ("Saw cutting" from the flashings line of the roof task). It joins that task (the first,
// when they have the same lines), which takes on its kinds of work and trades, so the
// user gets one SWMS for it, not two. Distinct work kept apart from a trade's main task
// (external painting at height beside the painting task) stays apart.
function mergeTasks(tasks) {
  const tradeTask = (task) => TRADES.some((trade) => trade.id === task.id);
  // A line of several clauses ("bulk earthworks; trenches; pits set by crane") can hold
  // separate pieces of work, so tasks found only in it stay apart.
  const clauses = (task) => task.lines.length === 1 && (task.lines[0].match(/;/g) || []).length >= 2;
  const within = (a, b) => a.lines.every((line) => b.lines.includes(line)) && !clauses(a)
    && (a.lines.length === b.lines.length || (!tradeTask(b) && b.kinds.includes(a.id)));
  const union = (x, y) => [...new Set([...x, ...y])];
  const join = (host, other) => {
    host.kinds = union(host.kinds, other.kinds);
    host.trade = union(host.trade.split(',').filter(Boolean), other.trade.split(',').filter(Boolean)).join(',');
    host.highRisk = union(host.highRisk, other.highRisk);
    host.needsSwms = host.highRisk.length > 0;
    if (other.fallRisk === 'yes') host.fallRisk = 'yes';
  };
  const atHeight = (task) => /\bat height\b/i.test(task.title);
  const out = [];
  for (const task of tasks) {
    const host = out.find((other) => within(task, other));
    // Of two tasks with the same lines, the one for work at height names the work better
    // ("Steel erection at height" over "Lift and land steel"), so it takes the other's place.
    if (host && host.lines.length === task.lines.length && atHeight(task) && !atHeight(host)) {
      join(task, host);
      out[out.indexOf(host)] = task;
      continue;
    }
    if (host) {
      join(host, task);
      continue;
    }
    const smaller = out.filter((other) => within(other, task));
    for (const other of smaller) join(task, other);
    out.splice(smaller.length ? out.indexOf(smaller[0]) : out.length, 0, task);
    for (const other of smaller) out.splice(out.indexOf(other), 1);
  }
  return out;
}

module.exports = { tasksFromScope, siteWorkLines, TITLES };
