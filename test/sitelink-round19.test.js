// SiteLink fixes from messy round 19 (23 October 2026, staging eb16aa7). Made-up companies, people and sites only.
// No paid AI reading: the rules are run on the round 15 to 19 words as the testers saw them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const handover = require('../handover');
const answers = require('../sitelink-answers');
const { prepareDraft, questionsFor, screenHighRisk, answerState } = require('../draft');
const { draftBody } = require('../input');
const scopeTask = require('../public/scope-task');
const substanceRules = require('../public/substance-rules');
const CASES = require('./sitelink-settle.data');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const ENERGISED = /energised electrical/i;
const SITE = {
  workplace: '150 Logan Rd, Woolloongabba QLD 4102', principalContractor: 'Grevillea Bend Constructions Pty Ltd', complianceResponsible: 'Ruben Ashcroft, foreman',
  reviewer: 'Ruben Ashcroft, foreman', firstAider: 'Oliver Tran', musterPoint: 'Car park south west corner near the gate', date: '24 October 2026', reviewDate: '24 January 2027',
};
// The questions answered as a person would: the first choice of each, live electrical work No, and a sentence for the rest.
function drafted(state, item, chosen = {}) {
  const input = { state, fallRisk: 'no', residential: 'no', ...SITE, ...item };
  const facts = { ...(item.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const one of asked.required || []) {
      if (facts[one.id]) continue;
      facts[one.id] = chosen[one.id] || (one.id === 'liveElectrical' ? 'no' : one.choices ? one.choices[0].value : `As set out in the site plan for ${one.label.toLowerCase()}.`);
      added = true;
    }
    if (!added) break;
  }
  const draft = prepareDraft(draftBody({ ...input, facts }));
  assert.equal(draft.kind, 'draft', `${item.task}: ${JSON.stringify(draft.missing)}`);
  return { draft, facts };
}
const energised = (screen) => screen.categories.find((item) => item.id === 'electrical');

// The round 19 work, word for word from the list the lead was shown.
const DUCTWORK = 'Supply and install non-pick caulking and bedding to installed items. Install seismic restraints. Install air handling units, pre-conditioners, fan coil units and cassette units. Install fans including smoke exhaust and make-up fans. Install ductwork and duct access panels. Install air filters. Install balancing, motorised, fire and smoke dampers. Install thermal insulation to ductwork, pipework, housings and plenums. Install chilled water pipework, valves and control valves in buildings. Blank off unused sections of fixed louvres. Supply, install, test and commission motorised louvres. Supply and install kitchen and café cooking hoods with exhaust ductwork and fans to above roof, local control and light connection. Install Gatehouse SER gas purge fan.';
// Electrical installation after the lead took out the temporary power sentence and wrote her own.
const ELECTRICAL = 'Install AVRS control and monitoring cabling to Gatehouse main control room. Supply and install mechanical services switchboards. Install power and control cabling, VSDs, duct heaters and isolators from MSSBs to mechanical plant. Terminate submains at MSSBs, central chillers and AVRS cubicle. Install cable trays, ladders and containment for mechanical cabling. Thermographic scanning of switchboards by specialist before PC and before end of DLP. Electrical sub removes the temp power not us.';

// ---- 1. High risk work stated as certain ----

test('mechanical plant commissioned is energised work only "depending on" the energised parts question, and None takes it off (round 19, blocker 1)', () => {
  for (const kinds of [null, ['ductwork', 'mechPipework', 'mechInsulation', 'mechCommissioning', 'fireDampers', 'fanCoil', 'isolation']]) {
    const item = energised(screenHighRisk({ state: 'qld', task: DUCTWORK, kinds }));
    assert.ok(item && item.likely, `${JSON.stringify(kinds)}: ${JSON.stringify(item)}`);
    assert.equal(item.dependsOn, 'whether any testing or commissioning is done near energised parts');
    // The SWMS asks it, and None takes it off.
    assert.ok(questionsFor({ state: 'qld', fallRisk: 'no', residential: 'no', task: DUCTWORK, kinds }).required.some((one) => one.id === 'energisedWork'));
    const none = drafted('qld', { task: DUCTWORK, kinds }, { energisedWork: 'none' }).draft;
    assert.ok(!none.highRisk.some((label) => ENERGISED.test(label)), none.highRisk.join('; '));
    const testing = drafted('qld', { task: DUCTWORK, kinds }, { energisedWork: 'testing' }).draft;
    assert.ok(testing.highRisk.some((label) => ENERGISED.test(label)));
  }
  // The list and the email page say it the same way.
  const line = JSON.stringify(handover.highRiskOf(`Ductwork and mechanical units. ${DUCTWORK}`, 'qld'));
  assert.match(line, /Energised electrical installations or services, depending on whether any testing or commissioning is done near energised parts/);
  assert.doesNotMatch(line, /\(Energised electrical installations or services[;)]/);
});

