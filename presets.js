// Pick lists that cut typing: common tasks for each trade, and standard answers
// for the questions asked most often. Every task comes from a project set that is
// stress tested in every state (scenarios/projects), so its wording is known to
// draft correctly. Answers are starting points the user edits; ____ marks a blank.

const fs = require('fs');
const path = require('path');

const PROJECTS = path.join(__dirname, 'scenarios', 'projects');
const TRADE_ORDER = ['site establishment and traffic', 'earthworks', 'piling', 'excavation', 'structure', 'precast seating', 'scaffolding and hoists', 'structural steel', 'concrete cutting', 'waterproofing', 'masonry', 'electrical', 'plumbing', 'mechanical', 'medical gases', 'hospital plant', 'fire services', 'ICT and security', 'pneumatic tube', 'lifts', 'facade', 'roofing', 'helipad', 'sports lighting and screens', 'live hospital connections', 'passive fire', 'carpentry fit-out', 'plasterboard and ceilings', 'radiation shielding', 'glazing and balustrades', 'joinery and stone', 'tiling', 'painting', 'flooring', 'seating', 'pitch', 'landscaping', 'final clean'];
const TRADE_NAMES = { 'medical gases': 'Medical gases', 'hospital plant': 'Hospital plant (boilers, generators)', helipad: 'Helipad', 'live hospital connections': 'Connections into the live hospital', 'pneumatic tube': 'Pneumatic tube system', 'radiation shielding': 'Radiation shielding (lead)', earthworks: 'Earthworks', 'precast seating': 'Precast seating tiers', 'sports lighting and screens': 'Sports lighting and screens', seating: 'Seating', pitch: 'Pitch and turf', 'site establishment and traffic': 'Site establishment and traffic', 'concrete cutting': 'Concrete cutting', 'fire services': 'Fire services', lifts: 'Lifts', roofing: 'Roofing', 'passive fire': 'Passive fire', 'glazing and balustrades': 'Glazing and balustrades', 'joinery and stone': 'Joinery and stone benchtops', landscaping: 'Landscaping', 'final clean': 'Final clean', 'scaffolding and hoists': 'Scaffolding and hoists', 'structural steel': 'Structural steel', masonry: 'Masonry', 'plasterboard and ceilings': 'Plasterboard and ceilings', painting: 'Painting', flooring: 'Flooring', excavation: 'Excavation (basement)', waterproofing: 'Waterproofing', 'carpentry fit-out': 'Carpentry fit-out', tiling: 'Tiling', piling: 'Piling', structure: 'Structure (formwork, reo, concrete, precast)', electrical: 'Electrical', plumbing: 'Plumbing', mechanical: 'Mechanical (HVAC)', 'ICT and security': 'ICT and security', facade: 'Facade' };

// Projects that share a trade (the tower and the stadium both have piling) give
// one trade with the tasks of both.
function loadTrades() {
  const trades = new Map();
  for (const name of fs.readdirSync(PROJECTS).filter((file) => file.endsWith('.json')).sort()) {
    const project = JSON.parse(fs.readFileSync(path.join(PROJECTS, name), 'utf8'));
    const id = project.title.split(': ').pop();
    if (!trades.has(id)) trades.set(id, { id, name: TRADE_NAMES[id] || id, tasks: [] });
    const { tasks } = trades.get(id);
    for (const swms of project.swms) {
      if (tasks.some((item) => item.task === swms.task)) continue;
      tasks.push({ title: swms.title, task: swms.task, fallRisk: swms.fallRisk, crane: swms.crane === 'own' ? 'own' : 'company' });
    }
  }
  const order = (id) => (TRADE_ORDER.includes(id) ? TRADE_ORDER.indexOf(id) : TRADE_ORDER.length);
  return [...trades.values()].sort((a, b) => order(a.id) - order(b.id));
}

const TRADES = loadTrades();

