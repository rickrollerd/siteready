// Messy test round 4 (14 October 2026), flow, answer and print faults, and the owner's D292: a SWMS of
// the user's own steps is prepared; the state, the hospital and a reason for "Not required" before
// download; questions asked only where they apply; weak answers refused; the fill-in blanks named once;
// "Prepared by", the ABN, the spelling and the reviewer's numbered conditions as they print.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, coverCheck, answerState } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps } = require('../download-gate');
const { notAnswer, answerNeed, fieldWeak, phoneNumber, licenceNeed, sameNameWarning, PEOPLE_FIELDS, fieldRule } = require('../public/gate-rules');
const rules = require('../public/substance-rules');
const { blankWarning } = require('../public/design-fill');
const { emergencyQuestions } = require('../emergency');
const { fixSpelling } = require('../spelling');
const { conditionLines } = require('../docx-draft');
const { preparedFromCheck } = require('../human-check');
const { toSuggestion } = require('../places');
const { ANSWERED, ready } = require('./helpers');

const OWN = [{ part: 'Handle and store paint materials on site', name: 'Store paint in the locked paint store', hazards: ['Spilt paint and solvent fumes in the store', 'Strain lifting 20 L drums'], controls: ['Paint is kept on bunded shelves in the locked store with lids on', 'Drums are moved on a trolley, with a two-person lift over 20 kg'], who: 'Supervisor' }];
const STORE = { state: 'sa', fallRisk: 'no', residential: 'no', crane: 'none', task: 'Handle and store paint materials on site.', kinds: [], ...ANSWERED, facts: { safetyDataSheet: 'Dulux acrylic paint; the SDS is kept in the site office; gloves and glasses are worn.' } };

// ---- 1. Work with no job steps: the user's own steps (B fault 1) ----

test('a SWMS of the user\'s own steps is prepared, not stood down for want of job steps', () => {
  const without = prepareDraft(draftBody(ready(STORE)));
  assert.equal(without.kind, 'stand-down');
  assert.match(without.missing[0], /write your own step for the work with "Write a step for this"\.$/);
  assert.ok(!/write this SWMS yourself/.test(without.missing.join(' ')));
  assert.match(questionsFor(draftBody(STORE)).standDown.message, /"Write a step for this"/);
  // With the user's own step, the questions no longer stand it down and it drafts.
  assert.equal(questionsFor(draftBody({ ...STORE, ownSteps: OWN })).standDown, undefined);
  const draft = prepareDraft(draftBody(ready({ ...STORE, ownSteps: OWN })));
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.deepEqual(draft.jobSteps.map((step) => step.step), ['Before starting', 'Store paint in the locked paint store (Our own step)', 'Finish and clean up']);
  // A step with no control does not print, and does not count.
  const thin = prepareDraft(draftBody(ready({ ...STORE, ownSteps: [{ ...OWN[0], controls: [] }] })));
  assert.equal(thin.kind, 'stand-down');
});

test('"Move materials into place" with the user\'s own step for the main work is not refused as only the work around it', () => {
  const around = prepareDraft(draftBody(ready({ ...STORE, kinds: ['carpLoad'] })));
  assert.equal(around.kind, 'stand-down');
  assert.match(around.missing[0], /only for the access, lifting or other work around it/);
  const draft = prepareDraft(draftBody(ready({ ...STORE, kinds: ['carpLoad'], ownSteps: OWN })));
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.deepEqual(draft.jobSteps.map((step) => step.step), ['Before starting', 'Move materials into place', 'Store paint in the locked paint store (Our own step)', 'Finish and clean up']);
  // The work the step was written for needs nothing more before download.
  assert.deepEqual(coverCheck(draftBody({ ...STORE, kinds: ['carpLoad'], ownSteps: OWN, unmatched: ['Handle and store paint materials on site.'] })).left, []);
});

// ---- 2. D292: the hospital, the state ----

