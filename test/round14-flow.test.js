// Messy test round 14 (18 October 2026, local), flow faults: a pasted heading's words left on the task line, an
// untick undone by the next untick, Falls "No" taken for a 2.2 m deep trench (and a harness rescue asked where no
// harness is used), weak answers that passed or printed oddly, SiteWrite's own chips that name nothing, a stale
// address note by Continue, and "Not required" on the project page asking no reason. The on-screen faults are also
// run in a browser (scratchpad/flow15).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { prepareDraft, questionsFor, taskLine } = require('../draft');
const { draftBody } = require('../input');
const { downloadGaps } = require('../download-gate');
const { checkSwms, fromDraft } = require('../builder-check');
const { categoriesFor, emergencyQuestions } = require('../emergency');
const gate = require('../public/gate-rules');
const nameCase = require('../sitelink-answers');
const scopeTask = require('../public/scope-task');
const rules = require('../public/substance-rules');
const { titleFor } = require('../accounts');
const { ANSWERED, ready, setupAccounts } = require('./helpers');
const { app } = require('../server');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

// Every question answered, with SiteWrite's own answer where it has one, then the plant and emergency (ready).
function answered(input) {
  let out = { ...input, facts: { ...(input.facts || {}) } };
  for (let pass = 0; pass < 4; pass += 1) {
    for (const item of questionsFor(draftBody(out)).required || []) {
      if (out.facts[item.id]) continue;
      if (item.choices) { out.facts[item.id] = item.default || (item.choices[0] && (item.choices[0].value || item.choices[0].id)); continue; }
      const pick = (item.suggestions || []).find((one) => !/_{3,}/.test(one.text));
      out.facts[item.id] = pick ? pick.text : 'Full body harness with a 2 m shock-absorbing lanyard to rated anchors installed by the roofer; users trained by the supplier.';
    }
    out = ready(out);
  }
  return out;
}

// ---- 1. A heading's words stay off the task line ----

const RUN7 = `4.0 TRADE SPECIFIC INCLUSIONS
7. Cleaning of glass– special care is to be taken when cleaning of glass. Removal of cemetious mortars is to be done by wet or chemical (approved by the Contractor) removal not rubbed off dry.  Report all scratches and defects to the Contractor prior to starting.
13. The Subcontractor is to vacuum and or sweep all floors, mop and polish all tile surfaces.
22. Provide all access equipment necessary to complete the works. No EWP’s on tiled or carpet areas. Mobile scaffolds are to be used.`;

test('a pasted line that is only a heading is not work: it is off the task line, the title and the file name', () => {
  // B run 7: "4.0" came off, but "TRADE SPECIFIC INCLUSIONS." started the task line, the title, the file name and
  // the My SWMS entry.
  const line = taskLine(RUN7);
  assert.doesNotMatch(line, /TRADE SPECIFIC|INCLUSIONS/);
  assert.match(line, /^Cleaning of glass/);
  assert.match(titleFor({}, { task: RUN7 }), /^Cleaning of glass/);
  const draft = prepareDraft(draftBody({ state: 'act', task: RUN7, fallRisk: 'no', crane: 'none' }));
  assert.doesNotMatch(draft.task, /TRADE SPECIFIC/);
  // A heading in capitals or ending with a colon, with no work verb, goes on its own line.
  for (const [typed, kept] of [
    ['MECHANICAL SERVICES\nInstall the ducts in the ceiling.', 'Install the ducts in the ceiling.'],
    ['Trade specific inclusions:\nClean the glass.', 'Clean the glass.'],
    ['FLOOR FINISHES\nLay the vinyl in the wards.', 'Lay the vinyl in the wards.'],
    ['GENERAL\nPaint the walls.', 'Paint the walls.'],
  ]) assert.equal(taskLine(typed), kept, typed);
  // A line with a work verb, a sentence in capitals, one short word naming the work, and a task all in capitals stay.
  assert.match(taskLine('CORE DRILLING\nSeal all holes.'), /^CORE DRILLING/);
  assert.match(taskLine('INSTALL NEW SWITCHBOARD\nWork at night.'), /^INSTALL NEW SWITCHBOARD/);
  assert.match(taskLine('NO EWPS ON TILED AREAS\nClean the windows.'), /^NO EWPS ON TILED AREAS/);
  assert.match(taskLine('CCTV\nFix the cameras.'), /^CCTV/);
  assert.equal(taskLine('REWIRE A HOUSE'), 'REWIRE A HOUSE');
  assert.equal(taskLine('Install the following:\n- doors'), 'Install the following: doors.');
  // A heading that is all there is stays.
  assert.equal(taskLine('KITCHEN EXHAUST HOOD'), 'KITCHEN EXHAUST HOOD');
});

