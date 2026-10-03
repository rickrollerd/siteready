// The registers a SWMS template carries alongside the job steps: plant and
// equipment, hazardous substances, licences and qualifications, emergency
// arrangements, the legislation and codes the controls rely on, and a suggested
// risk rating for each step. Each is worked out from the task and the finished
// job steps, and left for the supervisor to check and complete for the site.

// Plant and equipment. A licence is shown only where Schedule 3 of the WHS
// Regulation makes the work high risk work; otherwise the operator must be
// competent. Electrical equipment for construction work is inspected and tested
// to AS/NZS 3012 (Electrical Safety Regulation 2026 (Qld) s 140).
const { localNote, localText } = require('./citations');
const { findState } = require('./legislation');
const TEST_TAG = 'Inspected, tested and tagged to AS/NZS 3012. Checked for damage before use.';
const PRESTART = 'Pre-start check each shift. Serviced to the manufacturer\'s instructions.';
const PLANT = [
  { item: 'Boom-type elevating work platform', pattern: /\b(boom lifts?|boom ewps?|knuckle booms?|cherry pickers?|articulating booms?)\b/i, inspection: `${PRESTART} Inspected and maintained by a competent person to the manufacturer\'s instructions, including its periodic (usually yearly) inspection.`, licence: 'Yes, where the boom length is 11 m or more, measured as the greater of platform height and horizontal reach (WP)' },
  { item: 'Scissor lift', pattern: /\bscissor lifts?\b/i, inspection: `${PRESTART} Inspected and maintained by a competent person to the manufacturer\'s instructions, including its periodic (usually yearly) inspection.`, licence: 'No. Operator trained in the model used' },
  { item: 'Elevating work platform', pattern: /\b(elevating work platforms?|ewps?)\b/i, skipIf: /\b(scissor|boom|considered)\b/i, inspection: `${PRESTART} Inspected and maintained by a competent person to the manufacturer\'s instructions, including its periodic (usually yearly) inspection.`, licence: 'Only for a boom-type platform with a boom length of 11 m or more (WP). No licence for a scissor lift' },
  { item: 'Tower crane', pattern: /\btower cranes?\b/i, inspection: 'Registered item of plant. Pre-erection and commissioning inspections, daily pre-operational check and log book, routine inspections, a yearly inspection if erected for 12 months or more, and a major inspection (WHS Reg s 235).', licence: 'Yes (CT, or CS for a self-erecting tower crane), with licensed doggers or riggers' },
  { item: 'Vehicle loading crane (hiab)', pattern: /\b(vehicle loading cranes?|loader cranes?|hiabs?|truck loading crane|truck[- ]mounted cranes?|knuckle boom cranes?)\b/i, inspection: 'Pre-start check and log book. Inspected and maintained to the manufacturer\'s instructions (WHS Reg s 213).', licence: 'Yes (CV) where the crane is rated at 10 metre-tonnes or more. Under 10 metre-tonnes no licence, the operator is trained and competent on it' },
  { item: 'Mobile crane or crane truck', pattern: /\b(mobile cranes?|crane trucks?|franna|slewing cranes?|the crane|a crane|cranes?)\b/i, skipIf: /\b(tower crane|crane ties?|crane or lifting gear|crane, hoist|crane or (?:a )?hoist|hoist or (?:a )?crane|where a crane|if a crane|crane or forklift|forklift or crane|forklift, crane|people, cranes|cranes, plant|keep cranes)\b/i, inspection: 'Crane company\'s log book and pre-start check. Inspected to the manufacturer\'s instructions (WHS Reg s 213). Cranes over 10 t are registered plant and need a major inspection (s 235).', licence: 'Yes, crane class to suit (slewing C2, C6, C1 or C0; non-slewing over 3 t CN; vehicle loading crane of 10 metre-tonnes or more CV), with licensed doggers or riggers. No licence for a vehicle loading crane under 10 metre-tonnes or a non-slewing crane of 3 t or less' },
  { item: 'Forklift', pattern: /\bforklifts?\b/i, inspection: PRESTART, licence: 'Yes (LF)' },
  { item: 'Telehandler', pattern: /\btelehandlers?\b/i, inspection: PRESTART, licence: 'No Schedule 3 class names telehandlers. Operator competent in the model used. Check with the supplier whether a non-slewing crane licence (CN) is needed when it is fitted with a jib or hook to lift suspended loads' },
  { item: 'Personnel or materials hoist', pattern: /(?<!(?:vehicle|car|chain) )\b(hoists?|materials lifts?)\b/i, skipIf: /\b(chain hoists?|leave out|at the hoist|where there is|near the hoist|clear of|crane, hoist|crane or (?:a )?hoist|hoist or (?:a )?crane|hoist, crane|by (?:a )?hoist|lift, (?:a )?hoist|lifts?, (?:a )?hoist or)\b/i, inspection: 'Inspected, tested and maintained by a competent person to the manufacturer\'s instructions (WHS Reg s 213). Pre-start check each shift. Erected and altered by licensed riggers.', licence: 'Yes (HP or HM)' },
  { item: 'Concrete placing boom', pattern: /\b(placing booms?|boom pumps?|pump trucks?|truck-mounted pumps?)\b/i, inspection: 'Registered item of plant. Daily pre-start check. Pipes, hoses and clamps checked for wear and damage before use. Yearly inspection and six-yearly major inspection (Concrete Pumping Code s 5).', licence: 'Yes (PB)' },
  { item: 'Concrete line pump', pattern: /\b(line pumps?|concrete pumps?|pump(?:,|\s+and)?\s+(?:and\s+)?place\w*)\b/i, inspection: 'Pre-start check. Pipes, hoses and clamps checked for wear and damage before use. Inspected by a competent person at least yearly.', licence: 'No. Operator competent' },
  { item: 'Scaffold', pattern: /(?<!mobile )\bscaffold(?:s|ing)?\b/i, inspection: 'Handover certificate before first use. Inspected by a competent person before use, after an incident that could affect its stability, after repairs or alterations, and at least every 30 days (WHS Reg s 225, scaffolds over 4 m).', licence: 'Yes, for erecting, altering or dismantling where a fall of more than 4 m is possible (SB, SI or SA)' },
  { item: 'Mobile scaffold', pattern: /\bmobile scaffolds?\b/i, inspection: 'Erected to the manufacturer\'s instructions. Castors locked, guardrails complete, checked before use. Over 4 m: handover certificate and inspections as for a scaffold (WHS Reg s 225).', licence: 'No, under 4 m. Yes (SB) where a person or object could fall more than 4 m' },
  { item: 'Turf laying machine', pattern: /\bturf laying machines?\b/i, inspection: PRESTART, licence: 'No. Operator competent' },
  { item: 'Building maintenance unit (BMU)', pattern: /\b(building maintenance units?|bmus?)\b/i, inspection: 'Inspected and maintained to the manufacturer\'s instructions and AS 1418.13, with current certification before use.', licence: 'No. Operators trained in the unit' },
  { item: 'Excavator', pattern: /\b(excavators?|excavat\w* by machine|mini excavators?|(?<!small )earthmoving plant)\b/i, skipIf: /\bRun earthmoving plant\b/, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Skid steer or posi-track', pattern: /\b(skid ?steers?|bobcats?|posi-?tracks?)\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Roller or plate compactor', pattern: /\b(plate compactors?|compactors?|wacker|compaction|(?:ride-on|vibrating|smooth drum|padfoot|road|trench) rollers?|paver, roller|spreader, roller|(?:graders?|dozers?|water carts?),? (?:and )?(?:a )?rollers?|rollers? and (?:a )?water carts?|the roller|a roller or plate compactor|(?:asphalt|bitumen|hot mix|compact\w*)\b[^.]{0,40}\bwith a roller)\b/i, skipIf: /\b(paint\w*|brush\w*|roller doors?|rolling impact compact\w*)\b/i, inspection: PRESTART, licence: 'No. Operator competent' },
  { item: 'Piling rig', pattern: /\b(piling rigs?|cfa rigs?|bored pil\w*|crawler rigs?|pile driving machines?|piling machines?)\b/i, inspection: 'Daily pre-start check and the rig\'s log book.', licence: 'No. Operator competent' },
  { item: 'Concrete truck', pattern: /\bconcrete trucks?\b/i, inspection: 'The supplier\'s pre-start check.', licence: 'Truck driver\'s licence' },
  { item: 'Power trowel', pattern: /\bpower trowels?\b/i, inspection: `${PRESTART} Guards and stop switch checked.`, licence: 'No' },
  { item: 'Concrete saw', pattern: /\b(concrete saws?|saw cut\w*|saw-cut\w*|floor saws?|wall saws?)\b/i, inspection: `${PRESTART} Blade guard in place. Electric saws: ${TEST_TAG}`, licence: 'No' },
  { item: 'Core drill', pattern: /\bcore[- ]?drill\w*\b/i, inspection: TEST_TAG, licence: 'No' },
  { item: 'Generator', pattern: /\bgenerators?\b/i, skipIf: /\b(standby|load shed\w*|load test\w*|operation of (?:the )?generators?|install generators|generators and fuel|run and load test|generator (?:rooms?|sets?))\b/i, inspection: `${PRESTART} Electrical output protected by an RCD. ${TEST_TAG}`, licence: 'No' },
  { item: 'Chainsaw', pattern: /\bchainsaws?\b/i, inspection: `${PRESTART} Chain brake working.`, licence: 'No. Operator competent' },
  { item: 'Oxy-acetylene or gas torch set', pattern: /\b(oxy|acetylene|gas torch\w*|torch-on|torching|brazing|lpg)\b/i, inspection: 'Hoses, regulators and flashback arrestors checked before use.', licence: 'No' },
  { item: 'Welder', pattern: /\bweld\w*\b/i, skipIf: /\b(vinyl|seams?|hot air|heat weld\w*|blend\w* in welds|welds to)\b/i, inspection: TEST_TAG, licence: 'No' },
  { item: 'Nail gun', pattern: /\bnail guns?\b/i, inspection: 'Checked before use. Single shot trigger.', licence: 'No' },
  { item: 'Air compressor', pattern: /\b(compressed air|air compressors?|compressors?)\b/i, skipIf: /\b(fans?|pumps|start\w* without|refrigerat\w*|condens\w*)\b/i, inspection: `${PRESTART} Hoses and couplings checked and restrained.`, licence: 'No' },
  { item: 'Concrete vibrator', pattern: /\bvibrators?\b/i, inspection: TEST_TAG, licence: 'No' },
  { item: 'Trench shield or shoring', pattern: /\b(trench shields?|trench box\w*|(?<!re-|re)shoring|(?<!re-|re)shored)\b/i, inspection: 'Installed to the manufacturer\'s or engineer\'s design, and checked by a competent person frequently, including before each shift and after rain.', licence: 'No. Installed by competent people' },
  { item: 'Dewatering pump', pattern: /\b(dewater\w*|pump out water|pumps? (?:the )?water)\b/i, inspection: `${PRESTART} ${TEST_TAG}`, licence: 'No' },
  { item: 'Vacuum excavation unit', pattern: /\b(vacuum excavat\w*|vacuum system|non-destructive digging|hydro ?vac\w*)\b/i, inspection: PRESTART, licence: 'No. Operator competent' },
  { item: 'Tipper or dump truck', pattern: /\b(tippers?|dump trucks?|haul trucks?|trucks? (?:cart|haul)\w*|carted by truck|cart\w* (?:spoil|topsoil|soil|fill|mulch)\w*)\b/i, skipIf: /\barticulated dump trucks?\b/i, inspection: PRESTART, licence: 'Truck driver\'s licence' },
  { item: 'Gas detector', pattern: /\b(gas detectors?|gas monitor\w*|atmospheric? (?:testing|monitor\w*)|test(?:ed)? (?:the )?atmosphere|monitor the atmosphere)\b/i, inspection: 'Calibrated to the manufacturer\'s instructions and bump tested before use.', licence: 'No. User trained' },
  { item: 'Lifting gear (slings, chains, shackles)', pattern: /\b(slings?|slung|shackles?|lifting gear|lifting chains?)\b/i, inspection: 'Tagged with its working load limit, inspected before each use and periodically by a competent person. Damaged gear is withdrawn.', licence: 'No. Slinging loads is dogging or rigging work' },
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
  { item: 'Concrete or mortar mixer', pattern: /\b(mixers?|mixer guards)\b/i, inspection: `${PRESTART} Guards in place and leads tagged or engine checked.`, licence: 'No' },
  { item: 'Lifting beam and chain block', pattern: /\b(lifting beams?|chain blocks?)\b/i, inspection: 'Rated, tagged and proof tested before use, and inspected before each lift.', licence: 'No. Slinging loads is dogging or rigging work' },
  { item: 'Bar cutter or cut-off saw', pattern: /\b(bar cutters?|cut-off saws?)\b/i, inspection: `${PRESTART} Guards in place.`, licence: 'No' },
  { item: 'Trencher', pattern: /\btrenchers?\b/i, inspection: PRESTART, licence: 'No. Operator trained' },
  { item: 'Vacuum truck', pattern: /\bvacuum (?:trucks?|tankers?)\b/i, inspection: PRESTART, licence: 'No. Operator competent' },
  { item: 'Tripod and winch (confined space rescue)', pattern: /\btripod\w*\b/i, inspection: 'Inspected before each entry, within its inspection date.', licence: 'No. Users trained' },
  { item: 'Work punt or boat', pattern: /\b(work punts?|punts?|barges?|work boats?|(?<=from (?:a |the ))pontoons?)\b/i, skipIf: /\b(jack-?up barges?|barge (?:cappings?|flashings?|boards?|rolls?|tiles?|rafters?)|(?:fascias?|guttering|ridges?|valleys?),? (?:or |and )?barges?|barges?,? (?:and|or) (?:similar|fascias?|ridges?))\b/i, inspection: 'Moored and stable before use, with its safety equipment on board.', licence: 'Operated by a competent person holding any marine licence the state requires' },
  { item: 'Masonry or paver saw', pattern: /\b(?:brick|block|paver|masonry|wet|tile) saws?\b|\bsaw noise\b/i, inspection: `${PRESTART} Blade guard in place, water feed or extraction working, leads tagged.`, licence: 'No. Operator trained' },
  { item: 'Dozer', pattern: /\b(dozers?|bulldozers?)\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Grader', pattern: /\bgraders?\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Loader', pattern: /\b(front end loaders?|wheel loaders?|(?<!skid steer |truck |low )loaders?)\b/i, skipIf: /\b(loader crane|vehicle loading crane)\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Scraper', pattern: /\bscrapers?\b/i, skipIf: /\b(floor scrapers?|hand scrapers?|paint scrapers?|scrapers and (?:knives|blades|wire brushes))\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Articulated dump truck', pattern: /\b(articulated dump trucks?|adts?)\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Water cart', pattern: /\bwater carts?\b/i, inspection: PRESTART, licence: 'Truck driver\'s licence for the vehicle class' },
  { item: 'Road profiler', pattern: /\b(road profilers?|cold planers?|profilers?)\b/i, inspection: `${PRESTART} Drum guards and conveyor checked.`, licence: 'No. Operator competent (verification of competency)' },
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
  { item: 'Track maintenance machine', pattern: /\b(tamp\w* machines?|tampers?|ballast regulators?|track (?:maintenance )?machines?)\b/i, inspection: 'Checked before going on track, as the rail manager requires.', licence: 'Operator holds the rail manager\'s competency for the machine' },
  { item: 'Crushing or screening plant', pattern: /\b((?<!concrete )crushers?|crushing (?:and screening )?plant|screening plant)\b/i, inspection: `${PRESTART} Guards, emergency stops and pull wires tested.`, licence: 'No. Operator competent' },
  { item: 'Concrete batching plant', pattern: /\bbatch(?:ing)? plants?\b/i, inspection: 'Installed and commissioned to the supplier\'s instructions, with guards, isolation points and emergency stops checked.', licence: 'No. Operator trained' },
  { item: 'Hydro demolition robot', pattern: /\bhydro[- ]?demoli\w*\b/i, inspection: `${PRESTART} Pump, hoses, dead man control and robot controls checked.`, licence: 'No. Operator trained' },
  { item: 'Wire saw', pattern: /\bwire saws?\b/i, inspection: `${PRESTART} Wire, pulleys, guards and drive checked.`, licence: 'No. Operator trained' },
  { item: 'Concrete crusher (excavator attachment)', pattern: /\b(concrete crushers?|pulveri[sz]ers?)\b/i, inspection: `${PRESTART} Jaws, pins and hoses checked.`, licence: 'No. Excavator operator competent' },
  { item: 'Pipe laying attachment', pattern: /\b(pipe laying attachments?|pipe layers?|side ?booms?)\b/i, inspection: 'Rated for the pipe, tagged and checked before use.', licence: 'No. Operator competent' },
  { item: 'Truck and dog trailer', pattern: /\btruck and dogs?(?: trailers?)?\b/i, inspection: PRESTART, licence: 'Heavy vehicle driver\'s licence for the combination' },
  { item: 'Cable drum trailer', pattern: /\b(?:cable )?drum trailers?\b/i, inspection: `${PRESTART} Drum shaft, brakes and hitch checked.`, licence: 'No. Operator trained' },
  { item: 'Variable message sign trailer', pattern: /\b(variable message (?:boards?|signs?)|vms boards?)\b/i, inspection: PRESTART, licence: 'No. Placed under the traffic management plan' },
  { item: 'Jacking and skidding system', pattern: /\b(skid(?:ding)? (?:systems?|tracks?|beams?)|jack(?:ing)? and skid\w*)\b/i, inspection: 'Set up and checked by its supplier to the engineered procedure before the move.', licence: 'No. Operated by the supplier\'s trained crew' },
  { item: 'Concrete conveyor', pattern: /\b(concrete conveyors?|conveyor and pump|by conveyor)\b/i, inspection: `${PRESTART} Guards, belt and emergency stops checked.`, licence: 'No. Operator trained' },
  { item: 'Ladders', pattern: /\bladders?\b/i, inspection: 'Industrial rated, at least 120 kg. Checked before each use.', licence: 'No' },
  { item: 'Electric power tools and leads', pattern: /\b(power tools?|grind(?:er|ers|ing)|drill\w*|drop saws?|circular saws?|power saws?|cut-off saws?|reglet saws?|masonry saws?|wet saws?|tile saws?|jackhammers?|demolition hammers?|chas(?:e|ed|er|ers|ing)|leads?|floor scrubbers?|test instruments?)\b/i, skipIf: /\b(core[- ]?drill\w*|stump grind\w*|lead paint|leads? (?:the|to|from|into)|lead(?:s)? hand)\b/i, inspection: TEST_TAG, licence: 'No' },
];

