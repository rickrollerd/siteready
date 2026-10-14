// Owner testing of the scope reading, 13 October 2026 (decisions/TESTING-FEEDBACK-2026-10-13.md):
// item 8, penetrations formed or covered are not core drilling; item 9, cranage is a SWMS only where
// our company runs the crane or the scope gives us the cranage, and a ticket duty is not work;
// item 10, the work packages are chosen once and go straight to the SWMS to prepare; item 11, each
// SWMS from the scope shows its pick list trade and task; item 12, cleaning in formwork work is not
// chemical cleaning. The scope wording here is neutral test text.
const test = require('node:test');
const assert = require('node:assert/strict');
const { packagesOf, craneClause, cranageOffer, CRANAGE_TICK, pickFor, fallFrom, projectItems, isCranage } = require('../public/scope-choice');
const { settlePackages, packageHighRisk } = require('../ai-scope');
const { TRADES } = require('../presets');
const { questionsFor } = require('../draft');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

const row = (activity, pack, { type = 'Site work', clause = '', quotes = [], where = '' } = {}) => ({ activity, type, package: pack, crew: '', clause, quotes, where, plant: '', conditions: '', unknowns: '', matrixColumn: '' });
const CRANAGE_QUOTE = 'The Subcontractor must allow for all associated cranage for the installation of stair forms and other items associated with the concrete works.';

// A reading shaped like the one the owner tested: formwork, reinforcement, edge protection,
// penetrations formed and covered (read into the drilling package), cranage, and a ticket duty.
function reading() {
  return {
    activities: [
      row('Supply and install formwork and propping to suspended slabs, stairs and beams', 'Trade installation: formwork', { where: 'suspended slabs, stairs, beams' }),
      row('Strip formwork, back-prop, and clean, de-nail and stack stripped formwork', 'Trade installation: formwork'),
      row('Place, tie and chair reinforcement to suspended slabs', 'Trade installation: reinforcement'),
      row('Install and remove temporary handrails (edge protection) to leading edges, exposed penetrations and stairs', 'Edge protection'),
      row('Cover penetrations in slabs', 'Penetrations and core drilling', { clause: 'Formwork', quotes: ['The Subcontractor has allowed to cover all penetrations in slabs.'] }),
      row('Form up penetrations, openings and recesses in slabs', 'Penetrations and core drilling', { clause: 'Formwork', quotes: ['The Subcontractor has allowed to form up all penetrations, openings and recesses.'] }),
      row('Crane lift formwork, reinforcement and stair forms', 'Plant lifting and cranage', { clause: 'Vertical lifting', quotes: [CRANAGE_QUOTE] }),
      row('Lift vibrators and power trowel machines onto slabs', 'Plant lifting and cranage'),
      row('Hold and evidence tickets and VOC for cranes, dogging, rigging and plant operation', 'Plant lifting and cranage', { type: 'Site work' }),
      row('Provide qualified site supervision', 'Supervision', { type: 'Duty' }),
    ],
    packages: [
      { package: 'Trade installation: formwork', groups: ['formwork'], unmatched: [], byOthers: [{ group: 'castIn', step: 'Install cast-in conduits on the deck before the pour', party: 'Electrician', clause: '4.1', says: 'The electrician fixes the cast-in conduits.' }] },
      { package: 'Trade installation: reinforcement', groups: ['reo'], unmatched: [], byOthers: [] },
      { package: 'Edge protection', groups: ['edgeProtectionInstall'], unmatched: [], byOthers: [] },
      { package: 'Penetrations and core drilling', groups: ['coreDrill', 'sitePlant'], unmatched: ['Cover penetrations in slabs'], byOthers: [] },
      { package: 'Plant lifting and cranage', groups: ['craneInterface'], unmatched: [], byOthers: [] },
    ],
    byOthers: [],
    conflicts: [],
  };
}

