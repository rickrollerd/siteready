// Owner testing, 13 October 2026, items 18 to 28, and the messy-user test on staging, 14 October:
// the server side of D253 to D263, D266 and D267, the crane question and weak answers. The page's
// drawing is driven in the browser test (tools/e2e-draftfixes.js); here, what it is given and draws.
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');
const { downloadGaps } = require('../download-gate');
const { draftToDocx } = require('../docx-draft');
const { draftToPdf } = require('../pdf-draft');
const { checkSwms, fromDraft } = require('../builder-check');
const { withMass, withMassHtml } = require('../public/mass');
const { answerNeed } = require('../public/gate-rules');
const fill = require('../public/design-fill');
const choice = require('../public/scope-choice');
const emergency = require('../emergency');
const { offersFor } = require('../own-hazards');
const { atHeight } = require('../step-ppe');
const { deidentifyAnswer, blankAnswers } = require('../control-learning');
const { ANSWERED } = require('./helpers');

// A draft as the page asks for it: the questions answered with the first standard answer, blanks filled.
function answered(input) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor(draftBody({ ...input, facts }));
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id]) continue;
      facts[item.id] = item.choices ? item.choices[0].value : ((answersFor(item.id, asked.task)[0] || {}).text || `As set out in the site plan: ${item.label}.`).replace(/_{3,}/g, 'as on the site plan');
      added = true;
    }
    if (!added) break;
  }
  return { ...input, facts };
}
const draft = (input) => prepareDraft(draftBody(input));
const docxText = async (d) => {
  const zip = await JSZip.loadAsync(await draftToDocx(d));
  return (await zip.file('word/document.xml').async('string')).replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
};

// ---- D263: a load rating prints with its mass ----

test('D263: kPa and kN load ratings print with their mass, at 100 kg per kPa or kN, the formwork code\'s equivalence', () => {
  assert.equal(withMass('Deck load limit 100 kPa.'), 'Deck load limit 100 kPa (about 10 tonnes per square metre).');
  assert.equal(withMass('The deck is rated 2 kPa.'), 'The deck is rated 2 kPa (about 200 kg per square metre).');
  assert.equal(withMass('A 2.5 kPa deck'), 'A 2.5 kPa (about 250 kg per square metre) deck');
  assert.equal(withMass('Point load 2 kN on the handrail'), 'Point load 2 kN (about 200 kg) on the handrail');
  assert.equal(withMass('loads of 5 to 10 kPa here'), 'loads of 5 to 10 kPa (about 500 kg to 1 tonne per square metre) here');
  // In brackets already, the mass goes after a comma.
  assert.equal(withMass('on drawing S-101 (100 kPa), checked'), 'on drawing S-101 (100 kPa, about 10 tonnes per square metre), checked');
  assert.equal(withMass('free fall (12 kN where only a limited free fall is possible, 21 kN for two people).'),
    'free fall (12 kN, about 1.2 tonnes, where only a limited free fall is possible, 21 kN, about 2.1 tonnes, for two people).');
  // A pressure or a force is not a mass, and a mass is given once.
  for (const text of ['Gas pipework is tested with air or nitrogen to 7 kPa.', 'Tested with water to 1500 kPa, with the area barricaded.', 'Energy absorbers limit the arrest force to 6 kN.', 'a moment of 20 kNm', 'line load 3 kN/m', 'Rated 100 kPa (about 10 tonnes per square metre).']) assert.equal(withMass(text), text);
  // Bearing pressure is a load rating.
  assert.match(withMass('allowable bearing pressure 200 kPa.'), /200 kPa \(about 20 tonnes per square metre\)/);
  // On the page: in the text, never in a tag's attributes or a box the user types in.
  assert.equal(withMassHtml('<li data-from="2 kPa">deck 2 kPa</li><textarea>2 kPa</textarea>'), '<li data-from="2 kPa">deck 2 kPa (about 200 kg per square metre)</li><textarea>2 kPa</textarea>');
});

