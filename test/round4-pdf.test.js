// Messy round 4 (A fault 2, 3 of 4 runs): the last lines of a page printed on top of the PDF's footer:
// the dogging licence line, and the review paragraph. Every line PDFKit draws, other than the footer's
// own, must end above the footer (the page height less 72 pt), however the page falls.
const test = require('node:test');
const assert = require('node:assert/strict');
const PDFDocument = require('pdfkit');
const { prepareDraft } = require('../draft');
const { draftBody } = require('../input');
const { draftToPdf } = require('../pdf-draft');
const { ANSWERED, ready } = require('./helpers');

// Each line drawn, with its page and whether it is the footer (written with the bottom margin set aside).
function spy() {
  const drawn = [];
  const original = PDFDocument.prototype._fragment;
  PDFDocument.prototype._fragment = function fragment(text, x, y, options) {
    drawn.push({ text: String(text), y, bottom: y + this.currentLineHeight(true), height: this.page.height, footer: this.page.margins.bottom === 0 });
    return original.call(this, text, x, y, options);
  };
  return { drawn, done: () => { PDFDocument.prototype._fragment = original; } };
}

const STEEL = { state: 'nsw', task: 'Crane lift and rig structural steel into position. Accept delivery, off-load materials and sling loads.', fallRisk: 'no', residential: 'no', crane: 'company', slinging: 'ours', ...ANSWERED, facts: { erectionSequence: 'Erection sequence and bracing to drawing S-501 rev C; the leading hand checks each frame is braced before the crane releases it.' } };

test('no line of a PDF runs into the footer, wherever the licence list and the review paragraph fall on the page', async () => {
  const base = prepareDraft(draftBody(ready(STEEL)));
  assert.equal(base.kind, 'draft', (base.missing || []).join('; '));
  const watch = spy();
  try {
    // Plant rows of one line each move the licences and the review paragraph down the page a line at a time.
    for (let extra = 0; extra < 36; extra += 1) {
      const plant = [...base.plant, ...Array.from({ length: extra }, (_, n) => ({ item: `Hand tool ${n + 1}`, inspection: 'Checked before use.', licence: 'No' }))];
      const qualifications = [...base.qualifications, 'High risk work licence: dogging or rigging (DG, RB, RI or RA)', 'High risk work licence: slewing mobile crane (C2, C6, C1 or C0)', 'Working at heights training (RIIWHS204E)', 'Elevating work platform licence (WP) for a boom of 11 m or more'];
      const review = `${base.review} ${base.review}`;
      await draftToPdf({ ...base, plant, qualifications, review }, { note: 'Drafted with SiteWrite by Sam Lee on 14 October 2026.', prepared: 'Prepared with SiteWrite for Hunter Steel Erectors Pty Ltd (ABN 71 417 212 325). SiteWrite reference SR-C2MY-RFAA.' });
    }
  } finally {
    watch.done();
  }
  const body = watch.drawn.filter((line) => !line.footer && line.text.trim());
  assert.ok(body.length > 1000);
  const over = body.filter((line) => line.bottom > line.height - 72);
  assert.deepEqual(over.map((line) => `${line.text.slice(0, 60)} (${line.bottom.toFixed(1)} of ${line.height.toFixed(1)})`), []);
  // The footer's own lines are all in the bottom band.
  const footer = watch.drawn.filter((line) => line.footer);
  assert.ok(footer.length > 0);
  assert.ok(footer.every((line) => line.y >= line.height - 72));
});
