// The registers a SWMS template carries alongside the job steps: plant and
// equipment, hazardous substances, licences and qualifications, emergency
// arrangements, the legislation and codes the controls rely on, and a suggested
// risk rating for each step. Each is worked out from the task and the finished
// job steps, and left for the supervisor to check and complete for the site.

// Plant and equipment. A licence is shown only where Schedule 3 of the WHS
// Regulation makes the work high risk work; otherwise the operator must be
// competent. Electrical equipment for construction work is inspected and tested
// to AS/NZS 3012 (Electrical Safety Regulation 2026 (Qld) s 140).
const { localNote, localText, withoutStateCodes } = require('./citations');
const { findState } = require('./legislation');
const { controlLevel, HIGHER } = require('./control-level');
const TEST_TAG = 'Inspected, tested and tagged to AS/NZS 3012. Checked for damage before use.';
const PRESTART = 'Pre-start check each shift. Serviced to the manufacturer\'s instructions.';
const PLANT = [
  { item: 'Boom-type elevating work platform', pattern: /\b(boom lifts?|boom ewps?|knuckle booms?|cherry pickers?|articulating booms?)\b/i, inspection: `${PRESTART} Inspected and maintained by a competent person to the manufacturer\'s instructions, including its periodic (usually yearly) inspection.`, licence: 'Yes, where the boom length is 11 m or more, measured as the greater of platform height and horizontal reach (WP)' },
  { item: 'Scissor lift', pattern: /\bscissor lifts?\b/i, inspection: `${PRESTART} Inspected and maintained by a competent person to the manufacturer\'s instructions, including its periodic (usually yearly) inspection.`, licence: 'No. Operator trained in the model used' },
  { item: 'Elevating work platform', pattern: /\b(elevating work platforms?|ewps?)\b/i, skipIf: /\b(scissor|boom|considered)\b/i, inspection: `${PRESTART} Inspected and maintained by a competent person to the manufacturer\'s instructions, including its periodic (usually yearly) inspection.`, licence: 'Only for a boom-type platform with a boom length of 11 m or more (WP). No licence for a scissor lift' },
  { item: 'Tower crane', pattern: /\btower cranes?\b/i, inspection: 'Registered item of plant. Pre-erection and commissioning inspections, daily pre-operational check and log book, routine inspections, a yearly inspection if erected for 12 months or more, and a major inspection (WHS Reg s 235).', licence: 'Yes (CT, or CS for a self-erecting tower crane), with licensed doggers or riggers' },
  { item: 'Vehicle loading crane (hiab)', pattern: /\b(vehicle loading cranes?|loader cranes?|hiabs?|truck loading crane|truck[- ]mounted cranes?|knuckle boom cranes?)\b/i, inspection: 'Pre-start check and log book. Inspected and maintained to the manufacturer\'s instructions (WHS Reg s 213).', licence: 'Yes (CV) where the crane is rated at 10 metre-tonnes or more. Under 10 metre-tonnes no licence, the operator is trained and competent on it' },
  { item: 'Mobile crane or crane truck', pattern: /\b(mobile cranes?|crane trucks?|franna|slewing cranes?|the crane|a crane|cranes?)\b/i, skipIf: /\b(tower crane|crane ties?|crane or lifting gear|crane, hoist|crane or (?:a )?hoist|hoist or (?:a )?crane|where a crane|if a crane|crane or forklift|forklift or crane|forklift, crane|people, cranes|cranes, plant|keep cranes|used as a crane)\b/i, inspection: 'Crane company\'s log book and pre-start check. Inspected to the manufacturer\'s instructions (WHS Reg s 213). Cranes over 10 t are registered plant and need a major inspection (s 235).', licence: 'Yes, crane class to suit (slewing C2, C6, C1 or C0; non-slewing over 3 t CN; vehicle loading crane of 10 metre-tonnes or more CV), with licensed doggers or riggers. No licence for a vehicle loading crane under 10 metre-tonnes or a non-slewing crane of 3 t or less' },
  { item: 'Forklift', pattern: /\bforklifts?\b/i, inspection: PRESTART, licence: 'Yes (LF)' },
  { item: 'Telehandler', pattern: /\btelehandlers?\b/i, inspection: PRESTART, licence: 'No Schedule 3 class names telehandlers. Operator competent in the model used. Check with the supplier whether a non-slewing crane licence (CN) is needed when it is fitted with a jib or hook to lift suspended loads' },
  { item: 'Personnel or materials hoist', pattern: /(?<!(?:vehicle|car|chain) )\b(hoists?|materials lifts?)\b/i, skipIf: /\b(chain hoists?|leave out|at the hoist|where there is|near the hoist|clear of|crane, hoist|crane or (?:a )?hoist|hoist or (?:a )?crane|hoist, crane|by (?:a )?hoist|lift, (?:a )?hoist|lifts?, (?:a )?hoist or)\b/i, inspection: 'Inspected, tested and maintained by a competent person to the manufacturer\'s instructions (WHS Reg s 213). Pre-start check each shift. Erected and altered by licensed riggers.', licence: 'Yes (HP or HM)' },
  { item: 'Concrete placing boom', pattern: /\b(placing booms?|boom pumps?|pump trucks?|truck-mounted pumps?)\b/i, inspection: 'Registered item of plant. Daily pre-start check. Pipes, hoses and clamps checked for wear and damage before use. Yearly inspection and six-yearly major inspection (Concrete Pumping Code s 5).', licence: 'Yes (PB)' },
  { item: 'Concrete line pump', pattern: /\b(line pumps?|concrete pumps?|pump(?:,|\s+and)?\s+(?:and\s+)?place\w*)\b/i, inspection: 'Pre-start check. Pipes, hoses and clamps checked for wear and damage before use. Inspected by a competent person at least yearly.', licence: 'No. Operator competent' },
  { item: 'Scaffold', pattern: /(?<!mobile )\bscaffold(?:s|ing)?\b/i, inspection: 'Handover certificate before first use. Inspected by a competent person before use, after an incident that could affect its stability, after repairs or alterations, and at least every 30 days (WHS Reg s 225, for suspended, cantilevered, spur and hung scaffolds, and others over 4 m).', licence: 'Yes, for erecting, altering or dismantling where a fall of more than 4 m is possible (SB, SI or SA)' },
  { item: 'Mobile scaffold', pattern: /\bmobile scaffolds?\b/i, inspection: 'Erected to the manufacturer\'s instructions. Castors locked, guardrails complete, checked before use. Over 4 m: handover certificate and inspections as for a scaffold (WHS Reg s 225).', licence: 'No, under 4 m. Yes (SB) where a person or object could fall more than 4 m' },
  { item: 'Turf laying machine', pattern: /\bturf laying machines?\b/i, inspection: PRESTART, licence: 'No. Operator competent' },
  { item: 'Building maintenance unit (BMU)', pattern: /\b(building maintenance units?|bmus?)\b/i, inspection: 'Inspected and maintained to the manufacturer\'s instructions and AS 1418.13, with current certification before use.', licence: 'No. Operators trained in the unit' },
  { item: 'Excavator', pattern: /\b(excavators?|excavat\w* by machine|mini excavators?|(?<!small )earthmoving plant)\b/i, skipIf: /\bRun earthmoving plant\b/, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Skid steer or posi-track', pattern: /\b(skid ?steers?|bobcats?|posi-?tracks?)\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Roller or plate compactor', pattern: /\b(plate compactors?|compactors?|wacker|compaction|(?:ride-on|vibrating|smooth drum|padfoot|road|trench) rollers?|paver, roller|spreader, roller|(?:graders?|dozers?|water carts?),? (?:and )?(?:a )?rollers?|rollers? and (?:a )?water carts?|the roller|a roller or plate compactor|(?:asphalt|bitumen|hot mix|compact\w*)\b[^.]{0,40}\bwith a roller)\b/i, skipIf: /\b(paint\w*|brush\w*|roller doors?|rolling impact compact\w*)\b/i, inspection: PRESTART, licence: 'No. Operator competent' },
  { item: 'Piling rig', pattern: /\b(piling rigs?|cfa rigs?|cfa piles?|continuous flight auger|bored pil\w*|bored piers?|crawler rigs?|pile driving machines?|piling machines?)\b/i, inspection: 'Daily pre-start check and the rig\'s log book.', licence: 'No. Operator competent' },
  { item: 'Concrete truck', pattern: /\bconcrete trucks?\b/i, inspection: 'The supplier\'s pre-start check.', licence: 'Truck driver\'s licence' },
  { item: 'Power trowel', pattern: /\bpower trowels?\b/i, inspection: `${PRESTART} Guards and stop switch checked.`, licence: 'No' },
  { item: 'Concrete saw', pattern: /\b(concrete saws?|saw cut\w*|saw-cut\w*|floor saws?|wall saws?)\b/i, inspection: `${PRESTART} Blade guard in place. Electric saws: ${TEST_TAG}`, licence: 'No' },
  { item: 'Core drill', pattern: /\bcore[- ]?drill\w*\b/i, inspection: TEST_TAG, licence: 'No' },
  { item: 'Generator', pattern: /\bgenerators?\b/i, skipIf: /\b(standby|load shed\w*|load test\w*|operation of (?:the )?generators?|install generators|generators and fuel|run and load test|generator (?:rooms?|sets?))\b/i, inspection: `${PRESTART} Electrical output protected by an RCD. ${TEST_TAG}`, licence: 'No' },
  { item: 'Chainsaw', pattern: /\bchainsaws?\b/i, inspection: `${PRESTART} Chain brake working.`, licence: 'No. Operator competent' },
  { item: 'Oxy-acetylene or gas torch set', pattern: /\b(oxy|acetylene|gas torch\w*|torch-on|torching|brazing|lpg)\b/i, inspection: 'Hoses, regulators and flashback arrestors checked before use.', licence: 'No' },
  { item: 'Welder', pattern: /\bweld\w*\b/i, skipIf: /\b(vinyl|seams?|hot air|heat weld\w*|blend\w* in welds|welds to|thermite|alumino-?thermic|flash[- ]butt)\b/i, inspection: TEST_TAG, licence: 'No' },
  { item: 'Nail gun', pattern: /\bnail guns?\b/i, inspection: 'Checked before use. Single shot trigger.', licence: 'No' },
  { item: 'Air compressor', pattern: /\b(compressed air|air compressors?|compressors?)\b/i, skipIf: /\b(fans?|pumps|start\w* without|refrigerat\w*|condens\w*)\b/i, inspection: `${PRESTART} Hoses and couplings checked and restrained.`, licence: 'No' },
  { item: 'Concrete vibrator', pattern: /\bvibrators?\b/i, inspection: TEST_TAG, licence: 'No' },
  { item: 'Trench shield or shoring', pattern: /\b(trench shields?|trench box\w*|(?<!re-|re)shoring|(?<!re-|re)shored)\b/i, inspection: 'Installed to the manufacturer\'s or engineer\'s design, and checked by a competent person frequently, including before each shift and after rain.', licence: 'No. Installed by competent people' },
  { item: 'Dewatering pump', pattern: /\b(dewater\w*|pump out water|pumps? (?:the )?water)\b/i, inspection: `${PRESTART} ${TEST_TAG}`, licence: 'No' },
  { item: 'Vacuum excavation unit', pattern: /\b(vacuum excavat\w*|vacuum system|non-destructive digging|hydro ?vac\w*)\b/i, inspection: PRESTART, licence: 'No. Operator competent' },
  { item: 'Tipper or dump truck', pattern: /\b(tippers?|tip trucks?|dump trucks?|haul trucks?|trucks? (?:cart|haul)\w*|carted by truck|cart\w* (?:away |off (?:site )?)?(?:the )?(?:excavated )?(?:spoil|topsoil|soil|fill|mulch)\w*)\b/i, skipIf: /\barticulated dump trucks?\b/i, inspection: PRESTART, licence: 'Truck driver\'s licence' },
  { item: 'Gas detector', pattern: /\b(gas detectors?|gas monitor\w*|atmospheric? (?:testing|monitor\w*)|test(?:ed)? (?:the )?atmosphere|monitor the atmosphere)\b/i, inspection: 'Calibrated to the manufacturer\'s instructions and bump tested before use.', licence: 'No. User trained' },
  { item: 'Lifting gear (slings, chains, shackles)', pattern: /\b(slings?|slung|shackles?|lifting gear|lifting chains?)\b/i, inspection: 'Tagged with its working load limit, inspected before each use and periodically by a competent person. Damaged gear is withdrawn.', licence: 'None for the gear itself. Slinging loads with it needs a dogging or rigging licence.' },
  { item: 'Stump grinder', pattern: /\bstump(?:s)? (?:grind\w*|removal)|stump grinders?\b/i, inspection: `${PRESTART} Guards in place.`, licence: 'No. Operator competent' },
  { item: 'Post hole auger', pattern: /\b(augers?|post holes?)\b/i, skipIf: /\b(paver'?s augers?|drum, augers?)\b/i, inspection: `${PRESTART} Guards in place.`, licence: 'No' },
  { item: 'Cable winch or puller', pattern: /\b(winch\w*|cable pull\w*|pull cables?)\b/i, inspection: `${PRESTART} Guards and stop control working.`, licence: 'No' },
  { item: 'Floor grinder with H class extraction', pattern: /\b(floor grind\w*|grind\w* (?:and polish\w* )?(?:the |a )?(?:concrete )?floors?|diamond grind\w*)\b/i, inspection: `${PRESTART} Guards and dust shroud in place. ${TEST_TAG}`, licence: 'No. Operator competent' },
  { item: 'Drain jetter', pattern: /\b(jetters?|jetting)\b/i, skipIf: /\b(hydro[- ]?blast\w*|water blast\w*)\b/i, inspection: `${PRESTART} Hoses, nozzles and fittings rated for the pressure.`, licence: 'No. Operator trained' },
  { item: 'Drain cleaning machine', pattern: /\b(electric eels?|drain (?:cleaning )?machines?)\b/i, inspection: `${PRESTART} ${TEST_TAG} Guards and foot switch working.`, licence: 'No' },
  { item: 'CCTV drain camera', pattern: /\b(cctv cameras?|drain cameras?|pipe cameras?)\b/i, skipIf: /\b(security|access control|install\w* (?:an? |the |new )?(?:cctv|cameras?)|on (?:a |the )?poles?)\b/i, inspection: TEST_TAG, licence: 'No' },
  { item: 'Pipe relining equipment', pattern: /\b(relin(?:e|es|ed|ing)|relining equipment)\b/i, inspection: `${PRESTART} Inversion and curing equipment checked to the manufacturer's instructions.`, licence: 'No. Operator trained' },
  { item: 'Directional drilling rig', pattern: /\b(directional drill\w*|hdd|boring rigs?)\b/i, inspection: 'Daily pre-start check and the rig\'s log book.', licence: 'No. Operator competent (verification of competency)' },
  { item: 'Drill rig', pattern: /\bdrill(?:ing)? rigs?\b/i, skipIf: /\bdirectional\b/i, inspection: 'Daily pre-start check and the rig\'s log book.', licence: 'No. Operator competent (verification of competency)' },
  { item: 'Asphalt paver', pattern: /\b(asphalt pavers?|paving machines?|the paver)\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Water blaster', pattern: /\b(water blast\w*|hydro[- ]?blast\w*|pressure clean\w*|pressure wash\w*)\b/i, inspection: `${PRESTART} Hoses, lance and fittings rated for the pressure, dead man control working.`, licence: 'No. Operator trained' },
  { item: 'Spray foam rig', pattern: /\bspray\w* (?:polyurethane |pu )?foam\b|\bspray foam\b/i, inspection: `${PRESTART} Hoses and heaters checked to the manufacturer's instructions.`, licence: 'No. Operator trained' },
  { item: 'Bitumen sprayer', pattern: /\b(bitumen sprayers?|the sprayer)\b/i, inspection: `${PRESTART} Burners, spray bar and hoses checked.`, licence: 'No. Operator trained' },
  { item: 'Aggregate spreader', pattern: /\b(aggregate spreaders?|chip spreaders?|sprayer, spreader)\b/i, inspection: PRESTART, licence: 'No. Operator competent' },
  { item: 'Post driver', pattern: /\bpost drivers?\b/i, inspection: `${PRESTART} Guards and controls working.`, licence: 'No. Operator trained' },
  { item: 'Vacuum lifter', pattern: /\bvacuum lifters?\b/i, inspection: 'Inspected before each use, with the vacuum gauge and warning device working. Lifting gear when used under a crane.', licence: 'No. Operator trained' },
  { item: 'Swing stage (suspended scaffold)', pattern: /\b(swing stages?|suspended scaffold\w*)\b/i, inspection: 'Installed to the designer\'s and manufacturer\'s instructions, with the roof anchors or outriggers and counterweights checked before use. Inspected by a competent person before use, after alterations or an incident, and at least every 30 days (WHS Reg s 225).', licence: 'Installed, altered and dismantled only by the holder of an advanced rigging or advanced scaffolding licence (RA or SA). Operators trained in the unit' },
  { item: 'Airless spray unit', skipIf: /\bfoam\b/i, pattern: /\b(airless spray\w*|airless sprayers?|spray rigs?|spray(?:ing)? (?:equipment|units?|pumps?))\b/i, inspection: `${PRESTART} Tip guard and trigger lock working, hoses and fittings rated for the pressure.`, licence: 'No. Operator trained' },
  { item: 'Line marking machine', pattern: /\bline marking machines?\b/i, inspection: PRESTART, licence: 'No. Operator trained' },
  { item: 'Hydraulic jacks', pattern: /\b(hydraulic jacks?|house jacks?|bottle jacks?|jacking equipment|jack the house)\b/i, inspection: 'Rated capacity marked. Checked before use, and loads are packed or propped as they are raised.', licence: 'No. Operator competent' },
  { item: 'Rock breaker (hydraulic hammer)', pattern: /\b(rock break(?:ers?|ing)|hydraulic hammers?|hydraulic breakers?|peckers?)\b/i, inspection: `${PRESTART} Hammer mounting, hoses and guards checked.`, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Abrasive blasting equipment', pattern: /\b(sand ?blast\w*|abrasive blast\w*|grit blast\w*|soda blast\w*|blast pots?)\b/i, inspection: `${PRESTART} Blast pot, hoses, couplings and dead man control checked. Air-supplied helmet and its air supply checked.`, licence: 'No. Operator trained' },
  { item: 'Sander', pattern: /\b(floor sanders?|sanders?)\b/i, skipIf: /\b(belt sanders? or|orbital)\b/i, inspection: `${PRESTART} Dust bag or extraction fitted and leads tagged.`, licence: 'No. Operator trained' },
  // The plant a library step does its work with, named by the step (messy round 5: tiling with no tile saw or
  // mixer, pebble finish with no pump): a paddle mixer for tile adhesive and grout, a pump and spray rig for
  // a pebble finish. The notes are the mixer's and the grout pump's.
  { item: 'Paddle mixer', pattern: /\b(paddle mixers?|Mix and spread the tile adhesive)\b/i, inspection: `${PRESTART} Guards in place and leads tagged or engine checked.`, licence: 'No' },
  { item: 'Pebble pump and spray rig', pattern: /\b(pebble (?:pumps?|spray rigs?|rigs?)|Mix and apply the pebble finish)\b/i, inspection: `${PRESTART} Hoses, couplings and pressure relief checked.`, licence: 'No. Operator trained' },
  { item: 'Concrete or mortar mixer', pattern: /\b(mixers?|mixer guards|Mix and apply the pebble finish)\b/i, skipIf: /\bpaddle mixers?\b/i, inspection: `${PRESTART} Guards in place and leads tagged or engine checked.`, licence: 'No' },
  { item: 'Lifting beam and chain block', pattern: /\b(lifting beams?|chain blocks?)\b/i, inspection: 'Rated, tagged and proof tested before use, and inspected before each lift.', licence: 'None for the gear itself. Slinging loads with it needs a dogging or rigging licence.' },
  { item: 'Bar cutter or cut-off saw', pattern: /\b(bar cutters?|cut-off saws?)\b/i, inspection: `${PRESTART} Guards in place.`, licence: 'No' },
  { item: 'Trencher', pattern: /\btrenchers?\b/i, inspection: PRESTART, licence: 'No. Operator trained' },
  { item: 'Vacuum truck', pattern: /\bvacuum (?:trucks?|tankers?)\b/i, inspection: PRESTART, licence: 'No. Operator competent' },
  { item: 'Davit or tripod (pump lifting)', pattern: /\bdavits?\b/i, inspection: 'Rated for the load, tagged and checked before each lift, with its winch or chain block working.', licence: 'No. Users trained' },
  { item: 'Tripod and winch (confined space rescue)', pattern: /\btripod\w*\b/i, skipIf: /\b(?:davits? or (?:a )?tripods?|davit or tripod)\b/i, inspection: 'Inspected before each entry, within its inspection date.', licence: 'No. Users trained' },
  { item: 'Work punt or boat', pattern: /\b(work punts?|punts?|barges?|work boats?|(?<=from (?:a |the ))pontoons?)\b/i, skipIf: /\b(jack-?up barges?|barge (?:cappings?|flashings?|boards?|rolls?|tiles?|rafters?)|(?:fascias?|guttering|ridges?|valleys?),? (?:or |and )?barges?|barges?,? (?:and|or) (?:similar|fascias?|ridges?))\b/i, inspection: 'Moored and stable before use, with its safety equipment on board.', licence: 'Operated by a competent person holding any marine licence the state requires' },
  { item: 'Tile saw', pattern: /\b(tile saws?|tile cutters?|Cut tiles and stone|tiles? (?:are |is )?cut with a wet saw)\b/i, inspection: `${PRESTART} Blade guard in place, water feed or extraction working, leads tagged.`, licence: 'No. Operator trained' },
  { item: 'Masonry or paver saw', pattern: /\b(?:brick|block|paver|masonry|wet) saws?\b|\bsaw noise\b/i, skipIf: /\btiles?\b|\btiling\b/i, inspection: `${PRESTART} Blade guard in place, water feed or extraction working, leads tagged.`, licence: 'No. Operator trained' },
  { item: 'Dozer', pattern: /\b(dozers?|bulldozers?)\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Grader', pattern: /\bgraders?\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Loader', pattern: /\b(front end loaders?|wheel loaders?|(?<!skid steer |truck |low )loaders?)\b/i, skipIf: /\b(loader crane|vehicle loading crane)\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Scraper', pattern: /\bscrapers?\b/i, skipIf: /\b(floor scrapers?|hand scrapers?|paint scrapers?|scrapers and (?:knives|blades|wire brushes))\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Articulated dump truck', pattern: /\b(articulated dump trucks?|adts?)\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Water cart', pattern: /\bwater carts?\b/i, inspection: PRESTART, licence: 'Truck driver\'s licence for the vehicle class' },
  { item: 'Road profiler', pattern: /\b(road profilers?|cold planers?|profilers?|cold planing|(?:asphalt |road |pavement |surface )?profiling)\b/i, inspection: `${PRESTART} Drum guards and conveyor checked.`, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Stabiliser or lime spreader', pattern: /\b(stabilisers?|lime spreaders?)\b/i, skipIf: /\b(outrigger|stabiliser legs?)\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Truck mounted attenuator', pattern: /\b(truck mounted attenuators?|tmas?)\b/i, inspection: PRESTART, licence: 'Truck driver\'s licence for the vehicle class, and the operator training the road authority requires' },
  { item: 'Self-propelled modular transporter', pattern: /\b(self-?propelled modular transporters?|spmts?)\b/i, inspection: 'Checked by the supplier before the move, with its hydraulics and controls tested.', licence: 'Operated by the supplier\'s trained crew' },
  { item: 'Launching gantry', pattern: /\blaunching gantr(?:y|ies)\b/i, inspection: 'Erected, checked and commissioned by its supplier to the engineered procedure before use.', licence: 'Operated by the supplier\'s trained crew. The licence class depends on the gantry\'s design: confirm it with the supplier' },
  { item: 'Pile driving hammer', pattern: /\b(impact hammers?|vibratory hammers?|vibro hammers?|pile driv\w*|driv\w* (?:the |steel |h |sheet )?piles?)\b/i, inspection: `${PRESTART} Hammer, leads and hoses checked.`, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Rolling impact compactor and tractor', pattern: /\brolling impact compact\w*/i, inspection: `${PRESTART} Tow hitch, module and guards checked.`, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Ground improvement rig', pattern: /\b(wick drain rigs?|vibro rigs?|stone column rigs?)\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Grout pump', pattern: /\bgrout pumps?\b/i, inspection: `${PRESTART} Hoses, couplings and pressure relief checked.`, licence: 'No. Operator trained' },
  { item: 'Shotcrete rig', pattern: /\b(shotcrete rigs?|shotcrete pumps?)\b/i, inspection: `${PRESTART} Hoses, couplings and nozzle checked.`, licence: 'No. Operator trained' },
  { item: 'Roadheader', pattern: /\broadheaders?\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Dredge', pattern: /\bdredges?\b/i, inspection: 'Surveyed and maintained under its marine safety system.', licence: 'Operated by a master and crew holding the marine qualifications the vessel requires' },
  { item: 'Jack-up barge', pattern: /\bjack-?up(?: barges?)?\b/i, inspection: 'Surveyed and maintained under its marine safety system, with its legs and jacking system checked before each move.', licence: 'Operated by a master and crew holding the marine qualifications the vessel requires' },
  { item: 'Low loader', pattern: /\b(low ?loaders?|float trailers?)\b/i, inspection: PRESTART, licence: 'Heavy vehicle driver\'s licence for the combination, with road permits for oversize or overmass loads' },
  { item: 'Mulcher', pattern: /\bmulchers?\b/i, inspection: `${PRESTART} Guards, teeth and spark arrestor checked.`, licence: 'No. Operator competent' },
  { item: 'Fuel truck or trailer', pattern: /\b(fuel trucks?|fuel trailers?|refuelling trucks?)\b/i, inspection: `${PRESTART} Hoses, nozzles, earthing and spill kit checked.`, licence: 'Truck driver\'s licence for the vehicle class, and dangerous goods driver licence where the load requires it' },
  { item: 'Road rail vehicle', pattern: /\b(road rail vehicles?|rrvs?|hi-?rail)\b/i, inspection: 'Checked before going on track, as the rail manager requires.', licence: 'Operator holds the rail manager\'s competency for the vehicle' },
  { item: 'Track laying machine', pattern: /\btrack laying machines?\b/i, inspection: 'Checked before going on track, as the rail manager requires.', licence: 'Operator holds the rail manager\'s competency for the machine' },
  { item: 'Track maintenance machine', pattern: /\b(tamp\w* machines?|tampers?|ballast regulators?|track (?:maintenance )?machines?|on-?track (?:plant|machines?|machinery|equipment)|(?<!anti-)tamp(?:s|ed|ing)?)\b/i, inspection: 'Checked before going on track, as the rail manager requires.', licence: 'Operator holds the rail manager\'s competency for the machine' },
  { item: 'Crushing or screening plant', pattern: /\b((?<!concrete )crushers?|crushing (?:and screening )?plant|screening plant)\b/i, inspection: `${PRESTART} Guards, emergency stops and pull wires tested.`, licence: 'No. Operator competent' },
  { item: 'Concrete batching plant', pattern: /\bbatch(?:ing)? plants?\b/i, inspection: 'Installed and commissioned to the supplier\'s instructions, with guards, isolation points and emergency stops checked.', licence: 'No. Operator trained' },
  { item: 'Hydro demolition robot', pattern: /\bhydro[- ]?demoli\w*\b/i, inspection: `${PRESTART} Pump, hoses, dead man control and robot controls checked.`, licence: 'No. Operator trained' },
  { item: 'Wire saw', pattern: /\bwire saws?\b/i, inspection: `${PRESTART} Wire, pulleys, guards and drive checked.`, licence: 'No. Operator trained' },
  { item: 'Concrete crusher (excavator attachment)', pattern: /\b(concrete crushers?|pulveri[sz]ers?)\b/i, inspection: `${PRESTART} Jaws, pins and hoses checked.`, licence: 'No. Excavator operator competent' },
  { item: 'Pipe laying attachment', pattern: /\b(pipe laying attachments?|pipe layers?|side ?booms?)\b/i, inspection: 'Rated for the pipe, tagged and checked before use.', licence: 'No. Operator competent' },
  { item: 'Truck and dog trailer', pattern: /\btruck and dogs?(?: trailers?)?\b/i, inspection: PRESTART, licence: 'Heavy vehicle driver\'s licence for the combination' },
  { item: 'Cable drum trailer', pattern: /\b(?:cable )?drum trailers?\b/i, inspection: `${PRESTART} Drum shaft, brakes and hitch checked.`, licence: 'No. Operator trained' },
  { item: 'Variable message sign trailer', pattern: /\b(variable message (?:boards?|signs?)|vms boards?)\b/i, inspection: PRESTART, licence: 'No. Placed under the traffic management plan (TMP)' },
  { item: 'Jacking and skidding system', pattern: /\b(skid(?:ding)? (?:systems?|tracks?|beams?)|jack(?:ing)? and skid\w*)\b/i, inspection: 'Set up and checked by its supplier to the engineered procedure before the move.', licence: 'No. Operated by the supplier\'s trained crew' },
  { item: 'Concrete conveyor', pattern: /\b(concrete conveyors?|conveyor and pump|by conveyor)\b/i, inspection: `${PRESTART} Guards, belt and emergency stops checked.`, licence: 'No. Operator trained' },
  { item: 'Trolley or panel lifter', pattern: /\b(trolleys?|panel lifters?|lift trolleys?|pallet trolleys?)\b/i, skipIf: /\bglass trolleys?\b/i, inspection: 'Checked before use: wheels, brakes and handles, and loaded only to its rated load.', licence: 'No, where one is used' },
  { item: 'Ladders', pattern: /\bladders?\b/i, inspection: 'Industrial rated, at least 120 kg. Checked before each use.', licence: 'No' },
  { item: 'Electric power tools and leads', pattern: /\b(power tools?|grind(?:er|ers|ing)|drill\w*|drop saws?|circular saws?|hole saws?|power saws?|cut-off saws?|reglet saws?|masonry saws?|wet saws?|tile saws?|jackhammers?|demolition hammers?|chas(?:e|ed|er|ers|ing)|leads?|floor scrubbers?|test instruments?)\b/i, skipIf: /\b(core[- ]?drill\w*|stump grind\w*|lead paint|leads? (?:the|to|from|into)|lead(?:s)? hand)\b/i, inspection: TEST_TAG, licence: 'No' },
];

// Hazardous substances that commonly come with the work: the types, which the page offers as
// prompts for the user to add each product used (public/substance-rules.js, owner D256).
const { SUBSTANCES, CONTROL_PRODUCTS } = require('./public/substance-rules');

// Licences, tickets and training the work needs.
// Class A for friable asbestos (s 485), Class B or A for more than 10 m2 of non-friable asbestos
// (s 487), and no licence for 10 m2 or less of non-friable asbestos removed by a competent person
// trained under s 445 (s 458(2), (3)).
const ASBESTOS_REMOVALIST = 'Licensed asbestos removalist (Class A for friable asbestos, Class B or A for more than 10 m2 of non-friable asbestos) with workers holding the VET asbestos removal certification. 10 m2 or less of non-friable asbestos may be removed without a licence by a competent person trained in identifying and safely handling asbestos (WHS Reg s 445, s 458, s 460, s 485, s 487)';
const QUALIFICATIONS = [
  ['General construction induction (white card)', /./],
  ['Site specific induction', /./],
  ['Electrical work licence (electrical mechanic)', /\b(electrical work|electricians?|electrical installation|switchboards?|distribution boards?|submains?|fit[- ]off|terminat\w*|wiring|cabling|power points?|power circuits?|light switch(?:es)?|(?:install|replac|connect|fit|wir)\w* [^.]{0,30}\b(?:ceiling fans?|hardwired smoke alarms?)|(?<!clean\w* |wip\w* |dust\w* )lighting|(?:install|replac|connect|fit)\w* [^.]{0,30}\b(?:light|led) fittings?|(?:install|replac|connect|add)\w* [^.]{0,30}\b(?:circuits?|(?<!(?:roof|rainwater|siphonic|floor|stormwater|drainage|pit|gutter|sump|tank|overflow|air|duct|exhaust) )outlets?)|(?:ev|electric vehicle|car) chargers?|inverters?|(?<!clean\w* )solar(?! hot water| powered| farm piles?)|(?:pull|install|run|lay|terminat)\w* [^.]{0,20}\bcables?)\b/i],
  ['Plumbing and drainage licence', /\b(vanit(?:y|ies)|plumbing|plumber|(?<!(?:wall|ag|agricultural|subsoil|retaining) )drainage(?! (?:swales?|gravel|cells?|mats?|layers?|boards?|aggregate|sheets?|composites?|fabric|and backfill|behind))|sewer\w*(?! pump stations?)|grease traps?|trade waste|stormwater (?:lines?|pipes?|drains?)|hot water|water suppl(?:y|ies)|water mains?|gas fitting|gasfitting|gas (?:hot water|line|appliance)s?)\b/i],
  ['Refrigerant handling licence (ARC)', /\b(refrigerants?|split systems?|refrigeration|vrf|vrv|condensing units?|(?:install\w*|replac\w*|connect\w*|commission\w*|relocat\w*|remov\w*)\b[^.]{0,20}\b(?:an? |the |new )?(?:wall[- ]mounted |reverse cycle )?air ?condition\w* units?|install\w* (?:split |reverse cycle )?air ?condition\w*)\b/i],
  ['Gas work licence', /\b(?<!medical )(commercial (?:ranges?(?! ?hoods?)|cooktops?)|wok (?:burners?|stations?|ranges?)|gas (?:fitting|lines?|pipe\w*|supply|appliances?|hot water|heaters?|heating|meters?|cooktops?|ovens?|boilers?|stoves?|fires?|log fires?|barbecues?|bbqs?)|gasfitt\w*|(?:connect|relocat|disconnect)\w*[^.]{0,30}\bgas\b)\b/i],
  [ASBESTOS_REMOVALIST, /\basbestos\b/i],
  ['Confined space entry training', /\bconfined spaces?\b/i],
  ['Crystalline silica training (VET accredited or regulator approved), where the processing is high risk', /\bsilica dust\b/i],
  ['Working at heights and harness training', /\b(harness|travel restraint|fall arrest)\b/i],
  ['Traffic controller accreditation', /\btraffic (?:controllers?|control\b)/i],
  ['Security equipment installer licence (Security Providers Act 1993 (Qld))', /\b(licensed security equipment installers|installers holding any security licence)\b/i],
  ['Rescue and resuscitation (low voltage rescue and CPR), current', /\b(rescue and resuscitation|low voltage rescue)\b/i],
  ['Chainsaw operator competency', /\bchainsaws?\b/i],
  ['Commercial operator licence, where powered ground spraying of herbicide is done in a regulated area', /\b(herbicides?|weed ?(?:spray|kill)\w*)\b/i],
  ['Pest management licence and QBCC termite licence', /\b(termit\w*)\b/i],
  ['Hot work permit trained', /\bhot work\b/i],
  ['Cabling provider registration with an ACMA accredited registrar, of the type the cabling work needs', /\bregistered cabling provider\b/i],
];

// The 5 x 5 matrix from the Queensland SWMS template: likelihood 5 (almost
// certain) to 1 (rare) by consequence 1 (negligible) to 5 (catastrophic).
const MATRIX = {
  5: ['Moderate', 'Moderate', 'High', 'Extreme', 'Extreme'],
  4: ['Low', 'Moderate', 'Moderate', 'High', 'Extreme'],
  3: ['Low', 'Moderate', 'Moderate', 'Moderate', 'High'],
  2: ['Low', 'Low', 'Moderate', 'Moderate', 'High'],
  1: ['Low', 'Low', 'Low', 'Low', 'Moderate'],
};
const LIKELIHOOD = { 5: 'Almost certain', 4: 'Likely', 3: 'Possible', 2: 'Unlikely', 1: 'Rare' };
const CONSEQUENCE = { 5: 'Catastrophic', 4: 'Major', 3: 'Moderate', 2: 'Minor', 1: 'Negligible' };

// How bad the worst hazard in a step could be.
const CATASTROPHIC = /\b(energis\w*|live (?:cables?|parts?|electrical)|contact with (?:live|energi[sz]ed|exposed live)|live (?:\w+ ){0,2}(?:outputs?|boards?|switchboards?|terminals?|conductors?)|electric\w* shock|unsafe equipment|start\w* without warning|rotating parts?|entangle\w*|(?:falls?|falling) (?:from|into|through|off|down)|fall of more|from height|collapse\w*|fails? during|failure|strik\w* [^.]{0,40}\b(?:services?|cables?|gas|electrical)|hidden services|fails?|struck|falling objects?|traffic|vehicle strike|objects? fall\w*|buried|engulf\w*|electric shock|electrocut\w*|energised|struck by|strikes? a person|crush\w*|overturn\w*|rolls? over|drown\w*|asphyxi\w*|explosion|explod\w*|oxygen|toxic|tips? or falls|load falls|swings? into)\b/i;
const MAJOR = /\b(moving parts|ducts or plenums|silica|asbestos|amputat\w*|burns?|fire|hearing|isocyanates?|cancer|fumes?|vapour|hose whip|burst|kickback|impalement|chemical)\b/i;
const MODERATE = /\b(cuts?|strain\w*|back|manual|vibration|noise|dust|knee|eyes?|skin|heat|sun|flying)\b/i;
// Controls that change the hazard itself, rather than relying on people.
const ENGINEERING = /\b(edge protection|guardrails?|guards?|barricad\w*|exclusion zones?|shor\w*|bench\w*|batter\w*|extraction|wet (?:cutting|methods?)|water suppression|isolat\w*|de-?energis\w*|locked out|covers?|scaffolds?|working platforms?|elevating work platforms?|scissor lifts?|ventilat\w*|rcds?|interlock\w*|gantr\w*|trench shields?|props?|propped|certified|engineer's design|catch (?:nets?|platforms?)|fixed deck|toe ?boards?|mesh screens?|vacuum excavat\w*|pothol\w*|hand dig\w*|no one (?:is |works |stands )?(?:in|under|below)|tag lines?|platform ladders?|rated lifting points?|barriers?|separat\w* (?:the work )?from (?:passing )?traffic|landing (?:bays?|platforms?))\b/i;

// Crushed hands, fingers or feet, and strain or crush from handling, are a major injury, not a
// fatality. They are taken out before the catastrophic list is read, which would take any "crush"
// as a person crushed by plant or a load.
const HANDS_CRUSHED = /\b(?:crush\w*|pinch\w*|caught)\b[^.]{0,20}\b(?:hands?|fingers?|feet|foot|toes?)\b|\b(?:hands?|fingers?|feet|foot|toes?)\b[^.]{0,20}\b(?:crush\w*|pinch\w*|caught)\b|\bstrain(?:s|ed)? (?:or|and) crush\w*(?: injur\w*)?/gi;

function consequenceOf(hazards) {
  const text = hazards.join(' ');
  const handled = text.replace(HANDS_CRUSHED, ' hand injury ');
  if (CATASTROPHIC.test(handled)) return 5;
  if (handled !== text) return 4;
  if (MAJOR.test(text)) return 4;
  if (MODERATE.test(text)) return 3;
  // Unmatched hazards are rated moderate for the supervisor to confirm, not played down.
  return 3;
}

function rating(likelihood, consequence) {
  return { likelihood, consequence, level: MATRIX[likelihood][consequence - 1], label: `${LIKELIHOOD[likelihood]} x ${CONSEQUENCE[consequence]}` };
}

// A control that changes the hazard itself: one of the engineering words above, any elimination,
// substitution, isolation or engineering control by the ranking the steps are printed in, or a
// physical control that ranking reads as a rule: a load restrained with straps or chains, a tanker
// earthed or bonded, an emergency shut-off, the area around a test kept clear of people, or a
// circuit kept from being re-energised.
const ALSO_HIGHER = /\b(?:restrained (?:with|to|by)|load restraint|earthed or bonded|bonded|emergency shut-?offs?|prevent\w* re-?energi[sz]\w*)\b|\b(?:area|zone)s?\b[^.]{0,40}\bkept clear\b|\bwith the area clear\b/i;
const higherOrder = (line) => ENGINEERING.test(line) || ALSO_HIGHER.test(line) || HIGHER.has(controlLevel(line));

// What answers a catastrophic hazard, by its kind. A guardrail does not answer electric shock, a pipe
// lifter does not answer a fall and safety mesh does not answer a fall from the edge, so a higher order
// control counts for a catastrophic hazard only where it is of the kind that answers it. A hazard of no
// kind listed here takes any higher order control. A person's fall is told from a load or object
// falling by what falls.
const FALLING_THING = /\b(?:loads?|materials?|objects?|tools?|frames?|pipes?|lengths|fittings?|sheets?|panels?|bundles?|packs?|collectors?|tanks?|items?|equipment|debris|rocks?|stone|bricks?|it|they)\b[^.]{0,25}\bfall/i;
const PERSON_FALL = (words) => /\bfall(?:s|ing)? (?:from|into|through|off|down|between)\b|\bfall of more\b|\bfrom height\b/i.test(words) && !FALLING_THING.test(words);
const ANSWERED_BY = [
  // A fall through or into something: covers, mesh, screens, fencing or guarding at the opening.
  { hazard: (words) => PERSON_FALL(words) && /\b(?:through|into|between|gaps?)\b/i.test(words),
    control: /\b(covers?|covered|safety (?:mesh|nets?)|mesh|catch (?:nets?|platforms?)|screen\w*|fenc\w*|barricad\w*|barriers?|guard ?rails?|edge protection|handrails?|guarded|boarded|crawl boards?|(?:work(?:ing)?|step) platforms?|scaffold\w*|landing gates?)\b/i },
  // A fall from an edge, a ladder or a platform: something that stops the fall or a platform to work from.
  { hazard: (words) => PERSON_FALL(words) && !/\b(?:through|into|between|gaps?)\b/i.test(words),
    control: /\b(edge protection|guard ?rails?|handrails?|scaffold\w*|ewps?|elevating work platforms?|scissor ?lifts?|boom lifts?|(?:work(?:ing)?|step) platforms?|platform ladders?|from (?:an? |the )?(?:\w+ )?platforms?|safety nets?|catch (?:nets?|platforms?)|barriers?|landing gates?|gates? (?:stay )?closed|protected edge|travel restraint|restraint systems?|from (?:the )?(?:ground|floor)|on the ground|inside the building)\b/i },
  { hazard: (words) => /\b(energi[sz]\w*|live (?:cables?|parts?|electrical|conductors?|ups|outputs?|boards?)|electric\w* shock|electrocut\w*|arc flash)\b/i.test(words),
    control: /\b(isolat\w*|de-?energi[sz]\w*|prevent\w* re-?energi[sz]\w*|lock\w* (?:out|off)|lockout|locks?|tag(?:ged)? out|danger tags?|switch\w* off|covers?|covered|shroud\w*|insulat\w*|rcds?|residual current|safety switch|non-conductive|approach distances?|exclusion zones?|no[- ]go zones?|barriers?|guards?|enclos\w*)\b/i },
  { hazard: (words) => /\b(?:struck|strikes?|run over|hit)\b[^.]{0,40}\b(?:trucks?|plant|vehicles?|traffic|forklifts?|excavators?|machines?|machinery|sprayers?|spreaders?|rollers?|cars?)\b|\btraffic\b|\bvehicle strike\b|\bcrushed by (?:plant|a vehicle|a truck|a forklift|mobile plant)\b/i.test(words),
    control: /\b(exclusion zones?|no[- ]go zones?|barriers?|barricad\w*|separat\w*|fenc\w*|closures?|kept apart|bollards?|no one\b[^.]{0,30}\b(?:beside|in|under|near|behind|within)|walkways?|delineat\w*|wheel stops?)\b/i },
  // A load or object that falls, swings, tips or crushes: no one under or beside it, the load secured or guided.
  { hazard: (words) => FALLING_THING.test(words) || /\b(crush\w*|loads? (?:falls?|drops?|swings?|shifts?)|falling objects?|objects? fall\w*|dropped|swings? into|tips? (?:over|or falls)|topple\w*|rolls? down)\b/i.test(words),
    control: /\b(no one\b[^.]{0,30}\b(?:under|beneath|between|in|inside|beside|below|downhill)|tag lines?|exclusion zones?|drop zones?|barricad\w*|chock\w*|brac\w*|secured|restrained|tied|tethered|lanyards?|toe ?boards?|kept apart|separat\w*|guards?|catch (?:nets?|platforms?)|screens?)\b/i },
  { hazard: (words) => /\b(collapse\w*|fails?|failure|overturn\w*|rolls? over|bursts?)\b/i.test(words),
    control: /\b(props?|propp\w*|shor\w*|brac\w*|engineer\w*|design\w*|certif\w*|rated|bench\w*|batter\w*|shields?|outriggers?|guards?|exclusion zones?|no one\b[^.]{0,30}\b(?:under|beneath|between|in|inside|beside)|kept clear|clear of people|area clear|relief valves?|landing gates?)\b/i },
];

// A suggested rating before and after the step's controls. Controls are taken to lower the
// likelihood, not the consequence: rare where the hazard itself is controlled (guarding, isolation,
// edge protection), unlikely where it relies on how people work. Any line naming one of the
// engineering words above counts, as before. A higher order control by the ranking the steps are
// printed in, or one the step shares with an earlier step (shared, printed there once), also counts
// where it is of the kind that answers the step's worst hazard (ANSWERED_BY).
// strict leaves out the old rule that any engineering line counts, to tell which controls a
// rating relies on (ratedSteps).
function riskFor(step, shared = [], strict = false) {
  const consequence = consequenceOf(step.hazards || []);
  const before = consequence >= 4 ? 3 : 4;
  const higher = [...(step.controls || []), ...shared].filter(higherOrder);
  const worst = (step.hazards || []).filter((line) => (consequence === 5 ? CATASTROPHIC.test(String(line).replace(HANDS_CRUSHED, ' ')) : true));
  const answered = higher.length > 0 && worst.every((line) => {
    const kinds = ANSWERED_BY.filter((item) => item.hazard(line));
    return !kinds.length || kinds.some((item) => higher.some((control) => item.control.test(control)));
  });
  const engineered = (!strict && (step.controls || []).some((line) => ENGINEERING.test(line))) || answered;
  const after = engineered ? 1 : 2;
  return { before: rating(before, consequence), after: rating(Math.min(after, before), consequence) };
}

// Every step is rated, Before starting included: a reviewer marks a step with no rating (review
// checklist item 6). A control printed once in an earlier step and shared with this one counts for
// this step's rating while the earlier step still prints it. Where the rating relies on it, the
// step names that earlier step (seeAlso), so the reader finds the control.
const lineKey = (line) => String(line).replace(/\s*\([^)]*\)\s*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function ratedSteps(steps) {
  const printed = new Map();
  for (const step of steps) for (const line of step.controls || []) if (!printed.has(lineKey(line))) printed.set(lineKey(line), step.step);
  return steps.map(({ seeAlso: _seeAlso, ...step }) => {
    const shared = (step.sharedControls || []).filter((item) => printed.has(lineKey(item.text)) && printed.get(lineKey(item.text)) !== step.step);
    if (!shared.length) return { ...step, risk: riskFor(step) };
    const risk = riskFor(step, shared.map((item) => item.text));
    // The step names the earlier steps whose lines answer a hazard its own lines do not.
    const own = riskFor(step, [], true).after.likelihood;
    if (riskFor(step, shared.map((item) => item.text), true).after.likelihood === own) return { ...step, risk };
    const names = [...new Set(shared.map((item) => printed.get(lineKey(item.text))))];
    const needed = names.filter((name) => riskFor(step, shared.filter((item) => printed.get(lineKey(item.text)) === name).map((item) => item.text), true).after.likelihood !== own);
    return { ...step, risk, seeAlso: needed.length ? needed : names };
  });
}

// Plant operated or erected by others: the licence belongs to them.
function othersLicence(item, allText, task, ownCrane = false, chart = '') {
  const out = othersLicenceOf(item, allText, task, ownCrane, chart);
  // Plant that may or may not be used stays that way, whoever holds its licence (messy round 4: a
  // scaffold named only as one way to reach a window was ticked as used).
  return WHERE_USED.test(item.licence) && !WHERE_USED.test(out.licence) ? { ...out, licence: whereUsed(out.licence) } : out;
}
function othersLicenceOf(item, allText, task, ownCrane, chart = '') {
  if (item.item === 'Mobile crane or crane truck') item = craneClass(item, task, chart);
  // Tube and coupler scaffolds need intermediate scaffolding, hung and suspended scaffolds advanced.
  // The scaffold type answered sets the class too (the line SiteWrite writes for it).
  const typed = (allText.match(/\bThis scaffold is (modular|tube and coupler|hung|a mobile tower)\b/) || [])[1];
  if (item.item === 'Scaffold' && typed === 'hung') item = { ...item, licence: item.licence.replace('SB, SI or SA', 'SA') };
  else if (item.item === 'Scaffold' && typed === 'tube and coupler') item = { ...item, licence: item.licence.replace('SB, SI or SA', 'SI or SA') };
  else if (item.item === 'Scaffold' && typed) item = { ...item, licence: item.licence.replace('SB, SI or SA', 'SB or higher') };
  else if (item.item === 'Scaffold' && /\b(hung|suspended) scaffold/i.test(task)) item = { ...item, licence: item.licence.replace('SB, SI or SA', 'SA') };
  else if (item.item === 'Scaffold' && /\btube[- ]and[- ]coupler\b|\bcantilever\w* (?:scaffold|crane loading platform)|\bspur scaffold/i.test(task)) item = { ...item, licence: item.licence.replace('SB, SI or SA', 'SI or SA') };
  // Where our company runs the crane, its operator holds the licence (messy round 4, B fault 3).
  // Our company's own crane has no crane company's log book: the vehicle loading crane's library line
  // "Pre-start check and log book." is used in its place.
  if (/crane/i.test(item.item) && ownCrane && /^Crane company's log book and pre-start check\. /.test(item.inspection || '')) item = { ...item, inspection: item.inspection.replace(/^Crane company's log book and pre-start check\. /, 'Pre-start check and log book. ') };
  if (/crane/i.test(item.item) && /\bcrane company\b/i.test(allText) && !ownCrane) return { ...item, licence: `Held by the crane company's operator and crew: ${item.licence.replace(/^Yes,?\s*/, '')}` };
  if (item.item === 'Scaffold' && !/\b(erect\w*|dismantl\w*|alter\w*|build(?!ing\b)\w*|install\w*|put up)\b(?:(?!\b(?:from|off|using|with|on)\b)[^.]){0,40}\bscaffold|\bscaffold\w*\b[^.]{0,20}\b(erect\w*|dismantl\w*)/i.test(task)) return { ...item, licence: `Erected and altered only by a licensed scaffolder (${item.licence.match(/\(([^()]*S[BIA][^()]*)\)/)[1]}) where a fall of more than 4 m is possible. Our crew uses it and does not alter it` };
  if (/Personnel or materials hoist/.test(item.item) && !/\b(erect\w*|install\w*|operat\w*|dismantl\w*)\b[^.]{0,30}\bhoists?\b/i.test(task)) return { ...item, licence: `Held by the principal contractor's licensed hoist operator: ${item.licence.replace(/^Yes,?\s*/, '')}` };
  if (item.item === 'Concrete placing boom' && !/\b(we|our crew|our own)\b[^.]{0,30}\b(operat\w*|run\w*)\b[^.]{0,20}\b(pump|boom)/i.test(allText)) return { ...item, licence: `Held by the pumping company's licensed operator: ${item.licence.replace(/^Yes,?\s*/, '')}` };
  return item;
}

// The crane named in the task sets the licence class (WHS Reg schedule 3): a Franna or
// other articulated crane is non-slewing, and a stated capacity sets the slewing class.
function craneClass(item, task, chart = '') {
  const sized = String(task || '').match(/\b(\d+(?:\.\d+)?) ?(?:t|tonnes?)\b\s+(?:\w+\s+)?(?:(crawler|mobile|slewing|all terrain|truck) )?cranes?\b/i);
  const crawler = /\bcrawler cranes?\b/i.test(task);
  const name = crawler ? 'Crawler crane' : 'Mobile crane';
  const crew = ', with licensed doggers or riggers';
  // A Franna or other pick and carry crane is non-slewing whatever its capacity (WHS Reg schedule 3).
  if (/\b(frannas?|pick and carry|articulated (?:mobile )?cranes?|non-slewing)\b/i.test(task) && !crawler && !/\b(slewing|all terrain|tower) cranes?\b/i.test(task.replace(/\bnon-slewing\b/gi, ' '))) return { ...item, item: sized ? `Non-slewing mobile crane (${sized[1]} t)` : 'Non-slewing mobile crane (Franna or pick and carry)', licence: `Yes, non-slewing mobile crane (CN)${crew}` };
  if (sized) {
    const t = Number(sized[1]);
    const cls = t > 100 ? 'over 100 t (C0)' : t > 60 ? 'up to 100 t (C1)' : t > 20 ? 'up to 60 t (C6)' : 'up to 20 t (C2)';
    return { ...item, item: `${name} (${sized[1]} t)`, licence: `Yes, slewing mobile crane ${cls}${crew}` };
  }
  if (/\b(frannas?|pick and carry|articulated (?:mobile )?cranes?|non-slewing)\b/i.test(task) && !crawler && !/\b(mobile|slewing|all terrain|tower) cranes?\b/i.test(task)) return { ...item, item: 'Non-slewing mobile crane (Franna or pick and carry)', licence: `Yes, non-slewing mobile crane (CN)${crew}` };
  if (crawler) return { ...item, item: 'Crawler crane', licence: `Yes, slewing mobile crane class for its capacity (C2 up to 20 t, C6 up to 60 t, C1 up to 100 t, C0 over 100 t)${crew}` };
  // A rated capacity the user read from the crane chart ("50t at 20m") is what the crane lifts at that
  // radius, so its maximum is at least that: the class is at least the one for that load, or higher for
  // the crane's maximum (messy round 5: "crane class to suit" with a 50 t chart).
  const charted = String(chart || '').match(/\b(\d+(?:\.\d+)?) ?(?:t|tonnes?)\b[^.\n]{0,20}?\b(?:at|@)\s*\d/i);
  if (charted && !/\b(frannas?|pick and carry|non-slewing|vehicle loading|hiab|truck loading)\b/i.test(task)) {
    const t = Number(charted[1]);
    const least = t > 100 ? 'C0' : t > 60 ? 'at least C1 (C0 over 100 t)' : t > 20 ? 'at least C6 (C1 over 60 t, C0 over 100 t)' : 'at least C2 (C6 over 20 t, C1 over 60 t, C0 over 100 t)';
    return { ...item, licence: `Yes, slewing mobile crane ${least}, for the crane's maximum rated capacity${crew}` };
  }
  return item;
}

// Work the task says others do, such as "connected by a licensed electrician",
// or fittings the crew works around, is not this crew's licence or Act.
function ownWork(text) {
  return text
    .split(/(?<=[.;\n])\s*/)
    .filter((sentence) => !/\b(?:by|from) (?:a |the )?(?:licensed |registered |qualified )?(?:electricians?|plumbers?|gasfitters?|gas fitters?|others|the builder|the principal contractor|the electrical contractor|the plumbing contractor)\b/i.test(sentence))
    .join(' ')
    .replace(/\b(?:around|near|between|up to|clear of|over)\b[^.]{0,40}\b(?:electrical|plumbing|gas) (?:fittings?|fixtures?|outlets?|services?|points?)\b/gi, '');
}

// Another trade's work named only as where this crew works or what it supports: painting around plumbing
// fittings, baffles near switchboards, steel for ceiling fans (messy round 4: electrician and plumbing
// lines in painting, steel and fire services SWMS). It is not this crew's electrical or plumbing work.
const OTHER_TRADES_NEAR = /\b(?:around|near|beside|next to|adjacent to|close to|clear of|mask\w*|protect\w*|cut in)\b[^.]*|\b(?:steel(?:work)?|brackets?|supports?|framing|noggins?|baffles?|plates?|hangers?|bunding)\b[^.]{0,30}\bfor\b[^.]*/gi;
function withoutOtherTrades(text) {
  return String(text || '').replace(OTHER_TRADES_NEAR, '');
}

// Silica training is for processing silica (cutting, grinding, drilling, breaking it with tools or plant),
// named in the same hazard line, not for dust from stockpiles, loads or ballast (messy round 5: training
// listed for digging clay, and missing for saw cutting joints).
const SILICA_PROCESS = /\b(cut\w*|saw\w*|grind\w*|drill\w*|cor(?:e|es|ing)|chas(?:e|es|ing)|break\w*|broken|crush\w*|scabbl\w*|polish\w*|sand(?:s|ing|er|ers)|rout\w*|jackhammer\w*|demoli\w*|blast\w*|mill\w*|profil\w*|planing|machin\w*|fabricat\w*|process\w*)\b/i;

// Rail track plant, and the words that show rail track work.
const RAIL_PLANT = new Set(['Road rail vehicle', 'Track laying machine', 'Track maintenance machine']);
const RAIL_WORK = /\b(railways?|railroads?|rail (?:lines?|tracks?|corridors?|networks?|possessions?|infrastructure)|light rail|heavy rail|track (?:laying|work|maintenance|possessions?|machines?|renewals?)|ballast|sleepers?|turnouts?|tamp\w*|road rail vehicles?|hi-?rail)\b/i;
// A scope row's conditions note, as public/scope-task.js writes it: "(where; conditions: ...; plant: ...)".
function withoutConditions(text) {
  return String(text || '').replace(/\bconditions: [^;)\n]*(?:;\s*)?/gi, ' ');
}

function plantFor(text) {
  const found = [];
  for (const entry of PLANT) {
    if (!entry.pattern.test(text)) continue;
    // A skip applies to the words around the match, such as paint rollers or vinyl seam welding.
    // A skip applies to each match on its own: the item is kept if any match is real use.
    const global = new RegExp(entry.pattern.source, entry.pattern.flags.includes('g') ? entry.pattern.flags : `${entry.pattern.flags}g`);
    if (entry.skipIf && [...text.matchAll(global)].every((match) => entry.skipIf.test(text.slice(Math.max(0, match.index - 20), match.index + match[0].length + 20)))) continue;
    if (entry.item === 'Scaffold' && !/\bscaffold/i.test(text.replace(/\bmobile scaffold\w*/gi, ''))) continue;
    if (entry.item === 'Elevating work platform' && found.some((item) => /elevating work platform|Scissor lift/.test(item.item))) continue;
    // An LPG torch for torch-on membrane is not an oxy-acetylene set (messy round 4).
    if (entry.item === 'Oxy-acetylene or gas torch set' && !/\b(oxy\w*|acetylene|brazing|gas cutting|cutting torch\w*|weld\w*)\b/i.test(text) && /\b(lpg|propane|torch-on|torch on|torching)\b/i.test(text)) {
      found.push({ item: 'LPG gas torch', inspection: entry.inspection, licence: entry.licence });
      continue;
    }
    found.push({ item: entry.item, inspection: entry.inspection, licence: entry.licence });
  }
  return found;
}

function substancesFor(text, safetyDataSheet, controlText = '') {
  const found = SUBSTANCES.filter(([product, pattern]) => pattern.test(text) || (CONTROL_PRODUCTS[product] && CONTROL_PRODUCTS[product].test(controlText))).map(([product]) => ({ product, sds: '', quantity: '' }));
  return { items: found, note: safetyDataSheet || '' };
}

// Trade licences come from the task itself, not from controls that mention other
// trades' work. Training for a hazard comes from the hazards in the steps.
const TASK_LICENCES = /^(Gas work licence|Electrical work licence|Plumbing and drainage licence|Refrigerant handling|Licensed asbestos|Pest management|Traffic controller|Chainsaw|Commercial operator)/;

// A control line without the source printed after it: a citation to the silica code is not silica work.
const withoutSource = (line) => String(line).replace(/\s*\((?:[^()]|\([^()]*\))*\)$/, '');

function qualificationsFor(taskText, hazardText, allText, plant, highRisk = [], silicaText = hazardText) {
  const needed = QUALIFICATIONS.filter(([name, pattern]) => {
    // Entry training is for work that enters the space, not work kept at its opening.
    if (/^Confined space/.test(name)) return highRisk.some((item) => /confined space/i.test(item)) && !/\bis not entered\b/i.test(allText);
    if (/harness/.test(name)) return /\b(use (?:a )?(?:harness|travel restraint)|fall arrest is used|harness is attached|travel restraint is installed)\b/i.test(allText.replace(/\b(?:where|if|when)\b[^.]*/gi, ""));
    // Work done around another trade's fittings ("mask and cut in around electrical fittings") is not that trade's work.
    // Data, fibre and communications cabling is not electrical work.
    return pattern.test(TASK_LICENCES.test(name) ? withoutOtherTrades(ownWork(taskText)).replace(/\bfit[- ]off (?:of )?(?:the )?(?:plumbing|sanitary|drainage|hydraulic)\b|\b(?:plumbing|sanitary|drainage|hydraulic)\b[^.]{0,20}\bfit[- ]off\b/gi, '').replace(/\b(?:fibre optic|optical fibre|data|communications?|comms|cat ?6a?|structured|telephone|ip)\s+(?:cabling|cables?)(?:\s+and\s+terminations?)?/gi, '') : /silica/.test(name) ? silicaText : /Hot work/.test(name) ? hazardText : allText);
  }).map(([name]) => name);
  if (highRisk.some((item) => /energised electrical/i.test(item)) && !needed.some((name) => /^Rescue/.test(name))) needed.push('Rescue and resuscitation (low voltage rescue and CPR), current');
  // A step that connects a gas appliance is gas work, whatever the task calls the appliance (ducted heating).
  if (/\nConnect, leak test and commission the gas appliance\n/.test(`\n${allText}\n`) && !needed.some((name) => /^Gas work licence/.test(name))) needed.push('Gas work licence');
  for (const item of plant) {
    if (item.item === 'Mobile scaffold') needed.push('Scaffolding licence (SB), only where a person or object could fall more than 4 m from the mobile scaffold');
    if (/^Yes/.test(item.licence)) needed.push(`High risk work licence: ${item.item.toLowerCase()} (${item.licence.split('. ')[0].replace(/^Yes,?\s*/, '').replace(/^\(([^()]*)\)(.*)$/, '$1$2')})`);
  }
  if (/\bWhere the grandstand is built from scaffolding\b/.test(allText)) needed.push('Scaffolding licence (SB, or SI or SA as the scaffold needs), where the grandstand is built from scaffolding and a person or object could fall more than 4 m');
  if (/\bGantries and covered ways in tube and coupler are erected by licensed intermediate scaffolders\b/.test(allText)) needed.push('Scaffolding licence (SI or SA), for gantries and covered ways in tube and coupler');
  if (/\bby workers holding the fire protection licence or accreditation the state requires\b/.test(allText)) needed.push('Fire protection licence or accreditation, as the state requires');
  if (/\bTraffic controllers who hold\b|\bholding a traffic control work training card\b/.test(allText) && !needed.some((name) => /^Traffic controller/.test(name))) needed.push('Traffic controller accreditation, for anyone on our crew who directs traffic');
  // Dogging or rigging by this crew; where the crane company's crew slings, it holds the licences.
  if (/\b(our (?:licensed )?(?:riggers?|doggers?|dogman)|we sling|our crew slings|rigging work|dogging|slung by licensed (?:doggers|riggers))\b/i.test(allText) || /\b(rigg\w*|dogg\w*|sling\w*)\b/i.test(taskText) || /\nErect and connect steel at height\n/.test(`\n${allText}\n`)) needed.push(/\n(?:Erect and connect steel at height|Lift and land steel with the crane company)\n/.test(`\n${allText}\n`) ? 'High risk work licence: basic rigging (RB) or higher, for structural steel erection' : /\bhoist\w* is rigging work\b/i.test(allText) ? 'High risk work licence: basic rigging (RB) or higher, for setting up the hoist (intermediate rigging (RI) for hoists with jibs and self-climbing hoists)' : 'High risk work licence: dogging or rigging (DG, RB, RI or RA)');
  // Precast members need basic rigging, and tilt slabs intermediate rigging (WHS Reg schedule 3 items 5 and 6).
  const ownRigging = !/\bcrane company\b/i.test(allText) || /\b(our (?:licensed )?riggers?|slung by licensed (?:doggers or )?riggers)\b/i.test(allText);
  if (/\nLand and fix the precast floor units\n/.test(`\n${allText}\n`) && ownRigging) { for (let i = needed.length - 1; i >= 0; i -= 1) if (/^High risk work licence: dogging or rigging/.test(needed[i])) needed.splice(i, 1); if (!needed.some((name) => /rigging \(R[BIA]\)/.test(name))) needed.push('High risk work licence: basic rigging (RB) or higher, for precast concrete members'); }
  if (/\btilt-?up\b/i.test(taskText) && /\nStand and brace the precast elements\n/.test(`\n${allText}\n`)) { for (let i = needed.length - 1; i >= 0; i -= 1) if (/^High risk work licence: (?:dogging or rigging|basic rigging)/.test(needed[i])) needed.splice(i, 1); needed.push('High risk work licence: intermediate rigging (RI) or higher, for rigging tilt slabs'); }
  // Erecting, climbing or dismantling a crane is rigging work on a crane: intermediate rigging
  // (WHS Reg schedule 3 item 6(c)), which basic rigging leaves out (item 5).
  if (/\nErect or dismantle the tower crane\n/.test(`\n${allText}\n`)) { for (let i = needed.length - 1; i >= 0; i -= 1) if (/^High risk work licence: (?:basic rigging|dogging or rigging)/.test(needed[i])) needed.splice(i, 1); needed.push('High risk work licence: intermediate rigging (RI) or advanced rigging (RA), for erecting, climbing or dismantling the crane, and dogging (DG) or higher for slinging'); }
  // Perimeter safety screens and shutters are basic rigging work (WHS Reg schedule 3).
  if (/\n(?:Erect|Lift|Dismantle) the safety screens\b/.test(`\n${allText}\n`)) { for (let i = needed.length - 1; i >= 0; i -= 1) if (/^High risk work licence: dogging or rigging/.test(needed[i])) needed.splice(i, 1); if (!needed.some((name) => /rigging \(R[BIA]\)/.test(name))) needed.push('High risk work licence: basic rigging (RB) or higher, for perimeter safety screens and shutters'); }
  // Dual lifts need at least intermediate rigging (WHS Reg schedule 3).
  if (/\nCarry out the dual lift\n/.test(`\n${allText}\n`)) { for (let i = needed.length - 1; i >= 0; i -= 1) if (/^High risk work licence: (?:basic rigging|dogging or rigging)/.test(needed[i])) needed.splice(i, 1); needed.push('High risk work licence: intermediate rigging (RI) or higher, for the dual lift'); }
  return [...new Set(needed)];
}

function emergencyFor(text, input, highRisk, plant = [], coreText = text) {
  const ewp = plant.some((item) => /elevating work platform|Scissor lift/.test(item.item));
  const rows = [];
  rows.push({ type: 'Emergency', equipment: 'Call 000. Site emergency procedure and muster point', detail: input.musterPoint || '' });
  rows.push({ type: 'Fire', equipment: /\b(hot work|weld\w*|torch\w*|brazing|grinding|oxy|lpg|electric\w*)\b/i.test(text) ? 'Fire extinguisher suited to the hazard (dry powder or CO2 near electrical equipment)' : 'Fire extinguisher', detail: '' });
  rows.push({ type: 'Injury', equipment: `First aid kit${input.firstAider ? `. First aider: ${input.firstAider}` : '. First aider: ____'}`, detail: input.hospital ? `Nearest hospital: ${input.hospital}` : '' });
  if (highRisk.some((item) => /falling more than/i.test(item)) || /\b(harness|elevating work platforms?|ewps?|boom lifts?)\b/i.test(text)) {
    rows.push({ type: 'Work at height', equipment: ewp ? 'Rescue plan for a person stuck or suspended at height, including the EWP\'s ground controls and rescue equipment' : 'Rescue plan for a person who falls or is injured at height, including from an edge, opening or scaffold, and for a person suspended in a harness where harnesses are used', detail: '' });
  }
  // Power lines named in the task or a hazard, not the general check-for-lines control.
  // Power lines named in the task or the answers, or in a hazard where the user has not said there are no
  // live services near the work (messy round 5: the row printed with live services "none").
  const live = String((input.site && input.site.liveServices) || '');
  const noLive = /^\s*(?:none|no|nil|n\/?a|not applicable|no live services?\b[^.]*|there are none\b[^.]*)\.?\s*$/i.test(live);
  const LINE_WORDS = /\b(?:overhead |power |electric )(?:power |electric )?lines?\b/i;
  if (LINE_WORDS.test(`${input.task || ''}\n${live}`) || (LINE_WORDS.test(coreText) && !noLive)) rows.push({ type: 'Contact with power lines', equipment: 'Keep everyone well clear of a person, plant or load in contact with a line. Call 000 and the network operator. The operator stays in the plant unless there is fire', detail: '' });
  if (highRisk.some((item) => /energised electrical/i.test(item)) || /\b(energised parts?|live cables?|energised cables?|live electrical parts?|live parts|partly energised)\b/i.test(text)) rows.push({ type: 'Electric shock or arc flash', equipment: 'Isolate the supply before touching the person. Low voltage rescue kit, CPR and defibrillator (AED), burns first aid', detail: '' });
  if (highRisk.some((item) => /trench|shaft/i.test(item))) rows.push({ type: 'Trench', equipment: 'Rescue plan for a trench collapse (Excavation work Code of Practice s 3.8). No one enters an unsupported trench to rescue', detail: '' });
  if (highRisk.some((item) => /drowning/i.test(item))) rows.push({ type: 'Person in the water', equipment: 'Raise the alarm and reach with the rescue pole or throw the life ring. No one enters the water to rescue unless trained and equipped. Call 000', detail: '' });
  if (highRisk.some((item) => /confined space/i.test(item))) rows.push({ type: 'Confined space', equipment: 'Rescue plan and equipment, started from outside the space', detail: '' });
  if (/\bstrik\w* [^.]{0,40}\b(?:underground|buried|hidden)?\s?(?:services?|cables?|gas|electrical)/i.test(text) && !rows.some((row) => /Electric shock/.test(row.type))) rows.push({ type: 'Service strike', equipment: 'Stop work and keep everyone clear. Electrical: do not touch the person or plant until the supply is isolated; CPR and defibrillator (AED). Gas: evacuate upwind, no ignition sources. Call 000 and the asset owner', detail: '' });
  else if (/\bstrik\w* [^.]{0,40}\b(?:services?|gas)/i.test(text)) rows.push({ type: 'Service strike', equipment: 'Stop work and keep everyone clear. Electrical cable: as for electric shock above. Gas: evacuate upwind, no ignition sources. Call 000 and the asset owner', detail: '' });
  if (/\b(gas work|gas fitting|gasfitt\w*|gas appliances?|gas (?:lines?|supply|hot water)|lpg)\b/i.test(text)) rows.push({ type: 'Gas leak', equipment: 'Turn off the gas at the meter or cylinder, no ignition sources, ventilate, keep people away. Call 000 for a major leak', detail: '' });
  if (/\brefrigerants?\b/i.test(text)) rows.push({ type: 'Refrigerant release', equipment: 'Ventilate and leave the area. Frostbite (cold burn): flush with lukewarm water and get medical help', detail: '' });
  if (/\b(chainsaws?|angle grinders?|cut-off saws?)\b/i.test(text)) rows.push({ type: 'Severe bleeding', equipment: 'Trauma first aid kit with pressure bandages, close to the work', detail: '' });
  // Chemicals named in the work, unless every product type SiteWrite suggested is ticked "Not required" and
  // none is listed (messy round 5: "Chemical splash" with every product not required).
  const listedProducts = Array.isArray(input.substances) && input.substances.some((row) => row && String(row.product || '').trim());
  const allNotRequired = Array.isArray(input.substancesNotUsed) && input.substancesNotUsed.length > 0 && !listedProducts && !/\b(acid|solvents?|epoxy|chemicals?)\b/i.test(String(input.task || ''));
  if (/\b(chemicals?|solvents?|cement|epoxy|acid)\b/i.test(text) && !allNotRequired) rows.push({ type: 'Chemical splash', equipment: 'Eye wash and running water, and the safety data sheets', detail: '' });
  return rows;
}

// The legislation and codes cited in the steps and controls, grouped.
function legislationFor(lines) {
  const sources = new Set();
  for (const line of lines) {
    const match = /\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/.exec(line);
    if (!match) continue;
    for (const part of match[1].split(/;\s*/)) {
      const title = part.replace(/\s+(?:s|ss|r|rr|reg|regs|schedule|appendix|part|chapter|table|section|para)\s.*$/i, '').trim();
      if (/\b(Act|Regulation|Regulations|Code|Rules|standard|Council)\b/i.test(title)) sources.add(title);
    }
  }
  const all = [...sources].sort();
  return {
    legislation: all.filter((title) => !/\b(Code|standard|Council)\b/i.test(title)),
    codes: all.filter((title) => /\b(Code|standard|Council)\b/i.test(title)),
  };
}

// Queensland codes and Acts that apply because of the work itself, whether or
// not a step cites them.
const QLD_SOURCES = [
  [(d) => d.highRisk.some((item) => /falling more than/i.test(item)), 'Managing the risk of falls at workplaces Code of Practice 2021 (Qld)'],
  [(d) => d.highRisk.some((item) => /trench|shaft/i.test(item)) || d.plant.some((p) => /Excavator|Trench shield/.test(p.item)), 'Excavation work Code of Practice 2021 (Qld)'],
  [(d) => d.plant.some((p) => /Concrete (?:placing boom|line pump)/.test(p.item)), 'Concrete pumping Code of Practice 2019 (Qld)'],
  [(d) => d.plant.some((p) => !/Ladders|Electric power tools/.test(p.item)), 'Managing risks of plant in the workplace Code of Practice 2021 (Qld)'],
  [(d) => d.hazardText.match(/\b(strain|manual|lifting|carry\w*|kneel\w*|repetit\w*|awkward)\b/i), 'Hazardous manual tasks Code of Practice 2021 (Qld)'],
  [(d) => d.hazardText.match(/\bnoise\b/i), 'Managing noise and preventing hearing loss at work Code of Practice 2021 (Qld)'],
  [(d) => d.substances.items.length, 'Managing risks of hazardous chemicals in the workplace Code of Practice 2021 (Qld)'],
  [(d) => d.hazardText.match(/\bsilica\b/i), 'Managing respirable crystalline silica dust exposure in construction and manufacturing of construction elements Code of Practice 2022 (Qld)'],
  [(d) => d.highRisk.some((item) => /confined space/i.test(item)), 'Confined spaces Code of Practice 2021 (Qld)'],
  [(d) => d.plant.some((p) => /Scaffold/.test(p.item)), 'Scaffolding Code of Practice 2021 (Qld)'],
  [(d) => d.highRisk.some((item) => /traffic corridor/i.test(item)), 'Traffic management for construction or maintenance work Code of Practice 2008 (Qld)'],
  [(d) => d.plant.some((p) => /^Welder|Oxy-acetylene/.test(p.item)), 'Welding processes Code of Practice 2021 (Qld)'],
  [(d) => d.highRisk.some((item) => /energised electrical/i.test(item)) || /\b(electrical work|electricians?|switchboards?|wiring)\b/i.test(ownWork(d.text)), 'Electrical Safety Code of Practice 2021: Managing electrical risks in the workplace (Qld)'],
];

function addQldSources(sources, d) {
  const codes = new Set(sources.codes);
  for (const [applies, title] of QLD_SOURCES) if (applies(d)) codes.add(title);
  const legislation = new Set(['Work Health and Safety Act 2011 (Qld)', ...sources.legislation]);
  // The crew's own electrical work, from the task and the step names, not a hazard line about nearby circuits.
  if (/\b(electrical work|electricians?|energised|switchboards?|wiring)\b/i.test(ownWork(d.workText || d.text))) legislation.add('Electrical Safety Act 2002 (Qld)');
  return { legislation: [...legislation].sort(), codes: [...codes].sort() };
}

// Each state's work health and safety Act. The regulations are the state's instrument.
const STATE_ACTS = [
  [/New South Wales/, 'Work Health and Safety Act 2011 (NSW)', 'Work Health and Safety Regulation 2025 (NSW)'],
  [/Victoria/, 'Occupational Health and Safety Act 2004 (Vic)', 'Occupational Health and Safety Regulations 2017 (Vic)'],
  [/South Australia/, 'Work Health and Safety Act 2012 (SA)', 'Work Health and Safety Regulations 2012 (SA)'],
  [/Western Australia/, 'Work Health and Safety Act 2020 (WA)', 'Work Health and Safety (General) Regulations 2022 (WA)'],
  [/Tasmania/, 'Work Health and Safety Act 2012 (Tas)', 'Work Health and Safety Regulations 2022 (Tas)'],
  [/Australian Capital Territory/, 'Work Health and Safety Act 2011 (ACT)', 'Work Health and Safety Regulation 2011 (ACT)'],
  [/Northern Territory/, 'Work Health and Safety (National Uniform Legislation) Act 2011 (NT)', 'Work Health and Safety (National Uniform Legislation) Regulations 2011 (NT)'],
];

function addStateLaw(sources, stateName) {
  const found = STATE_ACTS.find(([name]) => name.test(stateName || ''));
  if (!found) return sources;
  return { ...sources, legislation: [...new Set([found[1], found[2], ...sources.legislation])].sort() };
}

// Licences named for the state: Queensland's gas work licence is under its own Act.
// Water mains for a subdivision are the water utility's network, not plumbing on a property.
function withoutNetworkPlumbing(task, list) {
  // Trunk and large mains, treatment plants and mine process water are utility or process plant, not plumbing.
  if (/\b(trunk (?:sewers?|mains?)|\d{3,4} ?mm (?:water |sewer |trunk )?mains?|sewage treatment plants?|wastewater treatment plants?|tailings|mine sites?|quarr(?:y|ies))\b/i.test(task)) return list.filter((name) => !/^Plumbing/.test(name));
  if (!(/\b(water reticulation|reticulation mains?|water mains?|sewer reticulation|sewer rising mains?|rising mains?|stormwater (?:pipes?|drains?|mains?|pits?))\b/i.test(task) && /\b(subdivisions?|estates?|networks?|utility|roads?)\b/i.test(task) && !/\b(?:house|home|lot|property) (?:services?|connections?)\b/i.test(task))) return list;
  return list.filter((name) => !/^Plumbing/.test(name));
}

// Comms room and UPS work, where the user is asked whether our crew connects it to mains power (D298),
// and the words that say it does (wiring the UPS, new circuits, submains), which need no question.
const MAINS_SAID = /\bwir(?:e|es|ed|ing)\b[^.]{0,40}\b(?:UPS|mains|circuits?|distribution boards?|switchboards?)\b|\bconnect\w*\b[^.]{0,30}\b(?:to (?:the )?mains|mains power)\b|\b(?:new|install\w*|run\w*|add\w*) (?:power |final |dedicated )?(?:sub-?)?circuits?\b|\bsubmains?\b|\bfrom the (?:main )?(?:distribution board|switchboard)\b/i;
// UPS work ("UPS" in capitals only, so "clean-ups" and "set ups" are not read as one), and comms room
// work that fits out the room (racks, cabinets, power), not cabling that only starts or ends there.
const commsOrUps = (text) => {
  const words = String(text || '');
  if (/\bUPS\b/.test(words) || /\buninterruptible power\b|\bups (?:units?|systems?|batter\w*)\b/i.test(words)) return true;
  return /\b(?:comms|communications) rooms?\b/i.test(words) && /\b(?:racks?|cabinets?|backboards?|equipment|power|batter(?:y|ies))\b/i.test(words);
};
function mainsWork(task, facts) {
  if (!commsOrUps(task)) return false;
  return MAINS_SAID.test(String(task || '')) || /^\s*yes\b/i.test(String((facts && facts.mainsConnection) || ''));
}

// Testing and tagging, and data or communications cabling, are not electrical work.
function withoutElectricalLicence(task, list) {
  const electrical = /\b(power|electrical (?:work|installation|circuits?)|lights?|lighting|switchboards?|circuits?|gpos?|power points?|wiring|rewir\w*)\b/i.test(String(task).replace(/\btest\w* and tag\w*[^.]*/gi, ''));
  const testTag = /\btest\w* and tag\w*\b/i.test(task);
  const ict = /\b(data|network|comms|communications|cat ?6a?|fibre|nbn|telephone|structured cabling)\b/i.test(task);
  if (electrical || !(testTag || ict)) return list;
  return list.filter((name) => !/^Electrical (?:work )?licence/.test(name));
}

function localLicences(stateName, trade, list, stepText) {
  const named = tradeLicences(trade, list, stepText);
  const gasWorkOnly = named.includes('Gas work licence') && !/\b(water|drain\w*|sewer\w*|waste|plumb\w*|fixtures?|backflow|risers?|pipework at height)\b/i.test(stepText.replace(/Electrical work is done[^\n]*/g, ''));
  // Gas work alone is licensed as gas work, except in Victoria where gasfitting is a plumbing class.
  if (/Queensland/.test(stateName || '')) {
    // In Queensland gas work is licensed under its own Act, so gas work alone needs no plumbing licence.
    const gasOnly = named.includes('Gas work licence') && !/\b(water|drain\w*|sewer\w*|waste|plumb\w*|fixtures?|backflow|risers?|pipework at height)\b/i.test(stepText.replace(/Electrical work is done[^\n]*/g, ''));
    return named.filter((name) => !(gasOnly && name === 'Plumbing and drainage licence')).map((name) => (name === 'Gas work licence' ? 'Gas work licence (Petroleum and Gas (Production and Safety) Act 2004 (Qld))' : name));
  }
  // Licence names outside Queensland: the state's own class names are not yet checked, so they are named generally.
  const local = { 'Security equipment installer licence (Security Providers Act 1993 (Qld))': 'Security licence or registration for installing security equipment, under the state\'s security industry law', 'Gas work licence': 'Gas work licence or authorisation for the gas work', 'Electrical work licence (electrical mechanic)': 'Electrical licence (licensed electrician) under the state\'s electrical licensing law', 'Plumbing and drainage licence': 'Plumbing licence or registration under the state\'s plumbing law', 'Pest management licence and QBCC termite licence': 'Pest management licence, and any termite management licence the state requires', 'Commercial operator licence, where powered ground spraying of herbicide is done in a regulated area': 'Chemical application licence, where the state requires one for herbicide spraying' };
  // Victoria has its own crystalline silica rules, not the model regulations' high risk processing,
  // and names the card a construction induction card (r 341).
  if (/Victoria/.test(stateName || '')) {
    local['Crystalline silica training (VET accredited or regulator approved), where the processing is high risk'] = 'Crystalline silica information, instruction and training, as the Occupational Health and Safety Regulations 2017 (Vic) require for high risk crystalline silica work';
    local['General construction induction (white card)'] = 'Construction induction card (white card)';
  }
  // The ACT: an awareness course the Minister declares for high risk crystalline silica work (s 418D),
  // and no asbestos removal without a licence, whatever the amount (s 458, s 487).
  if (/Australian Capital Territory/.test(stateName || '')) {
    local['Crystalline silica training (VET accredited or regulator approved), where the processing is high risk'] = 'Crystalline silica awareness training (the course the Minister declares under section 418D), for workers who carry out high risk crystalline silica work';
    local[ASBESTOS_REMOVALIST] = 'Licensed asbestos removalist (Class A for friable asbestos, Class B or A for non-friable asbestos, whatever the amount) with workers holding the VET asbestos removal certification. Other workers who work with asbestos have done the asbestos awareness course the Minister declares (Work Health and Safety Regulation 2011 (ACT) s 445, s 458, s 460, s 487)';
  }
  // New South Wales: a traffic control work training card for the type of traffic control work (s 184C).
  if (/New South Wales/.test(stateName || '')) {
    local['Traffic controller accreditation'] = 'Traffic control work training card, or temporary card, for the type of traffic control work (Work Health and Safety Regulation 2025 (NSW) s 184C)';
    local['Traffic controller accreditation, for anyone on our crew who directs traffic'] = 'Traffic control work training card, or temporary card, for the type of traffic control work, for anyone on our crew who does traffic control work (Work Health and Safety Regulation 2025 (NSW) s 184C)';
  }
  // Victoria: Class A for friable asbestos (r 264), Class B or A for non-friable asbestos (r 265), and
  // limited removal without a licence (r 250); licence holders train their workers (r 269).
  if (/Victoria/.test(stateName || '')) {
    local[ASBESTOS_REMOVALIST] = 'Licensed asbestos removalist (Class A for friable asbestos, Class B or A for non-friable asbestos) whose workers are informed, instructed and trained in the work. Up to 10 m2 of non-friable asbestos, for no more than 1 hour in any 7 days, may be removed without a licence (Occupational Health and Safety Regulations 2017 (Vic) r 250, r 264, r 265, r 269)';
  }
  const stateId = (findState(stateName) || { id: 'qld' }).id;
  const kept = gasWorkOnly && !/Victoria/.test(stateName || '') ? named.filter((name) => name !== 'Plumbing and drainage licence') : named;
  return [...new Set(kept.map((name) => localText(localNote(local[name] || name, stateId), stateId)))];
}

// Plant notes that read differently in a state. Victoria registers plant designs, not items
// (r 125, Schedule 2; only amusement structures are registered items, r 127C), sets no major
// inspection, and r 118 sets no scaffold handover or 30 day inspection. Its Schedule 3 item 18A
// licenses non-slewing telehandlers over 3 t, and a slewing telehandler is a slewing mobile crane.
const STATE_PLANT = {
  // Western Australia: earthmoving machinery used as a crane, with a safe working load over 3 t,
  // needs a high risk work licence (r 5 "crane", r 81, Schedule 3 items 14A and 15A).
  wa: [
    ['licence', /^No\. Operator competent \(verification of competency\)$/, 'Yes where it is used as a crane with a safe working load over 3 t: the licence for earthmoving machinery used as a crane (Schedule 3 item 14A, non-slewing, or 15A, slewing). Otherwise no: operator competent (verification of competency)', /^Excavator$/],
  ],
  vic: [
    ['inspection', /^Registered item of plant\./, 'Registered design.'],
    ['inspection', /Cranes over 10 t are registered plant and need a major inspection \(s 235\)\./, 'Cranes over 10 t have a registered design.'],
    ['inspection', /, a yearly inspection if erected for 12 months or more, and a major inspection \(WHS Reg s 235\)\./, ' and a yearly inspection if erected for 12 months or more.'],
    ['inspection', /^Handover certificate before first use\. Inspected by a competent person before use, after an incident that could affect its stability, after repairs or alterations, and at least every 30 days \(WHS Reg s 225, for suspended, cantilevered, spur and hung scaffolds, and others over 4 m\)\./, 'Not used for work until it, or the part used, is complete; kept secure and able to support the work; repaired before use if it becomes unsafe; and access blocked when it is left unattended (WHS Reg s 225). Handover certificate before first use, and inspected by a competent person before use, after an incident or repairs, and at least every 30 days.'],
    ['inspection', /Over 4 m: handover certificate and inspections as for a scaffold \(WHS Reg s 225\)\./, 'Over 4 m: handover certificate and inspections as for a scaffold.'],
    ['inspection', /, and at least every 30 days \(WHS Reg s 225\)\./, ', and at least every 30 days.'],
    ['licence', /^No Schedule 3 class names telehandlers(, where one is used)?\. .*$/, 'Yes for a non-slewing telehandler rated over 3 t: the non-slewing telehandler licence, or a mobile crane licence$1. A slewing telehandler is a slewing mobile crane and needs the slewing mobile crane licence for its capacity'],
  ],
};
function localPlant(item, stateId) {
  let out = item;
  for (const [field, pattern, replacement, only] of STATE_PLANT[stateId] || []) if ((!only || only.test(out.item)) && pattern.test(out[field])) out = { ...out, [field]: out[field].replace(pattern, replacement) };
  return out;
}

// A crew of a licensed trade holds that trade's licence, whatever steps were picked.
// Only where the job steps show that trade's work: a painting task in an electrical
// and painting scope does not need an electrical licence.
function tradeLicences(trade, list, stepText = '') {
  // The electrician lines in Before starting mean the crew does electrical work.
  const electricianLines = /Electrical work is done or supervised only by licensed electric/.test(stepText);
  const ids = String(trade || '').split(',').map((id) => id.trim());
  const add = [];
  if (ids.includes('electrical') && (electricianLines || /\b(electrical|wiring|cables?|cabling|circuits?|switchboards?|distribution boards?|energised|de-energised|fit-off|terminat\w*|light fittings?|power|lighting|generators?|solar|batter(?:y|ies)|meter box)\b/i.test(stepText.replace(/\bcommunications cabling\b/gi, '')))) add.push('Electrical work licence (electrical mechanic)');
  // Gas work on its own is licensed as gas work, not plumbing.
  const gasOnly = /\bgas\b/i.test(stepText) && !/\b(water|drain\w*|sewer\w*|waste|plumb\w*|fixtures?|backflow)\b/i.test(stepText.replace(/\b(?:gas )?(?:hot water|water heater)\b/gi, ''));
  // Fire sprinkler and hydrant pipework is fire services work, not plumbing (messy round 4).
  const fireOnly = /\b(sprinklers?|hydrants?|fire (?:services?|mains?|pipework|hose reels?))\b/i.test(stepText) && !/\b(plumb\w*|sanitary|sewer\w*|toilets?|basins?|hot water|tapware|backflow|water service)\b/i.test(stepText);
  if (ids.includes('plumbing') && !gasOnly && !fireOnly && /\b(plumb\w*|pipe\w*|drain\w*|sewer\w*|water service|fixtures?|hot water|backflow)\b/i.test(stepText)) add.push('Plumbing and drainage licence');
  return [...new Set([...list, ...add])];
}

// A licence for plant that is one of several options: needed only where that plant is used.
function whereUsed(licence) {
  const [first, ...rest] = licence.split('. ');
  return [`${first}, where one is used`, ...rest].join('. ');
}
const WHERE_USED = /, where one is used\b/;

// The plant the user confirmed (goal 2: ask for the plant, do not guess it). choice is
// { used, notUsed, added }: the names of the plant SiteWrite listed that the crew uses and does not
// use, and the user's own items ({ item, licence }). Without a choice, the plant SiteWrite listed
// prints as it is (the preview), and the download waits for it (download-gate.js). Plant confirmed
// as used is no longer "where one is used". An item of the user's own takes its notes from the
// plant SiteWrite knows by that name, otherwise the pre-start check, and the licence the user gave.
function confirmedPlant(plant, choice, stateId) {
  if (!choice || typeof choice !== 'object') return plant;
  const used = new Set(Array.isArray(choice.used) ? choice.used : []);
  const kept = plant.filter((item) => used.has(localPlant(item, stateId).item)).map((item) => ({ ...item, licence: item.licence.replace(WHERE_USED, '') }));
  for (const own of Array.isArray(choice.added) ? choice.added : []) {
    const name = String((own && own.item) || '').trim();
    if (!name || kept.some((item) => item.item.toLowerCase() === name.toLowerCase())) continue;
    const known = plantFor(name)[0];
    const licence = String((own && own.licence) || '').trim();
    // The plant SiteWrite knows by that name (a "tamper" is a track maintenance machine) is kept with it, so
    // the high risk work and licences read it as that plant (messy round 5).
    kept.push({ item: name, inspection: known ? known.inspection : PRESTART, licence: licence || (known ? known.licence.replace(WHERE_USED, '') : ''), own: true, ...(known ? { known: known.item } : {}) });
  }
  return kept;
}

// Plant or access equipment that is itself maintained, serviced, repaired or inspected is not
// being used ("Maintain mobile plant (plant: Forklifts, telehandlers, EWPs)"): in such a sentence
// the plant is taken out before the plant or fall categories are looked for.
const SERVICED_PLANT = /^\s*(?:maintain|servic|repair|inspect|pre-?start check|pre-?use check)\w*\b[^.]{0,40}\b(?:mobile plant|plant|equipment|machinery|vehicles?|forklifts?|ewps?|elevating work platforms?|scissor lifts?|boom lifts?|telehandlers?|excavators?|cranes?|hoists?|trucks?|loaders?|generators?)\b/i;
const PLANT_WORDS = /\b(?:mobile plant|plant|equipment|machinery|vehicles?|forklifts?|ewps?|elevating work platforms?|scissor lifts?|boom lifts?|telehandlers?|excavators?|(?:mobile |tower )?cranes?|hoists?|trucks?|loaders?|skid ?steers?|bobcats?|rollers?)\b/gi;
function withoutServicedPlant(text) {
  return String(text || '').replace(/[^.]+\.?/g, (sentence) => (SERVICED_PLANT.test(sentence) ? sentence.replace(PLANT_WORDS, ' ') : sentence));
}

function registersFor(draft, input = {}) {
  // The lines' words without the state's own code references (the printed lines are kept for the
  // sources list and the rated steps).
  const printedSteps = draft.jobSteps || [];
  const steps = printedSteps.map((step) => ({ ...step, controls: (step.controls || []).map(withoutStateCodes) }));
  const task = draft.task || '';
  const hazardText = steps.flatMap((step) => step.hazards).join('\n');
  const allText = `${task}\n${steps.flatMap((step) => [step.step, ...step.hazards, ...step.controls]).join('\n')}`;
  // Plant the crew uses: named in the task, the answers and controls table, the
  // step names or the hazards, not every control line that mentions plant to keep
  // clear of.
  // A hazard such as "struck by forklifts" is the site's plant, not the crew's.
  // A scope row's conditions ("conditions: anti-tamper fixings") describe the site, not the crew's plant
  // (messy round 4: "anti-tamper" listed a rail track machine for fire sprinklers).
  const ownTask = withoutConditions(task);
  const useText = `${withoutServicedPlant(ownTask)}\n${(draft.controls || []).map((item) => item.text).join('\n')}\n${steps.map((step) => step.step).join('\n')}\n${hazardText.replace(/\b(?:forklifts?|telehandlers?)\b/gi, '')}`;
  // Control lines that say the crew uses plant, not the ones about keeping clear of it.
  const usedInControls = steps.flatMap((step) => step.controls).filter((line) => /^(?:Nail guns?:|Line marking machines?|Sanders?\b|Mixers?\b|Mixer guards|Lifting beams?\b|Cut and trim bars|A trencher|Trenchers?\b)/.test(line) || /^(?:Use|Using|Cut)\b|\b(?:are|is) (?:run|used|operated)(?: only)? (?:by|with)\b|\bcut with\b|\b(?:is|are) mixed\b[^.]{0,40}\bwith an? \w+ mixers?\b/i.test(line) && !/\b(?:\w+ )or (?:an? )?(?:forklift|crane|telehandler|ewp|hoist)\b/i.test(line) && !/\b(keep (?:clear|away|out|back|well clear|people|everyone|workers|others)|clear of|away from|others|crane company|pumping company)\b/i.test(line));
  // Lines naming the plant a step is done from or lifted with: definite when one item is named, otherwise each is used where chosen.
  const accessLines = steps.flatMap((step) => step.controls).filter((line) => /^Access is (?:from|by)\b|\b(?:are|is) lifted to (?:the )?\w+ by\b|\b(?:is|are) (?:reached|changed) from (?:an? |the )\b|\b(?:is|are) (?:done|fixed|installed|removed) from (?:an? |the )\b|\b(?:are|is) delivered by (?:crane|hoist)\b|\blifted by crane\b|\b(?:lifted|stood|lifted and stood|lifted in|lifted into place|moved|compacted(?: in layers)?)(?: onto (?:it|the \w+))? with (?:an? |the )\b|\b(?:are|is) (?:run|used|operated)(?: only)? (?:by|with)\b[^.]*\bor\b/i.test(line) && !/\b(keep|clear of|away from|others|crane company|pumping company|considered|reasonably practicable)\b/i.test(line));
  const forkliftLines = steps.flatMap((step) => step.controls).filter((line) => /\b(forklifts?|telehandlers?)\b/i.test(line) && !/\b(keep|clear of|away from|exclusion|near|separat\w*|barricad\w*)\b/i.test(line));
  // A forklift or telehandler named only in a control line may or may not be used, so its licence is conditional.
  const named = plantFor(`${useText}\n${usedInControls.join('\n')}`).map((item) => item.item);
  const maybe = plantFor(forkliftLines.join('\n')).filter((item) => /^(Forklift|Telehandler)$/.test(item.item) && !named.includes(item.item)).map((item) => ({ ...item, licence: whereUsed(item.licence) }));
  // A generator being installed or load tested is the building's plant, not a portable site generator.
  const buildingGenerator = steps.some((step) => ['Install generators and fuel systems', 'Run and load test generators'].includes(step.step));
  const fromAccess = accessLines.flatMap((line) => { const found = plantFor(line); return found.length > 1 || /\sor\s|\bwhere one is used\b/i.test(line) ? found.map((item) => ({ ...item, licence: whereUsed(item.licence) })) : found; });
  // Plant a line names as the way to do the work, "such as water carts" (messy round 5: no water cart for
  // dust control on civil work): listed as not sure, for the user to tick where it is used.
  const examples = steps.flatMap((step) => step.controls).map((line) => (String(line).match(/\bsuch as (?:an? |the )?([^.;]{3,60})/i) || [])[1]).filter(Boolean);
  for (const item of plantFor(examples.join('\n')).filter((found) => /^Water cart$/.test(found.item))) fromAccess.push({ ...item, licence: whereUsed(item.licence) });
  const accessExtra = [];
  for (const item of fromAccess) if (!named.includes(item.item) && !maybe.some((other) => other.item === item.item) && !accessExtra.some((other) => other.item === item.item)) accessExtra.push(item);
  const ownCrane = /^(own|ours?|us|we|our company|yes)$/i.test(String(input.crane || '').trim());
  const noCrane = /^(none|no|no crane|not used)$/i.test(String(input.crane || '').trim());
  const plant = [...plantFor(`${useText}\n${usedInControls.join('\n')}`), ...maybe.filter((item) => !accessExtra.some((other) => other.item === item.item)), ...accessExtra]
    .filter((item) => !(buildingGenerator && item.item === 'Generator'))
    // Plant suggestions come from the task's own work (messy round 4): rail track plant only for rail
    // track work, and no crane where the user said no crane is used and the task names none.
    .filter((item) => !RAIL_PLANT.has(item.item) || RAIL_WORK.test(`${ownTask}\n${steps.map((step) => step.step).join('\n')}`))
    .filter((item) => !(noCrane && /crane/i.test(item.item) && !/\bcranes?\b|\bhiabs?\b|\bfrannas?\b/i.test(ownTask)))
    .map((item) => othersLicence(item, allText, task, ownCrane, ownCrane ? (input.facts || {}).craneChart : ''));
  if (plant.some((item) => /^(Boom-type elevating work platform|Scissor lift)$/.test(item.item))) plant.splice(0, plant.length, ...plant.filter((item) => item.item !== 'Elevating work platform'));
  // A truck loading crane job's "the crane" is the loading crane.
  if (plant.some((item) => /^Vehicle loading crane/.test(item.item)) && !/\b(mobile|crawler|franna|all terrain|slewing|tower) cranes?\b/i.test(task)) plant.splice(0, plant.length, ...plant.filter((item) => !/^Mobile crane or crane truck$/.test(item.item)));
  // A tower crane job's "the crane" is the tower crane, and a boom pump job's pour is not a line pump.
  if (plant.some((item) => item.item === 'Tower crane') && !/\b(mobile|crawler|franna|all terrain|slewing) cranes?\b|\bcranes?,|\btwo cranes\b/i.test(task)) plant.splice(0, plant.length, ...plant.filter((item) => !/^Mobile crane or crane truck$/.test(item.item)));
  if (plant.some((item) => item.item === 'Concrete placing boom') && !/\b(line pumps?|concrete pumps?|static pumps?)\b/i.test(task)) plant.splice(0, plant.length, ...plant.filter((item) => item.item !== 'Concrete line pump'));
  if (plant.some((item) => item.item === 'Rolling impact compactor and tractor') && !/\b(rollers?|plate compactors?)\b/i.test(task)) plant.splice(0, plant.length, ...plant.filter((item) => item.item !== 'Roller or plate compactor'));
  // A wire saw job is not a floor or wall saw job, and drill rigs are not hand drills.
  if (plant.some((item) => item.item === 'Wire saw') && !/\b(floor|wall|concrete|road) saws?\b/i.test(task)) plant.splice(0, plant.length, ...plant.filter((item) => item.item !== 'Concrete saw'));
  if (plant.some((item) => /^(Drill rig|Directional drilling rig)$/.test(item.item)) && !/\b(power tools?|hand drills?|grind\w*|leads?)\b/i.test(task)) plant.splice(0, plant.length, ...plant.filter((item) => item.item !== 'Electric power tools and leads'));
  // A rock breaker is carried by an excavator.
  if (plant.some((item) => item.item === 'Rock breaker (hydraulic hammer)') && /\bexcavator\b/i.test(allText) && !plant.some((item) => item.item === 'Excavator')) plant.push(...PLANT.filter((item) => item.item === 'Excavator').map((item) => othersLicence({ item: item.item, inspection: item.inspection, licence: item.licence }, allText, task)));
  if (!/\b(punts?|barges?|boats?)\b|\bfrom (?:a |the )pontoons?\b/i.test(task)) plant.splice(0, plant.length, ...plant.filter((item) => item.item !== 'Work punt or boat'));
  // A vehicle hoist being installed is not a personnel or materials hoist.
  if (/\b(vehicle|car) hoists?\b/i.test(task) && !/\b(personnel|materials?|builders?'?) hoists?\b/i.test(task)) plant.splice(0, plant.length, ...plant.filter((item) => item.item !== 'Personnel or materials hoist'));
  // A mobile scaffold or swing stage named in the task is the scaffold used.
  if (/\b(mobile scaffolds?|swing stages?)\b/i.test(task) && !/(?<!mobile )\bscaffold(?:s|ing)?\b(?! tower)/i.test(task.replace(/\bmobile scaffolds?\b/gi, ''))) plant.splice(0, plant.length, ...plant.filter((item) => item.item !== 'Scaffold'));
  // A piling rig's auger is part of the rig, not a post hole auger.
  if (plant.some((item) => item.item === 'Piling rig')) plant.splice(0, plant.length, ...plant.filter((item) => item.item !== 'Post hole auger'));
  if (buildingGenerator) plant.push({ item: 'Standby generator (building plant)', inspection: 'Serviced and tested to the manufacturer\'s instructions. Guards, exhaust and fuel system checked before each run.', licence: 'No. Switching by licensed electricians' });
  // Register notes cite the state's own regulation.
  const stateId = (findState(draft.state) || { id: 'qld' }).id;
  // The plant SiteWrite lists, for the user to confirm (goal 2), and the plant that prints: only
  // what the user confirmed, once they have.
  const plantInferred = plant.map((item) => localPlant(item, stateId)).map((item) => ({ item: item.item, maybe: WHERE_USED.test(item.licence) }));
  const listed = confirmedPlant(plant, input.plantChoice, stateId);
  // A hazard about residues or waste swept up is not a product the crew uses (messy round 4: plaster and
  // adhesive asked for a paint washout).
  const productHazards = steps.flatMap((step) => step.hazards).filter((line) => !/\b(?:paint|adhesive|membrane|product) residues?\b|\bsweep\w*|\bwaste\b|\boffcuts?\b/i.test(line)).join('\n');
  const substances = substancesFor(`${ownTask}\n${productHazards}\n${steps.map((step) => step.step).join('\n')}`, (input.facts || {}).safetyDataSheet, steps.flatMap((step) => step.controls).join('\n'));
  // Gases and fuels named only for plant the user has said is not used are not asked for (messy round 4:
  // acetylene after the torch was unticked).
  if (input.plantChoice && typeof input.plantChoice === 'object') {
    const kept = listed.map((item) => item.item).join('\n');
    const dropGas = !/\b(torch|oxy|acetylene|weld|brazing|gas)\w*/i.test(kept) && !/\b(lpg|acetylene|oxygen|gas cylinders?|gas bottles?)\b/i.test(ownTask);
    const dropFuel = !/\b(generator|chainsaw|excavator|truck|tipper|roller|paver|profiler|loader|dozer|grader|compressor|mixer|skid steer|crane|pump|plant)\w*/i.test(kept) && !/\b(diesel|petrol|fuel\w*|refuel\w*)\b/i.test(ownTask);
    substances.items = substances.items.filter((item) => !(dropGas && /^Gases/.test(item.product)) && !(dropFuel && /^Fuels/.test(item.product)));
  }
  let sources = legislationFor([...printedSteps.flatMap((step) => step.controls), ...(draft.controls || []).map((item) => item.text)]);
  if (!/Queensland/.test(draft.state || '')) sources = addStateLaw(sources, draft.state);
  // Work near energised services only because of power lines: no low voltage rescue (draft.js).
  const rescueRisk = (draft.highRisk || []).filter((item) => !(draft.electricalLinesOnly && /energised electrical/i.test(item)));
  const qualifications = withoutNetworkPlumbing(task, withoutElectricalLicence(task, localLicences(draft.state, input.trade, qualificationsFor(ownTask, hazardText, allText, listed.map((item) => localPlant(item, stateId)), rescueRisk, steps.filter((step) => step.hazards.some((line) => /\bsilica\b/i.test(line) && (SILICA_PROCESS.test(line) || SILICA_PROCESS.test(step.step))) || (step.hazards.some((line) => /\bdust\b/i.test(line) && SILICA_PROCESS.test(line)) && step.controls.some((line) => /\bcrystalline silica\b/i.test(withoutSource(line))))).map(() => 'silica dust').join(' ')), [...steps.filter((step) => step.step !== 'Before starting' && step.step !== 'Finish and clean up').map((step) => step.step), ...((steps.find((step) => step.step === 'Before starting') || { controls: [] }).controls.filter((line) => /^Electrical work is done or supervised only by licensed electric/.test(line)))].join('\n'))));
  // Comms room and UPS work: the electrical licence is listed where the user says our crew connects the
  // work to mains power, or the task's own words say it wires it (owner D298).
  if (mainsWork(task, input.facts) && !qualifications.some((name) => /^Electrical (?:work )?licence/.test(name))) {
    const at = qualifications.findIndex((name) => !/induction/i.test(name));
    qualifications.splice(at < 0 ? qualifications.length : at, 0, localLicences(draft.state, '', ['Electrical work licence (electrical mechanic)'], '')[0]);
  }
  if (/Queensland/.test(draft.state || '')) sources = addQldSources(sources, { highRisk: draft.highRisk || [], plant: listed, substances, hazardText, text: allText, workText: `${task}\n${steps.map((step) => step.step).join('\n')}` });
  // D258: with a crane company's crane, the dogging or rigging licence prints only where our crew slings
  // the loads and directs the crane; where the crane company's dogman does, the licence is theirs.
  const crane = String(input.crane || '').trim().toLowerCase();
  const craneCompany = crane === 'company' ? /\bcranes?\b/i.test(allText) : !crane && /\bcrane (?:company|crew)\b/i.test(allText);
  const ourSlinging = /^(ours?|our crew|us|we)$/i.test(String(input.slinging || '').trim());
  const DOGGING = 'High risk work licence: dogging or rigging (DG, RB, RI or RA)';
  if (craneCompany && !ourSlinging) qualifications.splice(0, qualifications.length, ...qualifications.filter((name) => name !== DOGGING));
  if (craneCompany && ourSlinging && !qualifications.some((name) => /^High risk work licence: (?:dogging|basic rigging|intermediate rigging)/.test(name))) qualifications.push(DOGGING);
  // Slinging loads is dogging or rigging work, as the lifting gear's own row says, and a step that has a
  // licensed dogger direct a lift names the licence too (messy round 5: lifting gear and "a licensed dogger
  // directs the lift" for pipes lifted by the excavator, with no dogging licence). Not where the crane
  // company's crew does the slinging.
  const slings = listed.some((item) => /^Lifting gear\b/.test(item.known || item.item)) || /\ba licensed dogger directs\b/i.test(allText);
  if (slings && !(craneCompany && !ourSlinging) && !qualifications.some((name) => /^High risk work licence: (?:dogging|basic rigging|intermediate rigging|advanced rigging)/.test(name))) qualifications.push(DOGGING);
  // A licence or ticket the user gave for their own plant item is listed with the licences too, not only in
  // the plant table (messy round 5: HR and MR truck licences printed only in the plant table).
  for (const item of listed.filter((entry) => entry.own)) {
    const licence = String(item.licence || '').trim().replace(/[.\s]+$/, '');
    if (!licence || /^(?:no\b|nil|none|n\/?a|tb[acd]|not (?:needed|required)|-+)/i.test(licence) || /_{3,}/.test(licence)) continue;
    const line = `${item.item}: ${licence}`;
    if (!qualifications.some((name) => name.toLowerCase() === line.toLowerCase())) qualifications.push(line);
  }
  // Where our company runs the crane (messy round 4, B fault 3): the operator's high risk work licence for
  // the crane's class, whatever was typed in the plant list, and dogging or rigging, since our crew
  // slings and directs the loads.
  if (ownCrane) {
    for (const item of listed) {
      const known = /crane/i.test(item.item) ? (plantFor(item.item)[0] || null) : null;
      if (!known || !/crane/i.test(known.item) || /^Lifting/.test(known.item)) continue;
      const classed = known.item === 'Mobile crane or crane truck' ? craneClass({ ...known }, `${task}\n${item.item}`, (input.facts || {}).craneChart) : known;
      if (!/^Yes/.test(classed.licence)) continue;
      const line = `High risk work licence: ${classed.item.toLowerCase()} (${classed.licence.split('. ')[0].replace(/^Yes,?\s*/, '').replace(/^\(([^()]*)\)(.*)$/, '$1$2')})`;
      if (!qualifications.some((name) => /^High risk work licence: [^(]*crane/i.test(name))) qualifications.push(line);
    }
    if (listed.some((item) => /crane/i.test(item.item)) && !qualifications.some((name) => /^High risk work licence: (?:dogging|basic rigging|intermediate rigging|advanced rigging)/.test(name))) qualifications.push(DOGGING);
  }
  // Work that needs the refrigerant handling licence handles refrigerant (messy round 3 and 4: no
  // refrigerant row for commissioning split systems).
  if (qualifications.some((name) => /^Refrigerant handling/.test(name)) && !substances.items.some((item) => item.product === 'Refrigerants')) substances.items.push({ product: 'Refrigerants', sds: '', quantity: '' });
  if (/Queensland/.test(draft.state || '') && qualifications.some((name) => /^Plumbing and drainage licence/.test(name))) sources = { ...sources, legislation: [...new Set([...sources.legislation, 'Plumbing and Drainage Act 2018 (Qld)'])].sort() };
  if (/Queensland/.test(draft.state || '') && qualifications.some((name) => /^Gas work licence/.test(name))) sources = { ...sources, legislation: [...new Set([...sources.legislation, 'Petroleum and Gas (Production and Safety) Act 2004 (Qld)'])].sort() };
  return {
    plant: listed.map((item) => localPlant(item, stateId)).map((item) => ({ ...item, inspection: localNote(stateId === 'qld' ? item.inspection : item.inspection.replace(/ Yearly inspection and six-yearly major inspection \(Concrete Pumping Code s 5\)\./, ' Inspected and maintained to the manufacturer\'s instructions, including its periodic and major inspections.'), stateId), licence: localNote(item.licence, stateId) })),
    plantInferred,
    // The user has confirmed the plant: plant SiteWrite was not sure of counts once ticked (emergency.js).
    plantChosen: Boolean(input.plantChoice && typeof input.plantChoice === 'object'),
    substances,
    // Silica training where a step's hazards are silica dust, or dust its controls treat as crystalline silica.
    qualifications,
    // Codes of practice are cited only where they have been matched to the state (Queensland so far).
    emergency: emergencyFor(allText, input, rescueRisk, listed, `${task}\n${hazardText}${draft.electricalLinesOnly ? '\noverhead power lines' : ''}`).map((row) => (stateId !== 'qld' ? { ...row, equipment: row.equipment.replace(/\s?\([^()]*Code of Practice[^()]*\)/g, '') } : row)),
    sources,
    jobSteps: ratedSteps(printedSteps),
  };
}

module.exports = { commsOrUps, MAINS_SAID, registersFor, withoutServicedPlant, MATRIX, LIKELIHOOD, CONSEQUENCE, riskFor, ANSWERED_BY, legislationFor, PLANT, withoutOtherTrades, RAIL_WORK };
