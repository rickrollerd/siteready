const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, VerticalAlign, Footer, Header, AlignmentType, ImageRun,
} = require('docx');
const { fitLogo } = require('./logo');

const FONT = 'Calibri';
const INK = '1C2430';
const MUTED = '5C6773';
const LINE = 'D5DBE3';
const HEAD = 'F4F6F8';
const CONTENT_WIDTH = 10080;

const hair = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: hair, bottom: hair, left: hair, right: hair };
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const open = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function run(text, options = {}) {
  return new TextRun({
    text: text || '',
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

function cell(text, width, options = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: options.open ? open : borders,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    verticalAlign: VerticalAlign.TOP,
    shading: options.fill ? { fill: options.fill } : undefined,
    columnSpan: options.span,
    children: [
      new Paragraph({
        spacing: { before: 0, after: 0, line: 240 },
        children: [run(text, { size: options.size || 20, bold: options.bold, color: options.color || INK })],
      }),
    ],
  });
}

function metaTable(rows) {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [2200, 7880],
    rows: rows.map(([label, value]) => new TableRow({
      cantSplit: true,
      children: [
        cell(label, 2200, { bold: true, fill: HEAD, size: 20 }),
        cell(value || ' ', 7880, { size: 20 }),
      ],
    })),
  });
}

function sectionHeading(text) {
  return para(text, { bold: true, size: 24, before: 280, after: 80 });
}

function siteBlock(field) {
  return [
    para(field.label, { bold: true, size: 21, before: 140, after: 40 }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 1 } },
      spacing: { before: 0, after: 80 },
      children: [run(field.text || ' ', { size: 22 })],
    }),
  ];
}

function controlTable(controls) {
  const widths = [2200, 7880];
  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      cell('Hierarchy', widths[0], { bold: true, fill: HEAD }),
      cell('Control', widths[1], { bold: true, fill: HEAD }),
    ],
  });
  const body = controls.map((item) => new TableRow({
    cantSplit: true,
    children: [
      cell(item.level, widths[0]),
      cell(item.text, widths[1]),
    ],
  }));
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [header, ...body],
  });
}

function hazardTable(hazards) {
  const widths = [3600, 6480];
  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: [
      cell('Hazard', widths[0], { bold: true, fill: HEAD }),
      cell('Risk', widths[1], { bold: true, fill: HEAD }),
    ],
  });
  const body = hazards.map((item) => new TableRow({
    cantSplit: true,
    children: [cell(item.hazard, widths[0]), cell(item.risk, widths[1])],
  }));
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [header, ...body],
  });
}

// Sign-off sections. Every line is left blank for a pen or for typing in Word.
const SIGN_ROWS = 44;
const TICK = '\u2610';

function signTable(rows) {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [3000, 7080],
    rows: rows.map(([label, value, height]) => new TableRow({
      cantSplit: true,
      height: { value: height || 520 },
      children: [
        cell(label, 3000, { bold: true, fill: HEAD, size: 20 }),
        cell(value || ' ', 7080, { size: 20 }),
      ],
    })),
  });
}

function preparedBy() {
  return [
    sectionHeading('Prepared by'),
    signTable([
      ['Name and position', ''],
      ['Signature', ''],
      ['Date', ''],
      ['Date given to the principal contractor', ''],
    ]),
  ];
}

// The principal contractor must get the SWMS before the high risk construction
// work starts. This section records its check of it.
function principalContractorReview(draft) {
  return [
    sectionHeading('Principal contractor review'),
    para('Completed by the principal contractor before the work starts.', { size: 20, color: MUTED, before: 0, after: 80 }),
    signTable([
      ['Principal contractor', draft.principalContractor || ''],
      ['Date SWMS received', ''],
      ['Reviewed by (name and position)', ''],
      ['Outcome', `${TICK} Accepted    ${TICK} Accepted with changes noted below    ${TICK} Not accepted: revise and resubmit`],
      ['Comments or changes', '', 1400],
      ['Signature', ''],
      ['Date', ''],
    ]),
  ];
}

// Its own pages, so they can be printed and kept at the work area. The heading
// row repeats on every page.
function workerSignOn(draft) {
  const widths = [3000, 2600, 2880, 1600];
  const labels = ['Name', 'Company', 'Signature', 'Date'];
  const where = [draft.task, draft.workplace].filter(Boolean).join('  ·  ');
  return [
    new Paragraph({
      pageBreakBefore: true,
      spacing: { before: 0, after: 60 },
      children: [run('Worker sign-on', { bold: true, size: 32 })],
    }),
    para(where, { size: 20, color: MUTED, after: 120 }),
    para('By signing, I confirm this SWMS has been explained to me, I understand it, and I will follow it. If the work changes or a control is not working, I will stop and tell my supervisor.', { size: 21, after: 160 }),
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: widths,
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: labels.map((label, index) => cell(label, widths[index], { bold: true, fill: HEAD })),
        }),
        ...Array.from({ length: SIGN_ROWS }, () => new TableRow({
          cantSplit: true,
          height: { value: 560 },
          children: widths.map((width) => cell(' ', width)),
        })),
      ],
    }),
  ];
}

