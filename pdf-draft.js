// The same SWMS as the Word file, as a PDF for people who only need to read,
// print or send it. Worker signatures collected in the app are printed on it.
const PDFDocument = require('pdfkit');
const { tableRows, isHoldPoint, tableHead, tableTitle, tableNote } = require('./designs');
const { tableRows: substanceRows, notRequiredLine, TABLE_TITLE: SUBSTANCES_TITLE, TABLE_HEAD: SUBSTANCES_HEAD, TABLE_NOTE: SUBSTANCES_NOTE } = require('./substances');
const { fitLogo } = require('./logo');
const { MATRIX, LIKELIHOOD } = require('./register');
const { revisionText, sharedNote, reviewInvite, reviewedNote, PC_OUTCOMES, PC_TEXT, conditionLines } = require('./docx-draft');
const { checkedRows, preparedFromCheck } = require('./human-check');
const { stepPpeRows } = require('./step-ppe');

const INK = '#1C2430';
const MUTED = '#5C6773';
const LINE = '#D5DBE3';
const HEAD = '#F4F6F8';
const MARGIN = 40;
// The footer's three lines sit in the bottom margin, below everything else on the page.
const FOOTER_SPACE = 38;
const PAD = 4;

// The built-in PDF fonts cover Western European text. Anything else is replaced
// with a near equivalent so it prints instead of disappearing.
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const SWAPS = { '≥': '>=', '≤': '<=', '≈': '~', '×': 'x', '→': '->', ' ': ' ', ' ': ' ', '‑': '-', '☐': '[ ]', '☑': '[x]' };
// A load rating in kPa or kN prints with its mass (D263, public/mass.js).
const { withMass } = require('./public/mass');
function printable(text) {
  return Array.from(withMass(String(text ?? ''))).map((ch) => {
    if (SWAPS[ch]) return SWAPS[ch];
    const code = ch.codePointAt(0);
    if (code === 10 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255) || WIN_ANSI_EXTRA.includes(ch)) return ch;
    return ' ';
  }).join('');
}

function makeDoc() {
  // The bottom margin keeps the footer clear: text that runs on (a long list of licences, a long
  // paragraph) moves to the next page before it reaches the footer (messy round 4, A fault 2: the
  // dogging licence line printed on top of the footer). Tables stop a little higher (bottom), so a
  // row fitted to the page never runs into the margin.
  return new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: MARGIN, bottom: MARGIN + FOOTER_SPACE - 6, left: MARGIN, right: MARGIN }, bufferPages: true, info: { Title: 'Safe work method statement', Creator: 'SiteWrite' } });
}

function contentWidth(doc) {
  return doc.page.width - MARGIN * 2;
}

function bottom(doc) {
  return doc.page.height - MARGIN - FOOTER_SPACE;
}

function text(doc, value, options = {}) {
  doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size || 10).fillColor(options.color || INK);
  // A short paragraph that does not fit above the footer starts on the next page, whole.
  const height = doc.heightOfString(printable(value), { width: contentWidth(doc), ...options.textOptions });
  if (doc.y + height > bottom(doc) && height < bottom(doc) - MARGIN - 80) doc.addPage();
  doc.text(printable(value), MARGIN, doc.y, { width: contentWidth(doc), ...options.textOptions });
  if (options.after) doc.moveDown(options.after);
}

function heading(doc, value) {
  if (doc.y > bottom(doc) - 60) doc.addPage();
  doc.moveDown(0.6);
  text(doc, value, { bold: true, size: 13 });
  doc.moveDown(0.25);
}

