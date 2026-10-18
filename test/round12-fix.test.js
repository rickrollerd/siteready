// Messy test round 12 (18 October 2026, staging went down part way): a forced scaffold question for a crew that
// does not erect scaffold, others' scaffold listed as the crew's work, brazing ticked from torch-on work and ticked
// again after it was unticked, puddle flanges with no step and no listing, the raw server message on both sign-in
// pages, a glazing task whose windows lost their step and whose shopfront doors were hung before the glass, and a
// hospital name from Places in lower case. The on-screen faults are also run in a browser (scratchpad/fix12).
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('../server');
const db = require('../db');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { nearbyCare } = require('../places');
const { setupAccounts, ANSWERED } = require('./helpers');
const { loadPage, settle, FakeEvent } = require('./fake-dom');

let server;
let base;
test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const post = (route, body) => fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Run 6's task as the foreman typed it, and as he typed it again.
const RUN6 = 'waterproof the level 4 podium deck and 12 apartment balconies on levels 2 to 6. grind the slab, vacuum the dust, prime, then 2 coats of liquid polyurethane membrane with fibreglass bandage at the corners and joints. fit puddle flanges at the floor wastes. flood test 24 hours before the tilers start. torch on bitumen sheet membrane to the plant room roof upstand with a gas torch. the builders scaffold is round the balcony edges and the podium has perimeter guardrails. materials go up in the builders hoist.';
const RUN6B = RUN6.replace('the builders scaffold is round the balcony edges and the podium has perimeter guardrails.', 'edge protection is by the builder: their scaffold round the balcony edges and perimeter guardrails on the podium.');
const RUN6_FACTS = {
  safetyDataSheet: 'Polyurethane membrane and its solvent primer: mixed and applied with the doors open for airflow, half-face respirator with organic vapour filters and chemical gloves, lids back on, stored in the bunded cabinet on level 4 away from the torch.',
  fallControl: 'Edge protection is installed around every open edge before work starts, and no one works outside it. The builder puts it up and keeps it in place.',
  silicaControls: 'Grinder with a shroud and an H-class vacuum on the tool, P2 respirators fit tested, and the written silica assessment for the grinding is kept in the site folder.',
  hotWorkPermit: 'Sullivans Cove Constructions issues the hot work permit each day. One crew member is fire watch while torching and for 60 minutes after, with a 9 kg dry chemical extinguisher.',
};
const ask = (task, extra = {}) => questionsFor(draftBody({ state: 'tas', fallRisk: 'yes', crane: 'none', task, ...extra }));
const draftOf = (task, extra = {}) => prepareDraft(draftBody({ ...ANSWERED, workplace: '60 Liverpool Street, Hobart TAS 7000', state: 'tas', fallRisk: 'yes', crane: 'none', task, ...extra }));
const asked = (questions) => (questions.required || []).map((item) => item.id);

// ---- 1. The scaffold question for a crew that does not erect scaffold ----

test('the builder\'s scaffold is not the crew\'s: no Scaffolding step, no Scaffold type, no scaffolding licence', () => {
  for (const task of [RUN6, RUN6B]) {
    const q = ask(task);
    assert.ok(!q.steps.chosen.includes('scaffold'), 'Scaffolding is not ticked');
    assert.ok(!asked(q).includes('scaffoldType'), 'Scaffold type is not asked');
    const draft = draftOf(task, { facts: RUN6_FACTS });
    assert.equal(draft.kind, 'draft');
    assert.ok(!draft.jobSteps.some((step) => /scaffold/i.test(step.step)));
    assert.ok(!(draft.qualifications || []).some((item) => /scaffold/i.test(JSON.stringify(item))), 'no scaffolding licence');
    const scaffold = (draft.plant || []).find((item) => item.item === 'Scaffold');
    if (scaffold) assert.match(scaffold.licence, /^Erected and altered only by a licensed scaffolder .* Our crew uses it and does not alter it$/);
  }
  // "Builder" is not "build", and others' scaffolds and what the crew does not do to one are not erection.
  for (const task of ['Waterproof the balconies from the builder\'s scaffold.', 'Waterproof the balconies. Use the builders scaffold.', 'Waterproof the balconies. We do not alter the scaffold.', 'Waterproof the balconies. The scaffold is erected by the builder.', 'Waterproof the balconies. Their scaffold stays up.']) {
    assert.ok(!asked(ask(task)).includes('scaffoldType'), task);
  }
  // A crew that does put up its scaffold is still asked.
  assert.ok(asked(ask('Erect, alter and dismantle the perimeter scaffold.')).includes('scaffoldType'));
  assert.ok(asked(ask('Build a scaffold round the balconies, then waterproof them.')).includes('scaffoldType'));
});

