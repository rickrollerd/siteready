// The trades SiteReady knows, and the kinds of work (activities.js) each one does.
// A scope is for one or two trades; its tasks are that trade's kinds, plus work any
// trade can strike when the scope names it.
// When a task's trade is known, its job steps come only from that trade's kinds,
// its extra kinds, and the kinds any trade can strike (COMMON). A task that names
// other trades' work ("paint all doors", "framing over blockwork", "touch up
// paintwork") then does not get their steps.
// `signal` is a flag (or a pattern) that shows the trade even where no kind of work matches.
const TRADES = [
  { id: 'electrical', name: 'Electrical work', signal: 'electricalWork', kinds: ['tempPower', 'castIn', 'containment', 'cablePull', 'fitOff', 'isolation', 'commissioning', 'generatorPlant'], extra: ['trench'] },
  { id: 'communications', name: 'Communications cabling and equipment', signal: 'ictWork', kinds: ['ictCabling', 'fibre', 'commsRoom'], extra: ['trench', 'containment'] },
  { id: 'security', name: 'Security system installation', signal: 'securityWork', kinds: ['securityDevices'], extra: ['containment'] },
  { id: 'plumbing', name: 'Plumbing and drainage work', signal: 'plumbingWork', kinds: ['sewerConnection', 'waterConnection', 'castInPlumbing', 'hydraulicRisers', 'hotWork', 'solventCement', 'plumbingFitOff', 'pressureTest', 'hotWater', 'boilerPlant'], extra: ['trench'] },
  { id: 'mechanical', name: 'Mechanical services installation', signal: 'mechanicalWork', kinds: ['plantLift', 'ductwork', 'refrigerantPipework', 'refrigerantTest', 'refrigerantCharge', 'roofPlant', 'jetFans', 'mechInsulation', 'mechCommissioning'], extra: ['refrigerantWork', 'isolation'] },
  { id: 'fire', name: 'Fire services installation', signal: 'fireWork', kinds: ['fireAtHeight', 'fireGrooving', 'fireLive', 'passiveFire'], extra: ['trench'] },
  { id: 'lifts', name: 'Lift installation', signal: 'liftWork', kinds: ['liftShaft', 'liftLifting', 'liftCar'], extra: [] },
  { id: 'facade', name: 'Facade installation', signal: 'facadeWork', kinds: ['panelLoad', 'facadeCrane', 'panelInstall', 'swingStage', 'edgeBracket', 'facadeSeal'], extra: ['glassHandling', 'glassWind'] },
  { id: 'glazing', name: 'Windows, doors and glazing installation', signal: 'glazingWork', kinds: ['balustradeEdge', 'glassHandle', 'glazingDrill', 'glazingSeal'], extra: ['glassHandling', 'glassWind'] },
  { id: 'steel', name: 'Structural steel erection and rigging', signal: 'steelWork', kinds: ['steelLift', 'steelErect', 'steelWeld', 'temporaryTowers', 'dualLift'], extra: ['steelLift'] },
  { id: 'masonry', name: 'Blockwork and brickwork', signal: 'masonryWork', kinds: ['masonryCut', 'masonryLay', 'masonryEdge'], extra: ['tileMix'] },
  { id: 'plasterboard', name: 'Wall and ceiling linings', signal: 'plasterWork', kinds: ['plasterSheets', 'plasterHeight', 'plasterCeiling', 'plasterSanding', 'carpFraming'], extra: ['carpLoad', 'carpEdge', 'carpentryWork'] },
  { id: 'carpentry', name: 'Carpentry and joinery', signal: /\b(carpent\w*|joinery|cabinetry|timber (?:fram\w*|floor\w*|decks?)|wall frames?|roof trusses|trusses|hang(?:ing)? doors?)\b/i, kinds: ['carpFraming', 'carpJoinery', 'carpEdge', 'timberFloor', 'houseFraming', 'deckBuild'], extra: ['carpLoad', 'stoneHandle', 'carpentryWork'] },
  { id: 'doors', name: 'Doors, frames and hardware', signal: /\b(door ?frames?|door hardware|doorsets?|hinges|door closers|locksets?|(?:hang|install|fix)\w* (?:the |all )?(?:\w+ ){0,3}doors)\b/i, kinds: ['doorHang'], extra: ['carpLoad', 'carpentryWork'] },
  { id: 'kitchens', name: 'Commercial kitchen and stainless steel installation', signal: /\b(commercial kitchens?|kitchen equipment|kitchen items|exhaust hoods?|cool ?rooms?|freezer rooms?|dishwash\w*|combi ovens?|stainless steel (?:benches|benching|sinks?|shelving|joinery))\b/i, kinds: [], extra: ['plantLift'] },
  { id: 'tiling', name: 'Floor and wall tiling', signal: 'tilingWork', kinds: ['tileCut', 'tileLay', 'tileEdge'], extra: ['tileMix'] },
  { id: 'stone', name: 'Stone benchtops', signal: 'stoneWork', kinds: ['stoneSilica', 'stoneHandle'], extra: [] },
  { id: 'flooring', name: 'Floor coverings', signal: 'floorWork', kinds: ['floorGrind', 'floorAdhesive', 'floorLevel', 'timberFloor', 'floorLay'], extra: [] },
  { id: 'waterproofing', name: 'Waterproofing', signal: 'waterproofing', kinds: ['wpPrep', 'wpLiquid', 'wpTorch', 'wpEdge'], extra: ['wpRolls'] },
  { id: 'painting', name: 'Painting', signal: 'painting', kinds: ['painting', 'paintAccess', 'paintSpray', 'paintSolvent', 'paintSwing', 'paintExternal'], extra: [] },
  { id: 'roofing', name: 'Roofing', kinds: ['roof', 'roofStrip'], extra: [] },
  { id: 'landscaping', name: 'Landscaping', signal: 'landscape', kinds: ['landscape', 'landscapeLift', 'turf', 'paving'], extra: ['trench', 'earthworks'] },
  { id: 'piling', name: 'Piling', signal: 'pilingWork', kinds: ['pilingPlatform', 'pilingRig', 'pileCage', 'cfaCage', 'openBore', 'pileConcrete', 'pileTrim'], extra: ['sitePlant'] },
  { id: 'structure', name: 'Formwork, reinforcement and concrete', kinds: ['formwork', 'jumpform', 'reo', 'ptTendons', 'concrete', 'slabGround', 'stressing', 'precast', 'loadOut', 'propping', 'precastTier'], extra: ['ptSlab'] },
  { id: 'excavation', name: 'Excavation', kinds: ['bulkDig', 'anchorsProps', 'detailDig', 'dewatering', 'contaminatedSpoil', 'basementEdge', 'retentionWall', 'earthworks'], extra: ['trench', 'neighbours', 'sitePlant'] },
  { id: 'scaffolding', name: 'Scaffolding', kinds: ['scaffold', 'hoistInstall', 'hoistOperate', 'safetyNet'], extra: [] },
  { id: 'cleaning', name: 'Cleaning', kinds: ['cleaning', 'cleaningHeight', 'cleaningStands'], extra: [] },
  { id: 'site', name: 'Site establishment', kinds: ['siteEstablish', 'road'], extra: ['sitePlant'] },
  { id: 'fencing', name: 'Fencing and gates', kinds: ['fenceBuild'], extra: [] },
];

