// The scope review report: the AI's reading of a scope of works set out plainly, for the
// subcontractor to check and take to the builder. Five parts: the work this subcontractor
// does by work package, work the scope gives to others, clauses that conflict, unknowns that
// change the risk, and duties. The Word file follows the SWMS file's style (docx-draft.js).
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, VerticalAlign, Footer, AlignmentType,
} = require('docx');

const FONT = 'Calibri';
const INK = '1C2430';
const MUTED = '5C6773';
const LINE = 'D5DBE3';
const HEAD = 'F4F6F8';
// A4 portrait: a report is read, not filled in on site.
const PAGE_LONG = 16838;
const PAGE_SHORT = 11906;
const MARGIN = 900;
const CONTENT_WIDTH = PAGE_SHORT - 2 * MARGIN;

const hair = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: hair, bottom: hair, left: hair, right: hair };

// Characters a Word file cannot hold are replaced, so the file always opens.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const safe = (text) => String(text || '').toWellFormed().replace(CONTROL, ' ');
const clean = (text) => String(text || '').replace(/\s+/g, ' ').trim();

const { hrcwSummary, HRCW_NOTE } = require('./public/scope-hrcw');

const NOTE = 'This report is the AI\'s reading of the scope of works. Check every item against the scope before you rely on it. Raise the conflicts and unknowns with the builder before you price or start the work.';
const CONFLICT_ADVICE = 'Raise each of these with the builder before you price or start the work. Ask which clause applies, and get the answer in writing.';

// The report's content, worked out from the reading. Kept apart from the Word file so the
// page and the tests can use it too.
function reportSections(reading) {
  const activities = (reading && Array.isArray(reading.activities) ? reading.activities : []).filter((row) => row && clean(row.activity));
  const packages = reading && Array.isArray(reading.packages) ? reading.packages : [];
  const steps = new Map(packages.map((item) => [item.package, item]));
  const row = (item) => ({
    activity: clean(item.activity),
    type: clean(item.type),
    clause: clean(item.clause),
    quotes: (item.quotes || []).map(clean).filter(Boolean),
    where: clean(item.where),
  });

  const work = new Map();
  for (const item of activities.filter((entry) => entry.type !== 'Duty')) {
    const name = clean(item.package) || 'Other work';
    if (!work.has(name)) work.set(name, []);
    work.get(name).push(row(item));
  }

  const byOthers = (reading && Array.isArray(reading.byOthers) ? reading.byOthers : []).filter((item) => item && clean(item.work)).map((item) => ({
    work: clean(item.work), party: clean(item.party), clause: clean(item.clause), quotes: (item.quotes || []).map(clean).filter(Boolean),
  }));
  // Job steps in this subcontractor's packages that the scope gives to someone else.
  for (const item of packages) {
    for (const entry of item.byOthers || []) {
      if (!clean(entry.step)) continue;
      byOthers.push({ work: `${clean(entry.step)} (in ${clean(item.package)})`, party: clean(entry.party), clause: clean(entry.clause), quotes: clean(entry.says) ? [clean(entry.says)] : [] });
    }
  }

  // The high risk construction work each package's SWMS would list (ai-scope.js packageHighRisk).
  const flags = new Map((reading && Array.isArray(reading.highRisk) ? reading.highRisk : []).map((item) => [item.package, item]));
  return {
    work: [...work].map(([name, rows]) => ({ package: name, rows, unmatched: ((steps.get(name) || {}).unmatched || []).map(clean).filter(Boolean), highRisk: flags.has(name) ? hrcwSummary(flags.get(name)) : null })),
    byOthers,
    conflicts: (reading && Array.isArray(reading.conflicts) ? reading.conflicts : []).filter(Boolean).map((item) => ({
      clauseA: clean(item.clauseA), quoteA: clean(item.quoteA), clauseB: clean(item.clauseB), quoteB: clean(item.quoteB), why: clean(item.why), confidence: clean(item.confidence),
    })),
    unknowns: activities.filter((item) => clean(item.unknowns)).map((item) => ({ activity: clean(item.activity), clause: clean(item.clause), unknowns: clean(item.unknowns), duty: item.type === 'Duty' })),
    duties: activities.filter((item) => item.type === 'Duty').map(row),
  };
}

function run(text, options = {}) {
  return new TextRun({
    text: safe(text),
    font: FONT,
    size: options.size || 22,
    bold: Boolean(options.bold),
    color: options.color || INK,
    italics: Boolean(options.italics),
  });
}

function para(text, options = {}) {
  return new Paragraph({
    spacing: { before: options.before ?? 0, after: options.after ?? 80, line: 276 },
    children: [run(text, options)],
  });
}