// Item 8.
test('penetrations formed in the formwork go with the formwork, covers go with edge protection, and no drilling package is left', async () => {
  const settled = settlePackages(reading());
  const packageOf = (activity) => settled.activities.find((item) => item.activity === activity).package;
  assert.equal(packageOf('Form up penetrations, openings and recesses in slabs'), 'Trade installation: formwork');
  assert.equal(packageOf('Cover penetrations in slabs'), 'Edge protection');
  assert.equal(settled.packages.find((item) => item.package === 'Penetrations and core drilling'), undefined);
  // The edge protection steps cover penetrations, so the cover is no longer work without job steps.
  assert.deepEqual(settled.packages.find((item) => item.package === 'Edge protection').unmatched, []);
  const flags = await packageHighRisk(settled, 'nsw');
  assert.equal(flags.find((item) => item.package === 'Penetrations and core drilling'), undefined);
  // Edge protection: falls, likely; no moving plant brought by the drilling package's groups.
  assert.deepEqual(flags.find((item) => item.package === 'Edge protection').categories.map((item) => item.id), ['fall']);
});

test('cutting, drilling and sealing penetrations stay in the drilling package', () => {
  const settled = settlePackages({
    activities: [
      row('Core drill penetrations through slabs and walls', 'Penetrations and core drilling'),
      row('Seal service penetrations with fire collars', 'Penetrations and core drilling'),
      row('Form penetrations in the slab formwork', 'Penetrations and core drilling'),
      row('Form openings through the precast walls for services', 'Penetrations and core drilling'),
      row('Erect slab formwork', 'Formwork'),
    ],
    packages: [{ package: 'Penetrations and core drilling', groups: ['coreDrill'], unmatched: [], byOthers: [] }, { package: 'Formwork', groups: ['formwork'], unmatched: [], byOthers: [] }],
  });
  // The formwork package is named for its work, as every reading names it (messy-user test, 14 October 2026).
  assert.deepEqual(settled.activities.map((item) => item.package), ['Penetrations and core drilling', 'Penetrations and core drilling', 'Formwork and falsework', 'Penetrations and core drilling', 'Formwork and falsework']);
  assert.deepEqual(settled.packages.find((item) => item.package === 'Penetrations and core drilling').groups, ['coreDrill']);
});

test('with no formwork or edge protection package, formed and covered penetrations become packages of their own', () => {
  const settled = settlePackages({
    activities: [row('Box out penetrations in the slab', 'Penetrations and core drilling'), row('Cover penetrations in slabs', 'Penetrations and core drilling')],
    packages: [{ package: 'Penetrations and core drilling', groups: ['coreDrill'], unmatched: [], byOthers: [] }],
  });
  assert.deepEqual(settled.activities.map((item) => item.package), ['Forming penetrations, openings and recesses', 'Edge protection and penetration covers']);
  assert.deepEqual(settled.packages.map((item) => item.package), ['Forming penetrations, openings and recesses', 'Edge protection and penetration covers']);
  assert.deepEqual(settled.packages[1].groups, ['edgeProtectionInstall']);
  // The drilling package's groups do not follow work its own words do not name.
  assert.ok(!settled.packages[0].groups.includes('coreDrill'));
});

test('a services trade\'s penetration covers stay with its drilling when the scope has no edge protection package', () => {
  const settled = settlePackages({
    activities: [row('Core drill penetrations for pipework', 'Penetrations and core drilling'), row('Clear safety mesh from penetrations and erect barricades and penetration covers', 'Penetrations and core drilling')],
    packages: [{ package: 'Penetrations and core drilling', groups: ['coreDrill'], unmatched: [], byOthers: [] }],
  });
  assert.deepEqual(settled.activities.map((item) => item.package), ['Penetrations and core drilling', 'Penetrations and core drilling']);
});

// Item 9.
test('holding and evidencing tickets is a duty, not work in the cranage package', () => {
  const settled = settlePackages(reading());
  assert.equal(settled.activities.find((item) => /^Hold and evidence tickets/.test(item.activity)).type, 'Duty');
  const { work, duties } = packagesOf(settled);
  assert.deepEqual(work.find((pack) => pack.name === 'Plant lifting and cranage').rows.map((item) => item.activity), ['Crane lift formwork, reinforcement and stair forms', 'Lift vibrators and power trowel machines onto slabs']);
  assert.deepEqual(duties.map((item) => item.activity), ['Hold and evidence tickets and VOC for cranes, dogging, rigging and plant operation', 'Provide qualified site supervision']);
  // A duty typed so by the AI never shows in a work package either.
  const typed = packagesOf({ activities: [row('Lift forms', 'Cranage'), row('Keep lift records', 'Cranage', { type: 'Duty' })] });
  assert.deepEqual(typed.work[0].rows.map((item) => item.activity), ['Lift forms']);
  // Licensed work is still work.
  assert.equal(settlePackages({ activities: [row('Provide licensed riggers to sling and land the steel', 'Plant lifting and cranage')], packages: [] }).activities[0].type, 'Site work');
});