test('work the task gives to a specialist or another trade is not this crew\'s energised work after None (round 19, blocker 1)', () => {
  const none = drafted('qld', { task: ELECTRICAL }, { energisedWork: 'none' }).draft;
  assert.ok(!none.highRisk.some((label) => ENERGISED.test(label)), none.highRisk.join('; '));
  const item = energised(screenHighRisk({ state: 'qld', task: ELECTRICAL, kinds: null }));
  assert.ok(item && item.likely, JSON.stringify(item));
  for (const task of ['Thermographic scanning of switchboards by specialist before PC.', 'Install cable trays. Electrical sub removes the temp power not us.', 'Install cable trays. The electrician removes the temporary power supply.']) {
    assert.ok(!drafted('qld', { task: `Install mechanical services switchboards and terminate submains. ${task}` }, { energisedWork: 'none' }).draft.highRisk.some((label) => ENERGISED.test(label)), task);
  }
  // Construction power the crew itself takes out stays energised work, None or not (sl15 decision 1).
  const own = drafted('qld', { task: 'Install mechanical services switchboards. Remove temporary power supply to SER DX plant back to electrical DB.' }, { energisedWork: 'none' }).draft;
  assert.ok(own.highRisk.some((label) => ENERGISED.test(label)));
});

// ---- 2. An answered point settles the notes on its subject ----

test('the round 15 to 19 answers settle the notes on their own subject and no other, SWMS by SWMS (round 19, blocker 3)', () => {
  const settled = {};
  for (const [round, { answers: given, swms }] of Object.entries(CASES)) {
    for (const one of swms) {
      const notes = handover.withSettled({ draftNotes: handover.notesOf(one.notes) }, given, { activities: one.work }).draftNotes;
      for (const note of notes) {
        const by = (one.settled || {})[note.text];
        assert.equal(note.settled, by === undefined ? undefined : given[by].answer, `${round}, ${one.title}: "${note.text}"`);
        if (note.settled) settled[round] = (settled[round] || 0) + 1;
      }
    }
  }
  assert.deepEqual(settled, { r15: 1, r16: 1, r17: 1, r18: 2, r19: 4 });
  // The pit lid note that contradicted the answer is settled by it, and the warranty note beside it is not.
  const r19 = CASES.r19;
  const inGround = r19.swms.find((one) => one.title === 'In-ground mechanical services');
  const notes = handover.withSettled({ draftNotes: handover.notesOf(inGround.notes) }, r19.answers, { activities: inGround.work }).draftNotes;
  assert.equal(notes.find((note) => /security bolts/.test(note.text)).settled, 'Yes Currawong bolts the cst pit lids, bolt pattern from Isla before install.');
  assert.equal(notes.find((note) => /warranties/.test(note.text)).settled, undefined);
});

test('through the lead\'s preview: the answered pit lid, temporary power and WWTP points settle their notes (round 19, blocker 3)', () => {
  const r19 = CASES.r19;
  const item = (one, i) => ({ id: `i${i}`, package: one.title, title: one.title, task: one.work.join('. '), item: { activities: one.work.map((activity) => ({ activity })), draftNotes: one.notes } });
  const items = r19.swms.map(item);
  const points = r19.answers.map((one, i) => ({ id: `p${i}`, activity: one.activity, question: one.question, answer: one.answer }));
  const view = handover.subcontractorView({ project: { name: 'Kurrajong Park Aquatic Centre', workplace: '150 Logan Rd', state: 'qld' }, org: { name: 'Grevillea Bend Constructions Pty Ltd' }, subcontract: { name: 'Currawong Flat Air Mechanical Pty Ltd' }, items, points, withNotes: true });
  const settled = view.swms.flatMap((one) => (one.notes || []).filter((note) => note.settled).map((note) => note.text));
  assert.deepEqual(settled, [
    'C-2.03 gives installation of security bolts to CST pit lids to the CST subcontractor.',
    'C-10.02 places an X under WWTP for supply and install of mechanical plant.',
    'The Associated work note gives removal of the temporary power supply to the Electrical subcontractor.',
    'Removal from site is by the builder (C-1.109).',
  ]);
});