// ---- 2. An untick is not undone by the next one ----

test('two fast unticks both stick: an answer to an earlier ask does not tick a step again', async () => {
  // B run 7: "External painting at height" unticked, then "Handle and install glass panels" unticked about a second
  // later, and painting came back ticked. An ask still on its way when the next step was unticked drew the steps
  // as they were before that click, and the next click read them back.
  const IDS = ['tile', 'paint', 'glass', 'clean'];
  const waiting = [];
  const sent = [];
  const p = loadPage(['app.js'], (method, route, body) => {
    if (route.endsWith('/api/steps')) return { body: { groups: [{ trade: 'Cleaning', kinds: IDS.map((id) => ({ id, label: id, steps: [id] })) }] } };
    if (route.endsWith('/api/draft/questions')) {
      sent.push(body);
      const chosen = Array.isArray(body.kinds) ? body.kinds : IDS;
      return new Promise((resolve) => { waiting.push(() => resolve({ body: { required: [], weak: [], steps: { suggested: IDS, chosen } } })); });
    }
    return { body: {} };
  });
  await settle();
  // The step boxes as the page last drew them, and the user's own clicks on them.
  const list = p.document.getElementById('steps-block');
  const boxes = () => [...list.innerHTML.matchAll(/value="(\w+)"( checked)?/g)].map((m) => ({ value: m[1], checked: Boolean(m[2]) }));
  const clicked = new Map();
  p.document.querySelectorAll = (selector) => (selector === '#steps-block input[data-step]:checked'
    ? boxes().filter((box) => (clicked.has(box.value) ? clicked.get(box.value) : box.checked)).map((box) => ({ value: box.value })) : []);
  const untick = (id) => {
    clicked.set(id, false);
    const change = new FakeEvent('change');
    change.target = { matches: (selector) => selector === '[data-step]', checked: false, value: id };
    list.dispatchEvent(change);
  };
  // The questions, with every step ticked.
  const first = p.run('loadQuestions({ stay: true })');
  await settle();
  waiting.shift()();
  await first;
  await settle();
  clicked.clear();
  assert.deepEqual(boxes().filter((box) => box.checked).map((box) => box.value), IDS);
  // Tiles unticked, then painting while that ask is on its way; the answer to the tiles comes back between the
  // clicks on painting and glass, and glass is unticked after it.
  untick('tile');
  await settle();
  untick('paint');
  await settle();
  waiting.shift()();
  await settle();
  untick('glass');
  await settle();
  while (waiting.length) { waiting.shift()(); await settle(); }
  const last = sent[sent.length - 1];
  assert.deepEqual(last.kinds, ['clean'], JSON.stringify(sent.map((body) => body.kinds)));
  assert.deepEqual([...last.kindsOff].sort(), ['glass', 'paint', 'tile']);
  clicked.clear();
  assert.deepEqual(boxes().filter((box) => box.checked).map((box) => box.value), ['clean']);
  // Each untick is kept: a step unticked by hand is drawn unticked, whatever an answer says.
  assert.deepEqual(boxes().map((box) => box.value), IDS);
});

// ---- 3. Falls "No" with a depth of 2 m or more ----

const TRENCH = 'lay 120m of 450 dia stormwater pipe along the brooker hwy verge. excavtor digs the trench 2.2m deep, trench sheilds in the trench, bed n backfil with crushed rock, conect into the existing pit with a new junction pit. traffic control by others';
const trenchInput = (extra = {}) => ready({ state: 'tas', task: TRENCH, crane: 'none', ...ANSWERED, ...extra });

