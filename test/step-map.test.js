// Goal 4: the job step groups the AI maps to a scope package give way to the package's own words
// (goal 4 pre-check, 10 October 2026). Signs put up with barricades, statutory signs and block plans
// are not signs put up from an EWP; a membrane on blockwork with no below ground place named is not
// below ground waterproofing; new louvres are not broken blades replaced; mesh or sarking away from
// any roof is not roof safety mesh. Each group still comes where its own words are named.
const test = require('node:test');
const assert = require('node:assert/strict');
const { packageKinds, suggestedKinds, prepareDraft } = require('../draft');
const { packageHighRisk, settlePackages } = require('../ai-scope');
const { packageTask } = require('../public/scope-task');

const ids = (flag) => flag.categories.map((item) => `${item.id}${item.likely ? '?' : ''}`);
const words = (task) => suggestedKinds(task, {}, {});

test('site signs with barricades, statutory signs and block plans are not sign installation', () => {
  assert.deepEqual(packageKinds('Install signage, barricades and access ways (conditions: Other trades working nearby). Provide task lighting (plant: Task lighting).', ['signageInstall', 'footpathClosure', 'tempPower']), ['footpathClosure', 'tempPower']);
  assert.deepEqual(packageKinds('Maintain fencing, temporary barricading and signage (Pool works area).', ['signageInstall', 'siteEstablish']), ['siteEstablish']);
  assert.deepEqual(packageKinds('Fix the project signs to the site hoarding.', ['signageInstall', 'siteEstablish']), ['siteEstablish']);
  assert.deepEqual(packageKinds('Install pool safety, first aid, depth and statutory signage and resuscitation chart (Pool area).', ['signageInstall', 'poolShell']), ['poolShell']);
  assert.deepEqual(packageKinds('Install regulatory signage and block plans (All buildings). Install permanent fire extinguishers and fire blankets with brackets, signage and lockable cabinets. Install bollards, protection frames and hazard signs.', ['fireAtHeight', 'signageInstall', 'bollards']), ['fireAtHeight', 'bollards']);
  assert.deepEqual(words('Install signage, barricades and access ways.'), []);
});

test('signs and screens put up from an EWP keep the sign installation steps', () => {
  for (const task of ['Install illuminated pylon signage at the car park entry.', 'Install shopfront signage to the facade from an EWP.', 'Install the LED screen and building signs on the parapet.', 'Install safety signs and the shopfront signage.']) {
    assert.ok(packageKinds(task, ['signageInstall']).includes('signageInstall'), task);
    assert.ok(words(task).includes('signageInstall'), task);
  }
  // Road signs put up with a road safety barrier are road work, not site signs.
  assert.ok(words('Install road safety barrier and signs.').includes('signageInstall'));
  assert.ok(words('Install regulatory and traffic signs on posts along the new road.').includes('signageInstall'));
  // A package whose words name no signs at all keeps what the AI chose.
  assert.deepEqual(packageKinds('Install the pylon and its footing.', ['signageInstall']), ['signageInstall']);
});

test('a membrane on blockwork above ground is the membrane steps, not below ground waterproofing', () => {
  assert.deepEqual(packageKinds('Apply membrane to external blockwork prior to render (Blockwork walls, Buildings 4 and 5 are blockwork).', ['belowGroundWp']), ['wpLiquid']);
  assert.deepEqual(packageKinds('Apply a membrane to the external walls before cladding.', ['belowGroundWp', 'wpLiquid']), ['wpLiquid']);
  for (const task of ['Waterproof the basement walls with a sheet membrane.', 'Apply a membrane to the retaining wall before backfill.', 'Tanking to the lift pit walls.', 'Apply membrane to blockwork below ground level.']) {
    assert.ok(packageKinds(task, ['belowGroundWp']).includes('belowGroundWp'), task);
  }
});

test('new louvres are not broken louvre blades; mesh away from a roof is not roof safety mesh', () => {
  assert.deepEqual(packageKinds('Install internal fixed louvres (all buildings). Install ductwork including access panels.', ['ductwork', 'louvreReplace']), ['ductwork']);
  assert.deepEqual(packageKinds('Replace the broken louvre blades in the classrooms.', ['louvreReplace']), ['louvreReplace']);
  assert.deepEqual(packageKinds('Install safety mesh in Common Services Riser penetrations (conditions: Open floor penetrations). Form openings through the roof for vents.', ['safetyMesh', 'edgeProtectionInstall']), ['edgeProtectionInstall']);
  assert.deepEqual(packageKinds('Install aluminium windows. Install insulation and sarking/vapour barriers. Install stainless steel mesh security screens to ground floor windows.', ['windowInstall', 'safetyMesh']), ['windowInstall']);
  assert.deepEqual(packageKinds('Install safety mesh (roof mesh) (Building 4 roof). Install bulk insulation blanket and sarking (Building 4 roof).', ['safetyMesh', 'insulation']), ['safetyMesh', 'insulation']);
});

// A reading as the AI gives it: the packages from the goal 4 pre-check (findings 22 and 33), mapped as the AI mapped them.
const row = (activity, pkg, extra = {}) => ({ activity, type: 'Site work', package: pkg, crew: 'Crew', clause: '1', quotes: [activity], where: '', plant: '', conditions: '', unknowns: '', matrixColumn: '', ...extra });
const READING = {
  activities: [
    row('Install signage, barricades and access ways', 'Site set-up', { conditions: 'Other trades working nearby' }),
    row('Provide task lighting', 'Site set-up', { plant: 'Task lighting' }),
    row('Apply membrane to external blockwork prior to render', 'Trade installation: external blockwork', { where: 'Blockwork walls (Buildings 4 and 5 are blockwork)' }),
  ],
  byOthers: [],
  conflicts: [],
  packages: [
    { package: 'Site set-up', groups: ['signageInstall', 'footpathClosure', 'tempPower'], byOthers: [], unknown: [], unmatched: [] },
    { package: 'Trade installation: external blockwork', groups: ['belowGroundWp'], byOthers: [], unknown: [], unmatched: [] },
  ],
};

test('a kept reading is read back with the groups its words allow, and no plant from the steps it lost', async () => {
  const reading = settlePackages(READING);
  assert.deepEqual(reading.packages.map((item) => item.groups), [['footpathClosure', 'tempPower'], ['wpLiquid']]);
  const flags = await packageHighRisk(reading, 'qld');
  assert.ok(!ids(flags[0]).includes('plant'), 'no EWP for barricade signs');
  assert.ok(!ids(flags[1]).includes('plant'), 'no excavator for a membrane on blockwork');
  // The SWMS for the blockwork membrane has the membrane steps, not digging beside the wall.
  const rows = READING.activities.filter((item) => item.package === 'Trade installation: external blockwork');
  const draft = prepareDraft({ state: 'qld', task: packageTask(rows), kinds: reading.packages[1].groups, fallRisk: 'no', residential: 'no', company: 'Test', workplace: 'Test site', principalContractor: 'Test builder', facts: {} });
  const steps = (draft.jobSteps || []).map((item) => item.step);
  assert.ok(steps.includes('Apply primers and liquid membranes'), steps.join('; '));
  assert.ok(!steps.includes('Waterproof walls below ground'));
});