test('a hospital or medical centre is needed before download (D292 item 2), with Find nearest named', () => {
  const { hospital, ...rest } = ANSWERED;
  const body = draftBody(ready({ state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no', ...rest }));
  const gaps = downloadGaps(body, prepareDraft(body));
  assert.deepEqual(gaps.map((gap) => gap.id), ['hospital']);
  assert.equal(gaps[0].label, 'Hospital or medical centre');
  assert.match(gaps[0].need, /Find nearest from the job address/);
  const given = draftBody(ready({ state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no', ...rest, hospital: 'Royal Brisbane and Women\'s Hospital' }));
  assert.deepEqual(downloadGaps(given, prepareDraft(given)), []);
  assert.ok(PEOPLE_FIELDS.some((item) => item.id === 'hospital' && item.field === 'hospital'));
  assert.match(answerNeed(fieldRule(PEOPLE_FIELDS.find((item) => item.id === 'hospital')), 'dont know'), /not an answer yet/);
});

test('no state is assumed: the server asks for one, and the page ticks none (D292 item 1)', () => {
  const asked = questionsFor(draftBody({ task: 'Replace a fence.', fallRisk: 'no' }));
  assert.equal(asked.kind, 'refused');
  assert.equal(asked.message, 'Choose a state.');
  const page = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.ok(!/first\.checked = true/.test(page), 'no state is ticked when the states load');
  assert.match(page, /Which state or territory is this job in\? Pick the job address from the list under the box, or tick the state below\./);
});

// ---- 3. D292: "Not required" needs a reason where the user's own words name the product ----

const MEMBRANE = { state: 'tas', fallRisk: 'no', residential: 'no', crane: 'none', task: 'Waterproof wet areas and balconys, liquid membrane and torch on membrane to podium.', ...ANSWERED, facts: { silicaControls: 'Grinding is done with on-tool dust extraction and P2 respirators fit tested; the silica assessment is kept in the site folder.' } };

test('"Not required" for a product the task names needs a short reason, which prints (D292 item 3)', () => {
  const words = rules.ownWords(MEMBRANE);
  assert.equal(rules.namedIn('Waterproofing membranes and primers', words), 'Waterproof');
  assert.equal(rules.namedIn('Gases (LPG, acetylene, oxygen)', words), 'torch on');
  assert.equal(rules.namedIn('Cement, concrete, grout and mortar', 'Core drill through the concrete slab.'), '', 'the slab drilled is not a cement product used');
  assert.match(rules.notUsedNeed('Waterproofing membranes and primers', '', words), /^Waterproofing product: your task or answers name "Waterproof"\. Add the product you use, or give a short reason it is not required, for example "no membrane in our work"\.$/);
  assert.match(rules.notUsedNeed('Waterproofing membranes and primers', 'dont know', words), /"dont know" does not say why it is not required/);
  assert.match(rules.notUsedNeed('Waterproofing membranes and primers', 'others', words), /"others" does not say why/);
  assert.equal(rules.notUsedNeed('Waterproofing membranes and primers', 'Supplied and applied by the membrane subcontractor', words), '');
  // The download waits for it.
  const first = prepareDraft(draftBody(ready(MEMBRANE)));
  assert.equal(first.kind, 'draft', (first.missing || []).join('; '));
  const types = first.substances.items.map((item) => item.product);
  assert.ok(types.includes('Waterproofing membranes and primers'), types.join('; '));
  const ticked = { ...ready(MEMBRANE), substancesNotUsed: types, substancesNotUsedWhy: undefined, substances: undefined };
  const body = draftBody(ticked);
  const gaps = downloadGaps(body, prepareDraft(body)).filter((gap) => gap.kind === 'substanceType');
  // The membrane steps use it, so no reason settles it (content8); a type only the task names asks a reason.
  assert.ok(gaps.some((gap) => /Waterproofing product: the job step "Apply primers and liquid membranes" in this SWMS uses/.test(gap.need)), gaps.map((gap) => gap.need).join('\n'));
  assert.ok(gaps.some((gap) => /the job steps name "solvent"\. Add the product you use, or give a short reason/.test(gap.need)), gaps.map((gap) => gap.need).join('\n'));
  // With a reason, it passes and prints in the substances section. A type a step of SiteWrite's own uses
  // ("Apply primers and liquid membranes") is not one a reason settles (content7 decision 1, option A): its
  // product is listed instead.
  const used = types.filter((type) => rules.usedByStep(type, first) || (type === rules.SILICA && rules.cutStep(first)));
  const listed = used.map((type, n) => ({ id: `sub-${n + 80}`, type, product: `${rules.SHORT.get(type)} used on this job`, controls: ['Wear gloves and eye protection'], sdsDate: '2026-01-15', step: '', confirmed: true }));
  const why = Object.fromEntries(types.filter((type) => !used.includes(type)).map((type) => [type, 'Supplied and applied by others']));
  const withWhy = draftBody({ ...ticked, substancesNotUsed: types.filter((type) => !used.includes(type)), substancesNotUsedWhy: why, substances: listed });
  const draft = prepareDraft(withWhy);
  assert.deepEqual(downloadGaps(withWhy, draft).filter((gap) => gap.kind === 'substanceType'), []);
  // The membrane steps use the membrane, so it is listed, not "Not required"; a type no step uses prints its reason.
  assert.ok(used.includes('Waterproofing membranes and primers'), used.join('; '));
  const other = types.find((type) => !used.includes(type));
  if (other) {
    assert.ok(draft.substances.notRequired.some((item) => item.type === other && item.reason === 'Supplied and applied by others'));
    assert.match(require('../substances').notRequiredLine(draft), new RegExp(`^Not required on this job: .*${other.replace(/[()]/g, '\\$&')} \\(Supplied and applied by others\\)`));
  }
});

test('the reason prints in the Word file and the PDF', async () => {
  const { draftToDocx } = require('../docx-draft');
  const { draftToPdf } = require('../pdf-draft');
  const JSZip = require('jszip');
  const first = prepareDraft(draftBody(ready(MEMBRANE)));
  const types = first.substances.items.map((item) => item.product);
  const draft = prepareDraft(draftBody({ ...ready(MEMBRANE), substancesNotUsed: types, substancesNotUsedWhy: { 'Waterproofing membranes and primers': 'Supplied and applied by the membrane contractor' } }));
  const xml = await (await JSZip.loadAsync(await draftToDocx(draft))).file('word/document.xml').async('string');
  assert.ok(xml.replace(/<[^>]+>/g, '').includes('Not required on this job: Waterproofing membranes and primers (Supplied and applied by the membrane contractor)'), 'in the Word file');
  const pdf = await draftToPdf(draft);
  assert.ok(pdf.length > 1000);
});

// ---- 4. Questions asked only where they apply (B6) ----

test('the harness question is asked only where a harness is used or a fall is possible', () => {
  const harnessText = 'Full body harness with a short lanyard clipped to the boom lift basket anchor.';
  const base = { state: 'sa', residential: 'no', crane: 'none', task: 'Set up a paint washout bay at ground level and wash out brushes and rollers.', ...ANSWERED };
  // A fall control answer filled across before the fall answer was changed to No does not ask for it.
  const no = questionsFor(draftBody({ ...base, fallRisk: 'no', facts: { fallControl: harnessText } }));
  assert.ok(!no.required.some((item) => item.id === 'harnessSystem'), no.required.map((item) => item.id).join(', '));
  const yes = questionsFor(draftBody({ ...base, fallRisk: 'yes', facts: { fallControl: harnessText } }));
  assert.ok(yes.required.some((item) => item.id === 'harnessSystem'));
  // Ticked by the user, it is asked whatever the fall answer.
  const ticked = questionsFor(draftBody({ ...base, fallRisk: 'no', ppe: ['harness', 'hardHat'] }));
  assert.ok(ticked.required.some((item) => item.id === 'harnessSystem'));
  // The draft does not wait for it either.
  const draft = prepareDraft(draftBody(ready({ ...base, fallRisk: 'no', facts: { fallControl: harnessText } })));
  assert.ok(!(draft.missing || []).includes('Harness and anchors'), (draft.missing || []).join('; '));
});

const STEEL = { state: 'nsw', fallRisk: 'yes', residential: 'no', crane: 'company', slinging: 'ours', task: 'Erect structural steel columns and beams with a mobile crane.', ...ANSWERED, facts: { fallControl: 'Work from a boom lift with a harness clipped to the basket anchor.', harnessSystem: 'Full body harness with a 2 m shock-absorbing lanyard to rated anchors installed by the roofer; users trained by the supplier.', erectionSequence: 'Erection sequence and bracing to drawing S-501 rev C; the leading hand checks each frame is braced before the crane releases it.' }, site: { ...ANSWERED.site, liveServices: 'Overhead power lines along the street frontage.' } };

test('electrical rescue is asked for electrical work, not for overhead lines near other work', () => {
  const steel = prepareDraft(draftBody(STEEL));
  assert.equal(steel.kind, 'draft', (steel.missing || []).join('; '));
  assert.ok(steel.highRisk.some((item) => /energised electrical/i.test(item)));
  assert.equal(steel.electricalWork, false);
  assert.ok(!emergencyQuestions(steel).some((item) => item.category === 'electrical'), emergencyQuestions(steel).map((item) => item.id).join(', '));
  const board = prepareDraft(draftBody({ ...STEEL, crane: 'none', slinging: '', task: 'Install a new sub-board and run cables in the plant room, terminate at the existing main switchboard.', facts: { ...STEEL.facts, isolationProcedure: 'The electrician isolates, locks and tags the circuit and tests it dead before work.', energisedWork: 'none' } }));
  assert.equal(board.kind, 'draft', (board.missing || []).join('; '));
  assert.equal(board.electricalWork, true);
  assert.ok(emergencyQuestions(board).some((item) => item.id === 'elecIsolate'));
});

test('"mobile plant: Stopped by" is asked only where this SWMS uses mobile plant', () => {
  const draft = prepareDraft(draftBody(STEEL));
  assert.ok(emergencyQuestions(draft).some((item) => item.id === 'plantStop'), 'a crane and an EWP are mobile plant');
  // The category from others' plant on site, with none of this SWMS's own: not asked.
  const none = { ...draft, plant: [{ item: 'Scaffold' }, { item: 'Ladders' }] };
  assert.ok(none.highRisk.some((item) => /powered mobile plant/i.test(item)));
  assert.ok(!emergencyQuestions(none).some((item) => item.id === 'plantStop'));
  // Plant SiteWrite was not sure of counts only once the plant is confirmed.
  const maybe = { ...draft, plant: [{ item: 'Forklift' }], plantInferred: [{ item: 'Forklift', maybe: true }], plantChosen: false };
  assert.ok(!emergencyQuestions(maybe).some((item) => item.id === 'plantStop'));
  assert.ok(emergencyQuestions({ ...maybe, plantChosen: true }).some((item) => item.id === 'plantStop'));
});

test('the scaffolder is asked for their own scaffold supervisor, not the scaffolding company\'s', () => {
  const { scaffoldSupervisor, ...rest } = ANSWERED;
  const body = draftBody(ready({ state: 'wa', fallRisk: 'yes', residential: 'no', crane: 'none', task: 'Erect and dismantle a tube and coupler scaffold to 3 lifts around the building.', ...rest, facts: { fallControl: 'Advance guardrails are installed on each lift before the platform is loaded.', systemInstructions: 'Erected to the supplier instructions document SC-1 revision 2 by a crew trained by the supplier.' } }));
  const draft = prepareDraft(body);
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  const gap = downloadGaps(body, draft).find((item) => item.id === 'scaffoldSupervisor');
  assert.ok(gap);
  assert.match(gap.need, /^Your crew erects the scaffold\. Name your scaffold supervisor/);
  assert.ok(!/scaffolding company/.test(gap.need));
});

// ---- 5. Weak answers printed (A fault 9, B8) ----

test('a phone number with too few digits is refused; Australian numbers pass', () => {
  assert.match(fieldWeak('phone', '0412 55512'), /is not a full phone number\. A mobile has 10 digits/);
  for (const good of ['0412 555 123', '(07) 3555 1234', '3555 1234', '131 444', '1300 555 123', '+61 412 555 123']) assert.ok(phoneNumber(good), good);
  for (const bad of ['0412 55512', '12345', '04125551234']) assert.ok(!phoneNumber(bad), bad);
  const rule = fieldRule(PEOPLE_FIELDS.find((item) => item.id === 'worksManagerPhone'));
  assert.match(answerNeed(rule, '0412 55512'), /not a full phone number/);
});

test('"dont know" as a product\'s SDS controls is not an answer, ticked or not', () => {
  assert.ok(rules.isOpen('dont know'));
  assert.ok(rules.isOpen('Not sure, check the tin'));
  assert.ok(!rules.isOpen('Wear chemical resistant gloves'));
  const row = { type: 'Synthetic mineral fibres (insulation)', product: 'Knauf Earthwool', controls: ['dont know'], sdsDate: '2025-03-01', confirmed: true };
  assert.match(rules.substanceNeed(row, 'Fix new roofing'), /the PPE and controls its safety data sheet sets out/);
});

test('one name in every person\'s box is warned about, not refused', () => {
  assert.match(sameNameWarning({ worksManager: 'kev', complianceResponsible: 'Kev', reviewer: 'kev', firstAider: 'kev ' }), /^"kev" is named for every role/);
  assert.equal(sameNameWarning({ worksManager: 'Kev Smith', complianceResponsible: 'Kev Smith', reviewer: 'Sam Lee', firstAider: 'Kev Smith' }), '');
  assert.equal(sameNameWarning({ worksManager: 'kev', complianceResponsible: 'kev', reviewer: 'kev' }), '', 'not until every box is filled');
});

test('"crane ticket" does not name the licence; the class does', () => {
  assert.match(licenceNeed('25t mobile crane (franna)', 'crane ticket'), /does not say which licence\. Give the high risk work licence class/);
  for (const good of ['HRW licence CN', 'C2 slewing mobile crane', 'Non-slewing mobile crane (CN)']) assert.equal(licenceNeed('25t mobile crane (franna)', good), '', good);
  assert.match(licenceNeed('Mini excavator', 'ticket'), /does not say which licence or ticket/);
  assert.equal(licenceNeed('Generator', 'No'), '');
  assert.equal(licenceNeed('Forklift', 'LF forklift licence'), '');
});

test('a question is not an answer, and calling the power company is calling for help, as 000 is', () => {
  assert.match(notAnswer('powerlines?'), /is a question, not an answer/);
  assert.equal(notAnswer('Overhead power lines on the street, 8 m from the work.'), '');
  const rescue = { ask: 'Say who rescues.', emergency: true, involves: 'electrical work', rescue: true };
  assert.match(answerNeed(rescue, 'ring the power company, nobody touches him'), /only calls for help/);
  assert.match(answerNeed(rescue, 'rings 000'), /only calls for help/);
  assert.equal(answerNeed(rescue, 'The safety observer isolates the supply and frees him with the LV rescue hook'), '');
});

test('the crane\'s ground is confirmed by someone competent, and "25t at 20m" is a chart reading', () => {
  assert.equal(answerState('groundBearing', 'set up on the road on 1.2m x 1.2m pads, crane op checks the ground'), 'vague');
  assert.equal(answerState('groundBearing', 'Geotechnical engineer\'s report GR-07 confirms 200 kPa under the outrigger pads; 1.2 m timber mats used.'), 'supplied');
  assert.equal(answerState('craneChart', '25t at 20m from the chart'), 'supplied');
  assert.equal(answerState('craneChart', '25 t at 20 m radius from the crane chart'), 'supplied');
  assert.equal(answerState('craneChart', '25t'), 'vague');
});

// ---- 6. Fill-in templates (B fault 13) ----

test('the blank message names each blank once, by its label, and calls out "dont no"', () => {
  const text = 'Allowable bearing pressure from the geotechnical engineer dont no (report ____, revision ____): allowable ____ kPa.';
  assert.equal(blankWarning(text), 'Fill in the blanks: report number; revision; allowable (kPa). "dont no" is not an answer: put in what applies on this job.');
  assert.equal(blankWarning('Checked by ____ and signed off by ____.'), 'Fill in the blanks: who checks; who signs off.');
  // "me" in a blank is refused, as the sentence prints it.
  assert.match(notAnswer('erected to the supplier\'s instructions (document AS 4576, revision 1995) by a crew trained by me'), /says "by me", which does not say who/);
  assert.match(notAnswer('me'), /does not say who/);
});

// ---- 7. Small print faults ----

test('the ABN prints spaced, "Prepared by" takes the name given at download, and "balconys" is fixed', () => {
  const draft = prepareDraft(draftBody(ready({ state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no', ...ANSWERED, companyAbn: '27619262572' })));
  assert.match(draft.companyDetails, /^ABN 27 619 262 572/);
  assert.deepEqual(preparedFromCheck({ preparedBy: '', date: '14 October 2026' }, { name: 'Dean Russo', role: 'Supervisor', date: '15 October 2026', parts: { steps: true }, partHashes: {} }), { name: 'Dean Russo, Supervisor', date: '15 October 2026' });
  assert.deepEqual(preparedFromCheck({ preparedBy: 'Pat Lee, foreman', date: '14 October 2026' }, null), { name: 'Pat Lee, foreman', date: '14 October 2026' });
  assert.equal(fixSpelling('waterproof wet areas and balconys').text, 'waterproof wet areas and balconies');
});

test('the reviewer\'s numbered conditions print each on its own line', () => {
  assert.equal(conditionLines('1. Harness tags sighted before start. 2. Exclusion zone 2.5 m under the lift. 3) Dogman named on the lift plan.'), '1. Harness tags sighted before start.\n2. Exclusion zone 2.5 m under the lift.\n3) Dogman named on the lift plan.');
  assert.equal(conditionLines('Keep the 2.5 m zone clear.'), 'Keep the 2.5 m zone clear.');
});

test('a named building with no street is not offered as the job address', () => {
  const prediction = (main, rest, types) => ({ text: { text: `${main}, ${rest}, Australia` }, structuredFormat: { mainText: { text: main }, secondaryText: { text: rest } }, types });
  assert.equal(toSuggestion(prediction('Gordon Stephenson House', 'Perth WA', ['premise', 'geocode'])), null);
  assert.equal(toSuggestion(prediction('Gordon Stephenson House', '140 William St, Perth WA', ['premise'])).text, 'Gordon Stephenson House, 140 William St, Perth WA');
  assert.equal(toSuggestion(prediction('140 William St', 'Perth WA', ['street_address'])).text, '140 William St, Perth WA');
});

test('a harness the SWMS\'s own steps call for is asked before it is opened, as once it is (round 4: "Not answered yet" on opening)', () => {
  // Work from a boom lift brings a harness in its steps, also with falls No (the platform's own anchor).
  // Since the round 4 content fixes, work near slab edges with falls No has no edge step, and so no harness.
  const task = 'Install cable tray and conduit at high level in the warehouse from a boom lift.';
  const base = { state: 'qld', fallRisk: 'no', residential: 'no', crane: 'none', task, ...ANSWERED, facts: {} };
  const asked = questionsFor(draftBody(base));
  const ppe = asked.ppe.flatMap((group) => group.items.filter((item) => item.ticked).map((item) => item.id));
  assert.ok(ppe.includes('harness'), ppe.join(', '));
  // Asked with no PPE sent (the project page) and with the PPE ticked (the SWMS opened): the same question.
  assert.ok(asked.required.some((item) => item.id === 'harnessSystem'));
  assert.ok(questionsFor(draftBody({ ...base, ppe })).required.some((item) => item.id === 'harnessSystem'));
  // Prepare all waits for it too, so the SWMS is not prepared, then stood down when opened.
  const draft = prepareDraft(draftBody(ready(base)));
  assert.equal(draft.kind, 'stand-down');
  assert.deepEqual(draft.missing, ['Harness and anchors']);
  const answered = prepareDraft(draftBody(ready({ ...base, facts: { harnessSystem: 'Full body harness with a short lanyard clipped to the boom lift anchor point; users trained by an RTO.' } })));
  assert.equal(answered.kind, 'draft', (answered.missing || []).join('; '));
  // Edge work with falls No: no edge step, no harness, and no harness question.
  const edge = { state: 'qld', fallRisk: 'no', residential: 'no', crane: 'none', task: 'Core drill penetrations 50mm and under after concrete scanning. Fire seal fire protection service penetrations through fire barriers. Clear safety mesh from penetrations and erect and maintain barricades and penetration covers.', kinds: ['coreDrill', 'silicaDrill', 'passiveFire', 'carpEdge'], ...ANSWERED, facts: { silicaControls: 'Wet coring and on-tool extraction; P2 respirators fit tested; the silica assessment is kept in the site folder.' } };
  const edgeAsked = questionsFor(draftBody(edge));
  assert.ok(!edgeAsked.ppe.flatMap((group) => group.items.filter((item) => item.ticked).map((item) => item.id)).includes('harness'));
  assert.ok(!edgeAsked.required.some((item) => item.id === 'harnessSystem'));
});
