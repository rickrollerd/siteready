// SiteLink fixes from messy round 18 (23 October 2026, staging 05b21de). Made-up companies, people and sites only.
// No paid AI reading: the rules are run on the round 16, 17 and 18 words as the testers saw them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const handover = require('../handover');
const answers = require('../sitelink-answers');
const { prepareDraft, questionsFor, screenHighRisk, highRiskMatches } = require('../draft');
const { draftBody } = require('../input');
const { checkSwms, fromDraft } = require('../builder-check');
const gateRules = require('../public/gate-rules');
const scopeTask = require('../public/scope-task');
const substanceRules = require('../public/substance-rules');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const GAS = /pressurised gas/i;
const ENERGISED = /energised electrical/i;
const SITE = {
  workplace: '45 Keira St, Wollongong NSW 2500', principalContractor: 'Wattlebird Hollow Constructions Pty Ltd', complianceResponsible: 'Ronan Delahunty, foreman',
  reviewer: 'Ronan Delahunty, foreman', firstAider: 'Priya Venkataraman', musterPoint: 'Car park north east corner before the gate', date: '23 October 2026', reviewDate: '23 January 2027',
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
  return draft;
}
const labels = (screen) => screen.categories.map((item) => `${item.short}${item.likely ? '?' : ''}`);

// The round 18 work, word for word from the list the lead was shown.
const DUCTWORK = 'Install air handling units, fan coil units, cassette units, fans and heat exchangers. Install ductwork, access panels, dampers and air filters. Install grilles, diffusers and registers with anti-tamper fixings. Install fire and smoke dampers. Install thermal and acoustic insulation and attenuators. Install condensate drains and drip/safe trays. Install chilled water pipework, valves and insulation. Install secondary framework and supports. Install seismic restraints. Cut and seal holes in ductwork for smoke detectors, gas detectors and sprinklers. Install gas purge fan in Gatehouse SER. Install motorised louvres and blank off unused fixed louvres. Paint mechanical installation. Label installed items, pits, pipes and valves.';
const TESTING = 'Flush CST and underground chilled water pipework using secondary pumps, temporary dirt-air separator and building flushing rigs. Test and commission kitchen hoods. Pressure test plenums. Recommission existing SER plant and verify BMS operation via incumbent BMS subcontractor. Start up, test and commission all mechanical systems.';
const ELECTRICAL = 'Install mechanical services switchboards and terminate submains. Install power and control cabling, VSDs, duct heaters and isolators from MSSBs to plant. Install cable containment for mechanical cabling. Provide task lighting for construction.';
const PENETRATIONS = 'Core drill penetrations 50mm and under with concrete scanning and permit (All buildings; conditions: energised buildings; fair faced precast panels; plant: Concrete scanning device). Cut, chase, scabble, patch and make good structure, ceilings and finishes (conditions: Cast-in services; energised buildings).';

// ---- 1. High risk work stated as certain where the work does not have it ----

test('gas detectors and a gas purge fan are not work on gas piping, on the list or in the SWMS (rounds 17 and 18, blocker 1)', () => {
  assert.ok(!labels(screenHighRisk({ state: 'nsw', task: DUCTWORK, kinds: null })).some((label) => GAS.test(label)));
  // The list and the email page read the lead's list by the same rules (handover.highRiskOf).
  assert.doesNotMatch(JSON.stringify(handover.highRiskOf(`Ductwork and mechanical units. ${DUCTWORK}`, 'nsw')), GAS);
  const draft = drafted('nsw', { task: DUCTWORK, kinds: ['ductwork', 'mechPipework', 'fireDampers', 'mechInsulation', 'painting', 'fixtures', 'serviceLabels'] });
  assert.ok(!draft.highRisk.some((label) => GAS.test(label)), draft.highRisk.join('; '));
  for (const text of ['Cut and seal holes in ductwork for smoke detectors, gas detectors and sprinklers. Label pipes and valves.', 'Install gas purge fan in Gatehouse SER. Label installed items, pits, pipes and valves.', 'Connect the gas detectors to the BMS.']) {
    assert.ok(!highRiskMatches(text, 'no', 'nsw').some((item) => item.check === 'gas'), text);
    assert.ok(!labels(screenHighRisk({ state: 'nsw', task: text, kinds: null })).some((label) => GAS.test(label)), text);
  }
  // Round 16: wiring the FIP to the gas shut-off valve stays electrical work on the valve's controls.
  assert.ok(!labels(screenHighRisk({ state: 'nsw', task: 'Wire and connect the FIP to the gas shut-off valve.', kinds: null })).some((label) => GAS.test(label)));
  // Work on gas piping still is.
  for (const text of ['Install a gas hot water system and connect it to the existing gas line.', 'Run new gas pipework to the kitchen and connect the cooktops.', 'Connect the new medical gas pipework to the live manifold.']) {
    assert.ok(labels(screenHighRisk({ state: 'nsw', task: text, kinds: null })).some((label) => GAS.test(label)), text);
  }
});

