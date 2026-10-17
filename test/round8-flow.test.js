// Messy test round 8 (16 October 2026), flow faults: the spelling fixer leaves the job address and the
// names typed as typed, falls answered No are checked against a step that rates a fall High, a given
// "Safety data sheet" answer is never dropped from what the page sends, the company email typed before
// sign-in is kept, an answer prints whole in its place, "Updated wording" only for a real library change,
// scope headings and price labels are not task words, and the smaller profile, form and answer faults.
// The on-screen faults (the Emergency row, the review note on a phone) are also run in a browser
// (scratchpad/flow8).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prepareDraft, questionsFor, taskLine } = require('../draft');
const { draftBody } = require('../input');
const { fixSpelling } = require('../spelling');
const { titleFor } = require('../accounts');
const { checkSwms, fromDraft, streetSlips } = require('../builder-check');
const { downloadGaps } = require('../download-gate');
const gate = require('../public/gate-rules');
const substanceRules = require('../public/substance-rules');
const { loadPage } = require('./fake-dom');
const { ANSWERED } = require('./helpers');

const SILICA_FACTS = { ...ANSWERED.facts, silicaControls: 'Saw cuts are made wet with a water-fed road saw, and the cutter wears a fit tested P2 respirator.' };
const draftOf = (input) => prepareDraft(draftBody({ fallRisk: 'no', residential: 'no', crane: 'none', ...ANSWERED, ...input }));

// ---- 1. The spelling fixer and the names typed ----

const KERB = 'Saw cut and patch the kerb along the stuart hwy service road, nite works with TCs.';
const ROAD = 'mill and resheet 300m of the stuart hwy service rd, profiler, 2 tipers, paver and 2 rolers, tack coat, nite works with TCs, saw cut joints at the tie ins, line marking by others';

test('a word of the job address is never changed in the task, and a slip one letter off it takes the address\'s spelling', () => {
  // Run 8: "stuart hwy" became "start hwy" in the task line, title, file names and sign-on sheet.
  const fixed = fixSpelling(ROAD, { places: '400 Stuart Hwy, Winnellie NT 0820' });
  assert.match(fixed.text, /of the stuart hwy service rd/);
  assert.ok(!fixed.fixes.some((fix) => fix.from === 'stuart'), JSON.stringify(fixed.fixes));
  // Flow7 decision 2 stays, towards the address's own spelling only.
  assert.equal(fixSpelling('along mitchel st verge', { places: '45 Mitchell St, Darwin City NT' }).text, 'along Mitchell st verge');
  // A name the user typed elsewhere is kept too.
  assert.equal(fixSpelling('kerb works for stuart', { names: ['Stuart Civil Pty Ltd'] }).text, 'kerb works for stuart');
  const input = { state: 'nt', workplace: '400 Stuart Hwy, Winnellie NT 0820', task: ROAD };
  const draft = draftOf(input);
  assert.match(draft.task, /stuart hwy/);
  assert.doesNotMatch(draft.task, /start hwy/);
  assert.match(titleFor({}, draftBody({ ...ANSWERED, ...input })), /^mill and resheet 300m of the stuart hwy/);
  assert.ok(!(draft.spellingFixes || []).some((fix) => fix.from === 'stuart'));
});

test('cut-short words and -s plurals are fixed, and the task line prints the same in every prepare', () => {
  // Runs 6 and 8: "bathrms", "boxs" and "nite" stayed; "lvl" read "level" in one prepare and "lvl" in the next.
  const fixed = fixSpelling('waterproof 6 bathrms and 2 balconys lvl 3 and 4, torch on membrane on podium planter boxs, nite works');
  assert.equal(fixed.text, 'waterproof 6 bathrooms and 2 balconies lvl 3 and 4, torch on membrane on podium planter boxes, night works');
  // A word ending in -ss is not a slip.
  assert.equal(fixSpelling('the boss said to kiss the grass').text, 'the boss said to kiss the grass');
  const task = 'Tile 6 bathrms on lvl 3 with ceramic floor tiles.';
  const stood = draftOf({ state: 'tas', task, facts: {}, kinds: [] });
  const full = draftOf({ state: 'tas', task });
  assert.equal(stood.kind, 'stand-down');
  assert.equal(full.kind, 'draft', (full.missing || []).join('; '));
  assert.equal(stood.task, full.task);
  assert.equal(full.task, 'Tile 6 bathrooms on lvl 3 with ceramic floor tiles.');
});