// A cell holds one or more lines; each line is plain text, or { text, italics, bold }.
function cell(lines, width, options = {}) {
  const list = (Array.isArray(lines) ? lines : [lines]).map((line) => (typeof line === 'object' && line ? line : { text: line }));
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    verticalAlign: VerticalAlign.TOP,
    shading: options.fill ? { fill: options.fill } : undefined,
    children: (list.length ? list : [{ text: ' ' }]).map((line, index) => new Paragraph({
      spacing: { before: index ? 60 : 0, after: 0, line: 240 },
      children: [run(line.text || ' ', { size: 20, bold: options.bold || line.bold, italics: line.italics, color: line.color })],
    })),
  });
}

// A table without labels has no header row.
function table(labels, widths, rows) {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      ...(labels ? [new TableRow({ tableHeader: true, cantSplit: true, children: labels.map((label, index) => cell(label, widths[index], { bold: true, fill: HEAD })) })] : []),
      ...rows.map((cells) => new TableRow({ cantSplit: true, children: cells.map((lines, index) => cell(lines, widths[index])) })),
    ],
  });
}

const heading = (text) => para(text, { bold: true, size: 28, before: 360, after: 120 });
const subheading = (text) => para(text, { bold: true, size: 24, before: 240, after: 80 });
const quoted = (quotes) => quotes.map((quote) => ({ text: `"${quote}"`, italics: true }));
const none = (text) => para(text, { color: MUTED, italics: true });

const WIDTHS = [3300, 1900, CONTENT_WIDTH - 5200];

function workBlocks(sections, options = {}) {
  const out = [heading('1. The work this subcontractor does')];
  if (!sections.work.length) return [...out, none('The AI found no site or off-site work for this subcontractor.')];
  out.push(para('Grouped by work package. Each activity has its clause and the words the scope uses.', { color: MUTED }));
  if (sections.work.some((pack) => pack.highRisk)) out.push(para(`${HRCW_NOTE}${options.state && options.state.instrument ? ` The categories are those of the ${options.state.instrument}.` : ''}`, { color: MUTED }));
  for (const pack of sections.work) {
    out.push(subheading(`${pack.package} (${pack.rows.length} ${pack.rows.length === 1 ? 'activity' : 'activities'})`));
    if (pack.highRisk) {
      out.push(para(`${pack.highRisk.heading}.`, { bold: true, size: 20, after: 40 }));
      for (const line of pack.highRisk.lines) out.push(para(`${/[.]$/.test(line) ? line : `${line}.`}`, { size: 20, after: 40 }));
    }
    out.push(table(['Activity', 'Clause', 'The scope says'], WIDTHS, pack.rows.map((item) => [
      [item.activity, ...(item.type === 'Off-site work' ? [{ text: 'Off-site work', color: MUTED }] : []), ...(item.where ? [{ text: `Where: ${item.where}`, color: MUTED }] : [])],
      item.clause || 'Not given',
      quoted(item.quotes),
    ])));
    if (pack.unmatched.length) out.push(para(`No job steps in SiteReady's library for: ${pack.unmatched.join('; ')}. Add the steps for these to the SWMS yourself.`, { color: MUTED, size: 20, before: 80 }));
  }
  return out;
}

function byOthersBlocks(sections) {
  const out = [heading('2. Work the scope gives to others')];
  if (!sections.byOthers.length) return [...out, none('The AI found no work the scope gives to others.')];
  out.push(para('This work is not yours under the scope. If your crew will do any of it, agree it with the builder and add it to your SWMS.', { color: MUTED }));
  out.push(table(['Work', 'By', 'Clause and wording'], [3300, 1900, CONTENT_WIDTH - 5200], sections.byOthers.map((item) => [
    item.work,
    item.party || 'Not named',
    [item.clause || 'Clause not given', ...quoted(item.quotes)],
  ])));
  return out;
}

function conflictBlocks(sections) {
  const out = [heading('3. Clauses that conflict')];
  if (!sections.conflicts.length) return [...out, none('The AI found no clauses that conflict.')];
  out.push(para(CONFLICT_ADVICE, { color: MUTED }));
  sections.conflicts.forEach((item, index) => {
    out.push(subheading(`Conflict ${index + 1}: ${item.clauseA || 'Clause A'} and ${item.clauseB || 'Clause B'}`));
    out.push(table(null, [2400, CONTENT_WIDTH - 2400], [
      [{ text: `Clause A (${item.clauseA || 'not given'}) says`, bold: true }, quoted([item.quoteA])],
      [{ text: `Clause B (${item.clauseB || 'not given'}) says`, bold: true }, quoted([item.quoteB])],
      [{ text: 'Why this matters', bold: true }, item.why],
      [{ text: 'Confidence', bold: true }, item.confidence || 'Not given'],
    ]));
  });
  return out;
}

