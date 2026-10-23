// Messy test round 18 (23 October 2026, staging), flow faults: "Keep No crane" left crane lines, a spelling fix that broke a
// real word, typed answers printed with their typos, weak answers that passed, plant known by its site name, a harness asked
// with no harness, refused site answers with no reason on the project page, wording, titles and revisions, the smaller page
// faults and the PDF route under load. The page faults are also run in a browser (scratchpad/flow19).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps, gateChecks } = require('../download-gate');
const gate = require('../public/gate-rules');
const nameCase = require('../sitelink-answers');
const rules = require('../public/substance-rules');
const { fixSpelling } = require('../spelling');
const { answersFor } = require('../presets');
const { ANSWERED, ready } = require('./helpers');

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
const need = (draft, input, id) => (gateChecks(draftBody(input), draft).find((gap) => gap.id === id && gap.need) || null);

// ---- 1. "Keep No crane" takes the crane off the SWMS ----

const KITCHEN = 'Install commercial kitchen equipment, benches and canopies. Canopies and combi ovens lifted off the supplier\'s hiab truck at the dock.';

test('after "Keep No crane" the SWMS has no crane operator row, no crane company line and no crane step', () => {
  // A run 1: "Crane operated by: Crane company", the crane company's lift plan line and the hiab step stayed.
  const base = { state: 'nsw', task: KITCHEN, fallRisk: 'no', crane: 'none' };
  const queried = draftOf(base);
  assert.deepEqual(queried.craneConflict, { words: 'hiab', kept: false });
  const kept = draftOf({ ...base, craneNoKept: true });
  assert.equal(kept.kind, 'draft');
  assert.equal(kept.craneOperator, '');
  assert.ok(!kept.jobSteps.some((step) => /crane|hiab/i.test(step.step)), kept.jobSteps.map((step) => step.step).join(' | '));
  assert.ok(!allLines(kept).some((line) => /crane company|crane crew/i.test(line)), allLines(kept).filter((line) => /crane/i.test(line)).join(' | '));
  assert.ok(!(kept.plant || []).some((row) => /crane|hiab/i.test(row.item)), JSON.stringify(kept.plant));
  assert.ok(kept.jobSteps.some((step) => step.step === 'Deliver and install commercial kitchen equipment'));
  // The step list no longer ticks the crane step, even one ticked before Keep was pressed (B run 5).
  const asked = questionsFor(draftBody({ ...base, craneNoKept: true, kinds: ['loaderCrane', 'craneInterface', 'kitchenEquipment'] }));
  assert.ok(!asked.steps.chosen.includes('loaderCrane') && !asked.steps.chosen.includes('craneInterface'), asked.steps.chosen.join());
  // Changing the answer to a crane company brings it all back.
  const company = draftOf({ ...base, crane: 'company', slinging: 'crane' });
  assert.equal(company.craneOperator, 'Crane company');
});

test('both copies of the crane query name the crane in the person\'s own words, and Keep asks the step list again', () => {
  // A run 1: the questions page said "vehicle loading crane" and the draft said "hiab".
  const base = { ...ANSWERED, state: 'nsw', task: KITCHEN, fallRisk: 'no', crane: 'none' };
  assert.equal(questionsFor(draftBody(base)).crane.words, 'hiab');
  assert.equal(prepareDraft(draftBody(answered(base))).craneConflict.words, 'hiab');
  assert.match(page('app.js'), /craneNoKept = true;\n\s*showCraneWarning\(\);[\s\S]{0,300}if \(questions && !factsForm\.classList\.contains\('hidden'\)\) \{ refreshSteps\(\); return; \}/);
});

// ---- 2. Spelling fixes never turn a trade word into another word ----

