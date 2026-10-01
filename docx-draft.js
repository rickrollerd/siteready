const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, VerticalAlign, Footer, Header, AlignmentType, ImageRun, CheckBox, PageOrientation,
} = require('docx');
const { fitLogo } = require('./logo');

const FONT = 'Calibri';
const INK = '1C2430';
const MUTED = '5C6773';
const LINE = 'D5DBE3';
const HEAD = 'F4F6F8';
// A4 landscape, as most SWMS are, with room for the job steps table.
const PAGE_LONG = 16838;
const PAGE_SHORT = 11906;
const MARGIN = 900;
const CONTENT_WIDTH = PAGE_LONG - 2 * MARGIN;
const LABEL_WIDTH = 3400;
const VALUE_WIDTH = CONTENT_WIDTH - LABEL_WIDTH;

const hair = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: hair, bottom: hair, left: hair, right: hair };
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const open = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

// Characters a Word file cannot hold are replaced, so the file always opens.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;
const safe = (text) => String(text || '').toWellFormed().replace(CONTROL, ' ');

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
    columnWidths: [LABEL_WIDTH, VALUE_WIDTH],
    rows: rows.map(([label, value]) => new TableRow({
      cantSplit: true,
      children: [
        cell(label, LABEL_WIDTH, { bold: true, fill: HEAD, size: 20 }),
        cell(value || ' ', VALUE_WIDTH, { size: 20 }),
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
  const widths = [LABEL_WIDTH, VALUE_WIDTH];
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

// Sign-off sections. Every line is left blank for a pen or for typing in Word.
const SIGN_ROWS = 30;

// Real Word tick boxes: a click in Word ticks or clears them. Empty box, or a box
// with a tick, in a symbol font Word has on Windows and Mac.
const BOX_FONT = 'Segoe UI Symbol';

function tickBoxes(items) {
  const children = [];
  items.forEach((item, index) => {
    if (index) children.push(run('     ', { size: 20 }));
    children.push(new CheckBox({
      checked: Boolean(item.ticked),
      checkedState: { value: '2611', font: BOX_FONT },
      uncheckedState: { value: '2610', font: BOX_FONT },
    }));
    children.push(run(` ${item.label}`, { size: 20 }));
  });
  return children;
}

function signTable(rows) {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [LABEL_WIDTH, VALUE_WIDTH],
    rows: rows.map(([label, value, height]) => new TableRow({
      cantSplit: true,
      height: { value: height || 520 },
      children: [
        cell(label, LABEL_WIDTH, { bold: true, fill: HEAD, size: 20 }),
        Array.isArray(value) ? boxCell(value, VALUE_WIDTH) : cell(value || ' ', VALUE_WIDTH, { size: 20 }),
      ],
    })),
  });
}

function boxCell(items, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    verticalAlign: VerticalAlign.TOP,
    children: [new Paragraph({ spacing: { before: 0, after: 0, line: 276 }, children: tickBoxes(items) })],
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
      ['Outcome', [{ label: 'Accepted' }, { label: 'Accepted with changes noted below' }, { label: 'Not accepted: revise and resubmit' }]],
      ['Comments or changes', '', 1400],
      ['Signature', ''],
      ['Date', ''],
    ]),
  ];
}

// Its own pages, so they can be printed and kept at the work area. The heading
// row repeats on every page.
function workerSignOn(draft) {
  const widths = [4400, 3800, CONTENT_WIDTH - 4400 - 3800 - 2400, 2400];
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
      // Borders are set once on the table and the blank cells are kept bare,
      // because every extra setting on 176 cells slows the file down.
      borders: { ...borders, insideHorizontal: hair, insideVertical: hair },
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: labels.map((label, index) => cell(label, widths[index], { bold: true, fill: HEAD })),
        }),
        ...Array.from({ length: SIGN_ROWS }, () => new TableRow({
          cantSplit: true,
          height: { value: 560 },
          children: widths.map((width) => new TableCell({
            width: { size: width, type: WidthType.DXA },
            children: [new Paragraph({})],
          })),
        })),
      ],
    }),
  ];
}

// A cell holding several lines, one paragraph each.
function linesCell(lines, width, options = {}) {
  const items = lines.length ? lines : [' '];
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    verticalAlign: VerticalAlign.TOP,
    children: items.map((line, index) => new Paragraph({
      spacing: { before: 0, after: index === items.length - 1 ? 0 : 60, line: 240 },
      children: [run(options.bullet && lines.length ? `\u2022  ${line}` : line, { size: 19, bold: options.bold })],
    })),
  });
}