test('D263: the load limit answer prints with its mass in Word and PDF', async () => {
  const input = answered({ ...ANSWERED, state: 'qld', fallRisk: 'no', task: 'Stack reo bundles and formwork on the suspended slab deck, then place and tie the reo' });
  input.facts.loadLimits = 'Loads are placed only in the areas marked on the structural engineer\'s drawing S-101 (5 kPa), checked by the leading hand before loading starts.';
  const d = draft(input);
  assert.equal(d.kind, 'draft');
  // The draft itself keeps the words as given: the mass is added as it prints.
  assert.ok(JSON.stringify(d).includes('(5 kPa)'));
  assert.ok(!JSON.stringify(d).includes('about 500 kg'));
  assert.match(await docxText(d), /\(5 kPa, about 500 kg per square metre\)/);
  const pdf = (await draftToPdf(d)).toString('latin1');
  assert.ok(pdf.length > 1000);
});

// ---- D266: the harness goes only into steps that work at height, with an anchor line ----

test('D266: a step works at height by its name or hazards; a dropped object below is not', () => {
  assert.equal(atHeight({ step: 'Install cable tray and containment', hazards: ['A fall from a ladder, platform or elevating work platform.'] }), true);
  assert.equal(atHeight({ step: 'Fix roof sheeting', hazards: ['Manual handling.'] }), true);
  assert.equal(atHeight({ step: 'Work on or near energised parts', hazards: ['Electric shock and arc flash from exposed energised parts within 3 m.'] }), false);
  assert.equal(atHeight({ step: 'Work under the crane', hazards: ['Dropped tools from height strike workers below.'] }), false);
});

test('D266: with a harness for particular steps, only steps at height get the harness line, each with a rated anchor line', () => {
  const input = answered({ ...ANSWERED, state: 'qld', fallRisk: 'yes', task: 'Install roof sheeting and gutters with travel restraint harnesses to anchors, and fix flashings' });
  const d = draft(input);
  assert.equal(d.kind, 'draft');
  const anchor = /\b(anchor\w*)\b[^.]{0,80}\b(rated|platform|ewp)\b|\b(rated|platform|ewp)\b[^.]{0,80}\banchor/i;
  assert.ok(d.jobSteps.some((step) => (step.ppeLines || []).some((line) => /^Wear a full body harness/.test(line))));
  assert.ok(d.jobSteps.some((step) => (step.ppeLines || []).some((line) => /^Anchors are rated for at least 15 kN/.test(line))));
  for (const step of d.jobSteps) {
    const harness = (step.ppeLines || []).some((line) => /\bharness\b/.test(line));
    if (!harness) continue;
    assert.ok(atHeight(step), `${step.step} is at height`);
    assert.ok(step.controls.some((line) => anchor.test(line)), `${step.step} has an anchor line`);
  }
  // The builder check finds a rated anchor for the harness.
  const r = checkSwms(fromDraft(d, { state: 'qld', swms: { signatures: [{ name: 'Jo Smith' }] } }), { state: 'qld' });
  const w13 = r.findings.find((f) => f.rule === 'W13');
  assert.doesNotMatch(w13.message || '', /anchor point for each harness/);
});

// ---- D258: who slings the loads and directs a crane company's crane ----

test('D258: the dogging or rigging licence prints only for our crew, or where our company runs the crane', () => {
  const task = 'Crane lift formwork, reinforcement and stair forms onto the slab. Install formwork to suspended slabs and fix reinforcement.';
  const licences = (extra) => {
    const d = draft(answered({ ...ANSWERED, state: 'qld', fallRisk: 'no', task, ...extra }));
    assert.equal(d.kind, 'draft');
    return { d, dogging: d.qualifications.some((name) => /dogging or rigging/.test(name)) };
  };
  assert.equal(licences({ crane: 'company', slinging: 'crane' }).dogging, false);
  assert.equal(licences({ crane: 'company' }).dogging, false);
  const ours = licences({ crane: 'company', slinging: 'ours' });
  assert.equal(ours.dogging, true);
  // The steps then say our crew slings, not the crane crew.
  const lines = ours.d.jobSteps.flatMap((step) => step.controls).join('\n');
  assert.match(lines, /Our licensed doggers or riggers sling, direct and release the loads\./);
  assert.doesNotMatch(lines, /Its licensed crew slings/);
  assert.match(ours.d.controls.map((item) => item.text).join('\n'), /Our licensed doggers or riggers sling the loads and direct the crane\./);
  // Only "crane" or "ours" is taken.
  assert.equal(draftBody({ slinging: 'ours' }).slinging, 'ours');
  assert.equal(draftBody({ slinging: 'Dave' }).slinging, '');
});