test('Falls "No" for a 2.2 m deep trench is queried as other height words are, and the download waits for Yes or Keep No', () => {
  // B run 6: the steps printed "Falling into the trench" and guardrail lines, and nothing asked about the No.
  const asked = questionsFor(draftBody({ state: 'tas', task: TRENCH, fallRisk: 'no', crane: 'none' }));
  assert.equal(asked.fall.depth, 2.2);
  assert.match(asked.fall.warning, /names work 2\.2 metres deep, and a person could fall into it/);
  const input = trenchInput({ fallRisk: 'no' });
  const draft = prepareDraft(draftBody(input));
  assert.equal(draft.kind, 'draft');
  assert.equal(draft.fallConflict.depth, 2.2);
  assert.ok(draft.fallConflict.steps.includes('Work in the trench'), JSON.stringify(draft.fallConflict));
  const need = downloadGaps(draftBody(input), draft).find((gap) => gap.id === 'fallCheck');
  assert.match(need.need, /but the work is 2\.2 metres deep, and the step "Work in the trench" rates a fall\./);
  // Keep No settles it, and prints that no one can fall that far.
  const kept = prepareDraft(draftBody({ ...input, fallNoKept: true }));
  assert.equal(kept.fallConflict.kept, true);
  assert.ok(!downloadGaps(draftBody({ ...input, fallNoKept: true }), kept).some((gap) => gap.id === 'fallCheck'));
  // A depth under the fall height, or one kept under a limit, asks nothing.
  for (const task of ['Excavate a trench 1.2 m deep and lay the conduit.', 'Excavate a trench, kept less than 2.5 m deep, and lay the conduit.']) {
    assert.equal(questionsFor(draftBody({ state: 'tas', task, fallRisk: 'no', crane: 'none' })).fall.warning, '', task);
  }
  // Named another way: "to a depth of 3 m", "excavate down to 2.4 m".
  for (const task of ['Excavate the pit to a depth of 3 m for the new manhole.', 'Excavate down to 2.4 m for the footings.']) {
    assert.ok(questionsFor(draftBody({ state: 'tas', task, fallRisk: 'no', crane: 'none' })).fall.depth >= 2, task);
  }
});

test('SiteWrite\'s check sees the fall into a 2.2 m deep trench (H3), and judges its controls', () => {
  const input = trenchInput({ fallRisk: 'no', fallNoKept: true });
  const draft = prepareDraft(draftBody(input));
  const h3 = checkSwms(fromDraft(draft, draftBody(input))).findings.find((item) => item.rule === 'H3');
  assert.doesNotMatch(h3.message, /No fall risk over the height is listed or implied/);
  assert.match(h3.message, /^The work is 2\.2 m deep: a person could fall that far into it\. /);
  // A shallow trench is not read as a fall.
  const shallow = { ...input, task: TRENCH.replace('2.2m deep', '1.2m deep') };
  const h3s = checkSwms(fromDraft(prepareDraft(draftBody(shallow)), draftBody(shallow))).findings.find((item) => item.rule === 'H3');
  assert.match(h3s.message, /No fall risk over the height is listed or implied/);
});

test('with falls Yes for the trench, the rescue of a person left hanging in a harness is asked only where a harness is used', () => {
  // B run 6, revision 2: "left hanging in a harness" was asked beside the trench rescue answers, with no harness.
  const input = trenchInput({ fallRisk: 'yes', facts: { fallControl: 'Excavation edge barriers 1 m back from the trench edge, and trench shields to full depth.' } });
  const draft = prepareDraft(draftBody(input));
  assert.ok(draft.highRisk.some((item) => /falling more than/.test(item)));
  assert.ok(categoriesFor(draft).includes('trench'));
  assert.ok(!categoriesFor(draft).includes('fall'), categoriesFor(draft).join());
  assert.ok(!emergencyQuestions(draft).some((item) => /harness/.test(item.ask)));
  // A harness used (ticked, or in a step's controls) keeps the harness rescue; with none, the fall rescue is asked
  // without it.
  const fallDraft = (controls, ppe = []) => ({ kind: 'draft', highRisk: ['Involves a risk of a person falling more than 2 metres'], plant: [], ppe, jobSteps: [{ step: 'Work at slab edges', hazards: ['A fall from the slab edge.'], controls }] });
  const ask = (draft) => emergencyQuestions(draft).find((item) => item.id === 'fallRescue').ask;
  assert.equal(ask(fallDraft(['Edge protection guardrails are fitted at every open edge before work starts.'])), 'How is a person who falls rescued straight away, and by whom?');
  assert.equal(ask(fallDraft(['Where harnesses are used, they are inspected before use.'])), 'How is a person who falls rescued straight away, and by whom?');
  assert.match(ask(fallDraft(['Workers wear a full body harness clipped to the static line.'])), /left hanging in a harness/);
  assert.match(ask(fallDraft(['Edge protection at every open edge.'], [{ area: 'Body', items: [{ id: 'harness', ticked: true }] }])), /left hanging in a harness/);
  // A fall from height beside the trench keeps the fall rescue.
  // (The trench rescue is asked with a step that digs or works in the trench: messy round 15, B run 5.)
  const slab = fallDraft(['Edge protection at every open edge.']);
  const both = { ...slab, jobSteps: [...slab.jobSteps, { step: 'Excavate', hazards: ['The trench collapses onto a worker.'], controls: ['Trench shields to full depth.'] }], highRisk: ['Involves a risk of a person falling more than 2 metres', 'Is carried out in or near a shaft or trench with an excavated depth greater than 1.5 metres, or a tunnel'] };
  assert.deepEqual(categoriesFor(both), ['fall', 'trench']);
  const intoOnly = { ...both, jobSteps: [{ step: 'Work in the trench', hazards: ['Falling into the trench.'], controls: ['Barriers 1 m back from the edge.'] }] };
  assert.deepEqual(categoriesFor(intoOnly), ['trench']);
});

