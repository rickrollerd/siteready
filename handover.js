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
  // At least one row is in the defects period: maintenance before handover is the trade's own work
  // during the job (messy round 7).
  return MAINTENANCE.test(pack.name) && pack.rows.some((row) => DEFECTS.test(words(row))) && pack.rows.every((row) => DEFECTS.test(words(row)) || MAINTENANCE.test(row.activity));
}
// High risk work the package's own words carry: a category that is not only likely.
const ownHighRisk = (flag) => ((flag && flag.categories) || []).some((item) => !item.likely);

// Packages whose names say no job of their own (messy round 7: one mechanical scope gave 17 SWMS,
// with "Electrical", "Controls", "Maintenance", "Access equipment" and "Trade installation: cells"):
//   - a bare discipline or catch-all name ("Electrical", "Controls", "General"): the trade's own work
//     of that kind, which goes with the like work in another package of the list;
//   - maintenance before handover: the trade running and servicing its own plant, which goes with its
//     testing and commissioning;
//   - "Trade installation: {an area or one item}" ("cells", "services walkways", "louvres"): more of
//     the trade's installation, which goes with its main SWMS unless it carries certain high risk work.
const GENERIC = /^(?:electrical(?: works?)?|controls?|bms|services|general(?: works?)?|other work|miscellaneous|sundr\w*|ancillary(?: works?)?|builders?['’]? works?|attendance)$/i;
const genericName = (name) => GENERIC.test(String(name || '').replace(/^trade installation:\s*/i, '').replace(/:\s*whole project$/i, '').trim());
const PART = /^trade installation:\s*(?!whole project\b)\S/i;
// An area or a room, not a kind of work: "cells and secure areas", "services walkways", "plant room".
const AREA = /\b(?:cells?|secure areas?|plant ?rooms?|walkways?|bathrooms?|wet areas?|toilets?|amenities|kitchenettes?|shafts?|risers?|levels?|floors?|basements?|car ?parks?|eaves|areas?|rooms?|zones?|wings?|blocks?|buildings?|gatehouse|facilit(?:y|ies)|apartments?|ground floor|roof ?spaces?|ceiling spaces?|plenums?)\b/i;
const smallPart = (name, activities) => PART.test(name) && (AREA.test(String(name).replace(/^trade installation:\s*/i, '')) || activities <= 2);
const COMMISSIONING = /\b(?:testing|commissioning)\b/i;
// A package named for maintenance or servicing ("Maintenance", "Preventative maintenance"), not one
// that only maintains something ("Jumpform: install, climb, maintain and dismantle").
const MAINTENANCE_NAME = /^(?:(?:preventative|preventive|routine|planned|scheduled|plant|systems?|services)\s+)?(?:maintenance|servicing)\b/i;
// The rows of a maintenance package done in the defects period become their own package, which
// starts removed, so maintenance during the work is not lost with them (messy round 7: "Maintenance"
// held filter changes before handover and the defects-period servicing, and stayed on the list).
const DEFECTS_PACKAGE = 'Maintenance in the defects period';
const inDefects = (row) => DEFECTS.test(`${row.activity || ''} ${(row.quotes || []).join(' ')}`);
function splitDefects(reading) {
  const work = (reading.activities || []).filter((row) => row.type !== 'Duty');
  const mixed = new Set([...new Set(work.map((row) => row.package))].filter((name) => MAINTENANCE.test(name || '')
    && work.some((row) => row.package === name && inDefects(row)) && work.some((row) => row.package === name && !inDefects(row))));
  if (!mixed.size) return reading;
  return { ...reading, activities: (reading.activities || []).map((row) => (row.type !== 'Duty' && mixed.has(row.package) && inDefects(row) ? { ...row, package: DEFECTS_PACKAGE } : row)) };
}

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
  const safe = splitDefects(scrubReading(reading));
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
    const kind = supportKind(pack.name) ? 'support' : MAINTENANCE_NAME.test(pack.name) ? 'maintenance' : genericName(pack.name) ? 'generic' : smallPart(pack.name, pack.rows.length) ? 'part' : '';
    return { package: pack.name, removedWhy, kind, ownHighRisk: ownHighRisk(flag), ...itemFields(item, pack, flag) };
  });
  // The trade's main SWMS: the package with the most work in it that names a job of its own, and is not
  // testing, set-up or making good, when there is one. The rest fold into the SWMS their work goes
  // with, and go where it goes: set aside with it, or onto the list when the lead moves it there.
  const SECONDARY = /\b(?:testing|commissioning|demolition|strip[- ]?out|set[- ]?up|establishment|protection|making good|penetrations?|core drilling)\b/i;
  const listed = (item) => !item.removedWhy;
  // A bare discipline name can be the main SWMS: "Electrical" in an electrical subcontract.
  const main = out.filter((item) => listed(item) && !['support', 'maintenance'].includes(item.kind))
    .sort((a, b) => (SECONDARY.test(a.package) ? 1 : 0) - (SECONDARY.test(b.package) ? 1 : 0) || b.activities.length - a.activities.length)[0];
  const fold = (item, into) => {
    if (!into || into === item) return false;
    item.removedWhy = 'folded';
    item.foldedInto = into.package;
    return true;
  };
  const noLaw = (item) => item.highRisk && item.highRisk.status === 'none';
  // Bare discipline names go together, under the one with the most certain high risk work and the
  // most work in it ("Controls" goes with "Electrical"); one alone stays if its own words carry certain
  // high risk work, and otherwise goes with the main SWMS.
  const generics = out.filter((item) => listed(item) && item.kind === 'generic' && !noLaw(item) && item !== main);
  const host = generics.slice().sort((a, b) => (b.ownHighRisk ? 1 : 0) - (a.ownHighRisk ? 1 : 0) || b.activities.length - a.activities.length)[0];
  const commissioning = out.find((item) => listed(item) && !item.kind && item !== main && COMMISSIONING.test(item.package) && !noLaw(item));
  for (const item of out) {
    if (!listed(item) || item === main) continue;
    // The trade's own housekeeping, materials handling and access equipment always go in its main SWMS,
    // and bring their high risk work with them (messy round 7: access equipment with a fall stayed a
    // SWMS of its own).
    if (item.kind === 'support') { fold(item, main); continue; }
    if (noLaw(item)) continue;
    if (item.kind === 'maintenance') fold(item, commissioning || main);
    else if (item.kind === 'generic' && item !== host) fold(item, host);
    else if (item.kind === 'generic' && generics.length === 1 && !item.ownHighRisk) fold(item, main);
    else if (item.kind === 'part' && !item.ownHighRisk) fold(item, main);
  }
  // Work the reading finds no high risk construction work in is set aside, counting the work folded
  // into it: a SWMS that takes in access equipment with a fall is on the list.
  for (const item of out) {
    if (!listed(item)) continue;
    const joined = riskJoined([item.highRisk, ...out.filter((other) => other.removedWhy === 'folded' && other.foldedInto === item.package).map((other) => other.highRisk)]);
    if (item.highRisk && (!joined || joined.status === 'none')) item.removedWhy = 'noLaw';
  }
  return out.map(({ kind, ownHighRisk: own, ...item }) => item);
}

