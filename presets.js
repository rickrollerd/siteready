// Pick lists that cut typing: common tasks for each trade, and standard answers
// for the questions asked most often. The trades and tasks come from the owner's trade
// catalogue (goal 1, D189 to D192): pick-lists.json is built from it by
// scripts/build-presets.js, with the task words from pick-wording.js. Each task carries the
// job steps that cover it and the parts SiteWrite has no job steps for. Answers are starting
// points the user edits; ____ marks a blank.

const fs = require('fs');
const path = require('path');

const PICK_LISTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'pick-lists.json'), 'utf8'));
// The trades in the order shown, each with its group (Site and plant, Civil and infrastructure,
// Structure, Services, Finishes, Any trade) and its tasks.
const TRADES = PICK_LISTS.trades;
const GROUPS = PICK_LISTS.groups;

const ANSWERS = {
  fallControl: [
    ['Edge protection', 'Edge protection is installed around every open edge before work starts, and no one works outside it.'],
    ['Scissor lifts', 'Scissor lifts with guardrails are used for all work above 2 m, and platform ladders only for work below 2 m.'],
    ['Risers screened', 'Risers and shafts are screened at each level, with only the section being worked on opened and fenced.'],
    ['Penetration covers', 'Each penetration is covered with a fixed, marked cover as soon as it is formed, and the area below is barricaded.'],
    ['Travel restraint', 'Workers at the open edge use a travel restraint system to engineer designed anchors installed by a competent person, so they cannot reach the edge.'],
    ['Scaffold', 'Work is done from a scaffold with full edge protection, erected and handed over by a licensed scaffolder.'],
    ['Mobile scaffolds', 'Work above 2 m is done from mobile scaffolds with guardrails, erected to the supplier\'s instructions by a competent person, with castors locked while in use.'],
    ['Roof guardrail and mesh', 'Roof edge guardrail is installed to every open edge, and safety mesh is fixed under the sheets, before sheeting starts. No one works outside the guardrail.'],
    ['Boom lifts', 'Connections are made from boom lifts with guardrails, with harnesses attached to the boom lift anchor points. No one climbs the steel.'],
    ['Advance guardrails', 'Scaffolders work from a fully decked platform, with advance guardrails or temporary edge protection fitted before they step up to each new lift.'],
    ['EWP or mobile scaffold', 'Work above 2 m is done from an EWP or a mobile scaffold with guardrails, and platform ladders are used only for short work below 2 m.'],
    ['Roof edge guardrail', 'Roof edge guardrail is installed to every open edge before work starts, and no one works outside it.'],
    ['Stair void platforms', 'Work over the stair void is done from stair platforms or a scaffold with guardrails, built to fit the stairs, and no one works from a ladder on the stairs or leans over the balustrade.'],
    // From the Excavation work code's guardrails or barrier set back from the trench (scenarios/code-controls.json).
    ['Excavation edge barriers', 'Wherever a person could fall into the excavation, guardrails or a barrier set back from the edge are fitted so people cannot approach it, and open pits are covered or fenced when left.'],
    // From the Excavation work code s 4.4, as the library's trench lines have it (scenarios/code-controls.json): for a trench
    // only (messy round 15, B run 8: only building and roof answers were offered for a 2.6 m trench).
    ['Shields above ground', 'Trench shields or trench sheets stand above ground level, or guardrails or mesh covers are fitted to them.'],
    ['Fenced or covered', 'Open trenches are fenced or covered when no one is working at them.'],
  ],
  controlsConsidered: [
    ['Edge protection not possible', 'Edge protection was considered but cannot be fixed at ____ because ____. An elevating work platform was considered but ____.'],
  ],
  constructionTesting: [
    ['Licensed electrician tests', 'Construction wiring, switchboards, RCDs and leads are inspected and tested by ____ (licensed electrician) before first use and then at the intervals AS/NZS 3012 sets, and each is tagged with its test date.'],
  ],
  electricalSafety: [
    ['Lines located and isolated', 'Overhead and underground power near the work is located and marked before work starts. Where the work comes within ____ m, the network operator isolates the lines (permit ____). Otherwise plant and people stay outside the exclusion zone, with a safety observer watching.'],
  ],
  craneChart: [
    ['Chart duty', 'Rated capacity from the crane chart: ____ t at ____ m radius. Heaviest gross load (load, lifting gear and rigging) is ____ t at ____ m radius.'],
  ],
  loadLimits: [
    ['Engineer\'s drawing', 'Loads are placed only in the areas marked on the structural engineer\'s drawing ____ (____ kPa), checked by ____ before loading starts.'],
    ['Landing platform rating', 'The landing platform is rated for ____ t, shown on its tag, and loads are spread to the slab load limits on drawing ____.'],
  ],
  silicaControls: [
    ['On-tool extraction', 'Drilling and cutting are done with on-tool dust extraction. Fit tested P2 respirators are worn while drilling or cutting. The written silica assessment is done before work starts and attached to this SWMS.'],
    ['Wet cutting', 'Cutting and coring are done wet with a water-fed tool. Fit tested P2 respirators are worn while cutting. The written silica assessment is done before work starts and attached to this SWMS.'],
    // The grinding line is the library's (NSW Silica code s 2.3, appendix A).
    ['Shrouded grinder', 'Grinding concrete is done with a shrouded grinder on on-tool dust extraction. Fit tested P2 respirators are worn while grinding. The written silica assessment is done before work starts and attached to this SWMS.'],
  ],
  hotWorkPermit: [
    ['Principal contractor permit', 'The principal contractor issues a hot work permit each day. A fire extinguisher is kept at each work area, and the area is checked after hot work ends.'],
  ],
  pressureTesting: [
    ['Gas line test', 'Gas pipework is tested with air or nitrogen to ____ kPa for the time the gas installation standard sets, never with water or oxygen, with no ignition sources nearby, and pressure released to a safe place outside before any fitting is touched.'],
    ['Water test', 'Tested with water to ____ kPa, with the area barricaded and signed during the test, and pressure released through the drain valve before any fitting is touched.'],
    ['Air test', 'Tested with air to ____ kPa, the lowest pressure the standard or design allows, through a regulator with a relief valve, raised in stages with the area barricaded and signed, and pressure released through the vent valve before any fitting is touched.'],
    ['Duct or room leakage test', 'Tested with a calibrated test fan to ____ Pa, the pressure the design or its pressure class sets, raised gradually with people kept clear of blanks and access panels, and the fan stopped and pressure let down before any blank or seal is removed.'],
    ['Nitrogen test', 'Oxygen-free nitrogen through a regulator with a relief valve, tested to ____ kPa (below the PS on the equipment plate), with the area barricaded and signed, and pressure released before any fitting is touched.'],
  ],
  safetyDataSheet: [
    ['Kept at the work area', 'The products used are ____. They are used with good ventilation and away from ignition sources, with the gloves and eye protection their safety data sheets list.'],
  ],
  systemInstructions: [
    ['Supplier instructions', 'The ____ system is erected to the supplier\'s instructions (document ____, revision ____) by a crew trained by ____.'],
  ],
  isolationProcedure: [
    ['Lock out and test', 'Circuits are isolated, locked with personal locks and danger tagged, and tested de-energised by a licensed electrician before work.'],
  ],
  plantIsolation: [
    ['Lock out and try', 'Each unit is isolated at its local isolator and locked out with personal padlocks, tested by trying to start it, and plant under building management control is put in manual off.'],
  ],
  formworkDesign: [
    ['Engineer\'s design', 'Formwork and falsework are to the engineer\'s design ____ (revision ____), checked and signed off by ____ before the pour.'],
  ],
  temporarySupport: [
    ['Engineer\'s design', 'Temporary supports are to the engineer\'s design ____, installed and checked by ____ before loads are applied.'],
  ],
  confinedSpace: [
    ['Permit entry', 'Entry only under a confined space entry permit, with atmospheric testing before and during entry, a standby person at the opening, and a practised rescue plan.'],
  ],
  erectionSequence: [
    ['Designer\'s sequence', 'Steel is erected to the designer\'s sequence on drawing ____ (revision ____), with temporary bracing as shown, and ____ checks the structure is stable before each member is released from the crane or lifting gear.'],
  ],
  serviceShutdown: [
    ['Shutdown permit', 'Each connection to a live service is made under a shutdown permit ____, approved by ____, in the agreed window of ____. The service is isolated, locked and proved dead before the connection, and the people it supplies are told beforehand.'],
    ['Hospital shutdown permit', 'Each connection is done under the hospital\'s shutdown permit ____, approved by ____ (hospital engineering), in the agreed window of ____. The ward and clinical staff are told beforehand, and ____ (backup supply, such as cylinders or a temporary feed) keeps patients supplied.'],
  ],
  tierErection: [
    ['Engineer\'s erection design', 'Units are placed to the engineer\'s erection design ____ (revision ____): bearing pads and fixings as detailed, placed in the sequence shown, with temporary propping where the design shows it, checked by ____ before the hook is released.'],
  ],
  harnessSystem: [
    ['Travel restraint', 'Workers wear a full body harness with a restraint lanyard of ____ m, set so they cannot reach the edge, clipped to anchors ____ installed and rated by ____. Harnesses and lanyards are checked by the user before each use and inspected by a competent person every ____ months, recorded on the tag. Users are trained in working at heights by ____.'],
    ['Fall arrest', 'Workers wear a full body harness with a shock-absorbing lanyard, clipped to anchors ____ rated for at least 15 kN for one person and installed by ____, with enough clear distance below to stop a fall before anyone hits the ground or a structure. Harnesses are checked before each use and inspected by a competent person every ____ months, recorded on the tag. Users are trained in working at heights and rescue by ____. The rescue plan is ____, with the rescue equipment on site.'],
  ],
  groundBearing: [
    ['Geotechnical report', 'The set-up area was assessed by geotechnical engineer ____ (report ____, revision ____): allowable bearing pressure ____ kPa. The crane sets up on mats of ____ sized for its outrigger loads at the heaviest lift, back from excavations and services shown in the report.'],
    ['Slab or deck', 'The slab or deck was checked by structural engineer ____ (letter ____) for the crane\'s outrigger loads at the heaviest lift, with back propping ____ below. The crane sets up only at the marked positions on spreader mats of ____.'],
  ],
  lifeJacketDetails: [
    ['Inflatable life jackets', 'Workers wear level 150 inflatable life jackets to AS 4758 whenever they are within ____ m of the water edge or on the water. Each wearer checks the cylinder, indicator and straps before use, and they are serviced by ____ every ____ months as the maker requires, recorded on the tag. Rescue: ____ (rescue boat, life ring and throw line at ____), and workers are trained in their use by ____.'],
    ['Foam life jackets', 'Workers wear level 100 foam life jackets to AS 4758 whenever they are within ____ m of the water edge or on the water. Each wearer checks the jacket for damage and fit before use, and damaged ones are taken out of use. Rescue: ____ (rescue boat, life ring and throw line at ____), and workers are trained in their use by ____.'],
  ],
  spoilPlan: [
    ['Clean spoil to a licensed site', 'Spoil is classified as ____ (for example clean fill), tested by ____ (report ____), and taken to ____ (a site or facility able to receive it), with the waste records the state environment regulator requires. Stockpiles are kept only at ____, as the principal contractor allows, and covered with ____.'],
    ['Contaminated or unknown spoil', 'Spoil is treated as contaminated until test report ____ shows otherwise. It is kept apart and covered at ____, handled under ____ (remediation or asbestos plan), and taken only to ____ (a facility licensed for that waste), with the waste tracking records the state environment regulator requires.'],
  ],
  excavationPlan: [
    ['Geotechnical design', 'Excavation follows the geotechnical design ____ (revision ____) in stages to the levels shown, with batters no steeper than ____, and plant and trucks follow the site traffic management plan (TMP) ____.'],
  ],
  rigExclusionZone: [
    ['Fenced radius', 'Each rig has a fenced and signed exclusion zone of ____ m radius. Only the rig crew enters, with the operator\'s agreement, controlled by the piling supervisor.'],
  ],
  pilingPlatform: [
    ['Engineer\'s certificate', 'The working platform is designed by ____ (geotechnical engineer) for the ____ rig, with a maximum plant loading of ____ kPa. The platform certificate is given to the rig operator before the rig goes on it.'],
  ],
  trenchSupport: [
    ['Trench shield', 'Trenches 1.5 m deep or more are shored with a trench shield rated for ____ m, as designed by the supplier\'s engineer.'],
  ],
};