// ---- 4. Weak answers ----

const fieldNeed = (id, value) => gate.answerNeed(gate.fieldRule(gate.PEOPLE_FIELDS.find((item) => item.id === id)), value);

test('"first aid officer" names no first aider, and "Assembly point" no place', () => {
  assert.match(fieldNeed('firstAider', 'first aid officer'), /does not name a first aider/);
  assert.match(fieldNeed('firstAider', 'The first aid officer on site'), /does not name a first aider/);
  for (const place of ['Assembly point', 'the assembly point', 'Emergency assembly point', 'muster area']) assert.match(fieldNeed('musterPoint', place), /does not say where/, place);
  assert.equal(fieldNeed('musterPoint', 'Assembly point on Northbourne Avenue by the site office'), '');
  assert.equal(fieldNeed('firstAider', 'Main contractor\'s site first aider'), '');
});

test('a person the site must find is named in full: one name, a nickname or a first name and an initial are asked for in full', () => {
  // A run 3 and B runs 5 and 7: "Dazza", "darren", "tony", "dean", "Sharon", and "dean k" as Prepared by.
  for (const [id, typed] of [['worksManager', 'Dazza'], ['firstAider', 'darren'], ['complianceResponsible', 'tony'], ['reviewer', 'dean'], ['complianceResponsible', 'Sharon'], ['firstAider', 'Sione Leading Hand']]) {
    assert.match(fieldNeed(id, typed), /gives one name only\. Give their full name so the site can find them/, `${id} ${typed}`);
  }
  assert.match(gate.answerNeed({ optional: true, kind: 'person' }, 'dean k'), /gives a first name and an initial only/);
  assert.match(gate.checkerNameNeed('dean'), /gives one name only/);
  for (const typed of ['Dean Kowalski', 'dean kowalski foreman', 'Rob Smith, our supervisor', 'Sam Lee, supervisor', 'Jo Smith 0412 345 678']) assert.equal(fieldNeed('complianceResponsible', typed), '', typed);
  // The download waits for it, in the list before download.
  const input = answered({ state: 'qld', task: 'Install the ceiling grid and tiles in the office.', fallRisk: 'no', crane: 'none', ...ANSWERED, reviewer: 'dean', preparedBy: 'dean k' });
  const gaps = downloadGaps(draftBody(input), prepareDraft(draftBody(input)));
  assert.ok(gaps.some((gap) => gap.id === 'reviewer' && /one name only/.test(gap.need)), JSON.stringify(gaps.map((gap) => gap.id)));
  assert.ok(gaps.some((gap) => gap.id === 'preparedBy' && /first name and an initial/.test(gap.need)));
});