test('every draft carries the spelling fixed in its task, and the note under the task follows the task as it is now', () => {
  const draft = draftOf({ state: 'nt', workplace: '400 Stuart Hwy, Winnellie NT 0820', task: ROAD });
  assert.deepEqual(draft.spellingFixes.map((fix) => `${fix.from}>${fix.to}`), ['tipers>tippers', 'rolers>rollers', 'nite>night']);
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  const note = p.document.getElementById('spelling-note');
  p.document.getElementById('task').value = 'start hwy works at nite';
  p.window.testFixes = [{ from: 'stuart', to: 'start' }, { from: 'nite', to: 'night' }];
  // A fix whose word was retyped goes at once (run 8: "stuart to start" stayed after "Stuart Hwy" was typed).
  p.document.getElementById('task').value = 'Stuart Hwy works at nite';
  p.run('showSpellingFixes(testFixes)');
  assert.equal(note.textContent, 'Spelling fixed in the SWMS: nite to night.');
  p.document.getElementById('task').value = 'Stuart Hwy works at night';
  p.document.getElementById('task').dispatchEvent(new p.window.Event('input'));
  assert.equal(note.classList.contains('hidden'), true);
});

test('Builder check flags a street in the task line one or two letters off the job address', () => {
  assert.deepEqual(streetSlips('mill and resheet the start hwy service rd', '400 Stuart Hwy, Winnellie NT 0820'), [{ typed: 'start hwy', street: 'Stuart Hwy' }]);
  // The address's own spelling in any case, and another street altogether, are not flagged.
  assert.deepEqual(streetSlips('resheet the Stuart HWY and the stuart hwy service rd', '400 Stuart Hwy, Winnellie NT 0820'), []);
  assert.deepEqual(streetSlips('trench along jones rd', '12 Smith Street, Paddington QLD'), []);
  assert.deepEqual(streetSlips('work on st georges tce', '100 St Georges Terrace, Perth WA'), []);
  const draft = draftOf({ state: 'nt', workplace: '400 Stuart Hwy, Winnellie NT 0820', task: KERB, facts: SILICA_FACTS });
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  const clean = checkSwms(fromDraft(draft, { state: 'nt' }), { state: 'nt' });
  const slipped = checkSwms(fromDraft({ ...draft, task: draft.task.replace('stuart hwy', 'start hwy') }, { state: 'nt' }), { state: 'nt' });
  const w7 = (result) => result.findings.find((item) => item.rule === 'W7');
  assert.ok(!JSON.stringify(w7(clean)).includes('Check the street name'));
  assert.match(JSON.stringify(w7(slipped)), /The task names \\"start hwy\\", but the job address is on Stuart Hwy\. Check the street name in the task\./);
  assert.equal(slipped.score, Math.max(0, clean.score - 1));
});

// ---- 2. Falls answered No beside a step that rates a fall High ----

const PAINT = fs.readFileSync(path.join(__dirname, '..', 'scenarios', 'scopes', 'b-painting.txt'), 'utf8').split('\n').slice(36, 41).join('\n');
const PAINT_FACTS = { ...ANSWERED.facts, safetyDataSheet: 'Dulux Wash and Wear and sealer. SDSs in the van.' };