test('"None: everything is isolated and proved de-energised first" is respected in the SWMS; on the list the energised work is likely, not certain (round 18, blocker 1)', () => {
  const cases = [
    { name: 'Testing and commissioning', task: TESTING, kinds: ['mechCommissioning', 'isolation'] },
    { name: 'Electrical installation', task: ELECTRICAL, kinds: ['commissioning', 'isolation', 'containment', 'cablePull'] },
    // From the scope: the SWMS prints the plain work, and SiteWrite reads the scope's full words with their conditions.
    { name: 'Penetrations and core drilling', task: scopeTask.plainTask([{ activity: 'Core drill penetrations 50mm and under with concrete scanning and permit' }, { activity: 'Cut, chase, scabble, patch and make good structure, ceilings and finishes' }]), scopeTask: { full: PENETRATIONS, notes: '' }, kinds: ['coreDrill', 'silicaDrill', 'isolation'] },
  ];
  for (const one of cases) {
    if (one.scopeTask) one.scopeTask.plain = one.task;
    // The office chose None.
    const none = drafted('nsw', { task: one.task, kinds: one.kinds, ...(one.scopeTask ? { scopeTask: one.scopeTask } : {}) }, { energisedWork: 'none' });
    assert.ok(!none.highRisk.some((label) => ENERGISED.test(label)), `${one.name}: ${none.highRisk.join('; ')}`);
    assert.ok(!Object.keys(none.highRiskFrom || {}).some((label) => ENERGISED.test(label)), one.name);
    // Builder check agrees: no hard fail for energised work the SWMS does not list.
    const checked = checkSwms(fromDraft(none, { state: 'nsw', swms: { signatures: [{ name: 'Sione Taufa', date: '23 October 2026' }] } }), { state: 'nsw', today: '2026-10-23' });
    assert.equal(checked.findings.find((item) => item.rule === 'H1').pass, true, `${one.name}: ${checked.findings.find((item) => item.rule === 'H1').message}`);
    // Testing near energised parts keeps it.
    const testing = drafted('nsw', { task: one.task, kinds: one.kinds, ...(one.scopeTask ? { scopeTask: one.scopeTask } : {}) }, { energisedWork: 'testing', liveElectrical: 'yes' });
    if (questionsFor({ state: 'nsw', fallRisk: 'no', residential: 'no', task: one.task, kinds: one.kinds }).required.some((item) => item.id === 'energisedWork')) {
      assert.ok(testing.highRisk.some((label) => ENERGISED.test(label)), one.name);
      // Before the answer, the list says "likely", depending on the question.
      const screen = screenHighRisk({ state: 'nsw', task: one.task, kinds: one.kinds });
      const item = screen.categories.find((entry) => entry.id === 'electrical');
      assert.ok(!item || item.likely, `${one.name}: ${JSON.stringify(item)}`);
    }
  }
  // Energised only in the scope's conditions ("conditions: energised buildings"), with no question about energised parts:
  // the live electrical question is asked, the list says "likely", and No settles it.
  const cored = 'Core drill penetrations 50mm and under with concrete scanning and permit (All buildings; conditions: energised buildings; fair faced precast panels). Clear penetrations of safety mesh.';
  assert.ok(questionsFor({ state: 'nsw', fallRisk: 'no', residential: 'no', task: cored, kinds: ['coreDrill', 'passiveFire'] }).required.some((item) => item.id === 'liveElectrical'));
  assert.ok(screenHighRisk({ state: 'nsw', task: cored, kinds: ['coreDrill', 'passiveFire'] }).categories.find((item) => item.id === 'electrical').likely);
  assert.ok(!drafted('nsw', { task: cored, kinds: ['coreDrill', 'passiveFire'] }, { liveElectrical: 'no' }).highRisk.some((label) => ENERGISED.test(label)));
  assert.ok(drafted('nsw', { task: cored, kinds: ['coreDrill', 'passiveFire'] }, { liveElectrical: 'yes' }).highRisk.some((label) => ENERGISED.test(label)));
  // Round 16: a sprinkler crew that said No and None has no energised work either.
  const sprinkler = drafted('nsw', { task: 'Install sprinkler and hydrant pipework at height in energised buildings.', facts: { energisedWork: 'none', liveElectrical: 'no' } });
  assert.ok(!sprinkler.highRisk.some((label) => ENERGISED.test(label)));
  // Live work named in the task's own words, and power lines, are not settled by None.
  const live = drafted('nsw', { task: 'Fault find energised circuits in the live switchboards and terminate submains.' }, { energisedWork: 'none' });
  assert.ok(live.highRisk.some((label) => ENERGISED.test(label)));
  const lines = drafted('nsw', { task: 'Terminate submains at the MSSBs near the overhead power lines on the street.' }, { energisedWork: 'none' });
  assert.ok(lines.highRisk.some((label) => ENERGISED.test(label)));
});