test('"bratt pan" and other trade words stay as typed; real slips are still fixed', () => {
  // A run 1: "bratt" became "bratty" in every copy of the task.
  for (const [typed, kept] of [['install the bratt pan', 'install the bratt pan'], ['the snatch block', 'the snatch block'], ['new backboxes for the GPOs', 'new backboxes for the GPOs'], ['hardcore fill under the slab', 'hardcore fill under the slab'], ['patch the vlans', 'patch the vlans'], ['to australian standards', 'to australian standards'], ['a queenslander house', 'a queenslander house'], ['the tradies park out front', 'the tradies park out front']]) {
    assert.equal(fixSpelling(typed).text, kept, typed);
  }
  assert.equal(fixSpelling('concret slab, plasterbord, retaning wal, resedential').text, 'concrete slab, plasterboard, retaining wall, residential');
  assert.equal(draftOf({ state: 'nsw', task: 'Install the bratt pan and the combi oven in the hotel kitchen.', fallRisk: 'no', crane: 'none' }).task, 'Install the bratt pan and the combi oven in the hotel kitchen.');
});

// ---- 3. Typed answers print with the task line's fixes ----

test('typed answers print with the spelling, "n", "its a" and short names fixed', () => {
  // B runs 5 and 6, A run 2: "Trench sheild", "shaft platfrom", "its a trench, the shield n barriers do the job", "sds".
  const trench = draftOf({ workplace: '120 Main Rd, Moonah TAS', state: 'tas', task: 'Lay a new sewer main in a trench up to 2.2 m deep, dug with our excavator, inside a trench shield.', fallRisk: 'yes', crane: 'none', facts: { fallControl: 'trench sheild n barriers' } });
  const lines = allLines(trench);
  assert.ok(lines.some((line) => /Trench shield and barriers/.test(line)), lines.filter((line) => /shield/i.test(line)).join(' | '));
  assert.ok(!lines.some((line) => /sheild/i.test(line)));
  const shaft = draftOf({ state: 'sa', task: 'Install the ceiling grid in the foyer, 4.5 m high, working from a mobile scaffold.', fallRisk: 'yes', crane: 'none', facts: { fallControl: 'work from the mobile scaffold platfrom with the guardrails up' } });
  assert.ok(allLines(shaft).some((line) => /scaffold platform with the guardrails up/i.test(line)), allLines(shaft).filter((line) => /platf/i.test(line)).join(' | '));
  assert.ok(!allLines(shaft).some((line) => /platfrom/.test(line)));
  const floor = draftOf({ state: 'vic', task: 'Lay carpet and vinyl, glued down, with floor levelling compound.', fallRisk: 'no', crane: 'none', facts: { safetyDataSheet: 'carpet adhesive n floor levelling compound, gloves and airflow, sds in the van' } });
  assert.ok(allLines(floor).some((line) => /SDS in the van/.test(line)), allLines(floor).filter((line) => /van/.test(line)).join(' | '));
  assert.ok(!allLines(floor).some((line) => /\bsds\b/.test(line)));
});