// ---- 3. Site details and names ----

test('"from" stays small in a name, a first name that is a word takes its capital after "with", "to" or "and", and who saved is never the Prepared by name (round 19, wording 1 and 6)', () => {
  assert.equal(answers.tidyPerson('brodie kwan from tallgum scaffolding 0491570158'), 'Brodie Kwan from Tallgum Scaffolding 0491570158');
  const people = ['Oliver Tran 0491570157', 'Isla Fenwick 0491570159'];
  assert.equal(answers.withPeople('Induction with oliver before first shift', people), 'Induction with Oliver before first shift');
  assert.equal(answers.tidyNote('certificate emailed to isla n oliver', [], people), 'Certificate emailed to Isla and Oliver');
  // A word that is only a word stays as it is.
  assert.equal(answers.tidyNote('the olive oil and the oliver press', [], people), 'The olive oil and the oliver press');
  // The foreman's save was named by the office's Prepared by as first typed; a role typed after a name is not part of it.
  const subbie = read('sitelink-subbie.js');
  assert.match(subbie, /const who = String\(req\.user\.name \|\| ''\)/);
  assert.doesNotMatch(subbie, /page\.preparedBy/);
  assert.deepEqual(answers.splitRole('Delphine Okoro Office Admin'), { name: 'Delphine Okoro', role: 'Office Admin' });
  // The log names the company once where it took up its own list.
  assert.match(read('sitelink-send.js'), /: `\$\{name\} \(ABN \$\{formatAbn\(abn\)\}\) took up its list in SiteWrite\.`/);
});

// ---- 4. The reading's own text ----

test('the reading\'s work and notes read as sentences (round 19, wording 2)', () => {
  const plain = (activity) => scopeTask.plainTask([{ activity }]);
  assert.equal(plain('Paint mechanical installation'), 'Paint the mechanical installation.');
  assert.equal(plain('Hazardous zone compliance design and installation where nominated'), 'Carry out hazardous zone compliance design and installation where nominated.');
  assert.equal(plain('Thermographic scanning of switchboards by specialist before PC and before end of DLP'), 'Arrange thermographic scanning of switchboards by a specialist before PC and before end of DLP.');
  assert.equal(plain('Install mechanical services (toilet exhaust) into Common Cell Riser Main Frames at the Hydraulics construction facility'), 'Install mechanical services (toilet exhaust) into Common Cell Riser Main Frames at the Hydraulics construction facility.');
  // A bracket at the end still reads after a colon, and a place still comes off.
  assert.equal(plain('Install grilles (Level 2)'), 'Install grilles.');
  const row = (activity, unknowns) => ({ activity, unknowns, type: 'Site work' });
  const notes = handover.draftNotes([
    row('Thermographic scanning of switchboards by specialist before PC and before end of DLP', 'Confirm extent'),
    row('Vacuum excavation where required by builder permits', 'Where vacuum excavation is required is set by the builder\'s permits'),
    row('Install and remove covers over smoke detectors after commissioning', 'Smoke detectors are the Fire subcontractor equipment'),
    row('Install motorised louvres', 'Boundary with C-1.76 not defined'),
    row('Core drill penetrations', 'Builder approval of permits in exclusion zones'),
  ]);
  assert.deepEqual(notes, [
    'Thermographic scanning of switchboards by specialist before PC and before end of DLP: extent to be confirmed.',
    'Smoke detectors are the Fire subcontractor\'s equipment.',
    'Boundary with C-1.76 is not defined.',
    'The builder must approve permits in exclusion zones.',
  ]);
  // Notes kept on a list read before read the same way.
  assert.deepEqual(handover.notesOf(['Smoke detectors are the Fire subcontractor equipment.', 'Builder approval of permits in exclusion zones.']).map((one) => one.text), ['Smoke detectors are the Fire subcontractor\'s equipment.', 'The builder must approve permits in exclusion zones.']);
  // After the lead rewrote the work, its note no longer quotes the old words.
  const changed = { task_changed: true, task: 'Install flameproof exhaust fans and ductwork in the chemical store and paint store, with gas detectors wired by the electrician, to the hazardous area drawings.', item: { activities: [{ activity: 'Hazardous zone compliance design and installation where nominated' }], draftNotes: ['Hazardous zone compliance design and installation where nominated: applies only if hazardous areas are nominated on the Drawings.'] } };
  assert.deepEqual(handover.withFolded(changed, [changed]).draftNotes, ['This work applies only if hazardous areas are nominated on the Drawings.']);
  // Work the new words keep, as its plain sentence, keeps its note as it is.
  const kept = { task_changed: true, task: 'Install cable trays. Arrange thermographic scanning of switchboards by a specialist before PC and before end of DLP. Electrical sub removes the temp power not us.', item: { activities: [{ activity: 'Thermographic scanning of switchboards by specialist before PC and before end of DLP' }], draftNotes: ['Thermographic scanning of switchboards by specialist before PC and before end of DLP: extent to be confirmed.'] } };
  assert.deepEqual(handover.withFolded(kept, [kept]).draftNotes, kept.item.draftNotes);
  // Not changed, the note keeps the work it is about.
  assert.deepEqual(handover.withFolded({ ...changed, task_changed: false }, []).draftNotes, changed.item.draftNotes);
});

