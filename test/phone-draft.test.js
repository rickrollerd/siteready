// Goal 7: a shorter draft on a phone, and controls and text sized for a thumb on site. Each job
// step's tools show after "Change this step", a step with many controls shows its first lines
// with a button for the rest, and the forms printed for others to fill in start folded. On a
// computer the draft shows as before, and the Word and PDF files are not changed at all.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPage, settle } = require('./fake-dom');

const controls = (n) => Array.from({ length: n }, (_, i) => `Control line ${i + 1}.`);
const DRAFT = {
  kind: 'draft', state: 'Queensland', task: 'Install cable tray from a scissor lift.', highRisk: [], controls: [], site: [], ppe: [], references: [],
  sources: { legislation: ['Work Health and Safety Act 2011 (Qld)'], codes: ['Managing the risk of falls at workplaces'] },
  jobSteps: [
    { step: 'Use an elevating work platform', hazards: ['Fall from the platform.'], controls: controls(12), responsible: 'Operator' },
    { step: 'Fit off', hazards: ['Cuts.'], controls: controls(3), responsible: 'Electrician' },
  ],
  blankKeys: { steps: [[null, null, null, null, null, null, null, null, null, null, 'Control line 11.', null], []], controls: [] },
  gate: [{ kind: 'line', key: 'Control line 11.', id: 'g1', parts: ['Control line 1', '1.'], label: 'Blank', need: 'Fill it in' }],
};

function page({ phone }) {
  const p = loadPage(['app.js'], () => ({ body: {} }));
  if (phone) p.window.matchMedia = (query) => ({ matches: query === '(max-width: 640px)' });
  return p;
}

test('on a phone, a long step shows its first six controls and a button for the rest', async () => {
  const p = page({ phone: true });
  await settle();
  const html = p.window.SiteReady.render(DRAFT, { movable: true });
  const rows = html.split('data-step-row=').slice(1);
  const more = (rows[0].match(/class="ctl-more"/g) || []).length;
  // Lines 7 to 12 are folded, except line 11, which has a blank to fill in.
  assert.equal(more, 5);
  assert.match(rows[0], /<button type="button" class="secondary ctl-show" data-ctl-more="0">Show all 12 controls<\/button>/);
  assert.doesNotMatch(rows[1], /ctl-more|ctl-show/, 'a short step shows every line');
  // Every line is still in the page, for the computer layout and for Show all.
  assert.equal((rows[0].match(/data-ctl-line=/g) || []).length, 12);
});

test('each step has Change this step, which shows its tools and stays after the draft is prepared again', async () => {
  const p = page({ phone: true });
  await settle();
  let html = p.window.SiteReady.render(DRAFT, { movable: true });
  assert.match(html, /data-step-edit="0" aria-expanded="false">Change this step<\/button>/);
  // The step being changed is drawn so again after a change prepares the draft again.
  p.run("stepsEditing.add('Use an elevating work platform'); stepsOpen.add('Fit off')");
  html = p.window.SiteReady.render(DRAFT, { movable: true });
  assert.match(html, /data-step-row="0" class="editing"/);
  assert.match(html, /data-step-edit="0" aria-expanded="true">Done changing this step<\/button>/);
  assert.match(html, /data-step-row="1" class="open-all"/);
  // A saved SWMS shown read-only has no tools at all.
  assert.doesNotMatch(p.window.SiteReady.render(DRAFT), /data-step-edit|ctl-show/);
});

test('the forms printed for others to fill in start folded on a phone, open on a computer', async () => {
  const phone = page({ phone: true });
  await settle();
  const folded = phone.window.SiteReady.render(DRAFT, { movable: true });
  for (const heading of ['Legislation and codes of practice', 'Principal contractor review', 'Worker sign-on']) {
    assert.match(folded, new RegExp(`<details class="sheet-fold"><summary><h4>${heading}</h4>`), heading);
  }
  // The job steps and the site's own sections are never folded.
  for (const heading of ['Job steps', 'Personal protective equipment', 'Site-specific', 'Prepared by']) assert.match(folded, new RegExp(`<h4>${heading}</h4>`));
  assert.doesNotMatch(folded, /<summary><h4>(Job steps|Emergency arrangements|Plant and equipment)/);
  const computer = page({ phone: false });
  await settle();
  const open = computer.window.SiteReady.render(DRAFT, { movable: true });
  assert.equal((open.match(/<details class="sheet-fold" open>/g) || []).length, 3);
  // Nothing is lost by folding: the same rows are there.
  assert.match(folded, /Work Health and Safety Act 2011 \(Qld\)/);
  assert.match(folded, /Accepted with changes/);
  assert.match(folded, /The Word file has two pages of lines for workers to sign/);
});

test('phone styles: controls at least 44 px and text at least 16 px on every page the subbie and worker use', () => {
  const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');
  const index = read('index.html');
  const phone = index.slice(index.lastIndexOf('@media (max-width: 640px)'));
  assert.match(phone, /min-height: 44px/);
  assert.match(phone, /button\.link \{[^}]*min-height: 44px/);
  assert.match(phone, /\.step-move button \{ width: 44px; min-width: 44px; height: 44px; \}/);
  assert.match(phone, /font-size: 16px/);
  // Every rule that sets text under 16 px on the main page has a phone size of 16 px.
  const small = [...index.matchAll(/^\s*([^{@}\n]+?)\s*\{[^}]*font-size: (1[0-5]px|0\.\d+em)/gm)].map((m) => m[1].trim())
    .filter((selector) => !/step-move button|fold-note|\.qr/.test(selector));
  for (const selector of small) {
    for (const part of selector.split(',').map((item) => item.trim())) {
      assert.ok(phone.includes(part), `${part} is 16 px on a phone`);
    }
  }
  for (const name of ['sign.html', 'check.html', 'verify.html']) {
    assert.match(read(name), /@media \(max-width: 640px\) \{[^]*font-size: 16px/, name);
  }
  // The sign-on progress bar belongs to another piece of work and is left as it is.
  assert.match(read('sign.html'), /\.progress \{ position: sticky; bottom: 0; background: #1f4e3d; color: #fff; border-radius: 8px; padding: 10px 14px; margin-top: 14px; font-size: 14px; font-weight: 600; \}/);
});
