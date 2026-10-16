// WorkSafe Victoria's safety alert "Verifying employee qualifications" (13 October 2026), goal 10:
// Victorian SWMS say how a certificate or licence in doubt is checked, and name the non-slewing
// telehandler licence (TV), each citing the alert. Other states print what they did before.
const test = require('node:test');
const assert = require('node:assert/strict');
const { localControl } = require('../citations');
const { ACTIVITIES, BEFORE } = require('../activities');

const ALERT = 'Verifying employee qualifications: safety alert (WorkSafe Victoria, 13 October 2026)';
const CHECK = 'Check that licences, tickets and permits needed for the task are current.';
const forklift = ACTIVITIES.find((activity) => activity.when === 'forklift').steps[0].controls;
// The forklift and telehandler line, and the line for a telehandler alone.
const both = forklift.find((item) => item.unless === 'telehandlerOnly');
const only = forklift.find((item) => item.only === 'telehandlerOnly');

test('Victorian SWMS check a certificate or licence in doubt, citing the alert', () => {
  assert.ok(BEFORE.controls.includes(CHECK));
  const vic = localControl(CHECK, '', 'vic');
  assert.equal(vic, `${CHECK} Training and qualification certificates are not relied on alone: the worker's knowledge, skills and experience for the task are checked too. Where a certificate's authenticity is in doubt, it is checked on the National Training Register at training.gov.au or with the registered training organisation (RTO) that issued it, and a high risk work licence in doubt is checked through WorkSafe Victoria's licence validation service. (${ALERT})`);
  for (const state of ['qld', 'nsw', 'sa', 'wa', 'tas', 'act', 'nt']) assert.equal(localControl(CHECK, '', state), CHECK, state);
});

test('Victorian telehandler lines name the TV licence and cite Schedule 3 and the alert', () => {
  const cite = ` (Occupational Health and Safety Regulations 2017 (Vic) Schedule 3; ${ALERT})`;
  const licence = 'A non-slewing telehandler rated over 3 t needs the non-slewing telehandler operation licence (TV) or a mobile crane licence (CN, C2, C6, C1 or C0), and a slewing telehandler the slewing mobile crane licence for its capacity (C2, C6, C1 or C0).';
  assert.equal(localControl(both.text, both.source, 'vic'), `Forklift operators hold a high risk work licence for forklift trucks. Telehandler operators are trained and assessed for the machine. ${licence}${cite}`);
  // The citation goes at the end of the line, after the load chart sentence.
  assert.equal(localControl(only.text, only.source, 'vic'), `Telehandler operators are trained and assessed for the machine and its attachments. ${licence} The telehandler works on firm, level ground within its load chart for the reach.${cite}`);
  // No other state's regulations hold a telehandler licence class: the lines print as before.
  for (const state of ['qld', 'nsw', 'sa', 'wa', 'tas', 'act', 'nt']) {
    for (const item of [both, only]) {
      const printed = localControl(item.text, item.source, state);
      assert.ok(printed.startsWith(item.text), `${state}: ${printed}`);
      assert.doesNotMatch(printed, /\(TV\)|safety alert/, state);
    }
  }
});