// ---- 5. Points that are orders ----

test('points and notes written as orders say what is open (round 19, wording 3)', () => {
  assert.equal(handover.pointSentence('Confirm whether Mechanical bolts CST pits. Bolt head pattern type to be advised by the builder.'), 'It is not stated whether Mechanical bolts CST pits. Bolt head pattern type to be advised by the builder.');
  assert.equal(handover.pointSentence('Confirm who does it.'), 'It is not stated who does this work.');
  assert.equal(handover.pointSentence('Confirm who installs.'), 'It is not stated who does this work.');
  assert.equal(handover.pointSentence('Confirm who supplies the AC equipment'), 'It is not stated who supplies the AC equipment.');
  assert.equal(handover.notesOf(['Confirm Mechanical installs the covers.'])[0].text, 'It is to be confirmed whether Mechanical installs the covers.');
  // A point that already says what is open, or asks, is as before.
  assert.equal(handover.pointSentence('Who completes pits 3, 4 and 5 to final level, and when, is not stated.'), 'Who completes pits 3, 4 and 5 to final level, and when, is not stated.');
  assert.equal(handover.pointSentence('Who operates the scissor lifts.'), 'Who operates the scissor lifts?');
});

// ---- 6. A work line split on its commas ----

test('verbs listed before the one thing they are done to are one piece of work with no job steps (round 19, wording 4)', () => {
  const task = 'Install ductwork and duct access panels. Supply, install, test and commission motorised louvres. Blank off unused sections of fixed louvres.';
  const { draft } = drafted('qld', { task, kinds: ['ductwork'], unmatched: ['Supply, install, test and commission motorised louvres'] });
  assert.ok(draft.notCovered.includes('Supply, install, test and commission motorised louvres'), JSON.stringify(draft.notCovered));
  assert.ok(!draft.notCovered.some((part) => /^(?:Supply|test and commission motorised louvres)$/.test(part)), JSON.stringify(draft.notCovered));
  // A verb with its own step is still covered by it ("Backfill, compact and reinstate the footpath", messy round 10).
  const trench = drafted('qld', { task: 'Excavate the trench. Lay the pipe. Backfill, compact and reinstate the footpath.', kinds: ['trench'], unmatched: ['Backfill, compact and reinstate the footpath'] }).draft;
  assert.deepEqual(trench.notCovered, []);
});

// ---- 7. Typed shorthand on the builder's side ----