test('falls answered No while a step rates a fall from height High is asked about before download, and can be kept', () => {
  // Run 5: SiteWrite's own "Set up access to the outside of the structure" rated a fall High, and the file
  // said "Fall of more than 2 metres: No" with no high risk work.
  const input = draftBody({ ...ANSWERED, state: 'sa', fallRisk: 'no', residential: 'no', crane: 'none', task: PAINT, facts: PAINT_FACTS });
  const draft = prepareDraft(input);
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.deepEqual(draft.fallConflict, { steps: ['Set up access to the outside of the structure'], metres: 2, kept: false });
  const gap = downloadGaps(input, draft).find((item) => item.kind === 'fall');
  assert.equal(gap.field, 'fall-check');
  assert.match(gap.need, /^You answered No to a fall of more than 2 metres, but the step "Set up access to the outside of the structure" rates a fall from height High\./);
  // Kept as No, it prints that no one works where they could fall that far, and the download goes on.
  const keptInput = draftBody({ ...input, fallNoKept: true });
  const kept = prepareDraft(keptInput);
  assert.equal(kept.fallConflict.kept, true);
  assert.equal(kept.fallRisk, 'No. No work is done where a person could fall 2 metres or more.');
  assert.ok(!downloadGaps(keptInput, kept).some((item) => item.kind === 'fall'));
  // Answered Yes, there is nothing to check.
  const yes = prepareDraft(draftBody({ ...input, fallRisk: 'yes', facts: { ...PAINT_FACTS, fallControl: 'Mobile scaffolds with guardrails are used for work above 2 m.' } }));
  assert.equal(yes.fallConflict, undefined);
  // A step whose fall hazard was marked "Does not apply" asks nothing.
  const inside = draftOf({ state: 'sa', task: 'Paint the internal plasterboard walls and ceilings of the ground floor offices.', facts: PAINT_FACTS });
  assert.equal(inside.fallConflict, undefined);
});

test('the draft asks to check the fall answer, with Yes and Keep No', () => {
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  p.window.testDraft = { kind: 'draft', fallConflict: { steps: ['Set up access to the outside of the structure'], metres: 2, kept: false } };
  const html = p.run('fallCheckBlock(testDraft)');
  assert.match(html, /id="fall-check"/);
  assert.match(html, /You answered No to "Could a person fall more than 2 metres\?", but the step "Set up access to the outside of the structure" rates a fall from height High\./);
  assert.match(html, /data-fall-yes>Change my answer to Yes</);
  assert.match(html, /data-fall-keep>Keep No: no one can fall more than 2 metres</);
  p.window.testDraft.fallConflict.kept = true;
  assert.equal(p.run('fallCheckBlock(testDraft)'), '');
  // The kept answer goes with the draft and comes back with the work.
  p.run('fallNoKept = true');
  assert.equal(p.run('payload().fallNoKept'), true);
  p.run('fillStart({ fallRisk: "no" })');
  assert.equal(p.run('payload().fallNoKept'), undefined);
});

// ---- 3. The SDS answer stays in what the page sends ----

const FIRE = 'Install wet pipe sprinkler system throughout all buildings. Install internal fire hydrants and fire hose reels and their reticulation. Paint fire services installation as specified. Install fire protection devices in air plenums and ducts and seal them.';
const SDS = 'blazemaster cpvc cement, rocol thread paste, fire sealant. SDSs in the gang box';

