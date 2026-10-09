// How subbies type each catalogue task into the Task box on a phone, and the job step groups
// (kinds) each wording should tick. Written for the owner to read and change.
//
// Each catalogue task: task(trade, catalogue label, kinds it must tick, kinds it must not tick, type, wordings).
//   Kinds it must tick: space separated, all needed; "a|b" means either a or b will do. This is the
//     task's main step, the one a user test counts (test kit answer key).
//   Type '': a task the library has job steps for.
//   Type 'gap': the library has no job steps for the main work. Nothing is forced onto it; it passes
//     as long as it ticks none of the kinds it must not tick. Listed for the owner.
//   Type 'general': not one task (a tool, PPE, a whole trade). Passes if it ticks none it must not.
//   Wordings, at least four, in this order: short; trade jargon; with a place or plant; a common
//     misspelling or shorthand. A wording written [text, must tick, must not tick, type] has its own
//     kinds; more than four wordings are extras.
//
// CARDS: the 25 task cards of the user test kit (scratchpad/user-test-kit/SCRIPT-FIND.md), each with
// the card text, the plain wording in the answer key and other plain wordings; must tick is the
// answer key's main step.

const VARIANTS = [];
const task = (trade, label, want, not, type, wordings) => {
  for (const [index, item] of wordings.entries()) {
    const [typed, ownWant, ownNot, ownType] = Array.isArray(item) ? item : [item];
    VARIANTS.push({ trade, label, typed, want: ownWant !== undefined ? ownWant : want, not: ownNot !== undefined ? ownNot : not, type: ownType || type, style: ['short', 'jargon', 'place', 'spelling'][index] || 'extra' });
  }
};

// Asbestos removal
task('asbestos-removal', 'Non-friable asbestos removal (Class B)', 'asbestos', '', '', ['asbestos removal', 'remove AC sheeting, class B', 'remove fibro eaves linings at the school', 'absestos removal']);
task('asbestos-removal', 'Friable asbestos removal (Class A) in an enclosure', 'asbestos', '', '', ['friable asbestos removal', 'class A removal in an enclosure with negative air', 'remove friable lagging in the plant room', 'friable asbestos remval']);
task('asbestos-removal', 'Asbestos in soil, pits and ducts', 'asbestos', '', '', ['asbestos pits', 'remove AC pits and asbestos ducts', 'asbestos contaminated soil removal at the depot', 'asbestos in soil and pit\'s']);
task('asbestos-removal', 'Hazardous materials survey and sampling', '', 'asbestos', 'gap', ['hazmat survey', 'hazmat audit and asbestos sampling before demo', 'hazardous materials survey of the old school', 'haz mat survey']);
task('asbestos-removal', 'Lead paint, SMF and PCB removal', 'leadPaint', '', '', ['lead paint removal', 'strip lead based paint', 'remove lead paint from the steel bridge', 'lead paint removel']);

// Bridges
task('bridges', 'Bridge substructure: footings, pile caps, abutments and wingwalls', 'formwork|concreteWall', '', '', ['bridge abutments', 'form and pour abutments and wingwalls', 'pile caps and abutments for the creek bridge', 'bridge abutmants']);
task('bridges', 'Piers, columns and headstocks', 'formwork|concreteWall', '', '', ['bridge piers', 'headstock formwork', 'form up the piers and headstocks over the creek', 'pier and head stock pours']);
task('bridges', 'Girder erection: precast concrete or steel girders', 'precast|steelErect', '', '', ['girder erection', 'land the super T girders', 'lift bridge girders with two cranes', 'girdar erection']);
task('bridges', 'Bridge deck: deck units or formwork, reo and pour', 'formwork|reo|concrete|precastFloor', '', '', ['bridge deck', 'deck units and stitch pour', 'pour the bridge deck over the highway', 'brige deck pour']);
task('bridges', 'Bridge bearings: install and replace', 'bridgeBearings', '', '', ['bridge bearings', 'jack the deck and change the bearings', 'replace bearings on the rail overpass', 'bridge bearrings']);
task('bridges', 'Bridge barriers, parapets and expansion joints', 'roadBarrier|bridgeBearings', '', '', ['bridge barriers', 'parapets and expansion joints', 'install bridge parapets beside live traffic', 'bridge parapit']);
task('bridges', 'Post-tensioning of bridge elements', 'stressing', '', '', ['stressing bridge girders', 'PT the bridge deck', 'stress and grout the tendons on the bridge', 'post tentioning the bridge']);
task('bridges', 'Bridge work over or next to water', 'water', '', '', ['bridge work over water', 'work off the barge at the bridge', 'working over the river on the bridge', 'brige works over the creek']);
task('bridges', 'Temporary bridges, falsework towers and working platforms', 'tempBridge|formwork', '', '', ['temporary bridge', 'falsework towers', 'temporary works platform beside the bridge', 'temp bridge install']);
task('bridges', 'Bridge maintenance and repair over traffic or rail', 'workAbove|concreteRepair', '', '', ['bridge maintenance', 'concrete repairs under the bridge over traffic', 'bridge repairs over the railway', 'brige maintainance']);

// Carpentry and joinery fit-out
task('carpentry-joinery', 'Door frames, doors and hardware', 'doorHang', '', '', ['hang doors', 'door frames and hardware', 'install doors on levels 2 to 5', 'instal door frames']);
task('carpentry-joinery', 'Joinery and cabinetry installation', 'carpJoinery', '', '', ['joinery install', 'install kitchens and vanities', 'install joinery in the classrooms', 'joinary installation']);
task('carpentry-joinery', 'Fix-out: skirtings, architraves, timber linings and wall panelling', 'carpJoinery', '', '', ['fix out', 'skirting and architraves', 'fix out carpentry in the units', 'skirtings and architraves instal']);
task('carpentry-joinery', 'Toilet partitions, lockers, operable walls and bathroom accessories', 'fixtures', 'plumbingFitOff', '', ['toilet partitions', 'install lockers and bathroom accessories', 'operable walls in the function room', 'toilet partitons']);
task('carpentry-joinery', 'Timber wall, floor and roof framing', 'carpFraming|houseFraming', '', '', ['timber framing', 'frame up walls and stand trusses', 'timber wall framing on the townhouses', 'timber fraiming']);
task('carpentry-joinery', 'Timber stairs, handrails, screens and decking at open edges', 'carpEdge', '', '', ['timber stairs and handrails', ['build decking at the balcony edge', 'carpEdge|deckBuild'], 'timber screens on the open deck edge', 'timber stairs and handrails instal']);

// Civil earthworks
task('civil-earthworks', 'Site clearing, grubbing and topsoil stripping', 'vegClearing', '', '', ['site clearing', 'clear and grub', 'clear the site with dozers and excavators', 'clearing and grubing']);
task('civil-earthworks', 'Bulk earthworks: cut, fill and compaction', 'earthworks', '', '', ['bulk earthworks', 'cut and fill', 'cut to fill with scrapers and rollers', 'bulk earth works']);
task('civil-earthworks', 'Detailed excavation for footings, pits and pile caps', 'detailDig', '', '', ['detailed excavation', 'dig footings and pile caps', 'excavate footings with a 5 tonne excavator', 'detail excavaton']);
task('civil-earthworks', 'Trenching for services, including trenches deeper than 1.5 m', 'trench', '', '', ['trenching', 'dig trench for services with a trench shield', 'trench along the access road 2.5 m deep', 'trenching for servises']);
task('civil-earthworks', 'Locating and exposing services by potholing or vacuum excavation', 'vacExcavation', '', '', ['potholing', 'non destructive digging with a vac truck', 'pothole the services in the footpath', 'NDD potholing']);
task('civil-earthworks', 'Rock breaking and ripping', 'rockBreak', '', '', ['rock breaking', 'hammer and rip rock', 'rock breaking with the excavator hammer', 'rock braking']);
task('civil-earthworks', 'Spoil haulage, stockpiles and tipping', 'spoilManage', '', '', ['spoil haulage', 'cart away spoil', 'stockpile and truck spoil off site', 'spoil removel']);
task('civil-earthworks', 'Ground improvement: soft spot replacement, impact rolling and lime or cement treatment', 'impactRoller|earthworks|roadPlant', 'groundImprove', '', ['soft spot replacement', 'impact rolling the fill', 'lime treat the subgrade with a stabiliser', 'soft spot replacment']);
task('civil-earthworks', 'Erosion and sediment controls', '', 'earthworks', 'gap', ['erosion and sediment control', 'silt fences', 'install silt fence and sediment basin', 'ESC install']);
task('civil-earthworks', 'Floating, loading and unloading plant', 'heavyHaulage', '', '', ['floating plant', 'float the excavator to site', 'load and unload plant off the low loader', 'low loader']);
task('civil-earthworks', 'Earthworks in or next to waterways and creek crossings', 'water', '', '', ['creek crossing', 'earthworks in the creek', 'build a creek crossing with an excavator', 'earthworks next to the waterway']);

// Cleaning
task('cleaning', "Builders' clean and final clean", 'cleaning', '', '', ['final clean', 'builders clean', 'builders clean of levels 1 to 4', 'builders clen']);
task('cleaning', 'Window and facade cleaning', 'cleaningHeight', '', '', ['window cleaning', ['facade clean from the BMU', 'cleaningHeight|bmuClean'], 'clean the windows from a boom lift', 'window cleanning']);
task('cleaning', 'Pressure cleaning and water blasting', 'pressureClean|hydroBlast', '', '', ['pressure cleaning', 'gerni the paths', 'high pressure wash the car park', 'presure washing']);
task('cleaning', 'Acid washing and chemical removal of mortar and render', 'cleaning', 'rendering', '', ['acid wash brickwork', 'acid wash the bricks', 'acid clean the brick walls from the scaffold', 'acid washing bricks']);
task('cleaning', 'Site clean-ups and waste removal during construction', 'wasteRemoval', '', '', ['site clean up', 'rubbish removal', 'clean up and empty skips on site', 'site clean ups']);