test('the scope clause that gives this subcontractor the cranage is found, and cranage by others is not', () => {
  assert.deepEqual(craneClause(reading()), { clause: 'Vertical lifting', quote: CRANAGE_QUOTE });
  const others = { activities: [row('Lift the forms', 'Plant lifting and cranage', { quotes: ['Cranage is supplied by the Contractor. The Subcontractor shall allow for dogging.'] })] };
  assert.equal(craneClause(others), null);
  const byOthers = { activities: [row('Lift the forms', 'Plant lifting and cranage', { quotes: ['The Subcontractor allows for cranage by others.'] })] };
  assert.equal(craneClause(byOthers), null);
  // A duty's quote does not count.
  assert.equal(craneClause({ activities: [row('Book the crane', 'Plant lifting and cranage', { type: 'Duty', quotes: [CRANAGE_QUOTE] })] }), null);
});

test('cranage is offered only for our own crane or the scope\'s clause, and the user can still add it', () => {
  assert.ok(isCranage('Plant lifting and cranage'));
  assert.ok(!isCranage('Edge protection'));
  assert.deepEqual(cranageOffer('own', null), { full: true, ticked: true, note: '' });
  const company = cranageOffer('company', null);
  assert.equal(company.ticked, false);
  assert.equal(company.full, false);
  assert.equal(company.note, 'You answered that a crane company operates the crane. The crane company normally provides the lift plan and its own SWMS for the lifts, so there is no cranage SWMS. Tick the box if you still need one.');
  assert.equal(CRANAGE_TICK, 'Yes, we need a cranage SWMS');
  assert.equal(cranageOffer('none', null).note, 'You answered that no crane is used, so there is no cranage SWMS. Tick the box if you need one after all.');
  const clause = cranageOffer('company', { clause: 'Vertical lifting', quote: CRANAGE_QUOTE });
  assert.equal(clause.ticked, true);
  assert.equal(clause.note, `The scope says you supply the cranage (Vertical lifting): "${CRANAGE_QUOTE}" You answered that a crane company operates the crane. Untick this if the crane company's lift plan and SWMS cover the lifts.`);
  for (const offer of [company, clause, cranageOffer('none', null)]) assert.doesNotMatch(offer.note, /—|–/);
});

// Item 11.
test('each package shows the pick list trade, and the task where one clearly fits', () => {
  const rows = (...activities) => activities.map((activity) => ({ activity }));
  assert.deepEqual(pickFor('Trade installation: formwork', rows('Supply and install formwork to suspended slabs, stairs and beams')), { trade: 'formwork', task: 'slab-formwork' });
  assert.deepEqual(pickFor('Formwork and falsework: whole project', rows('Form columns and walls')), { trade: 'formwork', task: 'columns-walls-stairs' });
  assert.deepEqual(pickFor('Trade installation: reinforcement', rows('Place, tie and chair reinforcement to suspended slabs')), { trade: 'steel-fixing-pt', task: 'reo-decks' });
  assert.deepEqual(pickFor('Trade installation: concrete place and finish', rows('Place and finish concrete to suspended slabs')), { trade: 'concreting', task: 'suspended-placing' });
  assert.deepEqual(pickFor('Edge protection', rows('Install temporary handrails')), { trade: 'scaffolding', task: 'edge-protection-stairs-nets' });
  assert.deepEqual(pickFor('Plant lifting and cranage', rows('Crane lift formwork')), { trade: 'cranes-rigging', task: '' });
  assert.deepEqual(pickFor('Penetrations and core drilling', rows('Core drill penetrations')), { trade: 'concrete-cutting', task: 'scanning-coring' });
  // Access equipment and materials handling pick a task only when exactly one fits.
  assert.deepEqual(pickFor('Access equipment', rows('Use ladders for access', 'Use scissor lifts and boom lifts')), { trade: 'shared-access-and-handling', task: '' });
  assert.deepEqual(pickFor('Access equipment', rows('Use scissor lifts and boom lifts')), { trade: 'shared-access-and-handling', task: 'ewp-use' });
  assert.deepEqual(pickFor('Materials handling and deliveries', rows('Unload deliveries with a forklift')), { trade: 'shared-access-and-handling', task: 'forklifts' });
  assert.deepEqual(pickFor('Site clean-up and waste removal', rows('Remove trade waste')), { trade: 'cleaning', task: 'site-cleanup' });
  assert.equal(pickFor('Trade installation: level 1', rows('Install ductwork')), null);
  assert.equal(pickFor('Protection of works', rows('Protect finished slabs')), null);
  // Every trade and task named is one the pick lists have.
  const { TRADE_RULES } = require('../public/scope-choice');
  for (const rule of TRADE_RULES) {
    const trade = TRADES.find((item) => item.id === rule.trade);
    assert.ok(trade, rule.trade);
    for (const [, id] of rule.tasks) assert.ok(trade.tasks.some((item) => item.id === id), `${rule.trade}/${id}`);
  }
});

