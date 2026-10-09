// Goal 4: each work package read from a scope shows the high risk construction work (HRCW) its
// work involves, by the same rules its SWMS uses, on the package list, the task cards and the report.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { screenHighRisk, prepareDraft } = require('../draft');
const { packageHighRisk, settlePackages } = require('../ai-scope');
const { hrcwSummary, HRCW_NOTE } = require('../public/scope-hrcw');
const { packageTask } = require('../public/scope-task');

const ids = (flag) => flag.categories.map((item) => `${item.id}${item.likely ? '?' : ''}`);
const screen = (task, extra = {}, said = '') => screenHighRisk({ state: 'qld', task, ...extra }, said);

test('a category the words settle is yes; one resting on a height, depth or traffic not stated is likely', () => {
  const roof = screen('Install metal roof sheeting and flashings to the new warehouse roof.');
  assert.deepEqual(ids(roof), ['fall?']);
  assert.equal(roof.categories[0].dependsOn, 'the working height');
  assert.equal(roof.categories[0].short, 'Fall of more than 2 m');
  assert.match(roof.categories[0].label, /falling more than 2 ?m/);
  assert.deepEqual(ids(screen('Install metal roof sheeting to the warehouse roof, 9 m above the ground.')), ['fall']);

  const dig = screen('Excavate trenches and lay stormwater pipes.');
  assert.ok(ids(dig).includes('trench?'));
  assert.equal(dig.categories.find((item) => item.id === 'trench').dependsOn, 'the depth of the dig');
  assert.ok(ids(screen('Excavate a trench 2.4 m deep and lay the sewer main.')).includes('trench'));
  assert.ok(!ids(screen('Excavate a trench 1.2 m deep and lay the stormwater pipe.')).some((id) => id.startsWith('trench')));

  const bay = screen('Receive deliveries and unload trucks at the loading bay beside the public road.');
  assert.ok(ids(bay).includes('road?') && ids(bay).includes('plant'));
  assert.match(bay.categories.find((item) => item.id === 'road').dependsOn, /open to traffic/);
  assert.ok(ids(screen('Set out traffic control for work in the street with live traffic.')).includes('road'));
});

test('the scope\'s quotes only settle a likely category; on their own they add none', () => {
  const task = 'Install metal roof sheeting to the warehouse roof.';
  assert.deepEqual(ids(screen(task, {}, 'The roof is 9 m above ground level.')), ['fall']);
  assert.deepEqual(ids(screen('Clean the site and remove rubbish to the skip bins.', {}, 'Work near live HV overhead power lines and precast panels.')), []);
});

test('the categories match the SWMS\'s own list once the fall question is answered yes', () => {
  const task = 'Erect and strip formwork to suspended slabs and beams (Levels 1 to 12; conditions: Work at height at slab edges; plant: Props, formwork decking). Form soffit to support precast panels lifted by the crane.';
  const flag = screen(task, { kinds: ['formwork', 'craneInterface'] });
  const draft = prepareDraft({ state: 'qld', task, kinds: ['formwork', 'craneInterface'], fallRisk: 'yes', facts: {} });
  // The draft stands down for its questions, but the screen uses the same rules as a finished one.
  assert.equal(draft.kind, 'stand-down');
  assert.deepEqual(ids(flag).map((id) => id.replace('?', '')).sort(), ['fall', 'plant', 'precast']);
});

test('a category a SWMS question can still bring is listed as depends on', () => {
  const ict = screen('Install data cabling and outlets in ceilings and comms rooms.');
  assert.deepEqual(ids(ict), []);
  assert.deepEqual(ict.dependsOn.map((item) => item.id), ['electrical']);
  assert.match(ict.dependsOn[0].on, /near live electrical parts/);
  const split = screen('Install a split system air conditioner and charge it with refrigerant.');
  assert.ok(split.dependsOn.some((item) => item.id === 'atmosphere' && /A2L/.test(item.on)));
});

test('workshop work, and a building\'s shaft voids and formwork props, are not high risk work', () => {
  assert.deepEqual(screen('Fabricate roof flashings and steel brackets in the workshop.'), { categories: [], dependsOn: [] });
  // A shaft void runs through a building's floors; it is not a dig.
  assert.ok(!ids(screen('Erect and strip support to large air shaft voids (Levels 1 to 12; conditions: Work over open shaft voids; plant: Falsework supports).', { kinds: ['formwork'] })).some((id) => id.startsWith('trench')));
  // Props for new formwork in one activity and "remove nails" in another are not propping for a repair.
  assert.ok(!ids(screen('Strip formwork, backprop and re-shore slabs (plant: Props). Patch and make good concrete, fill tie holes and remove nails.', { kinds: ['formwork'] })).includes('temporary'));
  assert.ok(ids(screen('Install props to support the existing beam while the load-bearing wall is removed.')).includes('temporary'));
});

test('each state names the categories in its own words', () => {
  const task = 'Excavate trenches and lay stormwater pipes beside the highway.';
  const nsw = screenHighRisk({ state: 'nsw', task });
  assert.ok(nsw.categories.some((item) => item.id === 'trench' && /^Is carried out in or near a shaft or trench/.test(item.label)));
  const vic = screenHighRisk({ state: 'vic', task });
  assert.ok(vic.categories.some((item) => item.id === 'road'));
  assert.deepEqual(screenHighRisk({ state: 'nowhere', task }), { categories: [], dependsOn: [] });
});