test('unticking Scaffolding takes "Scaffold type" away, and "Not our work" takes the scaffold steps and licence off', () => {
  const task = 'Erect the perimeter scaffold round the balconies, then waterproof the balconies with a liquid membrane.';
  const first = ask(task);
  assert.ok(first.steps.chosen.includes('scaffold'));
  const type = first.required.find((item) => item.id === 'scaffoldType');
  assert.deepEqual(type.choices[type.choices.length - 1], { value: 'byOthers', label: 'Not our work: the scaffold is by others' });
  // Unticked: not asked, and the draft does not wait for it.
  const kinds = first.steps.chosen.filter((id) => id !== 'scaffold');
  assert.ok(!asked(ask(task, { kinds })).includes('scaffoldType'));
  const facts = { fallControl: 'Guardrails on the scaffold, and the crew works inside them.', safetyDataSheet: 'Water based membrane: SDS at the work area, nitrile gloves and goggles.' };
  const unticked = draftOf(task, { kinds, facts });
  assert.equal(unticked.kind, 'draft', JSON.stringify(unticked.missing));
  // "Not our work" with the steps still ticked: the answer stays on the page, the scaffold steps come off, the
  // scaffold prints as used and not altered, and no scaffolding licence prints.
  const byOthers = { ...facts, scaffoldType: 'byOthers', systemInstructions: 'Not our work.' };
  const again = ask(task, { kinds: first.steps.chosen, facts: byOthers });
  assert.ok(asked(again).includes('scaffoldType'), 'the answer stays shown');
  assert.ok(!again.steps.chosen.includes('scaffold'));
  const draft = draftOf(task, { kinds: first.steps.chosen, facts: byOthers });
  assert.equal(draft.kind, 'draft', JSON.stringify(draft.missing));
  assert.ok(!draft.jobSteps.some((step) => /^(?:Erect|Dismantle) the scaffold$/.test(step.step)));
  assert.ok(!(draft.qualifications || []).some((item) => /scaffold/i.test(JSON.stringify(item))));
  assert.match(draft.plant.find((item) => item.item === 'Scaffold').licence, /Our crew uses it and does not alter it$/);
  // A real type still prints its licence class.
  const modular = draftOf(task, { facts: { ...facts, scaffoldType: 'modular', systemInstructions: 'Layher Allround to the supplier\'s instructions, revision 3; crew trained by the supplier.' } });
  assert.ok(modular.jobSteps.some((step) => step.step === 'Erect the scaffold'));
  assert.match(modular.plant.find((item) => item.item === 'Scaffold').licence, /SB or higher/);
});

// ---- 2. Work by others is not listed as the crew's work with no steps ----

test('others\' scaffold and guardrails are not listed as work with no job steps', () => {
  for (const task of [RUN6, RUN6B]) {
    const draft = draftOf(task, { facts: RUN6_FACTS });
    assert.ok(!(draft.notCovered || []).some((part) => /scaffold|guardrails/i.test(part)), JSON.stringify(draft.notCovered));
  }
  // The crew's own work after a colon is still read.
  const own = draftOf('Waterproofing: fit puddle flanges at the floor wastes, then apply the liquid membrane.', { facts: RUN6_FACTS });
  assert.ok((own.notCovered || []).includes('fit puddle flanges at the floor wastes'));
});

// ---- 3. Brazing from torch-on work, and an unticked step through Continue ----

test('torch-on membrane work does not tick "Brazing and soldering (hot work)"; brazing named still does', () => {
  assert.ok(!ask(RUN6).steps.chosen.includes('hotWork'));
  assert.ok(ask(RUN6).steps.chosen.includes('wpTorch'));
  assert.ok(!ask('Torch on bitumen sheet membrane to the roof with a gas torch.').steps.chosen.includes('hotWork'));
  assert.ok(ask('Torch on the roof membrane, and braze the copper flashing joints.').steps.chosen.includes('hotWork'));
  assert.ok(ask('Braze the copper pipe joints with a gas torch.').steps.chosen.includes('hotWork'));
});