// The fall control that fits the work comes first, so the first standard answer is not
// edge protection for a job with no open edge (a roller door, ceiling cabling, a stairwell).
const FALL_FIRST = [
  // Putting up a scaffold: the scaffold is the work, not the fall control.
  ['Advance guardrails', /\b(?:erect|dismantl|put up|install|build|strik)\w*\b(?:(?!\b(?:from|off|using|with|on)\b)[^.]){0,40}\bscaffold|\bscaffold\w*\b[^.]{0,20}\b(?:erect|dismantl)\w*/i],
  ['Stair void platforms', /\b(stairwells?|stair voids?)\b/i],
  ['Risers screened', /\b(risers?|lift shafts?|service shafts?|landing doors?)\b/i],
  ['Travel restraint', /\bbalustrad\w*\b/i],
  ['Roof guardrail and mesh', /\b(re-?sheet\w*|re-?roof\w*|roof sheet\w*|sheet\w* (?:the |a )?(?:\w+ )?roofs?|new (?:metal |colorbond |iron )?roof(?:ing)?|(?:install|fix|lay)\w* (?:a |the )?(?:new )?(?:metal |colorbond |iron )?roof(?:ing)?\b(?! (?:ventilators?|vents?|fans?|plant|units?|hatch\w*|access)))/i],
  ['Roof edge guardrail', /\b(roofs?|roof ?tops?|gutters?|fascias?|skylights?|chimneys?|flues?|valleys?|flashings?)\b/i],
  // Work with a real open edge: a slab, deck, balcony, bridge, stand or excavation.
  ['Edge protection', /\b(edges?|edge protection|decks?|decking|balcon(?:y|ies)|bridges?|overpass\w*|wharf|wharves|jett(?:y|ies)|pontoons?|mezzanine\w*|stairs?|staircases?|landings?|basements?|excavat\w*|batters?|grandstands?|stands?|tiers?|rakers?|multi[- ]?storey|slabs?|floors?|level \d+|\d+ storey|podiums?|terraces?|platforms?|voids?|penetrations?|formwork|falsework|piles?|gantr(?:y|ies)|hoardings?|canop(?:y|ies)|silos?|spires?|towers?|cliffs?|shafts?|escalators?|seating)\b/i],
  ['Scaffold', /(?<!mobile )\bscaffold\w*\b|\b(brick\w*|blockwork|block walls?|render\w*)\b/i],
  ['Scissor lifts', /\bscissor lifts?\b/i],
  ['Boom lifts', /\b(steel (?:columns?|beams?|frames?|erect\w*)|structural steel|portal frames?)\b/i],
  // Work reached from below, with no open edge: doors, ceilings, cabling, lights, signs and walls.
  ['EWP or mobile scaffold', /\b(shade (?:structures?|sails?|covers?)|carports?|awnings?|verandahs?|patio (?:roofs?|covers?)|doors?|ceilings?|cabl\w*|data|wi-?fi|access points?|lights?|lighting|ducts?|ductwork|dampers?|signs?|signage|pylons?|cameras?|cctv|sprinklers?|alarms?|detectors?|screens?|windows?|pergolas?|walls?|paint\w*|exterior|cladding|awnings?|netting|spikes|frames?|beams?|pipework|pipes?|trays?|conduits?|fans?|heaters?|shelving|racking|curtains?|blinds?|poles?|street ?lights?)\b/i],
];

