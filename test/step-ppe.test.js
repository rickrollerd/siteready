// PPE for all work and PPE for particular steps (owner, D246 and D247, 13 October 2026): grinding
// needs a face shield over safety glasses, in its step and in the PPE table; placing and fixing reo
// needs only safety glasses for all work. The user can untick an item, move it to all work or add one
// to a step, and those changes are learned from (D212). One garment to each clothing box (D248).
const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { prepareDraft, questionsFor, suggestedPpe } = require('../draft');
const { draftBody } = require('../input');
const { draftToDocx } = require('../docx-draft');
const { draftToPdf } = require('../pdf-draft');
const { splitPpe, ppeChanges, stepPpeLine } = require('../step-ppe');
const bc = require('../builder-check');

const SITE = { state: 'qld', fallRisk: 'no', residential: 'no', company: 'Test', workplace: '12 Smith Street, Paddington QLD 4064', principalContractor: 'ABC Builders Pty Ltd' };
const CONCRETE = 'Saw cut and grind the concrete slab, then form, place reo and pour the new slab.';
const REO = 'Place and fix reo for the ground slab.';
const { answersFor } = require('../presets');
// The questions answered as a user would, with the standard answers.
function answered(input) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor({ ...input, facts });
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id]) continue;
      facts[item.id] = item.choices ? item.choices[0].value : ((answersFor(item.id, asked.task)[0] || {}).text || 'As set out in the site plan.').replace(/_{3,}/g, 'as on the site plan');
      added = true;
    }
    if (!added) break;
  }
  return { ...input, facts };
}
const draftOf = (input) => prepareDraft(draftBody(answered(input)));
const ticked = (draft) => draft.ppe.flatMap((group) => group.items.filter((item) => item.ticked));
const allWork = (draft) => ticked(draft).filter((item) => !item.steps).map((item) => item.id);
const forSteps = (draft, id) => (ticked(draft).find((item) => item.id === id) || {}).steps;
const step = (draft, name) => draft.jobSteps.find((item) => item.step === name);
const wearLine = (draft, name) => step(draft, name).controls.filter((line) => /^Wear /.test(line));

test('a grinding and saw cutting step gets a face shield over safety glasses, in the step and in the PPE table', async () => {
  const draft = draftOf({ ...SITE, task: CONCRETE });
  assert.equal(draft.kind, 'draft');
  assert.ok(!allWork(draft).includes('faceShield'), 'not for all work');
  // One pair of safety glasses for all work (messy-user test, 14 October 2026).
  assert.equal(allWork(draft).filter((id) => /^glasses/.test(id)).length, 1, 'safety glasses for all work');
  const shield = forSteps(draft, 'faceShield');
  for (const name of ['Saw cut concrete', 'Prepare and grind floors']) {
    assert.ok(shield.includes(name), name);
    assert.ok(wearLine(draft, name).some((line) => /\ba face shield over safety glasses\b/.test(line)), `${name}: ${wearLine(draft, name)}`);
  }
  // The line is cited as the library's own face shield lines are (the plant code s 2.3).
  assert.match(wearLine(draft, 'Saw cut concrete').join(' '), /Managing risks of plant in the workplace Code of Practice 2021 \(Qld\) s 2\.3/);
  // Steps that do not grind or cut have no face shield.
  assert.ok(!shield.includes('Lift reo onto the deck'));
  // The Word file prints the table of items for particular steps.
  const xml = await (await JSZip.loadAsync(await draftToDocx(draft))).file('word/document.xml').async('string');
  const words = xml.replace(/<[^>]+>/g, '');
  assert.match(words, /For all work/);
  assert.match(words, /For particular steps/);
  assert.ok(words.includes(`Face shield${shield.join('; ')}`), 'Face shield row with its steps');
  // The PDF is made too.
  const pdf = await draftToPdf(draft);
  assert.ok(pdf.length > 1000);
});

test('a reo placing SWMS has only safety glasses for all work; a face shield is only while grinding or cutting bars', () => {
  const draft = draftOf({ ...SITE, task: REO });
  assert.equal(draft.kind, 'draft');
  const eyes = draft.ppe.find((group) => group.area === 'Eyes and face').items.filter((item) => item.ticked && !item.steps).map((item) => item.id);
  assert.deepEqual(eyes.filter((id) => !['glassesClear', 'glassesTinted'].includes(id)), [], `all work eyes: ${eyes}`);
  assert.equal(eyes.length, 1, 'one pair of safety glasses');
  assert.deepEqual(forSteps(draft, 'faceShield'), ['Place and tie reo']);
  assert.deepEqual(wearLine(draft, 'Place and tie reo').map((line) => line.replace(/ \(.*\)$/, '')), ['Wear a face shield over safety glasses while grinding or cutting.']);
});

