// Goal 1: the pick lists come from the owner's trade catalogue (pick-lists.json, built by
// scripts/build-presets.js with the words in pick-wording.js). Each picked task drafts with its
// own job steps, names the parts SiteReady has no job steps for, and never forces a wrong step.
const test = require('node:test');
const assert = require('node:assert/strict');
const { TRADES, GROUPS, answersFor } = require('../presets');
const { ACTIVITIES } = require('../activities');
const { prepareDraft, questionsFor, notCoveredRefusal } = require('../draft');
const { draftBody } = require('../input');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

const TASKS = TRADES.flatMap((trade) => trade.tasks.map((item) => ({ ...item, trade: trade.id })));
const KINDS = new Set(ACTIVITIES.map((activity) => activity.when).filter(Boolean));

// A picked task as the page sends it, with the questions answered from the standard answers.
function picked(item, state = 'qld') {
  const input = { state, task: item.task, fallRisk: item.fallRisk, residential: 'no', crane: item.crane, kinds: item.kinds, leaveOut: item.leaveOut, pickGaps: item.gaps };
  const facts = {};
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    const open = (asked.required || []).filter((fact) => !facts[fact.id]);
    if (!open.length) break;
    for (const fact of open) {
      facts[fact.id] = fact.id === 'liveElectrical' ? 'no' : fact.choices ? fact.choices[0].value : ((answersFor(fact.id, asked.task)[0] || {}).text || `As set out in the site plan: ${fact.label}.`).replace(/_{3,}/g, fact.id === 'craneChart' ? '12' : 'as on the site plan');
    }
  }
  return prepareDraft(draftBody({ ...input, facts }));
}

test('the pick lists are the trade catalogue, in groups, with no house trades or project names', () => {
  assert.deepEqual(GROUPS, ['Site and plant', 'Civil and infrastructure', 'Structure', 'Services', 'Finishes', 'Any trade']);
  for (const group of GROUPS) assert.ok(TRADES.some((trade) => trade.group === group), group);
  assert.ok(TRADES.length >= 30 && TASKS.length >= 250, `${TRADES.length} trades, ${TASKS.length} tasks`);
  // Infrastructure trades the owner asked for (D190), and demolition.
  for (const id of ['civil-earthworks', 'roads-pavements', 'pipelines-drainage', 'bridges', 'rail', 'retaining-walls', 'demolition-stripout']) assert.ok(TRADES.some((trade) => trade.id === id), id);
  // Access, plant and tools for any trade (EWPs, mobile scaffolds, forklifts) is a pick of its own.
  const shared = TRADES.find((trade) => trade.group === 'Any trade');
  for (const words of [/elevating work platform/i, /mobile scaffold/i, /forklift/i]) assert.ok(shared.tasks.some((item) => words.test(item.title)), String(words));
  assert.ok(!TRADES.some((trade) => /^Houses:|\bhouses?\b|domestic/i.test(trade.name)), 'no house trades');
  const project = /\b(hospital|stadium|ward|bowl|concourse|corporate box\w*|grandstand|apartment\w*|school\w*|50 storey)\b/i;
  for (const item of TASKS) {
    assert.doesNotMatch(item.title, project, item.title);
    assert.doesNotMatch(item.task, project, item.task);
  }
  // Each task once in its trade, by title.
  for (const trade of TRADES) assert.equal(new Set(trade.tasks.map((item) => item.title)).size, trade.tasks.length, trade.id);
});

test('the owner\'s trade splits: ICT and security, passive fire and penetrations, concrete cutting by method', () => {
  const trade = (id) => TRADES.find((entry) => entry.id === id);
  // ICT and communications, and security and access control, are two trades (D197).
  assert.equal(trade('ict-communications').group, 'Services');
  assert.equal(trade('security-access-control').group, 'Services');
  // Passive fire is a trade of its own, and each services trade seals its own penetrations (D198).
  assert.equal(trade('passive-fire').group, 'Services');
  for (const id of ['electrical', 'plumbing-hydraulics', 'mechanical', 'fire-services', 'ict-communications', 'security-access-control']) {
    const own = trade(id).tasks.find((item) => item.id === 'penetrations');
    assert.ok(own, id);
    for (const kind of ['coreDrill', 'fireCollar']) assert.ok(own.kinds.includes(kind), `${id}: ${kind}`);
  }
  // Concrete cutters write one SWMS per method (D199).
  assert.deepEqual(trade('concrete-cutting').tasks.map((item) => item.id), ['scanning-coring', 'floor-road-sawing', 'wall-sawing-openings', 'wire-sawing', 'hand-sawing-chasing', 'controlled-removal']);
  // EWPs and mobile scaffolds are their own SWMS (D172), and crane lifts are the crane company's own.
  const shared = trade('shared-access-and-handling');
  assert.ok(shared.tasks.some((item) => /elevating work platform/i.test(item.title)) && shared.tasks.some((item) => /mobile scaffold/i.test(item.title)));
  assert.ok(trade('cranes-rigging').tasks.every((item) => item.crane === 'own'));
});

