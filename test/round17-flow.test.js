// Messy test round 17 (23 October 2026, staging), flow faults: a slinging line the answer did not change, a Public interface
// answer that made indoor work road work, the page empty after a download, typed words and place names as typed, weak answers
// that passed, the state and the address, the fuel reason, the plant note, the crane ground answer and the hospital list. The
// page faults are also run in a browser (scratchpad/flow18).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prepareDraft, questionsFor, answerState } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps, gateChecks } = require('../download-gate');
const gate = require('../public/gate-rules');
const nameCase = require('../sitelink-answers');
const rules = require('../public/substance-rules');
const places = require('../places');
const { answersFor } = require('../presets');
const { ANSWERED, ready } = require('./helpers');
const { loadPage, settle } = require('./fake-dom');

// Every question answered, with SiteWrite's own answer where it has one, then the plant and emergency (ready).
function answered(input) {
  let out = { ...input, facts: { ...(input.facts || {}) } };
  for (let pass = 0; pass < 4; pass += 1) {
    for (const item of questionsFor(draftBody(out)).required || []) {
      if (out.facts[item.id]) continue;
      if (item.choices) { out.facts[item.id] = item.default || (item.choices[0] && (item.choices[0].value || item.choices[0].id)); continue; }
      const pick = (item.suggestions || answersFor(item.id, input.task) || []).find((one) => !/_{3,}/.test(one.text));
      out.facts[item.id] = pick ? pick.text : 'Our supervisor checks it each day before work starts, and the records are kept in the site folder.';
    }
    out = ready(out);
  }
  return out;
}
const draftOf = (input) => prepareDraft(draftBody(answered({ ...ANSWERED, ...input })));
const allLines = (draft) => [...(draft.controls || []).map((item) => item.text || item), ...(draft.jobSteps || []).flatMap((step) => [...step.hazards, ...step.controls])].filter((line) => typeof line === 'string');
const page = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');

// ---- 1. The slinging answer drives the lines that depend on it ----

const BRIDGE = 'replace the timbr deck n handrails on the pedestrain bridge over the lake at emu bank. pull up old deck boards and cut out rotten stringers. crane in 2 new steel beams (50t crane from the crane hire mob). jackhammer the old abutment capping. form n pour a new capping beam. new deck n handrails. work over the water off a barge and from the bank.';