// ---- What a SWMS on the list holds once the work folded into it is counted ----

// A high risk summary (hrcwSummary) read back into its parts: the categories that are certain, and
// those that are likely or depend on something ("Fall of more than 2 m, depending on the working
// height"). The summary is what each list item keeps.
function riskParts(summary) {
  const out = { certain: [], likely: [], depends: [] };
  if (!summary || !summary.lines || !summary.lines[0]) return out;
  // Already in SiteLink's words: what may also apply is on its own line.
  const also = summary.siteLink && summary.status === 'yes' ? /^It may also be (.*)\. The SWMS questions will confirm it$/.exec(summary.lines[1] || '') : null;
  if (also) {
    for (const part of splitOutside(also[1], '; ')) {
      const at = part.indexOf(', depending on ');
      if (at > 0) out.likely.push({ short: part.slice(0, at).replace(/^./, (letter) => letter.toUpperCase()), on: part.slice(at + ', depending on '.length) });
    }
  }
  const inside = /\((.*)\)\s*$/.exec(summary.lines[0]);
  if (!inside) return out;
  // Split at "; " outside brackets: a reason can hold its own brackets ("(A2L, A2 and A3 refrigerants are flammable)").
  for (const part of splitOutside(inside[1], '; ')) {
    const at = part.indexOf(', depending on ');
    if (at < 0) out.certain.push(part);
    else (summary.status === 'depends' ? out.depends : out.likely).push({ short: part.slice(0, at), on: part.slice(at + ', depending on '.length) });
  }
  return out;
}

