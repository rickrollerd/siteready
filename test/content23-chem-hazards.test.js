// Chemical and substance hazards added from the March 2026 hazard library audit of the
// 10 core activities. The wording is our own, with the hazardous chemicals, welding,
// excavation, demolition and plant codes cited. Made-up companies, people and sites only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor } = require('../draft');
const { draftBody } = require('../input');
const { answersFor } = require('../presets');

const SITE = {
  residential: 'no',
  company: 'Test',
  workplace: '12 Wattle Road, Hamilton',
  principalContractor: 'Specimen Build Pty Ltd',
  hospital: 'Northside General Hospital',
  firstAider: 'Jo Smith',
  musterPoint: 'Front gate',
  worksManager: 'Sam Lee',
  worksManagerPhone: '0400 118 552',
  complianceResponsible: 'Sam Lee',
  reviewer: 'Sam Lee',
  date: '11 November 2026',
};

function answered(input, given = {}) {
  const facts = { ...(input.facts || {}), ...given };
  for (let round = 0; round < 8; round += 1) {
    const asked = questionsFor(draftBody({ ...input, facts }));
    let added = false;
    for (const item of asked.required || []) {
      if (facts[item.id] !== undefined && facts[item.id] !== '') continue;
      facts[item.id] = item.id === 'liveElectrical' ? 'no' : item.choices ? item.choices[0].value : ((answersFor(item.id, asked.task)[0] || {}).text || 'As set out in the site plan.').replace(/_{3,}/g, 'x');
      added = true;
    }
    if (!added) break;
  }
  return { ...input, facts };
}

const draftOf = (input, given) => prepareDraft(draftBody(answered({ ...SITE, ...input }, given)));
const textOf = (line) => (typeof line === 'string' ? line : line.text);
const allText = (draft) => draft.jobSteps.flatMap((step) => [...step.hazards, ...step.controls]).map(textOf).join('\n');
const stepText = (draft, name) => {
  const step = draft.jobSteps.find((item) => item.step === name);
  return step ? [...step.hazards, ...step.controls].map(textOf).join('\n') : '';
};

function ready(input, given) {
  const draft = draftOf(input, given);
  assert.equal(draft.kind, 'draft', `${input.task}: ${(draft.missing || []).join('; ')}`);
  return draft;
}

test('crane set-up and rigging name hydraulic fluid and wire rope lubricant', () => {
  const draft = ready({ state: 'qld', fallRisk: 'no', crane: 'own', task: 'Lift the precast wall panels into place with a mobile crane.' }, {
    craneChart: 'Rated 60 t at 12 m radius. Heaviest load 20 t at 10 m.',
    groundBearing: "The principal contractor's engineer confirmed the hardstand takes the outrigger loads.",
  });
  const setup = stepText(draft, 'Set up the crane');
  const rig = stepText(draft, 'Rig and lift the load');
  assert.match(setup, /Hydraulic fluid leaks can irritate the skin/);
  assert.match(setup, /do not check a pressurised leak by hand/);
  assert.match(setup, /Managing risks of hazardous chemicals/);
  assert.match(rig, /Wire rope lubricant can irritate the skin/);
  assert.match(rig, /wash lubricant off the skin before eating/);
});

test('precast grouting covers delayed cement burns, residual release agent and epoxy adhesives', () => {
  const draft = ready({ state: 'nsw', fallRisk: 'yes', crane: 'company', slinging: 'crane', task: 'Stand and brace the precast wall panels and grout the base after they are plumbed.' }, {
    craneChart: 'Mobile crane, rated 20 t at 16 m radius from its chart.',
  });
  assert.match(stepText(draft, 'Stand and brace the precast elements'), /Residual formwork release agent on panel faces/);
  const grout = stepText(draft, 'Grout the base');
  assert.match(grout, /Cementitious grout can burn the skin\. The burn can be delayed/);
  assert.match(grout, /Epoxy adhesives and grouts/);
  assert.match(grout, /safety data sheets set out/);
});