// The answers for a fall into the ground only.
const GROUND_ONLY = ['Excavation edge barriers', 'Shields above ground', 'Fenced or covered'];
const CIVIL_PARTS = /\b(?:precast|concrete|gully|junction|stormwater|sewer|drainage)\s+(?:\w+\s+)?(?:pits?|pipes?|culverts?|headwalls?|manholes?|chambers?|units?)\b|\btrench (?:walls?|shields?|boxes?|sheets?)\b/gi;
const TRENCH_LAID = /\b(?:pipes?|pipework|pipelines?|conduits?|cables?|drains?|pits?|culverts?)\b/gi;
const OPEN_GROUND = /\b(excavat\w*|trench\w*|dig(?:s|ging)?|earthworks?|batters?|bulk earthworks?)\b/i;
const BURIED_SERVICES = /\b(?:underground|buried|in-ground|below-ground|stormwater|sewer|drainage)\s+(?:\w+\s+)?(?:pipes?|pipework|pipelines?|conduits?|cables?|services)\b/gi;
const BUILDING_HEIGHT = /\b(roofs?|ceilings?|scaffold\w*|storeys?|level [1-9]\d*|upper (?:floors?|levels?)|suspended|decks?(?! pool)|balcon\w*|risers?|shafts?(?! excavat)|stairs?|mezzanine\w*|ewps?|scissor lifts?|boom lifts?|ladders?|walls?|facades?|towers?|bridges?|formwork|falsework|precast|steel)\b/i;

