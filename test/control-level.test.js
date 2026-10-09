// The hierarchy level SiteReady reads from a control line (goal 5 review, 7 October 2026): the line
// is read without its citation, "rather than" swaps count only where a hazardous tool or product is
// replaced, and a control named only in a check, a negation or a condition is not put in place.
const test = require('node:test');
const assert = require('node:assert/strict');
const { controlLevel, inHierarchyOrder } = require('../control-level');

test('the printed citation does not set the level', () => {
  const line = 'Scaffold from which a person or thing could fall more than 4 m is erected by licensed scaffolders.';
  assert.equal(controlLevel(line), 'Administrative');
  assert.equal(controlLevel(`${line} (Scaffolding Code of Practice 2021 (Qld) s 4.1)`), 'Administrative');
  assert.equal(controlLevel('Workers hold a white card. (Work Health and Safety Regulation 2025 (NSW) s 317)'), 'Administrative');
  // Wording in brackets that is not a citation still counts.
  assert.equal(controlLevel('Power tools are used only through a safety switch (RCD).'), 'Isolate or engineer');
});

test('"rather than", "instead of" and "in place of" are substitution only where a hazardous tool or product is replaced', () => {
  assert.equal(controlLevel('Use snips or a metal cutting saw rather than an abrasive disc. An abrasive disc is used only for cuts that snips or a saw cannot make.'), 'Substitute');
  assert.equal(controlLevel('Use water-based paint instead of solvent-based paint, unless the paint specification calls for a solvent-based product.'), 'Substitute');
  assert.equal(controlLevel('Use battery tools in place of mains tools.'), 'Substitute');
  assert.equal(controlLevel('Keep dust below the exposure standard, and vacuum or wet clean instead of dry sweeping.'), 'Substitute');
  // Next to fall arrest, "instead of" swaps one fall control for a lower one: the line is PPE.
  assert.equal(controlLevel('Where the user could fall through fragile roofing or the slope is over 15 degrees, an individual fall arrest system is used instead of a restraint technique.'), 'PPE');
  // A barrier in place of guardrails is still a barrier; a lifting aid in place of holding is a mechanical aid.
  assert.equal(controlLevel('A barrier used in place of guardrails stands 2 m back from the trench edge.'), 'Isolate or engineer');
  assert.equal(controlLevel('Use lifting aids such as duct lifters for overhead duct sections, rather than holding them up by hand.'), 'Isolate or engineer');
  assert.equal(controlLevel('Use step platforms rather than plain stepladders.'), 'Isolate or engineer');
  // A work method or a place is not a substitution, and "stone-substitute material" is a material's name.
  assert.equal(controlLevel('Traffic controllers are relieved for breaks rather than leaving their post.'), 'Administrative');
  assert.equal(controlLevel('Porcelain tiles are stone-substitute material: they are cut with power tools only with a continuous water feed and on-tool extraction.'), 'Isolate or engineer');
});

test('a control named only in a check, a negation, a condition or a licence is not put in place', () => {
  assert.equal(controlLevel('Assess in writing before starting whether the processing is high risk. The assessment does not count PPE or administrative controls, and does not rely on the dust controls used for the processing, such as wet methods, extraction or isolation.'), 'Administrative');
  assert.equal(controlLevel('Pre-start check of dust extraction and water suppression equipment for kinks, holes or leaks. Faults are fixed before work starts.'), 'Administrative');
  assert.equal(controlLevel('A competent person checks the EWP before work restarts.'), 'Administrative');
  assert.equal(controlLevel('Dusty clothing is vacuumed with an M or H class vacuum or changed before leaving the work area.'), 'Administrative');
  assert.equal(controlLevel('Do not use bricks or building blocks to take the weight of any part of the tower, and do not use ladders on the scaffold to gain extra height.'), 'Administrative');
  assert.equal(controlLevel('A licensed scaffolder erects the scaffold to the manufacturer\'s instructions.'), 'Administrative');
  assert.equal(controlLevel('The emergency plan covers ground slip, flooding and rescue from the trench.'), 'Administrative');
  assert.equal(controlLevel('Prefabricated towers have a registered design and components are not mixed.'), 'Administrative');
  // The same equipment worked from, or put in place, is engineering.
  assert.equal(controlLevel('Units above 2 m are fitted from an EWP, scaffold or platform.'), 'Isolate or engineer');
  assert.equal(controlLevel('Access is by the scaffold stair only.'), 'Isolate or engineer');
  assert.equal(controlLevel('Skylights are covered with fixed covers.'), 'Isolate or engineer');
  // A harness condition keeps the line with the PPE; fit testing a respirator is part of the PPE.
  assert.equal(controlLevel('Where harnesses are used, anchors are approved by a competent person and a rescue procedure is set up.'), 'PPE');
  assert.equal(controlLevel('Tight-fitting respirators are fit tested to the wearer before first use and at least annually.'), 'PPE');
});