// Concreting
task('concreting', 'Placing and finishing concrete on suspended slabs, columns and walls', 'concrete', '', '', ['pour suspended slab', 'pour and finish the level 3 deck', 'pour the slab with a boom pump', 'conc pour suspended slab']);
task('concreting', 'Placing and finishing slabs on ground, footings and paths', 'slabGround', '', '', ['slab on ground', 'pour footings and paths', 'pour the slab on ground with a line pump', 'SOG pour']);
task('concreting', 'Concrete pumping: boom pumps, line pumps and placing booms', 'concrete', '', '', ['concrete pumping', 'boom pump', 'line pump and placing boom on level 5', 'concrete pumpping']);
task('concreting', 'Concrete delivery by agitator truck', '', '', 'gap', ['concrete trucks', 'agitator delivery', 'concrete agi trucks onto site', 'agi truck delivery']);
task('concreting', 'Patching, grinding and making good concrete', 'concreteRepair', '', '', ['concrete patching', 'make good and grind concrete', 'patch concrete columns in the car park', 'concrete patchng']);
task('concreting', 'On-site concrete batch plant', 'processPlant', '', '', ['batch plant', 'on site batching plant', 'run the concrete batch plant at the site compound', 'batching plant']);

// Cranes and rigging
task('cranes-rigging', 'Mobile and crawler crane lifting', 'craneInterface|crane', '', '', ['mobile crane', 'crane lifts', 'mobile crane lifts on site', 'franna lifts']);
task('cranes-rigging', 'Tower crane erection, climbing and dismantling', 'towerCraneErect', '', '', ['tower crane erection', 'climb the TC', 'erect the tower crane with a mobile crane', 'tower crain erection']);
task('cranes-rigging', 'Tower crane operation and dogging', 'craneInterface|towerCrane', '', '', ['tower crane operation', 'dogging for the TC', 'tower crane lifts on the core', 'tower crain driving']);
task('cranes-rigging', 'Crawler crane assembly and dismantling', 'craneAssembly', '', '', ['crawler crane assembly', 'rig up the crawler', 'assemble the 250t crawler crane on the pad', 'crawler crain assembly']);
task('cranes-rigging', 'Dual and heavy lifts under an engineered lift plan', 'dualLift', '', '', ['dual lift', 'tandem lift', 'tandem lift with two mobile cranes', 'duel lift']);
task('cranes-rigging', 'Vehicle loading cranes and crane trucks', 'loaderCrane', '', '', ['crane truck', 'HIAB', 'unload with the HIAB on the street', 'hiab lifts']);
task('cranes-rigging', 'Rigging: loading platforms, chain blocks and moving plant on skates', 'loadOut|plantLift', '', '', ['install loading platforms', 'move plant on skates', 'chain block the pumps into the plant room', 'loading platform instal']);
task('cranes-rigging', 'Lifting people in a crane workbox', 'craneInterface|crane', '', '', ['crane workbox', 'man box', 'lift people in a crane work box', 'crane man cage']);

// Demolition and strip-out
task('demolition-stripout', 'Internal strip-out (soft strip)', 'stripOut|officeStrip', '', '', ['strip out', 'soft strip', 'strip out ceilings and partitions on two floors', 'stripout']);
task('demolition-stripout', 'Building demolition: roof removal, machine demolition and load-out', 'demolition|structureDemolition', '', '', ['demolition', 'demo the building', 'knock down the old building with excavators', 'demolision']);
task('demolition-stripout', 'Partial demolition and structural alterations in existing buildings', 'demolition|wallRemoval|structuralOpening', '', '', ['partial demolition', 'cut new openings in slabs and walls', 'remove walls in an existing building', 'partial demo']);

// Electrical
task('electrical', 'Construction power and temporary lighting', 'tempPower', '', '', ['temp power', 'construction power', 'install temporary power and lighting on site', 'temp power and lighting']);
task('electrical', 'Temporary generators: place, connect, run and refuel', 'generatorConnect', '', '', ['temp generator', 'connect a generator', 'set up a generator for site power', 'genny hookup']);
task('electrical', 'Cast-in conduits and boxes in slabs before the pour', 'castIn', '', '', ['cast in conduits', 'lay conduits in the deck before the pour', 'conduits and boxes in the reo on level 3', 'cast in condiuts']);
task('electrical', 'In-ground conduits, pits and cabling', 'trench', '', '', ['in ground conduits', 'lay conduit and pits', 'underground conduits along the road', 'inground conduit']);
task('electrical', 'Cable tray, ladder and supports at height', 'containment', '', '', ['cable tray', 'tray and ladder', 'cable tray in the ceiling from scissor lifts', 'cable trey']);
task('electrical', 'Rough-in: conduit and cabling in walls, ceilings and risers', 'fitOff', '', '', ['elec rough in', 'sparky rough in', 'rough in conduits in walls and ceilings', 'electrical roughin']);
task('electrical', 'Cable pulling: consumer mains and submains', 'cablePull', '', '', ['cable pulling', 'pull submains', 'pull consumer mains through the pits', 'sub mains cable pull']);
task('electrical', 'Fit off: power, lighting and emergency lighting', 'fitOff', '', '', ['electrical fit off', 'fit off GPOs and lights', 'fit off lights from ladders', 'elec fitoff']);
task('electrical', 'Switchboards and distribution boards: deliver, install and terminate', 'commissioning|subBoardInstall', '', '', ['switchboard install', 'MSB install', 'install main switchboard in the switch room', 'switchbord install']);
task('electrical', 'Isolation, and work in existing live switchboards', 'isolation', '', '', ['isolation', 'work in live switchboard', 'add circuits to the existing live DB', 'isolations and lock out']);
task('electrical', 'Testing, energising and commissioning', 'commissioning', '', '', [['testing and commissioning', '', '', 'general'], 'energise and test', 'test and commission the new boards', 'comissioning the switchboards']);
task('electrical', 'Cable jointing and terminations, LV and HV', 'hvTermination|commissioning', '', '', ['cable jointing', 'HV terminations', 'joint LV cables in the pit', 'cable jointng']);
task('electrical', 'High voltage: substations, transformers, ring main units and HV cable', 'substationEquip', '', '', ['substation', 'HV substation install', 'install the kiosk substation and RMU', 'sub station install']);
task('electrical', 'Permanent generators, UPS and central batteries', 'generatorPlant', '', '', ['standby generator install', 'genset install', 'install permanent generator on the plinth', 'standby genarator', ['UPS install', '', 'generatorPlant', 'gap']]);
task('electrical', 'External lighting, light poles and street lighting', 'poleErect|trafficSignals', '', '', ['light poles', 'street lighting', 'install light poles in the car park', 'lite poles']);
task('electrical', 'Solar PV on roofs', 'solarPV', '', '', ['solar panels', 'solar PV install', 'solar panels on the roof', 'solar instal']);
task('electrical', 'Earthing and lightning protection', 'earthStakes|lightningProtection', '', '', ['earthing', 'lightning protection', 'drive earth stakes and run earthing', 'lightening protection']);
task('electrical', 'Testing and tagging electrical equipment', 'testTag', '', '', ['test and tag', 'test n tag', 'tag and test tools', 'testing & tagging']);
task('electrical', 'Core drilling, chasing and sealing penetrations', 'coreDrill', '', '', ['core drilling', 'core holes', 'core drill through slab for conduits', 'core driling']);
task('electrical', 'Isolating and stripping out existing electrical services', 'servicesStrip', '', '', ['make safe and strip out', 'disconnect and remove old cabling', 'electrical strip out of level 2', 'elec strip out']);

// Facade, curtain wall and glazing
task('facade-glazing', 'Unitised curtain wall installation', 'panelInstall', '', '', ['curtain wall install', 'unitised facade', 'install curtain wall units with the tower crane', 'curtian wall']);
task('facade-glazing', 'Stick curtain wall, glazed walls and shopfront framing', 'glassHandle|panelInstall|windowInstall', 'carpFraming', '', ['stick curtain wall', 'shopfront glazing', 'glazed walls on the ground floor', 'shop front framing']);
task('facade-glazing', 'Windows, external doors and louvres', 'windowInstall', '', '', ['windows', 'install windows', 'install aluminium windows from the scaffold', 'window instalation']);
task('facade-glazing', 'Glass balustrades and handrails at open edges', 'balustradeEdge', '', '', ['glass balustrades', 'frameless glass balustrade', 'glass balustrade on the balconies', 'glass ballustrades']);
task('facade-glazing', 'Internal glazing: glazed partitions, shower screens and mirrors', 'glassHandle', '', '', ['internal glazing', 'shower screens and mirrors', 'glass partitions in the offices', 'internal glasing']);
task('facade-glazing', 'Facade cladding panels: aluminium composite, metal and fibre cement', 'claddingInstall|panelInstall', '', '', ['cladding', 'ACM cladding', 'install facade cladding from a boom lift', 'claddng install']);
task('facade-glazing', 'Facade sealing, repairs and glass replacement from a swing stage or BMU', 'swingStage', '', '', ['swing stage', 'facade repairs from a swing stage', 'reseal the windows from the BMU', 'swing stage glass replacment']);

// Fire services
task('fire-services', 'Sprinkler pipework and heads at height', 'fireAtHeight', '', '', ['sprinklers', 'sprinkler fitting', 'run sprinkler mains in the warehouse from boom lifts', 'sprinkers install']);
task('fire-services', 'Hydrant and hose reel pipework and booster assemblies', 'fireAtHeight|boosterInstall', '', '', ['hydrants', 'hydrant and hose reel install', 'hydrant booster at the front boundary', 'hydrent pipework']);
task('fire-services', 'In-ground and under-slab fire mains', 'trench', '', '', ['in ground fire main', 'lay the fire mains', 'fire main under the slab', 'inground fire mains']);
task('fire-services', 'Fire pump rooms and fire water tanks', 'fireLive|pumpInstall|tankPlace', '', '', ['fire pump room', 'fire pumps and tanks', 'install fire pumps in the basement', 'fire pump set']);
task('fire-services', 'Fire detection, alarm and occupant warning systems', 'fireAlarm', '', '', ['fire alarms', 'detection and EWIS', 'install smoke detectors in the ceilings', 'fire detecton']);
task('fire-services', 'Gas suppression and kitchen hood suppression', 'gasSuppression', '', '', ['gas suppression', 'kitchen hood suppression', 'gas suppression in the comms room', 'gas supression']);
task('fire-services', 'Work on live fire systems: isolations, impairments and connections', 'fireLive', '', '', ['fire system isolation', 'impair the sprinklers', 'connect into the live fire system', 'fire isolations']);
task('fire-services', 'Testing and commissioning: hydrostatic, flow and discharge tests', 'pressureTest', '', '', ['hydro test', 'pressure test sprinklers', 'flow and discharge tests on the hydrants', 'hydrostatic test']);
task('fire-services', 'Core drilling, fire collars and sealing penetrations', 'passiveFire', '', '', ['fire collars', 'fire stopping', 'install fire collars and seal penetrations', 'firestopping']);
task('fire-services', 'Portable extinguishers, blankets, signs and block plans', 'hoseReels', '', '', ['fire extinguishers', 'extinguishers and blankets', 'install extinguishers and signs', 'fire extinguisers']);
task('fire-services', 'Isolating and removing existing fire services', 'servicesStrip', '', '', ['remove old sprinklers', 'isolate and strip out fire services', 'decommission old fire services', 'fire services strip out']);
task('fire-services', 'Routine inspection, testing and maintenance (AS 1851)', 'fireLive', '', '', ['fire maintenance', 'AS1851 testing', 'six monthly fire testing in the building', 'routine fire inspections']);

