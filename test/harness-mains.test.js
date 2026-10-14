// Owner D298 and the round 4 merge: wherever a harness is listed, harness training is listed too (also
// with falls No, as on a boom EWP); a harness a printed line says is worn has its question asked, as the
// PPE table lists it (content fixes) and its questions are asked whenever one is used (flow fixes); comms
// room and UPS work asks whether our crew connects it to mains power, and Yes lists the electrical licence.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { ANSWERED, ready } = require('./helpers');

const TRAINING = 'Working at heights and harness training';
const ticked = (draft) => (draft.ppe || []).flatMap((group) => group.items.filter((item) => item.ticked).map((item) => item.id));
const HARNESS = 'Full body harness with a short lanyard clipped to the rated anchor point; users trained by an RTO.';

test('a boom EWP with falls No lists the harness, its question and harness training', () => {
  const base = { state: 'nsw', fallRisk: 'no', residential: 'no', crane: 'none', task: 'Install cable tray and conduit at high level in the warehouse from a boom lift.', ...ANSWERED, facts: {} };
  assert.ok(questionsFor(draftBody(base)).required.some((item) => item.id === 'harnessSystem'));
  const draft = prepareDraft(draftBody(ready({ ...base, facts: { harnessSystem: HARNESS } })));
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.ok(ticked(draft).includes('harness'));
  assert.ok(draft.qualifications.includes(TRAINING), draft.qualifications.join(' | '));
  // Training goes before the high risk work licences, in the register's order.
  const at = draft.qualifications.indexOf(TRAINING);
  const hrw = draft.qualifications.findIndex((name) => /^High risk work licence/.test(name));
  assert.ok(hrw < 0 || at < hrw, draft.qualifications.join(' | '));
});

test('a harness the lines say is worn is asked for, even where the PPE the user chose leaves it out', () => {
  const ppe = ['hardHat', 'glassesClear', 'gloveGeneral', 'sleevesLong', 'pantsLong', 'hivis', 'boots'];
  const base = { state: 'qld', fallRisk: 'no', residential: 'no', crane: 'none', task: 'Install static lines and roof anchors on the roof.', ...ANSWERED, ppe, facts: {} };
  assert.ok(questionsFor(draftBody(base)).required.some((item) => item.id === 'harnessSystem'));
  const stood = prepareDraft(draftBody(ready(base)));
  assert.equal(stood.kind, 'stand-down');
  assert.ok(stood.missing.includes('Harness and anchors'), stood.missing.join('; '));
  const draft = prepareDraft(draftBody(ready({ ...base, facts: { harnessSystem: HARNESS } })));
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.ok(ticked(draft).includes('harness'));
  assert.ok(draft.qualifications.includes(TRAINING));
});

test('work with no harness lists no harness training', () => {
  const draft = prepareDraft(draftBody(ready({ state: 'qld', fallRisk: 'no', residential: 'no', crane: 'none', task: 'Prepare and paint the internal walls: fill, sand, prime and paint, and clean up.', kinds: ['painting', 'siteClean'], ...ANSWERED, facts: { safetyDataSheet: 'Dulux acrylic paint; the SDS is kept in the site office; gloves and glasses are worn.' } })));
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.ok(!ticked(draft).includes('harness'));
  assert.ok(!draft.qualifications.includes(TRAINING));
});

const COMMS = 'Comms rooms: receive the racks and cabinets and move them into the comms room with mechanical aids, anchor and earth the racks, fit the UPS units and batteries, and dress the cables, next to the electrical switchboards.';
const comms = (task, facts) => ({ state: 'qld', fallRisk: 'no', residential: 'no', crane: 'none', task, ...ANSWERED, facts: { liveElectrical: 'no', ...facts } });
const electrical = (draft) => draft.qualifications.filter((name) => /^Electrical (?:work )?licence/.test(name));

test('comms room and UPS work asks about mains power: Yes lists the electrical licence, No does not', () => {
  const asked = questionsFor(draftBody(comms(COMMS, {})));
  const question = asked.required.find((item) => item.id === 'mainsConnection');
  assert.ok(question, asked.required.map((item) => item.id).join(' '));
  assert.deepEqual(question.choices.map((choice) => choice.value), ['yes', 'no']);
  const no = prepareDraft(draftBody(ready(comms(COMMS, { mainsConnection: 'no' }))));
  assert.equal(no.kind, 'draft', (no.missing || []).join('; '));
  assert.deepEqual(electrical(no), []);
  const yes = prepareDraft(draftBody(ready(comms(COMMS, { mainsConnection: 'yes' }))));
  assert.deepEqual(electrical(yes), ['Electrical work licence (electrical mechanic)']);
  // Outside Queensland the licence is named generally, as the register names it.
  const nsw = prepareDraft(draftBody(ready({ ...comms(COMMS, { mainsConnection: 'yes' }), state: 'nsw' })));
  assert.deepEqual(electrical(nsw), ['Electrical licence (licensed electrician) under the state\'s electrical licensing law']);
  // Without an answer the SWMS waits for it.
  const open = prepareDraft(draftBody(ready(comms(COMMS, {}))));
  assert.equal(open.kind, 'stand-down');
});

test('UPS wiring named in the task needs no question and lists the licence; clean-ups are not UPS work', () => {
  const wired = comms('Install and wire the UPS in the comms room, including the new circuits from the distribution board.', {});
  assert.ok(!questionsFor(draftBody(wired)).required.some((item) => item.id === 'mainsConnection'));
  const answers = { isolationProcedure: 'Circuits are isolated, locked and tagged, and tested de-energised by the electrician before work.', energisedWork: 'none' };
  const draft = prepareDraft(draftBody(ready({ ...wired, facts: { ...wired.facts, ...answers } })));
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  assert.equal(electrical(draft).length, 1);
  const clean = comms('Site clean-ups during construction: clean floors and stairs and cart rubbish to the site bins.', {});
  assert.ok(!questionsFor(draftBody(clean)).required.some((item) => item.id === 'mainsConnection'));
  // Cabling that only starts or ends at a comms room is not comms room fit-out.
  const fibre = comms('Install the optical fibre backbone cabling in the risers from the main comms room in the basement to each floor, then splice and test the fibre.', {});
  assert.ok(!questionsFor(draftBody(fibre)).required.some((item) => item.id === 'mainsConnection'));
});
