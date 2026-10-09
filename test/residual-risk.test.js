// Goals 2 and 3 (owner, 7 October 2026): hazards rated and residual risk shown, as the review
// checklist scores them (items 6 and 10); steps left High after their controls; lines that do not
// fit where the work is; the review section built from the task; and packages stood down for a
// matching fault.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const JSZip = require('jszip');
const { checkSwms: check, fromDraft } = require('../builder-check');
const { CHECK_SCHEMA, validSwms } = require('../check-read');
const { prepareDraft, packageKinds } = require('../draft');
const { riskFor } = require('../register');
const { draftToDocx } = require('../docx-draft');
const { draftToPdf } = require('../pdf-draft');

const TODAY = '2026-10-05';
const checkSwms = (input, options = {}) => check(input, { today: TODAY, ...options });
const item = (result, rule) => result.findings.find((finding) => finding.rule === rule);

// A short SWMS that passes every must-fix item, with its steps rated.
const RATED = Object.freeze({
  state: 'qld',
  task: 'Replace the metal roof sheets on a two storey house, 7 m to the eaves.',
  fallRisk: 'yes',
  site: { address: '12 Smith Street, Paddington QLD 4064', conditions: ['Access: scaffold stair on the east side.', 'Public: the footpath stays open behind a hoarding.'] },
  highRisk: ['Risk of a person falling more than 2 metres'],
  steps: [
    { step: 'Install roof edge protection', hazards: ['Falling from the roof edge.'], controls: ['A perimeter guardrail scaffold is installed around the roof edge before work starts.'], responsible: 'Scaffolder', riskBefore: 'High', riskAfter: 'Moderate' },
    { step: 'Remove and replace roof sheets', hazards: ['Falling through the open roof frame.'], controls: ['Safety mesh to AS/NZS 4389 is fixed under the new sheets before they are laid.'], responsible: 'Leading hand', riskBefore: 'High', riskAfter: 'Moderate' },
  ],
  responsiblePerson: 'Sam Lee, roofing supervisor',
  signatures: [{ name: 'Jo Smith', date: '5 October 2026' }],
  revision: '2', date: '5 October 2026', reviewDate: '5 November 2026', principalContractor: 'ABC Builders Pty Ltd',
});
const withSteps = (change) => ({ ...structuredClone(RATED), steps: RATED.steps.map((step, index) => ({ ...step, ...(index === 1 ? change : {}) })) });

