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
  // SiteLink titles its own list below (SiteWrite's reading titles every package, packageTitles).
  const safe = splitDefects(scrubReading(reading && reading.titles ? { ...reading, titles: undefined } : reading));
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
  // A bare or area title gets a work title from the reading's own words (messy round 8, blocker 6: the
  // lead renamed "Electrical" and "Trade installation: Central Facilities" before sending).
  // The SWMS with the most work in it is named first, so it takes the plain name ("Electrical
  // installation") and a smaller one keeps its area.
  // A title that reads as another's ("Ceilings and partitions installation" beside "Ceilings and
  // partitions") keeps its area too.
  // Every SWMS SiteLink lists is titled so, set aside or removed included, and work folded into another
  // keeps the title it takes if it is put on the list (listTitle), so a SWMS moved onto the list never
  // goes out under the reading's package name (messy round 10, SiteLink blocker 7: "Trade installation:
  // discharge and intake points", moved onto the list, went out in the list email).
  retitle(out, work, { all: true, folded: true });
  return out.map(({ kind, ownHighRisk: own, ...item }) => item);
}

const WHOLE_AREA = /^(?:whole (?:project|site|building)|area not (?:stated|given)|various(?: areas)?|all areas)$/i;
// A SWMS titled by the words of its own work, where its trade's title is taken: the trade's fit-out where its work
// is mostly lights, outlets and final connections, else its one or two activities, or its first one ("Install HV
// cabling and cable joints", never "... and other work", which says no work: messy round 15, SiteLink wording 2).
// "Controls" is "Control systems", not safety controls.
// A services trade's lights, outlets, switches and final connections across the project are its fit-out.
const FIT_OUT = /\b(?:fit(?:s|ting)?[- ]?(?:off|out)|light fittings?|luminaires?|GPOs?|power points?|outlets?|switch(?:es)?|final connections?|floor boxes)\b/i;
function ownWorkTitle(item, pack, taken = () => false) {
  const later = (text) => text.replace(/^./, (letter) => letter.toLowerCase());
  const rows = (pack && pack.rows) || [];
  const named = [...new Set(rows.map((row) => activityTitle(row.activity)).filter(Boolean))];
  const two = named.length >= 2 ? `${named[0]} and ${later(named[1])}` : '';
  const trade = tradeOf(pack);
  const fitOut = trade && trade.kind === 'installation' && rows.length >= 2 && rows.filter((row) => FIT_OUT.test(row.activity || '')).length * 3 >= rows.length ? `${trade.name} fit-out` : '';
  const choices = [/^controls?$/i.test(String(item.title || '').trim()) ? 'Control systems' : '', fitOut, named.length === 2 && two.length <= 80 ? two : '', ...named].filter(Boolean);
  return choices.find((title) => !taken(title)) || '';
}
// Bare and area titles take work titles (above). Items set aside or folded keep theirs (all: false);
// every package is titled for SiteWrite's own scope reading and SiteLink's list (all: true). folded: work
// folded into another SWMS keeps its name for "Also covers", with the title it takes on the list kept as
// listTitle. The SWMS on the list are titled first, then those set aside, each by the work in it.
function retitle(out, work, { all = false, folded = false } = {}) {
  const base = (title) => String(title).toLowerCase().replace(/ (?:installation|work)$/, '');
  const inOther = (item) => folded && item.removedWhy === 'folded';
  const titles = new Set(out.filter((item) => !inOther(item)).map((item) => item.title.toLowerCase()));
  const taken = (title) => titles.has(title.toLowerCase()) || [...titles].some((other) => base(other) === base(title));
  const aside = (item) => (item.removedWhy ? (item.removedWhy === 'folded' ? 2 : 1) : 0);
  const order = out.map((item, index) => index).sort((a, b) => aside(out[a]) - aside(out[b]) || work[b].rows.length - work[a].rows.length);
  for (const index of order) {
    const item = out[index];
    // Only the SWMS on the list to start with: the ones the lead sends.
    if (item.removedWhy && !all) continue;
    titles.delete(item.title.toLowerCase());
    let better = workTitle(item, work[index]);
    const area = /^trade installation:\s*(.+)$/i.exec(item.title);
    // A work title another SWMS has is told apart by its area, but "whole project" is no area: the SWMS takes
    // its own work's words, and so does a bare name ("Controls") whose trade title is taken (messy round 15,
    // SiteLink wording 2: "Electrical installation, whole project" and "Controls" were SWMS titles).
    const noArea = area && WHOLE_AREA.test(area[1].trim());
    if (better && better.toLowerCase() !== item.title.toLowerCase() && taken(better) && (noArea || (!area && genericName(item.title)))) better = ownWorkTitle(item, work[index], taken);
    else if (better && better.toLowerCase() !== item.title.toLowerCase() && taken(better) && area && !better.includes(',')) better = `${better}, ${area[1].trim()}`;
    if (better && better.toLowerCase() !== item.title.toLowerCase() && !taken(better)) {
      if (inOther(item)) item.listTitle = better;
      else item.title = better;
    }
    if (!inOther(item) || item.listTitle) titles.add((item.listTitle || item.title).toLowerCase());
  }
  // No two SWMS of one list read as the same: a trade's plain title ("Plumbing installation") beside the
  // same title with an area ("Plumbing installation, buildings") takes the words of its own work (messy round
  // 11, SiteLink blocker 6: the sewer pump stations and temporary services work and the building plumbing).
  const shown = (item) => (inOther(item) ? item.listTitle || '' : item.title);
  const used = () => out.map((item) => shown(item).toLowerCase()).filter(Boolean);
  // The trade's main SWMS (more work in it than the others with its title) keeps the plain title.
  const size = (index) => ((work[index] && work[index].rows) || []).length;
  out.forEach((item, index) => {
    const title = shown(item);
    if (!title || title === item.package) return;
    const beside = out.map((other, at) => at).filter((at) => out[at] !== item && shown(out[at]).toLowerCase().startsWith(`${title.toLowerCase()}, `));
    if (!beside.length || beside.every((at) => size(at) < size(index))) return;
    const named = ((work[index] && work[index].rows) || []).map((row) => activityTitle(row.activity)).filter(Boolean);
    const later = (text) => text.replace(/^./, (letter) => letter.toLowerCase());
    const area = /^trade installation:\s*(.+)$/i.exec(item.package);
    const place = area && !/^(?:whole (?:project|site|building)|area not (?:stated|given)|various(?: areas)?|all areas)$/i.test(area[1].trim()) ? area[1].trim() : '';
    // Two activities' words name the work only where they are all of it, and still read as a title; otherwise the first activity names it, never "and other work" (sl12, round 15 SiteLink wording 2) (messy round 15, A run 2: a
    // package of ten activities was titled by two of them, "Terminate, joint and test cables and carry out electrical isolation
    // and lock out", and its file name was cut off at "electrical is").
    const rowCount = ((work[index] && work[index].rows) || []).length;
    const pair = named.length === 2 ? `${named[0]} and ${later(named[1])}` : '';
    const from = place ? `${title}, ${place}` : named.length === 1 && rowCount === 1 ? named[0] : pair && rowCount === 2 && pair.length <= 60 ? pair : named.length ? named[0] : '';
    if (!from || used().includes(from.toLowerCase())) return;
    if (inOther(item)) item.listTitle = from; else item.title = from;
  });
}