test('physical controls the codes rank as engineering or isolation are read as such', () => {
  for (const line of [
    'Use RCD protected tools and leads.',
    'Carpet tiles are moved in cartons on trolleys.',
    'Generators and tanks are lifted into place with a crane.',
    'Gas cylinders are secured upright, with valves closed when not in use.',
    'A bund is placed around the drilling to contain water and slurry.',
    'No one stands between a reversing delivery truck and the hopper.',
    'Keep generators and tanks under control and never move them over people.',
    'Tools are secured to an anchor point with tool lanyards so they cannot fall from the platform.',
    'Fans and electrical equipment are designed for hazardous areas.',
  ]) assert.equal(controlLevel(line), 'Isolate or engineer', line);
  for (const line of ['Use knee pads.', 'Sun protection: hat or brim, long sleeves and pants, and sunscreen.']) assert.equal(controlLevel(line), 'PPE', line);
  assert.equal(controlLevel('Purge all traces of flammable material from drums before welding.'), 'Eliminate');
  assert.equal(controlLevel('Loads are slung from the ground.'), 'Eliminate');
  assert.equal(controlLevel('The EWP is positioned so the lowering controls stay accessible from the ground.'), 'Administrative');
});

// The misorders the goal 5 review found in printed drafts now come out in hierarchy order.
test('the review\'s misordered steps print in hierarchy order', () => {
  const roof = [
    'Where the user could fall through fragile roofing or the slope is over 15 degrees, an individual fall arrest system is used instead of a restraint technique.',
    'Edge protection is in place at the roof edges before work starts.',
    'Safety mesh is not walked on unless it is designed for that.',
    'A total restraint system uses a prescribed lanyard length so workers cannot reach an edge, hole or fragile surface.',
  ];
  const ordered = inHierarchyOrder(roof);
  assert.ok(ordered.indexOf(roof[0]) > ordered.indexOf(roof[1]), 'fall arrest prints below edge protection');
  assert.ok(ordered.indexOf(roof[0]) > ordered.indexOf(roof[3]), 'fall arrest prints below travel restraint');
  const studs = [
    'Cuts with an abrasive disc are hot work: they are made only under the site\'s hot work permit, with combustible materials cleared or covered, a fire extinguisher at the work, and a fire watch during the cutting and for at least 30 minutes after it stops. (SafeWork NSW Code of practice: Welding processes (December 2022) s 3.4)',
    'Use snips or a metal cutting saw rather than an abrasive disc. An abrasive disc is used only for cuts that snips or a saw cannot make.',
  ];
  assert.deepEqual(inHierarchyOrder(studs), [studs[1], studs[0]]);
});

// Goal 5 citation check: the NSW hazardous chemicals code appendix J has no refuelling text, so the
// refuelling line cites only the NSW cutting code s 5.6, which does cover it.
test('the NSW refuelling line cites the cutting code, not the hazardous chemicals code appendix J', () => {
  const { ACTIVITIES } = require('../activities');
  const { localControl } = require('../citations');
  const text = 'Petrol-driven saws, trowels and generators are refuelled only when stopped and cool.';
  const sources = [];
  JSON.stringify(ACTIVITIES, (key, value) => { if (value && value.text === text) sources.push(value.source); return value; });
  assert.equal(sources.length, 1);
  const printed = localControl(text, sources[0], 'nsw');
  assert.match(printed, /Working safely when cutting, drilling and grinding concrete and masonry products \(May 2026\) s 4\.4, s 5, s 5\.6\)$/);
  assert.doesNotMatch(printed, /hazardous chemicals/i);
});

// The Queensland hazardous manual tasks code ends at s 4.8; team handling is in s 4.7.
test('the butt fusion team lift line cites a section the Queensland code has', () => {
  const { ACTIVITIES } = require('../activities');
  const { localControl } = require('../citations');
  const text = 'Pipe is lifted into the machine with roller stands or mechanical aids. Team lifts are an interim control only.';
  const sources = [];
  JSON.stringify(ACTIVITIES, (key, value) => { if (value && value.text === text) sources.push(value.source); return value; });
  assert.equal(sources.length, 1);
  assert.match(localControl(text, sources[0], 'qld'), /Hazardous manual tasks Code of Practice 2021 \(Qld\) s 4\.1, s 4\.7\)$/);
});