test('W15: each step rated before and after its controls scores 4; a step not rated loses its share and never fails', () => {
  assert.equal(item(checkSwms(RATED), 'W15').points, 4);
  assert.equal(item(checkSwms(RATED), 'H9').pass, true);
  const unrated = checkSwms(withSteps({ riskBefore: '', riskAfter: '' }));
  assert.equal(item(unrated, 'W15').points, 2);
  assert.match(item(unrated, 'W15').message, /Rate the risk before and after the controls for each job step \(1 of 2/);
  assert.deepEqual(unrated.hardFails, []);
  // Scores written as numbers or letters are ratings too.
  assert.equal(item(checkSwms(withSteps({ riskBefore: '15', riskAfter: '6' })), 'W15').points, 4);
});

test('W15: a form with no rating fields is judged by whether a risk matrix is printed', () => {
  const bare = { ...structuredClone(RATED), steps: RATED.steps.map(({ riskBefore, riskAfter, ...step }) => step) };
  assert.equal(item(checkSwms(bare), 'W15').points, 0);
  assert.match(item(checkSwms(bare), 'W15').message, /Rate the risk of each job step before and after its controls/);
  assert.equal(item(checkSwms({ ...bare, riskMatrix: true }), 'W15').points, 4);
  assert.deepEqual(checkSwms(bare).hardFails, []);
});

test('H9: a step still High after its controls, with nothing said about it, is a must-fix item', () => {
  const open = checkSwms(withSteps({ riskAfter: 'High' }));
  assert.deepEqual(open.hardFails, ['H9']);
  assert.equal(open.band, 'Not accepted');
  assert.match(item(open, 'H9').message, /Remove and replace roof sheets/);
  assert.equal(item(open, 'W15').points, 3);
  for (const after of ['H', 'Extreme', 'Very high']) assert.deepEqual(checkSwms(withSteps({ riskAfter: after })).hardFails, ['H9'], after);
  // Telling the reader to add controls or accept the risk is not a response.
  assert.deepEqual(checkSwms(withSteps({ riskAfter: 'High', riskResponse: 'Where a rating is still High, add controls or have the supervisor accept the risk.' })).hardFails, ['H9']);
  // An acceptance with nobody named is not one either.
  assert.deepEqual(checkSwms(withSteps({ riskAfter: 'High', riskResponse: 'Risk accepted.' })).hardFails, ['H9']);
});

test('H9: a named acceptance, further controls, or a statement for the whole SWMS answers a High after the controls', () => {
  for (const riskResponse of ['Accepted in writing by Sam Lee before work starts.', 'Accepted by the site supervisor before the step starts.', 'Additional control: a second layer of safety mesh is fixed and inspected by the supervisor before sheets are laid.']) {
    const result = checkSwms(withSteps({ riskAfter: 'High', riskResponse }));
    assert.deepEqual(result.hardFails, [], riskResponse);
    assert.equal(item(result, 'W15').points, 4, riskResponse);
  }
  const wide = { ...withSteps({ riskAfter: 'High' }), riskAcceptance: 'Any residual risk rated High is accepted in writing by the project manager before work starts.' };
  assert.deepEqual(checkSwms(wide).hardFails, []);
});

test('the AI reading copies each step\'s ratings and its response, and a reading without them is still valid', () => {
  const step = CHECK_SCHEMA.properties.steps.items;
  for (const key of ['riskBefore', 'riskAfter', 'riskResponse']) assert.ok(step.required.includes(key), key);
  assert.ok(CHECK_SCHEMA.required.includes('riskAcceptance'));
  const reading = { task: 'x', siteAddress: '', responsiblePerson: '', consultation: '', revision: '', date: '', reviewDate: '', principalContractor: '', review: '', siteConditions: [], highRisk: [], ppe: [], licences: [], plant: [], emergency: [], legislation: [], signatures: [] };
  assert.ok(validSwms({ ...reading, steps: [{ step: 'a', hazards: [], controls: [], responsible: '', riskBefore: 'High', riskAfter: 'Low', riskResponse: '' }] }));
  assert.ok(validSwms({ ...reading, steps: [{ step: 'a', hazards: [], controls: [] }] }));
  assert.ok(!validSwms({ ...reading, steps: [{ step: 'a', hazards: [], controls: [], riskAfter: 3 }] }));
});

test('ratings: a higher order control of another kind does not lower a fatal hazard; crushed hands are a major injury', () => {
  // A pipe lifter answers the strain, not the fall.
  assert.equal(riskFor({ hazards: ['A fall from a platform or ladder.'], controls: ['Use pipe lifters or jacks to hold pipe overhead, rather than holding it up by hand.'] }).after.level, 'High');
  assert.equal(riskFor({ hazards: ['A fall from a platform or ladder.'], controls: ['Use platform ladders or a working platform, not the top steps of a stepladder.'] }).after.level, 'Moderate');
  // Mesh stops a fall through the roof, not a fall from its edge.
  assert.equal(riskFor({ hazards: ['A fall from the roof edge.'], controls: ['Sarking is laid only over mesh that is already fixed. No one stands on sarking between purlins.'] }).after.level, 'High');
  // Lines the step shares with an earlier step count for its rating.
  assert.equal(riskFor({ hazards: ['Contact with energised parts nearby.'], controls: ['Cable is paid out from drum stands.'] }, ['Where an exposed energised part is within 3 m, de-energise it or fit covers.']).after.level, 'Moderate');
  assert.equal(riskFor({ hazards: ['Crushed hands or feet placing rock.'], controls: [] }).before.consequence, 4);
  assert.equal(riskFor({ hazards: ['Back strain and crush handling heavy panels.'], controls: [] }).before.consequence, 4);
  assert.equal(riskFor({ hazards: ['A person is crushed by plant on skates, a pallet jack or a forklift.'], controls: [] }).before.consequence, 5);
  assert.equal(riskFor({ hazards: ['Contact with live UPS outputs and distribution boards in the comms room.'], controls: [] }).before.consequence, 5);
});

const SITE = { workplace: '12 Smith Street, Paddington QLD 4064', principalContractor: 'ABC Builders Pty Ltd', complianceResponsible: 'Sam Lee, supervisor', reviewer: 'Sam Lee, supervisor' };
const REO = { state: 'qld', fallRisk: 'no', residential: 'no', task: 'Lift reo bundles onto the suspended slab deck by crane, then place and tie the reo.', facts: { loadLimits: 'The deck takes 2.5 kPa of stacked reo, as the formwork design shows.' }, ...SITE };

const pdfText = async (draft) => {
  const raw = (await draftToPdf(draft)).toString('latin1');
  const text = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let body;
    try { body = zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1'); } catch { continue; }
    for (const array of body.match(/\[[^\]]*\]\s*TJ/g) || []) text.push((array.match(/<([0-9a-fA-F]*)>/g) || []).map((hex) => Buffer.from(hex.slice(1, -1), 'hex').toString('latin1')).join(''));
  }
  return text.join(' ').replace(/\s+/g, ' ');
};
const wordText = async (draft) => (await (await JSZip.loadAsync(await draftToDocx(draft))).file('word/document.xml').async('string')).replace(/<[^>]+>/g, '');