test('the user can move an item to all work, untick it, or add an item to a step', () => {
  const suggested = draftOf({ ...SITE, task: CONCRETE });
  const ids = ticked(suggested).map((item) => item.id);
  // Moved to all work: no step line, and it is ticked for all work.
  const moved = draftOf({ ...SITE, task: CONCRETE, ppe: ids, ppeSteps: { faceShield: 'all' } });
  assert.ok(allWork(moved).includes('faceShield'));
  assert.equal(forSteps(moved, 'faceShield'), undefined);
  assert.ok(!wearLine(moved, 'Saw cut concrete').some((line) => /face shield/.test(line)));
  // Unticked: gone from the table and the steps.
  const off = draftOf({ ...SITE, task: CONCRETE, ppe: ids.filter((id) => id !== 'faceShield') });
  assert.ok(!ticked(off).some((item) => item.id === 'faceShield'));
  assert.ok(!off.jobSteps.some((item) => item.controls.some((line) => /^Wear [^.]*face shield/.test(line))));
  // Added to a step: knee pads in the reo step only, said there.
  const added = draftOf({ ...SITE, task: CONCRETE, ppe: [...ids, 'kneePads'], ppeSteps: { kneePads: ['Place and tie reo'] } });
  assert.deepEqual(forSteps(added, 'kneePads'), ['Place and tie reo']);
  assert.ok(wearLine(added, 'Place and tie reo').some((line) => /\bknee pads\b/.test(line)));
  assert.ok(!wearLine(added, 'Saw cut concrete').some((line) => /\bknee pads\b/.test(line)));
  // A step that no longer prints is dropped: the item goes where SiteWrite would put it.
  const gone = draftOf({ ...SITE, task: CONCRETE, ppe: [...ids, 'kneePads'], ppeSteps: { kneePads: ['A step that is not here'] } });
  assert.ok(!(forSteps(gone, 'kneePads') || []).includes('A step that is not here'));
  assert.ok(ticked(gone).some((item) => item.id === 'kneePads'));
});

test('the questions page is given PPE for all work and for particular steps, with the steps to add to', () => {
  const asked = questionsFor({ ...SITE, task: CONCRETE });
  const items = asked.ppe.flatMap((group) => group.items);
  assert.ok(items.find((item) => item.id === 'faceShield').steps.includes('Saw cut concrete'));
  assert.ok(items.find((item) => item.id === 'hardHat').ticked && !items.find((item) => item.id === 'hardHat').steps);
  assert.equal(items.find((item) => item.id === 'hardHat').forSteps, false);
  assert.equal(items.find((item) => item.id === 'kneePads').forSteps, true);
  assert.ok(asked.ppeSteps.includes('Place and tie reo'));
  // The user's own placement is kept when the questions are asked again.
  const again = questionsFor({ ...SITE, task: CONCRETE, ppeSteps: { faceShield: 'all' } });
  assert.equal(again.ppe.flatMap((group) => group.items).find((item) => item.id === 'faceShield').steps, undefined);
});

test('the user\'s PPE changes are worked out against the suggestion, for the learning store', () => {
  const input = answered({ ...SITE, task: CONCRETE });
  const before = suggestedPpe(input);
  const ids = before.flatMap((group) => group.items.filter((item) => item.ticked).map((item) => item.id));
  const changed = { ...input, ppe: [...ids.filter((id) => id !== 'goggles'), 'kneePads'], ppeSteps: { faceShield: 'all', kneePads: ['Place and tie reo'] } };
  const draft = prepareDraft(draftBody(changed));
  assert.equal(draft.kind, 'draft');
  const changes = ppeChanges(before, draft.ppe, changed);
  const has = (kind, item, stepName) => changes.some((change) => change.kind === kind && change.item === item && (stepName === undefined || change.step === stepName));
  assert.ok(has('ppeToAllWork', 'Face shield', 'Saw cut concrete'), JSON.stringify(changes));
  assert.ok(has('ppeStepAdded', 'Knee pads', 'Place and tie reo'));
  assert.ok(has('ppeStepRemoved', 'Goggles'));
  // SiteWrite's own placements are not counted as the user's: no change, nothing to learn.
  assert.deepEqual(ppeChanges(before, prepareDraft(input).ppe, input), []);
});