// A cell is a list of paragraphs. Rows that do not fit move to the next page,
// and a row longer than a page is split between paragraphs, with the heading
// row repeated.
function paragraphHeight(doc, paragraph, width, size) {
  doc.font(paragraph.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
  return doc.heightOfString(printable(paragraph.text || ' '), { width }) + 2;
}

function table(doc, { widths, header, rows, size = 8.5 }) {
  const drawRow = (cells, fill, y) => {
    let x = MARGIN;
    const heights = cells.map((cell, i) => cell.reduce((sum, p) => sum + (p.image ? p.height + 2 : paragraphHeight(doc, p, widths[i] - PAD * 2, size)), 0));
    const height = Math.max(...heights, size + 4) + PAD * 2;
    cells.forEach((cell, i) => {
      if (fill) doc.rect(x, y, widths[i], height).fill(fill);
      doc.rect(x, y, widths[i], height).lineWidth(0.5).strokeColor(LINE).stroke();
      let cy = y + PAD;
      for (const p of cell) {
        if (p.image) {
          try { doc.image(p.image, x + PAD, cy, { fit: [p.width, p.height] }); } catch { /* a damaged image is left out */ }
          cy += p.height + 2;
          continue;
        }
        doc.font(p.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(p.color || INK);
        doc.text(printable(p.text || ' '), x + PAD, cy, { width: widths[i] - PAD * 2 });
        cy += paragraphHeight(doc, p, widths[i] - PAD * 2, size);
      }
      x += widths[i];
    });
    return height;
  };
  const rowHeight = (cells) => Math.max(...cells.map((cell, i) => cell.reduce((sum, p) => sum + (p.image ? p.height + 2 : paragraphHeight(doc, p, widths[i] - PAD * 2, size)), 0)), size + 4) + PAD * 2;
  const headerCells = header && header.map((label) => [{ text: label, bold: true }]);
  const startPage = () => {
    if (headerCells) doc.y += drawRow(headerCells, HEAD, doc.y);
  };
  if (doc.y + (headerCells ? rowHeight(headerCells) : 0) + 30 > bottom(doc)) doc.addPage();
  startPage();
  // A paragraph taller than a whole page never fits, and would add pages forever: when nothing
  // fits on a fresh page, the first paragraph of each cell is halved at a space and tried again.
  const halve = (cells) => cells.map((cell) => {
    if (!cell.length || cell[0].image) return cell;
    const text = String(cell[0].text || '');
    if (text.length < 2) return cell;
    const cut = text.lastIndexOf(' ', Math.floor(text.length / 2)) > 0 ? text.lastIndexOf(' ', Math.floor(text.length / 2)) : Math.floor(text.length / 2);
    return [{ ...cell[0], text: text.slice(0, cut) }, { ...cell[0], text: text.slice(cut).trim() || ' ' }, ...cell.slice(1)];
  });
  for (const row of rows) {
    let remaining = row.cells;
    let freshPage = false;
    while (remaining) {
      const space = bottom(doc) - doc.y;
      if (rowHeight(remaining) <= space) {
        doc.y += drawRow(remaining, row.fill, doc.y);
        remaining = null;
        continue;
      }
      // Fit as many paragraphs of each cell as the page allows.
      const fitted = [];
      const rest = [];
      remaining.forEach((cell, i) => {
        let used = PAD * 2;
        const take = [];
        let k = 0;
        for (; k < cell.length; k += 1) {
          const h = cell[k].image ? cell[k].height + 2 : paragraphHeight(doc, cell[k], widths[i] - PAD * 2, size);
          if (used + h > space) break;
          used += h;
          take.push(cell[k]);
        }
        fitted.push(take);
        rest.push(cell.slice(k));
      });
      // On a fresh page, a cell whose first paragraph still does not fit is halved and tried again.
      const stuck = remaining.map((cell, i) => freshPage && cell.length > 0 && !fitted[i].length);
      if (stuck.some(Boolean)) {
        remaining = remaining.map((cell, i) => (stuck[i] ? halve([cell])[0] : cell));
        continue;
      }
      if (fitted.every((cell) => !cell.length) || space < 40) {
        doc.addPage();
        startPage();
        freshPage = true;
        continue;
      }
      freshPage = false;
      doc.y += drawRow(fitted, row.fill, doc.y);
      remaining = rest.some((cell) => cell.length) ? rest.map((cell) => (cell.length ? cell : [{ text: ' ' }])) : null;
      doc.addPage();
      startPage();
      freshPage = true;
    }
  }
  doc.x = MARGIN;
  doc.moveDown(0.3);
}

const pair = (label, value) => ({ cells: [[{ text: label, bold: true }], [{ text: value || ' ' }]] });

function metaRows(draft) {
  const rows = [['State', draft.state], ['SWMS reference number', draft.swmsRef || ' '], ['Revision', revisionText(draft)]];
  if (draft.principalContractor) rows.push(['Principal contractor', draft.principalContractor]);
  rows.push(['Subcontractor', draft.subcontractor]);
  rows.push(['Workplace', draft.workplace]);
  for (const [label, key] of [['Site manager', 'siteManager'], ['Scaffold supervisor', 'scaffoldSupervisor'], ['Hospital', 'hospital'], ['First aider', 'firstAider'], ['Muster point', 'musterPoint']]) {
    if (draft[key]) rows.push([label, draft[key]]);
  }
  rows.push(['Task', draft.task]);
  if (draft.craneOperator) rows.push(['Crane operated by', draft.craneOperator]);
  if (draft.residential) rows.push(['Residential construction work', draft.residential]);
  if (draft.fallRisk) rows.push([`Fall of more than ${draft.fallMetres || 2} metres`, draft.fallRisk]);
  rows.push(['Date', draft.date]);
  return rows.map(([label, value]) => pair(label, value));
}

function companyHeader(doc, draft, logo, logoImage) {
  const top = MARGIN - 10;
  if (logo && logoImage) {
    const size = fitLogo(logo, 225, 75);
    doc.image(logoImage, doc.page.width - MARGIN - size.width, top, { width: size.width, height: size.height });
  }
  const width = contentWidth(doc) - (logo ? 240 : 0);
  if (draft.subcontractor) doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(printable(draft.subcontractor), MARGIN, top + 4, { width });
  if (draft.companyDetails) doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(printable(draft.companyDetails), MARGIN, doc.y + 2, { width });
  doc.y = Math.max(doc.y, logo ? top + fitLogo(logo, 225, 75).height : doc.y) + 14;
}

const lines = (value) => String(value || ' ').split('\n').map((line) => ({ text: line || ' ' }));
const row = (...values) => ({ cells: values.map(lines) });
const riskLines = (risk) => (risk ? [`Before: ${risk.before.level}`, risk.before.label, `After: ${risk.after.level}`, risk.after.label, ...(risk.response ? [risk.response] : [])].join('\n') : ' ');

function registers(doc, draft, w) {
  if ((draft.plant || []).length) {
    heading(doc, 'Plant and equipment');
    text(doc, 'Keep the inspection and maintenance records, and sight each licence before work.', { size: 8.5, color: MUTED });
    table(doc, { widths: [150, w - 150 - 210, 210], header: ['Item', 'Inspection and maintenance', 'Licence or ticket to operate'], rows: draft.plant.map((item) => row(item.item, item.inspection, item.licence)) });
  }
  // Each hazardous product the user listed, with the controls from its safety data sheet (substances.js,
  // D256, D257). A type of substance with no product does not print.
  const products = substanceRows(draft);
  // Types ticked "Not required" with the reason given (D292 item 3) print under the table, or alone.
  const notRequired = notRequiredLine(draft);
  if (products.length || notRequired) heading(doc, SUBSTANCES_TITLE);
  if (products.length) {
    text(doc, SUBSTANCES_NOTE, { size: 8.5, color: MUTED });
    table(doc, { widths: [130, 125, w - 130 - 125 - 110 - 110 - 95, 110, 110, 95], header: SUBSTANCES_HEAD, rows: products.map((cells) => row(...cells.map((value) => value || ' '))) });
  }
  if (notRequired) text(doc, notRequired, { size: 9, after: 0.3 });
  heading(doc, 'Licences, tickets and training');
  text(doc, 'Needed for this task:', { bold: true });
  for (const item of draft.qualifications || []) text(doc, `•  ${item}`);
  table(doc, { widths: [170, 80, 120, w - 170 - 80 - 120 - 110, 110], header: ['Name', 'Site induction', 'White card number', 'Licences and tickets (type and number)', 'Sighted by'], rows: Array.from({ length: 5 }, () => row('\n ', 'Yes  /  No', ' ', ' ', ' ')) });
  heading(doc, 'Emergency arrangements');
  table(doc, { widths: [110, w - 110 - 230, 230], header: ['Emergency', 'Equipment and arrangements', 'Location, contact or detail'], rows: (draft.emergency || []).map((item) => row(item.type, item.equipment, item.detail || ' ')) });
  if (draft.sources && (draft.sources.legislation.length || draft.sources.codes.length)) {
    heading(doc, 'Legislation and codes of practice');
    table(doc, { widths: [w / 2, w / 2], header: ['Legislation', 'Codes of practice and guidance'], rows: [row(draft.sources.legislation.join('\n'), draft.sources.codes.join('\n'))] });
  }
}

function riskMatrix(doc, w) {
  const widths = [110, ...Array(5).fill((w - 110) / 5)];
  table(doc, {
    widths,
    header: ['Likelihood', 'Negligible (1)', 'Minor (2)', 'Moderate (3)', 'Major (4)', 'Catastrophic (5)'],
    rows: [5, 4, 3, 2, 1].map((l) => row(`${LIKELIHOOD[l]} (${l})`, ...MATRIX[l].map((level, i) => `${level} (${l * (i + 1)})`))),
    size: 8,
  });
}

function draftToPdf(draft, options = {}) {
  const doc = makeDoc();
  // The logo is embedded once and drawn on every page.
  let logoImage = null;
  try { logoImage = options.logo ? doc.openImage(options.logo.data) : null; } catch { logoImage = null; }
  const head = () => {
    if (logoImage || draft.subcontractor || draft.companyDetails) companyHeader(doc, draft, options.logo, logoImage);
  };
  doc.on('pageAdded', head);
  head();
  const w = contentWidth(doc);
  const pairWidths = [190, w - 190];

  text(doc, 'Safe work method statement', { bold: true, size: 18 });
  text(doc, `${draft.instrument}  ·  ${draft.versionLabel}  ·  ${draft.sectionRef}`, { size: 9, color: MUTED });
  text(doc, draft.status || 'Not approved. Not signed.', { size: 9, after: 0.4 });
  table(doc, { widths: pairWidths, rows: metaRows(draft) });

  if (draft.kind !== 'draft') {
    heading(doc, 'Stood down');
    text(doc, draft.statement, { after: 0.3 });
    text(doc, 'Missing', { bold: true });
    for (const item of draft.missing || []) text(doc, item);
    text(doc, 'No method is included.', { after: 0.3 });
  } else {
    heading(doc, 'Responsibilities');
    table(doc, {
      widths: pairWidths,
      rows: [
        pair('Works manager', draft.worksManager), pair('Contact phone', draft.worksManagerPhone),
        pair('Person responsible for ensuring compliance with this SWMS', draft.complianceResponsible),
        pair('How compliance is checked', 'The supervisor checks the controls are in place before work starts and during the work, and stops the work if they are not.'),
        pair('Person responsible for reviewing the control measures', draft.reviewer), pair('Review date', draft.reviewDate),
      ],
    });

    heading(doc, 'High risk construction work');
    if ((draft.highRisk || []).length) for (const item of draft.highRisk) text(doc, item);
    else text(doc, 'This task is not identified as high risk construction work.');

    // The designs the job steps rely on and the written methods the work follows (designs.js), only
    // where there are any.
    if ((draft.designs || []).length) {
      heading(doc, tableTitle(draft));
      text(doc, tableNote(draft), { size: 8.5, color: MUTED });
      table(doc, { widths: [110, 100, 100, 70, w - 380], header: tableHead(draft), rows: tableRows(draft).map((cells) => row(...cells.map((value) => value || ' '))) });
    }

    heading(doc, 'Controls');
    table(doc, { widths: pairWidths, header: ['Hierarchy', 'Control'], rows: (draft.controls || []).map((item) => ({ cells: [[{ text: item.level }], [{ text: item.text }]] })) });

    heading(doc, 'Job steps');
    const stepWidths = [115, 180, w - 115 - 180 - 95 - 60, 95, 60];
    table(doc, {
      widths: stepWidths,
      header: ['Job step', 'Hazards and risks', 'Controls', 'Risk rating', 'Who'],
      rows: (draft.jobSteps || []).map((step, index) => ({
        cells: [
          [{ text: `${index + 1}. ${step.step}`, bold: true }],
          step.hazards.map((line) => ({ text: `•  ${line}` })),
          [...step.controls, ...sharedNote(step, draft.jobSteps)].map((line) => ({ text: `•  ${line}`, ...(isHoldPoint(line) ? { bold: true } : {}) })),
          lines(riskLines(step.risk)),
          [{ text: step.responsible || ' ' }],
        ],
      })),
    });

    text(doc, 'Suggested ratings from the matrix below, before and after the controls. The supervisor checks them and changes them to suit the site. Where a rating after the controls is still High, add controls or have the supervisor accept the risk before work starts.', { size: 8.5, color: MUTED });
    riskMatrix(doc, w);

    heading(doc, 'Personal protective equipment');
    // For all work, by area, then the extra items for particular steps with their steps (D246).
    const forSteps = stepPpeRows(draft.ppe);
    if (forSteps.length) text(doc, 'For all work', { bold: true });
    table(doc, {
      widths: pairWidths,
      rows: (draft.ppe || []).map((group) => {
        const worn = group.items.filter((item) => item.ticked && !Array.isArray(item.steps)).map((item) => item.label);
        const steps = group.items.filter((item) => item.ticked && Array.isArray(item.steps)).map((item) => item.label);
        const also = steps.length ? `For particular steps (below): ${steps.join(', ')}` : '';
        return pair(group.area, worn.length ? `Wear: ${worn.join(', ')}${also ? `. ${also}` : ''}` : also || 'None required for this area.');
      }),
    });
    if (forSteps.length) {
      text(doc, 'For particular steps', { bold: true });
      text(doc, 'Worn as well as the PPE for all work, in the steps listed. Each step says so.', { size: 8.5, color: MUTED });
      table(doc, { widths: pairWidths, rows: forSteps.map((item) => pair(item.label, item.steps.join('; '))) });
    }

    registers(doc, draft, w);

    heading(doc, draft.reviewHeading);
    text(doc, draft.review);

    heading(doc, 'Site-specific');
    table(doc, { widths: pairWidths, rows: (draft.site || []).map((field) => pair(field.label, field.text)) });

    if ((draft.references || []).length) {
      heading(doc, 'Documents to keep on site with this SWMS');
      table(doc, { widths: pairWidths, rows: draft.references.map((item) => pair(item.label, item.text)) });
    }

    heading(doc, 'Prepared by');
    const by = preparedFromCheck(draft, options.confirmation);
    table(doc, { widths: pairWidths, rows: [pair('Name and position', by ? by.name : ''), pair('Signature', ''), pair('Date', by ? by.date : ''), pair('Date given to the principal contractor', '')] });

    // Who checked it part by part before it was downloaded or saved (D286).
    const checked = checkedRows(options.confirmation);
    if (checked.length) {
      heading(doc, 'Checked by');
      table(doc, { widths: pairWidths, rows: checked.map(([label, value]) => pair(label, value)) });
    }

    heading(doc, 'Principal contractor review');
    const review = options.pcReview;
    if (review) {
      // The response the reviewer returned on this revision in SiteWrite (D290).
      text(doc, reviewedNote(review), { size: 9, color: MUTED, after: 0.3 });
      table(doc, {
        widths: pairWidths,
        rows: [pair('Principal contractor', draft.principalContractor), pair('Reviewed by (name and company)', [review.name, review.company].filter(Boolean).join(', ')),
          pair('Outcome', PC_OUTCOMES.map(([id, label]) => `${review.response === id ? '[x]' : '[ ]'} ${label}`).join('     ')), pair(PC_TEXT[review.response] || 'Comments', conditionLines(review.text) || 'None'), pair('Date', review.date || '')],
      });
    } else {
      if (options.reviewLink) text(doc, reviewInvite(options.reviewLink), { size: 9, color: MUTED, after: 0.3 });
      table(doc, {
        widths: pairWidths,
        rows: [pair('Principal contractor', draft.principalContractor), pair('Date SWMS received', ''), pair('Reviewed by (name and position)', ''),
          pair('Outcome', '[ ] Accepted     [ ] Accepted with changes noted     [ ] Not accepted: revise and resubmit'), pair('Comments or changes', '\n\n\n'), pair('Signature', ''), pair('Date', '')],
      });
    }

    doc.addPage();
    text(doc, 'Worker sign-on', { bold: true, size: 16 });
    text(doc, [draft.task, draft.workplace, revisionText(draft)].filter(Boolean).join('  ·  '), { size: 9, color: MUTED, after: 0.3 });
    text(doc, 'By signing, I confirm this SWMS has been explained to me, I understand it, and I will follow it. If the work changes or a control is not working, I will stop and tell my supervisor.', { size: 9.5, after: 0.4 });
    const signed = (options.signons || []).map((item) => ({
      cells: [[{ text: item.worker_name }, ...(item.note ? [{ text: item.note, color: MUTED }] : [])], [{ text: item.worker_company }], signatureCell(item.signature), [{ text: item.signedDate }]],
    }));
    const blank = Array.from({ length: Math.max(10, 20 - signed.length) }, () => ({ cells: [[{ text: '\n ' }], [{ text: ' ' }], [{ text: ' ' }], [{ text: ' ' }]] }));
    table(doc, { widths: [220, 190, w - 220 - 190 - 130, 130], header: ['Name', 'Company', 'Signature', 'Date'], rows: [...signed, ...blank], size: 9 });
  }

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i);
    // The footer is written in the bottom margin: with the margin set aside, it never starts a page.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGIN - 20;
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
    // With a SiteWrite reference, the footer takes a third line: who the SWMS was prepared for.
    const top = options.prepared ? y - 10 : y;
    doc.text(printable(`${draft.instrument}  ·  ${draft.sectionRef}`), MARGIN, top, { width: contentWidth(doc), lineBreak: false });
    doc.text(printable(options.note || ''), MARGIN, top + 10, { width: contentWidth(doc) - 60, lineBreak: false });
    if (options.prepared) doc.text(printable(options.prepared), MARGIN, top + 20, { width: contentWidth(doc) - 60, lineBreak: false });
    doc.text(`Page ${i + 1} of ${pages.count}`, doc.page.width - MARGIN - 60, y + 10, { width: 60, align: 'right', lineBreak: false });
  }
  doc.end();
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function signatureCell(dataUrl) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) return [{ text: ' ' }];
  return [{ image: Buffer.from(match[1], 'base64'), width: 120, height: 34 }];
}

module.exports = { draftToPdf, printable };