function unknownBlocks(sections) {
  const out = [heading('4. Unknowns that change the risk')];
  if (!sections.unknowns.length) return [...out, none('The AI found no unknowns.')];
  out.push(para('Find these out from the builder or on site before the SWMS is finished. Each one can change the hazards and the controls.', { color: MUTED }));
  out.push(table(['Activity', 'Clause', 'Not yet known'], WIDTHS, sections.unknowns.map((item) => [
    [item.activity, ...(item.duty ? [{ text: 'Duty', color: MUTED }] : [])],
    item.clause || 'Not given',
    item.unknowns.split(/\s*;\s*/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)),
  ])));
  return out;
}

function dutyBlocks(sections) {
  const out = [heading('5. Duties')];
  if (!sections.duties.length) return [...out, none('The AI found no duties.')];
  out.push(para('Supervision, inspections, records, meetings, testing and similar duties. They are part of the job but are not site work, so they do not need a SWMS of their own.', { color: MUTED }));
  out.push(table(['Duty', 'Clause', 'The scope says'], WIDTHS, sections.duties.map((item) => [item.activity, item.clause || 'Not given', quoted(item.quotes)])));
  return out;
}

// How many packages are high risk construction work, are likely to be, may be, or have none found.
function highRiskCount(work) {
  const of = (status) => work.filter((pack) => pack.highRisk && pack.highRisk.status === status).length;
  const parts = [
    [of('yes'), 'high risk: a SWMS is required by law'],
    [of('likely'), 'likely high risk'],
    [of('depends'), 'may be high risk'],
    [of('none'), 'none found'],
  ].filter(([n]) => n).map(([n, text]) => `${n} ${text}`);
  return `${parts.join('; ')} (of ${work.length} work ${work.length === 1 ? 'package' : 'packages'})`;
}

function summaryRows(sections, options) {
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const activities = sections.work.reduce((sum, pack) => sum + pack.rows.length, 0);
  return [
    ['Prepared for', options.company && options.company.name ? options.company.name : 'Your business'],
    ['Date', options.date || ''],
    ['Your work', `${count(activities, 'activity', 'activities')} in ${count(sections.work.length, 'work package', 'work packages')}`],
    ...(sections.work.some((pack) => pack.highRisk) ? [['High risk construction work', highRiskCount(sections.work)]] : []),
    ['Work by others', count(sections.byOthers.length, 'item', 'items')],
    ['Conflicts', count(sections.conflicts.length, 'conflict', 'conflicts')],
    ['Unknowns', `${count(sections.unknowns.length, 'activity', 'activities')} with something not yet known`],
    ['Duties', count(sections.duties.length, 'duty', 'duties')],
  ];
}

function childrenFor(reading, options = {}) {
  const sections = reportSections(reading);
  const checks = options.checks || {};
  const unmatched = (checks.quotesNotFound || []).length + (checks.quotesShortened || []).length;
  return [
    para('Scope review report', { bold: true, size: 36, after: 120 }),
    para(NOTE, { color: MUTED, size: 20, after: 200 }),
    ...(checks.passed === false ? [para(`Some of the AI's quotes could not be matched word for word to the document (${unmatched}). Check those items against the scope.`, { bold: true, size: 20, after: 200 })] : []),
    table(null, [2400, CONTENT_WIDTH - 2400], summaryRows(sections, options).map(([label, value]) => [{ text: label, bold: true }, value])),
    ...workBlocks(sections, options),
    ...byOthersBlocks(sections),
    ...conflictBlocks(sections),
    ...unknownBlocks(sections),
    ...dutyBlocks(sections),
  ];
}

function today() {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Brisbane' }).format(new Date());
}

// options: company (name on the report), checks (the reading's check against the brief), date,
// state (whose regulation names the high risk construction work).
async function reportToDocx(reading, options = {}) {
  const settings = { ...options, date: options.date || today() };
  const document = new Document({
    creator: 'SiteReady',
    title: 'Scope review report',
    styles: { default: { document: { run: { font: FONT, size: 22, color: INK } } } },
    sections: [{
      properties: { page: { size: { width: PAGE_SHORT, height: PAGE_LONG }, margin: { top: 850, bottom: 850, left: MARGIN, right: MARGIN } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.LEFT,
            spacing: { before: 80 },
            children: [run('Scope review report prepared with SiteReady from the AI\'s reading of the scope. Check it against the scope before you rely on it.', { size: 16, color: MUTED })],
          })],
        }),
      },
      children: childrenFor(reading, settings),
    }],
  });
  return Packer.toBuffer(document);
}

module.exports = { reportSections, reportToDocx, CONFLICT_ADVICE };