test('formwork deck laying covers formwork release agent, and concrete finishing covers delayed cement burns', () => {
  const form = ready({ state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Erect, strip and remove formwork and propping to a suspended slab, then pump and place concrete, finish it and cure it with a curing compound.' }, {
    fallControl: 'Perimeter guardrails at every open edge of the deck, with a fully decked working platform.',
    controlsConsidered: 'A scaffold at the slab edge was considered; the perimeter guardrail on the deck is the control used.',
    formworkDesign: 'Formwork design FW-1 by the formwork engineer, revision B.',
    temporarySupport: 'Propping layout on drawing FW-2, designed by the formwork engineer.',
    loadLimits: 'Deck loads of 2.5 kPa as the formwork design shows, signed at each landing area.',
    systemInstructions: 'Example deck system from Example Formwork Hire, erected to its assembly instructions AI-7 revision 4. Crew trained by the supplier.',
  });
  const deck = stepText(form, 'Lay the formwork deck');
  assert.match(deck, /Skin, eye and breathing irritation from formwork release agent/);
  assert.match(deck, /Formwork release agent is used as its safety data sheet sets out/);
  const finish = stepText(form, 'Finish concrete') || stepText(form, 'Finish the concrete');
  assert.match(finish, /Cement burns can be delayed/);
  assert.match(finish, /hexavalent chromium/);
  assert.match(finish, /Admixtures are used only as their safety data sheets set out/);
  assert.match(finish, /Wash wet concrete off the skin straight away/);
});

test('a slab on ground pour also names delayed cement burns and admixtures', () => {
  const draft = ready({ state: 'vic', fallRisk: 'no', crane: 'none', task: 'Place and finish a concrete slab on ground, about 80 m2, discharged from the agitator chute, then saw cut the joints and apply a curing compound.' });
  const place = stepText(draft, 'Place concrete');
  assert.match(place, /Cement burns can be delayed/);
  assert.match(place, /hexavalent chromium/);
  assert.match(place, /Admixtures are used only as their safety data sheets set out/);
});

test('steel welding names stainless steel fume and anti-spatter sprays', () => {
  const draft = ready({ state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Weld the structural steel connections, including stainless steel handrail posts, from a mobile scaffold.' }, {
    fallControl: 'Work from a mobile scaffold with its guardrails in place and its castors locked.',
    harnessSystem: 'Full body harness on a restraint lanyard to the scaffold transom anchors, inspected every 6 months, users trained.',
    controlsConsidered: 'Edge protection on the scaffold is the control; a boom lift is not needed for this work.',
    erectionSequence: 'Erection sequence and bracing to drawing S-501 rev C; the leading hand checks each frame is braced before the next piece is released.',
  });
  const weld = stepText(draft, 'Weld steel');
  assert.match(weld, /Hexavalent chromium and nickel fume where stainless steel is welded or ground/);
  assert.match(weld, /Where stainless steel is welded or ground, the fume includes hexavalent chromium and nickel/);
  assert.match(weld, /Anti-spatter sprays are used as their safety data sheets set out/);
  assert.match(weld, /Welding processes/);
});

test('scaffold erection and dismantling cover galvanised cutting and bird droppings', () => {
  const draft = ready({ state: 'nsw', fallRisk: 'yes', crane: 'none', task: 'Erect and dismantle a tube and coupler scaffold up the front of a three storey building, about 12 m high, with ties to the slab edges and a handover tag before anyone uses it.' }, {
    fallControl: 'Erect from a fully decked platform with advance guardrails at each lift.',
    systemInstructions: "Tube and coupler scaffold erected to the scaffold designer's drawings SD-01 revision A by licensed scaffolders.",
    controlsConsidered: 'The scaffold is the fall control for the elevation work; a boom lift is not used.',
  });
  assert.match(stepText(draft, 'Erect the scaffold'), /Galvanised tubes and fittings are not cut or ground on site unless it cannot reasonably be avoided/);
  const down = stepText(draft, 'Dismantle the scaffold');
  assert.match(down, /Disease from disturbing dry bird droppings/);
  assert.match(down, /wet them down before they are disturbed/);
  assert.match(down, /do not dry sweep/);
});