test('the fall question is answered only where the work states a fall over 2 m', () => {
  assert.equal(fallFrom({ categories: [{ id: 'fall', likely: false }] }), 'yes');
  assert.equal(fallFrom({ categories: [{ id: 'fall', likely: true }] }), '');
  assert.equal(fallFrom(null), '');
});

test('the packages chosen become the project\'s SWMS with their scope review answers, crane answer and pick', () => {
  const settled = settlePackages(reading());
  const items = projectItems(settled, ['Trade installation: formwork', 'Edge protection'], { answers: { 'Trade installation: formwork': { 'Install cast-in conduits on the deck before the pour': 'yes' } }, crane: 'company' });
  assert.deepEqual(items.map((item) => item.title), ['Trade installation: formwork', 'Edge protection']);
  const [formwork, edge] = items;
  assert.ok(formwork.kinds.includes('castIn'));
  assert.deepEqual(formwork.leaveOut, []);
  assert.match(formwork.task, /Form up penetrations, openings and recesses in slabs\./);
  assert.deepEqual(formwork.pick, { trade: 'formwork', task: 'slab-formwork' });
  assert.equal(formwork.crane, 'company');
  assert.equal(formwork.status, 'todo');
  assert.match(edge.task, /Cover penetrations in slabs\./);
  // Unanswered, a scope review question leaves the step out.
  assert.deepEqual(projectItems(settled, ['Trade installation: formwork']).at(0).leaveOut, ['Install cast-in conduits on the deck before the pour']);
});

// Item 12.
test('cleaning that is part of formwork, reinforcement and pour work is not offered as chemical cleaning', () => {
  const offered = (task) => questionsFor({ state: 'nsw', task, fallRisk: 'yes', crane: 'company', kinds: ['formwork'] }).steps.suggested;
  for (const task of [
    'Erect formwork to suspended slabs. Clean out using compressed air, vacuum cleaners and magnets of all formed structural members, decks etc before the pour.',
    'Strip formwork. Formwork to be cleaned, de-nailed and stacked in designated areas once stripped.',
    'Erect formwork to suspended slabs. The Subcontractor has allowed for the cleaning of reinforcement and formwork decks prior to commencement of concrete pour.',
    'Strip formwork, re-shore and back-prop, and clean, de-nail and stack stripped formwork.',
  ]) assert.ok(!offered(task).includes('cleaning'), task);
  // A real clean still gets the cleaning steps.
  for (const task of ['Builders clean of the units before handover.', 'Chemical cleaning of the plant room floors.', 'Final clean of all floors.']) assert.ok(offered(task).includes('cleaning'), task);
  assert.ok(offered('Clean the windows on every level.').includes('cleaningHeight'));
});