test('a Safety data sheet answer already given keeps its question once a product is listed, so it prints in the file', () => {
  // Run 3: once a product was listed and the questions were asked again, the SDS box went, the page stopped
  // sending its answer, and the SWMS 1 file had no SDS answer and no sealant "Not required" reason.
  const product = [{ id: 'sub-1', type: 'Adhesives', product: 'BlazeMaster CPVC one step cement', sdsDate: '2024-11-01', controls: 'Use with good ventilation.\nNitrile gloves and safety glasses', confirmed: true }];
  const why = { 'Sealants, mastics and silicone': 'passive fire sub does the sealing' };
  const base = { ...ANSWERED, state: 'qld', fallRisk: 'yes', residential: 'no', crane: 'none', task: FIRE, substances: product, substancesNotUsed: Object.keys(why), substancesNotUsedWhy: why };
  const asked = (facts) => questionsFor(draftBody({ ...base, facts })).required.map((item) => item.id);
  assert.ok(asked({ ...ANSWERED.facts, safetyDataSheet: SDS }).includes('safetyDataSheet'));
  // With no answer given, a listed product still takes the question's place (D277 item 3).
  assert.ok(!asked({ ...ANSWERED.facts }).includes('safetyDataSheet'));
  const draft = prepareDraft(draftBody({ ...base, facts: { ...ANSWERED.facts, fallControl: 'Scissor lifts with handrails for all pipe work above 2 m.', safetyDataSheet: SDS } }));
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.ok(draft.references.some((row) => row.label === 'Safety data sheet' && row.text === SDS));
  assert.deepEqual(draft.substances.notRequired, [{ type: 'Sealants, mastics and silicone', reason: 'passive fire sub does the sealing' }]);
});

// ---- 4. The company email typed before sign-in ----

test('the company email typed before signing in is kept, not replaced by the sign-in email', async () => {
  // Run 2: "dan@kowalskiroofing.com.au" became the sign-in email in the profile and the header.
  const typed = { name: 'Kowalski Roofing Pty Ltd', abn: '51 824 753 556', address: '', phone: '0412 556 781', email: 'dan@kowalskiroofing.com.au' };
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }), { stored: { 'sitewrite.profileTyping': JSON.stringify(typed) } });
  const saved = [];
  p.window.SiteWrite.saveCompany = async (next) => { saved.push(next); return next; };
  p.window.SiteWrite.signedIn = () => true;
  const kept = await p.run('signedInProfile({ name: "", abn: "", address: "", phone: "", email: "messy-r8a-subbie@siteready.test" }, "messy-r8a-subbie@siteready.test")');
  assert.equal(kept.email, 'dan@kowalskiroofing.com.au');
  assert.equal(saved[0].email, 'dan@kowalskiroofing.com.au');
  // A company email the account already has, other than the sign-in email, is kept.
  const q = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }), { stored: { 'sitewrite.profileTyping': JSON.stringify(typed) } });
  q.window.SiteWrite.saveCompany = async (next) => next;
  const company = await q.run('signedInProfile({ name: "Kowalski Roofing Pty Ltd", abn: "51 824 753 556", address: "", phone: "0412 556 781", email: "office@kowalskiroofing.com.au" }, "dan@kowalskiroofing.com.au")');
  assert.equal(company, null);
});

// ---- 5. An answer prints whole, in its place ----

test('an answer to a question prints whole in its place, not split into the Controls table', () => {
  // Run 2: the silica answer printed as three "Isolate or engineer" lines, one of them PPE; run 1: the SDS
  // answer printed as an Administrative control.
  const silica = 'Drill the parapet anchor holes with the hilti rotary hammer with on-tool extraction to an H class vacum. P2 masks fit tested. Only about 40 holes so under 30 min a day, our written assesment says not high risk.';
  const draft = draftOf({
    state: 'vic', fallRisk: 'yes', crane: 'company', slinging: 'crane',
    task: 'strip old roof sheets and replace with new colorbond trimdek on the commercial building, new safety mesh, new box gutters and flashings, drill and chemset anchors into the concrete parapet for the roof anchors, crane truck lifts the sheets',
    facts: { ...ANSWERED.facts, silicaControls: silica, fallControl: 'Builders scaffold with handrails as edge protection. New safety mesh is laid under the sheets.', safetyDataSheet: 'chemset epoxy, SDS in the ute', harnessSystem: 'Full body harness with 2 m restraint lanyard clipped to the roof anchor points.' },
  });
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  const table = draft.controls.map((item) => item.text).join('\n');
  assert.doesNotMatch(table, /P2 masks|parapet anchor holes|40 holes|chemset epoxy/);
  assert.ok(draft.references.some((row) => row.text === silica));
  assert.ok(draft.references.some((row) => row.label === 'Safety data sheet' && row.text === 'chemset epoxy, SDS in the ute'));
  // Whole in the step that drills.
  assert.ok(draft.jobSteps.some((step) => step.controls.includes(silica)));
  // The fall control, which has no other place, prints once and whole.
  assert.equal(draft.controls.filter((item) => item.text === 'Builders scaffold with handrails as edge protection. New safety mesh is laid under the sheets.').length, 1);
});