test('a step still High after its controls names who must accept it or add controls, in the draft, the Word file and the PDF', async () => {
  const draft = prepareDraft(REO);
  assert.equal(draft.kind, 'draft');
  const lift = draft.jobSteps.find((step) => step.step === 'Lift reo onto the deck');
  assert.equal(lift.risk.after.level, 'High');
  assert.equal(lift.risk.response, 'This step does not start until Sam Lee, supervisor, adds controls that lower this rating, or accepts the risk in writing.');
  // Every step is rated, Before starting included, and no step below High carries a response.
  assert.ok(draft.jobSteps.every((step) => step.risk && step.risk.before.level));
  assert.ok(draft.jobSteps.filter((step) => step.risk.after.level !== 'High').every((step) => !step.risk.response));
  assert.ok(draft.jobSteps.every((step) => !step.sharedControls));
  const result = checkSwms(fromDraft(draft, { state: 'qld', swms: { signatures: [{ name: 'Jo Smith', date: '5 October 2026' }] } }), { state: 'qld' });
  assert.equal(item(result, 'H9').pass, true);
  assert.equal(item(result, 'W15').points, 4);
  // Without the response the check sends it back.
  const bare = { ...draft, jobSteps: draft.jobSteps.map((step) => ({ ...step, risk: step.risk && { ...step.risk, response: '' } })) };
  assert.ok(checkSwms(fromDraft(bare, { state: 'qld' }), { state: 'qld' }).hardFails.includes('H9'));
  assert.match(await wordText(draft), /After: HighUnlikely x CatastrophicThis step does not start until Sam Lee, supervisor, adds controls/);
  assert.match(await pdfText(draft), /This step does not start until Sam Lee, supervisor,\s?adds controls/);
});

test('a step rated with controls printed once in an earlier step names that step in the Word file and the PDF', async () => {
  const draft = prepareDraft({ state: 'qld', fallRisk: 'no', residential: 'no', task: 'Install reticulation, cabling and cable management systems with supports. Provide task lighting.', kinds: ['containment', 'tempPower'], facts: { constructionTesting: 'Construction wiring is inspected and tested by our licensed electrician before first use and as AS/NZS 3012 sets.' }, ...SITE });
  assert.equal(draft.kind, 'draft');
  const cabling = draft.jobSteps.find((step) => step.step === 'Install cabling');
  assert.notEqual(cabling.risk.after.level, 'High');
  assert.deepEqual(cabling.seeAlso, ['Install cable tray and containment']);
  const n = draft.jobSteps.findIndex((step) => step.step === 'Install cable tray and containment') + 1;
  const note = `The controls in step ${n} (Install cable tray and containment) also apply here.`;
  assert.ok((await wordText(draft)).includes(note));
  assert.ok((await pdfText(draft)).includes(note));
  // The note is not a control: the builder check reads only the step's own lines.
  assert.ok(!fromDraft(draft).steps.some((step) => step.controls.includes(note)));
});

// The ward ceiling job from the goal 2 review, with its own site answers.
const WARD = 'Install cable trays and pull cables through the ward ceilings and risers from scissor lifts, inside the hospital building.';
const ward = (site, task = WARD) => prepareDraft({ state: 'qld', fallRisk: 'yes', residential: 'no', task, site, ...SITE,
  facts: { fallControl: 'Work is done from the scissor lift with its guardrails and gate closed.', harnessSystem: 'In the boom lift, the harness is clipped to the basket anchor point.' } });
