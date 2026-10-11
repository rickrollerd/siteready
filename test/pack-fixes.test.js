// Goals 2, 3 and 4: faults the 100 SWMS blind review pack found (11 October 2026). Each is fixed by a
// general rule, and the package flag says what the SWMS says (screenHighRisk and prepareDraft).
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, screenHighRisk, suggestedKinds } = require('../draft');
const { highRiskList, findState } = require('../legislation');
const { answersFor } = require('../presets');

const SITE = { workplace: '12 Smith Street, Paddington QLD 4064', principalContractor: 'ABC Builders Pty Ltd', complianceResponsible: 'Sam Lee, supervisor', reviewer: 'Sam Lee, supervisor' };
// The categories a draft lists, by id.
const hrcw = (draft, state) => draft.highRisk.map((label) => (highRiskList(findState(state)).find((item) => item.label === label) || { id: label }).id).sort();
const flag = (input) => screenHighRisk(input).categories.map((item) => item.id).sort();
const steps = (draft) => draft.jobSteps.map((step) => step.step);
// Drafted as a user answers: the first offered answer to each question, no live electrical.
function drafted(input) {
  const facts = { ...(input.facts || {}) };
  for (let round = 0; round < 8; round += 1) {
    let added = false;
    for (const item of questionsFor({ ...input, facts }).required || []) {
      if (facts[item.id]) continue;
      facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : (answersFor(item.id, input.task)[0] || {}).text || `As set out in the site plan: ${item.label}.`;
      added = true;
    }
    if (!added) break;
  }
  const draft = prepareDraft({ ...input, facts });
  assert.equal(draft.kind, 'draft', (draft.missing || []).join('; '));
  return draft;
}

test('a natural stone counter and vanity tops named by their stone find the stone steps, not a stand-down', () => {
  const task = 'Install the natural marble reception counter and vanity tops in the hotel lobby and public toilets, cutting and polishing edges on site with wet tools.';
  const q = questionsFor({ state: 'wa', task, fallRisk: 'no', residential: 'no' });
  assert.ok(!q.standDown);
  assert.deepEqual([...q.steps.suggested].sort(), ['stoneHandle', 'stoneSilica']);
  const draft = drafted({ state: 'wa', task, fallRisk: 'no', residential: 'no', ...SITE });
  assert.equal(draft.kind, 'draft');
  assert.ok(steps(draft).includes('Move and set heavy benchtops'));
  assert.ok(steps(draft).includes('Cut and finish stone and porcelain benchtops'));
  assert.deepEqual(draft.notCovered, []);
  assert.deepEqual(suggestedKinds('Fit the granite vanity tops in the ensuites.', {}, { id: 'qld' }).filter((id) => /^stone/.test(id)), ['stoneHandle']);
  // Tops that are not stone, and cleaning a bench top, are not stone work.
  for (const other of ['Install laminate counter tops in the staff kitchen.', 'Wipe bench tops, shelves and drawer units and polish mirrors.', 'Lay marble floor tiles in the lobby.']) {
    assert.ok(!suggestedKinds(other, {}, { id: 'qld' }).some((id) => /^stone/.test(id)), other);
  }
});

test('a telecommunications monopole, or a tower carrying antennas, is a telecommunication tower in the flag and the SWMS', () => {
  const task = 'Climb the 45 m telecommunications monopole and install the new headframe, antennas and feeder cables, as tower riggers using the climbing system and fall arrest.';
  const input = { state: 'tas', task, fallRisk: 'yes', residential: 'no', crane: 'none', ...SITE };
  assert.ok(flag(input).includes('tower'));
  assert.ok(hrcw(drafted(input), 'tas').includes('tower'));
  assert.ok(flag({ state: 'qld', task: 'Climb the tower and replace the antennas.', fallRisk: 'yes' }).includes('tower'));
  // Antennas on a building's roof, a tower crane and lighting towers are not.
  for (const other of ['Install antennas on the rooftop of the hospital tower.', 'Install the anemometer on the tower crane jib.', 'Set up the lighting towers in the car park.']) {
    assert.ok(!flag({ state: 'qld', task: other, fallRisk: 'no' }).includes('tower'), other);
  }
});

