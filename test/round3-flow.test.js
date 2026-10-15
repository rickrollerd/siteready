// Messy test round 3 (14 October 2026), flow and answer faults: weak answers refused with a reason,
// the works manager and contact phone before download, the review date and reference filled, work with
// no job steps named before Prepare all and moved into the SWMS named as covering it (D289), designs not
// issued tied to the steps that do the work, file names, the ACT silica answer, and the scope's site
// conditions offered rather than filled in.
const test = require('node:test');
const assert = require('node:assert/strict');
const { notAnswer, answerNeed, PEOPLE_FIELDS, fieldRule } = require('../public/gate-rules');
const { prepareDraft, coverCheck, reviewDateAfter } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps } = require('../download-gate');
const { ANSWERED, ready } = require('./helpers');
const { siteSuggestions } = require('../public/scope-task');
const { craneFromReading, fallHint } = require('../public/scope-choice');
const { localText } = require('../citations');
const { answersFor } = require('../presets');

const rule = (id) => fieldRule(PEOPLE_FIELDS.find((item) => item.id === id));
const EMERGENCY = (extra) => ({ ask: 'Answer it.', emergency: true, involves: 'work at height', ...extra });

test('weak answers from round 3 are refused with a plain reason, and full ones pass', () => {
  for (const value of ['gate', 'out the front', 'Outside', 'the gate']) assert.match(answerNeed(rule('musterPoint'), value), /does not say where/, value);
  for (const value of ['builder', 'supervisor', 'the builder']) assert.match(answerNeed(rule('firstAider'), value), /does not name a first aider/, value);
  assert.match(answerNeed(rule('principalContractor'), 'the builder'), /does not name the company/);
  assert.match(answerNeed(rule('worksManagerPhone'), '0412'), /is not a phone number/);
  for (const [id, value] of [['musterPoint', 'Main gate on Smith Street, beside the site office'], ['musterPoint', 'Front gate on Smith Street'], ['firstAider', 'Jo Smith'], ['firstAider', 'Main contractor\'s site first aider'], ['principalContractor', 'ABC Builders Pty Ltd'], ['principalContractor', 'Not applicable'], ['worksManagerPhone', '0412 345 678']]) {
    assert.equal(answerNeed(rule(id), value), '', `${id}: ${value}`);
  }
  // Emergency answers.
  assert.match(answerNeed(EMERGENCY({ rescue: true }), 'pull them out'), /does not say who rescues the person or how/);
  assert.match(answerNeed(EMERGENCY({ kit: true }), 'rope in the ute'), /keeps the rescue equipment away from the work/);
  assert.equal(answerNeed(EMERGENCY({ kit: true }), 'Ladder, harness and line at the trench box; first aid kit in the site ute'), '');
  assert.match(answerNeed(EMERGENCY({ stop: true }), 'turn it off'), /does not say where the stop is or who uses it/);
  assert.equal(answerNeed(EMERGENCY({ stop: true }), 'The operator presses the red emergency stop on the control panel by the cab door'), '');
  assert.equal(answerNeed(EMERGENCY({ rescue: true }), 'The trained spotter lowers the platform with the ground controls'), '');
  // Fill-in blanks and answers holding "dont know" or "TBC".
  assert.match(answerNeed({ line: 'The ____ system is used.', ask: 'Fill it.' }, ['dont no']), /not an answer yet/);
  assert.match(answerNeed({ line: 'Revision ____.', ask: 'Fill it.' }, ['TBC']), /not an answer yet/);
  assert.equal(answerNeed({ line: 'Revision ____.', ask: 'Fill it.' }, ['C']), '');
  assert.match(notAnswer('The products used are dont know.'), /still has "dont know" in it/);
  assert.match(notAnswer('document dont no, revision TBC'), /still has/);
  assert.equal(notAnswer('Treat unknown services as live until proved dead.'), '');
});

const FENCE = { state: 'qld', task: 'Replace a 3m length of timber fence.', fallRisk: 'no', residential: 'no' };
const gapsOf = (input) => {
  const body = draftBody(ready(input));
  const draft = prepareDraft(body);
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  return { gaps: downloadGaps(body, draft), draft };
};