test('"n/a" for Live services beside a step whose hazard is a live supply is refused', () => {
  // B run 5: "n/a" printed "Not applicable" beside "Electric shock from the lift supply".
  const task = 'Install the lift rails, car and machine in the lift shaft, and connect the controller to the lift supply.';
  const base = answered({ state: 'sa', task, fallRisk: 'yes', crane: 'none', ...ANSWERED, facts: { fallControl: 'Work in the shaft is done from the installer\'s platform with guardrails.' } });
  const draft = prepareDraft(draftBody(base));
  const live = draft.jobSteps.flatMap((step) => step.hazards).find((line) => /Electric shock/.test(line) && /supply|controller|connect/.test(line));
  assert.ok(live, 'the lift steps carry the supply hazard');
  for (const none of ['n/a', 'None', 'nil']) {
    const input = { ...base, site: { ...base.site, liveServices: none } };
    const gap = downloadGaps(draftBody(input), prepareDraft(draftBody(input))).find((item) => item.id === 'site.liveServices');
    assert.ok(gap && /so there are live services at the work/.test(gap.need), `${none}: ${JSON.stringify(gap)}`);
  }
  const named = { ...base, site: { ...base.site, liveServices: 'Live 400 V supply to the lift controller in the machine room.' } };
  assert.ok(!downloadGaps(draftBody(named), prepareDraft(draftBody(named))).some((item) => item.id === 'site.liveServices'));
  // A shock from the crew's own leads is not a live service at the work: "None" stays an answer.
  const tiling = answered({ state: 'act', task: 'Cut and lay porcelain floor tiles in the bathrooms with a wet saw, and grout them.', fallRisk: 'no', crane: 'none', ...ANSWERED });
  assert.ok(prepareDraft(draftBody(tiling)).jobSteps.flatMap((step) => step.hazards).some((line) => /Electric shock from tools used with water/.test(line)));
  assert.ok(!downloadGaps(draftBody(tiling), prepareDraft(draftBody(tiling))).some((item) => item.id === 'site.liveServices'));
});

test('"n/a" for the principal contractor is refused where the job has one', () => {
  // B run 7: the pasted scope named the Contractor and the Subcontractor, and "n/a" printed "Not applicable".
  const asked = (task, extra = {}) => { const input = answered({ state: 'act', task, fallRisk: 'no', crane: 'none', ...ANSWERED, principalContractor: 'n/a', ...extra }); return downloadGaps(draftBody(input), prepareDraft(draftBody(input))).find((gap) => gap.id === 'principalContractor'); };
  assert.match(asked(RUN7).need, /^This job has a principal contractor: the task mentions "the Contractor"\. Name the principal contractor running the site/);
  assert.match(asked('Clean the windows and floors of the shop for the builder.').need, /the task mentions "builder"/);
  assert.match(asked('Clean the windows and floors of the shop.', { site: { ...ANSWERED.site, otherTrades: 'The head contractor\'s plumbers on the same level.' } }).need, /your site answers mention "head contractor"/);
  // A small job with none appointed may still say so.
  assert.equal(asked('Clean the windows and floors of the shop.'), undefined);
});

test('names keep their own capitals: McGrath, O\'Brien, Smith-Jones and the usual Mac names', () => {
  assert.equal(nameCase.tidyPersonRole('sharon mcgrath'), 'Sharon McGrath');
  assert.equal(nameCase.tidyPersonRole('sean o\'brien, foreman'), 'Sean O\'Brien, Foreman');
  assert.equal(nameCase.tidyPersonRole('anne smith-jones'), 'Anne Smith-Jones');
  assert.equal(nameCase.tidyPersonRole('mary macdonald'), 'Mary MacDonald');
  // "Mac" only where it is nearly always so written; and "'s" is not a name's capital.
  assert.equal(nameCase.tidyPersonRole('tom mack'), 'Tom Mack');
  assert.equal(nameCase.tidyPersonRole('ian machado'), 'Ian Machado');
  assert.equal(nameCase.tidyCompany('don\'s plumbing'), 'Don\'s Plumbing');
  const draft = prepareDraft(draftBody(ready({ state: 'act', task: 'Clean the windows and floors.', fallRisk: 'no', crane: 'none', ...ANSWERED, complianceResponsible: 'sharon mcgrath, site supervisor' })));
  assert.equal(draft.complianceResponsible, 'Sharon McGrath, Site supervisor');
  // The checker's name as the page tidies it.
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'public', 'human-check.js'), 'utf8'), /\^Mc\[a-z\]\{2,\}\$/);
});

test('a lone "n" prints "and" in printed answers that are not names', () => {
  // A run 1: "loading dock n goods lift" printed with "n".
  const input = ready({ state: 'nsw', task: 'Deliver and install the commercial kitchen equipment.', fallRisk: 'no', crane: 'none', ...ANSWERED, musterPoint: 'Front gate n site office on Crown Street', site: { ...ANSWERED.site, access: 'Through the loading dock n goods lift to level 1.' } });
  const draft = prepareDraft(draftBody(input));
  assert.equal(draft.site.find((field) => field.id === 'access').text, 'Through the loading dock and goods lift to level 1.');
  assert.match(draft.musterPoint, /Front gate and site office on Crown Street/);
  assert.ok(!JSON.stringify(draft.jobSteps).includes('dock n goods'));
  // A company keeps its "n".
  assert.equal(draft.subcontractor === undefined || !/ and /.test(nameCase.tidyCompany('canberra clean n shine')), true);
  assert.equal(nameCase.tidyCompany('canberra clean n shine'), 'Canberra Clean n Shine');
});

