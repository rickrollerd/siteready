// Worker sign-on pages taken out of an uploaded SWMS before it is sent to the AI for the builder
// check (owner decision, 6 October 2026). Workers' names with their employer, signatures,
// sign-on times, reading records and "I have read and understood" tables never leave SiteReady.
// The document is read page by page (PDF, or pasted text with page breaks) or section by
// section (Word: page breaks and headings), and each part is kept, cut at its sign-on heading,
// or removed whole. Where a sign-on cannot be cut out cleanly (sign-on rows mixed into the
// method pages, or a page that is only a picture and cannot be read), the upload is refused.
// The number of workers signed on is counted here, before anything is removed, so the check's
// H7 still knows a sign-on exists without any name being sent.
const JSZip = require('jszip');
const { PDFParse } = require('pdf-parse');
const { scopeText } = require('./scope-text');

const MAX_TEXT = 400000;

function fail(status, message) {
  return Object.assign(new Error(message), { status, publicMessage: true });
}

const REFUSED = 'This SWMS has worker sign-on details (names, signatures or sign-on times) mixed in with the SWMS itself, so it was not sent to be read. Remove the sign-on pages and upload it again.';
const PICTURE = (where) => `${where} is only a picture, such as a scanned page, so it cannot be checked for worker names and signatures. Remove the sign-on pages, and any scanned pages, and upload it again.`;

// ---- What a sign-on looks like ----