test('a road named in the access answer as the way in does not make the work a traffic corridor', () => {
  const base = { state: 'tas', task: 'Climb the 45 m telecommunications monopole and install the new headframe, antennas and feeder cables, as tower riggers using the climbing system and fall arrest.', fallRisk: 'yes', residential: 'no', crane: 'none', ...SITE };
  const site = { access: 'Locked compound gate off Old Main Road; access track to the pole base', publicInterface: 'None; the compound is fenced', otherTrades: 'None', ground: 'Gravel compound, level', liveServices: 'None' };
  assert.ok(!hrcw(drafted({ ...base, site }), 'tas').includes('road'));
  // Traffic the public interface answer names still counts.
  assert.ok(hrcw(drafted({ ...base, site: { ...site, publicInterface: 'Live traffic on Old Main Road next to the compound fence' } }), 'tas').includes('road'));
});

test('a job step worked over the water brings the drowning category, in the flag and the SWMS', () => {
  const task = 'Lift the steel pedestrian bridge span onto its abutments across the creek with a 250 tonne mobile crane, then bolt the bearings and connections from a boom lift and a work boat.';
  const input = { state: 'vic', task, fallRisk: 'yes', residential: 'no', crane: 'company', ...SITE };
  const draft = drafted(input);
  assert.ok(steps(draft).includes('Work over the water'));
  assert.ok(hrcw(draft, 'vic').includes('water'));
  assert.ok(flag(input).includes('water'));
  // Work connected "by the water authority" is not work by the water.
  assert.ok(!suggestedKinds('Lay the PE water main with butt fusion, pressure test and disinfect. Connection to the live main by the water authority.', {}, { id: 'qld' }).includes('water'));
  // A pool's step alone does not say the pool holds water.
  const pool = drafted({ state: 'qld', task: 'Install the moveable pool floor and bulkheads before the pool is filled.', fallRisk: 'no', residential: 'no', ...SITE });
  assert.ok(!hrcw(pool, 'qld').includes('water'));
});

test('cutting out a section of an existing suspended slab, or a new opening through a structural wall, is demolition of a load-bearing element', () => {
  const task = 'Saw cut and remove a 3 m by 4 m section of the existing level 2 suspended slab for a new stair void in an occupied office building, with back-propping installed under the slab first.';
  const input = { state: 'sa', task, fallRisk: 'yes', residential: 'no', crane: 'none', ...SITE };
  assert.deepEqual(hrcw(drafted(input), 'sa').filter((id) => ['demolition', 'temporary'].includes(id)), ['demolition', 'temporary']);
  assert.ok(flag(input).includes('demolition'));
  assert.ok(flag({ state: 'vic', task: 'Wall saw a new doorway opening through the existing core wall.', fallRisk: 'no' }).includes('demolition'));
  // Cores, voids formed in a new slab, and a slab on ground are not.
  for (const other of ['Core drill 150 mm penetrations through the existing suspended slab.', 'Form voids in the new suspended slab for the risers.', 'Saw cut and remove a section of the slab on ground for the sewer trench.']) {
    assert.ok(!flag({ state: 'sa', task: other, fallRisk: 'no' }).includes('demolition'), other);
  }
});

test('a solvent-based coating applied in a room is work in an area that may have a flammable atmosphere', () => {
  const task = 'Grind the concrete floor and apply a solvent-based epoxy primer and epoxy floor coating in the food factory production room, with the room ventilated and ignition sources removed.';
  const input = { state: 'tas', task, fallRisk: 'no', residential: 'no', crane: 'none', ...SITE };
  assert.ok(hrcw(drafted(input), 'tas').includes('atmosphere'));
  assert.ok(flag(input).includes('atmosphere'));
  for (const other of ['Apply solvent-based paint to the external steel handrails.', 'Paint the office corridors with water-based acrylic.']) {
    assert.ok(!flag({ state: 'tas', task: other, fallRisk: 'no' }).includes('atmosphere'), other);
  }
});