test('crane question: "You answered" only after a real answer', () => {
  const none = choice.cranageOffer('', null);
  assert.equal(none.ticked, false);
  assert.doesNotMatch(none.note, /You answered/);
  assert.match(none.note, /Answer the crane question above/);
  assert.doesNotMatch(choice.cranageOffer('', { clause: '4.1', quote: 'The subcontractor supplies all cranage.' }).note, /You answered/);
  assert.match(choice.cranageOffer('company', null).note, /You answered that a crane company operates the crane/);
  assert.equal(JSON.stringify(choice.projectItems({ activities: [{ activity: 'Lift', package: 'Plant lifting and cranage', type: 'Site work', quotes: [] }], packages: [] }, ['Plant lifting and cranage'], { crane: 'company', slinging: 'ours' }).map((item) => [item.crane, item.slinging])), JSON.stringify([['company', 'ours']]));
});

// ---- D259: emergency questions name roles, with standard answers ----

test('D259: each emergency question has standard answers that name roles, not people', () => {
  const lower = emergency.QUESTIONS.find((item) => item.id === 'ewpLower');
  assert.equal(lower.suggestions[0].text, 'The spotter on the ground. Before use, the operator and spotter agree clear roles: who lowers the platform, who stops the plant and who calls for help.');
  assert.match(lower.hint, /Name the role, not the person/);
  assert.match(emergency.QUESTIONS.find((item) => item.id === 'ewpControls').suggestions[0].label, /^Example/);
  for (const item of emergency.QUESTIONS) {
    assert.ok(item.suggestions.length, item.id);
    for (const pick of item.suggestions) {
      // Each passes the gate's own check, and names no person.
      assert.equal(answerNeed({ ask: item.ask, emergency: true, involves: 'x', rescue: item.rescue, kit: item.kit }, pick.text), '', `${item.id}: ${pick.label}`);
      assert.doesNotMatch(pick.text, /\b(?:Dave|Larry|Sam)\b/);
    }
  }
  // The page gets them with each question.
  const d = draft(answered({ ...ANSWERED, state: 'qld', fallRisk: 'yes', task: 'Install cable trays in the ward ceilings from scissor lifts.' }));
  assert.ok((d.emergencyQuestions || []).every((item) => Array.isArray(item.suggestions) && item.suggestions.length));
});

// ---- Weak answers (messy-user test, 14 October 2026) ----

test('weak answers are refused with what is missing; role answers pass', () => {
  const rescue = { ask: 'Who rescues?', emergency: true, involves: 'a risk of a fall from height', rescue: true };
  const kit = { ask: 'What rescue equipment?', emergency: true, involves: 'a fall', kit: true };
  assert.match(answerNeed(rescue, 'call 000'), /only calls for help\. Say who rescues the person and how, before emergency services arrive\./);
  assert.match(answerNeed(rescue, 'Call 000 and wait for the ambulance'), /only calls for help/);
  assert.match(answerNeed(kit, 'first aid kit'), /first aid, not rescue equipment/);
  assert.match(answerNeed(rescue, 'me'), /does not say who/);
  assert.match(answerNeed(rescue, 'builder'), /too short to act on/);
  assert.match(answerNeed(rescue, 'gate'), /too short to act on/);
  for (const text of ['dont know', "don't know", 'unknown', 'Not sure']) assert.match(answerNeed(rescue, text), /is not an answer yet/, text);
  assert.match(answerNeed(rescue, 'as per site'), /does not say what is done/);
  assert.match(answerNeed({ ask: 'Name the first aider.', name: 'First aider' }, 'me'), /does not say who/);
  assert.match(answerNeed({ ask: 'Say what.', name: 'x' }, 'as per eng'), /does not say what is done/);
  // Fair: role answers and answers that say how pass.
  for (const text of ['The spotter on the ground', 'The spotter lowers the platform and calls 000', 'Rescue pole and first aid kit at the work']) assert.equal(answerNeed(text.includes('kit') ? kit : rescue, text), '', text);
  assert.equal(answerNeed({ ask: 'x', name: 'First aider' }, 'Jo Smith'), '');
});