// A small reading in the shape the AI gives, with no names of the parties.
const READING = {
  activities: [
    { activity: 'Erect and strip formwork to suspended slabs', type: 'Site work', package: 'Formwork', crew: 'Formworkers', clause: '3.1', quotes: ['Erect and strip all suspended slab formwork.'], where: 'Levels 1 to 12', plant: 'Props, formwork decking', conditions: 'Work at slab edges', unknowns: '', matrixColumn: '' },
    { activity: 'Form soffit to support precast spandrel panels', type: 'Site work', package: 'Formwork', crew: 'Formworkers', clause: '3.2', quotes: ['Support precast spandrels on the slab edge deck.'], where: 'Slab edges', plant: '', conditions: 'Precast panels lifted by crane alongside the deck', unknowns: '', matrixColumn: '' },
    { activity: 'Remove rubbish to the skip bins', type: 'Site work', package: 'Housekeeping and waste', crew: 'Labourers', clause: '7', quotes: ['Remove all rubbish daily.'], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' },
    { activity: 'Make formwork panels in the yard', type: 'Off-site work', package: 'Off-site fabrication', crew: 'Workshop', clause: '8', quotes: ['Prefabricate roof edge panels in the yard.'], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' },
    { activity: 'Attend site meetings', type: 'Duty', package: 'Supervision', crew: 'Supervisor', clause: '2', quotes: ['Attend weekly meetings.'], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' },
  ],
  byOthers: [],
  conflicts: [],
  packages: [
    { package: 'Formwork', groups: ['formwork', 'craneInterface'], byOthers: [], unknown: [], unmatched: [] },
    { package: 'Housekeeping and waste', groups: ['wasteRemoval'], byOthers: [], unknown: [], unmatched: [] },
    { package: 'Off-site fabrication', groups: [], byOthers: [], unknown: [], unmatched: [] },
  ],
};

test('every package with site work is flagged, from the task its card sends; duties are not', async () => {
  const flags = await packageHighRisk(settlePackages(READING), 'qld');
  assert.deepEqual(flags.map((item) => item.package), ['Formwork', 'Housekeeping and waste', 'Off-site fabrication']);
  const formwork = flags[0];
  const rows = READING.activities.filter((row) => row.package === 'Formwork');
  assert.deepEqual(formwork.categories, screenHighRisk({ state: 'qld', task: packageTask(rows), kinds: ['formwork', 'craneInterface'], leaveOut: [] }, rows.flatMap((row) => row.quotes).join('\n')).categories);
  assert.deepEqual(hrcwSummary(formwork).status, 'yes');
  assert.ok(flags[2].offSite);
  assert.equal(hrcwSummary(flags[2]).heading, 'Off-site work: not high risk construction work');
});

test('steps the scope gives to others are left out of the flag, as the card leaves them out', async () => {
  const reading = {
    ...READING,
    activities: [{ activity: 'Install data cabling in ceilings and comms rooms', type: 'Site work', package: 'Communications', crew: 'Cablers', clause: '5', quotes: ['Install all data cabling.'], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '' }],
    packages: [{ package: 'Communications', groups: ['cablePull'], byOthers: [{ group: 'cablePull', step: 'Pull cables', party: 'Builder', clause: '6', says: 'By the builder.' }], unknown: [], unmatched: [] }],
  };
  const [flag] = await packageHighRisk(reading, 'qld');
  assert.equal(flag.package, 'Communications');
  const task = packageTask(reading.activities);
  const left = screenHighRisk({ state: 'qld', task, kinds: ['cablePull'], leaveOut: ['Pull cables'] }, 'Install all data cabling.');
  assert.deepEqual({ categories: flag.categories, dependsOn: flag.dependsOn }, left);
});

test('the wording: high risk, likely, may be, none found, in plain words', () => {
  const yes = hrcwSummary({ categories: [{ short: 'Tilt-up or precast concrete', likely: false }, { short: 'Fall of more than 2 m', likely: true, dependsOn: 'the working height' }], dependsOn: [] });
  assert.equal(yes.status, 'yes');
  assert.equal(yes.tag, 'High risk');
  assert.equal(yes.heading, 'High risk construction work: a SWMS is required by law');
  assert.deepEqual(yes.lines, ['Tilt-up or precast concrete', 'Fall of more than 2 m: likely, depends on the working height']);
  const likely = hrcwSummary({ categories: [{ short: 'Fall of more than 2 m', likely: true, dependsOn: 'the working height' }], dependsOn: [] });
  assert.equal(likely.status, 'likely');
  assert.match(likely.heading, /^Likely high risk construction work: if it is, a SWMS is required by law\. The SWMS questions settle it$/);
  const maybe = hrcwSummary({ categories: [], dependsOn: [{ short: 'Confined space', on: 'whether a pit, tank or manhole entered is a confined space' }] });
  assert.equal(maybe.status, 'depends');
  assert.deepEqual(maybe.lines, ['Confined space: depends on whether a pit, tank or manhole entered is a confined space']);
  const none = hrcwSummary({ categories: [], dependsOn: [] });
  assert.equal(none.status, 'none');
  assert.equal(none.tag, '');
  assert.ok(none.lines.includes('A SWMS may still be required by the principal contractor.'));
  for (const text of [HRCW_NOTE, ...[yes, likely, maybe, none].flatMap((item) => [item.heading, ...item.lines])]) assert.doesNotMatch(text, /—|–/);
});

test('the page loads the shared wording, and the cards no longer promise marks they do not show', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /<script src="\/scope-task.js"><\/script>\s*<script src="\/scope-hrcw.js"><\/script>/);
  const page = fs.readFileSync(path.join(__dirname, '../public/scope.js'), 'utf8');
  assert.match(page, /hrcw: flags\.get\(pack\.name\)/);
  assert.doesNotMatch(page, /needsSwms: false/);
  assert.match(page, /\?state=\$\{encodeURIComponent\(body\.state/);
  assert.match(page, /report\.docx\?state=/);
});