test('a filled blank, the muster point and a reviewer\'s conditions print tidied', () => {
  // B run 6: "its a trench, the shield n barriers do the job"; B run 5: "Victoria square"; A run 4: "royal Perth hospital OK".
  const { withFills } = require('../blanks');
  const line = 'Edge protection was considered first, but is not reasonably practicable for this work because ____.';
  const { blankKey } = require('../blanks');
  const draft = prepareDraft(draftBody(answered({ ...ANSWERED, state: 'tas', task: 'Dig a trench 2.2 m deep with our excavator.', fallRisk: 'yes', crane: 'none', musterPoint: 'victoria square, opposite the main gate', fills: { [blankKey(line)]: ['its a trench, the shield n barriers do the job'] } })));
  assert.equal(draft.musterPoint, 'Victoria Square, opposite the main gate');
  const typed = require('../draft').withTypedAnswers({ fills: { [blankKey(line)]: ['its a trench, the shield n barriers do the job'] }, facts: { scaffoldType: 'byOthers' } });
  assert.equal(typed.facts.scaffoldType, 'byOthers');
  const fill = withFills({ kind: 'draft', jobSteps: [], controls: [{ level: 'Administrative', text: line }] }, typed.fills);
  assert.match(fill.controls[0].text, /because it's a trench, the shield and barriers do the job\./);
  const places = nameCase.placeNames(['200 St Georges Terrace, Perth WA 6000', 'Royal Perth Hospital Emergency Department, Victoria Square, Perth WA 6000']);
  assert.equal(nameCase.tidyLines('royal perth hospital ok', [], [], places), 'Royal Perth Hospital OK');
});

// ---- 4. Weak answers ----

const SEWER = 'Lay a new 225 PVC sewer main along the nature strip on Main Rd, about 80 m, in a trench up to 2.2 m deep dug with our 13 t excavator and a trench shield. Connect into the existing manhole, backfill and compact, reinstate the footpath.';

test('"none" for live services is refused where a step locates buried services or connects to a live sewer', () => {
  // B run 6: "none" passed for a sewer dug along a main road; A run 1 refused it beside an energised step.
  const given = answered({ ...ANSWERED, workplace: '120 Main Rd, Moonah TAS', state: 'tas', task: SEWER, fallRisk: 'yes', crane: 'none', site: { ...ANSWERED.site, publicInterface: 'Footpath closed with barricades and signs while we dig.' } });
  const input = { ...given, site: { ...given.site, liveServices: 'none' } };
  const draft = prepareDraft(draftBody(input));
  const refused = need(draft, input, 'site.liveServices');
  assert.ok(refused, 'refused');
  assert.match(refused.need, /The step "(?:Locate underground services" finds the services in the ground before digging|Connect to the live sewer" connects to a live service)/);
  assert.equal(gate.answerNeed(refused.rule, 'None found: the Before You Dig plans and the locator show none in the dig area.'), '');
  assert.equal(gate.answerNeed(refused.rule, 'Live sewer main at the manhole, gas and power marked along the nature strip.'), '');
  assert.notEqual(gate.answerNeed(refused.rule, 'none'), '');
});

test('"council" is refused as the principal contractor, and the rescue answers name the role and a place', () => {
  // B run 6: "council" passed; "pull him out with the ladder" and "Liam climbs in inside the shield ..." passed.
  assert.match(gate.fieldWeak('company', 'council'), /does not say which one/);
  assert.match(gate.fieldWeak('company', 'the shire'), /does not say which one/);
  assert.equal(gate.fieldWeak('company', 'Glenorchy City Council'), '');
  const rescue = { ask: 'Say how.', emergency: true, involves: 'x', rescue: true, role: true };
  assert.match(gate.answerNeed(rescue, 'pull him out with the ladder'), /does not say who does the rescue/);
  assert.match(gate.answerNeed(rescue, 'Liam climbs in inside the shield and lifts him out with the harness'), /names a person, "Liam": on a big site the person changes\. Say the role instead, for example "The spotter and a trained crew member \.\.\."/);
  assert.equal(gate.answerNeed(rescue, 'The spotter and a trained crew member lift the person out with the harness and line from the top.'), '');
  assert.equal(gate.answerNeed(rescue, 'Spotter lowers the platform and the crew reach the person with the rescue kit.'), '');
  // B run 5: "rescue kit" with no place passed.
  const kit = { ask: 'Say what.', emergency: true, involves: 'x', kit: true };
  assert.match(gate.answerNeed(kit, 'rescue kit'), /does not say where it is kept/);
  assert.equal(gate.answerNeed(kit, 'Rescue kit and pole beside the lift shaft door on each level.'), '');
  // Every standard emergency answer still passes.
  for (const item of require('../emergency').QUESTIONS) {
    const rule = { ask: 'A', emergency: true, involves: 'x', ...(item.rescue ? { rescue: true } : {}), ...(item.kit ? { kit: true } : {}), ...(item.stop ? { stop: true } : {}), ...(item.controls ? { controls: true } : {}), ...(item.role ? { role: true } : {}), ...(item.category === 'fall' && item.rescue ? { fall: true } : {}) };
    for (const answer of item.suggestions) assert.equal(gate.answerNeed(rule, answer.text), '', `${item.id}: ${answer.text}`);
  }
});

test('a thin harness answer is too thin, and a hiab set up on pads on a sealed road, back from the trench, passes', () => {
  // B run 5: "harness n retractable to the anchor in the machine room" passed with a soft finding.
  const lift = { state: 'sa', task: 'Install the lift rails in the shaft, working from the shaft platform in a harness.', fallRisk: 'yes', crane: 'none' };
  const weak = (facts) => questionsFor(draftBody({ ...lift, facts })).weak || [];
  assert.ok(weak({ harnessSystem: 'harness n retractable to the anchor in the machine room' }).some((item) => item.id === 'harnessSystem'));
  assert.ok(!weak({ harnessSystem: 'Full body harness with a 2 m shock-absorbing lanyard to rated anchors installed by the roofer; users trained by the supplier.' }).some((item) => item.id === 'harnessSystem'));
  for (const answer of answersFor('harnessSystem', lift.task)) assert.ok(!weak({ harnessSystem: answer.text.replace(/_{3,}/g, 'Smith') }).some((item) => item.id === 'harnessSystem'), answer.label);
  // B run 6: refused twice as too thin. A mobile crane still needs the ground confirmed.
  const ground = 'hiab sets up on the sealed road, well back from the trench, outriggers on 600mm pads, council road opening permit covers it';
  const groundWeak = (task) => (questionsFor(draftBody({ state: 'tas', task, fallRisk: 'no', crane: 'own', facts: { groundBearing: ground } })).weak || []).some((item) => item.id === 'groundBearing');
  assert.equal(groundWeak('Pipes come off the truck with our hiab and are laid in the trench.'), false);
  assert.equal(groundWeak('Lift the bridge beams with our 50t franna.'), true);
  assert.equal((questionsFor(draftBody({ state: 'tas', task: 'Pipes come off the truck with our hiab.', fallRisk: 'no', crane: 'own', facts: { groundBearing: 'i checked it' } })).weak || []).some((item) => item.id === 'groundBearing'), true);
});

test('Public "none" is refused beside a step that runs mobile plant, and passes with how the public is kept away', () => {
  // B run 8: Public "none" passed for a fence line dug by the crew's bobcat, with a soft finding only.
  const given = answered({ ...ANSWERED, workplace: '30 Chung Wah Terrace, Palmerston NT', state: 'nt', residential: 'no', task: 'Install 180 m of chainmesh fence. Our bobcat augers the post holes, posts concreted from bagged mix.', fallRisk: 'no', crane: 'none' });
  const input = { ...given, site: { ...given.site, publicInterface: 'none' } };
  const draft = prepareDraft(draftBody(input));
  const refused = need(draft, input, 'site.publicInterface');
  assert.ok(refused, draft.jobSteps.map((step) => step.step).join(' | '));
  assert.match(refused.need, /runs mobile plant, so its work area must be kept clear of the public/);
  assert.equal(gate.answerNeed(refused.rule, 'None. The site is fenced, no public access.'), '');
});

// ---- 5. Plant known by its site name ----

test('"digger" is the excavator and "bobcat" the skid steer, in the fuel reason and the licence match', () => {
  // B runs 6 and 8.
  const dig = { plant: [{ item: 'Excavator' }, { item: 'Tipper truck' }], plantInferred: [], jobSteps: [{ step: 'Excavate', hazards: [], controls: [] }] };
  assert.equal(rules.notUsedNeed('Fuels (diesel, petrol)', 'trucks n digger fuelled at our depot', '', rules.stepWords(dig), '', '', dig), '');
  const bobcat = { plant: [{ item: 'Skid steer or posi-track' }], plantInferred: [], jobSteps: [] };
  assert.equal(rules.notUsedNeed('Fuels (diesel, petrol)', 'bobcat filled at our yard', '', rules.stepWords(bobcat), '', '', bobcat), '');
  const fence = draftOf({ workplace: '30 Chung Wah Terrace, Palmerston NT', state: 'nt', residential: 'no', task: 'Install 180 m of chainmesh fence. Our bobcat augers the post holes.', fallRisk: 'no', crane: 'none', site: { ...ANSWERED.site, publicInterface: 'None. The site is fenced, no public access.' } });
  const found = JSON.stringify(require('../human-check').builderCheck(fence, 'nt'));
  assert.match(found, /"score"/);
  assert.doesNotMatch(found, /Match a licence or ticket to the plant and work: [^"]*bobcat/);
});

// ---- 6. No harness question where no harness is used ----

test('a scope that rules out EWPs, with falls No, does not ask "Harness and anchors"', () => {
  // B run 7: the cleaning scope's "No EWP's on tiled or carpet areas. Mobile scaffolds are to be used." asked it.
  const task = 'All builders plus final cleaning ready for the opening of the resort. Windows cleaned inside and out. Provide all access equipment necessary to complete the works. No EWP\'s on tiled or carpet areas. Mobile scaffolds are to be used.';
  const asked = questionsFor(draftBody({ state: 'act', task, fallRisk: 'no', crane: 'none' }));
  assert.ok(!asked.required.some((item) => item.id === 'harnessSystem'), asked.required.map((item) => item.id).join());
  // An EWP that is used still asks it.
  assert.ok(questionsFor(draftBody({ state: 'act', task: 'Clean the atrium glass from a boom lift.', fallRisk: 'yes', crane: 'none' })).required.some((item) => item.id === 'harnessSystem'));
  // "No harness is used" never prints as a control.
  const draft = prepareDraft(draftBody({ ...ANSWERED, state: 'act', task, fallRisk: 'no', crane: 'none', ppe: ['harness', 'hardHat'], facts: { harnessSystem: 'No harness is used. Workers stay inside the mobile scaffold guardrails.' } }));
  if (draft.kind === 'draft') assert.ok(!allLines(draft).some((line) => /No harness is used/.test(line)));
});

// ---- 7. Refused site answers say why on the project page ----

test('the project page says why a shared site answer is refused at every stage, and in its list of what is still to give', () => {
  // A run 1: the list said "Site question: Live services" and the box said nothing.
  const source = page('project-go.js');
  assert.doesNotMatch(source, /if \(project\.stage !== 'questions' \|\| !rules\.SITE_NEED\) return;/);
  assert.match(source, /function siteNeed\(id, tried = true\)/);
  assert.match(source, /Site question: \$\{esc\(need\.label\)\}<\/button>\$\{siteNeed\(need\.id\) \? `<span class="meta go-site-why"> \$\{esc\(siteNeed\(need\.id\)\)\}<\/span>` : ''\}/);
  assert.match(source, /noneChecked: Boolean\(gap\.rule\.noneChecked\)/);
});

// ---- 8. Wording ----

test('"na" in a person\'s box names no one, and a first name alone gets an example with a full name', () => {
  // A run 1: "na" got "gives one name only"; "tina office" got the example "Tina, office manager".
  assert.match(gate.fieldWeak('person', 'na'), /^"na" does not name anyone\./);
  const tina = gate.fieldWeak('person', 'tina office');
  assert.match(tina, /gives one name only/);
  assert.doesNotMatch(tina, /"Tina, office manager"/);
  // The example asks for the surname (stacked with sl15's round 18 SiteLink wording 5).
  assert.match(tina, /"Tina \(surname\), office manager"/);
  assert.match(gate.fieldWeak('person', 'kerry hocking office'), /"Kerry Hocking, office manager"/);
});

// ---- 9. Titles and revisions ----

test('a heading that leads into a list titles the SWMS, and a later revision prints what changed and why', async () => {
  // B run 7: "All builders plus final cleaning ready for the opening of the resort: Kitchen areas".
  const { titleFor } = require('../accounts');
  const pasted = 'BUILDERS/FINAL CLEAN\nDESCRIPTION OF WORK:\nAll builders plus final cleaning ready for the opening of the resort including but not limited to:\n· Kitchen areas\n· Bathrooms/wet areas\n· Glazing';
  assert.equal(titleFor({}, { task: pasted }), 'All builders plus final cleaning ready for the opening of the resort');
  assert.equal(titleFor({}, { task: 'Install switchboards: main board and DBs on each level. Test and tag.' }), 'Install switchboards: main board and DBs on each level');
  const { metaRows } = require('../docx-draft');
  const rows = metaRows({ state: 'ACT', revision: '2', revisionDate: '23 October 2026', revisionReason: 'Sweeping step added for the reviewer\'s changes.' });
  assert.deepEqual(rows.find((row) => row[0] === 'What changed and why'), ['What changed and why', 'Sweeping step added for the reviewer\'s changes.']);
  assert.ok(!metaRows({ state: 'ACT', revision: '1', revisionReason: 'x' }).some((row) => row[0] === 'What changed and why'));
  const pdf = fs.readFileSync(path.join(__dirname, '..', 'pdf-draft.js'), 'utf8');
  assert.match(pdf, /if \(draft\.revisionReason && Number\(draft\.revision\) > 1\) rows\.push\(\['What changed and why', draft\.revisionReason\]\);/);
  const revisions = fs.readFileSync(path.join(__dirname, '..', 'revisions.js'), 'utf8');
  assert.match(revisions, /\.\.\.\(why \? \{ revisionReason: why \} : \{\}\)/);
});

// ---- 10. Smaller faults ----

test('the check ticks come with a SWMS saved since, the step picker says what a step brings, and the council leaves the address', () => {
  // B run 5: ticks cleared after a download, reload and prepare with no change.
  assert.match(page('human-check.js'), /kept\(\)\[options\.key\] \|\| \(options\.was && kept\(\)\[options\.was\]\)/);
  assert.match(page('account.js'), /was: editing \? `draft::\$\{task\}` : '',/);
  // B run 8: "Build the fence" brings "Dig post holes".
  const app = page('app.js');
  assert.match(app, /<span class="step-names">Includes: /);
  assert.match(app, /const addLabel = \(kind\) => \{ const others = \(kind\.steps \|\| \[\]\)\.filter\(\(name\) => name !== kind\.label\); return others\.length \? `\$\{kind\.label\} \(includes \$\{others\.join\('; '\)\}\)` : kind\.label; \};/);
  // B run 6: "120 Main Rd, Moonah Glenorchy City Council, TAS".
  const { toSuggestion } = require('../places');
  const suggestion = (main, rest) => ({ text: { text: `${main}, ${rest}, Australia` }, structuredFormat: { mainText: { text: main }, secondaryText: { text: rest } }, types: ['street_address'] });
  assert.equal(toSuggestion(suggestion('120 Main Rd', 'Moonah Glenorchy City Council, TAS')).text, '120 Main Rd, Moonah, TAS');
  assert.equal(toSuggestion(suggestion('1 Shire Rd', 'Mount Barker SA')).text, '1 Shire Rd, Mount Barker SA');
});

test('the service worker keeps only the offline page, so an installed phone gets every new app file', () => {
  // B, build check: the sw.js stamp stayed the same across builds. It covers only the offline page it keeps: every app file
  // comes from the server, named with a fingerprint of its content.
  const sw = page('sw.js');
  assert.match(sw, /const SHELL = \['\/offline\.html'\];/);
  assert.match(sw, /if \(request\.method !== 'GET' \|\| request\.mode !== 'navigate'\) return;/);
  assert.match(sw, /event\.respondWith\(fetch\(request\)\.catch\(/);
  const delivery = fs.readFileSync(path.join(__dirname, '..', 'delivery.js'), 'utf8');
  assert.match(delivery, /return `\$\{before\}\$\{ref\}\?v=\$\{entry\.version\}\$\{after\}`;/);
});

// ---- 11. A download rides over a server process coming back ----

test('a download is asked again twice, after 1.5 and 5 seconds, so a short 502 blip does not lose the press', async () => {
  // A run 3: 502s at 10:46:30 and 10:46:31 on POST /api/draft.pdf (one press and its one retry); the next press worked.
  const { loadPage, settle } = require('./fake-dom');
  let tries = 0;
  const p = loadPage(['gate-rules.js', 'app.js', 'account.js'], (method, route) => {
    if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
    if (route === '/api/me') return { body: { user: { email: 'a@b.example', name: 'Sam' }, company: { name: 'Co', abn: '1', hasAccess: true, planStatus: 'active' } } };
    if (route.startsWith('/api/swms/s1/pdf')) { tries += 1; return tries <= 2 ? { status: 502, body: '<html>Bad Gateway</html>', headers: { 'content-type': 'text/html' } } : { headers: { 'content-type': 'application/pdf' } }; }
    return { body: {} };
  }, { stored: { 'sitewrite.session': 'token' } });
  await settle();
  await p.window.SiteWrite.download('/api/swms/s1/pdf', 'SWMS.pdf');
  assert.equal(tries, 3, 'asked twice more');
  assert.match(page('account.js'), /const RETRY_WAITS = \[1500, 5000\];/);
});
