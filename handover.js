// What a subcontractor is given from the main contractor's reading of its scope (Goal 12 stage 4,
// plan section C): the work, never the prices. Three guards stand between a scope and anyone else:
//   1. the brief already tells the AI to leave out rates, prices and payment lines (ai-brief.js);
//   2. a project reading is scrubbed of every price, rate and amount before it is kept (scrubReading),
//      so a price the AI quoted anyway is never stored, not even for the main contractor;
//   3. the list each subcontractor is given holds only the fields below (listItems), scrubbed again.
// The main contractor's lead sees "What the subcontractor sees" (subcontractorView) before anything
// is sent, built by the same code that will send it.
//
// Quotes from the scope are cut sentence by sentence: a sentence that names money or a commercial term
// (price, rate, lump sum, GST, retention, payment, variation, cost and the like) is dropped. The
// AI's own short words (activity names, places, plant, package names) are cut part by part, on money
// and the plainly commercial words only, so "Test the flow rates" is still work.
const scopeChoice = require('./public/scope-choice');
const { hrcwSummary } = require('./public/scope-hrcw');

// An amount of money: a dollar sign, a currency code before digits or a blank to fill in ("$____"), dollars
// after digits, a percentage of a commercial sum, or a sum with cents per hour, day, week or unit.
const MONEY = new RegExp([
  // Any dollar sign, with the amount after it, or "TBA" or a blank where the amount goes.
  String.raw`(?:\bA(?:U)?)?\$\s*(?:[\d_][\d,_]*(?:\.\d+)?(?:\s?(?:k|m|mil|million)\b)?|\.\d+|tb[acd]\b|poa\b)?(?:\s*(?:\/|per\s+)(?:hr|hour|day|wk|week|month|m2|m²|m3|m³|lm|m|unit|item|each|ea)\b)?`,
  String.raw`\b(?:AUD|USD|NZD)\s*(?:[\d_][\d,_]*(?:\.\d+)?|\.\d+)`,
  String.raw`\b\d[\d,]*(?:\.\d+)?\s*(?:dollars?|aud|cents?)\b`,
  String.raw`\b\d+(?:\.\d+)?\s*%\s*(?:\+\s*)?(?:retention|margin|mark-?up|admin\w*|profit|overheads?|of (?:the )?(?:(?:sub)?contract|tender) (?:sum|price|value))`,
  String.raw`\b\d[\d,]*\.\d{2}\s*(?:\/|per\s+)(?:hr|hour|day|wk|week|month|m2|m²|m3|m³|lm|m|unit|item|each|ea)\b`,
  // A sum laid out as money in a price table: "45,600.00" or "45600.00", not a size ("1,200.00 mm").
  String.raw`\b(?:\d{1,3}(?:,\d{3})+|\d{4,})\.\d{2}\b(?!\s*(?:mm|cm|m|km|kg|t|kn|kpa|mpa|l|m2|m²|m3|m³)\b)`,
  String.raw`\b(?:hourly|daily|weekly|labour|labor|day|charge[- ]?out|schedule of)\s+rates?\b`,
].join('|'), 'i');

// Commercial words that are never work, used on the AI's own short words.
const COMMERCIAL_STRICT = /\b(?:prices?|priced|pricing|lump[- ]?sums?|provisional sums?|prime cost|pc sums?|gst|retentions?|invoic\w*|payments?|liquidated damages|margins?|mark-?ups?|back[- ]?charg\w*|tender (?:sum|price|value)|(?:sub)?contract (?:sum|price|value)|progress claims?|payment claims?|day ?labou?r|billable|billed)\b/i;
// More commercial words, used on sentences quoted from the scope: a quote is only there to show
// where the work came from, so a doubtful sentence is dropped rather than kept.
const COMMERCIAL_QUOTE = new RegExp(`${COMMERCIAL_STRICT.source}|\\b(?:rates?(?!\\s+of\\s+rise)|costs?|costing|costed|variations?|claims?|fees?|charged|charges?\\s+(?:to|for)|reimburs\\w*|excl\\.?|incl\\.?|exclusive of|inclusive of|paid|payable|tender(?:ed)?|quotation|quoted|budget\\w*|allowances?|discount\\w*)\\b`, 'i');