// SiteWrite's own scope reading: each package's SWMS title, by sl8's work-title rules (messy round 9:
// "Trade installation: concrete works" and "Trade installation: swimming pool" were used as SWMS titles
// and file names, and shown to the builder). { package name: title }
function packageTitles(reading) {
  const safe = splitDefects(scrubReading(reading || {}));
  const { work } = scopeChoice.packagesOf(safe);
  const out = work.map((pack) => ({ package: pack.name, title: pack.name }));
  retitle(out, work, { all: true });
  return Object.fromEntries(out.filter((item) => item.title !== item.package).map((item) => [item.package, item.title]));
}

// The trade, from the crew the reading names for the work ("Electricians", "Mechanical fitters"), and
// whether its work is an installation or work ("Electrical installation", "Tiling work").
const CREWS = [
  // A fire services crew that is also electrical ("Electrical fire system tradespersons") is fire services (messy round 16).
  [/sprinkler|\bfire\b/i, 'Fire services', 'installation'], [/electric/i, 'Electrical', 'installation'], [/mechanical|refrigeration|sheet metal|pipefitter|hvac|air ?condition/i, 'Mechanical', 'installation'],
  [/plumb|drainer/i, 'Plumbing', 'installation'], [/telecommunication|\bcomms\b|data cabl/i, 'Communications', 'installation'], [/security/i, 'Security', 'installation'],
  [/fenc/i, 'Fencing', 'work'], [/window|door|glaz/i, 'Windows and doors', 'installation'], [/ceiling|partition|plasterer/i, 'Ceilings and partitions', 'installation'], [/joinery/i, 'Joinery', 'installation'],
  [/tiler|tiling/i, 'Tiling', 'work'], [/waterproof/i, 'Waterproofing', 'work'], [/painter/i, 'Painting', 'work'], [/formwork/i, 'Formwork', 'work'], [/steel fixer/i, 'Reinforcement', 'work'],
  [/roof/i, 'Roofing', 'work'], [/landscap/i, 'Landscaping', 'work'], [/concret/i, 'Concrete', 'work'], [/civil/i, 'Civil', 'work'],
];
function tradeOf(pack) {
  const counts = new Map();
  for (const row of (pack && pack.rows) || []) {
    const found = CREWS.find(([test]) => test.test(String(row.crew || '')));
    if (found) counts.set(found, (counts.get(found) || 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? { name: best[0][1], kind: best[0][2] } : null;
}
// One activity's words as a title: its first clause, with no brackets, when short enough to read as one.
// An installation said as a sentence ("Install the gas suppression system in the Gatehouse SER room") is titled by
// what is installed and where: "Gas suppression system, Gatehouse SER room" (messy round 16, SiteLink wording 2).
// One with no "the" ("Install HV cabling and cable joints") already reads as a work title and is kept.
const INSTALL_FIRST = /^(?:supply,?\s+(?:and\s+)?)?install\s+(?:the|a|an)\s+(?=\S)/i;
function activityTitle(text) {
  let words = String(text || '').replace(/\s*\([^)]*\)/g, '').replace(/[.;:]\s.*$/, '').replace(/[.\s]+$/, '').replace(/\s+/g, ' ').trim();
  if (INSTALL_FIRST.test(words)) {
    const what = words.replace(INSTALL_FIRST, '');
    const at = /^(.+?)\s+(?:in|at|on|within|to) (?:the |an? )?(.+)$/i.exec(what);
    words = at && at[1].split(' ').length >= 2 ? `${at[1]}, ${at[2]}` : what;
  }
  return words && words.length <= 60 ? words.replace(/^./, (letter) => letter.toUpperCase()) : '';
}
const TEMPORARY = /\btemporary\b|\btemp\b|\bchangeovers?\b|\bbuilders?['’]? (?:power|supply|lighting)\b/i;
// "In-ground civil" is the reading's name for any in-ground work, whatever the trade (messy round 9,
// blocker 6: a hydraulic scope's drainage reached the subcontractor as "In-ground civil"). Its title
// comes from what the in-ground work is: the drains it lays, the services it puts in the ground, or
// the digging itself. Rows that only support the digging (trenching, spoil, saw cutting, dewatering,
// finding services) do not name the work.
const IN_GROUND = /^(?:in[- ]?ground|below[- ]ground|underground)\s+civil(?:s|\s+works?)?$/i;
const DIG_ONLY = /\b(?:trench\w*|excavat\w*|backfill\w*|compact\w*|spoil|fill|roadsaw\w*|saw ?cut\w*|dewater\w*|locat\w*|scan\w*|pothol\w*|vacuum|rock|reinstat\w*|bedding|survey\w*|set ?out)\b/i;
function inGroundTitle(pack) {
  const rows = (pack && pack.rows) || [];
  const words = (row) => String(row.activity || '');
  const main = rows.filter((row) => !DIG_ONLY.test(words(row)) || /\b(?:install|lay|connect|construct)\b/i.test(words(row)));
  // A services trade's in-ground work is its services ("Electricians" laying conduits and pits).
  const crew = tradeOf({ rows: main.length ? main : rows });
  if (crew && ['Electrical', 'Mechanical', 'Communications', 'Security', 'Fire services'].includes(crew.name)) return `In-ground ${crew.name.toLowerCase()} services`;
  const drains = main.filter((row) => /\b(?:drain(?:s|age)?|sewer\w*|sanitary|stormwater|storm water|grease|interceptor|swales?)\b/i.test(words(row)));
  if (main.length && drains.length * 2 >= main.length) {
    const all = drains.map(words).join(' ');
    const kinds = [/\b(?:sewer|sanitary)\b/i.test(all) && 'sanitary', /\bstorm ?water\b/i.test(all) && 'stormwater'].filter(Boolean);
    return `In-ground ${kinds.length ? `${kinds.join(' and ')} ` : ''}drainage`;
  }
  const laid = main.filter((row) => /\b(?:install|lay|connect)\b/i.test(words(row)) && !/\bexisting\b/i.test(words(row)) && /\b(?:conduits?|pipe\w*|cabl\w*|services?|water supply|mains?)\b/i.test(words(row)));
  if (laid.length && !(crew && crew.name === 'Civil')) {
    const trade = tradeOf({ rows: laid });
    return trade && trade.name !== 'Civil' ? `In-ground ${trade.name.toLowerCase()} services` : 'In-ground services';
  }
  const earth = rows.some((row) => /\b(?:earthworks?|grade|subgrade|fill|stockpile|reduced levels?|bulk)\b/i.test(words(row)));
  if (!earth && rows.some((row) => /\bfootings?\b/i.test(words(row)))) return 'Excavation and footings';
  if (earth || rows.some((row) => /\b(?:excavat\w*|trench\w*)\b/i.test(words(row)))) return 'Excavation and earthworks';
  return '';
}
// A package named for a hazard or a permit, not the work ("Hot works"), takes its title from the work as
// a bare name does (messy round 10, run 2: "Hot works" stayed the SWMS title and file name for heat welding
// vinyl joins). Only the title: SiteLink's list sorts it as before.
const HAZARD_NAME = /^(?:hot works?|hot work permits?|work(?:ing)? at heights?|heights? work|confined spaces?|manual handling|hazardous (?:substances|materials|chemicals))$/i;
// A package named for where the work is, not what it is ("Work in an existing or live facility"), is titled by the
// trade's work there: "Fire services work in the existing or live facility" (messy round 16, SiteLink wording 2).
const PLACE_NAME = /^work(?:s|ing)?\s+(?:in|on|at|within|inside|near|around)\s+(?:an?\s+|the\s+)?(.+)$/i;
const BARE_TRADE = /^(?:mechanical|hydraulic|plumbing|fire|fire protection|electrical|communications|comms|security|hvac|air conditioning|medical gas|lift|vertical transport)\s+(?:services|works?)$/i;
const WHOLE_PROJECT = /:\s*whole (?:project|site|building)$/i;
function workTitle(item, pack) {
  const name = String(item.title || '').trim();
  const rows = (pack && pack.rows) || [];
  // "Risers and pipework at height: whole project" is titled by its work alone (messy round 11, SiteLink
  // blocker 6, sl10 decision 5 A): the SWMS covers the whole project anyway (D187).
  if (WHOLE_PROJECT.test(name) && !/^trade installation:/i.test(name)) {
    const plain = name.replace(WHOLE_PROJECT, '').trim();
    return (plain && workTitle({ ...item, title: plain }, pack)) || plain;
  }
  const place = PLACE_NAME.exec(name);
  if (place) {
    const trade = tradeOf(pack);
    if (trade) return `${trade.name} work in the ${place[1]}`;
    return rows.length && activityTitle(rows[0].activity) ? activityTitle(rows[0].activity) : '';
  }
  if (HAZARD_NAME.test(name)) {
    const named = rows.map((row) => activityTitle(row.activity)).filter(Boolean);
    const later = (text) => text.replace(/^./, (letter) => letter.toLowerCase());
    if (named.length === 1 || (named.length && !tradeOf(pack))) return named.length === 2 ? `${named[0]} and ${later(named[1])}` : named[0];
    const trade = tradeOf(pack);
    if (trade) return `${trade.name} ${trade.kind}`;
  }
  if (IN_GROUND.test(name)) return rows.length === 1 && activityTitle(rows[0].activity) ? activityTitle(rows[0].activity) : inGroundTitle(pack);
  const part = /^trade installation:\s*(.+)$/i.exec(name);
  // A trade's name alone ("Mechanical services", messy round 10, blocker 7) says no work either.
  if (!part && BARE_TRADE.test(name)) return rows.length === 1 && activityTitle(rows[0].activity) ? activityTitle(rows[0].activity) : `${name.replace(/\s+works?$/i, '')} installation`;
  const bare = genericName(name) && !part;
  if (!part && !bare) return '';
  const area = part ? part[1].trim() : '';
  const whole = /^(?:whole (?:project|site|building)|area not (?:stated|given)|various(?: areas)?|all areas)$/i.test(area);
  // Rooms that are the work, not where it is ("Trade installation: cool rooms", messy round 14, A run 1: the SWMS title used the
  // package name).
  const workRoom = /^(?:(?:walk-in )?(?:cool ?rooms?|coolrooms?|freezer rooms?|cold ?rooms?|clean ?rooms?))$/i.test(area);
  const areaName = Boolean(part) && !workRoom && !/\b(?:finish(?:es|ing)?|coverings?)\b/i.test(area) && (whole || AREA.test(area) || /\b(?:interiors?|custodial|precincts?|stages?|towers?|podiums?)\b/i.test(area));
  // A work, not an area ("Trade installation: structural steel"): the work's own name.
  if (part && !areaName) {
    const work = area.replace(/^./, (letter) => letter.toUpperCase());
    // One word alone is still bare ("Plant"): it says what is done with it.
    const kind = (tradeOf(pack) || { kind: 'installation' }).kind;
    if (/\s/.test(work) || kind === 'work') return work;
    return rows.length === 1 && activityTitle(rows[0].activity) ? activityTitle(rows[0].activity) : `${work} installation`;
  }
  if (rows.length === 1 && activityTitle(rows[0].activity)) return activityTitle(rows[0].activity);
  // A bare name is its own discipline ("Electrical" in a mechanical scope is the electrical work); an
  // area's comes from the crew doing it.
  const named = bare ? CREWS.find(([test]) => test.test(name)) : null;
  const trade = named ? { name: named[1], kind: named[2] } : tradeOf(pack);
  if (!trade) return '';
  // Mostly temporary services ("Electrical" holding the builder's temporary power and lighting).
  if (bare && rows.length && rows.filter((row) => TEMPORARY.test(row.activity || '')).length * 3 >= rows.length * 2) return `Temporary ${trade.name.toLowerCase()} services`;
  const where = areaName && !whole ? `, ${area}` : '';
  return `${trade.name} ${trade.kind}${where}`;
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
  unfolded: 'Taken out of the SWMS it was part of, when you changed that SWMS\'s work. Put it back if it needs a SWMS of its own.',
  noLaw: 'No high risk construction work was found in it. Move it to the list if you want a SWMS for it.',
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
// The scope clauses a SWMS on the list comes from. Once the lead has changed its work, only the
// clauses of the activities its new words still name (messy round 9, wording 3: after "Change the work",
// "From scope clauses" still listed the clauses for the solar hot water and the downpipes).
const CLAUSE_STOP = new Set(['install', 'installation', 'supply', 'provide', 'works', 'system', 'systems', 'services', 'service', 'including', 'associated', 'required', 'complete', 'within', 'their', 'there', 'other', 'from', 'with', 'into']);
const workStem = (word) => word.toLowerCase().replace(/(?:ing|ed|es|s)$/, '');
const workWords = (text) => String(text || '').split(/[^A-Za-z]+/).filter((word) => word.length >= 4 && !CLAUSE_STOP.has(word.toLowerCase())).map(workStem);
// What an activity does or puts in: its words before the first word of place or purpose, without the
// doing words ("Install access panels in ductwork": access panels; "Apply protective coating to copper
// pipework": protective coating). Messy round 10, wording 3: one shared word ("ductwork", "pipework")
// kept the access panels and the copper coating after the lead's new words named neither.
const HEAD_END = /\s(?:to|in|into|on|onto|for|through|passing|around|at|with|within|from|between|under|over|above|below|across|along|via|by|including|where|as)\s/i;
const DOING = new Set(['apply', 'appli', 'carry', 'carri', 'cut', 'form', 'seal', 'mark', 'label', 'make', 'test', 'commission', 'fabricate', 'fabricat', 'deliver', 'erect', 'connect', 'program', 'balanc', 'balance', 'undertak', 'undertake', 'perform', 'fit', 'fix', 'place', 'plac', 'hang', 'build', 'construct', 'remov', 'remove', 'maintain', 'document', 'certify', 'handl', 'handle', 'hoist', 'unload', 'coordinat', 'coordinate']);
function headWords(activity) {
  const head = workWords(String(activity || '').split(HEAD_END)[0]).filter((word) => !DOING.has(word));
  return head.length ? head : workWords(activity);
}
// An activity the lead's words still name: one of the words for what it does or puts in.
function activityNamed(task, activity) {
  const named = new Set(workWords(task));
  return headWords(activity).some((word) => named.has(word));
}
// Work folded into a SWMS that the lead's new words for that SWMS still name (messy round 10, SiteLink
// blocker 5: "... and in the switchroom and comms room" took the switchroom work out). Named by every
// word of its title, or by what one of its activities does or puts in.
function foldedNamed(task, row) {
  const named = new Set(workWords(task));
  const title = workWords(String(row.title || '').replace(/^trade installation:\s*/i, '').replace(/\bwhole (?:project|site|building)\b/i, ''));
  if (title.length && title.every((word) => named.has(word))) return true;
  return ((row.item && row.item.activities) || []).some((entry) => activityNamed(task, entry.activity));
}
function clausesOf(row) {
  const item = (row && row.item) || {};
  let list = item.activities || [];
  if (row && row.task_changed && String(row.task || '').trim()) list = list.filter((entry) => activityNamed(row.task, entry.activity));
  return clauseList(list.map((entry) => entry.clause));
}
// Each heading once, with its clause numbers ("Specific Inclusions 2b, 4, 7", "Installation 21, 28"): messy
// round 10, wording 2: "Specific Inclusions 2b, 4, Specific Inclusions 2c, 2d" said the heading again for
// each activity. Shown joined with "; ".
function clauseList(list) {
  const out = [];
  let prefix = '';
  let prefixCode = '';
  for (const entry of list || []) {
    for (const raw of String(entry || '').split(/\s*[;,]\s*/)) {
      const part = raw.trim();
      if (!part) continue;
      // A clause number keeps its letter ("C-1.05"), so it is never said "C- 1.05" (messy round 11, wording 3).
      const named = /^(.*?)\s*((?:[A-Z]{1,4}-)?\d[\w.]*)$/.exec(part);
      const code = named ? (/^([A-Z]{1,4})-/.exec(named[2]) || [])[1] || '' : '';
      // A lettered number goes under the heading before it only when that heading's numbers carry the same letter.
      if (named && !named[1] && code !== prefixCode) prefix = '';
      if (named && named[1]) { prefix = named[1]; prefixCode = code; }
      // The scope's exclusions are not where the work comes from (messy round 9, wording 2: the
      // in-ground work cited "Exclusions 3").
      if (/^exclu/i.test(named && !named[1] && prefix ? prefix : part)) continue;
      const heading = named ? (named[1] || prefix) : '';
      const number = named ? named[2] : part;
      const key = `${heading} ${number}`.trim().toLowerCase();
      if (out.some((one) => one.key === key)) continue;
      out.push({ key, heading, number, text: part });
    }
  }
  const groups = [];
  for (const one of out.slice(0, 12)) {
    const group = one.heading && groups.find((other) => other.heading.toLowerCase() === one.heading.toLowerCase());
    if (group) group.numbers.push(one.number);
    else groups.push(one.heading ? { heading: one.heading, numbers: [one.number] } : { heading: '', numbers: [one.text] });
  }
  return groups.map((group) => (group.heading ? `${group.heading} ${group.numbers.join(', ')}` : group.numbers[0]));
}

// A point starts with a capital letter (messy round 6: "confirm who supplies the AC equipment").
function sentence(text) {
  const value = tidy(text);
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}
// The reading's pointers to its list of conflicts, which neither the lead nor the subcontractor sees: "(see
// conflicts)" goes, and "(see conflict with 4.4(e))" says which clause differs (messy round 16, SiteLink wording 1:
// "(see conflicts)" reached the subcontractor three times, with no conflicts section to see).
function withoutConflictRefs(text) {
  return String(text || '')
    .replace(/\s*\(\s*see (?:the )?conflicts?\s*\)/gi, '')
    .replace(/\(\s*see (?:the )?conflicts? (?:with|against|at) (?:clause |item )?([^()]*(?:\([^()]*\)[^()]*)*)\)/gi, (whole, clause) => `(clause ${clause.trim()} says otherwise)`)
    .replace(/\s+([.,;])/g, '$1');
}
// A point as it reads: a sentence with its capital and its full stop (messy round 16, SiteLink wording 1: "The
// document does not say who isolates the existing fire services before pipe is cut" had none).
const pointSentence = (text) => sentence(withoutConflictRefs(text)).replace(/([^.!?])$/, '$1.');

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
// "Which gives precast conduits to the Electrical subcontractor" goes on from the part before it, as a
// relative clause, and is not a question of its own (messy round 11, SiteLink wording 1).
// "So who seals depends on the builder's sequence" goes on from the part before it too, never a point of its own
// (messy round 16, SiteLink wording 1 and blocker 4: it was asked alone, and the part before it was left as a note).
const FOLLOWS_ON = /^(?:if (?:it|so|not|they|this|that|one|there)\b|if so\b|otherwise\b|(?:this|that|it|which) (?:depends|applies|means|would|will|is needed|affects)\b|which (?:gives|makes|puts|leaves|sets|places|moves|shifts|passes|assigns|allocates|transfers|keeps|means|is|are|has|have|was|were|could|may|might)\b|in which case\b|in that case\b|then\b|so (?:who|whom|whose|which|whether|it|this|that|they|the|its|their|there)\b)/i;
function joinFollowOns(parts) {
  const out = [];
  for (const part of parts) {
    if (out.length && /^(?:which|so)\b/i.test(part) && FOLLOWS_ON.test(part)) out[out.length - 1] = `${out[out.length - 1].replace(/[.,;\s]*$/, '')}, ${part.charAt(0).toLowerCase()}${part.slice(1)}`;
    else if (out.length && FOLLOWS_ON.test(part)) out[out.length - 1] = `${out[out.length - 1].replace(/[.\s]*$/, '')}. ${part.charAt(0).toUpperCase()}${part.slice(1)}`;
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
    // A piece that only goes on from the one before ("..., which gives precast conduits to the Electrical
    // subcontractor") stays with it, never a point of its own (messy round 11, SiteLink wording 1).
    const pieces = splitOutside(part, ', ').map((one) => one.replace(/^and\s+/i, '')).reduce((list, one) => (list.length && (/^(?:which|who|whose|whom|that|where)\b/i.test(one) || (/^so\b/i.test(one) && FOLLOWS_ON.test(one))) ? [...list.slice(0, -1), `${list[list.length - 1]}, ${one}`] : [...list, one]), []);
    if (pieces.length < 2 || asksWho(pieces[0])) { asks.push(part); continue; }
    for (const piece of pieces) (asksWho(piece) ? asks : notes).push(piece);
  }
  return { asks, notes };
}
// The notes for the subcontractor's draft of a SWMS: the open points of its work that are not about who
// does or supplies what, once each, for stage 6 to put on the draft.
// A note with no subject of its own ("Party not named.", "Locations to be advised by the Contractor.")
// is said with the work it is about (messy round 8, wording 16).
const LOOSE_NOTE = /^(?:the\s+)?[a-z]+(?:\s+[a-z]+)?\s+(?:to be|not|is not|are not|tbc|tba|unknown|unclear)\b/i;
const BARE_NOTE = /^[A-Za-z-]+(?:\s+(?:and\s+)?[A-Za-z-]+){0,2}\.?$/;
// A note whose subject is only "they" or "it" ("Whether they will be instructed is open.") is said with the
// work it is about too (messy round 11, SiteLink wording 2).
const PRONOUN_NOTE = /^(?:whether\s+)?(?:they|it|this|these|those|its|their)\b/i;
// A note that starts with what is done, not what it is about ("Only applies if the builder grants an exemption.",
// "Takes over temporary infrastructure previously completed by others."), one that names its subject only as
// "their" ("Access and their role are not defined."), and a few words naming a task with no verb ("Sequencing with
// builder trades.") are said with the work they are about too (messy round 15, SiteLink wording 4).
const VERB_FIRST_NOTE = /^(?:only\s+|also\s+|still\s+|then\s+)?(?:applies|apply|takes|requires|needs|depends|includes|covers|involves|relies|assumes|excludes|subject to|may|might|could|would|will|must|should|shall|can|cannot|is|are|was|were|has|have|had|does|do|did|being|to be|not)\b/i;
const THEIR_NOTE = /^(?:\S+\s+){0,4}(?:their|its)\s/i;
const NO_VERB = /\b(?:is|are|was|were|be|been|being|has|have|had|will|would|may|might|must|can|could|should|shall|does|do|did|not|no)\b|\b\w{3,}ed\b/i;
const verbless = (note) => /^[A-Za-z]+ing\b/.test(note) && note.split(/\s+/).length <= 6 && !NO_VERB.test(note.replace(/[.\s]+$/, ''));
// A note about where the scope's own words sit, not about the work ("The line refers to ductwork.", "The clause sits
// under switchboard thermographic scanning."), means nothing to the subcontractor and is left out (messy round 16,
// SiteLink wording 1).
const ABOUT_THE_DOCUMENT = /^(?:the|this|that|its)\s+(?:scope\s+)?(?:line|lines|clause|clauses|sub-?clause|item|items|row|rows|entry|entries|section|heading|paragraph|reference|wording)\s+(?:refers?|relates?|sits?|appears?|falls?|belongs?|comes?|is (?:listed|placed|found|under|in|within|part of)|are (?:listed|placed|found|under|in|within))\b/i;
function draftNotes(rows) {
  const out = [];
  for (const row of rows || []) {
    const activity = wordsWithoutPrices(row.activity).replace(/[.\s]+$/, '');
    for (let note of splitPoint(wordsWithoutPrices(withoutConflictRefs(row.unknowns))).notes.map(sentence)) {
      if (ABOUT_THE_DOCUMENT.test(note)) continue;
      if (note && activity && ((LOOSE_NOTE.test(note) && note.split(/\s+/).length <= 8) || PRONOUN_NOTE.test(note) || VERB_FIRST_NOTE.test(note) || THEIR_NOTE.test(note))) note = `${activity}: ${note.replace(/^./, (letter) => letter.toLowerCase()).replace(/([^.])$/, '$1.')}`;
      // A bare word or two ("Dewatering.") says neither the work nor what is open (messy round 9, wording 8), nor
      // do a few words with no verb ("Sequencing with builder trades.").
      else if (note && activity && (BARE_NOTE.test(note) || verbless(note))) note = `${activity}: ${note.replace(/[.\s]+$/, '').replace(/^./, (letter) => letter.toLowerCase())} to be confirmed.`;
      // Every note ends with a full stop (messy round 11, SiteLink wording 2).
      if (note) note = note.replace(/([^.!?])$/, '$1.');
      if (note && !out.includes(note)) out.push(note);
    }
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
    const question = pointSentence(splitPoint(row.unknowns).asks.join('; '));
    if (!question) continue;
    if (out.some((point) => point.question === question && point.activity === row.activity)) continue;
    out.push({ activity: wordsWithoutPrices(row.activity), clause: wordsWithoutPrices(row.clause), question, duty: row.type === 'Duty' });
  }
  return out;
}

// Testing or commissioning the crew does on site ("hydraulic test and commissioning", "pressure test and
// flush the mains"), not managing, witnessing or documenting it.
function handsOnTesting(text) {
  return /\b(?:test\w*,?\s+(?:and\s+)?commission\w*|commission\w*\s+and\s+test\w*|pressure test\w*|(?:hydraulic|hydrostatic|leak|flow|water|gas) test\w*|flush\w*)\b/i.test(String(text || ''))
    && !/\b(?:witness\w*|attend\w*|manag\w*|plans?|itps?|documents?|documentation|records?|manuals?|audit\w*|train\w*|certif\w*|reports?|schedules?|submissions?)\b/i.test(String(text || ''));
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

// What the subcontractor is told about the high risk work in a SWMS on its list: what the lead's page
// says, "may need" included (messy round 9, blocker 2: the lead saw "This work may need a SWMS by law"
// and the subcontractor saw nothing), never that it may not need a SWMS (Goal 12: it is the list, no
// second guessing).
function sentHighRisk(flag) {
  const said = riskOf(flag);
  if (!said || !['yes', 'likely', 'depends'].includes(said.status)) return null;
  return { status: said.status, heading: said.heading, line: (said.lines || []).join('. ') };
}

// ---- Notes from the scope, and the lead's answers that settle them ----

// A note from the scope that one of the lead's answers settles is marked so, with the answer (messy
// round 8, blocker 3: "CCTV and Duress are listed as exclusions" beside the lead's answer that they are in
// the scope, and the subcontractor could not tell which stood). A note settles only on its own subject:
// the words after the work it names ("Install stormwater drainage system: the staging requirements are
// not defined" is about staging), matched against what the point asked. The same work, or words the
// work's name shares, are not enough (messy round 9, blocker 4: the stormwater staging note was marked
// settled by the answer on the sewer connection point, a point on the same line of the reading).
// Words that only name the work the point is about, or the scope's own headings and filler, are not its
// subject either (messy round 10, blocker 2: the flashing note was settled by the access panels answer,
// as both said "through" and "Exclusion"). Two subject words must be shared, one of them in what the
// point asked.
const NOTE_STOP = new Set(['this', 'that', 'with', 'from', 'they', 'their', 'there', 'which', 'while', 'where', 'whether', 'when', 'what', 'have', 'been', 'will', 'shall', 'must', 'also', 'into', 'only', 'other', 'others', 'than', 'said', 'says', 'listed', 'stated', 'given', 'scope', 'works', 'work', 'subcontractor', 'contractor', 'contractors', 'builder', 'clause', 'clauses', 'item', 'items', 'install', 'installs', 'installed', 'installation', 'provide', 'provides', 'provided', 'confirm', 'confirmed', 'includ', 'include', 'includes', 'included', 'exclud', 'yes',
  'requirement', 'defin', 'define', 'detail', 'specifi', 'specify', 'advis', 'advise', 'known', 'unknown', 'clear', 'unclear', 'state', 'note', 'supply', 'suppli', 'supplie',
  'through', 'exclusion', 'inclusion', 'specific', 'general', 'about', 'under', 'over', 'before', 'after', 'around', 'between', 'against', 'each', 'every', 'them', 'these', 'those', 'mechanical', 'hydraulic', 'servic', 'service', 'system', 'trade', 'trades',
  // Words that say only that something is open, never what (messy round 11, SiteLink blocker 2: the manholes
  // answer settled "Whether they will be instructed is open." on the storage tanks and the gas meter).
  'instruct', 'instruction', 'open', 'decid', 'decision', 'determin', 'pend', 'pending', 'option', 'variation', 'price', 'pric', 'yet', 'still', 'now', 'later', 'need', 'requir', 'whom', 'whose']);
const stems = (text) => new Set(String(text || '').toLowerCase().replace(/switchboards?/g, 'switch board').split(/[^a-z0-9]+/)
  .map((word) => word.replace(/(?:ies)$/, 'y').replace(/(?:ing|ed|es|s)$/, '')).filter((word) => word.length >= 4 && !NOTE_STOP.has(word)));
// The note's own subject: the words after "{the work}: ", when the note starts with the work it is about.
function noteSubject(entry) {
  const text = String((entry && entry.text) || '');
  const activity = String((entry && entry.activity) || '').replace(/[.\s]+$/, '').trim();
  if (activity && text.toLowerCase().startsWith(`${activity.toLowerCase()}:`)) return text.slice(activity.length + 1);
  const at = text.indexOf(': ');
  return at > 0 && at <= 80 && !/[.;]/.test(text.slice(0, at)) ? text.slice(at + 2) : text;
}
// The work a note names before its subject ("{the work}: ..."), or the work it is kept with.
function noteWork(entry) {
  const text = String((entry && entry.text) || '');
  const subject = noteSubject(entry);
  return subject.length < text.length ? text.slice(0, text.length - subject.length).replace(/:\s*$/, '').trim() : String((entry && entry.activity) || '').trim();
}
const sameWords = (a, b) => String(a || '').replace(/[.\s]+$/, '').replace(/\s+/g, ' ').trim().toLowerCase() === String(b || '').replace(/[.\s]+$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
// A note on who does the work: it names a party doing it.
const NOTE_WHO = /\b(?:(?:last|first|final|other|each|another|following|preceding|services?|builder['’]?s?)\s+(?:trades?|subcontractors?|contractors?)|by (?:the )?(?:others|builder|main contractor|head contractor|principal contractor|subcontractor|contractor)|whoever|responsib\w*|(?:the|a|an|which|other) part(?:y|ies))\b/i;
function withSettled(item, answers) {
  if (!item || !(item.draftNotes || []).length || !(answers || []).length) return item;
  const draftNotes = item.draftNotes.map((entry) => {
    const own = stems(noteSubject(entry));
    // A note that says only that something is open ("Whether they will be instructed is open.") has no
    // subject of its own: no answer settles it, unless the work it names is what the point was asked about,
    // by name or by two of its words, one of them in what the point asked (messy round 11, SiteLink blocker 2:
    // the manholes answer settled such notes on the storage tanks and the boundary gas meter).
    if (!own.size) {
      const work = noteWork(entry);
      const named = stems(work);
      const same = named.size && answers.find((answer) => sameWords(answer.activity, work) || ([...stems(`${answer.question} ${answer.activity}`)].filter((word) => named.has(word)).length >= 2 && [...stems(answer.question)].some((word) => named.has(word))));
      return same ? { ...entry, settled: same.answer } : entry;
    }
    // A note that says who does the work ("At shared penetrations the last trade to install seals the
    // penetration.") is settled by the lead's answer on who does that work, though its subject is the work the
    // point is about (messy round 16, SiteLink blocker 4: "You seal all fire services penetrations incl collars
    // and dampers as you go." left that note standing in Penetrations and core drilling, and the SWMS said both).
    const saysWho = NOTE_WHO.test(noteSubject(entry));
    const found = answers.find((answer) => {
      const work = stems(answer.activity);
      const subject = (text) => [...stems(text)].filter((word) => own.has(word) && !work.has(word));
      const asked = subject(answer.question).length;
      const said = subject(`${answer.question} ${answer.answer}`).length;
      // Two words of the note in the answer itself, one of them in what the point asked.
      const askedWords = stems(answer.question);
      const inAnswer = [...stems(answer.answer)].filter((word) => own.has(word));
      // Two words of the subject in the point, one of them in what it asked, or one in what it asked
      // about the same work.
      return (said >= 2 && asked >= 1) || (asked >= 1 && Boolean(entry.activity) && answer.activity === entry.activity)
        || (saysWho && inAnswer.length >= 2 && inAnswer.some((word) => askedWords.has(word)));
    });
    return found ? { ...entry, settled: found.answer } : entry;
  });
  return { ...item, draftNotes };
}

// Each note as plain words, once, with any price taken out. A note may be kept as words or as
// { note | text | question, activity, clause }.
function notesOf(list) {
  const out = [];
  for (const entry of Array.isArray(list) ? list : []) {
    const raw = typeof entry === 'string' ? entry : entry && typeof entry === 'object' ? entry.note || entry.text || entry.question || '' : '';
    const text = sentence(withoutConflictRefs(quoteWithoutPrices(String(raw || '')))).replace(/([^.!?])$/, '$1.');
    // Notes kept before messy round 16 are read by the same rules: a note about the scope's own lines is left out.
    const own = text.replace(/^[^:]{3,120}:\s+/, '');
    if (!text || out.some((one) => one.text === text) || ABOUT_THE_DOCUMENT.test(text) || ABOUT_THE_DOCUMENT.test(own)) continue;
    out.push({ text, clause: entry && typeof entry === 'object' ? wordsWithoutPrices(entry.clause || '') : '', ...(entry && typeof entry === 'object' && entry.activity ? { activity: wordsWithoutPrices(entry.activity) } : {}) });
  }
  return out.slice(0, 20);
}

// The list as the subcontractor will be given it: the project, the SWMS kept on the list with the
// work each covers, the points the lead answered, and the site details. Removed and set-aside SWMS,
// their points and unanswered points are left out. The same function will build what is sent
// (stage 5), so the preview is the list.
// withNotes: the lead's preview also shows the notes each SWMS's draft opens with (messy round 10, blocker
// 2). The list page and the email do not show them (sl6 decision 6): they are for the drafts.
function subcontractorView({ project, org, subcontract, items, points, siteDetails, fields, withNotes = false }) {
  const all = items || [];
  const kept = all.filter((item) => !item.removed_at && !item.removedAt);
  const answered = (points || []).filter((point) => String(point.answer || '').trim() && pointInPlay(point, all));
  const answers = answered.map((point) => ({ activity: sentence(point.activity), clause: point.clause, question: pointSentence(point.question), answer: require('./sitelink-answers').capitalSentences(String(point.answer).trim(), { stop: true }), by: point.answered_by_name || '' }));
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
      clauses: clausesOf(item),
      alsoCovers: all.filter((other) => other.removed_why === 'folded' && (other.removed_at || other.removedAt) && other.item && other.item.foldedInto && other.item.foldedInto === item.package).map((other) => nameWithoutPrices(other.title)),
      added: item.source === 'added',
      // The notes from the scope its draft opens with, each marked settled where an answer settles it, so
      // the lead sees in the preview what the subcontractor will (messy round 10, blocker 2).
      ...(withNotes ? { notes: withSettled({ draftNotes: notesOf(withFolded(item, all).draftNotes) }, answers).draftNotes.map(({ text, clause, settled }) => ({ text, clause, ...(settled ? { settled } : {}) })) } : {}),
    })),
    answers,
    siteDetails: siteDetails && siteDetails.rev ? {
      rev: siteDetails.rev,
      list: (fields || []).map((field) => ({ label: field.label, value: siteDetails.details[field.key] })).filter((entry) => (Array.isArray(entry.value) ? entry.value.length : String(entry.value || '').trim())),
    } : null,
  };
}

module.exports = { handsOnTesting, withSettled, notesOf, pointSentence, withoutConflictRefs, packageTitles, clausesOf, activityNamed, foldedNamed, MONEY, COMMERCIAL_STRICT, COMMERCIAL_QUOTE, hasMoney, hasPrice, quotePriced, quoteWithoutPrices, wordsWithoutPrices, nameWithoutPrices, scrubReading, scrubChecks, listItems, listPoints, splitPoint, draftNotes, packWords, REMOVED_WHY, foldedWhy, highRiskOf, plantFromWords, clauseList, pointItem, pointInPlay, sentence, subcontractorView, riskOf, riskJoined, withFolded, asksWho, DEFECTS_PACKAGE, noJobSteps, draftKinds };
