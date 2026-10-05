// Corrections from the review of each state's legal content against its regulation text.
// Each test builds drafts with prepareDraft and checks the wording a state now prints,
// and that Queensland, where it was right, prints what it did before.
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareDraft, questionsFor, highRiskMatches } = require('../draft');
const { localControl, localSource } = require('../citations');
const { findState } = require('../legislation');

// A draft with every fact it asks for given, so it is not stood down.
function draft(state, task, extra = {}) {
  const base = { state, task, fallRisk: 'yes', residential: 'no', company: 'Test Co', principalContractor: 'PC Pty Ltd', ...extra };
  const facts = {};
  let done;
  for (let round = 0; round < 5; round += 1) {
    for (const item of questionsFor({ ...base, facts }).required || []) {
      const options = item.choices || item.options;
      // Choices: energised testing, a confined space and a tube and coupler scaffold where offered.
      if (!facts[item.id]) facts[item.id] = options && options.length ? (options.find((option) => /^(confined|testing|tubeCoupler)$/.test(option.value)) || options[0]).value : `As set out in the site plan and checked by the supervisor: ${item.label}.`;
    }
    done = prepareDraft({ ...base, facts });
    if (done.kind !== 'stand-down') break;
  }
  assert.equal(done.kind, 'draft', `${state}: ${task}`);
  return done;
}
const lines = (done) => [...done.jobSteps.flatMap((step) => step.controls), ...(done.controls || []).map((item) => item.text)];
const line = (done, pattern) => lines(done).find((text) => pattern.test(text));

const QLD = 'Work Health and Safety Regulation 2011 (Qld) ';
const DUAL_LIFT = 'Install precast bridge girders over a railway line at night with two mobile cranes in a dual lift.';
const ENERGISED = 'Test and fault find on an energised main switchboard in an operating commercial building, then replace a circuit breaker after isolation.';
const SILICA = 'Saw cut and core drill concrete slabs for new service penetrations in a commercial building.';
const TERMITES = 'Apply a chemical termite barrier and herbicide treatment around a new commercial building.';
const TRENCH = 'Dig a 1.2 m deep trench with an excavator and lay a sewer pipe.';

test('a trench deeper than 1.5 m is high risk construction work; one 1.5 m deep or more is supported', () => {
  for (const state of ['qld', 'nsw', 'sa', 'wa', 'tas', 'nt']) {
    const text = line(draft(state, TRENCH), /^Before anyone enters, check the depth/);
    assert.match(text, /a trench deeper than 1\.5 m is high risk construction work, and a trench 1\.5 m deep or more is shored, benched or battered before anyone enters\./, state);
  }
  assert.match(line(draft('qld', TRENCH), /^Before anyone enters, check the depth/), /\(Work Health and Safety Regulation 2011 \(Qld\) s 291, s 306\)$/);
  // Victoria r 322(g), with no shoring rule in the regulations.
  assert.match(line(draft('vic', TRENCH), /^Before anyone enters, check the depth/), /a trench deeper than 1\.5 m is high risk construction work, and its sides are supported before anyone enters\. \(Occupational Health and Safety Regulations 2017 \(Vic\) r 322\)$/);
});

test('trench barriers follow s 306D in Queensland and r 306(1) elsewhere', () => {
  const task = 'Excavate pile caps and lift pits for a commercial building with an excavator.';
  assert.ok(lines(draft('qld', task)).includes(`Barriers go up around a pit or trench as it is dug, before it is 2 m deep (3 m in housing construction). (${QLD}s 306D)`));
  assert.ok(lines(draft('nsw', task)).includes('Barriers go up around a pit or trench as it is dug, and the work area around a trench 1.5 m deep or more is secured from unauthorised access, including inadvertent entry.'));
});

test('NSW s 291(o) is quoted word for word; the other states keep "any"', () => {
  const nsw = highRiskMatches('Excavate with an excavator.', '', findState('nsw')).map((item) => item.label);
  assert.ok(nsw.includes('Is carried out in an area at a workplace in which there is movement of powered mobile plant'));
  for (const state of ['qld', 'sa', 'wa', 'tas', 'nt']) {
    assert.ok(highRiskMatches('Excavate with an excavator.', '', findState(state)).some((item) => item.label === 'Is carried out in an area at a workplace in which there is any movement of powered mobile plant'), state);
  }
});

test('dual lifts: Queensland s 219(7), the model r 219(7) and Victoria r 115(3)(d)', () => {
  const pattern = /^A load is lifted by more than one crane/;
  assert.equal(line(draft('qld', DUAL_LIFT), pattern), `A load is lifted by more than one crane only where each crane is specifically designed to lift a load. Loads stay within each crane's limits, under control, and never over people. (${QLD}s 219)`);
  for (const [state, reg] of [['nsw', 'Work Health and Safety Regulation 2025 (NSW) s 219'], ['sa', 'Work Health and Safety Regulations 2012 (SA) r 219'], ['wa', 'Work Health and Safety (General) Regulations 2022 (WA) r 219'], ['tas', 'Work Health and Safety Regulations 2022 (Tas) r 219'], ['act', 'Work Health and Safety Regulation 2011 (ACT) s 219'], ['nt', 'Work Health and Safety (National Uniform Legislation) Regulations 2011 (NT) r 219']]) {
    assert.equal(line(draft(state, DUAL_LIFT), pattern), `A load is lifted by more than one crane only where the method of lifting keeps the load on each crane within its design capacity. Loads stay within each crane's limits, under control, and never over people. (${reg})`, state);
  }
  assert.equal(line(draft('vic', DUAL_LIFT), pattern), 'A load is lifted by more than one crane only where a single crane cannot reasonably be used, and each crane is designed to lift a load. Loads stay within each crane\'s limits, under control, and never over people. (Occupational Health and Safety Regulations 2017 (Vic) r 115)');
});