// Standard answers for a required fact, as { label, text }. With the task, the fall
// control answers are put in the order that suits it.
function answersFor(id, task) {
  const list = (ANSWERS[id] || []).map(([label, text]) => ({ label, text }));
  if (id === 'pressureTesting' && task) return pressureAnswers(list, task);
  if (id === 'silicaControls') return silicaAnswers(list, task);
  // The hospital's shutdown answer only where the work is at a hospital (messy round 10, run 6).
  if (id === 'serviceShutdown' && task && !/\b(hospitals?|medical gas\w*|patients?|wards?|clinic\w*|aged care|nursing homes?)\b/i.test(task)) return list.filter((answer) => answer.label !== 'Hospital shutdown permit');
  if (id !== 'fallControl' || !task) return list.filter((answer) => !GROUND_ONLY.includes(answer.label));
  // A fall into an open excavation, pit or pool hole, with no building work at height: the excavation's
  // own answers, not roof mesh, riser screens or scissor lifts (messy round 5).
  // Pipes, cables or conduits laid in the ground are not work reached from below.
  // Nor are the precast pits, pipes and culverts a trench crew places, or the trench's walls and shields: in a trench
  // the pipes, pits and drains are laid in the ground (messy round 15, B run 8: "place the precast pits" and "the pipes"
  // gave a 2.6 m stormwater trench only building and roof answers).
  const ground = String(task).replace(CIVIL_PARTS, ' ');
  const above = ground.replace(BURIED_SERVICES, '').replace(TRENCH_LAID, ' ');
  if (OPEN_GROUND.test(task) && !BUILDING_HEIGHT.test(ground) && !FALL_FIRST.some(([label, pattern]) => label !== 'Edge protection' && pattern.test(above))) {
    // The trench answers only for a trench, and the shields answer only where the task names shields or sheets.
    const trench = /\btrench\w*\b/i.test(task);
    const shields = /\b(?:shields?|trench (?:sheets?|boxes?)|shor(?:e|ed|ing)|sheet piles?)\b/i.test(task);
    const labels = trench ? ['Excavation edge barriers', ...(shields ? ['Shields above ground'] : []), 'Fenced or covered', 'Edge protection'] : ['Excavation edge barriers', 'Penetration covers', 'Edge protection'];
    return labels.map((label) => list.find((answer) => answer.label === label)).filter(Boolean);
  }
  list.splice(0, list.length, ...list.filter((answer) => !GROUND_ONLY.includes(answer.label)));
  const first = FALL_FIRST.find(([, pattern]) => pattern.test(task));
  // The crew that erects the scaffold is not handed it over by a licensed scaffolder: that answer is for the trades that
  // work from it (messy round 15, A run 4: it printed as the first control of "Erect the scaffold").
  if (first && first[0] === 'Advance guardrails') list.splice(0, list.length, ...list.filter((answer) => answer.label !== 'Scaffold'));
  if (!first) return list;
  const pick = list.find((answer) => answer.label === first[0]);
  return [pick, ...list.filter((answer) => answer !== pick)];
}

