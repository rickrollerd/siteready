const test = require('node:test');
const assert = require('node:assert/strict');
const { localSource, localText } = require('../citations');
const { prepareDraft } = require('../draft');

const QLD = 'Work Health and Safety Regulation 2011 (Qld) ';

test('Queensland drafts cite the Queensland-approved code, renumbered where Queensland differs', () => {
  assert.equal(localSource('Model Code: Excavation work s 6.1', 'qld'), 'Excavation work Code of Practice 2021 (Qld) s 6.2');
  assert.equal(localSource('Model Code: Managing the risk of falls s 3.1, s 5.1', 'qld'), 'Managing the risk of falls at workplaces Code of Practice 2021 (Qld) s 3.2, s 5.1');
  assert.equal(localSource('Model Code: Managing electrical risks s 6.1', 'qld'), 'Electrical Safety Code of Practice 2021: Managing electrical risks in the workplace (Qld) s 5.1');
  // Queensland has not approved the Construction work code, and some sections have no match.
  assert.equal(localSource('Model Code: Construction work s 4.1', 'qld'), 'Model Code: Construction work s 4.1');
  assert.equal(localSource('Model Code: Managing electrical risks s 8.2, s 9.2', 'qld'),
    'Electrical Safety Code of Practice 2021: Managing electrical risks in the workplace (Qld) s 7.2; Model Code: Managing electrical risks s 8.2');
  assert.equal(localSource(`${QLD}s 306D`, 'qld'), `${QLD}s 306D`);
});

test('WA and Vic drafts cite their own regulation, and leave out what has no match', () => {
  const source = `${QLD}s 78, s 79, s 306D, schedule 3; Model Code: Managing the risk of falls s 5.1; Ozone Protection and Synthetic Greenhouse Gas Management Regulations 1995 (Cth) r 111`;
  assert.equal(localSource(source, 'wa'), 'Work Health and Safety (General) Regulations 2022 (WA) r 78, r 79, Schedule 3; Ozone Protection and Synthetic Greenhouse Gas Management Regulations 1995 (Cth) r 111');
  assert.equal(localSource(source, 'vic'), 'Occupational Health and Safety Regulations 2017 (Vic) r 44, Schedule 3; Ozone Protection and Synthetic Greenhouse Gas Management Regulations 1995 (Cth) r 111');
  assert.equal(localSource(`${QLD}s 299`, 'vic'), 'Occupational Health and Safety Regulations 2017 (Vic) r 327');
  // States not yet checked print no state citation rather than a Queensland one.
  assert.equal(localSource(`${QLD}s 299`, 'nsw'), '');
});

test('the asbestos date follows the state', () => {
  const text = 'Buildings built before 31 December 1989 are checked for asbestos.';
  assert.equal(localText(text, 'qld'), text);
  assert.equal(localText(text, 'wa'), 'Buildings built before 31 December 2003 are checked for asbestos.');
});

test('a WA draft prints WA citations and no Queensland ones', () => {
  const task = 'Strip out and renovate the bathroom in a 1970s house, then waterproof the floor.';
  const facts = { asbestosArrangement: 'Asbestos register checked; licensed removalist removes the wall sheeting first.' };
  for (const state of ['wa', 'vic']) {
    const done = prepareDraft({ state, task, fallRisk: 'no', residential: 'yes', facts });
    const text = JSON.stringify(done.jobSteps);
    assert.doesNotMatch(text, /\(Qld\)/, state);
    assert.doesNotMatch(text, /31 December 1989/, state);
  }
  const wa = JSON.stringify(prepareDraft({ state: 'wa', task, fallRisk: 'no', residential: 'yes', facts }).jobSteps);
  assert.match(wa, /Work Health and Safety \(General\) Regulations 2022 \(WA\) r \d+/);
});