const lines = (draft) => draft.jobSteps.flatMap((step) => step.controls);
const has = (draft, pattern) => lines(draft).some((line) => pattern.test(line));
const OUTDOOR = [/^Outdoors, stop in winds/, /^When lightning is within 10 km/, /^Wind is monitored on site/];
const LINES = [/Zone B of a power line/, /^If the EWP contacts a power line/];
const BOOM = [/^Every boom-type EWP used on site has a working secondary guarding/, /^Where a boom-type platform is used near soffits/, /^Near traffic, the boom's pivot point/, /^A telehandler is used as an EWP only/];

test('indoor scissor lift work leaves out the wind, lightning, traffic, power line and boom lift lines', () => {
  const inside = ward({ liveServices: 'Live 240 V lighting circuits in the ward ceilings stay on until the electrician isolates each floor.', publicInterface: 'Hospital staff and patients use the corridor next to level 3.' });
  assert.equal(inside.kind, 'draft');
  for (const pattern of [...OUTDOOR, ...LINES, ...BOOM]) assert.ok(!has(inside, pattern), pattern.source);
  // The rest of the platform's lines stay.
  assert.ok(has(inside, /^Tools and materials are carried inside the platform/));
  assert.ok(has(inside, /^Indoors, an electric EWP is used/));
});

test('in doubt, the lines stay: power lines named in the answers, outdoor work, or a platform other than a scissor lift', () => {
  const nearLines = ward({ liveServices: 'Overhead power lines run along the street.' });
  for (const pattern of LINES) assert.ok(has(nearLines, pattern), pattern.source);
  for (const pattern of OUTDOOR) assert.ok(!has(nearLines, pattern), pattern.source);
  const outside = ward({}, 'Install cable trays on the external walls from an EWP.');
  // (The soffit line is a harness line, left out here as before because the answer names a scissor lift.)
  for (const pattern of [...OUTDOOR, ...LINES, ...BOOM.filter((item) => !/soffits/.test(item.source))]) assert.ok(has(outside, pattern), pattern.source);
  const boom = ward({}, 'Install cable trays through the ward ceilings from scissor lifts and a boom lift, inside the hospital building.');
  for (const pattern of BOOM.slice(0, 2)) assert.ok(has(boom, pattern), pattern.source);
});

test('the review section is built from the task: who checks, the plant, the site conditions and the weather only outdoors', () => {
  const inside = ward({ liveServices: 'Live lighting circuits in the ceilings.', otherTrades: 'Fire services work in the same ceilings.' });
  assert.match(inside.review, /checked by Sam Lee, supervisor, at each pre-start/);
  assert.match(inside.review, /plant is brought in other than that listed here \(scissor lift, /);
  assert.match(inside.review, /the site conditions change \(live services and other trades\)/);
  assert.match(inside.review, /when a health and safety representative asks/);
  assert.match(inside.review, /given to the principal contractor before the changed work starts/);
  const outside = ward({}, 'Install cable trays on the external walls from an EWP.');
  assert.match(outside.review, /the site conditions change \(the weather\)/);
  assert.notEqual(inside.review, outside.review);
  // The builder check still finds when the controls are checked and what triggers a review.
  assert.equal(item(checkSwms(fromDraft(inside, { state: 'qld' }), { state: 'qld' }), 'W4').points, 6);
});

test('fly screens on upper levels keep the upper storey line when the task also names the ground floor', () => {
  const step = (task) => prepareDraft({ state: 'qld', fallRisk: 'no', task, facts: {} }).jobSteps.find((item) => /screens/.test(item.step));
  assert.ok(step('Install fly screens to the windows on all levels. Fit security screens to the ground floor windows.').controls.some((line) => /^Upper storey screens are fitted from inside/.test(line)));
  assert.ok(!step('Install fly screens to the ground floor windows.').controls.some((line) => /^Upper storey screens are fitted from inside/.test(line)));
});

test('packages stood down for a matching fault now get their steps', () => {
  // The AI chose no groups, but the words name a flood test or sealing on their own.
  assert.ok(packageKinds('Water test wet areas after tiling (Wet areas and bathroom set downs).', []).includes('floodTest'));
  assert.ok(packageKinds('Seal airshafts and ducts airtight (Airshafts and ducts).', []).includes('caulking'));
  // Groups the AI did choose are left as they are.
  assert.ok(!packageKinds('Lay floor tiles. Water test wet areas after tiling.', ['tileLay']).includes('floodTest'));
  const draft = (task, kinds, facts = {}) => prepareDraft({ state: 'qld', fallRisk: 'no', residential: 'no', task, kinds, facts, ...SITE });
  const traffic = draft('Provide traffic guidance schemes and traffic control for connections to the existing network.', ['road']);
  assert.equal(traffic.kind, 'draft');
  assert.ok(traffic.jobSteps.some((step) => step.step === 'Set up traffic management'));
  const reglets = draft('Saw cut reglets for flashings (Building 4 roof abutments).', ['silicaDrill'], { silicaControls: 'Reglets are cut with a wet saw and on-tool extraction, and the cutter wears a fit tested P2 respirator.' });
  assert.equal(reglets.kind, 'draft');
  // A package that is only rubbish removal is still not given these steps.
  assert.equal(draft('Provide spotter and barricade exclusion zones (Building 4).', []).kind, 'stand-down');
});