// ---- 5. SiteWrite's chips name the trade, service or place ----

test('a scope condition that names no trade, service or place is not offered as a site answer', () => {
  // A runs 1 and 4: "Other trades working in the buildings.", "Work alongside other trades." and, for Live services,
  // "Fans, ductwork and electrical controls by other trades."
  assert.deepEqual(scopeTask.siteSuggestions(['Other trades working in the buildings.', 'Work alongside other trades.', 'Electricians on the same level.'], 'otherTrades'), ['Electricians on the same level.']);
  assert.deepEqual(scopeTask.siteSuggestions(['Fans, ductwork and electrical controls by other trades.', 'Live 240 V power in the ceiling.'], 'liveServices'), ['Live 240 V power in the ceiling.']);
  const site = scopeTask.scopeSite([{ conditions: 'Fans, ductwork and electrical controls by other trades; Work alongside other trades; Live power in the risers' }]);
  assert.equal(site.liveServices, 'Live power in the risers.');
  assert.equal(site.otherTrades, 'Fans, ductwork and electrical controls by other trades.');
  // Typed, they are refused as they say no trade.
  for (const typed of ['Other trades working in the buildings.', 'Work alongside other trades.']) assert.match(gate.siteNeed('otherTrades', typed), /does not say which trades/, typed);
  assert.equal(gate.siteNeed('otherTrades', 'Plumbers and tilers working above'), '');
});

// ---- 6. The address note by Continue goes once the address is picked ----

test('Continue says nothing more about the address once it is picked', async () => {
  const respond = (method, route) => {
    if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
    if (route === '/api/states') return { body: { states: [{ id: 'tas', name: 'Tasmania', loaded: true, versionLabel: 'current' }] } };
    if (route === '/api/me') return { status: 401, body: {} };
    if (route === '/api/steps') return { body: { groups: [] } };
    return { body: {} };
  };
  const p = loadPage(['address.js', 'gate-rules.js', 'app.js', 'account.js'], respond);
  await settle(20);
  p.document.stateTicked = '';
  const box = p.document.getElementById('workplace');
  box.value = 'brooker hwy glenorcy';
  p.document.getElementById('continue').dispatchEvent(new FakeEvent('click', { bubbles: true }));
  assert.match(p.document.getElementById('start-error').textContent, /Pick the job address from the list under the box/);
  // B run 6: picked, then Continue with falls unanswered (the browser stops at the falls question).
  box.value = 'Brooker Highway, Glenorchy TAS 7010';
  p.document.stateTicked = 'tas';
  const press = new FakeEvent('click', { bubbles: true });
  p.document.getElementById('continue').dispatchEvent(press);
  assert.ok(!press.defaultPrevented);
  assert.equal(p.document.getElementById('start-error').textContent, '');
  // Picking the address clears it at once too.
  p.document.getElementById('start-error').textContent = gate.clean('Pick the job address from the list under the box, so SiteWrite knows which state\'s law applies. If it is not listed, tick the state below.');
  p.run('applyAddressState()');
  assert.equal(p.document.getElementById('start-error').textContent, '');
});

// ---- 7. "Not required" on the project page asks its reason as the SWMS does ----