// ---- 2. Products named in the SDS answer ----

test('every product the SDS answer names becomes a product the server keeps, and a split keeps no "and" (round 18, blocker 3)', () => {
  assert.deepEqual(substanceRules.sdsProducts('Corrosion inhibitor and biocide for the chilled water dosing, and pipe thread sealant'), [
    { type: 'Pool and water treatment chemicals', product: 'Corrosion inhibitor' },
    { type: 'Pool and water treatment chemicals', product: 'biocide for the chilled water dosing' },
    { type: 'Sealants, mastics and silicone', product: 'pipe thread sealant' },
  ]);
  assert.deepEqual(substanceRules.sdsProducts('Duct sealant mastic, pipe thread sealant, contact adhesive for the insulation and cold galv zinc spray.').map((row) => row.product),
    ['Duct sealant mastic', 'pipe thread sealant', 'contact adhesive for the insulation', 'cold galv zinc spray']);
  assert.ok(!substanceRules.sdsProducts('mastic, n pipe thread sealant, & silicone').some((row) => /^(?:and|n|&)\b/i.test(row.product)));
  // The cause: the one-go page gave each product an "sds-..." id, and the server keeps only "sub-..." ids, so the draft never
  // had them and asked for each type again. Now each takes the next free "sub-" id.
  const kept = draftBody({ state: 'nsw', task: 'Install ductwork.', substances: [{ id: 'sds-3-4', type: 'Sealants, mastics and silicone', product: 'Pipe thread sealant' }, { id: 'sub-2', type: 'Adhesives', product: 'Contact adhesive' }] });
  assert.deepEqual(kept.substances.map((row) => row.id), ['sub-2']);
  const page = read('public/project-go.js');
  assert.match(page, /taken\.add\(`sub-\$\{next\}`\)/);
  assert.doesNotMatch(page, /id: `sds-/);
});

// ---- 3. The lead's added crane lift SWMS ----

test('two plain crane lift wordings of the dehumidifier lift have job steps (round 18, stuck point 1)', () => {
  for (const task of [
    'Pool hall dehumidifier units - lift and set. Crane lift the 2 pool hall dehumidifier units onto the plant deck, set them on the plinths and connect ducts. Lift plan to Hamish before the lift.',
    'Pool hall dehumidifier units - lift and set. Mobile crane lifts the 2 dehumidifier units off the truck onto the plant deck. We sling and guide them, then set them on the plinths and connect the ducts. Lift plan to Hamish before the lift.',
  ]) {
    assert.equal(handover.noJobSteps({ task, kinds: null }, 'nsw'), false, task);
    const draft = drafted('nsw', { task, crane: 'company', slinging: 'crew' });
    assert.ok(draft.jobSteps.some((step) => /plant|lift|crane/i.test(step.step)), draft.jobSteps.map((step) => step.step).join(' | '));
    assert.ok(draft.jobSteps.some((step) => /duct/i.test(step.step)), draft.jobSteps.map((step) => step.step).join(' | '));
  }
});

// ---- 4. Scope wording ----

const row = (activity, pack, clause, unknowns = '', extra = {}) => ({ activity, type: 'Site work', package: pack, crew: 'Mechanical fitters', clause, quotes: [`${activity}.`], where: '', plant: '', conditions: '', unknowns, matrixColumn: '', ...extra });
const READING = {
  activities: [
    row('Install central chillers and cooling towers', 'Trade installation: chiller plant (X21)', '4.3(a)', '', { where: 'Chiller plant X21' }),
    row('Install chiller plant pumps, pipework and water treatment', 'Trade installation: chiller plant (X21)', '4.3(b)'),
    row('Install, test and commission the Anti-Vehicle Ramming System rising step', 'Trade installation: Gatehouse AVRS', '4.8(f)', '', { where: 'In front of the Gatehouse' }),
    row('Install gas purge fan in Gatehouse SER', 'Ductwork and mechanical units', '4.2(h)', '', { where: 'Gatehouse SER' }),
    row('Pressure test Gatehouse SER room for leakage', 'Testing and commissioning', '5.2(i)'),
    row('Install AVRS control and monitoring cabling to gatehouse main control room', 'Electrical', '4.6(a)'),
    row('Hazardous zone compliance installation where nominated', 'Electrical', '4.4(a)', 'Only if hazardous areas are nominated on the Drawings'),
    row('Terminate submains at MSSBs', 'Electrical', '4.6(b)', 'Submains supplied and installed by the Electrical subcontractor'),
    row('Install and remove covers over smoke detectors after commissioning', 'Testing and commissioning', '5.3(a)', 'Smoke detectors are Fire subcontractor\'s equipment'),
    row('Lay underground chilled water pipework', 'In-ground civil', 'C-2.04', 'Managing Contractor\'s surveyor must survey in-ground works before backfilling'),
    row('Install mechanical pits, valves and bends', 'In-ground civil', 'C-2.05', 'Managing Contractor\'s surveyor must survey in-ground works before backfilling or closing of pits'),
    row('Final connection of mechanical services to installed CCRMF', 'Trade installation: CCRMF', 'C-9.16'),
  ],
  byOthers: [],
  conflicts: [],
};

test('titles carry no scope code, the reading\'s own place names keep their capitals, and work has a verb (round 18, wording 1 and 3)', () => {
  const items = handover.listItems(READING);
  const titles = items.map((item) => item.listTitle || item.title);
  assert.ok(titles.includes('Chiller plant'), titles.join(' | '));
  assert.ok(!titles.some((title) => /\(X21\)/.test(title)), titles.join(' | '));
  assert.ok(!items.some((item) => /\bgatehouse\b/.test(`${item.title} ${item.listTitle || ''} ${item.task}`)), items.map((item) => `${item.title}: ${item.task}`).join('\n'));
  assert.ok(items.some((item) => /to Gatehouse main control room/.test(item.task)));
  const electrical = items.find((item) => /Hazardous zone/i.test(item.task));
  assert.match(electrical.task, /Carry out hazardous zone compliance installation where nominated\./);
  const ccrmf = items.find((item) => /CCRMF/.test(item.task));
  assert.match(ccrmf.task, /^Make the final connection of mechanical services to installed CCRMF\.$/);
  assert.notEqual(ccrmf.task.replace(/\.$/, ''), ccrmf.listTitle || ccrmf.title);
  // SiteWrite's own scope reading titles its packages the same way.
  assert.ok(!Object.values(handover.packageTitles(READING)).some((title) => /\(X21\)|\bgatehouse\b/.test(title)));
});

test('notes are sentences, name the other trade with "the" and are said once (round 18, wording 1)', () => {
  const notes = handover.listItems(READING).flatMap((item) => item.draftNotes || []);
  assert.ok(notes.includes('Hazardous zone compliance installation where nominated: only if hazardous areas are nominated on the Drawings.'), notes.join('\n'));
  assert.ok(notes.includes('Smoke detectors are the Fire subcontractor\'s equipment.'), notes.join('\n'));
  assert.ok(notes.includes('Submains supplied and installed by the Electrical subcontractor.'));
  assert.equal(notes.filter((note) => /surveyor must survey in-ground works/.test(note)).length, 1, notes.join('\n'));
  assert.ok(notes.includes('Managing Contractor\'s surveyor must survey in-ground works before backfilling or closing of pits.'));
});

test('points that are only a question\'s words are asked as questions (round 18, wording 2)', () => {
  assert.equal(handover.pointSentence('Who operates and controls the scissor lifts when used by other trades.'), 'Who operates and controls the scissor lifts when used by other trades?');
  assert.equal(handover.pointSentence('Whether covers are this subcontractor\'s work.'), 'Are covers this subcontractor\'s work?');
  // Points that say what is open stay as they are.
  assert.equal(handover.pointSentence('Who dismantles the plant to be demolished is not stated.'), 'Who dismantles the plant to be demolished is not stated.');
  assert.equal(handover.pointSentence('Pits 3, 4 and 5 will be temporarily finished 800mm below ground. When and by whom they will be completed is not stated'), 'Pits 3, 4 and 5 will be temporarily finished 800mm below ground. When and by whom they will be completed is not stated.');
});

// ---- 5. Typed shorthand on the builder's side ----

test('"r", a day of the week, an outside sender\'s name and "nth" are tidied (round 18, wording 4)', () => {
  assert.equal(answers.capitalSentences(answers.typedWords('Yes covers r Quokka\'s work, fire sub owns n tests the detectors.')), 'Yes covers are Quokka\'s work, fire sub owns and tests the detectors.');
  assert.equal(answers.tidyNote('No permit from Hamish on file yet, get it signed before friday.'), 'No permit from Hamish on file yet, get it signed before Friday.');
  assert.equal(answers.tidyNote('Emailed by milos hartigan to Marlee and Hamish on 22 oct'), 'Emailed by Milos Hartigan to Marlee and Hamish on 22 Oct');
  assert.equal(answers.tidyNote('sent by the builder on monday'), 'Sent by the builder on Monday');
  assert.equal(answers.tidyPlace(answers.typedWords('Car park nth east corner before the gate')), 'Car park north east corner before the gate');
  // A lone "r" that is part of a name or a code is left alone.
  assert.equal(answers.typedWords('Level R1 roof'), 'Level R1 roof');
});

// ---- 6. Prepared by ----

test('the Prepared by example for one name and a place asks for the surname (round 18, wording 5)', () => {
  assert.match(gateRules.fieldWeak('person', 'kayla front office'), /ends in "front office".*for example "Kayla \(surname\), office manager"/);
  assert.doesNotMatch(gateRules.fieldWeak('person', 'kayla front office'), /Kayla Front/);
  assert.match(gateRules.fieldWeak('person', 'kayla odhiambo front office'), /for example "Kayla Odhiambo, office manager"/);
});

// ---- 7. "our crew" in the lead's words ----

test('the lead is told how "our crew" reads to the subcontractor (round 18, wording 6)', () => {
  assert.match(answers.ourWordsNote('A crane company lifts the units up, our crew lands them on the plinths.', 'Quokka Ridge Air Mechanical'), /Your words say "our crew": Quokka Ridge Air Mechanical reads it as its own crew/);
  assert.equal(answers.ourWordsNote('A crane company lifts the units up, the subcontractor lands them on the plinths.', 'Quokka Ridge Air Mechanical'), '');
  assert.match(read('sitelink-scopes.js'), /is added to the list\.\$\{answers\.ourWordsNote\(task, ctx\.sub\.name\)\}/);
});

// ---- 8. Smaller faults ----

test('a shared crane answer does not reach work that is only near crane pads (round 18, smaller)', () => {
  const task = 'Inspect CST pits and pipework and connect to CST works (Combined Services Trench around site perimeter; pits 3, 4, 5; conditions: near temporary haul roads and crane pads). Lay underground chilled water pipework and cap risers (Site wide trenches).';
  const site = { liveServices: 'Energised switchboards. The electrician isolates them.', publicInterface: 'None. The site is fenced.', otherTrades: 'Electrical and hydraulic trades nearby.', ground: 'Open service trenches near the plant deck.', access: 'Walk in through the site gate. Plant and units go by crane to the plant deck.' };
  const draft = drafted('nsw', { task, kinds: ['trench'], site, siteShared: true });
  assert.ok(!draft.controls.concat(draft.jobSteps.flatMap((step) => step.controls)).some((line) => /crane company plans and does the lifts/i.test(typeof line === 'string' ? line : line.text)));
  assert.ok(!(draft.plant || []).some((item) => /crane/i.test(item.item || '')), JSON.stringify(draft.plant));
});

test('scope site words that name no people or ground are not offered as answers (round 18, smaller)', () => {
  assert.deepEqual(scopeTask.siteSuggestions(['Operating existing facility.', 'Live adjacent facility BMS and Security Management System.', 'Public footpath in operating facility.'], 'publicInterface'), ['Public footpath in operating facility.']);
  assert.deepEqual(scopeTask.siteSuggestions(['Builder safety requirement: no in-slab conduits unless no alternative.', 'Soft wet ground near the pits.'], 'ground'), ['Soft wet ground near the pits.']);
});

test('a saved answer is not shown as "not saved yet" after a reload; a submitted SWMS says to whom; the saved line follows the newest save (round 18, smaller)', () => {
  const hse = read('public/hse.js');
  assert.match(hse, /typedHere\.delete\(id\);\n\s+keepTyped\(typedKey\('answer', sub\.subcontract\.id, id\), null\);/);
  const account = read('public/account.js');
  assert.match(account, /swms\.submitted \? `<p>Revision \$\{esc\(swms\.revision\)\} was submitted to/);
  assert.match(read('accounts.js'), /submitted: \{ to: sent\.org, project: sent\.project, on: longDate\(sent\.submitted_at\) \}/);
  assert.match(read('public/scope.js'), /\{ const el = \$\('list-saved'\); if \(el\) el\.textContent = savedLine\(project\.sitelink\); \}\n\s+return;/);
});