// ---- 7. "Updated wording" only for a real library change ----

test('updated wording is offered only when the library or the law changed since the revision was saved', () => {
  const { updatedWording, withCompany } = require('../accounts');
  const { LIBRARY_VERSION } = require('../revisions');
  const company = { name: 'Hunter Steel Erectors Pty Ltd', abn: '51 824 753 556' };
  const input = draftBody({ ...ANSWERED, state: 'nsw', task: 'Install timber paling fence panels and posts along the boundary.', fallRisk: 'no', residential: 'no', crane: 'none' });
  const draft = prepareDraft(withCompany(input, company));
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  const differs = { ...draft, controls: [...draft.controls, { level: 'Administrative', text: 'A line the same library would not print.' }] };
  // Run 1: on the same build, the kept print differed and the notice showed. The same library is not a change.
  assert.equal(updatedWording({ input }, company, { draft: differs, libraryVersion: LIBRARY_VERSION }).available, false);
  // A revision saved under another library version, that prints differently, is.
  assert.equal(updatedWording({ input }, company, { draft: differs, libraryVersion: 'older' }).available, true);
  assert.equal(updatedWording({ input }, company, { draft, libraryVersion: 'older' }).available, false);
  // A new version of the regulation is a change on any library.
  assert.equal(updatedWording({ input }, company, { draft: { ...draft, versionLabel: 'an older version' }, libraryVersion: LIBRARY_VERSION }).available, true);
});

// ---- 8. Scope headings and price words are not task words ----

test('a scope\'s lead-in, "The Subcontractor shall" and a price label after the work come off the task line and the title', () => {
  // Run 5: the pasted lead-in named the SWMS; run 3: "... to cover roof space: Variation Price Option."
  assert.ok(taskLine(PAINT).startsWith('Paint all internal plasterboard, villaboard walls and ceilings, in Building 1, 2, 3 and 4 in a 3 coat system (excluding'));
  assert.doesNotMatch(taskLine(PAINT), /scope of work|Subcontractor|principal areas/i);
  assert.match(taskLine(PAINT), /Paint all doors, architraves.*Paint Building 4 external surfaces.*Apply sealer coat to walls behind fixed joinery\.$/);
  assert.equal(titleFor({}, { task: PAINT }), 'Paint all internal plasterboard, villaboard walls and ceilings, in Building 1, 2, 3 and 4 in a 3…');
  assert.equal(taskLine('Install fire protection devices in air plenums and ducts and seal them. Install additional fire hydrants and hose reels to cover roof space: Variation Price Option.'), 'Install fire protection devices in air plenums and ducts and seal them. Install additional fire hydrants and hose reels to cover roof space.');
  assert.equal(taskLine('Scope of works:\n1. Supply and install handrails\n2. Paint the handrails'), 'Supply and install handrails. Paint the handrails.');
  // The builder ("the Contractor" in a subcontract) is not this crew: its words stay.
  assert.equal(taskLine('The Contractor will provide the scissor lifts. The Subcontractor is to install the ceiling grid.'), 'The Contractor will provide the scissor lifts. Install the ceiling grid.');
  // A colon in the work itself stays.
  assert.equal(taskLine('Power to specialised equipment: Rising Step panel.'), 'Power to specialised equipment: Rising Step panel.');
});

// ---- 10. Profile and form messages ----

