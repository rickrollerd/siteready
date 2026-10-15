// Messy test round 5 (15 October 2026), flow faults: every must-fix item has a place on the page; high
// risk work the person says applies can be added; the typed and picked rail tasks agree; a question is
// asked only while something that prints needs it; a step still High has a way out and the rule is the
// same for every name; the review-back email says only who it is from (D290); and the smaller fixes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prepareDraft, questionsFor, highRiskMatches, highRiskOptions } = require('../draft');
const { draftBody } = require('../input');
const { builderCheck } = require('../human-check');
const { checkSwms, fromDraft } = require('../builder-check');
const { reviewBackMail } = require('../reviews');
const { toSuggestion } = require('../places');
const { fixSpelling } = require('../spelling');
const { findState } = require('../legislation');
const { ANSWERED, ready } = require('./helpers');

const TRAFFIC = 'Is carried out on, in or adjacent to a road, railway, shipping lane or other traffic corridor that is in use by traffic other than pedestrians';
const HOT_WORK = { hotWorkPermit: 'The principal contractor issues a hot work permit each day. A fire extinguisher is kept at each work area.' };
const TYPED = { state: 'sa', fallRisk: 'no', residential: 'no', crane: 'none', task: 'resleepering and reballast 200m of track during possession, tamper, thermite welds', kinds: ['railCorridor', 'trackWork'], ...ANSWERED, facts: HOT_WORK };
const PICKED = { ...TYPED, task: 'Resleepering in the rail corridor: remove old sleepers, insert new sleepers, renew the ballast and tamp, with on-track plant and silica dust controls', facts: {} };

// ---- 1. High risk work: typed and picked agree, the check never asks for what the draft left off ----

test('the typed rail task reads as rail work in use, as the pick list task does', () => {
  const sa = findState('sa');
  assert.ok(highRiskMatches(TYPED.task, 'no', sa).some((item) => item.id === 'road'));
  assert.ok(highRiskMatches(PICKED.task, 'no', sa).some((item) => item.id === 'road'));
  // Not rail work: ballast on a roof, or a licence held.
  assert.ok(!highRiskMatches('Replace the gravel ballast on the roof.', 'no', sa).some((item) => item.id === 'road'));
  assert.ok(!highRiskMatches('Drivers in possession of a licence move the materials.', 'no', sa).some((item) => item.id === 'road'));
  for (const input of [TYPED, PICKED]) {
    const draft = prepareDraft(draftBody(ready(input)));
    assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
    assert.ok(draft.highRisk.includes(TRAFFIC), input.task);
    assert.deepEqual(builderCheck(draft, 'sa').mustFix, [], input.task);
  }
});

test('an item SiteWrite\'s check reads from a job step name, and the draft does not list, is cleared by adding it on the page', () => {
  // The task words alone name no traffic corridor; the step "Work in the rail corridor" does.
  // The draft now lists it from the step itself (content5); a SWMS without it is checked as before.
  const input = ready({ ...TYPED, task: 'resleepering 200m and tamping, thermite welds' });
  const prepared = prepareDraft(draftBody(input));
  assert.equal(prepared.kind, 'draft', (prepared.missing || []).join('; '));
  assert.ok(prepared.jobSteps.some((step) => step.step === 'Work in the rail corridor'));
  assert.ok(prepared.highRisk.includes(TRAFFIC));
  const draft = { ...prepared, highRisk: prepared.highRisk.filter((label) => label !== TRAFFIC) };
  const h1 = builderCheck(draft, 'sa').mustFix.find((item) => item.rule === 'H1');
  assert.match(h1.message, /SiteWrite read it in the job steps "Work in the rail corridor" and "Replace the sleepers and ballast"\.$/, 'it says where it was read');
  assert.ok(highRiskOptions(draftBody(input), draft).highRiskChoices.some((item) => item.id === 'road'), 'the page offers it');
  const added = prepareDraft(draftBody({ ...input, highRiskAdded: ['road'] }));
  assert.ok(added.highRisk.includes(TRAFFIC));
  assert.ok(!builderCheck(added, 'sa').mustFix.some((item) => item.rule === 'H1'));
});

