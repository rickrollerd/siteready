// The trades SiteReady knows, and the kinds of work (activities.js) each one does.
// A scope is for one or two trades; its tasks are that trade's kinds, plus work any
// trade can strike when the scope names it.
// When a task's trade is known, its job steps come only from that trade's kinds,
// its extra kinds, and the kinds any trade can strike (COMMON). A task that names
// other trades' work ("paint all doors", "framing over blockwork", "touch up
// paintwork") then does not get their steps.
// `signal` is a flag (or a pattern) that shows the trade even where no kind of work matches.
const TRADES = [
  { id: 'electrical', name: 'Electrical work', signal: 'electricalWork', kinds: ['tempPower', 'castIn', 'containment', 'cablePull', 'fitOff', 'isolation', 'commissioning', 'generatorPlant', 'generatorTest', 'solarPV', 'batteryStorage', 'meterBox'], extra: ['trench', 'ictCabling', 'shallowTrench', 'servicesStrip', 'securityDevices', 'hddBore', 'fitOff', 'testTag', 'signageInstall', 'lightningProtection', 'pumpInstall'] },
  { id: 'communications', name: 'Communications cabling and equipment', signal: 'ictWork', kinds: ['ictCabling', 'fibre', 'commsRoom'], extra: ['trench', 'containment', 'securityDevices', 'servicesStrip', 'hddBore'] },
  { id: 'security', name: 'Security system installation', signal: 'securityWork', kinds: ['securityDevices'], extra: ['containment', 'ictCabling', 'servicesStrip'] },
  { id: 'plumbing', name: 'Plumbing and drainage work', signal: 'plumbingWork', kinds: ['sewerConnection', 'waterConnection', 'castInPlumbing', 'hydraulicRisers', 'hotWork', 'solventCement', 'plumbingFitOff', 'pressureTest', 'hotWater', 'boilerPlant', 'gasFitting', 'rainwaterTank', 'waterHeater'], extra: ['kitchenEquipment', 'trench', 'gutters', 'shallowTrench', 'servicesStrip', 'hddBore', 'pipeRelining', 'plumbingFitOff', 'flueInstall', 'drainClear', 'fuelSystems', 'pumpInstall', 'confined'] },
  { id: 'mechanical', name: 'Mechanical services installation', signal: 'mechanicalWork', kinds: ['plantLift', 'ductwork', 'refrigerantPipework', 'refrigerantTest', 'refrigerantCharge', 'roofPlant', 'jetFans', 'mechInsulation', 'mechCommissioning', 'serviceLabels'], extra: ['refrigerantWork', 'isolation', 'servicesStrip', 'flueInstall'] },
  { id: 'fire', name: 'Fire services installation', signal: 'fireWork', kinds: ['waterConnection', 'fireAtHeight', 'fireGrooving', 'fireLive', 'passiveFire'], extra: ['trench', 'servicesStrip'] },
  { id: 'lifts', name: 'Lift installation', signal: 'liftWork', kinds: ['liftShaft', 'liftLifting', 'liftCar'], extra: [, 'fixtures', 'liftShaft', 'liftInstall'] },
  { id: 'facade', name: 'Facade installation', signal: 'facadeWork', kinds: ['panelLoad', 'facadeCrane', 'panelInstall', 'swingStage', 'edgeBracket', 'facadeSeal'], extra: ['glassHandling', 'glassWind', 'claddingInstall'] },
  { id: 'glazing', name: 'Windows, doors and glazing installation', signal: 'glazingWork', kinds: ['balustradeEdge', 'glassHandle', 'windowInstall', 'hardwareFit', 'glazingDrill', 'glazingSeal'], extra: ['panelInstall', 'glassHandling', 'glassWind'] },
  { id: 'steel', name: 'Structural steel erection and rigging', signal: 'steelWork', kinds: ['steelLift', 'steelErect', 'steelWeld', 'temporaryTowers', 'dualLift'], extra: ['steelLift', 'kitStructure', 'accessSteel', 'hotWork', 'oxyCutting'] },
  { id: 'masonry', name: 'Blockwork and brickwork', signal: 'masonryWork', kinds: ['masonryCut', 'masonryLay', 'masonryEdge'], extra: ['tileMix', 'masonryMortar', 'masonryGrout', 'paving', 'retainingWall', 'repointing', 'fixtures', 'concreteRepair', 'rendering', 'painting', 'paintExternal', 'claddingInstall'] },
  { id: 'plasterboard', name: 'Wall and ceiling linings', signal: 'plasterWork', kinds: ['plasterSheets', 'plasterHeight', 'plasterCeiling', 'plasterSanding', 'carpFraming', 'ceilingGrid'], extra: ['carpLoad', 'carpEdge', 'carpentryWork'] },
  { id: 'carpentry', name: 'Carpentry and joinery', signal: /\b(carpent\w*|joinery|cabinetry|timber (?:fram\w*|floor\w*|decks?)|wall frames?|roof trusses|trusses|hang(?:ing)? doors?)\b/i, kinds: ['carpFraming', 'carpJoinery', 'carpEdge', 'timberFloor', 'houseFraming', 'deckBuild', 'roofBattens', 'kitStructure'], extra: ['carpLoad', 'roof', 'roofStrip', 'plasterSheets', 'painting', 'paintExternal', 'stoneHandle', 'carpentryWork', 'gutters', 'retainingWall', 'claddingInstall', 'fixtures', 'shallowTrench', 'garageDoor', 'gasFitting', 'restump', 'claddingInstall'] },
  { id: 'doors', name: 'Doors, frames and hardware', signal: /\b(door ?frames?|door hardware|doorsets?|hinges|door closers|locksets?|(?:hang|install|fix)\w* (?:the |all )?(?:\w+ ){0,3}doors)\b/i, kinds: ['doorHang', 'hardwareFit'], extra: ['carpLoad', 'carpentryWork', 'windowInstall', 'autoDoors', 'garageDoor', 'fixtures'] },
  { id: 'kitchens', name: 'Commercial kitchen and stainless steel installation', signal: /\b(commercial kitchens?|kitchen equipment|kitchen items|exhaust hoods?|cool ?rooms?|freezer rooms?|dishwash\w*|combi ovens?|stainless steel (?:benches|benching|sinks?|shelving|joinery))\b/i, kinds: ['kitchenEquipment'], extra: ['carpJoinery', 'gasFitting', 'plantLift', 'carpJoinery', 'stoneHandle', 'stoneSilica', 'carpLoad', 'plumbingFitOff', 'gasFitting'] },
  { id: 'tiling', name: 'Floor and wall tiling', signal: 'tilingWork', kinds: ['tileCut', 'tileLay', 'tileEdge'], extra: ['tileMix', 'wpLiquid'] },
  { id: 'stone', name: 'Stone benchtops', signal: 'stoneWork', kinds: ['stoneSilica', 'stoneHandle'], extra: [] },
  { id: 'flooring', name: 'Floor coverings', signal: 'floorWork', kinds: ['floorGrind', 'floorAdhesive', 'floorLevel', 'timberFloor', 'floorLay', 'floorCoating'], extra: ['tileCut', 'tileLay', 'jointSealing', 'fixtures', 'floorSanding', 'accessFloor'] },
  { id: 'waterproofing', name: 'Waterproofing', signal: 'waterproofing', kinds: ['wpPrep', 'wpLiquid', 'wpTorch', 'wpEdge'], extra: ['wpRolls', 'glazingSeal', 'belowGroundWp', 'concreteRepair'] },
  { id: 'painting', name: 'Painting', signal: 'painting', kinds: ['painting', 'paintAccess', 'paintSpray', 'paintSolvent', 'paintSwing', 'paintExternal', 'lineMarking'], extra: ['pressureClean', 'floorCoating', 'rendering', 'abrasiveBlast'] },
  { id: 'roofing', name: 'Roofing', kinds: ['roof', 'roofStrip', 'gutters', 'skylight', 'tiledRoof', 'safetyMesh'], extra: ['roofBattens', 'anchorInstall', 'accessSteel', 'roofFittings'] },
  { id: 'landscaping', name: 'Landscaping', signal: 'landscape', kinds: ['landscape', 'landscapeLift', 'turf', 'paving', 'retainingWall', 'shallowTrench', 'playground'], extra: ['trench', 'earthworks', 'kitStructure', 'pressureClean'] },
  { id: 'piling', name: 'Piling', signal: 'pilingWork', kinds: ['pilingPlatform', 'pilingRig', 'pileCage', 'cfaCage', 'openBore', 'pileConcrete', 'pileTrim'], extra: ['sitePlant'] },
  { id: 'structure', name: 'Formwork, reinforcement and concrete', kinds: ['formwork', 'jumpform', 'reo', 'ptTendons', 'concrete', 'slabGround', 'slabPour', 'stressing', 'precast', 'loadOut', 'propping', 'precastTier'], extra: ['ptSlab', 'bollards', 'concreteRepair', 'fixtures'] },
  { id: 'excavation', name: 'Excavation', kinds: ['bulkDig', 'anchorsProps', 'detailDig', 'dewatering', 'contaminatedSpoil', 'basementEdge', 'retentionWall', 'earthworks'], extra: ['trench', 'neighbours', 'sitePlant', 'retainingWall', 'shallowTrench', 'bollards', 'hddBore', 'structureDemolition', 'lineMarking', 'asphaltLay', 'rockBreak', 'fuelTankRemoval', 'confined'] },
  { id: 'scaffolding', name: 'Scaffolding', kinds: ['scaffold', 'hoistInstall', 'hoistOperate', 'safetyNet'], extra: [, 'edgeProtectionInstall'] },
  { id: 'cleaning', name: 'Cleaning', kinds: ['cleaning', 'cleaningHeight', 'cleaningStands', 'pressureClean'], extra: [] },
  { id: 'site', name: 'Site establishment', kinds: ['siteEstablish', 'siteSheds', 'road'], extra: ['sitePlant', 'structureDemolition'] },
  { id: 'fencing', name: 'Fencing and gates', kinds: ['fenceBuild'], extra: [] },
];