test('each picked task names job steps the library has, and leaves out only steps of those kinds', () => {
  // pick-lists.json was built from the wording file as it is now (run scripts/build-presets.js).
  const WORDING = require('../pick-wording');
  for (const item of TASKS) {
    const words = (WORDING[item.trade] || {})[item.id];
    assert.ok(words, `${item.trade}/${item.id} has wording`);
    assert.equal(item.task, words.task, `${item.trade}/${item.id}: build again`);
    assert.deepEqual(item.gaps, words.gaps || [], `${item.trade}/${item.id}: build again`);
  }
  for (const [trade, tasks] of Object.entries(WORDING)) for (const id of Object.keys(tasks)) assert.ok(TASKS.some((item) => item.trade === trade && item.id === id), `${trade}/${id} is in the pick lists`);
  for (const item of TASKS) {
    for (const kind of item.kinds) assert.ok(KINDS.has(kind), `${item.trade}/${item.id}: ${kind}`);
    const steps = new Set(ACTIVITIES.filter((activity) => item.kinds.includes(activity.when)).flatMap((activity) => activity.steps.map((step) => step.step)));
    for (const step of item.leaveOut) assert.ok(steps.has(step), `${item.trade}/${item.id}: ${step}`);
    // A task the catalogue says is only partly covered names the parts with no job steps, unless
    // the wording file says the library now covers them.
    if (item.coverage === 'none') assert.ok(item.gaps.length || item.kinds.length, `${item.trade}/${item.id}`);
  }
});

test('every picked task drafts with its own job steps, or stands down where SiteReady has none (Queensland)', () => {
  const standDown = [];
  for (const item of TASKS) {
    const draft = picked(item);
    if (!item.kinds.length) {
      // Nothing is forced onto work SiteReady has no job steps for.
      assert.equal(draft.kind, 'stand-down', `${item.trade}/${item.id}`);
      standDown.push(item.id);
      continue;
    }
    assert.equal(draft.kind, 'draft', `${item.trade}/${item.id}: ${(draft.missing || []).join(' ')}`);
    const names = draft.jobSteps.map((step) => step.step);
    for (const step of item.leaveOut) assert.ok(!names.includes(step), `${item.trade}/${item.id} leaves out ${step}`);
    // The parts with no job steps are listed above the draft, in the catalogue's words.
    for (const gap of item.gaps) assert.ok(draft.notCovered.includes(gap.replace(/[.,;:]+$/, '')), `${item.trade}/${item.id}: ${gap}`);
  }
  assert.ok(standDown.length <= 8, `stood down: ${standDown.join(', ')}`);
});

test('the parts of a picked task with no job steps are listed until ticked, and only while the task is as picked', () => {
  const rail = TASKS.find((item) => item.trade === 'rail' && item.id === 'protection');
  const draft = picked(rail);
  assert.equal(draft.kind, 'draft');
  assert.ok(draft.notCovered.includes(rail.gaps[0]));
  const refusal = notCoveredRefusal(draft, { notCoveredConfirmed: [] });
  assert.match(refusal, /SiteReady has no job steps for: /);
  assert.ok(refusal.includes(rail.gaps[0]));
  assert.equal(notCoveredRefusal(draft, { notCoveredConfirmed: draft.notCovered }), '');
  // The same words, typed rather than picked (no parts sent), are read as typed.
  const typed = prepareDraft(draftBody({ state: 'qld', task: rail.task, fallRisk: 'no', residential: 'no' }));
  assert.ok(!(typed.notCovered || []).includes(rail.gaps[0]));
  // What the page sends is kept short and plain.
  assert.deepEqual(draftBody({ pickGaps: ['  rail welding ', 3, '', 'x'.repeat(400)] }).pickGaps, ['rail welding', 'x'.repeat(300)]);
});