test('the lead\'s and the subcontractor\'s shorthand reads as written: apostrophes, "their own", the builder\'s people and the scope\'s short names (round 19, wording 5)', () => {
  assert.equal(answers.tidyNote('numbat dont use the scissor lifts, they bring there own ewp n licenced operator'), 'Numbat don\'t use the scissor lifts, they bring their own EWP and licenced operator');
  assert.equal(answers.tidyNote('the certificate isnt in my inbox yet'), 'The certificate isn\'t in my inbox yet');
  assert.equal(answers.tidyNote('spotter lowers the EWP if hes stuck'), 'Spotter lowers the EWP if he\'s stuck');
  assert.equal(answers.tidyNote('builders concreters on the plant deck, load limits from the builders engineer'), 'Builder\'s concreters on the plant deck, load limits from the builder\'s engineer');
  // Plural builders, and words that are words without the apostrophe, stay.
  assert.equal(answers.tidyNote('two builders are on site, we cant start till the lets are signed'), 'Two builders are on site, we cant start till the lets are signed');
  const scopeText = 'The CST pits 3, 4 and 5. Supply and install WWTP mechanical plant. Gatehouse SER.';
  assert.equal(answers.leadWords('Cst sub finishes pits 3 4 and 5, Currawong installs the wwtp mech plant n bolts the cst pit lids', { scopeText, stop: true }), 'CST sub finishes pits 3 4 and 5, Currawong installs the WWTP mech plant and bolts the CST pit lids.');
  assert.match(read('sitelink-scopes.js'), /const answer = answers\.leadWords\([^\n]*scopeText: scopeWordsOf\(await itemsOf\(ctx\.sub\.id\)\)/);
});

// ---- 8. Smaller ----

test('a short list of named products is judged as a long one is; type names alone are not products (round 19, smaller)', () => {
  for (const text of ['Fire rated sealant n intumescent mastic', 'Pipe thread sealant n duct mastic', 'Duct sealant mastic, pipe thread sealant, contact adhesive for the insulation and cold galv zinc spray']) {
    assert.equal(answerState('safetyDataSheet', text), 'supplied', text);
    assert.ok(substanceRules.sdsProducts(text).length >= 2, text);
  }
  for (const text of ['glue n primer', 'pvc conduit glue n cable pulling lube']) assert.equal(answerState('safetyDataSheet', text), 'vague', text);
});

test('scope site words that only point to a report, or name security with no way in, are not offered (round 19, smaller)', () => {
  assert.deepEqual(scopeTask.siteSuggestions(['Existing ground conditions per Geotechnical Report.', 'Soft wet ground near the pits, see geotech report.'], 'ground'), ['Soft wet ground near the pits, see geotech report.']);
  assert.deepEqual(scopeTask.siteSuggestions(['Correctional facility security classification areas.', 'Client guard escort at all times.', 'Security passes at the gatehouse.'], 'access'), ['Client guard escort at all times.', 'Security passes at the gatehouse.']);
});

test('crane pads beside the work put no crane in its plant list (round 19, smaller)', () => {
  const { plantFor } = require('../register');
  assert.ok(!plantFor('Inspect CST pits (pits 3, 4, 5; conditions: near temporary haul roads and crane pads).').some((item) => /crane/i.test(item.item)));
  assert.ok(plantFor('The crane lifts the units. It sets up on the crane pad.').some((item) => item.item === 'Mobile crane or crane truck'));
  const { draft } = drafted('nsw', { task: 'Inspect CST pits and pipework and connect to CST works. Trench excavation for in-ground mechanical services.', scopeTask: { plain: 'Inspect CST pits and pipework and connect to CST works. Trench excavation for in-ground mechanical services.', full: 'Inspect CST pits and pipework and connect to CST works (Combined Services Trench; pits 3, 4, 5; conditions: near temporary haul roads and crane pads). Trench excavation for in-ground mechanical services (Site wide).', notes: '' }, kinds: ['trench', 'confined'], crane: 'company', slinging: 'crane' });
  assert.ok(!(draft.plant || []).some((item) => /crane/i.test(item.item)), JSON.stringify(draft.plant.map((item) => item.item)));
});
