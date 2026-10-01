// Pick lists that cut typing: common tasks for each trade, and standard answers
// for the questions asked most often. Every task comes from a project set that is
// stress tested in every state (scenarios/projects), so its wording is known to
// draft correctly. Answers are starting points the user edits; ____ marks a blank.

const fs = require('fs');
const path = require('path');

const PROJECTS = path.join(__dirname, 'scenarios', 'projects');
const TRADE_ORDER = ['piling', 'structure', 'electrical', 'plumbing', 'mechanical', 'ICT and security', 'facade'];
const TRADE_NAMES = { piling: 'Piling', structure: 'Structure (formwork, reo, concrete, precast)', electrical: 'Electrical', plumbing: 'Plumbing', mechanical: 'Mechanical (HVAC)', 'ICT and security': 'ICT and security', facade: 'Facade' };

function loadTrades() {
  return fs.readdirSync(PROJECTS)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(PROJECTS, name), 'utf8')))
    .map((project) => {
      const trade = project.title.split(': ').pop();
      return {
        id: trade,
        name: TRADE_NAMES[trade] || trade,
        tasks: project.swms.map((swms) => ({
          title: swms.title,
          task: swms.task,
          fallRisk: swms.fallRisk,
          crane: swms.crane === 'own' ? 'own' : 'company',
        })),
      };
    })
    .sort((a, b) => TRADE_ORDER.indexOf(a.id) - TRADE_ORDER.indexOf(b.id));
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