const BULLET = /^(?:[•▪●◦‣*–-]\s|\d+[.)]\s)/;
const clean = (line) => String(line).replace(/\s+/g, ' ').trim();
const lowerWords = (line) => (line.match(/(?:^|\s)[a-z][a-z'’-]+/g) || []).length;

// A heading for a sign-on: short, not a sentence, naming a sign-on, register or declaration.
// "Sign off" and "sign in" are left out: a step such as "Engineer sign-off" is not a sign-on.
const SIGN_ON_TITLE = /\bsign[- ]?on\b|\bsign[- ]?in (?:sheet|register|record)\b|\b(?:workers?'?|employees?|crew|personnel|staff|operatives?|swms)\s+(?:acknowledg\w*|declarations?|attendance|signatures?)\b|\b(?:acknowledg\w*|attendance|induction|toolbox|briefing) (?:sheet|form|register|record)\b|\b(?:reading record|read and understood)\b|\bsignatures? (?:of|by) workers?\b/i;
// The person who prepared, reviewed or approved the SWMS signs it too; that is not a worker sign-on.
const AUTHOR = /\b(?:prepared|approved|reviewed|authori[sz]ed|issued|endorsed|accepted|verified|checked)\b|\bprincipal contractor\b|\bmanager\b/i;
// The header row of a sign-on table: a name and a signature, with an employer, date or time.
const TABLE_HEADER = (line) => !AUTHOR.test(line) && /\bnames?\b/i.test(line) && /\bsign(?:ature|ed)?s?\b/i.test(line)
  && /\b(?:company|companies|employer|business|firm|contractor|date|time|trade|position|role|occupation|licen[cs]e|card|ticket)\b/i.test(line) && line.length <= 160 && !/\.$/.test(line);
// A worker's own declaration: "I have read and understood", "By signing, I confirm" and the like.
const DECLARATION = /\b(?:I|We)\s+(?:have|confirm|acknowledge|understand|agree|declare|was|were)\b[^.]{0,80}\b(?:read|understood|understand|explained|consulted|briefed|inducted|follow)\b|^\s*by signing\b/i;
// The reading record SiteReady itself once printed under a worker's name, and "explained by".
const READING = /\bRead in [A-Z][a-z]+|\bsections? viewed\b|\bcheck questions? passed\b|\bExplained by [^()]{1,80}\(supervisor\)/;

const isTitle = (line) => line.length <= 70 && !/[.;]$/.test(line) && !BULLET.test(line) && SIGN_ON_TITLE.test(line) && !AUTHOR.test(line) && lowerWords(line) <= 4;
const signOnStart = (line) => isTitle(line) || TABLE_HEADER(line) || DECLARATION.test(line);
// Anything in a sign-on part about signing, reading or being briefed is the sheet's own wording.
const SHEET_WORDING = /\b(?:sign\w*|read|understood|understand|explained|consulted|inducted|briefed|acknowledg\w*|declar\w*|agree\w*)\b/i;
// A reading record or "explained by" note, taken off a row before the row is counted.
const NOTE = /\bRead in [^\t]*|\bExplained by [^()\t]{1,80}\(supervisor\)/g;

const DATE_OR_TIME = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{1,2}(?:st|nd|rd|th)? (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{2,4}\b|\b\d{1,2}[:.]\d{2}\s?(?:am|pm)?\b|\b\d{1,2}\s?(?:am|pm)\b/i;
// A row of a sign-on table: a date or time, or a few capitalised words (a name and employer).
const NAME_LIKE = /^(?:\d+[.)]?\s+)?(?:[A-Z][A-Za-z'’.-]*\s+){1,7}[A-Z][A-Za-z'’.-]*$/;
const SWMS_WORDS = /\b(?:swms|safe work|method|statement|project|task|site|job|hazards?|controls?|risks?|steps?|ppe|emergency|revision|page)\b/i;
const rowLike = (line) => !SWMS_WORDS.test(line) && (DATE_OR_TIME.test(line) || NAME_LIKE.test(line.replace(/\t/g, ' ')));

// A line of the SWMS itself: a sentence about the work, or a bullet or numbered line of one.
// Company names often carry trade words ("Edge Scaffolding"), so a single word is not enough.
const WORK_WORDS = /\b(?:hazards?|controls?|risks?|ppe|emergency|first aid|harness\w*|guard ?rails?|edge protection|scaffold\w*|exclusion zones?|isolat\w*|licen[cs]\w*|permits?|barricad\w*|respirators?|cranes?|ewps?|ladders?|excavat\w*|trench\w*|asbestos|silica|electric\w*|falls?|falling|lift\w*|plant|equipment|tools?|install\w*|inspect\w*|wear|used?|steps?)\b/i;
const swmsLine = (line) => (lowerWords(line) >= 4 && (WORK_WORDS.test(line) || BULLET.test(line))) || lowerWords(line) >= 8;

// ---- Reading the document into parts ----

// Each PDF page, with whether a page with no text holds a picture.
async function pdfUnits(data) {
  const parser = new PDFParse({ data });
  try {
    let pages;
    try {
      pages = (await parser.getText()).pages;
    } catch {
      throw fail(400, 'The PDF could not be read. Paste the SWMS instead.');
    }
    const units = pages.map((page) => ({ kind: 'page', label: `Page ${page.num}`, lines: String(page.text || '').replace(/^-- \d+ of \d+ --$/gm, '').split('\n'), images: 0 }));
    if (!units.some((unit) => unit.lines.some((line) => line.trim()))) throw fail(400, 'The PDF has no text to read, which happens with a scanned page. Paste the SWMS instead.');
    const blank = units.filter((unit) => !unit.lines.some((line) => line.trim()));
    if (blank.length) {
      const images = await parser.getImage({ imageBuffer: false, imageDataUrl: false, imageThreshold: 0 }).catch(() => null);
      for (const unit of blank) {
        const page = images && images.pages.find((item) => `Page ${item.pageNumber}` === unit.label);
        // A page whose pictures could not be counted is treated as a picture.
        unit.images = images ? (page ? page.images.length : 0) : 1;
      }
    }
    return units;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (text) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => (name[0] === '#'
  ? String.fromCodePoint(name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1))) : ENTITIES[name] || whole));
const on = (attributes) => !/w:val="(?:0|false|off)"/.test(attributes);

// The Word file's body, split at page breaks and at headings. A table row is one line, its cells
// separated by tabs, so a sign-on table is classified row by row and never split.
async function docxUnits(data) {
  let xml;
  try {
    const zip = await JSZip.loadAsync(data);
    xml = await zip.file('word/document.xml').async('string');
  } catch {
    throw fail(400, 'The Word file could not be read. Save it again as .docx, or paste the SWMS.');
  }
  const body = (/<w:body\b[^>]*>([^]*)<\/w:body>/.exec(xml) || [, ''])[1]
    // Word keeps a copy of a text box for older readers; only one copy is read.
    .replace(/<mc:Fallback\b[^]*?<\/mc:Fallback>/g, '');
  const units = [];
  let unit = null;
  const start = () => {
    unit = { kind: 'section', label: `Section ${units.length + 1}`, lines: [], images: 0 };
    units.push(unit);
  };
  start();
  const paragraphs = [];
  const tables = [];
  let run = null;
  let inText = false;
  const TOKEN = /<(\/?)([a-zA-Z]+:[a-zA-Z]+)\b([^>]*?)(\/?)>|([^<]+)/g;
  let match;
  while ((match = TOKEN.exec(body))) {
    const [, closing, tag, attributes, empty, text] = match;
    const para = paragraphs[paragraphs.length - 1];
    if (text !== undefined) {
      if (inText && para) {
        para.text += decode(text);
        if (run) run.text = true;
      }
      continue;
    }
    if (tag === 'w:t' && !empty) { inText = !closing; continue; }
    if (tag === 'w:p') {
      if (!closing) {
        paragraphs.push({ text: '', breakBefore: false, breakAfter: false, heading: false, bold: true, anyRun: false, images: 0 });
        if (empty) paragraphs.pop();
        continue;
      }
      const done = paragraphs.pop();
      if (!done) continue;
      const line = done.text;
      const outer = paragraphs[paragraphs.length - 1];
      // A paragraph inside a text box belongs to the paragraph holding the box.
      if (outer) { outer.text += ` ${line}`; outer.images += done.images; continue; }
      const table = tables[tables.length - 1];
      if (table) { table.cell.push(line); table.images += done.images; continue; }
      const titled = done.heading || (done.anyRun && done.bold && clean(line).length > 0 && clean(line).length <= 80 && !/[.;:]$/.test(clean(line)));
      if ((done.breakBefore || titled) && (unit.lines.some((item) => item.trim()) || unit.images)) start();
      unit.lines.push(line);
      unit.images += done.images;
      if (done.breakAfter) start();
      continue;
    }
    switch (tag) {
      case 'w:r':
        if (!closing && !empty) run = { bold: false, text: false };
        else if (closing && run) {
          if (para && run.text) { para.anyRun = true; if (!run.bold) para.bold = false; }
          run = null;
        }
        break;
      case 'w:b':
        if (run && !closing && on(attributes)) run.bold = true;
        break;
      case 'w:tab':
        if (para && !closing && run) para.text += '\t';
        break;
      case 'w:br':
      case 'w:cr':
        if (para && !closing) {
          if (/w:type="page"/.test(attributes)) {
            if (clean(para.text)) para.breakAfter = true; else para.breakBefore = true;
          } else para.text += ' ';
        }
        break;
      case 'w:pageBreakBefore':
        if (para && !closing && on(attributes)) para.breakBefore = true;
        break;
      case 'w:sectPr':
        // A section break in a paragraph's properties ends the page.
        if (para && !closing) para.breakAfter = true;
        break;
      case 'w:pStyle':
        if (para && /w:val="[^"]*(?:heading|title)[^"]*"/i.test(attributes)) para.heading = true;
        break;
      case 'w:drawing':
      case 'w:pict':
        if (para && !closing) para.images += 1;
        break;
      case 'w:tbl':
        if (!closing) tables.push({ rows: [], row: null, cell: null, images: 0 });
        else {
          const table = tables.pop();
          if (!table) break;
          const parent = tables[tables.length - 1];
          if (parent && parent.cell) { parent.cell.push(table.rows.join(' ')); parent.images += table.images; } else {
            unit.lines.push(...table.rows);
            unit.images += table.images;
          }
        }
        break;
      case 'w:tr':
        if (tables.length) {
          const table = tables[tables.length - 1];
          if (!closing) table.row = [];
          else if (table.row) { table.rows.push(table.row.join('\t')); table.row = null; }
        }
        break;
      case 'w:tc':
        if (tables.length) {
          const table = tables[tables.length - 1];
          if (!closing) table.cell = [];
          else if (table.cell && table.row) { table.row.push(clean(table.cell.join(' '))); table.cell = null; }
        }
        break;
      default:
        break;
    }
  }
  return units.filter((item) => item.lines.some((line) => line.trim()) || item.images);
}

// The document's parts: pages or sections, each a list of lines.
async function documentUnits(body) {
  const file = body.file && typeof body.file === 'object' ? body.file : null;
  const name = file ? String(file.name || '').toLowerCase() : '';
  const pasted = typeof body.text === 'string' && body.text.trim();
  if (!pasted && file && typeof file.data === 'string' && file.data) {
    const data = Buffer.from(file.data, 'base64');
    if (name.endsWith('.pdf')) return { units: await pdfUnits(data), pasted: false };
    if (name.endsWith('.docx')) return { units: await docxUnits(data), pasted: false };
  }
  // Pasted text and plain text files: a form feed starts a new page.
  const text = await scopeText(body);
  const pages = text.split('\f');
  return { units: pages.map((page, index) => ({ kind: pages.length > 1 ? 'page' : 'section', label: `Page ${index + 1}`, lines: page.split('\n'), images: 0 })), pasted: text };
}

// ---- Taking the sign-on out ----

// Lines repeated on several pages are running headers and footers ("Page 3 of 9", the title).
// A sign-on heading is never one, so a sign-on sheet's repeated table header is still found.
function runningLines(units) {
  const key = (line) => clean(line).toLowerCase().replace(/\d+/g, '#');
  const seen = new Map();
  for (const unit of units) {
    for (const line of new Set(unit.lines.map(key).filter(Boolean))) seen.set(line, (seen.get(line) || 0) + 1);
  }
  return (line) => {
    const text = clean(line);
    return !text || /^page #+(?: of #+)?$/i.test(key(text)) || (units.length >= 3 && seen.get(key(text)) >= 2 && !signOnStart(text));
  };
}

// The workers on a removed sign-on: rows with a date or time, or failing those, rows that read
// like a name. Counted only; the rows themselves are dropped.
function countRows(lines) {
  const rows = lines.filter((line) => !signOnStart(line)).map((line) => clean(line.replace(NOTE, ' '))).filter((line) => line && !SHEET_WORDING.test(line));
  const dated = rows.filter((line) => DATE_OR_TIME.test(line)).length;
  return dated || rows.filter((line) => NAME_LIKE.test(line)).length;
}

// Splits each part into what is kept and what is a sign-on. Throws where they cannot be split.
function stripUnits(units) {
  const running = runningLines(units);
  const otherText = (unit) => clean(units.filter((item) => item !== unit).map((item) => item.lines.join(' ')).join(' ')).toLowerCase();
  const kept = [];
  const summary = { pagesRemoved: 0, sectionsRemoved: 0, signOns: 0, found: false };
  let continuing = false;
  for (const unit of units) {
    const lines = unit.lines.map((line) => line.replace(/\r/g, ''));
    const texts = lines.map(clean);
    const known = (() => {
      let other = null;
      // A line made only of text found elsewhere in the document (the task, the site, the revision).
      return (text) => {
        other = other === null ? otherText(unit) : other;
        const parts = text.split(/\s+·\s+|\t/).map((part) => clean(part).toLowerCase()).filter((part) => part.length >= 3);
        return parts.length > 0 && parts.every((part) => other.includes(part));
      };
    })();
    const content = (index) => !running(lines[index]) && texts[index] && swmsLine(texts[index]) && !SHEET_WORDING.test(texts[index]) && !READING.test(texts[index]) && !known(texts[index]);
    if (!texts.some(Boolean)) {
      if (unit.images) throw fail(422, PICTURE(unit.kind === 'page' ? unit.label : 'Part of this Word file'));
      continuing = false;
      continue;
    }
    // A sign-on table carried over from the page before, without its heading: its rows come first.
    let from = 0;
    if (continuing) {
      while (from < lines.length && (running(lines[from]) || rowLike(texts[from]) || READING.test(texts[from]))) from += 1;
      const rows = lines.slice(0, from).filter((line, index) => !running(lines[index]) && texts[index]);
      if (rows.length) {
        summary.signOns += countRows(rows);
        summary.found = true;
      }
    }
    const head = texts.findIndex((text, index) => index >= from && !running(lines[index]) && signOnStart(text));
    if (head < 0) {
      const rest = lines.slice(from);
      if (from > 0 && !rest.some((line, index) => !running(line) && clean(line))) {
        summary[unit.kind === 'page' ? 'pagesRemoved' : 'sectionsRemoved'] += 1;
        continue;
      }
      if (from > 0) summary.sectionsRemoved += 1;
      continuing = false;
      kept.push({ unit, lines: rest });
      continue;
    }
    // Everything from the sign-on heading to the end of the part must be the sign-on itself.
    const after = lines.slice(head);
    if (after.some((line, index) => content(head + index))) throw fail(422, REFUSED);
    summary.found = true;
    summary.signOns += countRows(after.filter((line, index) => clean(line) && !running(line) && !known(texts[head + index])));
    continuing = true;
    const before = lines.slice(from, head);
    const preamble = !before.some((line, index) => content(from + index));
    if (preamble) {
      summary[unit.kind === 'page' ? 'pagesRemoved' : 'sectionsRemoved'] += 1;
      continue;
    }
    summary.sectionsRemoved += 1;
    kept.push({ unit, lines: before });
  }
  // What is left must carry no sign-on at all, or the sign-on was mixed into the method.
  for (const { lines } of kept) {
    if (lines.some((line) => signOnStart(clean(line)) || READING.test(line))) throw fail(422, REFUSED);
  }
  return { kept, summary };
}

// The SWMS text to send to the AI, with every sign-on taken out, and the counts of what was
// removed. Nothing here keeps or logs the removed text.
async function swmsWithoutSignOns(body) {
  const { units, pasted } = await documentUnits(body);
  const { kept, summary } = stripUnits(units);
  const removed = summary.pagesRemoved + summary.sectionsRemoved;
  const text = removed === 0 && pasted ? pasted : kept.map(({ lines }) => lines.join('\n').trim()).filter(Boolean).join('\n\n');
  return { text: text.slice(0, MAX_TEXT), ...summary };
}

module.exports = { swmsWithoutSignOns, stripUnits, docxUnits, pdfUnits, REFUSED };