test('insulated freezer room panels lifted by forklift are not precast panels', () => {
  const task = 'Install the insulated panels, doors and refrigeration units for the new freezer room inside the operating food distribution warehouse, including the refrigerant pipework, with panels lifted by forklift.';
  const draft = drafted({ state: 'qld', task, fallRisk: 'yes', residential: 'no', crane: 'none', facts: { fallControl: 'Work at height is done from a scissor lift.' }, ...SITE });
  assert.ok(steps(draft).includes('Erect coolroom panels'));
  for (const name of ['Stand and brace the precast elements', 'Grout the base', 'Remove the braces']) assert.ok(!steps(draft).includes(name), name);
  // Sandwich panels lifted onto a cold room's frame are cool room panels, not precast.
  assert.deepEqual(suggestedKinds('Lift insulated sandwich wall panels onto the cold room frame with a crane.', {}, { id: 'wa' }).filter((id) => ['precast', 'coolroomPanels'].includes(id)), ['coolroomPanels']);
  // Precast wall panels lifted by crane still are.
  assert.ok(suggestedKinds('Lift the precast wall panels into place with the crane and brace them.', {}, { id: 'qld' }).includes('precast'));
});

test('with no crane on the job, reo is loaded onto the deck without the crane lines', () => {
  const task = 'Form, reinforce and pour the extension of the station platform next to the live track, working at night during track possessions, with concrete pumped from the station car park.';
  const facts = { loadLimits: 'The deck takes 2.5 kPa of stacked reo, as the formwork design shows.' };
  const none = drafted({ state: 'wa', task, fallRisk: 'no', residential: 'no', crane: 'none', facts, ...SITE });
  assert.ok(!steps(none).includes('Lift reo onto the deck'));
  const load = none.jobSteps.find((step) => step.step === 'Load reo onto the deck');
  assert.ok(load);
  assert.ok(!load.controls.some((line) => /crane crew|slung/i.test(line)));
  assert.ok(load.controls.some((line) => /allowable load/.test(line)));
  // With the crane company's crane, the crane lift and its lines stay.
  const crane = drafted({ state: 'wa', task, fallRisk: 'no', residential: 'no', crane: 'company', facts, ...SITE });
  const lift = crane.jobSteps.find((step) => step.step === 'Lift reo onto the deck');
  assert.ok(lift && lift.controls.some((line) => /slung by the crane crew/.test(line)));
});

test('temporary concrete barriers for a road works zone find the barrier step; traffic controllers are not a lift controller', () => {
  const task = 'Install the temporary concrete barriers and line marking for the road works zone on the highway, lifted off the truck with a hiab, with traffic controllers stopping traffic for each lift.';
  const draft = drafted({ state: 'nt', task, fallRisk: 'no', residential: 'no', crane: 'none', ...SITE });
  assert.ok(steps(draft).includes('Set up traffic barriers and temporary fencing'));
  assert.ok(steps(draft).includes('Unload with the truck loading crane (hiab)'));
  assert.ok(!steps(draft).includes('Replace the lift controller'));
  assert.ok(!(draft.notCovered || []).some((part) => /barriers/i.test(part)));
  // Permanent road safety barrier keeps its own step, and a lift's controllers are still lift work.
  assert.ok(suggestedKinds('Install W-beam guard rail along the highway.', {}, { id: 'qld' }).includes('roadBarrier'));
  assert.ok(suggestedKinds('Replace the lift controllers in the office tower.', {}, { id: 'qld' }).includes('liftController'));
});