test('high risk work the person adds prints, clears the must-fix, and only their own can be taken off', () => {
  const base = ready(TYPED);
  const plain = prepareDraft(draftBody(base));
  const water = 'Is carried out in or near water or other liquid that involves a risk of drowning';
  assert.ok(!plain.highRisk.includes(water));
  const offered = highRiskOptions(draftBody(base), plain);
  assert.ok(offered.highRiskChoices.some((item) => item.id === 'water' && item.label === water));
  assert.ok(!offered.highRiskChoices.some((item) => item.label === TRAFFIC), 'a listed item is not offered again');
  assert.ok(!JSON.stringify(plain).includes(water), 'the list offered is for the page, not part of the SWMS');
  const withWater = draftBody({ ...base, highRiskAdded: ['water', 'road', 'nonsense'] });
  const added = prepareDraft(withWater);
  assert.ok(added.highRisk.includes(water));
  assert.deepEqual(highRiskOptions(withWater, added).highRiskOwn, [{ id: 'water', label: water }], 'an item SiteWrite found is not the person\'s own, and an unknown id is dropped');
  assert.ok(!highRiskOptions(withWater, added).highRiskChoices.some((item) => item.id === 'water'));
  // A builder's check of a SWMS that leaves out what the work involves is cleared by adding it.
  const swms = fromDraft({ ...plain, highRisk: plain.highRisk.filter((label) => label !== TRAFFIC) }, { state: 'sa' });
  assert.ok(checkSwms(swms, { state: 'sa' }).findings.some((item) => item.rule === 'H1' && !item.pass));
  // The input keeps only ids, once each.
  assert.deepEqual(draftBody({ ...TYPED, highRiskAdded: ['water', 'water', 3, 'road'] }).highRiskAdded, ['water', 'road']);
});

test('each item SiteWrite listed says where it was found, a site answer included', () => {
  const draft = prepareDraft(draftBody(ready({ state: 'vic', fallRisk: 'no', crane: 'none', task: 'Pour concrete kerbs and slabs on ground in the site carpark.', ...ANSWERED, site: { ...ANSWERED.site, publicInterface: 'Pedestrians on the street footpath next to the kerb works' } })));
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  const road = draft.highRisk.find((label) => /roadways/.test(label));
  assert.ok(road);
  assert.equal(draft.highRiskFrom[road], 'your Public interface answer');
});