test('a step unticked by hand stays unticked when the task is changed and Continue is pressed again', async () => {
  const task = 'Torch on the roof membrane with a gas torch, and braze the copper flashing joints.';
  assert.ok(ask(task).steps.chosen.includes('hotWork'));
  // The server: the steps found in the words, less those unticked.
  const body = draftBody({ state: 'tas', fallRisk: 'yes', crane: 'none', task: `${task} Materials go up in the hoist.`, kindsOff: ['hotWork'] });
  assert.ok(Array.isArray(body.kinds) && body.kinds.includes('wpTorch') && !body.kinds.includes('hotWork'));
  const response = await post('/api/draft/questions', { state: 'tas', fallRisk: 'yes', crane: 'none', task: `${task} Materials go up in the hoist.`, kindsOff: ['hotWork'] });
  assert.ok(!(await response.json()).steps.chosen.includes('hotWork'));
  // Picks of the user's own win over it.
  assert.deepEqual(draftBody({ state: 'tas', fallRisk: 'yes', task, kinds: ['hotWork'], kindsOff: ['hotWork'] }).kinds, ['hotWork']);
  // The page: an untick is kept as the user's, and sent while the steps follow the new words.
  const bodies = [];
  const page = loadPage(['app.js'], (method, route, sent) => {
    if (route.endsWith('/api/draft/questions')) { bodies.push(sent); return { body: { required: [], weak: [], steps: { chosen: [], suggested: [] } } }; }
    return { body: {} };
  });
  await settle();
  const change = new FakeEvent('change');
  change.target = { matches: (selector) => selector === '[data-step]', checked: false, value: 'hotWork' };
  page.document.getElementById('steps-block').dispatchEvent(change);
  await settle();
  // Continue with changed words starts again from the steps found in them (stepPicks null).
  page.run('stepPicks = null;');
  const sent = page.run('payload()');
  assert.equal(sent.kinds, undefined);
  assert.deepEqual([...sent.kindsOff], ['hotWork']);
  // Ticked again by hand, it is no longer held off.
  const tick = new FakeEvent('change');
  tick.target = { matches: (selector) => selector === '[data-step]', checked: true, value: 'hotWork' };
  page.document.getElementById('steps-block').dispatchEvent(tick);
  await settle();
  page.run('stepPicks = null;');
  assert.equal(page.run('payload()').kindsOff, undefined);
  // Only a new task, a task picked in its place or a reset clears it: Continue does not.
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const submit = source.slice(source.indexOf("document.getElementById('start').addEventListener('submit'"), source.indexOf('// Job steps: null follows'));
  // Continue only lets the scope reading's or pick list's own steps for a task picked in its place show ticked
  // (messy round 14: an untick by hand is otherwise kept, see test/round14-flow.test.js).
  assert.doesNotMatch(submit.replace('if (stepPicks) stepPicks.forEach((id) => stepsOff.delete(id));', ''), /stepsOff/);
});

// ---- 4. Puddle flanges ----

test('"fit puddle flanges at the floor wastes" is listed as work with no job steps; cast-in puddle flanges keep their step', () => {
  const draft = draftOf(RUN6, { facts: RUN6_FACTS });
  assert.deepEqual(draft.notCovered, ['fit puddle flanges at the floor wastes']);
  const castIn = prepareDraft(draftBody({ ...ANSWERED, state: 'nsw', fallRisk: 'yes', crane: 'none', task: 'Fix cast-in sleeves and puddle flanges on the deck before the pour.', facts: { fallControl: 'Edge protection is installed around every open edge of the deck before work starts.' } }));
  assert.ok(castIn.jobSteps.some((step) => step.step === 'Install cast-in sleeves and puddle flanges on the deck before the pour'));
  assert.deepEqual(castIn.notCovered || [], []);
});

// ---- 6. Glazing: windows named apart from a shopfront, and shopfront doors after the glass ----

test('windows named beside shopfront glass keep "Install windows", and a shopfront\'s doors are hung after its glass', () => {
  // Run 4's words: the pick list task with her own words added.
  const task = 'Install aluminium windows, external doors and louvres: move the glass and frames to the levels, install the windows, fit the door hardware, and seal the glazing and flashings. 3 storey office, windows to levels 1 and 2 fitted from inside, scissor lift for the high shopfront glass';
  const facts = { fallControl: 'Windows are fitted from inside behind the edge protection; the shopfront glass from a scissor lift with guardrails.', safetyDataSheet: 'Glazing silicone: SDS at the work area, nitrile gloves.' };
  const draft = prepareDraft(draftBody({ ...ANSWERED, workplace: '45 Adelaide Terrace, East Perth WA 6004', state: 'wa', fallRisk: 'yes', crane: 'none', task, facts }));
  const names = draft.jobSteps.map((step) => step.step);
  assert.ok(names.includes('Install windows'), names.join(' / '));
  assert.ok(!names.includes('Install the shopfront frames'));
  // A shopfront on its own: frames, then the glass, then the doors.
  const shop = prepareDraft(draftBody({ ...ANSWERED, workplace: '45 Adelaide Terrace, East Perth WA 6004', state: 'wa', fallRisk: 'no', crane: 'none', task: 'Install the aluminium shopfront: frames, glass and the glass entry doors, then seal the glazing.', kinds: ['glassHandle', 'windowInstall', 'glazingSeal', 'hardwareFit'], facts }));
  const order = shop.jobSteps.map((step) => step.step);
  assert.ok(order.indexOf('Install the shopfront frames') < order.indexOf('Handle and install glass panels'));
  assert.ok(order.indexOf('Handle and install glass panels') < order.indexOf('Hang the shopfront doors'), order.join(' / '));
  assert.ok(order.indexOf('Hang the shopfront doors') < order.indexOf('Fit locks, closers and other hardware'));
});

