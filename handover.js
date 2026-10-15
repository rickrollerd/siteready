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
  };
}

// The SWMS a reading lists for a subcontract, as the main contractor first sees them: every work
// package with site work, kept, except two the subcontractor would not need by default: work done
// only off site, and cranage the scope does not give this subcontractor (owner testing, 13 October
// 2026, item 9). Each comes with why it starts removed, and the lead can put it back.
function listItems(reading) {
  const safe = scrubReading(reading);
  const { work } = scopeChoice.packagesOf(safe);
  const flags = new Map((safe.highRisk || []).map((item) => [item.package, item]));
  const craneClause = scopeChoice.craneClause(safe);
  const items = scopeChoice.projectItems(safe, work.map((pack) => pack.name));
  return items.map((item, index) => {
    const pack = work[index];
    const flag = flags.get(pack.name);
    let removedWhy = '';
    if (flag && flag.offSite) removedWhy = 'offSite';
    else if (scopeChoice.isCranage(pack.name) && !craneClause) removedWhy = 'cranage';
    return { package: pack.name, removedWhy, ...itemFields(item, pack, flag) };
  });
}

// Why a SWMS starts removed, as the lead reads it.
const REMOVED_WHY = {
  offSite: 'Removed to start with: all of this work is done off site, so it needs no SWMS on site.',
  cranage: 'Removed to start with: the scope does not say this subcontractor supplies the cranage. Put it back if they need a cranage SWMS.',
};

// The points the scope leaves open about who does the work or what the main contractor provides
// (the brief's "Unknowns"), one for each activity that has one. The lead may answer them; only the
// answered ones go to the subcontractor (D302, K12).
function listPoints(reading) {
  const safe = scrubReading(reading);
  const out = [];
  for (const row of safe.activities || []) {
    const question = tidy(row.unknowns);
    if (!question) continue;
    if (out.some((point) => point.question === question && point.activity === row.activity)) continue;
    out.push({ activity: wordsWithoutPrices(row.activity), clause: wordsWithoutPrices(row.clause), question, duty: row.type === 'Duty' });
  }
  return out;
}

// ---- What the subcontractor sees ----

// The list as the subcontractor will be given it: the project, the SWMS kept on the list with the
// work each covers, the points the lead answered, and the site details. Removed SWMS and unanswered
// points are left out. The same function will build what is sent (stage 5), so the preview is the list.
function subcontractorView({ project, org, subcontract, items, points, siteDetails, fields }) {
  const kept = (items || []).filter((item) => !item.removed_at && !item.removedAt);
  const answered = (points || []).filter((point) => String(point.answer || '').trim());
  return {
    from: org.name,
    to: subcontract.name,
    trade: subcontract.trade || '',
    project: { name: project.name, workplace: project.workplace, state: project.state, pcName: project.pc_name || project.pcName || org.name },
    swms: kept.map((item) => ({
      title: nameWithoutPrices(item.title),
      task: wordsWithoutPrices(item.task),
      highRisk: item.item && item.item.highRisk ? { status: item.item.highRisk.status, heading: item.item.highRisk.heading } : null,
      clauses: [...new Set(((item.item && item.item.activities) || []).map((row) => row.clause).filter(Boolean))].slice(0, 12),
      added: item.source === 'added',
    })),
    answers: answered.map((point) => ({ activity: point.activity, clause: point.clause, question: point.question, answer: String(point.answer).trim(), by: point.answered_by_name || '' })),
    siteDetails: siteDetails && siteDetails.rev ? {
      rev: siteDetails.rev,
      list: (fields || []).map((field) => ({ label: field.label, value: siteDetails.details[field.key] })).filter((entry) => (Array.isArray(entry.value) ? entry.value.length : String(entry.value || '').trim())),
    } : null,
  };
}

module.exports = { MONEY, COMMERCIAL_STRICT, COMMERCIAL_QUOTE, hasMoney, hasPrice, quotePriced, quoteWithoutPrices, wordsWithoutPrices, nameWithoutPrices, scrubReading, scrubChecks, listItems, listPoints, REMOVED_WHY, subcontractorView };