// The job laid out as the regulators' templates do: each step with its hazards and controls.
function jobStepsTable(steps) {
  const widths = [2600, 3900, CONTENT_WIDTH - 2600 - 3900 - 1600, 1600];
  const labels = ['Job step', 'Hazards and risks', 'Controls', 'Who'];
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: labels.map((label, index) => cell(label, widths[index], { bold: true, fill: HEAD })),
      }),
      ...steps.map((step, index) => new TableRow({
        cantSplit: true,
        children: [
          linesCell([`${index + 1}. ${step.step}`], widths[0], { bold: true }),
          linesCell(step.hazards, widths[1], { bullet: true }),
          linesCell(step.controls, widths[2], { bullet: true }),
          linesCell([], widths[3]),
        ],
      })),
    ],
  });
}

function ppeTable(groups) {
  return signTable(groups.map((group) => [group.area, group.items, 360]));
}

const COMPLIANCE_CHECK = 'The supervisor checks the controls are in place before work starts and during the work, and stops the work if they are not.';

function responsibilities(draft) {
  return [
    sectionHeading('Responsibilities'),
    signTable([
      ['Works manager', draft.worksManager],
      ['Contact phone', draft.worksManagerPhone],
      ['Person responsible for ensuring compliance with this SWMS', draft.complianceResponsible],
      ['How compliance is checked', COMPLIANCE_CHECK],
      ['Person responsible for reviewing the control measures', draft.reviewer],
      ['Review date', draft.reviewDate],
      ['Workers consulted on this SWMS', [{ label: 'Yes' }, { label: 'No' }]],
    ]),
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
  if (draft.craneOperator) rows.push(['Crane operated by', draft.craneOperator]);
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

  blocks.push(...responsibilities(draft));

  blocks.push(sectionHeading('High risk construction work'));
  if (draft.highRisk.length) {
    for (const item of draft.highRisk) blocks.push(para(item, { before: 0, after: 40 }));
  } else {
    blocks.push(para('This task is not identified as high risk construction work.', { before: 0, after: 40 }));
  }

  blocks.push(sectionHeading('Controls'));
  blocks.push(controlTable(draft.controls));

  blocks.push(sectionHeading('Job steps'));
  blocks.push(para('Change any step, hazard or control to suit the site. Write who is responsible for each step.', { size: 19, color: MUTED, before: 0, after: 80 }));
  blocks.push(jobStepsTable(draft.jobSteps || []));

  blocks.push(sectionHeading('Personal protective equipment'));
  blocks.push(para('Ticked items must be worn. Change the ticks to suit the site.', { size: 19, color: MUTED, before: 0, after: 80 }));
  blocks.push(ppeTable(draft.ppe || []));

  blocks.push(sectionHeading(draft.reviewHeading));
  blocks.push(para(draft.review, { before: 40, after: 40 }));

  blocks.push(sectionHeading('Site-specific'));
  for (const field of draft.site) blocks.push(...siteBlock(field));

  if ((draft.references || []).length) {
    blocks.push(sectionHeading('Documents to keep on site with this SWMS'));
    blocks.push(signTable(draft.references.map((item) => [item.label, item.text])));
  }

  blocks.push(...preparedBy());
  blocks.push(...principalContractorReview(draft));
  blocks.push(...workerSignOn(draft));
  return blocks;
}

// The company logo, name and details head every page, so the file reads as the
// company's own document. With no logo or details there is no header.
function companyHeader(draft, logo) {
  const lines = [];
  // The last header line carries the gap that keeps the page title clear of the header.
  const gap = 240;
  const textLines = [draft.subcontractor, draft.companyDetails].filter(Boolean).length;
  if (logo) {
    lines.push(new Paragraph({
      spacing: { before: 0, after: textLines ? 60 : gap },
      children: [new ImageRun({ type: logo.type, data: logo.data, transformation: fitLogo(logo) })],
    }));
  }
  if (draft.subcontractor) lines.push(para(draft.subcontractor, { bold: true, size: 20, after: draft.companyDetails ? 20 : gap }));
  if (draft.companyDetails) lines.push(para(draft.companyDetails, { size: 16, color: MUTED, after: gap }));
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
          size: { width: PAGE_SHORT, height: PAGE_LONG, orientation: PageOrientation.LANDSCAPE },
          margin: { top: 850, bottom: 850, left: MARGIN, right: MARGIN },
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
