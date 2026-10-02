// The same SWMS as the Word file, as a PDF for people who only need to read,
// print or send it. Worker signatures collected in the app are printed on it.
const PDFDocument = require('pdfkit');
const { fitLogo } = require('./logo');
const { MATRIX, LIKELIHOOD } = require('./register');

const INK = '#1C2430';
const MUTED = '#5C6773';
const LINE = '#D5DBE3';
const HEAD = '#F4F6F8';
const MARGIN = 40;
const FOOTER_SPACE = 34;
const PAD = 4;

// The built-in PDF fonts cover Western European text. Anything else is replaced
// with a near equivalent so it prints instead of disappearing.
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const SWAPS = { '≥': '>=', '≤': '<=', '≈': '~', '×': 'x', '→': '->', ' ': ' ', ' ': ' ', '‑': '-', '☐': '[ ]', '☑': '[x]' };
function printable(text) {
  return Array.from(String(text ?? '')).map((ch) => {
    if (SWAPS[ch]) return SWAPS[ch];
    const code = ch.codePointAt(0);
    if (code === 10 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255) || WIN_ANSI_EXTRA.includes(ch)) return ch;
    return ' ';
  }).join('');
}

function makeDoc() {
  return new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }, bufferPages: true, info: { Title: 'Safe work method statement', Creator: 'SiteReady' } });
}

function contentWidth(doc) {
  return doc.page.width - MARGIN * 2;
}

function bottom(doc) {
  return doc.page.height - MARGIN - FOOTER_SPACE;
}

function text(doc, value, options = {}) {
  doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(options.size || 10).fillColor(options.color || INK);
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
  for (const row of rows) {
    let remaining = row.cells;
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
      if (fitted.every((cell) => !cell.length) || space < 40) {
        doc.addPage();
        startPage();
        continue;
      }
      doc.y += drawRow(fitted, row.fill, doc.y);
      remaining = rest.some((cell) => cell.length) ? rest.map((cell) => (cell.length ? cell : [{ text: ' ' }])) : null;
      doc.addPage();
      startPage();
    }
  }
  doc.x = MARGIN;
  doc.moveDown(0.3);
}

const pair = (label, value) => ({ cells: [[{ text: label, bold: true }], [{ text: value || ' ' }]] });

function metaRows(draft) {
  const rows = [['State', draft.state], ['SWMS reference number', draft.swmsRef || ' ']];
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
const riskLines = (risk) => (risk ? [`Before: ${risk.before.level}`, risk.before.label, `After: ${risk.after.level}`, risk.after.label].join('\n') : ' ');

function registers(doc, draft, w) {
  if ((draft.plant || []).length) {
    heading(doc, 'Plant and equipment');
    text(doc, 'Keep the inspection and maintenance records, and sight each licence before work.', { size: 8.5, color: MUTED });
    table(doc, { widths: [150, w - 150 - 210, 210], header: ['Item', 'Inspection and maintenance', 'Licence or ticket to operate'], rows: draft.plant.map((item) => row(item.item, item.inspection, item.licence)) });
  }
  if (draft.substances && draft.substances.items.length) {
    heading(doc, 'Hazardous substances');
    text(doc, 'Name each product used, attach its current safety data sheet, and keep it at the work area.', { size: 8.5, color: MUTED });
    table(doc, { widths: [190, w - 190 - 130 - 90, 130, 90], header: ['Type of product', 'Product name', 'Safety data sheet attached', 'Quantity'], rows: draft.substances.items.map((item) => row(item.product, ' ', 'Yes  /  No', ' ')) });
  }
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

  if (draft.kind === 'stand-down') {
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
          step.controls.map((line) => ({ text: `•  ${line}` })),
          lines(riskLines(step.risk)),
          [{ text: ' ' }],
        ],
      })),
    });

    text(doc, 'Suggested ratings from the matrix below, before and after the controls. The supervisor checks them and changes them to suit the site.', { size: 8.5, color: MUTED });
    riskMatrix(doc, w);

    heading(doc, 'Personal protective equipment');
    table(doc, {
      widths: pairWidths,
      rows: (draft.ppe || []).map((group) => {
        const worn = group.items.filter((item) => item.ticked).map((item) => item.label);
        return pair(group.area, worn.length ? `Wear: ${worn.join(', ')}` : 'None required for this area.');
      }),
    });

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
    table(doc, { widths: pairWidths, rows: [pair('Name and position', draft.preparedBy || ''), pair('Signature', ''), pair('Date', draft.preparedBy ? draft.date : ''), pair('Date given to the principal contractor', '')] });

    heading(doc, 'Principal contractor review');
    table(doc, {
      widths: pairWidths,
      rows: [pair('Principal contractor', draft.principalContractor), pair('Date SWMS received', ''), pair('Reviewed by (name and position)', ''),
        pair('Outcome', '[ ] Accepted     [ ] Accepted with changes noted     [ ] Not accepted: revise and resubmit'), pair('Comments or changes', '\n\n\n'), pair('Signature', ''), pair('Date', '')],
    });

    doc.addPage();
    text(doc, 'Worker sign-on', { bold: true, size: 16 });
    text(doc, [draft.task, draft.workplace].filter(Boolean).join('  ·  '), { size: 9, color: MUTED, after: 0.3 });
    text(doc, 'By signing, I confirm this SWMS has been explained to me, I understand it, and I will follow it. If the work changes or a control is not working, I will stop and tell my supervisor.', { size: 9.5, after: 0.4 });
    const signed = (options.signons || []).map((item) => ({
      cells: [[{ text: item.worker_name }], [{ text: item.worker_company }], signatureCell(item.signature), [{ text: item.signedDate }]],
    }));
    const blank = Array.from({ length: Math.max(10, 20 - signed.length) }, () => ({ cells: [[{ text: '\n ' }], [{ text: ' ' }], [{ text: ' ' }], [{ text: ' ' }]] }));
    table(doc, { widths: [220, 190, w - 220 - 190 - 130, 130], header: ['Name', 'Company', 'Signature', 'Date'], rows: [...signed, ...blank], size: 9 });
  }

  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(i);
    const y = doc.page.height - MARGIN - 20;
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
    doc.text(printable(`${draft.instrument}  ·  ${draft.sectionRef}`), MARGIN, y, { width: contentWidth(doc), lineBreak: false });
    doc.text(printable(options.note || ''), MARGIN, y + 10, { width: contentWidth(doc) - 60, lineBreak: false });
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