test('a wrong ABN is said once, a saved profile says so in its heading, and a picture for the scope is named when Find is pressed', () => {
  const lookups = [];
  const p = loadPage(['gate-rules.js', 'app.js'], (method, route) => { lookups.push(route); return { body: { enabled: true, found: false, error: 'That is not a valid ABN.' } }; });
  const box = p.document.getElementById('profile-abn');
  box.value = '76 811 401 856';
  box.dispatchEvent(new p.window.Event('change'));
  // The box's own note, and no register lookup to say it again (run 3: two messages at once).
  assert.equal(p.document.getElementById('abn-error').textContent, 'That ABN is not valid. Check the 11 digits.');
  assert.ok(!lookups.some((route) => route.includes('/api/abn')));
  // Saved with the button, the profile's heading says Saved (runs 1 and 2: it closed with no note).
  p.document.getElementById('profile-company').value = 'Kowalski Roofing Pty Ltd';
  box.value = '51 824 753 556';
  p.run('saveProfile()');
  assert.equal(p.document.getElementById('profile-summary').textContent, '· Kowalski Roofing Pty Ltd · Saved');
  const scope = fs.readFileSync(path.join(__dirname, '..', 'public', 'scope.js'), 'utf8');
  assert.match(scope, /\$\('scope-error'\)\.textContent = notScope \? notScopeText\(\) : 'Attach the scope or paste it first\.'/);
  assert.match(scope, /was taken off: it is not a Word file, a PDF or a text file\./);
});

// ---- 11. Weak answers ----

test('a thing in a person\'s box, a short company phone and one-word SDS controls are asked about before download', () => {
  // Runs 3, 5 and 6: "gloves" printed as a product's SDS controls, and "0412 555 81" as the company phone.
  const rule = (id) => gate.fieldRule(gate.PEOPLE_FIELDS.find((item) => item.id === id));
  for (const id of ['complianceResponsible', 'reviewer', 'worksManager']) {
    assert.match(gate.answerNeed(rule(id), 'gloves'), /^"gloves" does not name a person\./);
    assert.match(gate.answerNeed(rule(id), 'none'), /cannot be "none"/);
    assert.match(gate.answerNeed(rule(id), 'TBC'), /is not an answer yet/);
  }
  // A first name alone is not refused (a decision for the owner).
  assert.equal(gate.answerNeed(rule('complianceResponsible'), 'Dave'), '');
  assert.equal(gate.answerNeed(rule('reviewer'), 'Sam Lee, supervisor'), '');
  const input = draftBody({ ...ANSWERED, state: 'qld', task: 'Install timber paling fence panels and posts along the boundary.', fallRisk: 'no', residential: 'no', crane: 'none', companyPhone: '0412 555 81' });
  const draft = prepareDraft(input);
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  const phone = downloadGaps(input, draft).find((item) => item.id === 'companyPhone');
  assert.equal(phone.field, 'profile-phone');
  assert.match(phone.need, /^"0412 555 81" is not a full phone number\. A mobile has 10 digits, for example 0412 345 678\. Fix it in the Company profile/);
  assert.ok(!downloadGaps({ ...input, companyPhone: '0412 555 810' }, draft).some((item) => item.id === 'companyPhone'));
  const row = { id: 'sub-1', type: 'Paints and coatings', product: 'Dulux Wash and Wear', controls: 'gloves', sdsDate: '2025-01-10', confirmed: true };
  assert.match(substanceRules.substanceNeed(row, 'Paint walls'), /"gloves" is too short to act on/);
  assert.equal(substanceRules.substanceNeed({ ...row, controls: 'Nitrile gloves\nGood ventilation' }, 'Paint walls'), '');
});

// ---- 6. The Emergency row on screen follows the muster point ----