// The high risk line SiteLink shows, on the lead's page, in the preview, on the list page and on the
// subcontractor's drafts alike (messy round 7: "This work needs a SWMS by law" sat beside "depending on
// the working height"). "Needs a SWMS by law" only when a category is certain; the categories that
// depend on something are said as likely, each with what it depends on.
function siteLinkRisk(parts) {
  const likely = [...parts.likely, ...parts.depends].filter((one, i, all) => !parts.certain.includes(one.short) && all.findIndex((other) => other.short === one.short) === i);
  const named = (list) => list.map((one) => `${one.short}, depending on ${one.on}`).join('; ');
  if (parts.certain.length) {
    const lines = [`It is high risk construction work (${parts.certain.join('; ')})`];
    if (likely.length) lines.push(`It may also be ${named(likely).replace(/^./, (letter) => letter.toLowerCase())}. The SWMS questions will confirm it`);
    return { status: 'yes', tag: 'High risk', heading: 'This work needs a SWMS by law', lines, siteLink: true };
  }
  if (parts.likely.length) return { status: 'likely', tag: 'Likely high risk', heading: 'This work likely needs a SWMS by law', lines: [`It is likely to be high risk construction work (${named(likely)})`, 'The SWMS questions will confirm it'], siteLink: true };
  if (parts.depends.length) return { status: 'depends', tag: 'May be high risk', heading: 'This work may need a SWMS by law', lines: [`It could be high risk construction work (${named(likely)})`, 'The SWMS questions will confirm it'], siteLink: true };
  return null;
}
// One item's summary in SiteLink's words; a summary with nothing in brackets (none, off site) is kept.
function riskOf(summary) {
  if (!summary) return null;
  return siteLinkRisk(riskParts(summary)) || summary;
}
// The summaries of a SWMS and the work folded into it, as one.
function riskJoined(summaries) {
  const all = summaries.filter(Boolean);
  if (!all.length) return null;
  const parts = { certain: [], likely: [], depends: [] };
  for (const one of all.map(riskParts)) {
    for (const short of one.certain) if (!parts.certain.includes(short)) parts.certain.push(short);
    for (const key of ['likely', 'depends']) for (const entry of one[key]) if (!parts[key].some((other) => other.short === entry.short)) parts[key].push(entry);
  }
  // Likely beats depends for the same category.
  parts.depends = parts.depends.filter((one) => !parts.likely.some((other) => other.short === one.short));
  return siteLinkRisk(parts) || riskOf(all[0]);
}

// The rows a SWMS on the list takes in: those folded into it that are still off the list.
const foldedInto = (row, rows) => (row && row.package ? (rows || []).filter((other) => other !== row && other.removed_why === 'folded' && (other.removed_at || other.removedAt) && other.item && other.item.foldedInto === row.package) : []);