function metaRows(draft) {
  const rows = [['State', draft.state]];
  if (draft.principalContractor) rows.push(['Principal contractor', draft.principalContractor]);
  rows.push(['Subcontractor', draft.subcontractor || ' ']);
  rows.push(['Workplace', draft.workplace || ' ']);
  if (draft.siteManager) rows.push(['Site manager', draft.siteManager]);
  if (draft.scaffoldSupervisor) rows.push(['Scaffold supervisor', draft.scaffoldSupervisor]);
  if (draft.hospital) rows.push(['Hospital', draft.hospital]);
  if (draft.firstAider) rows.push(['First aider', draft.firstAider]);
  if (draft.musterPoint) rows.push(['Muster point', draft.musterPoint]);
  rows.push(['Task', draft.task]);
  if (draft.residential) rows.push(['Residential construction work', draft.residential]);
  if (draft.fallRisk) rows.push([`Fall of more than ${draft.fallMetres || 2} metres`, draft.fallRisk]);
  rows.push(['Date', draft.date || ' ']);
  return rows;
}

function childrenFor(draft) {
  const blocks = [
    para('Safe work method statement', { bold: true, size: 36, before: 0, after: 40 }),
    para(`${draft.instrument}  ·  ${draft.versionLabel}  ·  ${draft.sectionRef}`, { size: 20, color: MUTED, after: 40 }),
    para(draft.status || 'Not approved. Not signed.', { size: 20, before: 0, after: 160 }),
    metaTable(metaRows(draft)),
  ];

  if (draft.kind === 'stand-down') {
    blocks.push(
      sectionHeading('Stood down'),
      para(draft.statement, { before: 40, after: 80 }),
      para('Missing', { bold: true, size: 21, before: 80, after: 40 }),
    );
    for (const item of draft.missing) blocks.push(para(item, { before: 0, after: 40 }));
    blocks.push(para('No method is included.', { before: 120, after: 0 }));
    return blocks;
  }

  blocks.push(sectionHeading('High risk construction work'));
  if (draft.highRisk.length) {
    for (const item of draft.highRisk) blocks.push(para(item, { before: 0, after: 40 }));
  } else {
    blocks.push(para('This task is not identified as high risk construction work.', { before: 0, after: 40 }));
  }

  blocks.push(sectionHeading('Hazards and risks'));
  if (draft.hazards.length) blocks.push(hazardTable(draft.hazards));
  else blocks.push(para('None stated for this task.', { before: 0, after: 40 }));

  blocks.push(sectionHeading('Controls'));
  blocks.push(controlTable(draft.controls));

  blocks.push(sectionHeading(draft.reviewHeading));
  blocks.push(para(draft.review, { before: 40, after: 40 }));

  blocks.push(sectionHeading('Site-specific'));
  for (const field of draft.site) blocks.push(...siteBlock(field));

  blocks.push(sectionHeading('Method'));
  draft.method.forEach((step, index) => {
    blocks.push(para(`${index + 1}.  ${step}`, { before: 20, after: 40 }));
  });

  blocks.push(...preparedBy());
  blocks.push(...principalContractorReview(draft));
  blocks.push(...workerSignOn(draft));
  return blocks;
}

// The company logo, name and details head every page, so the file reads as the
// company's own document. With no logo or details there is no header.
function companyHeader(draft, logo) {
  const lines = [];
  if (logo) {
    lines.push(new Paragraph({
      spacing: { before: 0, after: 60 },
      children: [new ImageRun({ type: logo.type, data: logo.data, transformation: fitLogo(logo) })],
    }));
  }
  if (draft.subcontractor) lines.push(para(draft.subcontractor, { bold: true, size: 20, after: 20 }));
  if (draft.companyDetails) lines.push(para(draft.companyDetails, { size: 16, color: MUTED, after: 80 }));
  return lines.length ? { default: new Header({ children: lines }) } : undefined;
}

function buildDocument(draft, options = {}) {
  return new Document({
    creator: 'SiteReady',
    title: 'Safe work method statement',
    description: `${draft.instrument}, ${draft.versionLabel}, ${draft.sectionRef}`,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22, color: INK },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 850, bottom: 850, left: 900, right: 900 },
        },
      },
      headers: companyHeader(draft, options.logo),
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              spacing: { before: 80 },
              children: [run(`${draft.instrument}  ·  ${draft.sectionRef}`, { size: 16, color: MUTED })],
            }),
          ],
        }),
      },
      children: childrenFor(draft),
    }],
  });
}

async function draftToDocx(draft, options = {}) {
  return Packer.toBuffer(buildDocument(draft, options));
}

module.exports = { draftToDocx };