// The silica answers that fit the work (messy round 5: "Cutting and coring are done wet" printed for
// grinding a pool shell): the grinding answer where the work grinds, the cutting ones where it cuts,
// drills or cores. With no task, or neither named, the cutting answers as before.
function silicaAnswers(list, task) {
  const grinds = /\b(grind\w*|grinders?|scabbl\w*|polish\w*)\b/i.test(task || '');
  const cuts = /\b(cut\w*|saw\w*|cor(?:e|es|ed|ing)|drill\w*|chas(?:e|es|ed|ing)|rout\w*)\b/i.test(task || '');
  const grinding = list.filter((answer) => answer.label === 'Shrouded grinder');
  const cutting = list.filter((answer) => answer.label !== 'Shrouded grinder');
  if (grinds && !cuts) return grinding;
  if (grinds) return [...cutting, ...grinding];
  return cutting;
}

// The gas line test is offered only where the task names gas: a pool, water or air test is
// not gas pipework. Refrigeration is tested with nitrogen, ducts, plenums and rooms with a
// test fan, a named air test with air, and other pipework with water first.
function pressureAnswers(list, task) {
  // A gas suppression room is tested with a fan, not as gas pipework.
  const gas = /\bgas\b(?! suppression)/i.test(task);
  const other = /\b(water|hydraulic|plumbing|pools?|spas?|refrigera\w*|air ?con\w*|split systems?|chilled|heating hot water|ducts?|plenums?|air test\w*|pneumatic)\b/i.test(task);
  const airTest = /\b(air test\w*|pneumatic\w*|compressed air|air pressure|with air)\b/i.test(task);
  const duct = /\b(plenums?|ducts?|ductwork|(?:ser|server|comms|switch|data|gas suppression) rooms?|(?:room|enclosure) integrity|for leakage)\b/i.test(task) && !/\b(pipe\w*|lines?)\b/i.test(task);
  const waterTest = /\b(hydrostatic\w*|water test\w*|with water|hydraulic test\w*)\b/i.test(task);
  let first = 'Water test';
  if (/\b(refrigera\w*|air ?con\w*|split systems?|nitrogen)\b/i.test(task)) first = 'Nitrogen test';
  else if (duct) first = 'Duct or room leakage test';
  else if (airTest && !waterTest) first = 'Air test';
  const rest = list.filter((answer) => answer.label !== 'Gas line test');
  const ordered = [...rest.filter((answer) => answer.label === first), ...rest.filter((answer) => answer.label !== first)];
  if (!gas) return ordered;
  const gasTest = list.filter((answer) => answer.label === 'Gas line test');
  return other ? [...ordered, ...gasTest] : [...gasTest, ...ordered];
}

// Every standard answer's wording for a question, whatever the task: the blanks (____) in them are read to
// judge what was typed in each (draft.js presetFillWhy).
const answerTexts = (id) => (ANSWERS[id] || []).map(([, text]) => text);

module.exports = { TRADES, GROUPS, answersFor, answerTexts };