// ---- 7. A hospital name from Places in lower case ----

test('a hospital Google names in lower case is offered and printed with its capitals', async () => {
  const saved = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = 'test-key';
  try {
    const place = (name, id, lat) => ({ id, displayName: { text: name }, formattedAddress: `${name}, Hobart TAS 7000, Australia`, location: { latitude: lat, longitude: 147.33 }, primaryType: 'hospital' });
    const fetchImpl = async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.pageSize === 1) return { ok: true, json: async () => ({ places: [{ location: { latitude: -42.88, longitude: 147.33 }, formattedAddress: '60 Liverpool Street, Hobart TAS 7000, Australia' }] }) };
      if (body.includedPrimaryTypes && body.includedPrimaryTypes.includes('hospital')) return { ok: true, json: async () => ({ places: [place('Royal Hobart Hospital', 'a', -42.881), place('new norfolk public hospital', 'b', -42.78)] }) };
      return { ok: true, json: async () => ({ places: [] }) };
    };
    const care = await nearbyCare('60 Liverpool Street, Hobart TAS 7000', { fetchImpl });
    const names = care.hospitals.map((item) => item.name);
    assert.ok(names.includes('New Norfolk Public Hospital'), names.join(' / '));
    assert.ok(names.includes('Royal Hobart Hospital'));
  } finally {
    if (saved === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = saved;
  }
  const draft = draftOf('Apply the liquid membrane to the bathroom floors.', { fallRisk: 'no', hospital: 'new norfolk public hospital', facts: { safetyDataSheet: 'Water based membrane: SDS at the work area, nitrile gloves.' } });
  assert.equal(draft.hospital, 'New Norfolk Public Hospital');
  assert.match(JSON.stringify(draft.emergency), /Nearest hospital: New Norfolk Public Hospital/);
});

// ---- 5. The raw server message when the database fails (last: it swaps the database) ----

test('with the database down, both sign-in pages say plainly that the email could not be sent', async () => {
  const down = { query: async () => { throw new Error('getaddrinfo ENOTFOUND postgres.railway.internal'); }, on() {} };
  const warn = console.error;
  console.error = () => {};
  db.useDatabase(down);
  try {
    const siteWrite = await post('/api/auth/email', { email: 'foreman@derwent.test' });
    assert.equal(siteWrite.status, 500);
    assert.equal((await siteWrite.json()).message, 'SiteWrite could not send the sign-in email just now. Try again in a few minutes.');
    const siteLink = await post('/api/hse/email', { email: 'lead@builder.test' });
    assert.equal(siteLink.status, 500);
    assert.equal((await siteLink.json()).message, 'SiteLink could not send the sign-in email just now. Try again in a few minutes.');
    // Other pages get a plain message for what they were doing, never the database's words.
    for (const [route, said] of [['/api/auth/verify', /^SiteWrite could not sign you in just now\./], ['/api/hse/verify', /^SiteLink could not sign you in just now\./]]) {
      const response = await post(route, { token: 'a'.repeat(40) });
      const { message } = await response.json();
      assert.doesNotMatch(message, /ENOTFOUND|statement could not be prepared|postgres/i, route);
      if (response.status >= 500) assert.match(message, said, route);
    }
    // A signed-in page asks again: the session check says SiteWrite is busy, as before.
    const signedIn = await fetch(`${base}/api/company`, { headers: { Authorization: 'Bearer abc' } });
    assert.equal((await signedIn.json()).message, 'SiteWrite is busy. Try again in a moment.');
  } finally {
    console.error = warn;
    await setupAccounts();
  }
});