// Hazardous substances that commonly come with the work. The product names and
// quantities are the user's to fill in.
const SUBSTANCES = [
  ['Paints and coatings', /(?<!once )\b(paint\w*|coatings?|enamels?)\b/i],
  ['Solvents and thinners', /\b(solvents?|thinners?|turps)\b/i],
  ['Adhesives', /\b(adhesives?|glues?|vinyl|carpet)\b/i],
  ['Wood dust (MDF and hardwood)', /\b(mdf|particleboard|wood dust|sawdust|(?:cut|saw|sand|rout|machin)\w* [^.\n]{0,30}\b(?:timber|wood|hardwood|mdf|joinery))\b/i],
  ['Sealants, mastics and silicone', /\b(sealants?|mastics?|silicone)\b/i],
  ['Waterproofing membranes and primers', /\b(waterproofing membranes?|liquid membranes?|torch-on|membrane (?:primers?|rolls?)|apply\w* [^.]{0,40}membranes?|waterproof(?:ing)? (?:to|the|wet|balcon))/i],
  ['Epoxy, resins and two-part products', /\b(epoxy|resins?|two-part|two part|2-pack)\b/i],
  ['Cement, concrete, grout and mortar', /\b(cement|wet concrete|concrete (?:pour|plac|finish|truck)\w*|pour\w*|grout|mortar|render|core fill\w*)\b/i],
  ['Plaster, jointing and setting compounds', /\b(plaster\w*|jointing|setting compounds?|set(?:ting)? and sand\w*)\b/i],
  ['Synthetic mineral fibres (insulation)', /\b(insulation(?! boards?)(?!,? where)|glasswool|glass wool|batts|rockwool)\b/i],
  ['Curing compounds and form release agents', /\b(curing compounds?|cur(?:e|ing) (?:the )?concrete|form oil|release agents?)\b/i],
  ['Respirable crystalline silica (concrete, masonry, tile and stone dust)', /\bsilica\b/i],
  ['PVC primer and solvent cement', /\b(solvent cement|pvc primer)\b/i],
  ['Fuels (diesel, petrol)', /\b(diesel|petrol|fuel\w*|refuel\w*|generators?|chainsaws?|excavators?)\b/i],
  ['Gases (LPG, acetylene, oxygen)', /\b(lpg|acetylene|oxy-\w*|oxyacetylene|gas cylinders?|brazing|gas torch\w*|torch-on)\b/i],
  ['Refrigerants', /\brefrigerants?\b/i],
  ['Cleaning chemicals', /\b(cleaning chemicals?|detergents?|acid wash\w*|cleaning products?)\b/i],
  ['Herbicides and termiticides', /\b(herbicides?|termiticides?|termite treatment|weed ?killers?|treat\w* the ground)\b/i],
  ['Bitumen and asphalt', /\b(bitumen|asphalt|hot mix)\b/i],
];