// The AI's own short words also lose a part about costs, variations, fees, charges or claims, which
// never describe work.
const COMMERCIAL_WORDS = new RegExp(`${COMMERCIAL_STRICT.source}|\\b(?:costs?|costing|costed|variations?|fees?|charges?\\s+(?:to|for)|charged|claims?|reimburs\\w*|paid|payable|budget\\w*)\\b`, 'i');

const hasMoney = (text) => MONEY.test(String(text || ''));
// Whether text holds a price, a rate or an amount, or a plainly commercial term.
const hasPrice = (text) => hasMoney(text) || COMMERCIAL_STRICT.test(String(text || ''));
const quotePriced = (text) => hasMoney(text) || COMMERCIAL_QUOTE.test(String(text || ''));

const tidy = (text) => String(text || '').replace(/\s+/g, ' ').replace(/\(\s*\)/g, '').replace(/\s+([,.;:])/g, '$1').replace(/^[\s,;:.–-]+|[\s,;:–-]+$/g, '').trim();

// A quote with each priced sentence taken out ('' when none is left).
function quoteWithoutPrices(text) {
  const sentences = String(text || '').split(/(?<=[.;!?])\s+|\n+/);
  return tidy(sentences.filter((sentence) => !quotePriced(sentence)).join(' '));
}

// The AI's own short words with each priced part taken out: brackets first, then the parts between
// commas, semicolons and dashes ('' when none is left).
const wordsPriced = (text) => hasMoney(text) || COMMERCIAL_WORDS.test(String(text || ''));
const FILLER_WORDS = new Set('a an the and or of on at for to in by with each per plus any all is are be will shall apply applies applied as from this that its it'.split(' '));
function wordsWithoutPrices(text) {
  let out = String(text || '');
  if (!wordsPriced(out)) return out;
  out = out.replace(/\s*\(([^()]*)\)/g, (whole, inside) => (wordsPriced(inside) ? '' : whole));
  const parts = out.split(/(\s*;\s*|,(?!\d)\s*|\s+[–-]\s+)/);
  const kept = [];
  for (let i = 0; i < parts.length; i += 2) {
    if (!wordsPriced(parts[i])) kept.push(kept.length ? `${parts[i - 1] || ', '}${parts[i]}` : parts[i]);
  }
  if (tidy(kept.join(''))) return tidy(kept.join(''));
  // When every part names a price, the work is kept with the money taken out of it ("Install the
  // ductwork for $45,000 lump sum"), unless what is left is still commercial or says no work.
  const left = stripPrices(out);
  const content = (left.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []).filter((word) => !FILLER_WORDS.has(word));
  return content.length >= 2 && !wordsPriced(left) && !COMMERCIAL_QUOTE.test(left) ? left : '';
}