// Flooring
task('flooring', 'Floor preparation: grinding, patching and levelling', 'floorGrind', '', '', ['floor prep', 'grind and level floors', 'grind and patch the slab for vinyl', 'floor preperation']);
task('flooring', 'Sheet vinyl, rubber and resilient flooring', 'floorLay', '', '', ['vinyl flooring', 'lay vinyl', 'lay vinyl in the bathrooms', 'vynil flooring']);
task('flooring', 'Carpet and carpet tiles', 'floorLay', '', '', ['carpet', 'carpet tiles', 'lay carpet tiles in the offices', 'carpet laying']);
task('flooring', 'Epoxy and polyurethane resin floor coatings', 'floorCoating', '', '', ['epoxy floor', 'epoxy flooring', 'epoxy coat the warehouse floor', 'expoxy floor']);
task('flooring', 'Timber and engineered timber floors, sanding and coating', 'timberFloor|floorSanding', '', '', ['timber floors', 'floor sanding', 'lay and sand timber floors', 'timber flooring instal']);
task('flooring', 'Raised access floors', 'accessFloor', '', '', ['access floor', 'raised floor', 'raised access floor in the data hall', 'acess floor']);

// Formwork
task('formwork', 'Suspended slab and beam formwork: erect, strip and backprop', 'formwork', '', '', ['slab formwork', 'deck formwork', 'strip and backprop level 4', 'formwrk']);
task('formwork', 'Column, wall and stair formwork', 'formwork', '', '', ['column formwork', 'wall forms', 'form up the columns and core walls', 'colum formwork']);
task('formwork', 'Jumpform and self-climbing core formwork', 'jumpform', '', '', ['jumpform', 'jump form', 'jump the core form', 'jumpfrom']);
task('formwork', 'Perimeter safety screens: install, climb and remove', 'safetyScreens', '', '', ['perimeter screens', 'climbing screens', 'install and jump the perimeter screens', 'safety screans']);
task('formwork', 'High falsework and load-bearing support scaffold', 'formwork', '', '', ['falsework', 'high falsework', 'falsework for the transfer slab', 'false work']);
task('formwork', 'Formwork for footings, ground slabs and edges', 'slabGround', '', '', ['edge forms', 'form up footings', 'form up the slab on ground edges', 'footing formwork']);

// Insulation
task('insulation', 'Under slab (soffit) insulation boards', 'insulation', '', '', ['soffit insulation', 'under slab insulation boards', 'insulation to the car park soffit', 'insulaton boards']);
task('insulation', 'Wall and ceiling batts, acoustic insulation and sisalation', 'insulation', '', '', ['batts', 'install batts', 'wall and ceiling batts', 'insullation batts']);
task('insulation', 'Insulation in the roof space of an existing building', 'insulation', '', '', ['roof insulation', 'batts in the roof space', 'insulation in the ceiling of the old school', 'roof space insullation']);
task('insulation', 'Sprayed insulation: polyurethane foam and sprayed fire or thermal coatings', 'sprayFoam', '', '', ['spray foam', 'sprayed insulation', 'spray polyurethane foam in the plant room', 'spay foam insulation']);

// Landscaping
task('landscaping', 'Soft landscaping: soil, planting, mulch and turf', 'landscape|turf', '', '', ['landscaping', 'planting and mulch', 'turf and planting at the park', 'landscapping']);
task('landscaping', 'Hard landscaping: paving, edging and landscape walls', 'paving', '', '', ['paving', 'lay pavers', 'paving and edging in the forecourt', 'paveing']);
task('landscaping', 'Irrigation installation', 'shallowTrench', '', '', ['irrigation', 'install irrigation', 'irrigation lines in the garden beds', 'irigation']);
task('landscaping', 'Advanced and street tree planting', 'landscape', '', '', ['tree planting', 'plant street trees', 'plant advanced trees with a HIAB', 'street tree plantng']);
task('landscaping', 'Revegetation and batter planting', 'landscape', '', '', ['revegetation', 'batter planting', 'hydromulch the batters', 'reveg']);
task('landscaping', 'Placing soil, mulch and aggregate with a blower or slinger truck', 'blowerTruck|slingerTruck', '', '', ['blower truck', 'slinger truck', 'blow mulch with a blower truck', 'mulch blowing']);
task('landscaping', 'Podium, roof garden and green wall planting', 'landscapeLift|greenWall|greenRoofLayers', '', '', ['roof garden', 'green wall', 'podium planting', 'green roof planting']);
task('landscaping', 'Landscape furniture, shade structures and playgrounds', 'playground|kitStructure|shadeSail', '', '', ['shade structures', 'playground install', 'install park furniture and shade sails', 'play ground equipment']);

// Lifts
task('lifts', 'Lift shaft protection and access: landing openings, screens and shaft platforms', 'liftShaft', 'trench', '', ['lift shaft protection', 'landing screens', 'install lift shaft platforms', 'lift shaft protecton']);
task('lifts', 'Hoisting machines, rails and equipment into the shaft and machine room', 'liftLifting', 'trench', '', ['lift machine hoisting', 'hoist rails into the lift shaft', 'lift the motor into the machine room', 'lift equipment hoisting']);
task('lifts', 'Installing rails, landing doors, car and counterweight', 'liftInstall|liftLifting', '', '', ['lift installation', 'install lift rails and car', 'install lifts in the tower', 'lift instal']);
task('lifts', 'Car top and pit work, testing and commissioning', 'liftCar', '', '', ['lift commissioning', 'car top work', 'lift pit work and testing', 'lift comissioning']);
task('lifts', 'Escalators and moving walks', 'escalatorInstall', '', '', ['escalators', 'escalator install', 'install escalators in the shopping centre', 'escelator']);
task('lifts', 'Lift modernisation and replacement in occupied buildings', 'liftCar|liftMotor', '', '', ['lift upgrade', 'lift modernisation', 'replace lifts in the occupied tower', 'lift modernization']);
task('lifts', 'Platform lifts, stair lifts and dumbwaiters', 'dumbwaiter|platformLift|stairLiftInstall', '', '', ['platform lift', 'stair lift', 'dumbwaiter install', 'platform lift instal']);
task('lifts', 'Construction use of a lift: jump lifts and temporary cars', '', 'jumpform', 'gap', ['jump lift', 'construction lift', 'temporary lift car for builders', 'jumplift']);

// Line marking
task('line-marking', 'Road line marking and raised pavement markers', 'lineMarking', '', '', ['line marking', 'road line marking', 'line marking at night on the highway', 'linemarking']);
task('line-marking', 'Car park, warehouse and sports court marking', 'lineMarking', '', '', ['car park line marking', 'mark the car park bays', 'line mark the warehouse floor', 'carpark linemarking']);
task('line-marking', 'Line marking removal by grinding or water blasting', 'lineMarking', '', '', ['line removal', 'grind off old lines', 'water blast old line marking', 'line marking removel']);
task('line-marking', 'Tactile ground surface indicators and anti-slip', 'tactileInstall', '', '', ['tactiles', 'TGSI install', 'install tactiles on the stairs', 'tactile instal']);

// Bricklaying and blockwork
task('masonry', 'Reinforced blockwork walls and core filling', 'masonryLay', '', '', ['blockwork', 'block laying', 'core fill block walls', 'blocklaying']);
task('masonry', 'Face brickwork and brick veneer', 'masonryLay', '', '', ['brickwork', 'bricklaying', 'brick veneer on the townhouses', 'bricklayin']);
task('masonry', 'Lightweight concrete (AAC) panel walls', 'claddingInstall|masonryLay', '', '', ['hebel', 'AAC panels', 'hebel walls on the units', 'hebel pannels']);
task('masonry', 'Rendering and solid plastering', 'rendering', '', '', ['rendering', 'render', 'render the block walls from the scaffold', 'rendring']);
task('masonry', 'Masonry repairs, repointing and restoration', 'repointing', '', '', ['repointing', 'brick repairs', 'repoint the heritage facade', 're pointing']);

// Mechanical (HVAC)
task('mechanical', 'Mechanical plant: receive, move and set AHUs, chillers, cooling towers and condensers', 'plantLift|roofPlant', '', '', ['set AHUs', 'set air handling units on roof', 'crane AHUs and condensers onto the roof', 'AHU instal']);
task('mechanical', 'Ductwork installation', 'ductwork', '', '', ['ductwork', 'duct install', 'hang ducts under the slab from scissor lifts', 'duckwork']);
task('mechanical', 'Chilled water, heating water and condenser water pipework', 'mechPipework', '', '', ['chilled water pipework', 'CHW pipework', 'heating water pipes in the plant room', 'chilled water pipwork']);
task('mechanical', 'Refrigerant pipework: run, braze and pressure test', 'refrigerantPipework', '', '', ['refrigeration pipework', 'copper pipework for the VRF', 'run and braze aircon copper in the ceilings', 'refridgeration pipework']);
task('mechanical', 'Evacuating, charging and recovering refrigerant', 'refrigerantCharge', '', '', ['gas charging', 'charge and evacuate refrigerant', 'recover refrigerant from the old units', 'refridgerant charging']);
task('mechanical', 'Fan coil units, cassettes and split systems', 'fanCoil|splitInstall', '', '', ['split systems', 'FCU install', 'install cassettes in the ceiling', 'split system instal']);
task('mechanical', 'Fans: exhaust, smoke exhaust and car park jet fans', 'jetFans|ductwork', '', '', ['exhaust fans', 'jet fans', 'install jet fans in the car park', 'exaust fans']);
task('mechanical', 'Roof plant, cowls, flues and roof penetrations', 'roofPenetration|roofPlant', '', '', ['roof penetrations', ['flues and cowls', 'roofPenetration|roofPlant|flueInstall'], 'cut roof penetrations for the flues', 'roof penatrations']);
task('mechanical', 'Ductwork and pipework insulation', 'mechInsulation', 'ductwork mechPipework', '', ['duct lagging', 'pipe lagging', 'insulate ductwork in the ceiling', 'duct insulaton']);
task('mechanical', 'BMS and controls', 'controlPanelInstall', '', '', ['BMS', 'BMS install', 'controls cabling and panels in the plant room', 'BMS controls instal']);
task('mechanical', 'In-ground mechanical pipework and pits', 'trench', '', '', ['in ground mech pipework', 'in-ground condenser water pipes', 'mechanical pipes in the ground outside the plant room', 'inground mechanical pipes']);
task('mechanical', 'Testing, commissioning and air balancing', 'mechCommissioning', '', '', ['air balancing', 'mech commissioning', 'commission the AHUs and balance the air', 'air balencing']);
task('mechanical', 'Core drilling, chasing and sealing penetrations', 'coreDrill', '', '', ['core holes for mech', 'core drilling', 'core drill slabs for pipework', 'core drillin']);
task('mechanical', 'Disconnecting, removing and reconnecting existing plant', 'servicesStrip', '', '', ['remove old AC', 'decommission plant', 'disconnect and remove the old split systems', 'remove aircon units']);
task('mechanical', 'Service and maintenance of installed plant', 'defectsVisit|acService|mechCommissioning', 'plantService', '', ['aircon service', 'HVAC maintenance', 'service the AHUs on the roof', 'air con servicing']);