test('metal roofing names fumes from cutting coated sheets, and torch-on work names bitumen fume', () => {
  const roof = ready({ state: 'wa', fallRisk: 'yes', crane: 'none', task: 'Fix new metal roof sheets to a single storey warehouse, including cutting sheets to fit and installing sarking.' }, {
    fallControl: 'Scaffold with edge protection at the eaves, and safety mesh under the new sheets.',
    harnessSystem: 'Full body harness on a restraint lanyard to rated roof anchors, inspected every 6 months, users trained.',
    controlsConsidered: 'Guardrails at every edge. A harness is used only where a worker must go past the mesh.',
  });
  const fix = stepText(roof, 'Fix new roofing');
  assert.match(fix, /Fumes and dust from cutting coated metal sheets/);
  assert.match(fix, /can give off zinc and other metal fumes/);
  const torch = ready({ state: 'sa', fallRisk: 'yes', crane: 'none', task: 'Lay torch-on bitumen sheet membrane to the roof, under a hot work permit, at the roof edge.' });
  const lay = stepText(torch, 'Lay torch-on membranes');
  assert.match(lay, /Bitumen fume from heating the membrane/);
  assert.match(lay, /Bitumen fume is hazardous when the membrane is heated/);
  assert.match(lay, /safety data sheet requires/);
});

test('structure demolition checks mercury, polychlorinated biphenyls, refrigerant and bird droppings', () => {
  const draft = ready({ state: 'act', fallRisk: 'yes', crane: 'none', task: 'Demolish a two storey brick office building. Soft strip the internal fit-out by hand first, then demolish the brick walls and the concrete first floor slab top down with a 30 t excavator. Asbestos has been removed beforehand by a licensed removalist with a clearance certificate. Services are disconnected by others before we start.' });
  const demo = stepText(draft, 'Demolish the structure');
  assert.match(demo, /hazardous materials survey is checked before demolition starts/);
  assert.match(demo, /mercury in lamps and thermostats/);
  assert.match(demo, /polychlorinated biphenyls in old electrical fittings/);
  assert.match(demo, /refrigerant is recovered by a licensed technician/);
  assert.match(demo, /dry bird droppings are wetted down/);
});

test('trench work names the gases a deep or poorly ventilated trench can collect', () => {
  const draft = ready({ state: 'qld', fallRisk: 'no', crane: 'none', task: 'Excavate trenches about 1.8 m deep with a trench shield, lay 225 mm sewer pipe, and backfill.' });
  const work = stepText(draft, 'Work in the trench');
  assert.match(work, /low oxygen, hydrogen sulphide, carbon dioxide, methane or exhaust gases/);
  assert.match(work, /The check covers oxygen, flammable gas, carbon monoxide and hydrogen sulphide/);
  assert.match(work, /Check the air with a gas monitor before entry, with a safety observer at the surface/);
});

test('an elevating work platform names battery electrolyte, hydrogen from charging, and hydraulic injection', () => {
  const draft = ready({ state: 'qld', fallRisk: 'yes', crane: 'none', task: 'Install cable trays and pull cables through the ward ceilings and risers from scissor lifts.' }, {
    fallControl: 'Scissor lifts with guardrails for all work above 2 m.',
    controlsConsidered: 'A scaffold is not practicable in the ward ceilings.',
  });
  const ewp = stepText(draft, 'Use an elevating work platform');
  assert.match(ewp, /Battery electrolyte is corrosive, and charging can give off hydrogen/);
  assert.match(ewp, /A high-pressure hydraulic leak can inject fluid under the skin/);
  assert.match(ewp, /Battery electrolyte is kept off skin and eyes/);
  assert.match(ewp, /A leak is never checked by hand/);
  assert.match(ewp, /Battery EWPs are charged only from an RCD protected supply/);
});

test('a job with none of this work does not pick up the new chemical lines', () => {
  const draft = ready({ state: 'nsw', fallRisk: 'no', crane: 'none', task: 'Replace a 3 m length of timber fence, including digging two new post holes by hand and setting the posts in bagged concrete.' });
  const text = allText(draft);
  assert.doesNotMatch(text, /Hexavalent chromium and nickel fume where stainless steel/);
  assert.doesNotMatch(text, /Bitumen fume is hazardous when the membrane is heated/);
  assert.doesNotMatch(text, /polychlorinated biphenyls in old electrical fittings/);
  assert.doesNotMatch(text, /Galvanised tubes and fittings are not cut or ground on site/);
  assert.doesNotMatch(text, /A high-pressure hydraulic leak can inject fluid under the skin/);
});