test('the Emergency rows on screen follow the details as typed, a letter at a time or after the box is emptied', () => {
  // Run 3: the header changed in place, but the Emergency table kept "main gate" with the downloads enabled.
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  const cell = (html) => ({ innerHTML: html, get textContent() { return this.innerHTML; } });
  const rows = [['Emergency', 'Call 000. Site emergency procedure and muster point', 'main gate'], ['Injury', 'First aid kit. First aider: Steve', 'Nearest hospital: QEII']]
    .map((cells) => { const tds = cells.map(cell); return { querySelectorAll: () => tds, tds }; });
  const table = { querySelectorAll: () => rows };
  const head = { nextElementSibling: table };
  const sheet = { querySelectorAll: () => [], querySelector: (sel) => (sel === '#emergency-table' ? head : null) };
  const result = p.document.getElementById('result');
  result.querySelector = (sel) => (sel === '.sheet' ? sheet : null);
  result.classList.remove('hidden');
  p.window.testDraft = { kind: 'draft', emergency: [{ type: 'Emergency', equipment: 'Call 000. Site emergency procedure and muster point', detail: 'main gate' }, { type: 'Injury', equipment: 'First aid kit. First aider: Steve', detail: 'Nearest hospital: QEII' }] };
  p.run('shownDraft = testDraft; shownSent = { musterPoint: "main gate", firstAider: "Steve", hospital: "QEII" }');
  const muster = p.document.getElementById('muster-point');
  const first = p.document.getElementById('first-aider');
  first.value = 'Steve';
  p.document.getElementById('hospital').value = 'QEII';
  // Emptied, then typed a letter at a time.
  for (const value of ['', 'M', 'Ma', 'Main gate on Wacol Station Rd']) { muster.value = value; p.run('showDetailsInDraft()'); }
  assert.equal(rows[0].tds[2].innerHTML, 'Main gate on Wacol Station Rd');
  first.value = 'Steve Kirby';
  p.run('showDetailsInDraft()');
  assert.equal(rows[1].tds[1].innerHTML, 'First aid kit. First aider: Steve Kirby');
  assert.equal(rows[1].tds[2].innerHTML, 'Nearest hospital: QEII');
});

// ---- 9. The review note on a phone ----

test('the review note goes just above the work brought back further down the page, and into view', () => {
  // Run 1: on the phone the note loaded above the screen, the page scrolled to "Your work is back".
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'account.js'), 'utf8');
  const body = source.slice(source.indexOf('function reviewsBackNote(list) {'), source.indexOf('async function checkReviewsBack()'));
  const moves = [];
  const el = (id, top = 0) => ({ id, top, innerHTML: '', className: '', previousElementSibling: null, nextElementSibling: null, setAttribute() {}, remove() {}, getBoundingClientRect() { return { top: this.top }; }, scrollIntoView() { moves.push(`scroll ${this.id}`); }, before(node) { moves.push(`${node.id} before ${this.id}`); node.nextElementSibling = this; }, after(node) { moves.push(`${node.id} after ${this.id}`); node.previousElementSibling = this; } });
  const bar = el('account-bar');
  const back = el('unsaved-note', 120);
  const nodes = { 'account-bar': bar, 'unsaved-note': back };
  const document = { getElementById: (id) => nodes[id] || null, createElement: () => { const made = el('reviews-back', -400); nodes['reviews-back'] = made; return made; } };
  const place = new Function('document', '$', 'esc', `${body}; return reviewsBackNote;`)(document, (id) => document.getElementById(id), (text) => String(text));
  place([{ id: 'a', title: 'Paint walls', review: { label: 'Approved with conditions', date: '17 October 2026' } }]);
  assert.deepEqual(moves, ['reviews-back after account-bar', 'reviews-back before unsaved-note', 'scroll reviews-back']);
  // With no work brought back, it stays at the top, under the account bar.
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(app, /const reviews = document\.getElementById\('reviews-back'\);\n  if \(reviews\) note\.before\(reviews\);\n  \(reviews \|\| note\)\.scrollIntoView\(\{ block: 'start' \}\);/);
});