test('the words of a picked task, typed alone, find most of its job steps', () => {
  // Typed into the Task box without the pick list, each task's words should tick the job steps the
  // task carries. Measured when built (10 October 2026): 198 of 320 tasks with steps tick every one,
  // and all but three tick at least one: manual handling and pallet jacks, which have no job steps of
  // their own (their steps sit inside other trades' work), and data outlets, whose only step is the
  // electrician's rough-in (terminating and testing data outlets has no job step yet). The full pass
  // over the pick lists (12 October 2026, D213) gave 81 tasks shared steps their catalogue left out; the
  // words were extended to name most of them, but ten tasks carry a shared access, handling or isolation
  // step their words do not name (the pick list sends it): 192 of 326 then tick every one. May rise,
  // never fall.
  let all = 0;
  const none = [];
  const withSteps = TASKS.filter((item) => item.kinds.length);
  for (const item of withSteps) {
    const asked = questionsFor({ task: item.task, state: 'qld', fallRisk: 'no', crane: item.crane });
    const chosen = (asked.steps && asked.steps.chosen) || [];
    if (item.kinds.every((kind) => chosen.includes(kind))) all += 1;
    if (!item.kinds.some((kind) => chosen.includes(kind))) none.push(item.id);
  }
  assert.ok(all >= 192, `${all} of ${withSteps.length} tick every step`);
  assert.ok(none.every((id) => ['manual-handling', 'pallet-jacks', 'outlets-testing'].includes(id)), `no step ticked: ${none.join(', ')}`);
});

test('a hoist driver\'s own SWMS is not stood down for having only the hoist step', () => {
  const draft = prepareDraft(draftBody({ state: 'qld', task: 'Operate the builders hoist: drive the personnel and materials hoist, and move bins and materials between floors.', fallRisk: 'no', residential: 'no' }));
  assert.equal(draft.kind, 'draft');
  assert.ok(draft.jobSteps.some((step) => step.step === 'Operate the hoist'));
  // Riding the hoist to do other work still is not the work.
  const ride = prepareDraft(draftBody({ state: 'qld', task: 'Take the tiles up in the builders hoist and lay them on level 3.', fallRisk: 'no', residential: 'no' }));
  assert.ok(ride.jobSteps.some((step) => step.step === 'Lay tiles'));
});

test('on the page, a picked task sends its job steps and its parts with no steps, until its words change', async () => {
  const item = TASKS.find((entry) => entry.trade === 'rail' && entry.id === 'protection');
  const trades = [{ id: 'site', name: 'Site establishment', group: 'Site and plant', tasks: [] }, { id: 'rail', name: 'Rail', group: 'Civil and infrastructure', tasks: [item] }];
  const p = loadPage(['app.js'], (method, route) => {
    if (route === '/api/presets') return { body: { groups: GROUPS, trades } };
    if (route === '/api/steps') return { body: { groups: [] } };
    if (route === '/api/draft/questions') return { body: { required: [], steps: { chosen: [], suggested: [], locked: [] } } };
    return { body: {} };
  });
  await settle();
  const trade = p.document.getElementById('trade');
  assert.match(trade.innerHTML, /<optgroup label="Site and plant"><option value="0">Site establishment<\/option><\/optgroup><optgroup label="Civil and infrastructure"><option value="1">Rail<\/option><\/optgroup>/);
  trade.value = '1';
  trade.dispatchEvent(new FakeEvent('change'));
  const preset = p.document.getElementById('preset');
  preset.value = '0';
  preset.dispatchEvent(new FakeEvent('change'));
  assert.equal(p.document.getElementById('task').value, item.task);
  const note = p.document.getElementById('preset-note');
  assert.equal(note.classList.contains('hidden'), false);
  assert.match(note.textContent, /^SiteReady has no job steps yet for: /);
  p.document.getElementById('start').dispatchEvent(new FakeEvent('submit'));
  await settle();
  const sent = () => p.calls.filter((call) => call.route === '/api/draft/questions').pop().body;
  assert.deepEqual(sent().kinds, item.kinds);
  assert.deepEqual(sent().pickGaps, item.gaps);
  // Changed words start from the steps found in them, and the picked task's parts go.
  p.document.getElementById('task').value = `${item.task} Also dig a cable trench.`;
  p.document.getElementById('start').dispatchEvent(new FakeEvent('submit'));
  await settle();
  assert.equal(sent().kinds, undefined);
  assert.equal(sent().pickGaps, undefined);
});