// ---- D254, D255: a hazard the user adds ----

const PAVERS = { ...ANSWERED, state: 'qld', fallRisk: 'no', crane: 'none', task: 'Lay pavers to the courtyard' };
const BOGGY = 'ground onsite is very boggy, walking around site can be dangerous';

test('D254: a hazard the user adds is offered sourced library lines that match its words', () => {
  const offers = offersFor(BOGGY, 'qld');
  assert.ok(offers.length >= 1);
  assert.ok(offers.some((item) => /slip resistant footwear/.test(item.text)));
  // Only lines with a source are offered, printed with the state's citation where it has one.
  const { ACTIVITIES } = require('../activities');
  const sourced = new Set(ACTIVITIES.flatMap((a) => a.steps.flatMap((s) => s.controls.filter((c) => c && typeof c === 'object' && c.source).map((c) => c.text))));
  for (const item of offers) assert.ok(sourced.has(item.key), item.key);
  // Words the library does not share with the hazard bring nothing.
  assert.deepEqual(offersFor('wasps nest in the roof space', 'qld'), []);
});

test('D254, D255: its controls print, it needs one before download, and the step shows the higher rating', () => {
  const first = draft(PAVERS);
  const step = first.jobSteps[1].step;
  const added = { ...PAVERS, hazardEdits: { [step]: { changed: [], added: [BOGGY], notApplicable: [] } } };
  const d = draft(added);
  assert.equal(d.ownHazards.length, 1);
  assert.equal(d.ownHazards[0].need, true);
  const gap = downloadGaps({ ...added, notCoveredConfirmed: d.notCovered }, d).find((item) => item.kind === 'own');
  assert.equal(gap.label, `Your hazard: ${BOGGY}`);
  assert.match(gap.need, /Add at least one control for your hazard "ground onsite is very boggy/);
  // Ticked and written controls print in the step; the written one is marked as the user's own.
  const key = d.ownHazards[0].offers.find((item) => /slip resistant/.test(item.text)).key;
  const own = { [BOGGY]: { controls: [key, 'Not a library line at all.'], written: ['Duckboards are laid over the wet areas.'], before: { likelihood: 5, consequence: 4 }, after: { likelihood: 3, consequence: 3 } } };
  const chosen = { ...PAVERS, hazardEdits: { [step]: { changed: [], added: [BOGGY], notApplicable: [], own } } };
  const done = draft(chosen);
  const printed = done.jobSteps[1];
  assert.ok(printed.controls.some((line) => line.startsWith(key)));
  assert.ok(printed.controls.includes('Duckboards are laid over the wet areas. (Our own control)'));
  assert.ok(!printed.controls.some((line) => /Not a library line/.test(line)));
  assert.equal(done.ownHazards[0].need, false);
  assert.equal(downloadGaps({ ...chosen, notCoveredConfirmed: done.notCovered }, done).filter((item) => item.kind === 'own').length, 0);
  // Before: Almost certain x Major is Extreme, higher than the step's own; after: the higher of the two.
  assert.equal(printed.risk.before.level, 'Extreme');
  assert.equal(printed.risk.before.label, 'Almost certain x Major');
  assert.ok(['Moderate', 'High', 'Extreme'].includes(printed.risk.after.level));
  // The changes are kept for learning: the library line by SiteWrite's words, the written line as written.
  const applied = done.controlEdits.applied.filter((item) => item.kind === 'hazardControl');
  assert.deepEqual(applied.map((item) => [item.from, item.to]), [[key, ''], ['', 'Duckboards are laid over the wet areas.']]);
  assert.ok(done.controlEdits.applied.some((item) => item.kind === 'hazardRated'));
  // A rating out of range is not taken.
  assert.equal(draftBody({ hazardEdits: { [step]: { added: [BOGGY], own: { [BOGGY]: { before: { likelihood: 9, consequence: 1 } } } } } }).hazardEdits[step].own[BOGGY].before, undefined);
});

// ---- D261: each blank in an answer gets a label ----

test('D261: each blank in a standard answer is labelled from the words around it', () => {
  assert.deepEqual(fill.blankLabels(answersFor('formworkDesign', '').find((item) => item.label === 'Engineer\'s design').text), ['design number', 'revision', 'who signs off']);
  assert.deepEqual(fill.blankLabels('Loads are placed only in the areas marked on the structural engineer\'s drawing ____ (____ kPa), checked by ____ before loading starts.'), ['drawing number', 'load limit (kPa)', 'who checks']);
  assert.deepEqual(fill.blankLabels('Tested with water to ____ kPa, with the area barricaded'), ['test pressure (kPa)']);
  assert.deepEqual(fill.blankLabels('inspected and tested by ____ (licensed electrician) before first use'), ['who tests (licensed electrician)']);
  // Every blank of every standard answer gets a label.
  const { ACTIVITIES: _a } = require('../activities');
  const fs = require('fs');
  const source = fs.readFileSync(require.resolve('../presets'), 'utf8');
  for (const match of source.matchAll(/'((?:[^'\\]|\\.)*____(?:[^'\\]|\\.)*)'/g)) {
    const text = match[1].replace(/\\'/g, '\'');
    if (/^\s*\/\//.test(text)) continue;
    for (const label of fill.blankLabels(text)) assert.ok(label && label.length <= 40, `${label} in ${text.slice(0, 60)}`);
  }
});

// ---- D262: learning from these answers ----

test('D262: answers keep their wording and ratings, without names, businesses or document numbers', () => {
  assert.equal(deidentifyAnswer('Loads are placed only in the areas marked on the structural engineer\'s drawing S-101 (5 kPa), checked by Jo Bloggs before loading starts.'),
    'Loads are placed only in the areas marked on the structural engineer\'s drawing [number] (5 kPa), checked by [name] before loading starts.');
  const crane = deidentifyAnswer('The set-up area was assessed by geotechnical engineer Peter Jones (report 23-4567, revision 2): allowable bearing pressure 200 kPa. The crane sets up on mats of 1.2 m x 1.2 m.');
  assert.match(crane, /report \[number\], revision \[number\]/);
  assert.match(crane, /200 kPa/);
  assert.match(crane, /1\.2 m x 1\.2 m/);
  assert.doesNotMatch(crane, /Peter|Jones|23-4567/);
  assert.match(deidentifyAnswer('anchors rated for at least 15 kN, every 6 months, 2.4 m high, 500 kg'), /15 kN, every 6 months, 2\.4 m high, 500 kg/);
  assert.doesNotMatch(deidentifyAnswer('to design FW-S-201 rev C'), /FW-S-201/);
  // Only the questions whose standard answers have blanks are kept, with the standard answer used.
  const text = answersFor('formworkDesign', '').find((item) => item.label === 'Engineer\'s design').text.replace('____', 'FW-1').replace('____', 'C').replace('____', 'the formwork supervisor');
  const kept = blankAnswers({ state: 'qld', fallRisk: 'yes', task: 'Supply and install formwork and propping to suspended slabs', facts: { formworkDesign: text, fallControl: 'Edge protection is installed around every open edge before work starts, and no one works outside it.', craneChart: 'Not asked here: ____ t.' } });
  assert.deepEqual(kept.map((item) => [item.question, item.standard]), [['formworkDesign', 'Engineer\'s design']]);
  assert.equal(blankAnswers({ facts: { formworkDesign: 'Our own words about the design.' } })[0].standard, '');
});

// ---- The page: what it draws (the browser test drives it, tools/e2e-draftfixes.js) ----

test('the page: Change and Remove on hazards, one-line ratings, the hazard\'s own panel, emergency standard answers, masses', async () => {
  const { loadPage, settle } = require('./fake-dom');
  const first = draft(PAVERS);
  const step = first.jobSteps[1].step;
  const input = { ...PAVERS, hazardEdits: { [step]: { changed: [], added: [BOGGY], notApplicable: [] } } };
  const d = { ...draft(input), gate: [] };
  const p = loadPage(['gate-rules.js', 'design-fill.js', 'mass.js', 'app.js'], () => ({ body: {} }));
  await settle();
  const html = p.window.SiteWrite.render(d, { movable: true });
  // D253: SiteWrite's own hazard and the user's both have Change and Remove; no "Does not apply" button.
  assert.match(html, /data-hz-line="0">[^<]*<span class="ctl-tools"><button type="button" class="link" data-hz="change">Change<\/button><button type="button" class="link" data-hz="remove">Remove<\/button>/);
  assert.doesNotMatch(html, /data-hz="na"/);
  // D260: the steps table, and each rating on one line.
  assert.match(html, /<table class="stack steps-table">/);
  assert.match(html, /<span class="risk-line">Before: <strong>\w+<\/strong> \([A-Za-z ]+ x [A-Za-z]+\)<\/span><span class="risk-line">After: /);
  // D254, D255: the hazard's panel under its step: offers to tick, a box to write one, its rating.
  assert.match(html, /<tr class="own-hazard-row"><td colspan="5" data-label="Your own hazard"><div class="own-hazard" id="own-hazard-1"/);
  assert.match(html, /Lines from SiteWrite&#39;s library that may fit\. Tick only those that do\.|Lines from SiteWrite's library that may fit\. Tick only those that do\./);
  assert.match(html, /data-oh-offer="0"/);
  assert.match(html, /<label for="own-hazard-1-write">Write your own control<\/label>/);
  assert.match(html, /Before controls:[^]*data-oh-part="likelihood"[^]*After controls:/);
  assert.match(html, /Its controls and rating are <a href="#own-hazard-1" data-oh-jump="1">below this step<\/a>\./);
  // D259 and item 25: the emergency questions' standard answers, and the note, hidden until the draft is updated.
  const ewp = { ...draft(answered({ ...ANSWERED, state: 'qld', fallRisk: 'yes', task: 'Install cable trays in the ward ceilings from scissor lifts.' })), gate: [] };
  const sheet = p.window.SiteWrite.render(ewp, { movable: true });
  assert.match(sheet, /data-emg-pick="ewpLower" data-pick="0" aria-pressed="false">The spotter<\/button>/);
  assert.match(sheet, /<p class="done-note" id="emergency-done" role="status" hidden>Draft updated\. Your answers are in the Emergency arrangements table above\. <button type="button" class="link" data-emergency-show>Show me<\/button><\/p>/);
  assert.match(sheet, /<h4 id="emergency-table" tabindex="-1">Emergency arrangements<\/h4>/);
  // D263: a rating in the sheet's text prints with its mass; the same words in an attribute do not change.
  const anchors = p.window.SiteWrite.render({ ...ewp, jobSteps: ewp.jobSteps.map((s, i) => (i === 1 ? { ...s, controls: [...s.controls, 'Anchors are rated for at least 15 kN.'] } : s)) }, { movable: true });
  assert.match(anchors, />Anchors are rated for at least 15 kN \(about 1\.5 tonnes\)\.</);
});

test('the page: an answer with blanks shows as its sentence with labelled boxes, and the box is the record', async () => {
  const { loadPage, settle } = require('./fake-dom');
  const p = loadPage(['gate-rules.js', 'design-fill.js', 'mass.js', 'app.js'], () => ({ body: {} }));
  await settle();
  const template = 'Loads are placed only in the areas marked on the structural engineer\'s drawing ____ (____ kPa), checked by ____ before loading starts.';
  assert.equal(JSON.stringify(p.run(`blankValues(${JSON.stringify(template)}, ${JSON.stringify(template.replace('____', 'S-101'))})`)), JSON.stringify(['S-101', '', '']));
  assert.equal(p.run(`blankText(${JSON.stringify(template)}, ['S-101', '5', 'the leading hand'])`), 'Loads are placed only in the areas marked on the structural engineer\'s drawing S-101 (5 kPa), checked by the leading hand before loading starts.');
  assert.equal(p.run(`blankText(${JSON.stringify(template)}, ['S-101', '', ''])`), template.replace('____', 'S-101'));
  // Words changed outside the blanks: no longer the sentence, so the plain box shows.
  assert.equal(p.run(`blankValues(${JSON.stringify(template)}, 'Our own words.')`), null);
});