const ANSWERS = {
  fallControl: [
    ['Edge protection', 'Edge protection is installed around every open edge before work starts, and no one works outside it.'],
    ['Scissor lifts', 'Scissor lifts with guardrails are used for all work above 2 m, and platform ladders only for work below 2 m.'],
    ['Risers screened', 'Risers and shafts are screened at each level, with only the section being worked on opened and fenced.'],
    ['Penetration covers', 'Each penetration is covered with a fixed, marked cover as soon as it is formed, and the area below is barricaded.'],
    ['Travel restraint', 'Workers at the open edge use a travel restraint system to engineer designed anchors installed by a competent person, so they cannot reach the edge.'],
    ['Scaffold', 'Work is done from a scaffold with full edge protection, erected and handed over by a licensed scaffolder.'],
  ],
  controlsConsidered: [
    ['Edge protection not possible', 'Edge protection was considered but cannot be fixed at ____ because ____. An elevating work platform was considered but ____.'],
  ],
  craneCompany: [
    ['Crane company lift plan', 'Lifts are done by ____ (crane company) under its lift plan. The crane company\'s dogman slings and releases loads, and our licensed dogman receives and lands them with tag lines.'],
    ['Steel or precast', 'Lifts are done by ____ (crane company) under its lift plan. The crane company\'s dogman slings the loads, and our licensed riggers (basic rigging or higher) receive, place and secure them.'],
  ],
  craneChart: [
    ['Chart duty', 'Rated capacity from the crane chart: ____ t at ____ m radius. Heaviest gross load (load, lifting gear and rigging) is ____ t at ____ m radius.'],
  ],
  loadLimits: [
    ['Engineer\'s drawing', 'Loads are placed only in the areas marked on the structural engineer\'s drawing ____ (____ kPa), checked by ____ before loading starts.'],
    ['Landing platform rating', 'The landing platform is rated for ____ t, shown on its tag, and loads are spread to the slab load limits on drawing ____.'],
  ],
  silicaControls: [
    ['On-tool extraction', 'Drilling and cutting are done with on-tool dust extraction. Fit tested P2 respirators are worn while drilling. The written silica assessment is done before work starts and attached to this SWMS.'],
    ['Wet cutting', 'Cutting and coring are done wet with a water-fed tool. Fit tested P2 respirators are worn while cutting. The written silica assessment is done before work starts and attached to this SWMS.'],
  ],
  hotWorkPermit: [
    ['Principal contractor permit', 'The principal contractor issues a hot work permit each day. A fire extinguisher is kept at each work area, and the area is checked after hot work ends.'],
  ],
  pressureTesting: [
    ['Water test', 'Tested with water to ____ kPa, with the area barricaded and signed during the test, and pressure released through the drain valve before any fitting is touched.'],
    ['Nitrogen test', 'Oxygen-free nitrogen through a regulator with a relief valve, tested to ____ kPa (below the PS on the equipment plate), with the area barricaded and signed, and pressure released before any fitting is touched.'],
  ],
  safetyDataSheet: [
    ['Kept at the work area', 'Safety data sheets for ____ are kept at the work area. Use with ventilation, keep away from ignition sources, and wear gloves and eye protection.'],
  ],
  systemInstructions: [
    ['Supplier instructions', 'The ____ system is erected to the supplier\'s instructions (document ____, revision ____) by a crew trained by ____.'],
  ],
  isolationProcedure: [
    ['Lock out and test', 'Circuits are isolated, locked with personal locks and danger tagged, and tested de-energised by a licensed electrician before work. Each worker holds their own lock.'],
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
    ['Designer\'s sequence', 'Steel is erected to the designer\'s sequence on drawing ____ (revision ____), with temporary bracing as shown, and ____ checks the structure is stable before connections are released.'],
  ],
  serviceShutdown: [
    ['Hospital shutdown permit', 'Each connection is done under the hospital\'s shutdown permit ____, approved by ____ (hospital engineering), in the agreed window of ____. The ward and clinical staff are told beforehand, and ____ (backup supply, such as cylinders or a temporary feed) keeps patients supplied.'],
  ],
  tierErection: [
    ['Engineer\'s erection design', 'Units are placed to the engineer\'s erection design ____ (revision ____): bearing pads and fixings as detailed, placed in the sequence shown, with temporary propping where the design shows it, checked by ____ before the hook is released.'],
  ],
  excavationPlan: [
    ['Geotechnical design', 'Excavation follows the geotechnical design ____ (revision ____) in stages to the levels shown, with batters no steeper than ____, and plant and trucks follow the site traffic management plan ____.'],
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

// Standard answers for a required fact, as { label, text }.
function answersFor(id) {
  return (ANSWERS[id] || []).map(([label, text]) => ({ label, text }));
}

module.exports = { TRADES, answersFor };