// Item 10, in the page itself (a small stand-in for the browser, fake-dom.js).
function server(read) {
  return (method, route) => {
    if (route === '/api/config') return { body: { accounts: true, trialDays: 14 } };
    if (route === '/api/me') return { body: { user: { email: 'a@b.example', name: 'Sam', hasPasskey: true }, company: { name: 'Co', abn: '1', hasAccess: true, planStatus: 'active' } } };
    if (route === '/api/sites') return { body: { sites: [] } };
    if (route === '/api/swms') return { body: { swms: [] } };
    if (route === '/api/steps') return { body: { groups: [] } };
    if (route === '/api/scope/ai' && method === 'GET') return { body: { enabled: true } };
    if (route === '/api/scope/ai' && method === 'POST') return { body: read };
    if (route.startsWith('/api/scope/ai/r1')) return { body: read };
    return { body: {} };
  };
}
async function readPage() {
  const settled = settlePackages(reading());
  const read = { id: 'r1', status: 'done', state: 'nsw', reading: { ...settled, highRisk: await packageHighRisk(settled, 'nsw') }, checks: { passed: true } };
  const p = loadPage(['app.js', 'account.js', 'scope-task.js', 'scope-hrcw.js', 'scope-choice.js', 'scope.js'], server(read), { stored: { 'siteready.session': 'token' } });
  await settle(40);
  p.document.getElementById('scope-file').files = [];
  p.document.getElementById('scope-text').value = 'Scope text.';
  p.document.getElementById('scope-read').click();
  await settle(40);
  return p;
}
// An event on the list, as a click or a change inside it reaches it in a browser.
function fire(p, type, target, on = 'scope-results') {
  const event = new FakeEvent(type, { bubbles: true });
  event.target = target;
  p.document.getElementById(on).dispatchEvent(event);
}
const input = (p, props) => Object.assign(p.document.createElement('input'), { dataset: {}, ...props });
const cranageNote = (crane) => require('../public/scope-choice').cranageOffer(crane, null).note;
const projectOf = (p) => JSON.parse(p.window.localStorage.getItem('siteready.project'));

test('the work packages are chosen once and go straight to the SWMS to prepare, and the choice can be changed', async () => {
  const p = await readPage();
  const list = p.document.getElementById('scope-results').innerHTML;
  // The crane question starts unanswered (messy-user test, 14 October 2026); the scope gives us the
  // cranage: offered, with the clause, and no "You answered" until it is answered.
  assert.match(list, /Is a crane used, and who operates it\?/);
  assert.match(list, /The scope says you supply the cranage \(Vertical lifting\)/);
  assert.doesNotMatch(list, /You answered/);
  // Duties are listed apart; no package lists the ticket duty.
  assert.match(list, /2 duties in the scope: no SWMS needed/);
  assert.doesNotMatch(list.split('scope-duties')[0], /Hold and evidence tickets/);
  assert.doesNotMatch(list, /Penetrations and core drilling/);
  // The scope review question is on the list now.
  assert.match(list, /Scope review: install cast-in conduits on the deck before the pour by others/);
  // None is ticked to start, with Tick all and Untick all (messy round 3: 21 of 22 were ticked).
  assert.match(list, /Prepare the SWMS ticked/);
  assert.match(list, /data-scope-tick="all">Tick all<\/button><button type="button" class="small secondary" data-scope-tick="none">Untick all/);
  assert.doesNotMatch(list, /data-package="\d+" checked/);
  assert.doesNotMatch(list, /Add this task|Prepare a SWMS for every task/);
  // Tick formwork and edge protection, and answer Yes to the cast-in conduits.
  fire(p, 'change', input(p, { checked: true, dataset: { package: '0' } }));
  fire(p, 'change', input(p, { checked: true, dataset: { package: '2' } }));
  fire(p, 'change', input(p, { type: 'radio', name: 'others-0-0', value: 'yes', dataset: { others: '0', step: 'Install cast-in conduits on the deck before the pour' } }));
  assert.equal(p.document.getElementById('scope-confirm').textContent, 'Prepare these 2 SWMS');
  // A crane company runs the crane; the crane company's dogman slings (D258): both go to every SWMS.
  // The scope gives us the cranage, so its SWMS is chosen with the answer.
  fire(p, 'change', input(p, { type: 'radio', name: 'scope-crane', value: 'company' }));
  assert.equal(p.document.getElementById('scope-confirm').textContent, 'Prepare these 3 SWMS');
  fire(p, 'change', input(p, { type: 'radio', name: 'scope-slinging', value: 'crane' }));
  fire(p, 'click', p.document.getElementById('scope-confirm'));
  await settle(40);
  // Straight to the project, prepared in one go (D239), with nothing to choose again.
  const project = projectOf(p);
  assert.equal(project.stage, 'questions');
  assert.deepEqual(project.items.map((item) => item.title), ['Trade installation: formwork', 'Edge protection', 'Plant lifting and cranage']);
  assert.ok(project.items[0].kinds.includes('castIn'));
  assert.deepEqual(project.items[0].pick, { trade: 'formwork', task: 'slab-formwork' });
  assert.equal(project.items[0].crane, 'company');
  assert.equal(project.items[0].slinging, 'crane');
  // Each SWMS's task is a plain list of the work (D251); the SWMS form waits until one is opened to check.
  assert.match(project.items[0].task, /^Supply and install formwork and propping to suspended slabs, stairs and beams\. Strip formwork/);
  assert.doesNotMatch(project.items[0].task, /[()]/);
  assert.equal(p.document.getElementById('start').classList.contains('hidden'), true);
  assert.match(p.document.getElementById('project-panel').innerHTML, /Change the SWMS chosen/);
  // Back to the list with the choice as it was made.
  fire(p, 'click', p.document.getElementById('project-change'), 'project-panel');
  await settle(40);
  assert.match(p.document.getElementById('scope-results').innerHTML, /Prepare these 3 SWMS/);
  assert.match(p.document.getElementById('scope-results').innerHTML, /data-package="1" >/);
});

