// Library gaps the builder check's minimum controls (W13) and hazardous chemicals (W14) items
// found in SiteReady's own drafts, filled from lines already evidenced in the library or cited to
// code and regulation sections read (6 October 2026), and two causes of over-listing removed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, highRiskMatches } = require('../draft');
const { answersFor } = require('../presets');
const { checkSwms, fromDraft } = require('../builder-check');
const { findState } = require('../legislation');

const SITE = {
  workplace: '12 Smith Street, Paddington QLD 4064', principalContractor: 'ABC Builders Pty Ltd', complianceResponsible: 'Sam Lee, supervisor',
  date: '5 October 2026', reviewDate: '5 November 2026',
  site: { liveServices: 'None near the work.', publicInterface: 'No public near the work.', otherTrades: 'No other trades work under ours.', ground: 'Level, firm ground.', access: 'Side gate on the east boundary.' },
};

// Answers the questions as a user picking the first suggested answer would.
function drafted(state, task, kinds) {
  const input = { state, fallRisk: 'no', residential: 'no', task, ...(kinds ? { kinds } : {}), ...SITE };
  const facts = {};
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id]) continue;
      facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : (answersFor(item.id, asked.task)[0] || {}).text || `As set out in the site plan: ${item.label}.`;
      added = true;
    }
    if (!added) break;
  }
  const draft = prepareDraft({ ...input, facts });
  assert.equal(draft.kind, 'draft', `${state}: ${task}`);
  return draft;
}
const minimum = (state, draft) => (checkSwms(fromDraft(draft, { state }), { state }).findings.find((item) => item.rule === 'W13') || {}).message || '';
const lines = (draft) => draft.jobSteps.flatMap((step) => step.controls);
const count = (draft, pattern) => lines(draft).filter((line) => pattern.test(line)).length;

test('powered mobile plant listed from the plant register brings the warning device line once', () => {
  for (const state of ['qld', 'nsw']) {
    const draft = drafted(state, 'Install cable tray and cabling in the plant room ceilings.');
    assert.ok(draft.highRisk.some((item) => /powered mobile plant/i.test(item)), state);
    const before = draft.jobSteps.find((step) => step.step === 'Before starting');
    assert.ok(before.controls.some((line) => /^Plant has a warning device and reversing alarm, and ground workers stay out of its path\./.test(line)), state);
    assert.equal(count(draft, /^Plant has a warning device and reversing alarm/), 1, state);
    assert.doesNotMatch(minimum(state, draft), /For powered mobile plant/, state);
  }
  // Plant steps that already warn people on foot get no second line.
  const plant = drafted('qld', 'Excavate the footings with a skid steer and load the spoil into trucks.');
  assert.ok(count(plant, /^Plant has a warning device and reversing alarm/) <= 1);
});

test('a step that processes silica brings the clean-up line once, where no line says how dust is cleaned up', () => {
  for (const state of ['qld', 'nsw']) {
    const draft = drafted(state, 'Fix grab rails, fittings and equipment to the masonry walls in the bathrooms.', ['fixtures']);
    assert.equal(count(draft, /^Dust and slurry are cleaned up at least at the end of each day or task/), 1, state);
    assert.doesNotMatch(minimum(state, draft), /clean-up by vacuum/, state);
  }
});

test('a confined space listed with no step that tests the air brings the atmosphere testing line', () => {
  const task = 'Maintain temporary hydraulic services and site accommodation plumbing including monthly sewer pump station inspections (Site accommodation, subcontractor compounds 3, 4 and 5). Interim maintenance of commissioned systems: flushing, filter cleaning and specialist cleaning (Commissioned buildings).';
  for (const state of ['qld', 'nsw']) {
    const draft = drafted(state, task, ['cleaning']);
    assert.ok(draft.highRisk.some((item) => /confined space/i.test(item)), state);
    assert.equal(count(draft, /^Initial atmospheric testing is done from outside the space/), 1, state);
    assert.doesNotMatch(minimum(state, draft), /For confined spaces/, state);
  }
});

test('poles stood by crane carry the safety observer near live lines and the crane company\'s lift plan', () => {
  const task = 'Install camera poles (Central facilities and cabin reticulation). Install 316 stainless steel enclosures at the bottom of each camera pole (Base of each camera pole).';
  for (const state of ['qld', 'nsw']) {
    const draft = drafted(state, task, ['poleErect', 'commsRoom']);
    const message = minimum(state, draft);
    assert.doesNotMatch(message, /For work near overhead power lines/, state);
    assert.doesNotMatch(message, /For crane lifts/, state);
    assert.ok(lines(draft).some((line) => /^Crane lifts are done by the crane company under its lift plan\.$/.test(line)), state);
  }
});

test('drilling, cutting or cast-in work where the place named is precast is not tilt-up or precast work', () => {
  const qld = findState('qld');
  const precast = (text) => highRiskMatches(text, 'no', qld).some((item) => item.id === 'precast');
  assert.ok(!precast('Core drill penetrations NB50 and under after concrete scanning, under permit (All buildings, precast panels and slabs).'));
  assert.ok(!precast('Form openings and penetrations through structure, precast walls and roof for hydraulic services (All buildings).'));
  assert.ok(!precast('Install cast-in sleeves, holding bolts and conduits into formwork (In-situ, bondek and precast slabs).'));
  assert.ok(!precast('Cut reglet into roof level precast for membrane and flashing (Roof level precast).'));
  // Erecting, lifting or placing precast still is.
  assert.ok(precast('Erect and brace the precast wall panels.'));
  assert.ok(precast('Lift and place precast panels, then cut openings.'));
  assert.ok(precast('Install the precast panels (Building A).'));
});

test('a generator control panel is not work on a fuel line; installing the generator and its fuel tank is', () => {
  const fuel = (draft) => draft.highRisk.some((item) => /chemical, fuel or refrigerant lines/i.test(item));
  const controls = drafted('qld', 'Install generator control panel and modify existing master control system (Existing generator master control system). Install Lighting Control System.', ['controlPanelInstall', 'fitOff', 'containment']);
  assert.ok(!fuel(controls));
  assert.ok(fuel(drafted('qld', 'Install generators and fuel tank.')));
});