// Painting
task('painting', 'Internal painting by brush and roller', 'painting', '', '', ['painting', 'internal painting', 'paint the walls and ceilings in the units', 'paintng']);
task('painting', 'External painting at height', 'paintExternal', '', '', ['external painting', 'paint the facade', 'external painting from a boom lift', 'exterior painting']);
task('painting', 'Airless spray painting and solvent-based coatings', 'paintSpray', '', '', ['spray painting', 'airless spray', 'spray paint with an airless in the car park', 'spray paintng']);
task('painting', 'Preparing existing painted surfaces: lead paint, abrasive and water blasting', 'leadPaint|abrasiveBlast|hydroBlast', '', '', ['sand blasting', 'abrasive blasting', 'water blast old paint off the bridge', 'sandblasting']);
task('painting', 'Protective coatings to steel and concrete', 'painting|paintSpray', '', '', ['protective coatings', 'paint structural steel', 'coat the steel on site from an EWP', 'protective coating']);

// Piling
task('piling', 'Piling rig delivery, assembly and working platform', 'pilingPlatform', '', '', ['piling platform', 'piling rig set up', 'build the piling platform and rig up', 'piling rig assembley']);
task('piling', 'CFA piling', 'pilingRig', '', '', ['CFA piles', 'CFA', 'CFA piling for the building', 'CFA pilling']);
task('piling', 'Bored piles with temporary casing or support fluid', 'pilingRig|openBore', '', '', ['bored piles', 'cased bored piles', 'bored piers with temporary casing', 'bored pilling']);
task('piling', 'Driven piles: precast concrete and steel', 'drivenPiles', '', '', ['driven piles', 'drive steel piles', 'drive precast piles with a hammer', 'driven pilling']);
task('piling', 'Sheet piling: install and extract', 'drivenPiles', 'pilingRig', '', ['sheet piling', 'sheet piles', 'vibrate in sheet piles for the shoring', 'sheet pilling']);
task('piling', 'Screw piles', '', 'pilingRig drivenPiles', 'gap', ['screw piles', 'screw piers', 'install screw piles with an excavator', 'screwpiles']);
task('piling', 'Secant, contiguous and soldier pile walls', 'pilingRig|shoringWall', '', '', ['secant piles', 'soldier piles', 'contiguous pile wall for the basement', 'secant pilling']);
task('piling', 'Pile trimming and pile head breakdown', 'pileTrim', '', '', ['pile trimming', 'cut down piles', 'break down pile heads', 'pile trimimg']);
task('piling', 'Pile load and integrity testing', '', 'pilingRig', 'gap', ['pile testing', 'PDA testing', 'load test piles', 'pile integrity testing']);
task('piling', 'Ground improvement with a rig: stone columns, rigid inclusions and wick drains', 'groundImprove', '', '', ['stone columns', 'wick drains', 'rigid inclusions with a rig', 'stone colums']);
task('piling', 'Marine piling from a barge or jack-up', 'marinePlant', '', '', ['marine piling', 'piling from a barge', 'drive piles from a jack up barge', 'marine pilling']);

// Pipelines and drainage
task('pipelines-drainage', 'Stormwater drainage: pipes, pits and subsoil drains', 'trench', '', '', ['stormwater', 'stormwater pipes and pits', 'lay stormwater pipes along the road', 'storm water drainage']);
task('pipelines-drainage', 'Gravity sewer mains and manholes', 'trench', '', '', ['sewer main', 'lay sewer and manholes', 'gravity sewer along the estate road', 'sewar main']);
task('pipelines-drainage', 'Connections to live sewers and work in existing manholes', 'sewerConnection', '', '', ['live sewer connection', 'connect to existing manhole', 'cut in to the council manhole', 'sewer conection']);
task('pipelines-drainage', 'Water mains: lay, test, disinfect and connect', 'trench|waterConnection', '', '', ['water main', 'lay water main', 'lay and test water main in the footpath', 'watermain']);
task('pipelines-drainage', 'Live water main connections and shutdowns', 'waterConnection', '', '', ['live water connection', 'water main shutdown', 'tap into the live water main', 'live water main tie in']);
task('pipelines-drainage', 'Pump stations, wet wells and valve chambers', 'tankPlace|pumpInstall', '', '', ['pump station', 'wet well', 'install sewer pump station', 'pump staton']);
task('pipelines-drainage', 'Culverts and headwalls', 'trench|tankPlace', '', '', ['culverts', 'box culverts and headwalls', 'install box culvert under the road', 'culvert instal']);
task('pipelines-drainage', 'Trenchless crossings: directional drilling, boring and pipe jacking', 'hddBore', '', '', ['HDD', 'directional drilling', 'under bore the road', 'under boring']);
task('pipelines-drainage', 'Pipe relining, cleaning and CCTV inspection', 'pipeRelining|drainClear', '', '', ['pipe relining', 'CCTV drains', 'reline the stormwater pipes', 'pipe re-lining']);
task('pipelines-drainage', 'Stormwater basins, open channels and swales', 'earthworks|basinLining', '', '', ['detention basin', 'swales', 'build the stormwater basin', 'swales and channels']);

// Plasterboard, walls and ceilings
task('plasterboard-walls-ceilings', 'Steel stud framing to walls, bulkheads and ceilings', 'carpFraming', '', '', ['steel stud framing', 'stud walls', 'frame walls and bulkheads', 'steel stud fraiming']);
task('plasterboard-walls-ceilings', 'Plasterboard and fibre cement linings to walls, partitions and ceilings', 'plasterSheets', '', '', ['plasterboard walls', 'frame and sheet', 'hang board on the walls', 'plasterbord', ['gyprock walls'], ['frame and sheet walls'], ['sheeting walls and ceilings']]);
task('plasterboard-walls-ceilings', 'Setting, sanding and finishing plasterboard', 'plasterSanding', '', '', ['setting', 'set and sand', 'stopping and sanding plasterboard', 'plasterboard seting']);
task('plasterboard-walls-ceilings', 'Suspended grid and acoustic tile ceilings', 'ceilingGrid', '', '', ['suspended ceilings', 'grid and tile ceilings', 'ceiling tiles in the corridors', 'suspended cielings']);
task('plasterboard-walls-ceilings', 'Insulated sandwich wall and ceiling panels', '', 'wallPanels', 'gap', ['coolroom panels', 'sandwich panels', 'install insulated panels in the cold room', 'cool room pannels']);
task('plasterboard-walls-ceilings', 'Shaft walls and fire rated walls', 'carpFraming|plasterSheets', '', '', ['shaft walls', 'fire rated walls', 'shaftliner walls in the risers', 'fire rated wall']);
task('plasterboard-walls-ceilings', 'External wall framing, soffits and fibre cement facade sheeting', 'carpFraming|claddingInstall|eaveLining', '', '', ['external framing', 'soffit lining', 'FC sheeting to the facade', 'external wall frameing']);
task('plasterboard-walls-ceilings', 'Lead-lined walls and radiation shielding', 'leadShielding', '', '', ['lead lined walls', 'radiation shielding', 'lead lined plasterboard to the x-ray room', 'lead lining']);

// Plumbing and hydraulics
task('plumbing-hydraulics', 'In-ground sewer and stormwater drainage on the building site', 'trench|underslabDrainage', '', '', ['in ground drainage', 'drainage', 'sewer and stormwater under the building', 'inground drainage']);
task('plumbing-hydraulics', 'Connections to live sewer, stormwater and water mains', 'sewerConnection|waterConnection', '', '', ['sewer connection', 'connect to the council sewer', 'connect water to the main in the street', 'sewer connnection']);
task('plumbing-hydraulics', 'Under-slab drainage and cast-in sleeves', 'underslabDrainage|castInPlumbing', '', '', ['under slab drainage', 'cast in sleeves', 'set out sleeves and puddle flanges on the deck', 'underslab plumbing']);
task('plumbing-hydraulics', 'Sanitary stacks, water and hot water pipework at height', 'hydraulicRisers', '', '', ['hydraulic pipework at height', 'hydro risers', 'copper and PVC stacks in the risers', 'hydrolic pipework']);
task('plumbing-hydraulics', 'Plumbing rough-in and fit-off of fixtures', 'plumbingFitOff', '', '', ['plumbing fit off', 'hydro rough in', 'rough in and fit off toilets and basins', 'plumbing fitoff']);
task('plumbing-hydraulics', 'Hot water plant, pumps and water tanks', 'waterHeater|pumpInstall|tankPlace|boilerPlant|hotWater', '', '', ['hot water plant', 'install hot water units', 'pumps and tanks in the plant room', 'HWU install']);
task('plumbing-hydraulics', 'Sewer pump stations, grease traps and pits, including confined space entry', 'confined|tankPlace|pumpInstall', '', '', ['grease trap', 'sewer pump well', 'confined space work in the pump well', 'grease trap instal']);
task('plumbing-hydraulics', 'Gas services: natural gas and LPG', 'gasFitting', '', '', ['gas fitting', 'gas services', 'run gas lines to the kitchen', 'LPG install']);
task('plumbing-hydraulics', 'Pressure testing, flushing and commissioning', 'pressureTest', '', '', ['pressure testing', 'flush and test', 'pressure test the copper', 'presure test']);
task('plumbing-hydraulics', 'Roof drainage: downpipes, rainwater heads and siphonic outlets', 'gutters|boxGutter', '', '', ['downpipes', 'roof drainage', 'siphonic drainage on the roof', 'down pipes']);
task('plumbing-hydraulics', 'Core drilling, chasing and sealing penetrations', 'coreDrill', '', '', ['core holes for plumbing', 'chasing and coring', 'core drill the slab for the stacks', 'core drilling penetratons']);
task('plumbing-hydraulics', 'Isolating, capping and removing existing services', 'servicesStrip', '', '', ['cap off services', 'isolate and cap old plumbing', 'remove old pipework in the ceiling', 'disconect and cap services']);
task('plumbing-hydraulics', 'Temporary site plumbing and drainage', '', '', 'gap', ['temp plumbing', 'site sheds plumbing', 'temporary site water and sewer', 'temp water']);