test('with a crane company and no cranage clause, cranage is not chosen but can be ticked; our own crane chooses it', async () => {
  const plain = reading();
  plain.activities = plain.activities.map((item) => ({ ...item, quotes: [] }));
  const settled = settlePackages(plain);
  const read = { id: 'r1', status: 'done', state: 'nsw', reading: { ...settled, highRisk: await packageHighRisk(settled, 'nsw') }, checks: { passed: true } };
  const p = loadPage(['app.js', 'account.js', 'scope-task.js', 'scope-hrcw.js', 'scope-choice.js', 'scope.js'], server(read), { stored: { 'siteready.session': 'token' } });
  await settle(40);
  p.document.getElementById('scope-text').value = 'Scope text.';
  p.document.getElementById('scope-file').files = [];
  p.document.getElementById('scope-read').click();
  await settle(40);
  const list = p.document.getElementById('scope-results').innerHTML;
  assert.match(list, /Yes, we need a cranage SWMS<\/strong> <span class="meta">\(Plant lifting and cranage: 2 activities\)/);
  // Unanswered, it asks for the answer, and says nothing was answered.
  assert.match(list, /Answer the crane question above\. Tick the box if you need a cranage SWMS\./);
  assert.doesNotMatch(list, /You answered/);
  assert.match(list, /Prepare the SWMS ticked/);
  // Answered "A crane company", the note says so (public/scope-choice.js, and the browser test).
  assert.match(cranageNote('company'), /You answered that a crane company operates the crane\. The crane company normally provides the lift plan and its own SWMS for the lifts/);
  fire(p, 'change', input(p, { checked: true, dataset: { package: '0' } }));
  fire(p, 'change', input(p, { type: 'radio', name: 'scope-crane', value: 'company' }));
  assert.equal(p.document.getElementById('scope-confirm').textContent, 'Prepare this SWMS');
  // Our company runs the crane: the cranage SWMS is chosen, and the answer goes to every SWMS.
  fire(p, 'change', input(p, { type: 'radio', name: 'scope-crane', value: 'own' }));
  assert.equal(p.document.getElementById('scope-confirm').textContent, 'Prepare these 2 SWMS');
  fire(p, 'click', p.document.getElementById('scope-confirm'));
  await settle(40);
  const project = projectOf(p);
  assert.ok(project.items.some((item) => item.title === 'Plant lifting and cranage'));
  assert.ok(project.items.every((item) => item.crane === 'own'));
});