test('the works manager and contact phone are needed before download (D289), and the review date and reference fill themselves', () => {
  const { worksManager, worksManagerPhone, ...rest } = ANSWERED;
  const { gaps, draft } = gapsOf({ ...FENCE, ...rest, date: '14 October 2026' });
  assert.deepEqual(gaps.map((gap) => gap.id), ['worksManager', 'worksManagerPhone']);
  assert.match(gaps[0].need, /Name your own person in charge of this work/);
  assert.match(gaps[1].need, /so the site can reach them/);
  // The review date is three months on, as My SWMS shows it.
  assert.equal(draft.reviewDate, '14 January 2027');
  assert.equal(reviewDateAfter('31 October 2026'), '31 January 2027');
  assert.equal(reviewDateAfter('30 November 2026'), '28 February 2027');
  // A date the user gives stands.
  assert.equal(gapsOf({ ...FENCE, ...ANSWERED, reviewDate: '1 December 2026' }).draft.reviewDate, '1 December 2026');
  // Weak people answers are refused at the gate too.
  const weak = gapsOf({ ...FENCE, ...ANSWERED, musterPoint: 'gate', firstAider: 'builder', principalContractor: 'the builder' }).gaps;
  assert.deepEqual(weak.map((gap) => gap.id).sort(), ['firstAider', 'musterPoint', 'principalContractor']);
});

test('the reference number prints the SiteWrite reference when the business gives none', async () => {
  const server = require('../server');
  assert.ok(server.app);
  const accounts = require('../accounts');
  assert.equal(accounts.fileStem('Trenching for services, including trenches deeper than 1.5 m.'), 'Trenching for services including trenches deeper than 1.5 m');
  assert.equal(accounts.titleFor({}, { task: 'erect and dismantel tube and coupler scafold to 3 lifts.' }), 'erect and dismantle tube and coupler scaffold to 3 lifts');
});

test('scaffold in the plant with the scaffold supervisor "Not applicable" is refused', () => {
  const SCAFFOLD = { state: 'qld', task: 'Erect and dismantle a tube and coupler scaffold to 3 lifts on the north elevation.', fallRisk: 'yes', residential: 'no', facts: { fallControl: 'Work is done from the scaffold with full guardrails and toe boards on each working lift.', systemInstructions: 'The scaffold is erected to the supplier\'s tube and coupler instructions, kept on site.' } };
  const body = draftBody(ready({ ...SCAFFOLD, ...ANSWERED, scaffoldSupervisor: 'Not applicable' }));
  const draft = prepareDraft(body);
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  const scaffolds = (draft.plant || []).filter((row) => /scaffold/i.test(row.item)).map((row) => row.item);
  if (!scaffolds.length) return;
  const confirmed = { ...body, plantChoice: { used: [...((body.plantChoice && body.plantChoice.used) || []), ...scaffolds], notUsed: [], added: [] } };
  const gap = downloadGaps(confirmed, prepareDraft(confirmed)).find((item) => item.id === 'scaffoldSupervisor');
  assert.ok(gap, 'scaffold supervisor asked');
  assert.match(gap.need, /Scaffold is ticked in the plant for this job/);
});

test('your own step of a word or two is refused at the gate, as on the page', () => {
  const base = { ...FENCE, ...ANSWERED, ownSteps: [{ part: '', name: 'Fix the gate latch', hazards: ['Pinch'], controls: ['Gloves'], who: 'Supervisor' }] };
  const { gaps } = gapsOf(base);
  const own = gaps.find((gap) => gap.kind === 'own');
  assert.ok(own, 'refused');
  assert.match(own.need, /too short to act on/);
  const full = gapsOf({ ...base, ownSteps: [{ part: '', name: 'Fix the gate latch', hazards: ['Hand pinched in the latch'], controls: ['Wear cut-resistant gloves and keep fingers clear of the latch while fitting it'], who: 'Supervisor' }] });
  assert.ok(!full.gaps.some((gap) => gap.kind === 'own'));
});