// Money and commercial words taken out of a phrase, leaving its other words.
function stripPrices(text) {
  return tidy(String(text || '').replace(/\b(?:at|for|with)\s+no\s+(?:extra\s+|additional\s+)?(?:cost|charge)\b(?:\s+to\s+(?:the\s+)?[\w']+)?/gi, ' ')
    .replace(/\bat\s+(?:the\s+)?(?:sub)?contractor'?s?\s+(?:own\s+)?(?:cost|expense)\b/gi, ' ').replace(new RegExp(MONEY.source, 'gi'), ' ').replace(new RegExp(COMMERCIAL_WORDS.source, 'gi'), ' ')
    .replace(/[$]\S*/g, ' ').replace(/\s+(?:for|at|of|with|in|to|and|on|by|plus|incl|excl)\s*$/i, ''));
}

// A name the rest of the reading points at (a package's name) keeps its place: only the money and
// commercial words come out of it, the same way wherever the name appears.
function nameWithoutPrices(text) {
  const value = String(text || '');
  if (!wordsPriced(value)) return value;
  return stripPrices(value) || 'Work package';
}

const quotes = (list) => (Array.isArray(list) ? list : []).map(quoteWithoutPrices).filter(Boolean);

// The reading with every price, rate and amount taken out, before it is kept for a project. The
// checks against the brief are made on the reading as the AI gave it, then scrubbed the same way.
function scrubReading(reading) {
  if (!reading || typeof reading !== 'object') return reading;
  const activities = (reading.activities || []).map((row) => ({
    ...row,
    activity: wordsWithoutPrices(row.activity),
    package: nameWithoutPrices(row.package),
    crew: wordsWithoutPrices(row.crew),
    clause: wordsWithoutPrices(row.clause),
    quotes: quotes(row.quotes),
    where: wordsWithoutPrices(row.where),
    plant: wordsWithoutPrices(row.plant),
    conditions: wordsWithoutPrices(row.conditions),
    unknowns: quoteWithoutPrices(row.unknowns),
    matrixColumn: wordsWithoutPrices(row.matrixColumn),
  })).filter((row) => row.activity);
  return {
    ...reading,
    activities,
    byOthers: (reading.byOthers || []).map((row) => ({ ...row, work: wordsWithoutPrices(row.work), party: wordsWithoutPrices(row.party), clause: wordsWithoutPrices(row.clause), quotes: quotes(row.quotes) })).filter((row) => row.work),
    conflicts: (reading.conflicts || []).map((row) => ({ ...row, clauseA: wordsWithoutPrices(row.clauseA), clauseB: wordsWithoutPrices(row.clauseB), quoteA: quoteWithoutPrices(row.quoteA), quoteB: quoteWithoutPrices(row.quoteB), why: quoteWithoutPrices(row.why) }))
      .filter((row) => row.quoteA && row.quoteB),
    packages: (reading.packages || []).map((item) => ({
      ...item,
      package: nameWithoutPrices(item.package),
      unmatched: (item.unmatched || []).map(wordsWithoutPrices).filter(Boolean),
      byOthers: (item.byOthers || []).map((entry) => ({ ...entry, party: wordsWithoutPrices(entry.party), clause: wordsWithoutPrices(entry.clause), says: quoteWithoutPrices(entry.says) })),
    })),
  };
}

// The checks keep the quotes they could not find; those are scrubbed too.
function scrubChecks(checks) {
  if (!checks || typeof checks !== 'object') return checks;
  const list = (items) => (items || []).map((item) => ({ ...item, where: wordsWithoutPrices(item.where), quote: quoteWithoutPrices(item.quote) }));
  return {
    ...checks,
    quotesNotFound: list(checks.quotesNotFound),
    quotesShortened: list(checks.quotesShortened),
    otherPackages: (checks.otherPackages || []).map(nameWithoutPrices),
    rowsWithoutQuote: (checks.rowsWithoutQuote || []).map(wordsWithoutPrices).filter(Boolean),
    packagesWithoutSteps: (checks.packagesWithoutSteps || []).map(nameWithoutPrices),
  };
}

// ---- The list for one subcontract ----

// Only these fields go with each SWMS on the list: the package title, the plain task (D251), the job
// step groups, the steps the scope gives to others, the work with no steps, the fall and crane hints,
// the site conditions and plant, and for each activity its clause and the quote sentences without
// prices. Never the conflicts, the responsibility matrix column, the crew, the points to confirm
// (unless answered, below) or the document.
function itemFields(item, pack, flag) {
  const clean = (value) => wordsWithoutPrices(value);
  return {
    title: nameWithoutPrices(item.title),
    task: clean(item.task),
    scopeTask: { plain: clean(item.scopeTask && item.scopeTask.plain), full: clean(item.scopeTask && item.scopeTask.full), notes: clean(item.scopeTask && item.scopeTask.notes) },
    site: Object.fromEntries(Object.entries(item.site || {}).map(([key, value]) => [key, clean(value)]).filter(([, value]) => value)),
    plant: (item.plant || []).map(clean).filter(Boolean),
    pick: item.pick || null,
    kinds: item.kinds || null,
    leaveOut: item.leaveOut || null,
    unmatched: item.unmatched ? item.unmatched.map(clean).filter(Boolean) : null,
    fallRisk: item.fallRisk || '',
    fallHint: item.fallHint || '',
    crane: '',
    slinging: '',
    highRisk: flag ? hrcwSummary(flag) : null,
    offSite: Boolean(flag && flag.offSite),
    activities: pack.rows.map((row) => ({ activity: clean(row.activity), clause: clean(row.clause), where: clean(row.where), quotes: quotes(row.quotes) })).filter((row) => row.activity),
    // The scope's open notes on this work that are not about who does or supplies what (D307): kept for
    // the subcontractor's draft, not asked of the lead and not shown to the subcontractor here.
    draftNotes: draftNotes(pack.rows),
  };
}

// Work a trade does as part of its main work, not as a SWMS of its own (messy round 6: one mechanical
// scope gave 12 SWMS): its own housekeeping and waste, handling its own materials, and the general
// access equipment it uses (ladders, mobile scaffolds, EWPs). Each folds into the trade's main SWMS,
// unless it carries high risk construction work of its own.
const SUPPORT = [
  ['housekeeping', /\b(?:housekeeping|clean[- ]?ups?|(?:site|trade) clean\w*|cleaning and waste|waste|rubbish)\b/i],
  ['handling', /\bmaterials? handling\b|\b(?:handling|deliveries) (?:and|&) (?:storage|deliveries|handling)\b|^deliveries\b/i],
  ['access', /^(?:general |task[- ]specific |trade )?access (?:equipment|and (?:scaffold\w*|equipment))\b/i],
];
const supportKind = (name) => (SUPPORT.find(([, test]) => test.test(String(name || ''))) || [''])[0];
// Maintenance in the defects period: done after the work is handed over, when the site may be
// occupied, so its SWMS is asked for when that work is booked.
const DEFECTS = /\bdefects? (?:liability )?period\b|\bdefects liability\b|\bDLP\b|\bmaintenance period\b/i;
const MAINTENANCE = /\b(?:maint\w*|servicing|warranty)\b/i;
function defectsOnly(pack) {
  const words = (row) => `${row.activity || ''} ${(row.quotes || []).join(' ')}`;
  return MAINTENANCE.test(pack.name) && pack.rows.every((row) => DEFECTS.test(words(row)) || MAINTENANCE.test(row.activity));
}
// High risk work the package's own words carry: a category that is not only likely.
const ownHighRisk = (flag) => ((flag && flag.categories) || []).some((item) => !item.likely);

// "Moving powered mobile plant" comes from the step groups matched to a package. Where the package's
// own words never move, lift or drive anything (messy round 6: "acoustic and vibration separation
// between major plant" was said to need a SWMS by law for it), it may be, not is: the SWMS questions
// confirm it.
const MOVING = /\b(?:cran(?:e|es|age)|forklifts?|telehandlers?|ewps?|elevating work platforms?|scissor lifts?|boom lifts?|excavators?|bobcats?|skid steers?|loaders?|trucks?|utes?|hiabs?|franna|mobile plant|vehicles?|rollers?|graders?|dozers?|tippers?|dumpers?|lift(?:s|ed|ing)?|hoist\w*|deliver\w*|unload\w*|pallet jacks?|skates?|rigg\w*|tow\w*|piling rigs?|concrete pumps?|traffic)\b/i;
function plantFromWords(flag, words) {
  if (!flag || !(flag.categories || []).some((item) => item.id === 'plant') || MOVING.test(String(words || ''))) return flag;
  const plant = flag.categories.find((item) => item.id === 'plant');
  return {
    ...flag,
    categories: flag.categories.filter((item) => item.id !== 'plant'),
    dependsOn: [...(flag.dependsOn || []).filter((item) => item.id !== 'plant'), { id: 'plant', short: plant.short, on: 'whether powered mobile plant moves where the work is done' }],
  };
}
// The package's own words: each activity, its plant, where it is done and its conditions.
const packWords = (pack) => pack.rows.map((row) => `${row.activity || ''} ${row.plant || ''} ${row.where || ''} ${row.conditions || ''}`).join(' ');

// The SWMS a reading lists for a subcontract, as the main contractor first sees them. Goal 12: it is
// the list, with no second guessing, so only work the subcontractor must give a SWMS for is on it
// to start with. The rest each come with why, and the lead can put any back:
//   - work done only off site, and cranage the scope does not give this subcontractor (owner
//     testing, 13 October 2026, item 9) start removed;
//   - maintenance in the defects period starts removed;
//   - the trade's own housekeeping, materials handling and access equipment fold into its main SWMS;
//   - work the reading finds no high risk construction work in ("may not need a SWMS by law") is set
//     aside in its own group (removedWhy 'noLaw'), for the lead to move onto the list if needed.
function listItems(reading) {
  const safe = scrubReading(reading);
  const { work } = scopeChoice.packagesOf(safe);
  const flags = new Map((safe.highRisk || []).map((item) => [item.package, item]));
  const craneClause = scopeChoice.craneClause(safe);
  const items = scopeChoice.projectItems(safe, work.map((pack) => pack.name));
  const out = items.map((item, index) => {
    const pack = work[index];
    const flag = plantFromWords(flags.get(pack.name), `${pack.name} ${packWords(pack)}`);
    let removedWhy = '';
    if (flag && flag.offSite) removedWhy = 'offSite';
    else if (scopeChoice.isCranage(pack.name) && !craneClause) removedWhy = 'cranage';
    else if (defectsOnly(pack)) removedWhy = 'defects';
    return { package: pack.name, removedWhy, support: supportKind(pack.name), ownHighRisk: ownHighRisk(flag), ...itemFields(item, pack, flag) };
  });
  // The trade's main SWMS: the package with the most work in it that is not support work, and not
  // testing, set-up or making good, when there is one. Support work folds into it, and goes where it
  // goes: set aside with it, or onto the list when the lead moves it there.
  const SECONDARY = /\b(?:testing|commissioning|demolition|strip[- ]?out|set[- ]?up|establishment|protection|making good|penetrations?|core drilling)\b/i;
  const main = out.filter((item) => !item.removedWhy && !item.support)
    .sort((a, b) => (SECONDARY.test(a.package) ? 1 : 0) - (SECONDARY.test(b.package) ? 1 : 0) || b.activities.length - a.activities.length)[0];
  for (const item of out) {
    if (!item.removedWhy && main && item.support && !item.ownHighRisk) {
      item.removedWhy = 'folded';
      item.foldedInto = main.package;
    } else if (!item.removedWhy && item.highRisk && item.highRisk.status === 'none') item.removedWhy = 'noLaw';
  }
  return out.map(({ support, ownHighRisk: own, ...item }) => item);
}

// Why a SWMS is not on the list to start with, as the lead reads it. 'folded' names the SWMS it is in.
const REMOVED_WHY = {
  offSite: 'Removed to start with: all of this work is done off site, so it needs no SWMS on site.',
  cranage: 'Removed to start with: the scope does not say this subcontractor supplies the cranage. Put it back if they need a cranage SWMS.',
  defects: 'Removed to start with: this is maintenance in the defects period, after the work is handed over. Put it back, or ask for its SWMS when that work is booked.',
  noLaw: 'No high risk construction work was found in it, so the law may not need a SWMS for it. Move it to the list if you need one.',
};
const foldedWhy = (title) => `Part of ${title} to start with: the subcontractor's own work of this kind goes in that SWMS. Put it back to ask for a SWMS of its own.`;

// What the lead's own words say about high risk work, by the same rules the scope reading uses
// (ai-scope.js packageHighRisk): the SWMS's own rules read the task, with the package's step groups
// when it has them and without them, so words the lead adds count ("working from mobile scaffolds",
// "a 60 t mobile crane"). Returned in the list's words (hrcwSummary), or null when the rules are
// not loaded.
function highRiskOf(task, state, item = {}) {
  const { screenHighRisk } = require('./draft');
  const input = { state: state || 'qld', task: String(task || ''), leaveOut: (item && item.leaveOut) || [] };
  const own = screenHighRisk({ ...input, kinds: null });
  const grouped = item && Array.isArray(item.kinds) && item.kinds.length ? screenHighRisk({ ...input, kinds: item.kinds }) : { categories: [], dependsOn: [] };
  const categories = [...own.categories];
  for (const extra of grouped.categories) if (!categories.some((one) => one.id === extra.id)) categories.push(extra);
  const dependsOn = [...own.dependsOn, ...grouped.dependsOn].filter((one, i, all) => !categories.some((c) => c.id === one.id) && all.findIndex((other) => other.id === one.id) === i);
  return hrcwSummary(plantFromWords({ categories, dependsOn }, task));
}

// Clause references once each: "Description of Work Area, Description of Work Area" reads once, and
// "Installation 6, 10" and "Installation 6" read "Installation 6, 10".
function clauseList(list) {
  const out = [];
  let prefix = '';
  for (const entry of list || []) {
    for (const raw of String(entry || '').split(/\s*[;,]\s*/)) {
      const part = raw.trim();
      if (!part) continue;
      const named = /^(.*?)\s*(\d[\w.]*)$/.exec(part);
      if (named && named[1]) prefix = named[1];
      const key = (named && !named[1] && prefix ? `${prefix} ${part}` : part).toLowerCase();
      if (out.some((one) => one.key === key)) continue;
      out.push({ key, text: part });
    }
  }
  return out.map((one) => one.text).slice(0, 12);
}

// A point starts with a capital letter (messy round 6: "confirm who supplies the AC equipment").
function sentence(text) {
  const value = tidy(text);
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

// Words that make an open point about who does the work or who supplies what (messy round 6 decision 6,
// D307): who, by whom, the builder or the subcontractor, supplied, provided, included, in the scope. A
// power, water or gas "supply" is a service, not who supplies it.
const WHO_SUPPLIES = /\b(?:who|whom|whose|by others|(?:the |this |that )?(?:builder|client|principal(?: contractor)?|head contractor|main contractor|contractor)(?:['’]s)?|(?:the |this |that )?sub-?contractors?(?!['’])|(?<!\b(?:power|energised|live|mains|water|gas|air|electricity|electrical|temporary) )suppl(?:y|ies|ied|ier|iers)(?!\s+(?:is|are|was|were)\s+(?:energised|live|isolated|on|off|dead|available|connected)\b)|(?<!\b(?:not|to be|yet to be|not yet) )provid\w*|furnish\w*|responsib\w*|free[- ]issue\w*|in (?:the |this |base )?scope|(?:base|subcontract|sub-contract) scope|scope (?:in|of (?:this|the) (?:sub-?)?contract)|out of scope|not itemised|includ(?:ed|es)|exclud(?:ed|es))\b/i;
// An open point split in two: the parts about who does or supplies what, asked of the lead, and the
// other notes (a height, a weight, a product), which are for the subcontractor's own draft instead.
// The AI's point lists its parts with semicolons, and sometimes commas: a comma list is split only
// where it does not start with the question about who.
// Text split at a separator, but not inside brackets ("Lifting method (cranage excluded; see 4.2)").
function splitOutside(text, separator) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') depth = Math.max(0, depth - 1);
    else if (!depth && text.startsWith(separator, i)) { out.push(text.slice(start, i)); start = i + separator.length; }
  }
  out.push(text.slice(start));
  return out.map((one) => tidy(one)).filter(Boolean);
}
// What a part asks about, without its bracketed asides: "Lifting method (cranage excluded)" asks about the
// lifting method, not about who supplies the crane.
const asksWho = (part) => WHO_SUPPLIES.test(String(part).replace(/\([^()]*\)/g, ' '));
function splitPoint(text) {
  const asks = [];
  const notes = [];
  for (const part of splitOutside(String(text || ''), ';')) {
    if (!asksWho(part)) { notes.push(part); continue; }
    const pieces = splitOutside(part, ', ').map((one) => one.replace(/^and\s+/i, ''));
    if (pieces.length < 2 || asksWho(pieces[0])) { asks.push(part); continue; }
    for (const piece of pieces) (asksWho(piece) ? asks : notes).push(piece);
  }
  return { asks, notes };
}
// The notes for the subcontractor's draft of a SWMS: the open points of its work that are not about who
// does or supplies what, once each, for stage 6 to put on the draft.
function draftNotes(rows) {
  const out = [];
  for (const row of rows || []) {
    for (const note of splitPoint(wordsWithoutPrices(row.unknowns)).notes.map(sentence)) if (note && !out.includes(note)) out.push(note);
  }
  return out.slice(0, 20);
}

// The points the scope leaves open about who does the work or what the main contractor provides
// (the brief's "Unknowns"), one for each activity that has one. The lead may answer them; only the
// answered ones go to the subcontractor (D302, K12). Only the parts about who does or supplies what are
// asked (D307): the rest are notes for the subcontractor's draft (draftNotes).
function listPoints(reading) {
  const safe = scrubReading(reading);
  const out = [];
  for (const row of safe.activities || []) {
    const question = sentence(splitPoint(row.unknowns).asks.join('; '));
    if (!question) continue;
    if (out.some((point) => point.question === question && point.activity === row.activity)) continue;
    out.push({ activity: wordsWithoutPrices(row.activity), clause: wordsWithoutPrices(row.clause), question, duty: row.type === 'Duty' });
  }
  return out;
}

// ---- What the subcontractor sees ----

// The SWMS on the list a point is about: the one whose work holds the point's activity. A point about
// a duty, or work no SWMS holds, belongs to none.
function pointItem(point, items) {
  return (items || []).find((row) => ((row.item && row.item.activities) || []).some((entry) => entry.activity && entry.activity === point.activity)) || null;
}
// A point goes with its SWMS: when that SWMS is removed or set aside it is not asked or sent (messy
// round 6: the defects-period point still asked for an answer after its SWMS was removed). Work
// folded into another SWMS is still on the list, so its points stay.
function pointInPlay(point, items) {
  const row = pointItem(point, items);
  if (!row) return true;
  const gone = (one) => Boolean(one.removed_at || one.removedAt);
  if (!gone(row)) return true;
  if (row.removed_why !== 'folded') return false;
  const main = (items || []).find((one) => one.package && row.item && one.package === row.item.foldedInto);
  return Boolean(main) && !gone(main);
}

// What the subcontractor is told about the high risk work in a SWMS on its list: only what the work
// is, never that it may not need a SWMS (Goal 12: it is the list, no second guessing).
function sentHighRisk(flag) {
  if (!flag || !['yes', 'likely'].includes(flag.status)) return null;
  return { status: flag.status, heading: flag.heading, line: (flag.lines || [])[0] || '' };
}

// The list as the subcontractor will be given it: the project, the SWMS kept on the list with the
// work each covers, the points the lead answered, and the site details. Removed and set-aside SWMS,
// their points and unanswered points are left out. The same function will build what is sent
// (stage 5), so the preview is the list.
function subcontractorView({ project, org, subcontract, items, points, siteDetails, fields }) {
  const all = items || [];
  const kept = all.filter((item) => !item.removed_at && !item.removedAt);
  const answered = (points || []).filter((point) => String(point.answer || '').trim() && pointInPlay(point, all));
  return {
    from: org.name,
    // An account whose ABN does not match the ABN register shows Unverified beside its name.
    fromVerified: Boolean(org.abn_verified_at || org.verified),
    to: subcontract.name,
    trade: subcontract.trade || '',
    project: { name: project.name, workplace: project.workplace, state: project.state, pcName: project.pc_name || project.pcName || org.name },
    swms: kept.map((item) => ({
      title: nameWithoutPrices(item.title),
      task: wordsWithoutPrices(item.task),
      highRisk: sentHighRisk(item.item && item.item.highRisk),
      clauses: clauseList(((item.item && item.item.activities) || []).map((row) => row.clause)),
      alsoCovers: all.filter((other) => other.removed_why === 'folded' && (other.removed_at || other.removedAt) && other.item && other.item.foldedInto && other.item.foldedInto === item.package).map((other) => nameWithoutPrices(other.title)),
      added: item.source === 'added',
    })),
    answers: answered.map((point) => ({ activity: point.activity, clause: point.clause, question: point.question, answer: String(point.answer).trim(), by: point.answered_by_name || '' })),
    siteDetails: siteDetails && siteDetails.rev ? {
      rev: siteDetails.rev,
      list: (fields || []).map((field) => ({ label: field.label, value: siteDetails.details[field.key] })).filter((entry) => (Array.isArray(entry.value) ? entry.value.length : String(entry.value || '').trim())),
    } : null,
  };
}

module.exports = { MONEY, COMMERCIAL_STRICT, COMMERCIAL_QUOTE, hasMoney, hasPrice, quotePriced, quoteWithoutPrices, wordsWithoutPrices, nameWithoutPrices, scrubReading, scrubChecks, listItems, listPoints, splitPoint, draftNotes, packWords, REMOVED_WHY, foldedWhy, highRiskOf, plantFromWords, clauseList, pointItem, pointInPlay, sentence, subcontractorView };