// Precast installation
task('precast', 'Precast and tilt-up wall panels: lift, stand, brace and grout', 'precast', 'tileMix tileCut tileLay', '', ['precast panels', 'tilt up', 'stand and brace precast panels with the crane', 'pre cast panels']);
task('precast', 'Precast columns, beams, stairs and landings', 'precast|precastStair', '', '', ['precast stairs', 'precast columns', 'install precast beams and stairs', 'precast stair instal']);
task('precast', 'Precast floor units: hollowcore, planks, rib and tee floors', 'precastFloor', '', '', ['hollowcore', 'hollow core planks', 'lay precast floor planks', 'hollowcore instal']);
task('precast', 'Precast seating units on rakers', 'precastTier', '', '', ['precast seating', 'seating units on rakers', 'stadium seating units', 'precast seating units']);
task('precast', 'Volumetric precast modules and pods', 'moduleInstall', '', '', ['modular pods', 'bathroom pods', 'install volumetric modules with the crane', 'precast modules']);

// Rail
task('rail', 'Rail safeworking and track protection (protection officer)', 'railCorridor', '', '', ['protection officer', 'rail safeworking', 'work in the rail corridor', 'track protecton']);
task('rail', 'Track construction: sleepers, rail, ballast, tamping', 'trackWork', '', '', ['track laying', 'lay sleepers and rail', 'tamping and ballast', 'track constuction']);
task('rail', 'Resleepering and ballast renewal', 'trackWork', '', '', ['resleepering', 're-sleeper', 'change out sleepers on the track', 'resleeper']);
task('rail', 'Rail welding and stressing (aluminothermic and flash butt)', '', 'stressing', 'gap', ['rail welding', 'thermite welding', 'flash butt welding', 'rail stressing']);
task('rail', 'Turnout installation and renewal', 'trackWork', '', '', ['turnouts', 'install turnouts', 'renew the turnout in a possession', 'turn out renewal']);
task('rail', 'Road-rail (hi-rail) plant operation', '', '', 'gap', ['hi rail', 'hi-rail excavator', 'road rail vehicle', 'hirail plant']);
task('rail', 'Rail corridor civil works: drainage, access roads and fencing', 'railCorridor', '', '', ['rail corridor fencing', 'drainage in the rail corridor', 'access roads in the rail corridor', 'rail coridor drainage']);
task('rail', 'Level crossing renewal', 'railCorridor', '', '', ['level crossing', 'level crossing renewal', 'renew the level crossing road surface', 'level crosing']);
task('rail', 'Station platform works next to live track', 'railCorridor', '', '', ['platform works next to live track', 'station platform extension', 'platform works beside the live track', 'station platfrom']);

// Retaining walls
task('retaining-walls', 'Gabion walls', 'retainingWall', '', '', ['gabions', 'gabion baskets', 'build gabion walls on the creek bank', 'gabbion wall']);
task('retaining-walls', 'Segmental block, concrete sleeper and reinforced soil walls', 'retainingWall', 'reo', '', [['block retaining wall', 'retainingWall|masonryLay'], 'concrete sleeper wall', 'sleeper retaining wall on the boundary', 'retaning wall']);
task('retaining-walls', 'Cast in situ concrete retaining walls', 'concreteWall', '', '', ['concrete retaining wall', 'form and pour retaining wall', 'in situ retaining wall in the basement', 'insitu retaining wall']);
task('retaining-walls', 'Precast concrete retaining walls and reinforced earth panels', 'precast|retainingWall', 'reo', '', ['precast retaining wall', 'RE wall panels', 'reinforced earth wall', 'precast retaining panels']);
task('retaining-walls', 'Soil nailing and shotcrete walls', 'shotcrete', '', '', ['shotcrete', ['soil nails', 'shotcrete|drillRig'], 'soil nail and shotcrete the batter', 'shot crete']);
task('retaining-walls', 'Ground anchors and rock bolts', 'anchorsProps|drillRig', '', '', ['ground anchors', 'rock bolts', 'drill and grout ground anchors', 'rock bolting']);
task('retaining-walls', 'Crib walls', 'retainingWall', '', '', ['crib wall', 'crib walls', 'build a crib retaining wall', 'crib wall instal']);
task('retaining-walls', 'Rock walls and rock armour', 'rockLining', '', '', ['rock wall', 'rock armour', 'place rock armour on the bank', 'rock walling']);

// Roads and pavements
task('roads-pavements', 'Subgrade preparation and proof rolling', 'earthworks', '', '', ['subgrade prep', 'proof rolling', 'trim and proof roll the subgrade', 'sub grade preparation']);
task('roads-pavements', 'Granular pavement layers: sub-base and base', 'gravelLay|roadPlant', '', '', ['road base', 'sub base', 'lay and compact road base', 'roadbase']);
task('roads-pavements', 'Pavement stabilisation (lime, cement or foamed bitumen)', 'roadPlant', '', '', ['stabilisation', 'lime stabilisation', 'cement stabilise the pavement', 'stabilization']);
task('roads-pavements', 'Asphalt paving', 'asphaltLay', '', '', ['asphalt', 'hotmix', 'lay asphalt at night under traffic control', 'ashphalt']);
task('roads-pavements', 'Asphalt profiling (milling)', 'roadPlant', '', '', ['profiling', 'milling', 'mill the old asphalt', 'asphalt profilling']);
task('roads-pavements', 'Sprayed bitumen sealing', 'sprayRoad', '', '', ['spray seal', 'bitumen seal', 'two coat seal on the road', 'spray sealing']);
task('roads-pavements', 'Concrete road pavement (slipform paving)', 'slabGround|concrete', 'paving', '', ['concrete road', 'slipform paving', 'concrete pavement for the bus lane', 'slip form paving']);
task('roads-pavements', 'Concrete kerb and channel', 'kerbInstall', '', '', ['kerb', 'kerb machine', 'concrete kerb with kerb machine', 'curb and channel', ['kerbing']]);
task('roads-pavements', 'Concrete footpaths, shared paths and driveways', 'slabGround', '', '', ['footpaths', 'concrete paths', 'pour driveways and footpaths', 'foot path']);
task('roads-pavements', 'Saw cutting and pavement reinstatement', 'sawCut|asphalt', '', '', ['saw cutting', 'saw cut and reinstate', 'saw cut the road for the trench', 'sawcutting']);
task('roads-pavements', 'Line marking and raised pavement markers', 'lineMarking', '', '', ['line marking', 'raised pavement markers', 'line marking on the new road', 'line markings']);
task('roads-pavements', 'Road safety barrier, signs and guide posts', 'roadBarrier', '', '', ['road barrier', 'wire rope barrier', 'install road safety barrier and signs', 'wire rope barier']);
task('roads-pavements', 'Noise walls', 'noiseWall', '', '', ['noise wall', 'acoustic walls along the freeway', 'noise wall panels', 'noise wal']);

// Roofing and cladding
task('roofing-cladding', 'Metal roof sheeting, safety mesh, blanket and flashings', 'roof', '', '', ['roofing', 'roof sheeting', 'sheet the roof and flashings', 'roof sheating']);
task('roofing-cladding', 'Re-roofing and roof sheet replacement on existing buildings', 'roofStrip', '', '', ['reroof', 're-sheet the roof', 'replace roof sheets on the old school', 're roofing']);
task('roofing-cladding', 'Metal wall cladding', 'claddingInstall', '', '', ['wall cladding', 'metal cladding', 'clad the walls from a scissor lift', 'wall claddin']);
task('roofing-cladding', 'Skylights, roof penetrations and plant flashings', 'roofPenetration|skylight', '', '', ['skylights', 'roof penos', 'flash plant penetrations on the roof', 'sky lights']);
task('roofing-cladding', 'Permanent roof safety systems: guardrail, walkways, anchors and static lines', 'anchorInstall', '', '', ['roof anchors', 'static lines', 'install roof walkways and guardrail', 'height safety']);

// Scaffolding
task('scaffolding', 'Fixed scaffold: erect, alter and dismantle (modular and tube and coupler)', 'scaffold', '', '', ['erect scaffold', 'kwikstage scaffold', 'erect scaffold around the building', 'erect scafolding']);
task('scaffolding', 'Hung, cantilevered and suspended scaffolds, including swing stages', 'swingStage|scaffold', '', '', ['swing stage', 'hung scaffold', 'cantilever scaffold off the slab', 'swingstage']);
task('scaffolding', 'Birdcage and load-bearing support scaffolds', 'scaffold|formwork', '', '', ['birdcage scaffold', 'support scaffold', 'birdcage for the atrium ceiling', 'bird cage scaffold']);
task('scaffolding', "Builders' hoists: install, climb and dismantle", 'hoistInstall', '', '', ['hoist install', 'builders hoist', 'erect and climb the hoist on the building', 'hoist instal']);
task('scaffolding', "Builders' hoist operation", 'hoistOperate', '', '', ['hoist operation', 'hoist driver', 'run the builders hoist', 'hoist operater']);
task('scaffolding', 'Temporary edge protection, stair towers and safety nets', 'edgeProtectionInstall|tempStairs|safetyNet', '', '', ['edge protection', 'stair towers', 'install safety nets under the roof', 'edge protecton']);
task('scaffolding', 'Mast climbing work platforms: install and dismantle', '', '', 'gap', ['mast climber', 'mast climbing platform', 'erect mast climbers on the facade', 'mastclimber']);