// Work any trade can strike, kept whatever the trade: cranes, plant and access
// equipment, traffic, power lines, cutting and coring, asbestos, confined spaces.
const COMMON = new Set([
  'craneInterface', 'crane', 'towerCrane', 'ewp', 'mobileScaffold', 'forklift', 'scaffold', 'road', 'power', 'coreDrill', 'sawCut',
  'asbestos', 'asbestosCheck', 'confined', 'roofSpace', 'water', 'demolition', 'structuralOpening', 'liveHospital', 'loadOut',
  'sitePlant', 'stripOut', 'cite', 'roofAccess', 'oxyCutting', 'silicaDrill', 'smallPlant', 'treeRemoval', 'groundChemicals', 'liftCarWork', 'asphalt', 'insulation', 'slabGround', 'slabPour',
  'propping', 'signageInstall', 'fixtures', 'roadBarrier', 'sprayRoad', 'fireAlarm', 'leadPaint', 'handrailReplace', 'jointSealing', 'balustradeEdge', 'siteSheds', 'splitInstall', 'gateInstall', 'poolEquipment', 'escalatorInstall', 'tieDowns', 'palletRacking', 'antennaInstall', 'vehicleHoist', 'beamInstall', 'underslabDrainage', 'trafficSignals', 'footingHoles', 'tileRoofStrip', 'treeOnRoof', 'flyScreens', 'mezzanineFloor', 'hydroBlast', 'sprayFoam', 'precastStair', 'ceilingPipework', 'deckingStuds', 'shadeSail', 'boxGutter', 'membraneRepair', 'meterInstall', 'tankPlace', 'jettyRepair', 'floodClean', 'wallpaperStrip', 'underfloorHeating', 'wallDrainage', 'footpathClosure', 'bmuClean', 'officeStrip', 'coolroomPanels', 'roofPenetration', 'workAbove',
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