// Licences, tickets and training the work needs.
const QUALIFICATIONS = [
  ['General construction induction (white card)', /./],
  ['Site specific induction', /./],
  ['Electrical work licence (electrical mechanic)', /\b(electrical work|electricians?|electrical installation|switchboards?|distribution boards?|submains?|fit[- ]off|terminat\w*|wiring|cabling|power points?|power circuits?|light switch(?:es)?|(?:install|replac|connect|fit|wir)\w* [^.]{0,30}\b(?:ceiling fans?|hardwired smoke alarms?)|(?<!clean\w* |wip\w* |dust\w* )lighting|(?:install|replac|connect|fit)\w* [^.]{0,30}\b(?:light|led) fittings?|(?:install|replac|connect|add)\w* [^.]{0,30}\b(?:circuits?|outlets?)|(?:ev|electric vehicle|car) chargers?|inverters?|(?<!clean\w* )solar(?! hot water| powered| farm piles?)|(?:pull|install|run|lay|terminat)\w* [^.]{0,20}\bcables?)\b/i],
  ['Plumbing and drainage licence', /\b(vanit(?:y|ies)|plumbing|plumber|(?<!(?:wall|ag|agricultural|subsoil|retaining) )drainage(?! (?:swales?|gravel|cells?|mats?|layers?|boards?|aggregate|sheets?|composites?|fabric|and backfill|behind))|sewer\w*(?! pump stations?)|grease traps?|trade waste|stormwater (?:lines?|pipes?|drains?)|hot water|water suppl(?:y|ies)|water mains?|gas fitting|gasfitting|gas (?:hot water|line|appliance)s?)\b/i],
  ['Refrigerant handling licence (ARC)', /\b(refrigerants?|split systems?|refrigeration|vrf|vrv|condensing units?|(?:install\w*|replac\w*|connect\w*|commission\w*|relocat\w*|remov\w*)\b[^.]{0,20}\b(?:an? |the |new )?(?:wall[- ]mounted |reverse cycle )?air ?condition\w* units?|install\w* (?:split |reverse cycle )?air ?condition\w*)\b/i],
  ['Gas work licence', /\b(?<!medical )(commercial (?:ranges?|cooktops?)|wok (?:burners?|stations?|ranges?)|gas (?:fitting|lines?|pipe\w*|supply|appliances?|hot water|heaters?|heating|meters?|cooktops?|ovens?|boilers?|stoves?|fires?|log fires?|barbecues?|bbqs?)|gasfitt\w*|(?:connect|relocat|disconnect)\w*[^.]{0,30}\bgas\b)\b/i],
  ['Licensed asbestos removalist (Class A or B) with workers holding the VET asbestos removal certification, or asbestos training for non-licensed removal (WHS Reg s 445, s 460)', /\basbestos\b/i],
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
const CATASTROPHIC = /\b(energis\w*|live (?:cables?|parts?|electrical)|electric\w* shock|unsafe equipment|start\w* without warning|rotating parts?|entangle\w*|(?:falls?|falling) (?:from|into|through|off|down)|fall of more|from height|collapse\w*|fails? during|failure|strik\w* [^.]{0,40}\b(?:services?|cables?|gas|electrical)|hidden services|fails?|struck|falling objects?|traffic|vehicle strike|objects? fall\w*|buried|engulf\w*|electric shock|electrocut\w*|energised|struck by|strikes? a person|crush\w*|overturn\w*|rolls? over|drown\w*|asphyxi\w*|explosion|explod\w*|oxygen|toxic|tips? or falls|load falls|swings? into)\b/i;
const MAJOR = /\b(moving parts|ducts or plenums|silica|asbestos|amputat\w*|burns?|fire|hearing|isocyanates?|cancer|fumes?|vapour|hose whip|burst|kickback|impalement|chemical)\b/i;
const MODERATE = /\b(cuts?|strain\w*|back|manual|vibration|noise|dust|knee|eyes?|skin|heat|sun|flying)\b/i;
// Controls that change the hazard itself, rather than relying on people.
const ENGINEERING = /\b(edge protection|guardrails?|guards?|barricad\w*|exclusion zones?|shor\w*|bench\w*|batter\w*|extraction|wet (?:cutting|methods?)|water suppression|isolat\w*|de-?energis\w*|locked out|covers?|scaffolds?|working platforms?|elevating work platforms?|scissor lifts?|ventilat\w*|rcds?|interlock\w*|gantr\w*|trench shields?|props?|propped|certified|engineer's design|catch (?:nets?|platforms?)|fixed deck|toe ?boards?|mesh screens?|vacuum excavat\w*|pothol\w*|hand dig\w*|no one (?:is |works |stands )?(?:in|under|below)|tag lines?|platform ladders?|rated lifting points?|barriers?|separat\w* (?:the work )?from (?:passing )?traffic|landing (?:bays?|platforms?))\b/i;

function consequenceOf(hazards) {
  const text = hazards.join(' ');
  if (CATASTROPHIC.test(text)) return 5;
  if (MAJOR.test(text)) return 4;
  if (MODERATE.test(text)) return 3;
  // Unmatched hazards are rated moderate for the supervisor to confirm, not played down.
  return 3;
}

function rating(likelihood, consequence) {
  return { likelihood, consequence, level: MATRIX[likelihood][consequence - 1], label: `${LIKELIHOOD[likelihood]} x ${CONSEQUENCE[consequence]}` };
}

// A suggested rating before and after the step's controls. Controls are taken to
// lower the likelihood, not the consequence: rare where the hazard itself is
// controlled (guarding, isolation, edge protection), unlikely where it relies on
// how people work.
function riskFor(step) {
  const consequence = consequenceOf(step.hazards || []);
  const before = consequence >= 4 ? 3 : 4;
  const engineered = (step.controls || []).some((line) => ENGINEERING.test(line));
  const after = engineered ? 1 : 2;
  return { before: rating(before, consequence), after: rating(Math.min(after, before), consequence) };
}

// Plant operated or erected by others: the licence belongs to them.
function othersLicence(item, allText, task) {
  if (item.item === 'Mobile crane or crane truck') item = craneClass(item, task);
  // Tube and coupler scaffolds need intermediate scaffolding, hung and suspended scaffolds advanced.
  if (item.item === 'Scaffold' && /\b(hung|suspended) scaffold/i.test(task)) item = { ...item, licence: item.licence.replace('SB, SI or SA', 'SA') };
  else if (item.item === 'Scaffold' && /\btube[- ]and[- ]coupler\b|\bcantilever\w* (?:scaffold|crane loading platform)|\bspur scaffold/i.test(task)) item = { ...item, licence: item.licence.replace('SB, SI or SA', 'SI or SA') };
  if (/crane/i.test(item.item) && /\bcrane company\b/i.test(allText)) return { ...item, licence: `Held by the crane company's operator and crew: ${item.licence.replace(/^Yes,?\s*/, '')}` };
  if (item.item === 'Scaffold' && !/\b(erect\w*|dismantl\w*|alter\w*|build(?!ing\b)\w*|install\w*|put up)\b(?:(?!\b(?:from|off|using|with|on)\b)[^.]){0,40}\bscaffold|\bscaffold\w*\b[^.]{0,20}\b(erect\w*|dismantl\w*)/i.test(task)) return { ...item, licence: `Erected and altered only by a licensed scaffolder (${item.licence.match(/\(([^()]*S[BIA][^()]*)\)/)[1]}) where a fall of more than 4 m is possible. Our crew uses it and does not alter it` };
  if (/Personnel or materials hoist/.test(item.item) && !/\b(erect\w*|install\w*|operat\w*|dismantl\w*)\b[^.]{0,30}\bhoists?\b/i.test(task)) return { ...item, licence: `Held by the principal contractor's licensed hoist operator: ${item.licence.replace(/^Yes,?\s*/, '')}` };
  if (item.item === 'Concrete placing boom' && !/\b(we|our crew|our own)\b[^.]{0,30}\b(operat\w*|run\w*)\b[^.]{0,20}\b(pump|boom)/i.test(allText)) return { ...item, licence: `Held by the pumping company's licensed operator: ${item.licence.replace(/^Yes,?\s*/, '')}` };
  return item;
}

// The crane named in the task sets the licence class (WHS Reg schedule 3): a Franna or
// other articulated crane is non-slewing, and a stated capacity sets the slewing class.
function craneClass(item, task) {
  const sized = String(task || '').match(/\b(\d+(?:\.\d+)?) ?(?:t|tonnes?)\b\s+(?:\w+\s+)?(?:(crawler|mobile|slewing|all terrain|truck) )?cranes?\b/i);
  const crawler = /\bcrawler cranes?\b/i.test(task);
  const name = crawler ? 'Crawler crane' : 'Mobile crane';
  const crew = ', with licensed doggers or riggers';
  if (sized) {
    const t = Number(sized[1]);
    const cls = t > 100 ? 'over 100 t (C0)' : t > 60 ? 'up to 100 t (C1)' : t > 20 ? 'up to 60 t (C6)' : 'up to 20 t (C2)';
    return { ...item, item: `${name} (${sized[1]} t)`, licence: `Yes, slewing mobile crane ${cls}${crew}` };
  }
  if (/\b(frannas?|pick and carry|articulated (?:mobile )?cranes?|non-slewing)\b/i.test(task) && !crawler && !/\b(mobile|slewing|all terrain|tower) cranes?\b/i.test(task)) return { ...item, item: 'Non-slewing mobile crane (Franna or pick and carry)', licence: `Yes, non-slewing mobile crane (CN)${crew}` };
  if (crawler) return { ...item, item: 'Crawler crane', licence: `Yes, slewing mobile crane class for its capacity (C2 up to 20 t, C6 up to 60 t, C1 up to 100 t, C0 over 100 t)${crew}` };
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
    found.push({ item: entry.item, inspection: entry.inspection, licence: entry.licence });
  }
  return found;
}

// Products named in control lines. These are matched only on product names, so a
// control that says to keep clear of something does not list it.
const CONTROL_PRODUCTS = {
  'Paints and coatings': /\btouch-up paint\b/i,
  'Adhesives': /\badhesives?\b/i,
  'Sealants, mastics and silicone': /\b(sealants?|mastics?)\b/i,
  'Epoxy, resins and two-part products': /\b(epoxy|jointing resins?|resins?)\b/i,
  'Cement, concrete, grout and mortar': /\b(cement-based|cementitious|grout|mortar|wet concrete)\b/i,
  'Gases (LPG, acetylene, oxygen)': /\b(lpg|gas torch\w*|acetylene)\b/i,
  'Respirable crystalline silica (concrete, masonry, tile and stone dust)': /\b(?:respirable crystalline silica|silica dust)\b/i,
};

function substancesFor(text, safetyDataSheet, controlText = '') {
  const found = SUBSTANCES.filter(([product, pattern]) => pattern.test(text) || (CONTROL_PRODUCTS[product] && CONTROL_PRODUCTS[product].test(controlText))).map(([product]) => ({ product, sds: '', quantity: '' }));
  return { items: found, note: safetyDataSheet || '' };
}

// Trade licences come from the task itself, not from controls that mention other
// trades' work. Training for a hazard comes from the hazards in the steps.
const TASK_LICENCES = /^(Gas work licence|Electrical work licence|Plumbing and drainage licence|Refrigerant handling|Licensed asbestos|Pest management|Traffic controller|Chainsaw|Commercial operator)/;

function qualificationsFor(taskText, hazardText, allText, plant, highRisk = [], silicaText = hazardText) {
  const needed = QUALIFICATIONS.filter(([name, pattern]) => {
    if (/^Confined space/.test(name)) return highRisk.some((item) => /confined space/i.test(item));
    if (/harness/.test(name)) return /\b(use (?:a )?(?:harness|travel restraint)|fall arrest is used|harness is attached|travel restraint is installed)\b/i.test(allText.replace(/\b(?:where|if|when)\b[^.]*/gi, ""));
    // Work done around another trade's fittings ("mask and cut in around electrical fittings") is not that trade's work.
    // Data, fibre and communications cabling is not electrical work.
    return pattern.test(TASK_LICENCES.test(name) ? ownWork(taskText).replace(/\b(?:around|mask\w*|protect\w*|cut in|clear of)\b[^.]*/gi, '').replace(/\bfit[- ]off (?:of )?(?:the )?(?:plumbing|sanitary|drainage|hydraulic)\b|\b(?:plumbing|sanitary|drainage|hydraulic)\b[^.]{0,20}\bfit[- ]off\b/gi, '').replace(/\b(?:fibre optic|optical fibre|data|communications?|comms|cat ?6a?|structured|telephone|ip)\s+(?:cabling|cables?)(?:\s+and\s+terminations?)?/gi, '') : /silica/.test(name) ? silicaText : /Hot work/.test(name) ? hazardText : allText);
  }).map(([name]) => name);
  if (highRisk.some((item) => /energised electrical/i.test(item)) && !needed.some((name) => /^Rescue/.test(name))) needed.push('Rescue and resuscitation (low voltage rescue and CPR), current');
  for (const item of plant) {
    if (item.item === 'Mobile scaffold') needed.push('Scaffolding licence (SB), only where a person or object could fall more than 4 m from the mobile scaffold');
    if (/^Yes/.test(item.licence)) needed.push(`High risk work licence: ${item.item.toLowerCase()} (${item.licence.split('. ')[0].replace(/^Yes,?\s*/, '').replace(/^\(([^()]*)\)(.*)$/, '$1$2')})`);
  }
  if (/\bWhere the grandstand is built from scaffolding\b/.test(allText)) needed.push('Scaffolding licence (SB, or SI or SA as the scaffold needs), where the grandstand is built from scaffolding and a person or object could fall more than 4 m');
  if (/\bGantries and covered ways in tube and coupler are erected by licensed intermediate scaffolders\b/.test(allText)) needed.push('Scaffolding licence (SI or SA), for gantries and covered ways in tube and coupler');
  if (/\bby workers holding the fire protection licence or accreditation the state requires\b/.test(allText)) needed.push('Fire protection licence or accreditation, as the state requires');
  if (/\bTraffic controllers who hold\b/.test(allText) && !needed.some((name) => /^Traffic controller/.test(name))) needed.push('Traffic controller accreditation, for anyone on our crew who directs traffic');
  // Dogging or rigging by this crew; where the crane company's crew slings, it holds the licences.
  if (/\b(our (?:licensed )?(?:riggers?|doggers?|dogman)|we sling|our crew slings|rigging work|dogging|slung by licensed (?:doggers|riggers))\b/i.test(allText) || /\b(rigg\w*|dogg\w*|sling\w*)\b/i.test(taskText) || /\nErect and connect steel at height\n/.test(`\n${allText}\n`)) needed.push(/\n(?:Erect and connect steel at height|Lift and land steel with the crane company)\n/.test(`\n${allText}\n`) ? 'High risk work licence: basic rigging (RB) or higher, for structural steel erection' : /\bhoist\w* is rigging work\b/i.test(allText) ? 'High risk work licence: basic rigging (RB) or higher, for setting up the hoist (intermediate rigging (RI) for hoists with jibs and self-climbing hoists)' : 'High risk work licence: dogging or rigging (DG, RB, RI or RA)');
  // Precast members need basic rigging, and tilt slabs intermediate rigging (WHS Reg schedule 3 items 5 and 6).
  const ownRigging = !/\bcrane company\b/i.test(allText) || /\b(our (?:licensed )?riggers?|slung by licensed (?:doggers or )?riggers)\b/i.test(allText);
  if (/\nLand and fix the precast floor units\n/.test(`\n${allText}\n`) && ownRigging) { for (let i = needed.length - 1; i >= 0; i -= 1) if (/^High risk work licence: dogging or rigging/.test(needed[i])) needed.splice(i, 1); if (!needed.some((name) => /rigging \(R[BIA]\)/.test(name))) needed.push('High risk work licence: basic rigging (RB) or higher, for precast concrete members'); }
  if (/\btilt-?up\b/i.test(taskText) && /\nStand and brace the precast elements\n/.test(`\n${allText}\n`)) { for (let i = needed.length - 1; i >= 0; i -= 1) if (/^High risk work licence: (?:dogging or rigging|basic rigging)/.test(needed[i])) needed.splice(i, 1); needed.push('High risk work licence: intermediate rigging (RI) or higher, for rigging tilt slabs'); }
  // Dual lifts need at least intermediate rigging (WHS Reg schedule 3).
  if (/\nPlan and do the dual lift\n/.test(`\n${allText}\n`)) { for (let i = needed.length - 1; i >= 0; i -= 1) if (/^High risk work licence: (?:basic rigging|dogging or rigging)/.test(needed[i])) needed.splice(i, 1); needed.push('High risk work licence: intermediate rigging (RI) or higher, for the dual lift'); }
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
  if (/\b(?:overhead |power |electric )(?:power |electric )?lines?\b/i.test(coreText)) rows.push({ type: 'Contact with power lines', equipment: 'Keep everyone well clear of a person, plant or load in contact with a line. Call 000 and the network operator. The operator stays in the plant unless there is fire', detail: '' });
  if (highRisk.some((item) => /energised electrical/i.test(item)) || /\b(energised parts?|live cables?|energised cables?|live electrical parts?)\b/i.test(text)) rows.push({ type: 'Electric shock or arc flash', equipment: 'Isolate the supply before touching the person. Low voltage rescue kit, CPR and defibrillator (AED), burns first aid', detail: '' });
  if (highRisk.some((item) => /trench|shaft/i.test(item))) rows.push({ type: 'Trench', equipment: 'Rescue plan for a trench collapse (Excavation work Code of Practice s 3.8). No one enters an unsupported trench to rescue', detail: '' });
  if (highRisk.some((item) => /drowning/i.test(item))) rows.push({ type: 'Person in the water', equipment: 'Raise the alarm and reach with the rescue pole or throw the life ring. No one enters the water to rescue unless trained and equipped. Call 000', detail: '' });
  if (highRisk.some((item) => /confined space/i.test(item))) rows.push({ type: 'Confined space', equipment: 'Rescue plan and equipment, started from outside the space', detail: '' });
  if (/\bstrik\w* [^.]{0,40}\b(?:underground|buried|hidden)?\s?(?:services?|cables?|gas|electrical)/i.test(text) && !rows.some((row) => /Electric shock/.test(row.type))) rows.push({ type: 'Service strike', equipment: 'Stop work and keep everyone clear. Electrical: do not touch the person or plant until the supply is isolated; CPR and defibrillator (AED). Gas: evacuate upwind, no ignition sources. Call 000 and the asset owner', detail: '' });
  else if (/\bstrik\w* [^.]{0,40}\b(?:services?|gas)/i.test(text)) rows.push({ type: 'Service strike', equipment: 'Stop work and keep everyone clear. Electrical cable: as for electric shock above. Gas: evacuate upwind, no ignition sources. Call 000 and the asset owner', detail: '' });
  if (/\b(gas work|gas fitting|gasfitt\w*|gas appliances?|gas (?:lines?|supply|hot water)|lpg)\b/i.test(text)) rows.push({ type: 'Gas leak', equipment: 'Turn off the gas at the meter or cylinder, no ignition sources, ventilate, keep people away. Call 000 for a major leak', detail: '' });
  if (/\brefrigerants?\b/i.test(text)) rows.push({ type: 'Refrigerant release', equipment: 'Ventilate and leave the area. Frostbite (cold burn): flush with lukewarm water and get medical help', detail: '' });
  if (/\b(chainsaws?|angle grinders?|cut-off saws?)\b/i.test(text)) rows.push({ type: 'Severe bleeding', equipment: 'Trauma first aid kit with pressure bandages, close to the work', detail: '' });
  if (/\b(chemicals?|solvents?|cement|epoxy|acid)\b/i.test(text)) rows.push({ type: 'Chemical splash', equipment: 'Eye wash and running water, and the safety data sheets', detail: '' });
  return rows;
}

// The legislation and codes cited in the steps and controls, grouped.
function legislationFor(lines) {
  const sources = new Set();
  for (const line of lines) {
    const match = /\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*$/.exec(line);
    if (!match) continue;
    for (const part of match[1].split(/;\s*/)) {
      const title = part.replace(/\s+(?:s|ss|r|rr|reg|regs|schedule|appendix|part|chapter|table|section)\s.*$/i, '').trim();
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
  const local = { 'Security equipment installer licence (Security Providers Act 1993 (Qld))': 'Security licence or registration for installing security equipment, under the state\'s security industry law', 'Gas work licence': 'Gas work licence or authorisation for the gas work', 'Electrical work licence (electrical mechanic)': 'Electrical licence (licensed electrician) under the state\'s electrical licensing law', 'Plumbing and drainage licence': 'Plumbing licence or registration under the state\'s plumbing law', 'Pest management licence and QBCC termite licence': 'Pest management licence, and any termite management licence the state requires' };
  // Victoria has its own crystalline silica rules, not the model regulations' high risk processing.
  if (/Victoria/.test(stateName || '')) local['Crystalline silica training (VET accredited or regulator approved), where the processing is high risk'] = 'Crystalline silica information, instruction and training, as the Occupational Health and Safety Regulations 2017 (Vic) require for high risk crystalline silica work';
  const stateId = (findState(stateName) || { id: 'qld' }).id;
  const kept = gasWorkOnly && !/Victoria/.test(stateName || '') ? named.filter((name) => name !== 'Plumbing and drainage licence') : named;
  return [...new Set(kept.map((name) => localText(localNote(local[name] || name, stateId), stateId)))];
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
  if (ids.includes('plumbing') && !gasOnly && /\b(plumb\w*|pipe\w*|drain\w*|sewer\w*|water service|fixtures?|hot water|backflow)\b/i.test(stepText)) add.push('Plumbing and drainage licence');
  return [...new Set([...list, ...add])];
}

// A licence for plant that is one of several options: needed only where that plant is used.
function whereUsed(licence) {
  const [first, ...rest] = licence.split('. ');
  return [`${first}, where one is used`, ...rest].join('. ');
}

function registersFor(draft, input = {}) {
  const steps = draft.jobSteps || [];
  const task = draft.task || '';
  const hazardText = steps.flatMap((step) => step.hazards).join('\n');
  const allText = `${task}\n${steps.flatMap((step) => [step.step, ...step.hazards, ...step.controls]).join('\n')}`;
  // Plant the crew uses: named in the task, the answers and controls table, the
  // step names or the hazards, not every control line that mentions plant to keep
  // clear of.
  // A hazard such as "struck by forklifts" is the site's plant, not the crew's.
  const useText = `${task}\n${(draft.controls || []).map((item) => item.text).join('\n')}\n${steps.map((step) => step.step).join('\n')}\n${hazardText.replace(/\b(?:forklifts?|telehandlers?)\b/gi, '')}`;
  // Control lines that say the crew uses plant, not the ones about keeping clear of it.
  const usedInControls = steps.flatMap((step) => step.controls).filter((line) => /^(?:Nail guns?:|Line marking machines?|Sanders?\b|Mixers?\b|Mixer guards|Lifting beams?\b|Cut and trim bars|A trencher|Trenchers?\b)/.test(line) || /^(?:Use|Using)\b|\b(?:are|is) (?:run|used|operated)(?: only)? (?:by|with)\b|\bcut with\b/i.test(line) && !/\b(?:\w+ )or (?:an? )?(?:forklift|crane|telehandler|ewp|hoist)\b/i.test(line) && !/\b(keep|clear of|away from|others|crane company|pumping company)\b/i.test(line));
  // Lines naming the plant a step is done from or lifted with: definite when one item is named, otherwise each is used where chosen.
  const accessLines = steps.flatMap((step) => step.controls).filter((line) => /^Access is from\b|\b(?:is|are) (?:reached|changed) from (?:an? |the )\b|\b(?:is|are) (?:done|fixed|installed|removed) from (?:an? |the )\b|\b(?:are|is) delivered by (?:crane|hoist)\b|\blifted by crane\b|\b(?:lifted|stood|lifted and stood|lifted in|lifted into place|moved|compacted(?: in layers)?)(?: onto (?:it|the \w+))? with (?:an? |the )\b|\b(?:are|is) (?:run|used|operated)(?: only)? (?:by|with)\b[^.]*\bor\b/i.test(line) && !/\b(keep|clear of|away from|others|crane company|pumping company|considered)\b/i.test(line));
  const forkliftLines = steps.flatMap((step) => step.controls).filter((line) => /\b(forklifts?|telehandlers?)\b/i.test(line) && !/\b(keep|clear of|away from|exclusion|near|separat\w*|barricad\w*)\b/i.test(line));
  // A forklift or telehandler named only in a control line may or may not be used, so its licence is conditional.
  const named = plantFor(`${useText}\n${usedInControls.join('\n')}`).map((item) => item.item);
  const maybe = plantFor(forkliftLines.join('\n')).filter((item) => /^(Forklift|Telehandler)$/.test(item.item) && !named.includes(item.item)).map((item) => ({ ...item, licence: whereUsed(item.licence) }));
  // A generator being installed or load tested is the building's plant, not a portable site generator.
  const buildingGenerator = steps.some((step) => ['Install generators and fuel systems', 'Run and load test generators'].includes(step.step));
  const fromAccess = accessLines.flatMap((line) => { const found = plantFor(line); return found.length > 1 || /\sor\s/i.test(line) ? found.map((item) => ({ ...item, licence: whereUsed(item.licence) })) : found; });
  const accessExtra = [];
  for (const item of fromAccess) if (!named.includes(item.item) && !maybe.some((other) => other.item === item.item) && !accessExtra.some((other) => other.item === item.item)) accessExtra.push(item);
  const plant = [...plantFor(`${useText}\n${usedInControls.join('\n')}`), ...maybe.filter((item) => !accessExtra.some((other) => other.item === item.item)), ...accessExtra].filter((item) => !(buildingGenerator && item.item === 'Generator')).map((item) => othersLicence(item, allText, task));
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
  const substances = substancesFor(`${task}\n${hazardText}\n${steps.map((step) => step.step).join('\n')}`, (input.facts || {}).safetyDataSheet, steps.flatMap((step) => step.controls).join('\n'));
  let sources = legislationFor([...steps.flatMap((step) => step.controls), ...(draft.controls || []).map((item) => item.text)]);
  if (!/Queensland/.test(draft.state || '')) sources = addStateLaw(sources, draft.state);
  const qualifications = withoutNetworkPlumbing(task, withoutElectricalLicence(task, localLicences(draft.state, input.trade, qualificationsFor(task, hazardText, allText, plant, draft.highRisk || [], steps.filter((step) => step.hazards.some((line) => /\bsilica\b/i.test(line)) || (step.hazards.some((line) => /\bdust\b/i.test(line)) && step.controls.some((line) => /\bcrystalline silica\b/i.test(line)))).map(() => 'silica dust').join(' ')), [...steps.filter((step) => step.step !== 'Before starting' && step.step !== 'Finish and clean up').map((step) => step.step), ...((steps.find((step) => step.step === 'Before starting') || { controls: [] }).controls.filter((line) => /^Electrical work is done or supervised only by licensed electric/.test(line)))].join('\n'))));
  if (/Queensland/.test(draft.state || '')) sources = addQldSources(sources, { highRisk: draft.highRisk || [], plant, substances, hazardText, text: allText, workText: `${task}\n${steps.map((step) => step.step).join('\n')}` });
  if (/Queensland/.test(draft.state || '') && qualifications.some((name) => /^Plumbing and drainage licence/.test(name))) sources = { ...sources, legislation: [...new Set([...sources.legislation, 'Plumbing and Drainage Act 2018 (Qld)'])].sort() };
  if (/Queensland/.test(draft.state || '') && qualifications.some((name) => /^Gas work licence/.test(name))) sources = { ...sources, legislation: [...new Set([...sources.legislation, 'Petroleum and Gas (Production and Safety) Act 2004 (Qld)'])].sort() };
  // Register notes cite the state's own regulation.
  const stateId = (findState(draft.state) || { id: 'qld' }).id;
  return {
    plant: plant.map((item) => ({ ...item, inspection: localNote(stateId === 'qld' ? item.inspection : item.inspection.replace(/ Yearly inspection and six-yearly major inspection \(Concrete Pumping Code s 5\)\./, ' Inspected and maintained to the manufacturer\'s instructions, including its periodic and major inspections.'), stateId), licence: localNote(item.licence, stateId) })),
    substances,
    // Silica training where a step's hazards are silica dust, or dust its controls treat as crystalline silica.
    qualifications,
    // Codes of practice are cited only where they have been matched to the state (Queensland so far).
    emergency: emergencyFor(allText, input, draft.highRisk || [], plant, `${task}\n${hazardText}`).map((row) => (stateId !== 'qld' ? { ...row, equipment: row.equipment.replace(/\s?\([^()]*Code of Practice[^()]*\)/g, '') } : row)),
    sources,
    // Before starting is checks and briefings, not a work step, so it is not rated.
    jobSteps: steps.map((step) => ({ ...step, risk: step.step === 'Before starting' ? null : riskFor(step) })),
  };
}

module.exports = { registersFor, MATRIX, LIKELIHOOD, CONSEQUENCE, riskFor, legislationFor };