// Any trade: access, handling and tools
task('shared-access-and-handling', 'Using an elevating work platform (scissor lift or boom lift)', 'ewp', '', '', ['EWP', 'scissor lift', 'boom lift work', 'scisor lift']);
task('shared-access-and-handling', 'Erecting and dismantling mobile scaffolds', 'mobileScaffold', '', '', ['mobile scaffold', 'erect mobile scaffold', 'build the mobile scaff in the foyer', 'mobile scafold']);
task('shared-access-and-handling', 'Using mobile scaffolds', 'mobileScaffold', '', '', ['mobile scaffold use', 'work off a mobile scaffold', 'working from a mobile scaffold in the atrium', 'mobile scaff']);
task('shared-access-and-handling', 'Using ladders (step, platform and extension)', 'ladderUse', '', '', ['ladders', 'step ladders', 'working off platform ladders', 'laders']);
task('shared-access-and-handling', 'Manual handling', '', '', 'general', ['manual handling', 'lifting by hand', 'carrying materials up stairs', 'manuel handling']);
task('shared-access-and-handling', 'Forklifts and telehandlers', 'forklift', '', '', ['forklift', 'telehandler', 'unload with the forklift', 'fork lift']);
task('shared-access-and-handling', 'Pallet jacks, electric pallet jacks and walkie stackers', '', '', 'general', ['pallet jack', 'walkie stacker', 'electric pallet jack in the warehouse', 'palet jack']);
task('shared-access-and-handling', 'Power tools, including explosive powered tools', 'pdtFixing', '', '', [['power tools', '', '', 'general'], 'ramset', 'shoot fixings with a ramset', 'powder actuated tools']);
task('shared-access-and-handling', 'Working at heights: harnesses, travel restraint and fall arrest', '', '', 'general', ['working at heights', 'harness work', 'fall arrest', 'working at hieghts']);

// Shopfitting
task('shopfitting', 'Tenancy fit-out: whole shopfitting package', '', '', 'general', ['shop fitout', 'shopfitting', 'retail fit out in the mall', 'shop fit out']);
task('shopfitting', 'Shopfront hoarding and working in an operating centre', 'siteEstablish', '', '', ['shopfront hoarding', 'hoarding in a shopping centre', 'put up the hoarding in the mall', 'hording']);
task('shopfitting', 'Tenancy strip-out and make good', 'officeStrip|stripOut', '', '', ['shop strip out', 'tenancy strip out', 'strip out the old shop', 'tenancy stripout']);
task('shopfitting', 'Shopfitting joinery, counters and display units', 'carpJoinery', '', '', ['shop joinery', 'install counters', 'display units and counters in the shop', 'shopfitting joinary']);
task('shopfitting', 'Tenancy partitions, ceilings and bulkheads', 'carpFraming', '', '', ['partitions and ceilings', 'tenancy walls', 'stud partitions and bulkheads in the tenancy', 'partitons']);
task('shopfitting', 'Shopfronts, signage and display lighting', 'signageInstall|glassHandle', '', '', ['signage', 'shop signs', 'install the shopfront signage', 'signage instal']);

// Site establishment and traffic management
task('site-establishment-traffic', 'Temporary fencing, hoardings and gates', 'siteEstablish', '', '', ['site fencing', 'temp fence', 'erect hoardings along the street', 'temporary fenceing']);
task('site-establishment-traffic', 'Site sheds and amenities: deliver, place, connect and remove', 'siteSheds', '', '', ['site sheds', 'dongas', 'deliver and set up the site sheds', 'site shed instal']);
task('site-establishment-traffic', 'Gantries and overhead protection over footpaths', 'siteEstablish', '', '', ['gantry', 'footpath gantry', 'gantry over the footpath', 'gantrey']);
task('site-establishment-traffic', 'Traffic management on public roads', 'road', 'heavyHaulage', '', ['traffic management', 'traffic control', 'traffic control on the main road', 'trafic control']);
task('site-establishment-traffic', 'Site traffic and plant movement management', 'sitePlant', '', '', ['site traffic management', 'plant movements on site', 'traffic management plan for site plant', 'spotter for plant']);

// Steel fixing and post-tensioning
task('steel-fixing-pt', 'Reinforcement to footings, pile caps, ground slabs and pits', 'reo|slabGround', '', '', ['reo for footings', 'tie reo in the footings', 'fix reo in the pile caps and pits', 'reo footings']);
task('steel-fixing-pt', 'Reinforcement on suspended slabs and beams', 'reo', '', '', ['steel fixing', 'tie reo on the deck', 'fix reo on the level 3 slab', 'steelfixing']);
task('steel-fixing-pt', 'Reinforcement to walls, columns and cores, and prefabricated cages', 'reo', '', '', ['wall reo', 'column cages', 'fix reo to the core walls', 'colum reo']);
task('steel-fixing-pt', 'Post-tensioning: placing ducts, strand and anchorages', 'ptTendons', '', '', ['PT', 'lay PT ducts and strand', 'post tensioning on level 4', 'post tentioning']);
task('steel-fixing-pt', 'Post-tensioning: stressing, grouting and cutting tails', 'stressing', '', '', ['stressing', 'stress and grout', 'stress the PT tendons on level 4', 'stresing']);
task('steel-fixing-pt', 'De-stressing and cutting into post-tensioned slabs', '', 'stressing ptTendons', 'gap', ['de-stressing', 'detensioning', 'cut into the PT slab', 'destress PT slab']);

// Structural steel
task('structural-steel', 'Structural steel erection: columns, beams, rafters, purlins and bracing', 'steelErect', '', '', ['steel erection', 'stand steel', 'erect steel columns and beams', 'steal erection']);
task('structural-steel', 'Metal floor decking and shear stud welding', 'deckingStuds', '', '', ['bondek', 'metal deck', 'lay bondek and weld shear studs', 'shear studding']);
task('structural-steel', 'Long span and heavy steel: dual lifts and temporary support towers', 'dualLift|heavyLift', '', '', ['heavy lift', 'long span trusses', 'dual lift the trusses', 'heavy steel lift']);
task('structural-steel', 'Secondary steel: stairs, platforms, walkways, handrails and grid mesh', 'accessSteel', '', '', ['secondary steel', 'steel stairs and platforms', 'install grid mesh walkways', 'handrails and grating']);
task('structural-steel', 'Steel strengthening and alterations in existing buildings', 'beamInstall|steelErect', '', '', ['steel strengthening', 'install new beams in an existing building', 'strengthen steel in the old warehouse', 'steel alterations']);

// Tiling
task('tiling', 'Floor and wall tiling', 'tileLay', '', '', ['tiling', 'wall tiling', 'tile the bathrooms', 'tileing']);
task('tiling', 'Floor screeds, toppings and bedding', 'tileMix', '', '', ['screeds', 'floor screed', 'lay sand and cement screed', 'screeding']);
task('tiling', 'Balcony, terrace and roof top tiling', 'tileEdge', '', '', ['balcony tiling', 'tile the balconies', 'roof terrace tiles', 'balcony tilling']);
task('tiling', 'Stone and large format floor tiles', 'tileLay', '', '', ['stone tiles', 'large format tiles', 'lay large format tiles in the foyer', 'large formate tiles']);
task('tiling', 'Pool, wet deck and coping tiling', 'tileLay', '', '', ['pool tiling', 'pool coping', 'tile the pool and wet deck', 'pool tilling']);

// Waterproofing
task('waterproofing', 'Wet area membranes: bathrooms, kitchens and plant rooms', 'wpLiquid', '', '', ['waterproofing', 'wet area waterproofing', 'waterproof the bathrooms', 'water proofing']);
task('waterproofing', 'Balcony, podium, planter and trafficable deck membranes', 'wpLiquid', '', '', ['balcony waterproofing', 'podium membrane', 'membrane to the planters', 'balcony membraine']);
task('waterproofing', 'Roof membranes: torch-on and liquid applied', 'wpTorch|wpLiquid', '', '', ['torch on', 'roof membrane', 'torch on membrane on the roof', 'torch-on waterproofing']);
task('waterproofing', 'Basement tanking, lift pits and below ground walls', 'belowGroundWp', '', '', ['tanking', 'basement tanking', 'waterproof the lift pits', 'basment tanking']);
task('waterproofing', 'Pools, tanks and water retaining structures', '', '', 'general', ['tank waterproofing', 'pool membrane', 'line the water tank', 'pool waterprofing']);
task('waterproofing', 'Sealants, caulking and expansion joints', 'caulking', '', '', ['caulking', 'silicone', 'seal the expansion joints', 'caulkng']);