test('the user\'s PPE changes are recorded in the learning store when it is on', async (t) => {
  const db = require('../db');
  const { recordControlEdits } = require('../control-learning');
  const rows = [];
  t.mock.method(db, 'enabled', () => true);
  t.mock.method(db, 'query', async (sql, params) => {
    if (/^\s*INSERT INTO control_edit_events/.test(sql)) { rows.push({ step: params[8], kind: params[9], original: params[11] }); return [{ id: params[0] }]; }
    return [];
  });
  const input = answered({ ...SITE, task: CONCRETE });
  const ids = suggestedPpe(input).flatMap((group) => group.items.filter((item) => item.ticked).map((item) => item.id));
  const changed = { ...input, ppe: ids, ppeSteps: { faceShield: 'all' } };
  const draft = prepareDraft(draftBody(changed));
  process.env.CONTROL_LEARNING = 'on';
  try {
    assert.ok(await recordControlEdits(draft, changed, { company: { id: 'c' }, swmsId: 's1', revision: 1 }) > 0);
  } finally {
    delete process.env.CONTROL_LEARNING;
  }
  assert.ok(rows.some((row) => row.kind === 'ppeToAllWork' && row.original === 'Face shield' && row.step === 'Saw cut concrete'), JSON.stringify(rows));
  // Off, nothing is recorded.
  rows.length = 0;
  assert.equal(await recordControlEdits(draft, changed, { company: { id: 'c' }, swmsId: 's1', revision: 1 }), 0);
  assert.equal(rows.length, 0);
});

test('a PPE item for one step still counts in the builder check\'s PPE list', () => {
  const draft = draftOf({ ...SITE, task: CONCRETE });
  const swms = bc.fromDraft(draft, { state: 'qld' });
  assert.ok(swms.ppe.includes('Face shield'));
  assert.ok(swms.ppe.includes('Hard hat'));
  // Each step's own PPE line is checkable, and is not counted as length.
  assert.ok(swms.stepPpeLines.length > 0 && swms.stepPpeLines.every((line) => /^Wear /.test(line)));
  const check = bc.checkSwms(swms, { state: 'qld' });
  const without = bc.checkSwms({ ...swms, steps: swms.steps.map((item) => ({ ...item, controls: item.controls.filter((line) => !swms.stepPpeLines.includes(line)) })), stepPpeLines: [] }, { state: 'qld' });
  const points = (result, rule) => result.findings.find((item) => item.rule === rule).points;
  assert.ok(points(check, 'W3') >= points(without, 'W3'));
  assert.equal(points(check, 'W8'), points(without, 'W8'));
  assert.equal(points(check, 'W2'), points(without, 'W2'), 'not counted as PPE controls: the PPE table is not either');
});

test('a step\'s own PPE line is judged as PPE for hierarchy order, though it names insulated gloves', () => {
  // "Insulated" alone reads as an engineering control; at the end of the step it is the step's PPE.
  const draft = draftOf({ ...SITE, task: CONCRETE });
  const swms = bc.fromDraft(draft, { state: 'qld' });
  const line = 'Wear insulated electrical gloves.';
  const steps = swms.steps.map((item) => ({ ...item, controls: [...item.controls, line] }));
  const points = (result) => result.findings.find((item) => item.rule === 'W10').points;
  const asPpe = bc.checkSwms({ ...swms, steps, stepPpeLines: [...swms.stepPpeLines, line] }, { state: 'qld' });
  assert.equal(points(asPpe), points(bc.checkSwms(swms, { state: 'qld' })));
  // Written by the user as an ordinary line, it is judged by its words as before.
  assert.ok(points(bc.checkSwms({ ...swms, steps }, { state: 'qld' })) < points(asPpe));
});

test('the step line does not repeat PPE a line of the step already states', () => {
  const stepWith = { step: 'Cut blocks and bricks', hazards: ['Silica dust.'], controls: ['Use a brick saw with its blade guarded, isolate the cutting area and wear a face shield.', 'Wear hearing protection.'] };
  assert.equal(stepPpeLine(stepWith, ['faceShield', 'earMuffs']), null);
  assert.equal(stepPpeLine(stepWith, ['faceShield', 'earMuffs', 'gloveCut']), 'Wear cut resistant gloves.');
  // Ear plugs and ear muffs both ticked are one choice.
  assert.equal(stepPpeLine({ step: 'Drill', hazards: [], controls: [] }, ['earPlugs', 'earMuffs']), 'Wear ear muffs or ear plugs.');
});