test('work with no job steps is named before the questions are answered, and work moved here needs its own step (D289)', () => {
  const task = 'Install the mechanical ductwork. Install safety mesh covers over the penetrations. Install cast in items.';
  const base = { state: 'qld', task, fallRisk: 'no', residential: 'no' };
  const before = coverCheck(base);
  assert.ok(before.notCovered.length >= 1, JSON.stringify(before));
  assert.deepEqual(before.left, before.notCovered);
  // Named as covered in another SWMS, it is dealt with here.
  const named = coverCheck({ ...base, notCoveredConfirmed: before.notCovered });
  assert.deepEqual(named.left, []);
  // Moved into this SWMS from another of the project, it is listed and needs the user's own step.
  const moved = coverCheck({ ...base, movedIn: [{ part: 'Install safety mesh covers', from: 'SWMS 1 (Trade installation)' }] });
  assert.ok(moved.notCoveredMain.includes('Install safety mesh covers'));
  assert.ok(moved.left.includes('Install safety mesh covers'));
  // Naming it as covered elsewhere does not clear moved-in work.
  assert.ok(coverCheck({ ...base, movedIn: [{ part: 'Install safety mesh covers', from: 'SWMS 1' }], notCoveredConfirmed: ['Install safety mesh covers'] }).left.includes('Install safety mesh covers'));
  // The questions route returns them for the one-go page.
  const body = draftBody(ready({ ...base, ...ANSWERED, movedIn: [{ part: 'Install safety mesh covers', from: 'SWMS 1' }] }));
  const draft = prepareDraft(body);
  if (draft.kind === 'draft') {
    assert.ok((draft.notCoveredMain || []).includes('Install safety mesh covers'));
    const cover = downloadGaps(body, draft).find((gap) => gap.kind === 'cover');
    assert.ok(cover && /Install safety mesh covers/.test(cover.need));
  }
});

test('a design not issued yet holds the steps that do its work: the geotechnical design and the core hole approval', () => {
  const base = { state: 'nt', residential: 'no', fallRisk: 'no', task: 'Trenching for services, including trenches deeper than 1.5 m', facts: { trenchSupport: 'Trench shield used for all trenches deeper than 1.5 m, to the supplier design.' } };
  const draft = prepareDraft({ ...base, designs: [{ id: 'excavation', what: 'Geotechnical design for the excavation', status: 'notIssued' }] });
  assert.equal(draft.kind, 'draft');
  const held = draft.jobSteps.filter((step) => step.controls.some((line) => /^Hold point: the geotechnical design/.test(line))).map((step) => step.step);
  assert.ok(held.includes('Excavate') || held.includes('Dig the trench'), held.join('; '));
  assert.ok(held.includes('Work in the trench'), held.join('; '));
  assert.deepEqual(draft.designs.find((row) => row.id === 'excavation').steps.sort(), held.sort());
  const core = prepareDraft({ state: 'qld', residential: 'no', fallRisk: 'no', task: 'Core drill 100 mm holes through the suspended slab for the hydraulic risers.', designs: [{ id: 'cutApproval', what: 'Engineer\'s approval for the cuts and core holes', status: 'notIssued' }] });
  if (core.kind === 'draft' && core.jobSteps.some((step) => step.step === 'Core drill through the slab or wall')) {
    const coring = core.jobSteps.find((step) => step.step === 'Core drill through the slab or wall');
    assert.ok(coring.controls.some((line) => /^Hold point:/.test(line)), 'coring holds');
  }
});

test('the ACT silica standard answers claim no written assessment, as the ACT notes say; the other states keep theirs', () => {
  for (const answer of answersFor('silicaControls', '')) {
    assert.doesNotMatch(localText(answer.text, 'act'), /written silica assessment/, answer.label);
    assert.match(localText(answer.text, 'act'), /continuous water feed/);
    assert.doesNotMatch(localText(answer.text, 'vic'), /written silica assessment/);
    for (const state of ['qld', 'nsw', 'sa', 'wa', 'tas', 'nt']) assert.match(localText(answer.text, state), /written silica assessment/, state);
  }
});

test('the scope\'s site conditions are offered cleaned and once each, the crane is read only where the scope is clear, and the fall answer is not filled across a ground floor package', () => {
  assert.deepEqual(siteSuggestions(['Energised buildings. Energised HV. Existing energised control panel.', 'Energised buildings. Access: Security guards.']), ['Energised buildings.', 'Energised HV.', 'Existing energised control panel.', 'Security guards.']);
  const reading = (quote) => ({ activities: [{ type: 'Site work', activity: 'Install ductwork', quotes: [quote] }] });
  assert.equal(craneFromReading(reading('Install ductwork and grilles.')), '');
  assert.equal(craneFromReading(reading('The head contractor\'s cranes may be used for lifting.')), '');
  assert.equal(craneFromReading(reading('All cranage is provided by the builder.')), 'company');
  assert.equal(craneFromReading(reading('The subcontractor supplies all cranage.')), '');
  assert.equal(fallHint(null, 'Ground floor partitions and wall linings.'), 'no');
  assert.equal(fallHint({ categories: [{ id: 'fall', likely: true }] }, 'Ceilings.'), 'yes');
  assert.equal(fallHint(null, 'Install partitions.'), '');
});