// The 25 task cards of the user test kit: [card, card text, answer key wording, other plain wordings], main step.
const CARDS = [];
const card = (id, want, wordings) => { for (const typed of wordings) CARDS.push({ card: id, typed, want, not: '', type: 'task' }); };
card('E1', 'containment', ['New office building, levels 2 to 5. Your crew is putting up the tray and ladder in the ceiling space to carry the submains and lighting cables, working from scissor lifts.', 'Cable tray installation', 'cable tray and ladder in the ceiling', 'tray and ladder from scissor lifts']);
card('E2', 'castIn', ['The level 3 slab gets poured on Friday. Before then your sparkies have to lay the conduits and set the boxes in among the reo.', 'Cast in conduits', 'conduits in the slab before the pour', 'lay conduits and boxes in the reo']);
card('E3', 'commissioning|subBoardInstall', ['A new main switchboard for a school building arrives on a truck next week. Your crew gets it into the switch room, stands it, fixes it down and terminates the consumer mains.', 'Main switchboard installation', 'install MSB and terminate consumer mains', 'switchboard install']);
card('M1', 'ductwork', ['New office building, three floors. Your crew is hanging the supply and return air ducts under the slab, working from scissor lifts.', 'Ductwork installation', 'hang ducts under the slab', 'duct work from scissor lifts']);
card('M2', 'plantLift|roofPlant', ['Two air handling units and a condenser have to go on the roof of a four storey building. A crane company does the lift. Your crew receives them on the roof and sets them on their plinths.', 'Roof top AHU installation', 'set air handling units on roof', 'set AHUs on the roof with a crane', 'AHU and condenser on roof']);
card('M3', 'refrigerantPipework', ['VRF air conditioning on four floors. Your crew runs the copper lines through the ceilings, brazes the joints, and checks the system holds pressure before the ceilings are closed.', 'Refrigerant pipework', 'Refrigeration pipework', 'aircon copper pipework', 'VRF copper pipework', 'run and braze copper lines for the VRF']);
card('C1', 'earthworks', ['New school site. Your excavators, trucks and rollers are cutting the high side down and filling the low side to make the building pads, compacting as you go.', 'Bulk earthworks', 'cut and fill', 'cut and fill for the building pads']);
card('C2', 'trench', ['Along the new access road, your crew is digging a trench about 2.5 metres deep for a water main and conduits, using a trench shield.', 'Trenching', 'trench for water main and conduits', 'deep trench with a trench shield']);
card('P1', 'underslabDrainage|trench', ['Before the ground slab is poured on a new aged care building, your crew digs in and lays the sewer and stormwater pipes under the building and out to the boundary.', 'In ground drainage', 'in-ground sewer and stormwater', 'lay drainage under the slab', 'inground drainage']);
card('P2', 'hydraulicRisers', ['Six storey office building. Your crew runs the copper water pipes and the PVC stacks up through the risers and across the ceilings.', 'Hydraulic pipework at height', 'copper and PVC stacks in the risers', 'hydro pipework in the ceilings', 'plumbing risers']);
card('F1', 'fireAtHeight', ['New warehouse. Your crew runs the sprinkler mains and branch lines in the roof space from boom lifts, and fits the heads.', 'Sprinkler installation', 'sprinkler mains and heads from boom lifts', 'sprinkler pipework']);
card('F2', 'boosterInstall|fireAtHeight', ['New office building. Your crew installs the hydrant booster at the front boundary and runs the hydrant and hose reel pipes up the fire stairs.', 'hydrant and hose reel installation', 'hydrant booster and pipework', 'hydrant pipes up the fire stairs']);
card('R1', 'asphaltLay', ['Night shift on a council road under traffic control. After the old surface is milled off, your crew lays and rolls the new asphalt.', 'Asphalt paving', 'lay asphalt at night', 'asphalt laying']);
card('R2', 'kerbInstall', ['New subdivision road. Your crew sets up the kerb machine and pours the concrete kerb on both sides.', 'Kerb and channel', 'concrete kerb with kerb machine', 'kerb machine', 'extruded kerb']);
card('D1', 'trench', ['New housing estate. Your crew lays the stormwater pipes between the pits along the road and backfills the trench.', 'Stormwater drainage', 'lay stormwater pipes and pits', 'stormwater pipes along the road']);
card('D2', 'sewerConnection', ['Your crew is connecting a new sewer line into an existing council manhole that is in use.', 'Sewer connection to live manhole', 'connect sewer into existing manhole', 'live sewer connection']);
card('FW1', 'formwork', ['Level 4 of a new office building. Your crew stands the props, lays the deck for the suspended slab, and later strips it and backprops.', 'Slab formwork', 'deck formwork and backpropping', 'formwork level 4 slab']);
card('FW2', 'formwork', ['Ground floor of a new building. Your crew forms up the columns and the lift core walls, with the wall forms lifted in by the tower crane.', 'Column and wall formwork', 'form up columns and core walls', 'wall forms with the tower crane']);
card('PB1', 'plasterSheets', ['Fit-out of two office floors. Your crew frames the steel stud walls and sheets them, working from platform ladders and a mobile scaffold.', 'plasterboard walls', 'frame and sheet walls', 'stud and sheet walls', 'gyprock walls from a mobile scaffold']);
card('PB2', 'ceilingGrid', ['Same office fit-out. Your crew puts up the suspended grid and lays in the ceiling tiles in the corridors and offices.', 'Suspended ceilings', 'grid and tile ceilings', 'ceiling grid and tiles']);
card('S1', 'scaffold', ['Four storey building. Your crew puts a full scaffold around the outside for the facade trades, and takes it down when they finish.', 'erect perimeter scaffold', 'scaffold around the building', 'erect and dismantle scaffold']);
card('S2', 'hoistInstall', ['Eight storey building. Your crew puts up a personnel and materials hoist on the side of the building and ties it in as it goes up.', 'Hoist installation', 'install and climb the builders hoist', 'erect the hoist']);
card('X1', 'concrete', ['Level 2 suspended slab. A boom pump is booked. Your crew places, screeds and finishes the concrete.', 'pump and place concrete', 'pour suspended slab', 'concrete pour with boom pump']);
card('X2', 'steelErect', ['Three storey building. Your crew stands the steel columns and fits the beams and bracing, with a crane company doing the lifts.', 'erect steel columns and beams', 'steel erection', 'stand steel columns and beams']);
card('X3', 'stripOut|officeStrip', ['Two floors of an old office building. Your crew pulls out the ceilings, partitions, carpet and old services before the refurbishment.', 'Internal strip out', 'soft strip', 'strip out two floors']);