test('"Crane company\'s dogman" takes off "Our licensed riggers sling and direct the steel", and "Our crew" puts it back', () => {
  // B run 7: the line printed after "Crane company's dogman", in both revisions, and changing the answer did not change it.
  const base = { workplace: '40 Emu Bank, Belconnen ACT 2617', state: 'act', task: BRIDGE, fallRisk: 'yes', crane: 'company' };
  const theirs = allLines(draftOf({ ...base, slinging: 'crane' }));
  assert.ok(!theirs.some((line) => /Our licensed riggers sling/.test(line)), theirs.filter((line) => /sling/i.test(line)).join(' | '));
  assert.ok(theirs.some((line) => /Our workers follow the crane crew's directions\./.test(line)));
  const ours = allLines(draftOf({ ...base, slinging: 'ours' }));
  assert.ok(ours.some((line) => /Our licensed riggers sling and direct the steel\./.test(line)));
  // The steel erector's own lift step says the crane crew slings where its dogman does.
  const steel = { state: 'nsw', task: 'Erect the structural steel portal frames with the crane company\'s 60t crane.', fallRisk: 'yes', crane: 'company', kinds: ['steelLift', 'steelErect', 'ewp'] };
  const crew = allLines(draftOf({ ...steel, slinging: 'crane' }));
  assert.ok(crew.some((line) => /Its licensed crew slings, directs, lands and releases the steel\./.test(line)), crew.filter((line) => /steel\./.test(line)).join(' | '));
  assert.ok(!crew.some((line) => /Our licensed riggers sling, direct, land and release the steel/.test(line)));
  assert.ok(allLines(draftOf({ ...steel, slinging: 'ours' })).some((line) => /Our licensed riggers sling, direct, land and release the steel\./.test(line)));
});

// ---- 2. A Public interface answer about the public kept away brings no high risk work, and "None" with a reason passes ----

const JOINERY = 'Shop draw, fabricate, supply, deliver, install and certify all front of house joinery items: bathroom joinery, the main bar, library shelving, restaurant servery areas and the day spa front desk. All materials handling will be by the Subcontractor.';
const HOTEL_SITE = {
  liveServices: 'Lighting and power circuits in the bar walls, made safe by the electrician before we fix to those walls.',
  otherTrades: 'Painters, tilers and electricians on the same floors.',
  ground: 'Finished tiled floors, protected with hardboard.',
  access: 'Joinery comes in through the loading dock off Davey Street on our trolleys and the builder\'s goods lift.',
};

test('"None" with how the public is kept away passes, and an Access answer\'s street is the way in, not a public way', () => {
  // B run 6: "None. The hotel is closed ..." was refused because the Access answer names "Street".
  const input = answered({ ...ANSWERED, workplace: '21 Davey Street, Hobart TAS 7000', state: 'tas', task: JOINERY, fallRisk: 'no', crane: 'none', site: { ...HOTEL_SITE, publicInterface: 'None. The hotel is closed for the fit-out and the site is fenced off from Davey Street.' } });
  const gaps = downloadGaps(draftBody(input), prepareDraft(draftBody(input)));
  assert.ok(!gaps.some((gap) => gap.id === 'site.publicInterface'), JSON.stringify(gaps.map((gap) => gap.need)));
  // "None" with no reason, where the task names the street, is still refused, with an example that fits.
  const street = answered({ ...ANSWERED, state: 'tas', task: 'Replace the shop front windows facing Davey Street.', fallRisk: 'no', crane: 'none', site: { ...HOTEL_SITE, publicInterface: 'None' } });
  const refused = gateChecks(draftBody(street), prepareDraft(draftBody(street))).find((gap) => gap.id === 'site.publicInterface' && gap.need);
  assert.ok(refused);
  assert.match(refused.need, /names "Street", so the public or traffic is near the work/);
  assert.doesNotMatch(refused.need, /frames come out/);
  assert.match(gate.answerNeed(refused.rule, 'None. The shop is closed and the footpath is fenced off.'), /^$/);
  assert.match(gate.answerNeed(refused.rule, 'none'), /near the work/);
  assert.match(gate.answerNeed(refused.rule, 'None, we just get on with it.'), /near the work/);
});

test('a Public interface answer that says how the public is kept away makes no indoor work road or mobile plant work', () => {
  // B run 6: the fuller answer added road traffic and powered mobile plant "(from your Public interface answer)".
  const fuller = 'No public inside the site. The hotel is closed for the fit-out and fenced off from Davey Street. Our deliveries are unloaded inside the fenced loading dock, with the dock gate shut while the truck is unloaded, so nothing is carried across the footpath.';
  const draft = draftOf({ workplace: '21 Davey Street, Hobart TAS 7000', state: 'tas', task: JOINERY, fallRisk: 'no', crane: 'none', site: { ...HOTEL_SITE, publicInterface: fuller } });
  assert.deepEqual(draft.highRisk, [], JSON.stringify(draft.highRiskFrom));
  assert.ok(!allLines(draft).some((line) => /People stay clear of moving plant\./.test(line)));
  // Traffic at the work still counts.
  const road = draftOf({ state: 'tas', task: 'Install the new bus shelter footings on the verge.', fallRisk: 'no', crane: 'none', site: { ...HOTEL_SITE, access: 'From the verge.', publicInterface: 'Traffic passes both ways in the open lane beside the work, fenced off with barriers.' } });
  assert.ok(road.highRisk.some((label) => /road, railway, shipping lane/.test(label)), road.highRisk.join(' | '));
});

test('"None" for Public interface is refused on a public bridge path and beside a crane or hiab lift', () => {
  // B run 7: Public "none" passed for a pedestrian bridge. A run 4: "none" passed beside hiab lifts.
  const bridge = answered({ ...ANSWERED, workplace: '40 Emu Bank, Belconnen ACT 2617', state: 'act', task: BRIDGE, fallRisk: 'yes', crane: 'company', slinging: 'crane' });
  const gap = downloadGaps(draftBody(bridge), prepareDraft(draftBody(bridge))).find((one) => one.id === 'site.publicInterface');
  assert.ok(gap);
  assert.match(gap.need, /names "pedestrain bridge", so the public or traffic is near the work\. Say how the public and traffic are kept clear of the work, for example "Path closed/);
  const hiab = answered({ ...ANSWERED, workplace: '9 Marine Terrace, Fremantle WA 6160', state: 'wa', task: 'Install the pool filtration plant and dosing in the plant room. Pumps and filters are lifted into the plant room off the hiab truck.', fallRisk: 'no', crane: 'own', facts: { craneChart: '1.2 t at 5 m from the hiab chart', groundBearing: 'The builder\'s site manager checked the driveway slab can take the outriggers, timber pads under each leg.' } });
  const lift = gateChecks(draftBody(hiab), prepareDraft(draftBody(hiab))).find((one) => one.id === 'site.publicInterface' && one.need);
  assert.ok(lift, 'refused beside the hiab lift');
  assert.match(lift.need, /lifts loads, so the lift area must be kept clear of the public/);
  assert.equal(gate.answerNeed(lift.rule, 'None. The lift area is inside the site fence, no public access.'), '');
});

// ---- 3. The work comes back after a download ----

test('after a download the work stays on the device as the saved SWMS and comes back with a note that says so', async () => {
  // B, all runs: a reload or the home page showed an empty form after a download.
  const p = loadPage(['app.js'], () => ({ body: {} }));
  await settle();
  p.document.getElementById('task').value = 'Install the joinery in the hotel bar.';
  p.document.getElementById('workplace').value = '21 Davey Street, Hobart TAS 7000';
  p.run('window.SiteWrite.editing = { id: "s1", title: "Install the joinery in the hotel bar", revision: 2 }');
  p.run('window.SiteWrite.unsavedDownloaded()');
  const kept = JSON.parse(p.window.localStorage.getItem('sitewrite.unsaved'));
  assert.equal(kept.downloaded, JSON.stringify(kept.input));
  assert.equal(kept.editing.id, 's1');
  const again = loadPage(['app.js'], () => ({ body: {} }), { stored: { 'sitewrite.unsaved': p.window.localStorage.getItem('sitewrite.unsaved') } });
  await settle();
  let said = '';
  const catchNote = (node) => { said = node.innerHTML; };
  ['start', 'job-details', 'facts', 'result'].forEach((id) => { const el = again.document.getElementById(id); if (el) el.before = catchNote; });
  assert.equal(await again.run('restoreUnsaved()'), true);
  assert.equal(again.document.getElementById('task').value, 'Install the joinery in the hotel bar.');
  assert.match(said, /^Your work is back as you left it\. It is saved under My SWMS as "Install the joinery in the hotel bar", revision 2\./);
  assert.doesNotMatch(said, /not saved yet/);
  // The account's download and Save keep it, as the saved SWMS, rather than clearing it.
  const account = page('account.js');
  assert.match(account, /the work stays on this device, marked as the saved SWMS[\s\S]{0,300}if \(S\.unsavedDownloaded\) S\.unsavedDownloaded\(\); else if \(S\.clearUnsaved\) S\.clearUnsaved\(\);/);
  assert.match(account, /Saved: the work stays on this device as the saved SWMS[^\n]*\n\s*if \(S\.unsavedDownloaded\) S\.unsavedDownloaded\(\); else if \(S\.clearUnsaved\) S\.clearUnsaved\(\);/);
  // Signing out still clears it.
  assert.match(account, /event\.target\.id === 'sign-out'[\s\S]{0,400}if \(S\.clearUnsaved\) S\.clearUnsaved\(\);/);
});

// ---- 4. Typed words, company names and place names as they print ----

test('a lone "n" in a company name reads "and"; "N" and "\'n\'" are kept', () => {
  // A run 4 and B run 7: "Coogee Pools n Spas", "Yerrabi Bridge n Civil Pty Ltd" in the header, footers and review email.
  assert.equal(nameCase.tidyCompany('coogee pools n spas'), 'Coogee Pools and Spas');
  assert.equal(nameCase.tidyCompany('yerrabi bridge n civil pty ltd'), 'Yerrabi Bridge and Civil Pty Ltd');
  assert.equal(nameCase.tidyCompany('Coogee Pools n Spas'), 'Coogee Pools and Spas');
  assert.equal(nameCase.tidyCompany('Rock N Roll Plumbing'), 'Rock N Roll Plumbing');
  assert.equal(nameCase.tidyCompany('rock \'n\' roll plumbing'), 'Rock \'n\' Roll Plumbing');
  const draft = draftOf({ company: 'coogee pools n spas', state: 'wa', task: 'Lay the pool tiles.', fallRisk: 'no', crane: 'none' });
  assert.equal(draft.subcontractor, 'Coogee Pools and Spas');
  assert.match(page('list.js'), /A lone lower-case "n" reads "and", as on the SWMS/);
});

test('words typed short print in full in site answers, documents, own step titles and the task line', async () => {
  // A runs 2 and 4: "isolated by the sparky b4 we connect", "pool db", "Thru the gate", "Undergrnd ... b4 digging", "upto 1.8m".
  assert.equal(nameCase.hurried('Undergrnd services to be located b4 digging, upto 1.8m deep. Thru the gate. Isolated by the sparky at the pool db.'), 'Underground services to be located before digging, up to 1.8m deep. Through the gate. Isolated by the electrician at the pool distribution board.');
  // B run 7: "throw line at on the barge".
  assert.equal(nameCase.hurried('life ring and throw line at on the barge'), 'life ring and throw line on the barge');
  const draft = draftOf({ state: 'wa', task: 'Install the pool filtration plant in the plant room.', fallRisk: 'no', crane: 'none', site: { ...ANSWERED.site, liveServices: 'plant room power from the pool db, isolated by the sparky b4 we connect', access: 'thru the gate' }, facts: { safetyDataSheet: 'chlorine n acid, gloves n goggles, sds in the ute' } });
  const site = Object.fromEntries((draft.site || []).map((row) => [row.id, row.text]));
  assert.equal(site.liveServices, 'Plant room power from the pool distribution board, isolated by the electrician before we connect');
  assert.equal(site.access, 'Through the gate');
  const sds = (draft.references || []).find((row) => /safety data/i.test(row.label));
  assert.equal(sds && sds.text, 'Chlorine and acid, gloves and goggles, SDS in the ute');
  // An own step's title (A run 2: "... foam b4 pour").
  const p = loadPage(['app.js'], () => ({ body: {} }));
  await settle();
  assert.equal(p.run('stepTitle("drill n epoxy dowels, fit expansion joint foam b4 pour")'), 'Drill and epoxy dowels, fit expansion joint foam before pour');
});

test('the places the SWMS names take their capitals in the task, the muster point and a reviewer\'s conditions', () => {
  // B runs 7 and 8: "emu bank", "temple tce"; A run 4 and B run 7: "fiona stanley hospital", "University of canberra hospital".
  const draft = draftOf({ workplace: '40 Emu Bank, Belconnen ACT 2617', hospital: 'University of Canberra Hospital', musterPoint: 'car park at emu bank, by the boat ramp', state: 'act', task: 'replace the deck boards on the footbridge at emu bank', fallRisk: 'yes', crane: 'none' });
  assert.match(draft.task, /at Emu Bank/);
  assert.equal(draft.musterPoint, 'Car park at Emu Bank, by the boat ramp');
  const nt = draftOf({ workplace: '10 Temple Terrace, Palmerston City NT 0830', state: 'nt', residential: 'no', task: 'plant 6 advanced trees out the front of the shops on temple tce', fallRisk: 'no', crane: 'none' });
  assert.match(nt.task, /on Temple Tce/);
  // The saved title too (My SWMS, the file names).
  assert.equal(require('../accounts').titleFor({}, { task: 'replace the deck boards on the footbridge at emu bank', workplace: '40 Emu Bank, Belconnen ACT 2617' }), 'Replace the deck boards on the footbridge at Emu Bank');
  const places17 = nameCase.placeNames(['9 Marine Terrace, Fremantle WA 6160', 'Fiona Stanley Hospital, Emergency Department']);
  assert.equal(nameCase.tidyLines('fiona stanley hospital is the one to use\ncraig dunn to sign off b4 start\nuse north canberra hospital ED', [], ['Craig Dunn'], places17), 'Fiona Stanley Hospital is the one to use\nCraig Dunn to sign off before start\nUse north Canberra hospital ED');
  // The review route tidies the conditions with the SWMS's own people and places.
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'reviews.js'), 'utf8'), /tidyLines\(typedText, \[\], tidy\.personNames\(/);
});

test('a product\'s name prints "and" for "n" in its step line and where another SWMS offers it', () => {
  // A runs 2 and 4: "pool screed n grout" in a step line, "Use Form oil n curing compound (from SWMS 2)".
  const line = rules.stepLine({ type: 'Cement, concrete, grout and mortar', product: 'pool screed n grout', controls: ['gloves n mask'], sdsDate: '2025-01-01' });
  assert.match(line, /\(pool screed and grout\): gloves and mask; see its safety data sheet\.$/);
  assert.match(page('substances.js'), /Use \$\{esc\(R\.tableLine \? R\.tableLine\(row\.product\) : row\.product\)\} \(from \$\{esc\(from\)\}\)/);
});

// ---- 5. Weak answers ----

test('"life jackets on", a ladder beside a harness rescue, the operator alone, "to follow" and "services trades" are refused', () => {
  // B run 7: "life jackets on" printed as a control.
  assert.equal(answerState('lifeJacketDetails', 'life jackets on', 'act'), 'vague');
  assert.equal(answerState('lifeJacketDetails', 'Level 150 inflatable life jackets within 3 m of the edge, checked before use; life ring and throw line on the barge.', 'act'), 'supplied');
  for (const [, text] of answersFor('lifeJacketDetails').map((one) => [one.label, one.text.replace(/_{3,}/g, '3')])) assert.equal(answerState('lifeJacketDetails', text, 'act'), 'supplied');
  // A run 2: "ladder at the trench" beside a rescue by "harness and line from the top".
  const trench = answered({ ...ANSWERED, state: 'vic', task: 'Excavate a 1.8 m deep trench with our excavator and lay the stormwater pipe.', fallRisk: 'no', crane: 'none' });
  const withRescue = { ...trench, emergency: { ...trench.emergency, trenchRescue: 'Lifted out from the top with the harness and line by the crew at the trench.', trenchKit: 'ladder at the trench' } };
  const kit = gateChecks(draftBody(withRescue), prepareDraft(draftBody(withRescue))).find((gap) => gap.id === 'emergency.trenchKit' && gap.need);
  assert.ok(kit, 'the ladder alone is refused');
  assert.match(kit.need, /does not have the harness your rescue answer uses/);
  assert.equal(gate.answerNeed(kit.rule, 'Ladder in the trench, harness and line at the trench box.'), '');
  // A runs 2 and 4: the operator alone as who stops the plant.
  const stop = { ask: 'Say where the stop is and which role stops it.', emergency: true, involves: 'plant', role: true, stop: true };
  assert.match(gate.answerNeed(stop, 'operator turns it off'), /names only the operator/);
  // The operator at a named stop passes, as round 3 decided (decision 5).
  assert.equal(gate.answerNeed(stop, 'Hiab operator hits the e stop on the remote'), '');
  assert.equal(gate.answerNeed(stop, 'The hiab operator, or the spotter with the e stop on the remote.'), '');
  const standard = require('../emergency').QUESTIONS.find((item) => item.id === 'plantStop').suggestions[0].text;
  assert.equal(gate.answerNeed(stop, standard), '');
  // A run 2: "to follow" as the soil report number.
  assert.match(gate.blankFillNeed('to follow'), /is not an answer/);
  assert.equal(gate.blankFillNeed('GT-2291'), '');
  // A run 2: the scope chip "Coordination with services trades." as Other trades.
  assert.match(gate.fieldWeak('trades', 'Coordination with services trades.'), /does not say which trades/);
  assert.equal(gate.fieldWeak('trades', 'Electrical services trades on level 2'), '');
  // "undergrnd services" names underground services, typed short (browser run C).
  assert.equal(gate.fieldWeak('services', 'undergrnd services located b4 digging'), '');
});

test('a shared site answer one SWMS of a project refuses is refused at the shared box', () => {
  // A run 4: "none" for live services passed in the pool finishes SWMS and was refused in the plant room SWMS.
  const go = page('project-go.js');
  assert.match(go, /item\.siteRules = draft\.kind === 'draft' \? Object\.fromEntries\(\(draft\.gate \|\| \[\]\)\.filter\(\(gap\) => gap\.kind === 'site' && gap\.rule && gap\.rule\.noneRefused\)/);
  assert.match(go, /noneRefused: `In SWMS \$\{at \+ 1\} \(\$\{project\.items\[at\]\.title\}\): /);
});

// ---- 6. The state and the address ----

test('a state ticked that is not the job address\'s state is said under the states and holds the download', () => {
  // A run 4: Northern Territory ticked for a Fremantle WA address gave no warning.
  const input = answered({ ...ANSWERED, workplace: '9 Marine Terrace, Fremantle WA 6160', state: 'wa', task: 'Lay the pool tiles.', fallRisk: 'no', crane: 'none' });
  assert.ok(!downloadGaps(draftBody(input), prepareDraft(draftBody(input))).some((gap) => gap.id === 'stateCheck'));
  const clash = { ...input, state: 'sa' };
  const gap = downloadGaps(draftBody(clash), prepareDraft(draftBody(clash))).find((one) => one.id === 'stateCheck');
  assert.ok(gap);
  assert.equal(gap.need, 'The job address is in Western Australia, but South Australia is ticked. Tick the state the job is in, or change the job address.');
  assert.equal(gap.field, 'states');
  // On the page, under the states, with a button for the address's state; a project's page draws its state questions again.
  const app = page('app.js');
  assert.match(page('index.html'), /<ul class="states" id="states"><\/ul>\s*<p class="warning hidden" id="state-clash" role="alert"><\/p>/);
  assert.match(app, /clash\.innerHTML = `\$\{esc\(said\)\} <button type="button" class="link" data-state-use="\$\{esc\(found\.state\)\}">Use \$\{esc\(stateName\(found\.state\)\)\}<\/button>`/);
  assert.match(app, /stateChosen\(\); if \(window\.SiteWrite && window\.SiteWrite\.renderProject && window\.SiteWrite\.projectListOpen && window\.SiteWrite\.projectListOpen\(\)\) window\.SiteWrite\.renderProject\(\);/);
});

test('the address suggestion whose street and suburb match comes first', async () => {
  // B run 5: "18 cheltenham pde woodville" offered "18 Woodville Street, Hurstville NSW" first.
  process.env.GOOGLE_PLACES_API_KEY = 'test-only';
  try {
    const p = (main, rest) => ({ placePrediction: { text: { text: `${main}, ${rest}, Australia` }, structuredFormat: { mainText: { text: main }, secondaryText: { text: rest } }, types: ['street_address'] } });
    const fetchImpl = async () => ({ ok: true, json: async () => ({ suggestions: [p('18 Woodville Street', 'Hurstville NSW'), p('18 Woodville Road', 'Granville NSW'), p('18 Cheltenham Parade', 'Saint Clair SA')] }) });
    const found = await places.suggest('18 cheltenham pde woodville', { fetchImpl });
    assert.equal(found.suggestions[0].text, '18 Cheltenham Parade, Saint Clair SA');
    const exact = async () => ({ ok: true, json: async () => ({ suggestions: [p('18 Woodville Street', 'Hurstville NSW'), p('18 Cheltenham Parade', 'Woodville SA')] }) });
    assert.equal((await places.suggest('18 cheltenham pde woodville x', { fetchImpl: exact })).suggestions[0].text, '18 Cheltenham Parade, Woodville SA');
  } finally {
    delete process.env.GOOGLE_PLACES_API_KEY;
  }
});

// ---- 7. The fuel reason is read whole ----

test('a fuel reason that names the saw past its first 60 letters passes', () => {
  // B run 7: "crane, pump and truck are the hire companies own, our saw is filled at the yard" was refused.
  const draft = { plant: [{ item: 'Concrete saw', known: 'Concrete saw' }, { item: 'Mobile crane', known: 'Mobile crane' }, { item: 'Concrete pump', known: 'Concrete pump' }, { item: 'Truck', known: 'Truck' }], jobSteps: [] };
  const need = rules.notUsedNeed('Fuels (diesel, petrol)', 'crane, pump and truck are the hire companies own, our saw is filled at the yard', 'saw cut the old capping with our concrete saw', '', '', '', draft);
  assert.equal(need, '');
  // A refused reason is quoted whole up to 120 letters.
  const long = 'we fill the excavator at the yard every night before it comes to site and the operator checks it';
  const refused = rules.notUsedNeed('Fuels (diesel, petrol)', long, 'dig with our excavator and compact with our plate compactor', '', '', '', { plant: [{ item: 'Excavator', known: 'Excavator' }, { item: 'Plate compactor', known: 'Plate compactor' }], jobSteps: [] });
  assert.ok(refused.includes(`"${long}"`), refused);
});

// ---- 8. The plant note names only steps the plant added ----

test('the plant note does not claim a step that was already ticked', () => {
  // A run 2: 'Confirming it added the job step "Set up the concrete pump"' when that step was already ticked.
  assert.match(page('app.js'), /const ticked = new Set\(tickedSteps\(\)\.flatMap[\s\S]{0,400}!before\.has\(name\) && !ticked\.has\(name\)/);
});

// ---- 9. The crane ground answer that names who confirmed it ----

test('a crane ground answer naming the centre manager who confirmed it passes; the crew\'s own look does not', () => {
  // B run 8: refused as "Too thin" until it said "principal contractor".
  assert.equal(answerState('groundBearing', 'the centre manager confirmed the carpark pavement takes delivery trucks, we use 600 mm outrigger pads', 'nt'), 'supplied');
  assert.equal(answerState('groundBearing', 'confirmed by the council\'s asset engineer, 600 mm pads under each leg', 'nt'), 'supplied');
  assert.equal(answerState('groundBearing', 'i checked it, pads under the legs', 'nt'), 'vague');
  assert.equal(answerState('groundBearing', 'the operator checked the ground, pads under the legs', 'nt'), 'vague');
  assert.equal(answerState('groundBearing', 'confirmed by the operator, pads under the legs', 'nt'), 'vague');
});

// ---- 10. Google's hospital list ----

test('a hospital with no emergency department listed says so in the list', () => {
  // A run 4 and B run 7: Fremantle Hospital and University of Canberra Hospital came first with no note.
  assert.match(page('app.js'), /: '<br><span class="meta">No emergency department listed: check it has one before you choose it<\/span>'\);/);
});