test('every must-fix rule of SiteWrite\'s check has a place on the page with a Go to', () => {
  const rules = [...fs.readFileSync(path.join(__dirname, '../builder-check.js'), 'utf8').matchAll(/add\('(H\d+)'/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(rules)], ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9']);
  const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const place = app.slice(app.indexOf('function mustFixPlace('), app.indexOf('function stepTarget('));
  for (const rule of rules) assert.match(place, new RegExp(`case '${rule}'`), rule);
  const panel = fs.readFileSync(path.join(__dirname, '../public/human-check.js'), 'utf8');
  assert.match(panel, /data-must-go=/);
  assert.ok(!/Fix it on the page, and SiteWrite checks/.test(panel));
});

// ---- 5. A question is asked only while something that prints needs it ----

const TREES = 'Advanced and street tree planting. Six advanced trees in 400 L root balls along the Smith St Mall footpath, pits dug with a 5 t excavator, trees lifted by our own vehicle loading crane (HIAB) operated by our crew.';
const NT = { state: 'nt', residential: 'no', fallRisk: 'no', crane: 'own', task: TREES, ...ANSWERED };

test('the crane chart and ground questions go with the crane lift steps that print them', () => {
  const ids = (input) => questionsFor(draftBody(input)).required.map((item) => item.id);
  assert.deepEqual(ids({ ...NT, kinds: ['crane', 'loaderCrane', 'landscape'] }), ['craneChart', 'groundBearing']);
  assert.deepEqual(ids({ ...NT, kinds: ['loaderCrane', 'landscape'] }), []);
  // Not stood down for want of them either.
  const draft = prepareDraft(draftBody(ready({ ...NT, kinds: ['loaderCrane', 'landscape'] })));
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
});

test('a question about work whose steps were taken off is not asked; one from the task\'s own work stays', () => {
  // Doors and frames only drilled for hardware are not steel erection (content5), so the steel is named.
  const task = 'Install access control card readers and electric strikes, and erect the steel frame of the new gatehouse.';
  const base = { state: 'qld', fallRisk: 'no', crane: 'company', slinging: 'company', task, ...ANSWERED };
  assert.ok(questionsFor(draftBody(base)).required.some((item) => item.id === 'erectionSequence'));
  const kinds = questionsFor(draftBody(base)).steps.chosen.filter((id) => id !== 'steelErect');
  assert.ok(!questionsFor(draftBody({ ...base, kinds })).required.some((item) => item.id === 'erectionSequence'));
  // The hot work permit for thermite welds is asked whatever rail steps are picked.
  assert.ok(questionsFor(draftBody({ ...TYPED, facts: {} })).required.some((item) => item.id === 'hotWorkPermit'));
});

test('the harness answer asked for a harness in the PPE prints in the controls', () => {
  const line = 'Full body harness and rescue line kept at the trench for rescue only, inspected every 6 months by Joel Martin.';
  const draft = prepareDraft(draftBody(ready({ ...NT, kinds: ['loaderCrane', 'landscape'], ppe: ['hardHat', 'boots', 'harness'], facts: { harnessSystem: line } })));
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.ok(draft.controls.some((item) => item.text.includes('rescue line kept at the trench')));
});

// ---- A1. A step still High: the same rule for every name, and a way out ----

test('SiteWrite\'s own line for a step still High counts however the responsible person is written', () => {
  for (const who of ['gaz', 'Priya Nair, HSE advisor', 'the supervisor']) {
    const swms = { state: 'wa', task: 'Load reo onto the deck.', site: { address: '12 Hay St, East Perth WA', conditions: ['Access: gate 2'] }, highRisk: [], responsiblePerson: who,
      steps: [{ step: 'Load reo onto the deck', hazards: ['A fall from the deck edge.'], controls: ['Work inside the edge protection.'], risk: { before: 'High', after: 'High', response: `This step does not start until ${who} adds controls that lower this rating, or accepts the risk in writing.` } }] };
    const h9 = checkSwms(swms, { state: 'wa' }).findings.find((item) => item.rule === 'H9');
    assert.equal(h9.pass, true, who);
  }
});

test('the supervisor\'s rating after the controls prints as theirs, and a library step can be taken off', () => {
  const input = ready({ state: 'qld', fallRisk: 'no', residential: 'no', crane: 'none', task: 'Replace a 3m length of timber fence.', ...ANSWERED });
  const draft = prepareDraft(draftBody(input));
  const step = draft.jobSteps.find((item) => item.step !== 'Before starting' && item.risk);
  const rated = prepareDraft(draftBody({ ...input, stepRatings: { [step.step]: { likelihood: 2, consequence: 2 } } }));
  const after = rated.jobSteps.find((item) => item.step === step.step).risk.after;
  assert.equal(after.level, 'Low');
  assert.equal(after.label, 'Unlikely x Minor, our rating');
  assert.deepEqual(draftBody({ ...input, stepRatings: { [step.step]: { likelihood: 9, consequence: 2 }, x: 'no' } }).stepRatings, undefined);
  const off = prepareDraft(draftBody({ ...input, leaveOut: [step.step] }));
  assert.ok(!off.jobSteps.some((item) => item.step === step.step));
});

// ---- A2. Pool finishes are not refused for "pool shell" work ----

test('pool finishes on the pool shell are drafted; building the shell is still its own work', () => {
  const finishes = 'Clean, grind and prepare concrete pool surface. Install pool shell waterproofing membrane. Skim coat and screed concrete pool surface. Apply pebble aggregate finish to swimming pool. Install wet deck and waterline tiling including grout: install only.';
  assert.equal(questionsFor(draftBody({ state: 'wa', fallRisk: 'no', crane: 'none', task: finishes, ...ANSWERED })).standDown, undefined);
  const shell = questionsFor(draftBody({ state: 'wa', fallRisk: 'no', crane: 'none', task: 'Spray the pool shell with shotcrete.', ...ANSWERED }));
  assert.ok(shell.steps.chosen.includes('poolShell'));
});

// ---- 6. The review loop ----

test('the review-back email says only who it is from (D290 item 1)', () => {
  const mail = reviewBackMail({ name: 'Priya Natarajan', company: 'Torrens Civil', label: 'Not approved', response: 'changes', ref: 'SW-G9B3-XNPQ', revision: 1 });
  assert.equal(mail.subject, 'Your SWMS review is back');
  assert.equal(mail.text, 'Your SWMS review is back.\n\nFrom Priya Natarajan, Torrens Civil.');
});

test('the review page shows Prepared by as the files print it', () => {
  const src = fs.readFileSync(path.join(__dirname, '../reviews.js'), 'utf8');
  assert.match(src, /prepared: preparedFromCheck\(kept\.draft, kept\.confirmation\)/);
  const page = fs.readFileSync(path.join(__dirname, '../public/review.js'), 'utf8');
  assert.match(page, /data\.prepared/);
});

// ---- A10, A14. Words kept as typed, addresses without the doubled city ----

test('"ensuites" is not changed to "ensures"', () => {
  assert.equal(fixSpelling('tiles to bathrooms, ensuites, kitchens, laundrys').text, 'tiles to bathrooms, ensuites, kitchens, laundries');
});

test('an address suggestion drops a city doubled after the suburb, and keeps a real suburb', () => {
  const text = (value) => toSuggestion({ text: { text: value }, types: ['street_address'] }).text;
  assert.equal(text('22 Adelaide St, Carina Brisbane City QLD, Australia'), '22 Adelaide St, Carina QLD');
  assert.equal(text('12 Hay St, East Perth Perth WA, Australia'), '12 Hay St, East Perth WA');
  assert.equal(text('1 Miller St, North Sydney NSW, Australia'), '1 Miller St, North Sydney NSW');
  assert.equal(text('22 Adelaide St, Brisbane City QLD, Australia'), '22 Adelaide St, Brisbane City QLD');
});