// HOLDOUT: fresh wordings written after the rules above were built, to check that the rules carry
// over to wordings they were not written for. [typed, must tick, must not tick, type]. On first
// try, the first 161 passed 146 (90.7%) and the next 80 passed 73 (91.3%); the misses were then fixed.
const HOLDOUT = [
  ['strip asbestos sheeting off the shed roof', 'asbestos', '', ''],
  ['remove asbestos lagging from pipes, friable', 'asbestos', '', ''],
  ['dig up asbestos pipe in the trench', 'asbestos', '', ''],
  ['lead paint strip back on old windows', 'leadPaint', '', ''],
  ['bridge pile caps', 'formwork|concreteWall|reo|concrete', '', ''],
  ['pour the headstocks', 'formwork|concrete', '', ''],
  ['set girders on bearings with crane', 'precast|steelErect', '', ''],
  ['replace bridge bearings at night', 'bridgeBearings', '', ''],
  ['stress bridge tendons', 'stressing', '', ''],
  ['hang doors and fit hardware', 'doorHang', '', ''],
  ['install kitchens in the apartments', 'carpJoinery', '', ''],
  ['wall framing timber', 'carpFraming|houseFraming', '', ''],
  ['clearing and grubbing', 'vegClearing', '', ''],
  ['cut fill and compact building pads', 'earthworks', '', ''],
  ['excavate pile caps', 'detailDig', '', ''],
  ['dig trench for sewer 2m deep', 'trench', '', ''],
  ['vac truck potholing', 'vacExcavation', '', ''],
  ['rock hammering', 'rockBreak', '', ''],
  ['truck spoil to tip', 'spoilManage', '', ''],
  ['silt fence install', '', 'earthworks', 'gap'],
  ['float dozer on low loader', 'heavyHaulage', '', ''],
  ['final clean of the units', 'cleaning', '', ''],
  ['high pressure cleaning', 'pressureClean|hydroBlast', '', ''],
  ['acid wash the pavers', 'cleaning', '', ''],
  ['pour level 2 slab', 'concrete', '', ''],
  ['pour footings', 'slabGround|concrete', '', ''],
  ['line pump pour', 'concrete', '', ''],
  ['concrete repairs to car park', 'concreteRepair', '', ''],
  ['tower crane climb', 'towerCraneErect', '', ''],
  ['dogman for the tower crane', 'craneInterface|towerCrane', '', ''],
  ['hiab delivery', 'loaderCrane', '', ''],
  ['soft strip of the office', 'stripOut|officeStrip', '', ''],
  ['demolish the old house with an excavator', 'demolition|structureDemolition', '', ''],
  ['temporary lighting install', 'tempPower', '', ''],
  ['cast in conduits level 4', 'castIn', '', ''],
  ['conduit in ground', 'trench', '', ''],
  ['install cable ladder', 'containment', '', ''],
  ['rough in power and lights', 'fitOff', '', ''],
  ['pull sub mains', 'cablePull', '', ''],
  ['fit off power points', 'fitOff', '', ''],
  ['install distribution boards', 'commissioning|subBoardInstall', '', ''],
  ['HV cable terminations', 'hvTermination', '', ''],
  ['install street lights', 'poleErect|trafficSignals', '', ''],
  ['install solar on the roof', 'solarPV', '', ''],
  ['lightning protection install', 'lightningProtection|earthStakes', '', ''],
  ['core holes through slab', 'coreDrill', '', ''],
  ['install curtain wall panels', 'panelInstall', '', ''],
  ['window install', 'windowInstall', '', ''],
  ['frameless balustrade install', 'balustradeEdge', '', ''],
  ['shower screen install', 'glassHandle', '', ''],
  ['alucobond cladding', 'claddingInstall|panelInstall', '', ''],
  ['swing stage facade repair', 'swingStage', '', ''],
  ['sprinkler pipe install', 'fireAtHeight', '', ''],
  ['hydrant pipework install', 'fireAtHeight|boosterInstall', '', ''],
  ['smoke detectors install', 'fireAlarm', '', ''],
  ['fire collar install', 'passiveFire', '', ''],
  ['grind slab for flooring', 'floorGrind', '', ''],
  ['vinyl laying', 'floorLay', '', ''],
  ['lay carpet', 'floorLay', '', ''],
  ['epoxy coating floor', 'floorCoating', '', ''],
  ['slab deck formwork', 'formwork', '', ''],
  ['column forms', 'formwork', '', ''],
  ['jumpform climb', 'jumpform', '', ''],
  ['install safety screens', 'safetyScreens', '', ''],
  ['insulation batts install', 'insulation', '', ''],
  ['spray foam insulation', 'sprayFoam', '', ''],
  ['turf laying', 'landscape|turf', '', ''],
  ['lay pavers and edging', 'paving', '', ''],
  ['plant trees', 'landscape', '', ''],
  ['green wall install', 'greenWall', '', ''],
  ['lift install in shaft', 'liftInstall|liftLifting', '', ''],
  ['escalator installation', 'escalatorInstall', '', ''],
  ['car park linemarking', 'lineMarking', '', ''],
  ['install tactile indicators', 'tactileInstall', '', ''],
  ['besser block walls', 'masonryLay', '', ''],
  ['brick laying', 'masonryLay', '', ''],
  ['render walls', 'rendering', '', ''],
  ['repoint brickwork', 'repointing', '', ''],
  ['crane AHU onto the roof', 'plantLift|roofPlant', '', ''],
  ['install ductwork in ceiling', 'ductwork', '', ''],
  ['chilled water pipe install', 'mechPipework', '', ''],
  ['aircon pipework', 'refrigerantPipework', '', ''],
  ['install split system', 'splitInstall', '', ''],
  ['car park jet fans', 'jetFans', '', ''],
  ['lag the ductwork', 'mechInsulation', 'ductwork', ''],
  ['balance the air system', 'mechCommissioning', '', ''],
  ['remove old aircon', 'servicesStrip', '', ''],
  ['service split systems', 'acService|defectsVisit', '', ''],
  ['paint the units', 'painting', '', ''],
  ['paint outside of the building from a boom', 'paintExternal', '', ''],
  ['spray painting steelwork', 'paintSpray', '', ''],
  ['grit blasting', 'abrasiveBlast', '', ''],
  ['set up piling rig', 'pilingPlatform', '', ''],
  ['bored piles', 'pilingRig', '', ''],
  ['drive sheet piles', 'drivenPiles', 'pilingRig', ''],
  ['screw pile install', '', 'pilingRig drivenPiles', 'gap'],
  ['trim pile heads', 'pileTrim', '', ''],
  ['lay stormwater pipe', 'trench', '', ''],
  ['sewer reticulation', 'trench', '', ''],
  ['connect to live sewer', 'sewerConnection', '', ''],
  ['lay water main in road reserve', 'trench|waterConnection', '', ''],
  ['under road bore', 'hddBore', '', ''],
  ['reline sewer pipe', 'pipeRelining', '', ''],
  ['stud walls and plasterboard', 'plasterSheets|carpFraming', '', ''],
  ['sheet ceilings', 'plasterSheets', '', ''],
  ['set and sand plasterboard', 'plasterSanding', '', ''],
  ['grid ceiling install', 'ceilingGrid', '', ''],
  ['fire rated wall install', 'carpFraming|plasterSheets', '', ''],
  ['drainage under slab', 'underslabDrainage|trench', '', ''],
  ['hydraulic rough in', 'plumbingFitOff', '', ''],
  ['copper pipe in risers', 'hydraulicRisers', '', ''],
  ['install hot water heat pump', 'pumpInstall|hotWater|waterHeater', '', ''],
  ['gas pipe install', 'gasFitting', '', ''],
  ['pressure test pipework', 'pressureTest', '', ''],
  ['install downpipes and rainwater heads', 'gutters|boxGutter', '', ''],
  ['tilt panels', 'precast', '', ''],
  ['precast stair install', 'precast|precastStair', '', ''],
  ['hollowcore planks install', 'precastFloor', '', ''],
  ['rail protection', 'railCorridor', '', ''],
  ['resleeper the track', 'trackWork', '', ''],
  ['gabion wall install', 'retainingWall', '', ''],
  ['concrete sleeper retaining wall', 'retainingWall', '', ''],
  ['spray shotcrete to batter', 'shotcrete', '', ''],
  ['install rock bolts', 'anchorsProps|drillRig', '', ''],
  ['road base laying', 'gravelLay|roadPlant', '', ''],
  ['asphalt laying', 'asphaltLay', '', ''],
  ['profile the road', 'roadPlant', '', ''],
  ['spray seal road', 'sprayRoad', '', ''],
  ['kerb and gutter', 'kerbInstall', '', ''],
  ['concrete driveway', 'slabGround', '', ''],
  ['guardrail on the highway', 'roadBarrier', '', ''],
  ['roof sheeting install', 'roof', '', ''],
  ['replace old roof sheets', 'roofStrip', '', ''],
  ['colorbond wall cladding', 'claddingInstall', '', ''],
  ['skylight install', 'skylight|roofPenetration', '', ''],
  ['static line install', 'anchorInstall', '', ''],
  ['erect and dismantle scaffold', 'scaffold', '', ''],
  ['install builders hoist', 'hoistInstall', '', ''],
  ['safety nets install', 'safetyNet', '', ''],
  ['boom lift', 'ewp', '', ''],
  ['use mobile scaffold', 'mobileScaffold', '', ''],
  ['step ladder work', 'ladderUse', '', ''],
  ['telehandler work', 'forklift', '', ''],
  ['shopfitting joinery install', 'carpJoinery', '', ''],
  ['shop signage install', 'signageInstall', '', ''],
  ['temp fencing install', 'siteEstablish', '', ''],
  ['set up site sheds', 'siteSheds', '', ''],
  ['traffic control on the street', 'road', '', ''],
  ['tie reo on deck', 'reo', '', ''],
  ['post tensioning ducts', 'ptTendons', '', ''],
  ['stress PT slab', 'stressing', '', ''],
  ['erect structural steel', 'steelErect', '', ''],
  ['lay bondek', 'deckingStuds', '', ''],
  ['install steel stairs', 'accessSteel', '', ''],
  ['tile floors', 'tileLay', '', ''],
  ['bathroom tiling', 'tileLay', '', ''],
  ['tile the balcony', 'tileEdge|tileLay', '', ''],
  ['waterproof showers', 'wpLiquid', '', ''],
  ['torch on roof', 'wpTorch', '', ''],
  ['basement waterproofing', 'belowGroundWp', '', ''],
  ['sealant to windows', 'caulking', '', ''],
  ['cable tray install level 3 ceiling', 'containment', '', ''],
  ['conduit in slab before pour', 'castIn', '', ''],
  ['MSB and DBs install', 'commissioning|subBoardInstall', '', ''],
  ['elec rough-in apartments', 'fitOff', '', ''],
  ['light fittings install off scissor lift', 'fitOff', '', ''],
  ['pull cables through pits', 'cablePull', '', ''],
  ['test n tag leads', 'testTag', '', ''],
  ['genset hook up for shutdown', 'generatorConnect', '', ''],
  ['ductwork on level 2 from scissors', 'ductwork', '', ''],
  ['AHU lift to roof with franna', 'plantLift|roofPlant', '', ''],
  ['VRF pipework install', 'refrigerantPipework', '', ''],
  ['condensers on roof', 'roofPlant|plantLift', '', ''],
  ['FCU replacement', 'fanCoil', '', ''],
  ['exhaust fan install in toilets', 'ductwork', '', ''],
  ['bulk earthworks with scrapers', 'earthworks', '', ''],
  ['trenching for water main with shields', 'trench', '', ''],
  ['excavator trenching for conduits', 'trench', '', ''],
  ['drainage pipes under building slab', 'underslabDrainage|trench', '', ''],
  ['hydraulic risers and stacks', 'hydraulicRisers', '', ''],
  ['PVC stack install', 'hydraulicRisers', '', ''],
  ['plumbing rough in townhouses', 'plumbingFitOff', '', ''],
  ['sprinkler heads and pipe in carpark', 'fireAtHeight', '', ''],
  ['hydrant booster install', 'boosterInstall', '', ''],
  ['fire hose reels and pipework', 'fireAtHeight|hoseReels', '', ''],
  ['asphalt overlay night works', 'asphaltLay', '', ''],
  ['kerb and channel with slipform machine', 'kerbInstall', '', ''],
  ['stormwater pits and pipes along road', 'trench', '', ''],
  ['connect sewer to council manhole', 'sewerConnection', '', ''],
  ['deck formwork and backprops', 'formwork', '', ''],
  ['core walls forms with crane', 'formwork', '', ''],
  ['stud walls and sheeting', 'plasterSheets', '', ''],
  ['plasterboard ceilings', 'plasterSheets|plasterCeiling', '', ''],
  ['ceiling grid and tiles in offices', 'ceilingGrid', '', ''],
  ['perimeter scaffold erect', 'scaffold', '', ''],
  ['erect hoist and tie in', 'hoistInstall', '', ''],
  ['pump and finish level 2 slab', 'concrete', '', ''],
  ['erect steel portal frames', 'steelErect', '', ''],
  ['strip out ceilings and walls', 'stripOut|officeStrip', '', ''],
  ['tile bathrooms and kitchens', 'tileLay', '', ''],
  ['membrane to balconies', 'wpLiquid', '', ''],
  ['lay reo mesh on ground slab', 'reo|slabGround', '', ''],
  ['brick veneer townhouses', 'masonryLay', '', ''],
  ['blockwork lift core', 'masonryLay', '', ''],
  ['precast wall panels with mobile crane', 'precast', '', ''],
  ['metal roofing on warehouse', 'roof', '', ''],
  ['window and door install', 'windowInstall|doorHang', '', ''],
  ['facade cladding from EWP', 'claddingInstall', '', ''],
  ['glazing install curtain wall', 'panelInstall|glassHandle', '', ''],
  ['line marking car park', 'lineMarking', '', ''],
  ['landscaping and turf', 'landscape|turf', '', ''],
  ['CFA piles with rig', 'pilingRig', '', ''],
  ['sheet piles install and extract', 'drivenPiles', 'pilingRig', ''],
  ['rock breaking in basement', 'rockBreak', '', ''],
  ['hydro vac services', 'vacExcavation', '', ''],
  ['traffic management for road works', 'road', '', ''],
  ['site fencing and gates', 'siteEstablish', '', ''],
  ['remove asbestos roof', 'asbestos', '', ''],
  ['demo of old warehouse', 'demolition|structureDemolition', '', ''],
  ['painting internal walls', 'painting', '', ''],
  ['epoxy floor coating warehouse', 'floorCoating', '', ''],
  ['carpet tile install', 'floorLay', '', ''],
  ['install insulation boards to car park soffit', 'insulation', '', ''],
  ['joinery fit out', 'carpJoinery', '', ''],
  ['door hardware and frames', 'doorHang', '', ''],
  ['solar panels install commercial roof', 'solarPV', '', ''],
  ['lift shaft screens', 'liftShaft', '', ''],
  ['pump station install', 'tankPlace|pumpInstall', '', ''],
  ['water main tie in', 'waterConnection', '', ''],
  ['retaining wall blocks', 'retainingWall|masonryLay', '', ''],
  ['spray seal', 'sprayRoad', '', ''],
  ['road barriers install', 'roadBarrier', '', ''],
  ['gantry over footpath', 'siteEstablish', '', ''],
  ['crane truck unload', 'loaderCrane', '', ''],
  ['mobile crane lift', 'craneInterface|crane', '', ''],
  ['forklift unloading', 'forklift', '', ''],
  ['EWP work', 'ewp', '', ''],
  ['ladder work', 'ladderUse', '', ''],
  ['core drilling slabs', 'coreDrill', '', ''],
  ['fire stopping penos', 'passiveFire', '', ''],
  ['gas suppression install', 'gasSuppression', '', ''],
].map(([typed, want, not, type]) => ({ typed, want, not, type }));

const toRow = (row) => ({
  ...row,
  // Each group is a list of kinds, any one of which will do.
  want: row.want ? row.want.split(' ').map((group) => group.split('|')) : [],
  not: row.not ? row.not.split(' ') : [],
  type: row.type || 'task',
});

module.exports = { VARIANTS: VARIANTS.map(toRow), CARDS: CARDS.map(toRow), HOLDOUT: HOLDOUT.map(toRow) };