test('items no step names, and items every step needs, stay for all work', () => {
  const ppe = [{ area: 'Hands', items: [{ id: 'gloveGeneral', label: 'General purpose gloves', ticked: false }, { id: 'gloveChemical', label: 'Chemical resistant gloves', ticked: true }] },
    { area: 'Knees', items: [{ id: 'kneePads', label: 'Knee pads', ticked: true }] }];
  const steps = [{ step: 'Before starting', hazards: [], controls: [] }, { step: 'Lay tiles', hazards: ['Kneeling for long periods.'], controls: ['Spread the tile adhesive.'] }, { step: 'Seal the grout', hazards: [], controls: ['Apply the sealer as its safety data sheet sets out.'] }];
  const split = splitPpe(ppe, steps, { suggest: true });
  const item = (id) => split.flatMap((group) => group.items).find((other) => other.id === id);
  assert.deepEqual(item('kneePads').steps, ['Lay tiles']);
  // Chemical gloves: both steps name adhesive or a safety data sheet, so all work.
  assert.equal(item('gloveChemical').steps, undefined);
  assert.equal(item('gloveGeneral').ticked, false);
});

test('clothing is one garment to a box, and old clothing ticks are read as the new ones (D248)', () => {
  const draft = draftOf({ ...SITE, task: REO });
  const body = draft.ppe.find((group) => group.area === 'Body').items;
  assert.deepEqual(body.slice(0, 4).map((item) => item.label), ['Long sleeves', 'Short sleeves', 'Long pants', 'Shorts']);
  assert.deepEqual(body.filter((item) => item.ticked && /sleeves|pants|Shorts/i.test(item.label)).map((item) => item.id), ['sleevesLong', 'pantsLong']);
  assert.deepEqual(draftBody({ ...SITE, task: REO, ppe: ['hardHat', 'sleevesShorts'] }).ppe, ['hardHat', 'sleevesLong', 'shorts']);
  assert.deepEqual(draftBody({ ...SITE, task: REO, ppe: ['siteClothing', 'longs'] }).ppe, ['sleevesLong', 'pantsLong']);
  // A saved SWMS's old ticks print as the new boxes.
  const saved = prepareDraft({ ...SITE, task: REO, ppe: ['hardHat', 'siteClothing', 'boots'] });
  assert.deepEqual(ticked(saved).map((item) => item.id).filter((id) => /sleeves|pants|shorts/i.test(id)), ['sleevesLong', 'pantsLong']);
});

test('the page: PPE for all work and for particular steps, where the user put items sent with the draft, and both shown in it', async () => {
  const { loadPage, settle } = require('./fake-dom');
  const p = loadPage(['gate-rules.js', 'app.js'], () => ({ body: {} }));
  await settle();
  const asked = questionsFor(answered({ ...SITE, task: CONCRETE }));
  p.run(`drawPpe(${JSON.stringify(asked.ppe)}, ${JSON.stringify(asked.ppeSteps)})`);
  const block = () => p.document.getElementById('ppe-block').innerHTML;
  assert.match(block(), /<h3 class="ppe-head">For all work<\/h3>/);
  assert.match(block(), /<h3 class="ppe-head">For particular steps<\/h3>/);
  assert.match(block(), /data-ppe-step value="faceShield" checked> Face shield<\/label>\s*<span class="step-names">[^<]*Saw cut concrete/);
  assert.match(block(), /data-ppe value="faceShield"> Face shield <span class="meta">\(steps below\)<\/span>/);
  // Where the user put items is sent with the draft (ticking, moving and adding are driven in the
  // browser test, which a real page needs).
  p.run("ppePlaced = { faceShield: 'all', kneePads: ['Place and tie reo'] }");
  assert.deepEqual(JSON.parse(p.run('JSON.stringify(payload().ppeSteps)')), { faceShield: 'all', kneePads: ['Place and tie reo'] });
  // A new SWMS starts from SiteWrite's suggestion.
  p.run('newSwms()');
  assert.equal(p.run('payload().ppeSteps'), undefined);
  // In the draft: the two tables, and the step's PPE line without tools to change it there.
  const draft = draftOf({ ...SITE, task: CONCRETE });
  const sheet = p.window.SiteWrite.render(draft, { movable: true });
  assert.match(sheet, /<strong>For particular steps<\/strong>/);
  assert.match(sheet, /<th>&#9745; Face shield<\/th><td>[^<]*Saw cut concrete/);
  assert.match(sheet, /class="ppe-line">Wear [^<]*face shield over safety glasses[^<]*<span class="meta"> PPE for this step\. Change it under Personal protective equipment\.<\/span><\/li>/);
});