// What a SWMS on the list covers with the work folded into it: its high risk line in SiteLink's words,
// and for the subcontractor's draft, the folded work's own words, step groups, site conditions, plant
// and notes, so the SWMS covers what its card says it covers (messy round 7: "Also covers" named work
// whose steps and high risk work were in no SWMS).
function withFolded(row, rows) {
  const item = (row && row.item) || {};
  const folded = foldedInto(row, rows).map((other) => other.item || {});
  const own = row.source === 'added' || row.task_changed;
  const join = (list) => list.map((one) => String(one || '').trim()).filter(Boolean).join(' ');
  const union = (lists) => { const seen = []; for (const list of lists) for (const one of list || []) if (!seen.includes(one)) seen.push(one); return seen; };
  const kindsList = [item.kinds, ...folded.map((one) => one.kinds)].filter(Array.isArray);
  const site = { ...(item.site || {}) };
  for (const one of folded) for (const [key, value] of Object.entries(one.site || {})) site[key] = site[key] ? `${site[key]} ${value}` : value;
  return {
    highRisk: riskJoined([item.highRisk, ...folded.map((one) => one.highRisk)]),
    // The lead's own words for the work stay as they are; the folded work comes in alongside.
    extraTask: join(folded.map((one) => one.task)),
    scopeFull: own ? '' : join([item.scopeTask && item.scopeTask.full, ...folded.map((one) => one.scopeTask && one.scopeTask.full)]),
    kinds: kindsList.length ? union(kindsList) : null,
    leaveOut: Array.isArray(item.leaveOut) || folded.some((one) => Array.isArray(one.leaveOut)) ? union([item.leaveOut, ...folded.map((one) => one.leaveOut)]) : null,
    unmatched: Array.isArray(item.unmatched) ? union([item.unmatched, ...folded.map((one) => one.unmatched)]) : null,
    site,
    plant: union([item.plant, ...folded.map((one) => one.plant)]),
    draftNotes: union([item.draftNotes, ...folded.map((one) => one.draftNotes)]).slice(0, 20),
    activities: [...(item.activities || []), ...folded.flatMap((one) => one.activities || [])],
  };
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

// The step groups a SWMS on the list is drafted with. A package the reading matched to no step group
// is drafted from its own words instead, as a SWMS the lead adds is (messy round 7: "Trade
// installation: cells" reached the subcontractor with no job steps at all).
const draftKinds = (kinds) => (Array.isArray(kinds) && kinds.length ? kinds : null);

// Whether SiteWrite has no job steps for a SWMS's work, so it would reach the subcontractor empty.
// Asked of the SWMS's own rules (draft.js questionsFor) only when the words decide the steps: step
// groups the reading matched always have steps.
function noJobSteps(item, state) {
  if (!item || draftKinds(item.kinds)) return false;
  const task = String(item.task || '').trim();
  if (!task) return true;
  try {
    const asked = require('./draft').questionsFor({ state: state || 'qld', task, scopeTask: item.scopeTask || undefined, kinds: null, leaveOut: Array.isArray(item.leaveOut) ? item.leaveOut : null, unmatched: null, trade: '', crane: '', slinging: '', fallRisk: 'yes', residential: 'no' });
    return Boolean(asked && asked.standDown);
  } catch {
    return false;
  }
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

// An open point is asked of the lead only when it asks who does the work or who supplies what (messy
// round 6 decision 6, D307). Messy round 7: a statement that only names the builder ("Shop drawings
// need builder approval", "The precast suppliers are yet to be determined") was asked too, 33 times
// for one scope. A point asks who when it names who ("who", "by whom"), or when it leaves something
// open ("whether", "not stated", "unclear") about a party or about supplying, providing or scope.
const WHO_WORD = /(?<!\b(?:workers?|persons?|people|those|anyone|someone|everyone|trades?|staff|operators?|personnel|employees?|crews?)\s)\b(?:who|whom|whose)\b/i;
const OPEN = /\b(?:whether|not stated|not said|does not say|doesn['’]t say|do not say|not clear|unclear|not specified|unspecified|not confirmed|unconfirmed|to be confirmed|not defined|undefined|not itemised|split between|which party|either party|conflicts?)\b|^\s*(?:what|which)\b|\?/i;
const PARTY = /\b(?:by others|(?:builder|client|principal(?: contractor)?|head contractor|main contractor|contractor)(?:['’]s)?|sub-?contractors?(?:['’]s)?|(?<!\b(?:power|energised|live|mains|water|gas|air|electricity|electrical|temporary) )suppl(?:y|ies|ied)(?!\s+(?:is|are|was|were)\s+(?:energised|live|isolated|on|off|dead|available|connected)\b)|provid(?:e|es|ed|ing)|furnish\w*|responsib\w*|free[- ]issue\w*|in (?:the |this |base )?scope|(?:base|subcontract|sub-contract) scope|scope (?:in|of (?:this|the) (?:sub-?)?contract)|out of scope|not itemised|includ(?:ed|es)|exclud(?:ed|es))\b/i;
const WHO_SUPPLIES = { test: (text) => WHO_WORD.test(text) || (OPEN.test(text) && PARTY.test(text)) };
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
// A part that only follows on from the one before ("If it does, the welding procedure applies",
// "This depends on whether an exemption is granted") goes with it, so a note never reaches the
// subcontractor without the question it answers (messy round 7).
const FOLLOWS_ON = /^(?:if (?:it|so|not|they|this|that|one|there)\b|if so\b|otherwise\b|(?:this|that|it|which) (?:depends|applies|means|would|will|is needed|affects)\b|in which case\b|in that case\b|then\b)/i;
function joinFollowOns(parts) {
  const out = [];
  for (const part of parts) {
    if (out.length && FOLLOWS_ON.test(part)) out[out.length - 1] = `${out[out.length - 1].replace(/[.\s]*$/, '')}. ${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    else out.push(part);
  }
  return out;
}
function splitPoint(text) {
  const asks = [];
  const notes = [];
  const sentences = (part) => joinFollowOns(String(part).split(/(?<=[.!?])\s+(?=[A-Z])/).map(tidy).filter(Boolean)).join(' ');
  for (const part of joinFollowOns(splitOutside(String(text || ''), ';').map(sentences))) {
    // A part whose follow-on sentence was the only thing left after the question goes with it whole.
    if (FOLLOWS_ON.test(part)) continue;
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
  const said = riskOf(flag);
  if (!said || !['yes', 'likely'].includes(said.status)) return null;
  return { status: said.status, heading: said.heading, line: (said.lines || []).join('. ') };
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
      // With the high risk work of the work folded into it (messy round 7).
      highRisk: sentHighRisk(withFolded(item, all).highRisk),
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

module.exports = { MONEY, COMMERCIAL_STRICT, COMMERCIAL_QUOTE, hasMoney, hasPrice, quotePriced, quoteWithoutPrices, wordsWithoutPrices, nameWithoutPrices, scrubReading, scrubChecks, listItems, listPoints, splitPoint, draftNotes, packWords, REMOVED_WHY, foldedWhy, highRiskOf, plantFromWords, clauseList, pointItem, pointInPlay, sentence, subcontractorView, riskOf, riskJoined, withFolded, asksWho, DEFECTS_PACKAGE, noJobSteps, draftKinds };