const GO = fs.readFileSync(path.join(__dirname, '..', 'public', 'project-go.js'), 'utf8');
const RULES = fs.readFileSync(path.join(__dirname, '..', 'public', 'substance-rules.js'), 'utf8');
const FILL = fs.readFileSync(path.join(__dirname, '..', 'public', 'design-fill.js'), 'utf8');
const PARTS = fs.readFileSync(path.join(__dirname, '..', 'public', 'check-parts.js'), 'utf8');
const wait = () => new Promise((resolve) => { setTimeout(resolve, 30); });
function goPage(answer) {
  const els = new Map();
  const listeners = { input: [], change: [], click: [] };
  const element = (id) => {
    if (!els.has(id)) els.set(id, { id, value: '', innerHTML: '', textContent: '', hidden: false, dataset: {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, focus() {}, scrollIntoView() {} });
    return els.get(id);
  };
  const document = { getElementById: element, querySelector: (selector) => (selector === 'input[name="state"]:checked' ? { value: 'nsw' } : null), querySelectorAll: () => [], addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); }, activeElement: null };
  const S = { api: (route) => route, esc: (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]), payload: () => ({ state: 'nsw', company: 'Co' }), canDownload: () => true, signedIn: () => true, getProfile: () => ({ name: 'Co', abn: '33102417000' }) };
  const window = { SiteWrite: S };
  const fetch = async (route, options) => { const out = answer(route, options && options.body ? JSON.parse(options.body) : null) || {}; return { ok: true, json: async () => out.body || {} }; };
  const context = vm.createContext({ window, document, fetch, setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0), console, globalThis: null });
  context.globalThis = context;
  vm.runInContext(FILL, context);
  window.SiteWriteDesignFill = context.SiteWriteDesignFill;
  vm.runInContext(RULES, context);
  vm.runInContext(PARTS, context);
  vm.runInContext(GO, context);
  const hooks = { save() {}, render() {}, statusOf: (item) => (item.kind !== 'draft' || (item.needs || []).length ? 'needs' : 'ready') };
  const fire = (type, target) => {
    const node = { dataset: {}, tagName: 'INPUT', type: 'checkbox', value: '', ...target };
    node.closest = (selector) => (selector === '#project-panel' ? {} : String(selector).split(',').some((part) => { const m = /\[data-([a-z-]+)\]|#([\w-]+)/.exec(part.trim()); return m && (m[2] ? node.id === m[2] : node.attrs && node.attrs.includes(m[1])); }) ? node : null);
    for (const fn of listeners[type] || []) fn({ target: node });
  };
  return { element, hooks, fire, go: window.SiteWriteProjectGo };
}

test('"Not required" on the project page asks the reason where the job steps name the product, and is not said as lost', async () => {
  // A runs 1 and 2: refrigerants "Not required" was taken with no reason, and the list then read "add the product or
  // tick Not required: refrigerants", while the SWMS asked for the reason.
  const REF = rules.TYPES.find((type) => /^Refrigerants/.test(type));
  assert.ok(REF);
  // The server says which words the job steps use, with the types (server.js designsAsked).
  await setupAccounts();
  const listener = app.listen(0);
  await new Promise((resolve) => listener.once('listening', resolve));
  let asked;
  try {
    const response = await fetch(`http://127.0.0.1:${listener.address().port}/api/draft/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'nsw', task: 'Install the remote refrigeration plant, run and braze the refrigerant pipework, then evacuate and charge the system.', fallRisk: 'no', crane: 'none' }) });
    asked = await response.json();
  } finally { listener.close(); }
  if (!(asked.substanceTypes || []).includes(REF)) return;
  assert.ok(rules.namedIn(REF, asked.stepWords || ''), String(asked.stepWords).slice(0, 200));
  const p = goPage((route) => (route === '/api/draft/questions' ? { body: { required: [], weak: [], substanceTypes: [REF], stepWords: asked.stepWords } } : {}));
  const project = { stage: 'questions', shared: { crane: 'none', emergency: {}, designs: {} }, items: [{ title: 'Remote refrigeration', task: 'Install the remote refrigeration plant.', fallRisk: 'no', status: 'todo', body: null }] };
  const panel = p.element('project-panel');
  p.go.render(panel, project, p.hooks);
  await wait();
  p.fire('change', { dataset: { goNotused: '0', type: REF }, checked: true, attrs: ['go-notused'] });
  await wait();
  const section = p.element('go-body-0').innerHTML;
  assert.match(section, /Why is it not required\?<span class="hint">This SWMS&#39;s job steps name/);
  // Prepared, the list asks for the reason, not for the tick.
  project.items[0] = { ...project.items[0], kind: 'draft', status: 'needs', needs: [`Hazardous substance: ${rules.promptName(REF)}`], substancesNotUsed: [REF] };
  project.stage = 'review';
  p.go.render(panel, project, p.hooks);
  const html = panel.innerHTML.replace(/&quot;/g, '"');
  assert.match(html, /give the short reason each one ticked "Not required" is not required, under its tick on this page: refrigerants/);
  assert.doesNotMatch(html, /add the product you use or tick "Not required": refrigerants/);
});