// Work any trade can strike, kept whatever the trade: cranes, plant and access
// equipment, traffic, power lines, cutting and coring, asbestos, confined spaces.
const COMMON = new Set([
  'craneInterface', 'crane', 'towerCrane', 'ewp', 'mobileScaffold', 'forklift', 'scaffold', 'road', 'power', 'coreDrill', 'sawCut',
  'asbestos', 'asbestosCheck', 'confined', 'roofSpace', 'water', 'demolition', 'structuralOpening', 'liveHospital', 'loadOut',
  'sitePlant', 'stripOut', 'cite', 'roofAccess', 'oxyCutting', 'silicaDrill', 'smallPlant', 'treeRemoval', 'groundChemicals', 'liftCarWork', 'asphalt', 'insulation', 'slabGround',
]);

const BY_ID = new Map(TRADES.map((trade) => [trade.id, trade]));

// The known trade ids in a list such as "painting" or "electrical, communications".
function tradeIds(value) {
  return String(value || '').split(/[\s,]+/).filter((id) => BY_ID.has(id));
}

// The kinds of work the trades can do, or null when no trade is known.
function allowedKinds(trades) {
  const ids = tradeIds(Array.isArray(trades) ? trades.join(',') : trades);
  if (!ids.length) return null;
  return new Set([...COMMON, ...ids.flatMap((id) => [...BY_ID.get(id).kinds, ...(BY_ID.get(id).extra || [])])]);
}

// Turns off the kinds of work outside the task's trades. `kinds` is every kind with job steps.
function limitToTrades(flags, trades, kinds) {
  const ids = tradeIds(Array.isArray(trades) ? trades.join(',') : trades);
  if (!ids.length) return flags;
  const allowed = new Set([...COMMON, ...ids.flatMap((id) => [...BY_ID.get(id).kinds, ...(BY_ID.get(id).extra || [])])]);
  const out = { ...flags };
  for (const kind of kinds) if (out[kind] && !allowed.has(kind)) out[kind] = false;
  // Other trades' general flags add their licensing lines to Before starting
  // ("Electrical work is done only by licensed electrical workers"), so they go too.
  for (const trade of TRADES) {
    if (!ids.includes(trade.id) && typeof trade.signal === 'string' && !allowed.has(trade.signal)) out[trade.signal] = false;
  }
  return out;
}

module.exports = { TRADES, COMMON, tradeIds, allowedKinds, limitToTrades };