test('energised work: r 161(4)(b) and r 162 where the state has them', () => {
  const qld = draft('qld', ENERGISED);
  assert.match(line(qld, /^A safety observer/), /^A safety observer, assessed in the last 12 months as competent in rescue and resuscitation, watches the work and does no other work\. \(Electrical Safety Regulation 2026 \(Qld\)/);
  assert.match(line(qld, /^Keep the risk assessment/), /^Keep the risk assessment until at least 28 days after the work and this SWMS until the work is complete/);
  for (const [state, reg] of [['nsw', 'Work Health and Safety Regulation 2025 (NSW) s'], ['sa', 'Work Health and Safety Regulations 2012 (SA) r'], ['tas', 'Work Health and Safety Regulations 2022 (Tas) r'], ['act', 'Work Health and Safety Regulation 2011 (ACT) s']]) {
    const done = draft(state, ENERGISED);
    assert.equal(line(done, /^A safety observer/), `A safety observer, competent to apply the emergency controls and to rescue and resuscitate the worker, and assessed in the previous 12 months as competent to rescue and resuscitate a person, watches the work and does no other work. (${reg} 161)`, state);
    assert.equal(line(done, /^Keep the risk assessment/), `Keep the risk assessment until at least 28 days after the work and this SWMS until the work is complete, or both for at least 2 years after a notifiable incident, readily available to the workers. (${reg} 162)`, state);
  }
  // WA r 161 and r 162 are not used, so the general wording stays.
  assert.equal(line(draft('wa', ENERGISED), /^A safety observer/), 'A safety observer competent in low voltage rescue and CPR watches the work and does no other work.');
});

test('a circuit breaker is not read as breaking out concrete', () => {
  assert.equal(draft('qld', ENERGISED).kind, 'draft');
});

test('silica: the model states rely on no dust controls, take an unknown as high risk, and report within 14 days (r 529CE)', () => {
  const qld = lines(draft('qld', SILICA)).join('\n');
  assert.match(qld, /does not rely only on the dust controls/);
  const unknown = 'If it cannot be determined, treat it as a risk to health until that is determined.';
  assert.equal(localControl(unknown, `${QLD}s 529CA`, 'qld'), `${unknown} (${QLD}s 529CA)`);
  assert.match(qld, /For high risk processing, results over the exposure standard go to the regulator within 14 days\./);
  for (const [state, reg] of [['nsw', 'Work Health and Safety Regulation 2025 (NSW)'], ['sa', 'Work Health and Safety Regulations 2012 (SA)'], ['wa', 'Work Health and Safety (General) Regulations 2022 (WA)'], ['tas', 'Work Health and Safety Regulations 2022 (Tas)'], ['nt', 'Work Health and Safety (National Uniform Legislation) Regulations 2011 (NT)']]) {
    const text = lines(draft(state, SILICA)).join('\n');
    assert.doesNotMatch(text, /rely only on|risk to health/, state);
    assert.match(text, /treat it as high risk until it is determined that it is not\./, state);
    assert.match(text, /For high risk processing, air monitoring is done, results over the exposure standard go to the regulator within 14 days, and all workers doing the processing have health monitoring\.[^\n]*529CE/, state);
    assert.match(localSource(`${QLD}s 529CE`, state), new RegExp(`^${reg.replace(/[()]/g, '\\$&')} [rs] 529CE$`), state);
  }
  // Victoria and the ACT have no such rule.
  assert.match(lines(draft('act', SILICA)).join('\n'), /where the territory's rules require it/);
});

test('Queensland pest, termite and herbicide licences stay in Queensland', () => {
  assert.match(lines(draft('qld', TERMITES)).join('\n'), /Queensland Health pest management licence[^\n]*QBCC termite management \(chemical\) licence/);
  for (const state of ['nsw', 'vic', 'sa', 'wa', 'tas', 'act', 'nt']) {
    const done = draft(state, TERMITES);
    const text = [...lines(done), ...done.qualifications].join('\n');
    assert.doesNotMatch(text, /Queensland|QBCC|regulated area/, state);
    assert.match(text, /Termite treatments are applied only by a holder of the pest management licence the (?:state|territory) requires/, state);
  }
});

test('oxygen enrichment is above 23.5%, the top of the safe oxygen level', () => {
  const text = localControl('Monitor the manifold room atmosphere for oxygen enrichment (above 23.5%, the top of the safe oxygen level) while cylinders are connected or changed, and ventilate the room.', `${QLD}s 51, schedule 19`, 'qld');
  assert.match(text, /above 23\.5%/);
  assert.ok(lines(draft('qld', 'Install medical gas manifolds and connect oxygen cylinders in the plant room of an operating hospital.')).some((item) => /above 23\.5%, the top of the safe oxygen level/.test(item)));
});

test('demolishing a whole concrete building, warehouse or car park is load-bearing demolition', () => {
  const label = 'Involves demolition of an element of a structure that is load-bearing or otherwise related to the physical integrity of the structure';
  for (const task of ['Demolish a three storey concrete commercial building, 12 m high, with excavators and a high reach demolition machine.', 'Demolish the existing two storey brick warehouse with excavators.', 'Demolish a reinforced concrete multi-level car park with excavators.']) {
    assert.ok(draft('qld', task).highRisk.includes(label), task);
  }
  assert.ok(!highRiskMatches('Demolish internal non-load-bearing partitions in the office building.', 'no', findState('qld')).some((item) => item.id === 'demolition'));
});

test('WA demolition: licence classes and 5 working days, not the 6 m notice', () => {
  const wa = line(draft('wa', 'Demolish a two storey commercial building with excavators.'), /demolition work|6 m high/);
  assert.equal(wa, 'Class 1 or Class 2 demolition work is done by, or for, the holder of the demolition licence it needs. Done to AS 2601, it is notified to the regulator at least 5 working days before it begins; done any other way, the regulator\'s approval is applied for at least 10 working days before, and the work waits for it. (Work Health and Safety (General) Regulations 2022 (WA) r 142B, r 142C, r 142F, r 142G, r 142I)');
  assert.match(line(draft('nsw', 'Demolish a two storey commercial building with excavators.'), /6 m high/), /^Written notice is given to the regulator at least 5 days before the work starts where the structure, or a load-bearing part of it, is at least 6 m high, where load shifting machinery is used on a suspended floor, or where explosives are used\. \(Work Health and Safety Regulation 2025 \(NSW\) s 142\)$/);
});

test('WA tilt-up rules apply only to concrete wall panels (r 306A)', () => {
  const asked = (task) => (questionsFor({ state: 'wa', task, fallRisk: 'no' }).required || []).some((item) => item.id === 'regulatorNotified');
  assert.ok(asked('Erect tilt-up concrete wall panels for a warehouse using a 200 tonne mobile crane, with temporary braces.'));
  for (const task of ['Lift precast concrete beams onto columns for a car park structure with a mobile crane.', 'Install precast hollowcore floor planks on steel beams with a mobile crane.', 'Lift insulated sandwich wall panels onto the cold room frame with a crane.']) {
    assert.ok(!asked(task), task);
    assert.ok(!lines(draft('wa', task)).some((item) => /regulation 306/.test(item)), task);
  }
});

test('Victoria: scaffolds, plant registration and the telehandler licence', () => {
  const scaffold = draft('vic', 'Erect a tube and coupler scaffold 12 m high on the facade of a commercial office building.');
  assert.ok(!lines(scaffold).some((item) => /(?:written|every 30 days)[^(]*\(Occupational[^)]*r 118/.test(item)));
  assert.match(scaffold.plant.find((item) => item.item === 'Scaffold').inspection, /^Not used for work until it, or the part used, is complete[^(]*\(Occupational Health and Safety Regulations 2017 \(Vic\) r 118\)\. Handover certificate before first use, and inspected by a competent person before use, after an incident or repairs, and at least every 30 days\.$/);
  assert.ok(lines(scaffold).includes('Workers hold a construction induction card (white card). (Occupational Health and Safety Regulations 2017 (Vic) r 341)'));
  assert.ok(scaffold.qualifications.includes('Construction induction card (white card)'));

  const crane = draft('vic', 'Lift roof trusses onto the frame of a commercial building with a 60 tonne mobile crane and a telehandler.');
  assert.match(crane.plant.find((item) => /^Mobile crane/.test(item.item)).inspection, /Cranes over 10 t have a registered design\.$/);
  assert.match(crane.plant.find((item) => item.item === 'Telehandler').licence, /^Yes for a non-slewing telehandler rated over 3 t: the non-slewing telehandler licence, or a mobile crane licence/);
  assert.ok(lines(crane).some((item) => /A non-slewing telehandler rated over 3 t needs the non-slewing telehandler licence or a mobile crane licence/.test(item)));

  const tower = draft('vic', 'Install a tower crane and pour slabs with a concrete placing boom for a commercial tower.');
  for (const name of ['Tower crane', 'Concrete placing boom']) {
    const { inspection } = tower.plant.find((item) => item.item === name);
    assert.match(inspection, /^Registered design\./, name);
    assert.doesNotMatch(inspection, /registered item|major inspection\b(?! s)/i, name);
  }
  // Queensland keeps its registered items and major inspections.
  assert.match(draft('qld', 'Install a tower crane and pour slabs with a concrete placing boom for a commercial tower.').plant.find((item) => item.item === 'Tower crane').inspection, /^Registered item of plant\..*major inspection \(WHS Reg s 235\)\.$/);
  assert.equal(localControl('Boilers and pressure vessels at hazard level A, B or C have a registered design and are registered items before they are used.', `${QLD}s 243, s 246, schedule 5`, 'vic'), 'Boilers, pressure vessels and other pressure equipment have a registered design before they are used, unless Schedule 2 item 1.1 leaves them out. (Occupational Health and Safety Regulations 2017 (Vic) r 125, Schedule 2)');
  assert.equal(localControl('An escalator is plant whose design and item are registered. The registration numbers are sighted before it is installed and before it is used.', `${QLD}s 243, s 246, schedule 5`, 'vic'), 'An escalator is a lift, and its design is registered. The design registration number is sighted before it is installed. (Occupational Health and Safety Regulations 2017 (Vic) r 125, Schedule 2)');
});

test('Victoria: asbestos clearance by an independent person, and no building date', () => {
  const removal = draft('vic', 'Remove 80 square metres of friable asbestos pipe lagging from the plant room of a 1975 commercial building as a licensed Class A removal.');
  assert.ok(lines(removal).some((item) => /^When Class A or Class B asbestos removal is finished, the person who commissioned it obtains a clearance certificate from an independent person[^(]*\(Occupational Health and Safety Regulations 2017 \(Vic\) r 294, r 296, r 297\)$/.test(item)));
  assert.doesNotMatch(lines(removal).join('\n'), /licensed asbestos assessor/);
  const check = 'Buildings built before 31 December 1989 are checked for asbestos before demolition or refurbishment. Where there is no asbestos register, a competent person inspects first. Material that cannot be identified, but a competent person believes is asbestos, is treated as asbestos.';
  const vic = localControl(check, `${QLD}s 422, s 447, s 451`, 'vic');
  assert.doesNotMatch(vic, /31 December/);
  assert.match(vic, /the work does not start until it has been determined whether asbestos is present[^(]*\(Occupational Health and Safety Regulations 2017 \(Vic\) r 226, r 240, r 245\)$/);
  assert.equal(localControl(check, `${QLD}s 422, s 447, s 451`, 'qld'), `${check} (${QLD}s 422, s 447, s 451)`);
  assert.match(localControl(check, `${QLD}s 422, s 447, s 451`, 'nsw'), /^Buildings built before 31 December 2003/);
});

test('Victoria: confined space duties as regulations 56, 63 to 65, 68 and 73 set them', () => {
  const done = draft('vic', 'Enter a 4 m deep sewer pump station wet well to replace a pump and valves.', { facts: { spaceAssessment: 'confined' } });
  const text = lines(done);
  const reg = 'Occupational Health and Safety Regulations 2017 (Vic)';
  assert.ok(text.includes(`Workers are given information, instruction and training in the hazards, the risk controls, PPE, the entry permit and the emergency procedures. (${reg} r 73)`));
  assert.ok(text.includes(`No one enters without a written entry permit issued by the employer for that space, listing the controls, the people permitted to enter, the standby person and the period it covers. (${reg} r 63)`));
  assert.ok(text.includes(`Close and sign off the entry permit, and keep a written record that everyone has left. Keep the permit until the work is complete, or for at least 2 years if a notifiable incident occurs. (${reg} r 64, r 68)`));
  assert.ok(text.includes(`A standby person stays outside, in continuous contact, and never enters to rescue. Rescue is started from outside. (${reg} r 65, r 69)`));
  assert.ok(!text.some((item) => /competent person does a written risk assessment|training records kept for 2 years|28 days/.test(item)));
  // Queensland keeps s 76 and s 77.
  const qld = lines(draft('qld', 'Enter a 4 m deep sewer pump station wet well to replace a pump and valves.', { facts: { spaceAssessment: 'confined' } }));
  assert.ok(qld.some((item) => /^Workers are trained in the hazards, controls, permit and emergency procedures, with training records kept for 2 years\. \(Work Health and Safety Regulation 2011 \(Qld\) s 76\)/.test(item)));
});

test('Victoria: citations that went further than the regulation are left off', () => {
  const reg = 'Occupational Health and Safety Regulations 2017 (Vic)';
  assert.equal(localControl('This SWMS takes into account that the work is next to an operating hospital, and the hospital\'s requirements agreed with the principal contractor.', `${QLD}s 299`, 'vic'), 'This SWMS takes into account that the work is next to an operating hospital, and the hospital\'s requirements agreed with the principal contractor.');
  assert.equal(localControl('Forklifts are kept apart from people, with a warning device. A forklift left unattended is parked level, with the brake on and the key removed.', `${QLD}s 215, s 218`, 'vic'), `Forklifts are kept apart from people, with a warning device. A forklift left unattended is parked level, with the brake on and the key removed. (${reg} r 109)`);
  // Regulation 49 is cited for the rescue plan only; the anchor rating follows uncited.
  assert.equal(localControl('Harness anchors are rated at least 15 kN for one person with a free fall, there is enough clearance below, no one works alone on a harness, and the rescue plan is tested.', `${QLD}s 80`, 'vic'), `The rescue plan for harness work is set up and tested (${reg} r 49). Harness anchors are rated at least 15 kN for one person with a free fall, to the manufacturer's rating and the relevant Australian Standard, there is enough clearance below, and no one works alone on a harness.`);
  assert.equal(localControl('Rescue procedures are set up and tested, and workers are trained in them.', `${QLD}s 80`, 'vic'), `Rescue procedures are set up and tested, and workers are trained in them. (${reg} r 49)`);
  assert.equal(localControl('Work from a solid surface with edge protection wherever a fall of 2 m or more is possible: top rail at least 900 mm, rails no more than 450 mm apart, toe board at least 150 mm.', `${QLD}s 78, s 306D, s 306E`, 'vic'), 'Work from a solid surface with edge protection wherever a fall of more than 2 m is possible: top rail at least 900 mm, rails no more than 450 mm apart, toe board at least 150 mm.');
  assert.match(localControl('Tiles and stone with 1% or more crystalline silica are a crystalline silica substance.', `${QLD}s 529A`, 'vic'), /^Tiles and stone contain crystalline silica\./);
  assert.match(localControl('No electrical work is done on or near energised parts (within 3 m of an exposed energised part).', '', 'vic'), /the state's occupational health and safety or electrical safety law requires\.$/);
  // The anchor and hospital sources stay in other states.
  assert.match(localControl('Harness anchors are rated at least 15 kN for one person with a free fall, there is enough clearance below, no one works alone on a harness, and the rescue plan is tested.', `${QLD}s 80`, 'nsw'), /^The rescue plan for harness work is set up and tested \(Work Health and Safety Regulation 2025 \(NSW\) s 80\)\. Harness anchors are rated/);
});

test('ACT: Minister declared silica course, s 418CAA controls, porcelain and asbestos', () => {
  const reg = 'Work Health and Safety Regulation 2011 (ACT)';
  const silica = draft('act', 'Cut and drill concrete with a concrete saw for new service penetrations in a commercial building.');
  assert.ok(silica.qualifications.includes('Crystalline silica awareness training (the course the Minister declares under section 418D), for workers who carry out high risk crystalline silica work'));
  const text = lines(draft('act', SILICA)).join('\n');
  assert.doesNotMatch(text, /crystalline silica substance|ACT regulator declares|wet cutting or on-tool extraction/);
  assert.match(text, /Drilling concrete is processing crystalline silica material: a continuous water feed is used with at least one other crystalline silica control, or the next control section 418CAA allows where that is not reasonably practicable/);
  assert.match(localControl('Natural stone and porcelain with 1% or more crystalline silica: cutting, drilling and polishing with power tools is processing that must be controlled, with wet methods or on-tool extraction, and respirators for anyone still at risk. Cut in the factory where possible.', `${QLD}s 529A, s 529B, s 529C`, 'act'), new RegExp(`^Porcelain and sintered stone containing crystalline silica are stone-substitute material: [^(]*exposed workers wear respiratory protective equipment\\.[^(]*\\(${reg.replace(/[()]/g, '\\$&')} s 418B, s 418C, s 418CAA\\)$`));
  assert.equal(localControl('Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. Where rock is drilled or broken with plant, control the silica dust (wet methods or extraction) and assess it in writing before starting.', `${QLD}s 56, s 57, s 529B, s 529C, s 529CA`, 'act'), `Keep noise below 85 dB(A) over 8 hours and 140 dB(C) peak. Where rock is drilled or broken with plant, a continuous water feed is used with at least one other crystalline silica control, or the next control section 418CAA allows where that is not reasonably practicable, and anyone still at risk wears a fit tested respirator. (${reg} s 56, s 57)`);

  const asbestos = draft('act', 'Remove 60 square metres of bonded asbestos cement sheeting from the walls of a commercial building as a licensed Class B removal.');
  assert.ok(lines(asbestos).includes(`When licensed asbestos removal is finished, an independent licensed asbestos assessor inspects the removal area and the area around it, and issues a clearance certificate before the area is reoccupied. (${reg} s 473, s 474)`));
  assert.ok(asbestos.qualifications.some((item) => /^Licensed asbestos removalist \(Class A for friable asbestos, Class B or A for non-friable asbestos, whatever the amount\)/.test(item)));
  assert.ok(!asbestos.qualifications.some((item) => /non-licensed removal/.test(item)));
  assert.match(localControl('If asbestos is found or suspected, stop and keep clear. A competent person identifies it, or it is assumed to be asbestos, and it is removed by a licensed asbestos removalist unless the regulation allows otherwise.', `${QLD}s 422, s 458`, 'act'), /removed by a licensed asbestos removalist\. \(Work Health and Safety Regulation 2011 \(ACT\) s 422\)$/);
  // Elsewhere the friable and non-friable split stays.
  assert.ok(lines(draft('nsw', 'Remove 60 square metres of bonded asbestos cement sheeting from the walls of a commercial building as a licensed Class B removal.')).some((item) => /an independent licensed asbestos assessor where the work needed a Class A licence, as friable asbestos does/.test(item)));
});

test('NT: the Electricity Reform Act 2000', () => {
  const nt = draft('nt', 'Lift steel roof trusses with a crane truck next to overhead power lines.');
  const text = [...lines(nt), ...nt.controls.map((item) => item.text)].join('\n');
  assert.match(text, /Since 1 July 2024 the Electrical Safety Act 2022 \(NT\) has applied in place of Part 4\.7 of the regulations, and the Electricity Reform Act 2000 \(NT\) also imposes obligations in relation to electric lines in certain circumstances\./);
  assert.doesNotMatch(text, /Electrical Reform/);
});

test('removing temporary bracing is not demolition work; removing a wall\'s bracing still is', () => {
  for (const state of ['qld', 'nsw', 'wa', 'act']) {
    const ids = highRiskMatches('Remove temporary bracing from precast panels after the roof is fixed.', '', findState(state)).map((item) => item.id);
    assert.ok(!ids.includes('demolition'), state);
    assert.ok(ids.includes('precast'), state);
  }
  assert.ok(highRiskMatches('Remove the wall bracing and replace the wall frame in an existing commercial building.', '', findState('qld')).some((item) => item.id === 'demolition'));
});

test('live or existing underground power cables are energised electrical services (s 291(k))', () => {
  for (const task of ['Excavate with a vacuum truck to locate underground electrical cables and gas mains in a footpath.', 'Excavate near live underground power cables.', 'Hydro excavate to expose live high voltage cables in the road reserve.', 'Dig a trench across an 11 kV cable route.']) {
    for (const state of ['qld', 'wa', 'act']) assert.ok(highRiskMatches(task, '', findState(state)).some((item) => item.id === 'electrical'), `${state}: ${task}`);
  }
  // New cables are not yet energised, and an underground conduit is not a cable.
  for (const task of ['Lay new underground power cables in a trench to the shed.', 'Install underground conduits for telecommunications.']) {
    assert.ok(!highRiskMatches(task, '', findState('qld')).some((item) => item.id === 'electrical'), task);
  }
});

test('WA tilt-up work: removing temporary braces is tilt-up work; grinding erected panels is not (r 306A)', () => {
  const asked = (task) => (questionsFor({ state: 'wa', task, fallRisk: 'no' }).required || []).some((item) => item.id === 'regulatorNotified');
  assert.ok(asked('Remove temporary braces from tilt-up wall panels after the roof is fixed.'));
  assert.ok(!asked('Grind and patch precast concrete wall panels after they are erected on a warehouse.'));
  const text = lines(draft('wa', 'Erect tilt-up concrete wall panels for a warehouse using a 200 tonne mobile crane, with temporary braces.')).join('\n');
  assert.match(text, /and people authorised under a written law enter or stay in the area where it is done \(regulation 306I\)\./);
});

test('asbestos removal licence classes: Class A for friable, Class B or A over 10 m2 of non-friable (s 458, s 485, s 487)', () => {
  const task = 'Remove 80 square metres of friable asbestos pipe lagging from the plant room of a 1975 commercial building as a licensed Class A removal.';
  for (const [state, reg] of [['qld', 'WHS Reg s'], ['nsw', 'Work Health and Safety Regulation 2025 (NSW) s'], ['sa', 'Work Health and Safety Regulations 2012 (SA) r'], ['wa', 'Work Health and Safety (General) Regulations 2022 (WA) r'], ['tas', 'Work Health and Safety Regulations 2022 (Tas) r'], ['nt', 'Work Health and Safety (National Uniform Legislation) Regulations 2011 (NT) r']]) {
    const unit = reg.slice(-1);
    const item = draft(state, task).qualifications.find((name) => /^Licensed asbestos removalist/.test(name));
    assert.equal(item, `Licensed asbestos removalist (Class A for friable asbestos, Class B or A for more than 10 m2 of non-friable asbestos) with workers holding the VET asbestos removal certification. 10 m2 or less of non-friable asbestos may be removed without a licence by a competent person trained in identifying and safely handling asbestos (${reg} 445, ${unit} 458, ${unit} 460, ${unit} 485, ${unit} 487)`, state);
  }
  // Victoria: r 250 limited removal, r 264 and r 265 classes, r 269 training.
  assert.match(draft('vic', task).qualifications.find((name) => /^Licensed asbestos removalist/.test(name)), /Class A for friable asbestos, Class B or A for non-friable asbestos\)[^(]*for no more than 1 hour in any 7 days[^(]*\(Occupational Health and Safety Regulations 2017 \(Vic\) r 250, r 264, r 265, r 269\)$/);
});

test('sections each state has under the same heading are cited (NSW, WA)', () => {
  assert.equal(localSource(`${QLD}s 466`, 'wa'), 'Work Health and Safety (General) Regulations 2022 (WA) r 466');
  assert.equal(localSource(`${QLD}s 529D, s 529F, s 529G`, 'wa'), 'Work Health and Safety (General) Regulations 2022 (WA) r 529D, r 529F, r 529G');
  assert.equal(localSource(`${QLD}schedule 10`, 'wa'), 'Work Health and Safety (General) Regulations 2022 (WA) Schedule 10');
  assert.equal(localSource(`${QLD}s 529A, s 529B`, 'nsw'), 'Work Health and Safety Regulation 2025 (NSW) s 529A, s 529B');
  assert.equal(localSource(`${QLD}s 36, s 41, s 44, s 302, s 315, s 453, s 473`, 'wa'), 'Work Health and Safety (General) Regulations 2022 (WA) r 36, r 41, r 44, r 302, r 315, r 453, r 473');
});

test('confined space records: 28 days and completion, or 2 years after a notifiable incident (s 77(3))', () => {
  const task = 'Enter a 4 m deep sewer pump station wet well to replace a pump and valves.';
  for (const state of ['qld', 'nsw', 'sa', 'wa', 'tas', 'act', 'nt']) {
    const text = line(draft(state, task, { facts: { spaceAssessment: 'confined' } }), /^Close and sign off the entry permit/);
    assert.match(text, /^Close and sign off the entry permit, confirming everyone has left\. Keep the risk assessment until at least 28 days after the work and the permit until the work is complete, or both for at least 2 years after a notifiable incident, available for inspection and to workers on request\. \(.*\b77\)$/, state);
  }
});

test('installed engineered stone: removal, repair and disposal are controlled processing with notice (s 529F, s 529G)', () => {
  const removal = 'Remove and dispose of installed engineered stone benchtops from a commercial kitchen during a refurbishment.';
  const repair = 'Repair a chip and make a minor cut-out modification to an installed engineered stone benchtop in an office.';
  const cooktop = 'Replace a cooktop in an existing commercial kitchen, cutting the engineered stone benchtop cut-out to suit.';
  for (const [state, refs] of [['qld', 's 529G, s 529H, s 529I, s 529J'], ['nsw', 's 529G, s 529H, s 529I, s 529J'], ['sa', 'r 529G, r 529H, r 529I, r 529J'], ['wa', 'r 529G, r 529H, r 529I, r 529J'], ['tas', 'r 529G, r 529H, r 529I, r 529J'], ['nt', 'r 529G, r 529H, r 529J, r 529K']]) {
    for (const task of [removal, repair, cooktop]) {
      const text = lines(draft(state, task));
      assert.ok(text.some((item) => /^Installed engineered stone is cut, drilled or broken only to remove, repair, make minor modifications to or dispose of it, and only if the processing is controlled: .*529B, [rs] 529D, [rs] 529F\)$/.test(item)), `${state}: ${task}`);
      assert.ok(text.some((item) => item.startsWith('Before installed engineered stone is processed, written notice of the work') && item.endsWith(`${refs})`)), `${state}: ${task}`);
      assert.ok(!text.some((item) => /^No engineered stone benchtops, panels or slabs are supplied, installed or processed\./.test(item)), `${state}: ${task}`);
    }
  }
  // Victoria: r 319ZB with the r 319S to r 319X controls, and no notice.
  const vic = lines(draft('vic', removal));
  assert.ok(vic.some((item) => /^Installed engineered stone is cut, drilled or broken only to remove, repair, modify or dispose of it\. .*\(Occupational Health and Safety Regulations 2017 \(Vic\) r 319S, r 319V, r 319W, r 319X, r 319Y, r 319ZB\)$/.test(item)));
  assert.ok(!vic.some((item) => /written notice|its type, and its frequency/.test(item)));
  // The ACT: stone installed before 1 July 2024, water and one other control, notice kept 5 years.
  const act = lines(draft('act', removal));
  assert.ok(act.some((item) => /installed before 1 July 2024 .*continuous water feed.*\(Work Health and Safety Regulation 2011 \(ACT\) s 418F, s 418H\)$/.test(item)));
  assert.ok(act.includes('Before installed engineered stone is processed, written notice of the work, its type, and its frequency and duration is given to the regulator, and a copy is kept for 5 years. (Work Health and Safety Regulation 2011 (ACT) s 418I, s 418J)'));
});

test('engineered stone refusal: notice is required (s 529G); Victoria names r 319Y and sets no notice', () => {
  const task = 'Cut and install engineered stone benchtops in a commercial office fitout.';
  const nsw = prepareDraft({ state: 'nsw', task, fallRisk: 'no', residential: 'no' });
  assert.equal(nsw.kind, 'refused');
  assert.match(nsw.message, /the regulator must be given written notice before the work starts/);
  const vic = prepareDraft({ state: 'vic', task, fallRisk: 'no', residential: 'no' });
  assert.match(vic.message, /Occupational Health and Safety Regulations 2017 \(Vic\) \(regulation 319Y\)/);
  assert.doesNotMatch(vic.message, /notif|notice/);
  // Victoria: porcelain and sintered stone are excluded only without resin (r 5).
  assert.match(localControl('No engineered stone benchtops, panels or slabs are supplied, installed or processed. Porcelain and sintered stone are not engineered stone.', `${QLD}s 529A, s 529D`, 'vic'), /Porcelain and sintered stone products that contain no resin are not engineered stone\. \(Occupational Health and Safety Regulations 2017 \(Vic\) r 319Y\)$/);
});

test('Victoria: no demolition notice, r 355 excavation notice, r 298 asbestos notice, and no 1% threshold for Part 4.5', () => {
  const reg = 'Occupational Health and Safety Regulations 2017 (Vic)';
  const demolition = lines(draft('vic', 'Demolish a three storey concrete commercial building, 12 m high, with excavators and a high reach demolition machine.'));
  assert.ok(!demolition.some((item) => /6 m high/.test(item)));
  const trench = lines(draft('vic', 'Dig a 2.5 m deep trench with an excavator and lay a sewer main, with trench shields.'));
  assert.ok(trench.some((item) => /Where a trench more than 1\.5 m deep, a shaft more than 2 m deep or a tunnel is to be dug, and a person could enter it or it poses a risk to anyone, the Authority is notified in writing at least 3 days before the excavation work starts\. A trench or shaft dug as part of building work under a building permit that is in force needs no notice\. \(Occupational Health and Safety Regulations 2017 \(Vic\) r 5, r 354, r 355\)$/.test(item)));
  const asbestos = lines(draft('vic', 'Remove 60 square metres of bonded asbestos cement roof sheeting from a 1970s factory.'));
  assert.ok(asbestos.includes(`For licensed removal, the licence holder gives the Authority written notice at least 5 days before the work starts (24 hours for 10 m2 or less of non-friable asbestos), unless a licence condition sets other notice. (${reg} r 298)`));
  const sds = localControl('Keep dust below the exposure standard, and monitor the air if unsure. Check each product\'s safety data sheet: a product with 1% or more crystalline silica is a crystalline silica substance, and power sanding or cutting it is processing that must be controlled, with a written assessment before it starts.', `${QLD}s 49, s 50, s 529A, s 529C, s 529CA`, 'vic');
  assert.match(sds, /power sanding or cutting a product that contains crystalline silica is a crystalline silica process\. Before it starts, it is assessed, with a written record,[^(]*\(Occupational Health and Safety Regulations 2017 \(Vic\) r 165, r 166, r 319B, r 319J, r 319K\)$/);
  assert.doesNotMatch(lines(draft('vic', 'Cut and grind porcelain tiles and natural stone pavers with power tools for a commercial plaza.')).join('\n'), /1%|crystalline silica substance/);
  // Regulation 49 is left off anchor lines; r 125 and Schedule 2 for the hoist, without the number kept at it.
  assert.equal(localControl('Where harnesses are used, anchors are approved by a competent person, no one works alone, and a rescue procedure is set up and tested.', `${QLD}s 80`, 'vic'), 'Where harnesses are used, anchors are approved by a competent person, no one works alone, and a rescue procedure is set up and tested.');
  assert.equal(localControl('A personnel hoist with platform travel over 2.4 m has a registered design, and the registration number is kept at the hoist.', `${QLD}s 243, s 260, schedule 5`, 'vic'), `A personnel hoist with platform travel over 2.4 m has a registered design. (${reg} r 125, Schedule 2)`);
  assert.equal(localControl('Where a person or thing could fall more than 4 m from it, it is erected by a licensed scaffolder, handed over in writing by a competent person, and inspected at least every 30 days.', `${QLD}s 81, s 225, schedule 3`, 'vic'), `Where a person or thing could fall more than 4 m from it, it is erected by a licensed scaffolder. (${reg} r 128, Schedule 3)`);
  // Other states keep the 6 m notice and r 80 on anchor lines.
  assert.match(localControl('Where harnesses are used, anchors are approved by a competent person, no one works alone, and a rescue procedure is set up and tested.', `${QLD}s 80`, 'nsw'), /s 80\)$/);
});

test('edge protection installed by others: "to the regulation" only in Queensland (s 306E)', () => {
  const text = 'Work only inside edge protection installed by others to the regulation. Do not remove or alter it, and report any damage.';
  assert.equal(localControl(text, `${QLD}s 306E`, 'qld'), `${text} (${QLD}s 306E)`);
  for (const state of ['nsw', 'vic', 'sa', 'wa', 'tas', 'act', 'nt']) {
    assert.equal(localControl(text, `${QLD}s 306E`, state), 'Work only inside edge protection installed by others to its design or the manufacturer\'s instructions. Do not remove or alter it, and report any damage.', state);
  }
});

test('Tasmania: a SWMS stands in for the silica risk control plan only with everything r 529CB(2) lists', () => {
  const tas = lines(draft('tas', SILICA)).find((item) => /this SWMS can be the plan only/.test(item));
  assert.match(tas, /documents the processing, the form and proportion \(w\/w\) of crystalline silica,.*past air and health monitoring results at the workplace, and previous silica incidents, illnesses and diseases there\).*\(Work Health and Safety Regulations 2022 \(Tas\) r 529CB, r 529CC, r 529CD\)$/);
  // The model text stays in the other model states.
  assert.match(lines(draft('sa', SILICA)).find((item) => /this SWMS can be the plan only/.test(item)), /names the high risk processing, includes the written assessment/);
});

test('ACT: loose-fill demolition notice (s 142(1)(d)), porcelain as stone-substitute material, and the silica question', () => {
  const reg = 'Work Health and Safety Regulation 2011 (ACT)';
  const notice = line(draft('act', 'Demolish a three storey concrete commercial building, 12 m high, with excavators and a high reach demolition machine.'), /^Written notice is given to the regulator/);
  assert.equal(notice, `Written notice is given to the regulator at least 5 days before the work starts where the structure, or a load-bearing part of it, is at least 6 m high, where load shifting machinery is used on a suspended floor, where explosives are used, or where the structure contains or has contained loose-fill asbestos insulation. (${reg} s 142)`);
  // The model states and Queensland: s 142(1)(a) to (c).
  for (const state of ['qld', 'nsw', 'sa', 'tas', 'nt']) {
    assert.match(line(draft(state, 'Demolish a three storey concrete commercial building, 12 m high, with excavators and a high reach demolition machine.'), /^Written notice is given to the regulator/), /where load shifting machinery is used on a suspended floor, or where explosives are used\. \(.*142\)$/, state);
  }
  const tiles = lines(draft('act', 'Cut and grind porcelain tiles and natural stone pavers with power tools for a commercial plaza.'));
  assert.ok(tiles.some((item) => item.startsWith('Porcelain tiles and sintered stone containing crystalline silica are stone-substitute material') && item.endsWith(`(${reg} s 418A, s 418B, s 418C, s 418CAA)`)));
  assert.ok(!tiles.some((item) => /\btiles?\b/i.test(item) && /wet or with on-tool extraction|saw with on-tool extraction/.test(item)));
  assert.match(localControl('Tiles are cut with a wet saw or a saw with on-tool extraction, and a fit tested P2 respirator is worn.', '', 'act'), /^Tiles are cut with water and at least one other control, such as on-tool extraction \(porcelain is never processed dry\)/);
  const asked = questionsFor({ state: 'act', task: SILICA, fallRisk: 'no' }).required.find((item) => item.id === 'silicaControls');
  assert.doesNotMatch(asked.prompt, /written assessment/);
  assert.match(asked.prompt, /continuous water feed/);
  assert.ok(draft('act', SILICA).references.some((item) => item.label === 'Silica controls'));
  assert.match(questionsFor({ state: 'nsw', task: SILICA, fallRisk: 'no' }).required.find((item) => item.id === 'silicaControls').prompt, /written assessment/);
});

test('WA: roof spaces of Class 1, 2 and 10a buildings are de-energised (r 153); earthmoving machinery used as a crane is licensed (Schedule 3 items 14A, 15A)', () => {
  const reg = 'Work Health and Safety (General) Regulations 2022 (WA)';
  const roof = lines(draft('wa', 'Run new cables and install exhaust fans through the roof space of a three storey apartment building.'));
  assert.ok(roof.some((item) => /^Before anyone works in the roof space of a house, a unit building or a Class 10a building such as a garage or shed, a competent person de-energises the building's electrical installation/.test(item) && item.endsWith(`(${reg} r 153)`)));
  assert.ok(!roof.some((item) => /de-energised where practicable/.test(item)));
  assert.ok(lines(draft('nsw', 'Run new cables and install exhaust fans through the roof space of a three storey apartment building.')).some((item) => /de-energised where practicable/.test(item)));
  const insulation = lines(draft('wa', 'Install ceiling insulation batts in the roof space of townhouses in a medium density development.'));
  assert.ok(insulation.some((item) => /a competent person de-energises the building's electrical installation before the work starts\./.test(item) && item.endsWith(`(${reg} r 153)`)));
  const pipes = draft('wa', 'Lay 900 mm concrete stormwater pipes in a 2 m deep trench, lifting each pipe into place with a 30 tonne excavator.');
  assert.ok(lines(pipes).some((item) => /An excavator with a safe working load over 3 t used as a crane is operated by the holder of the high risk work licence for earthmoving machinery used as a crane/.test(item) && item.endsWith(`(${reg} r 81, Schedule 3)`)));
  assert.match(pipes.plant.find((item) => item.item === 'Excavator').licence, /^Yes where it is used as a crane with a safe working load over 3 t/);
  assert.ok(!pipes.plant.some((item) => /^Mobile crane/.test(item.item)));
  // Elsewhere an excavator is not a crane (r 5), so no licence.
  assert.equal(draft('sa', 'Lay 900 mm concrete stormwater pipes in a 2 m deep trench, lifting each pipe into place with a 30 tonne excavator.').plant.find((item) => item.item === 'Excavator').licence, 'No. Operator competent (verification of competency)');
});

test('Queensland electrical safety: s 204(3) 2 year records, s 199(1)(e) consultation, and the silica code section for water sprays', () => {
  const qld = lines(draft('qld', ENERGISED));
  assert.ok(qld.includes('Keep the risk assessment until at least 28 days after the work and this SWMS until the work is complete, or both for at least 2 years after a serious electrical incident or dangerous electrical event, readily available to the workers. (Electrical Safety Regulation 2026 (Qld) s 204)'));
  assert.ok(qld.some((item) => /authorisation after consulting the person with management or control of the workplace, usually the principal contractor\. \(Electrical Safety Regulation 2026 \(Qld\) s 199, s 200\)$/.test(item)));
  // Water sprays are the code's section 7.4.1 (water suppression), not 7.4.2 (local exhaust ventilation).
  const found = [];
  const walk = (value) => { if (value && typeof value === 'object') { if (typeof value.text === 'string' && /^Breaking masonry and slabs is processing/.test(value.text)) found.push(value.source); Object.values(value).forEach(walk); } };
  walk(require('../activities').ACTIVITIES);
  assert.ok(found.length && found.every((source) => /Code of Practice 2022 \(Qld\) s 7\.4\.1, s 7\.6, s 7\.6\.2$/.test(source)), found.join('\n'));
});

test('friable asbestos: enclosure, negative pressure, wet method and air monitoring (s 475, s 477); s 225 scope', () => {
  const task = 'Remove 80 square metres of friable asbestos pipe lagging from the plant room of a 1975 commercial building as a licensed Class A removal.';
  for (const state of ['qld', 'nsw', 'sa', 'wa', 'tas', 'nt', 'act']) {
    const text = lines(draft(state, task));
    const friable = text.find((item) => /^Friable asbestos is removed inside an enclosure that is tested for leaks, under negative pressure, using the wet method/.test(item));
    assert.match(friable, /below 0\.01 fibres\/ml\. \(.*\b475, [rs] 477\)$/, state);
    assert.ok(!text.includes('Keep the material wet and remove it whole, by hand.'), state);
    // The ACT's s 477 has no glove bag exception.
    assert.equal(/glove bags/.test(friable), state !== 'act', state);
  }
  assert.ok(!lines(draft('vic', task)).some((item) => /enclosure that is tested for leaks|negative pressure/.test(item)));
  assert.ok(lines(draft('nsw', 'Remove 60 square metres of bonded asbestos cement roof sheeting from a 1970s factory.')).some((item) => item.startsWith('Keep the material wet and remove it whole, by hand.')));
  const scaffold = draft('nsw', 'Erect a tube and coupler scaffold 20 m high on the facade of a commercial office building next to a public footpath.').plant.find((item) => item.item === 'Scaffold');
  assert.match(scaffold.inspection, /\(Work Health and Safety Regulation 2025 \(NSW\) s 225, for suspended, cantilevered, spur and hung scaffolds, and others over 4 m\)\.$/);
});

// Fourth round (review3 files).
test('high risk work: non-friable is not friable, stripping props is not s 291(e), and running freezer rooms are s 291(p)', () => {
  const tiles = 'Remove 15 square metres of non-friable asbestos vinyl floor tiles from a 1978 office as a licensed Class B removal.';
  for (const state of ['qld', 'nsw', 'wa', 'act']) assert.ok(!lines(draft(state, tiles)).some((item) => /^Friable asbestos is removed inside an enclosure/.test(item)), state);
  const ids = (task, state = 'qld') => highRiskMatches(task, 'yes', state).map((item) => item.id);
  assert.ok(!ids('Strip formwork and remove back props from a suspended concrete slab in a commercial building.').includes('temporary'));
  assert.ok(ids('Install temporary props and remove a section of existing slab.').includes('temporary'));
  for (const state of ['qld', 'nsw', 'wa', 'vic', 'act']) {
    assert.ok(ids('Install refrigeration pipework inside an operating freezer room at minus 25 degrees.', state).includes('temperature'), state);
    assert.ok(ids('Install shelving in a cold store at minus 20 C.', state).includes('temperature'), state);
  }
  assert.ok(!ids('Build a new cold store designed for minus 25 degrees.').includes('temperature'));
});

test('tower crane erection, climbing and dismantling need intermediate or advanced rigging (schedule 3 item 6(c))', () => {
  for (const state of ['qld', 'nsw', 'vic', 'wa']) {
    const { qualifications } = draft(state, 'Erect a tower crane on a commercial building site with a 200 tonne mobile crane.');
    assert.ok(qualifications.includes('High risk work licence: intermediate rigging (RI) or advanced rigging (RA), for erecting, climbing or dismantling the crane, and dogging (DG) or higher for slinging'), state);
    assert.ok(!qualifications.some((item) => /dogging or rigging \(DG, RB, RI or RA\)/.test(item)), state);
  }
});

test('whole structures, however described, get the demolition notice or licence lines', () => {
  const tasks = ['Demolish a 20 m high post-tensioned concrete office building using a high reach excavator and explosives for the core.', 'Demolish a single storey brick warehouse with load-bearing walls.', 'Demolish an 8 m high tilt-up concrete warehouse.', 'Implode a disused chimney stack with explosives.'];
  for (const task of tasks) {
    assert.ok(lines(draft('act', task)).some((item) => /^Written notice is given to the regulator at least 5 days before the work starts where .* loose-fill asbestos insulation\. \(Work Health and Safety Regulation 2011 \(ACT\) s 142\)$/.test(item)), task);
    assert.ok(lines(draft('wa', task)).some((item) => /^Class 1 or Class 2 demolition work is done by, or for, the holder of the demolition licence it needs\..*r 142B, r 142C, r 142F, r 142G, r 142I\)$/.test(item)), task);
    assert.ok(lines(draft('nsw', task)).some((item) => /^Written notice is given to the regulator at least 5 days before .* \(Work Health and Safety Regulation 2025 \(NSW\) s 142\)$/.test(item)), task);
  }
  const chimney = draft('nsw', 'Implode a disused chimney stack with explosives.');
  assert.ok(chimney.highRisk.some((item) => /^Involves demolition of an element/.test(item)));
  // A structure brought down with explosives is not taken down from the roof, and a tilt-up building being demolished is not braced.
  assert.ok(!lines(chimney).some((item) => /from the roof down/.test(item)));
  assert.ok(!draft('wa', 'Demolish an 8 m high tilt-up concrete warehouse.').jobSteps.some((step) => step.step === 'Stand and brace the precast elements'));
  // Strip-out is not whole demolition.
  assert.ok(!draft('nsw', 'Demolish internal partition walls in an office building.').jobSteps.some((step) => step.step === 'Demolish the structure'));
});

test('an excavator lifts pile heads only where designed plant is not reasonably practicable (s 219(2), (3))', () => {
  for (const [state, cite] of [['qld', 'Work Health and Safety Regulation 2011 (Qld) s 219'], ['nt', 'Work Health and Safety (National Uniform Legislation) Regulations 2011 (NT) r 219']]) {
    assert.equal(localControl('Broken pile heads are lifted with plant designed to lift them. An excavator is used to lift them only where plant designed to lift is not reasonably practicable, and the lift creates no greater risk than with plant designed for it.', `${QLD}s 219`, state), `Broken pile heads are lifted with plant designed to lift them. An excavator is used to lift them only where plant designed to lift is not reasonably practicable, and the lift creates no greater risk than with plant designed for it. (${cite})`);
  }
  assert.match(localControl('Broken pile heads are lifted with plant designed to lift them. An excavator is used to lift them only where plant designed to lift is not reasonably practicable, and the lift creates no greater risk than with plant designed for it.', `${QLD}s 219`, 'wa'), /not reasonably practicable, .*Schedule 3 item 14A or 15A\)\. \(Work Health and Safety \(General\) Regulations 2022 \(WA\) r 81, r 219, Schedule 3\)$/);
});

test('NSW: traffic control work needs a traffic control work training card (s 184A, s 184C)', () => {
  const nsw = draft('nsw', 'Replace kerb and channel and a stormwater pit on a busy arterial road with traffic controllers and an excavator.');
  assert.ok(lines(nsw).some((item) => /^Traffic control work \(directing traffic on a public road, and implementing, designing, amending or inspecting the work zone traffic management plan\) is done only by workers holding a traffic control work training card, or a temporary card, for that type of work.*\(Work Health and Safety Regulation 2025 \(NSW\) s 184A, s 184C\)$/.test(item)));
  assert.ok(!lines(nsw).some((item) => /road authority requires/.test(item)));
  assert.ok(nsw.qualifications.includes('Traffic control work training card, or temporary card, for the type of traffic control work (Work Health and Safety Regulation 2025 (NSW) s 184C)'));
  // Other states keep the general wording.
  assert.ok(lines(draft('sa', 'Replace kerb and channel and a stormwater pit on a busy arterial road with traffic controllers and an excavator.')).some((item) => /traffic controller accreditation the state's road authority requires/.test(item)));
});

test('Victoria: engineered stone is always high risk, BMU design registration, and r 44 and r 109 kept to what they say', () => {
  const reg = 'Occupational Health and Safety Regulations 2017 (Vic)';
  const stone = lines(draft('vic', 'Remove and dispose of installed engineered stone benchtops from a commercial kitchen during a refurbishment.'));
  assert.ok(stone.includes(`Cutting, drilling or breaking engineered stone is an engineered stone process, which is always high risk crystalline silica work. (${reg} r 319C, r 319E)`));
  assert.ok(!stone.some((item) => /determine whether the work is high risk crystalline silica work/.test(item)));
  // Other crystalline silica processes are still assessed.
  assert.ok(lines(draft('vic', SILICA)).some((item) => /determine whether the work is high risk crystalline silica work/.test(item)));
  assert.equal(localControl('The BMU has a current inspection and registration, and workers wear a harness attached to the anchor in the cradle.', '', 'vic'), `The BMU's design is registered and its inspection and maintenance records are kept (${reg} r 106, r 125, Schedule 2). Workers wear a harness attached to the anchor in the cradle.`);
  assert.equal(localControl('Manage failure of pressurised concrete lines and hydraulics.', `${QLD}s 214`, 'vic'), 'Manage failure of pressurised concrete lines and hydraulics.');
  assert.match(localControl('Manage failure of pressurised concrete lines and hydraulics.', `${QLD}s 214`, 'nsw'), /\(Work Health and Safety Regulation 2025 \(NSW\) s 214\)$/);
  assert.match(localControl('Shaft openings have barriers or fixed covers as soon as they are formed: covers are strong enough to take anyone who could fall onto them, securely fixed so they cannot be moved or removed by accident, and marked as covering a hole. Edge protection top rail at least 900 mm.', `${QLD}s 78, s 306E, s 306F`, 'vic'), new RegExp(`^Shaft openings have barriers or fixed covers as soon as they are formed \\(${reg.replace(/[()]/g, '\\$&')} r 44\\)\\. Covers are strong enough .* Edge protection has a top rail at least 900 mm high, to the relevant Australian Standard\\.$`));
});

test('ACT: lines that call the work crystalline silica processing give the s 418CAA controls', () => {
  const act = (text) => localControl(text, `${QLD}s 529B, s 529C`, 'act');
  for (const text of ['Cut-outs and edge work are done by the supplier off site where possible. Natural stone cut on site is cut wet or with on-tool extraction, by workers wearing fit tested P2 respirators, as cutting it is processing crystalline silica.', 'Slates are cut with a slate cutter or hand tools where possible. Power cutting is done wet or on extraction with a fit tested P2 respirator, as slate contains crystalline silica.', 'Where posts are set in paving or concrete, core or cut the hole with water suppression or on-tool extraction, as cutting concrete and pavers releases silica dust. Anyone still at risk of exposure wears a fit tested P2 respirator.']) {
    const out = act(text);
    assert.match(out, /a continuous water feed is used with at least one other crystalline silica control, or the next control section 418CAA allows where that is not reasonably practicable, and anyone still at risk wears a fit tested respirator\. \(Work Health and Safety Regulation 2011 \(ACT\) s 418A, s 418CAA\)$/, text);
    assert.doesNotMatch(out, /wet or (?:with|on) (?:on-tool )?extraction|water suppression or on-tool extraction/);
  }
});

test('figures the regulation does not set are not cited to it outside Queensland', () => {
  const lines78 = 'Work from a solid surface with edge protection wherever a fall of 2 m or more is possible: top rail at least 900 mm, rails no more than 450 mm apart, toe board at least 150 mm.';
  const bricks = 'Work from scaffold with brick guards where a fall of more than 2 m is possible, and do not overload bays: bricklaying and blocklaying need a heavy duty scaffold, rated up to 675 kg a bay. A scaffold over 4 m is used only after written handover, and inspected at least every 30 days.';
  const anchors = 'Where fall arrest is used, anchors carry at least 15 kN for one person or 21 kN for two, no one uses it alone, and the rescue procedure is in place.';
  for (const state of ['nsw', 'sa', 'wa', 'tas', 'nt', 'act']) {
    for (const [text, source] of [[lines78, `${QLD}s 78, s 306D, s 306E`], [bricks, `${QLD}s 225`], [anchors, `${QLD}s 80, s 306I`]]) {
      const out = localControl(text, source, state);
      // The citation comes before the figures, which follow uncited.
      const [cited, rest] = out.split(/\)\. /);
      assert.ok(rest, `${state}: ${out}`);
      assert.doesNotMatch(cited, /\b(?:900 mm|450 mm|150 mm|675 kg|15 kN|21 kN)\b/, `${state}: ${out}`);
      assert.match(rest, /relevant Australian Standard/, state);
      assert.doesNotMatch(rest, /\((?:Work Health|Occupational)/, state);
    }
  }
  // Queensland's own sections set the figures (s 306E, s 306I), and its scaffolding code the bay rating.
  assert.match(localControl(lines78, `${QLD}s 78, s 306D, s 306E`, 'qld'), /toe board at least 150 mm\. \(Work Health and Safety Regulation 2011 \(Qld\) s 78, s 306D, s 306E\)$/);
  const found = [];
  const walk = (value) => { if (value && typeof value === 'object') { if (typeof value.text === 'string' && value.text === bricks) found.push(value.source); Object.values(value).forEach(walk); } };
  walk(require('../activities').ACTIVITIES);
  assert.ok(found.length && found.every((source) => /Scaffolding Code of Practice 2021 \(Qld\) s 2\.3\.2\.3, Table 2$/.test(source)), found.join('\n'));
});
