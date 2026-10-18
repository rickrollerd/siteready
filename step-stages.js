// The order work is done in (messy round 10, faults 1 and 5: the step order was wrong in every run, round
// after round, and fixing one pair of steps at a time did not hold). Every library job step has a work
// stage, and the steps are put in stage order; inside a stage they keep the order the library and its
// rules give them. A step that can come at any point of the work (an EWP, power tools, a harness) has no
// stage of its own: it goes with the step it is written next to, before it ('lead') or after it ('trail').

// The stages, in the order the work is done.
const STAGES = [
  [0, 'Before starting'],
  [10, 'Set up, access and isolation'],
  [15, 'Deliveries and moving into place'],
  [19, 'Demolition and strip out'],
  [25, 'Set out and ground preparation'],
  [30, 'Excavation'],
  [40, 'Footings, piles and in-ground services'],
  [50, 'Formwork and reo'],
  [60, 'Pour'],
  [70, 'Structure, walls and roof'],
  [78, 'Rough-in'],
  [85, 'Fit-out and equipment'],
  [90, 'Joining, testing and commissioning'],
  [93, 'Backfill and reinstatement'],
  [97, 'Finishes'],
  [105, 'Fit-off'],
  [112, 'Final commissioning'],
  [120, 'Clean up and dismantling'],
  [999, 'Finish and clean up'],
];

// Each step's stage, by name. A number is a stage (with a fraction for an order inside the stage the
// work always follows); 'lead' and 'trail' are steps that go with the step after or before them.
const BY_NAME = {
  'Before starting': 0,
  'Finish and clean up': 999,
  // Set up: planning, protection, permits, isolation by others, site establishment, temporary works up.
  'Set up traffic management': 10, 'Plan the work near overhead power lines': 10, 'Arrange access to the occupied building': 10,
  'Set up and protect the area below': 11, 'Erect the scaffold': 12, 'Inspect and hand over': 13, 'Install and dismantle the hoist': 12,
  'Plan the tower crane lifts': 10, 'Set up the crane': 'lead', 'Install loading platforms': 12, 'Locate underground services': 10,
  'Install construction power': 10, 'Install temporary lighting': 10, 'Inspect, test and maintain construction power': 10, 'Stand the temporary power pole': 10,
  'Confirm the isolation by others before work': 11, 'Confirm the network operator has isolated and earthed the line': 11,
  'Set up rescue equipment': 10, 'Work over the water': 10, 'Work in the rail corridor': 10, 'Enter a private property': 10, 'Work next to the live hospital': 10,
  'Work above traffic or a rail line': 10, 'Work in the car park': 10, 'Separate plant and people on site': 10, 'Set up traffic barriers and temporary fencing': 10,
  'Erect temporary fencing': 10, 'Erect the hoardings': 10, 'Erect the gantry': 12, 'Set up site sheds': 10, 'Install and maintain erosion and sediment controls': 10,
  'Protect neighbouring buildings and the street': 10, 'Protect the footpath': 10, 'Check for asbestos before starting': 10, 'Take samples of suspect materials': 10,
  'Plan core holes': 10, 'Work at podium edges': 10, 'Install or remove edge protection': 10, 'Install anchor points and static lines': 10,
  'Work at open lift shafts and landing doors': 10, 'Plan the heavy lift': 10, 'Plan the dual lift': 10, 'Inspect, test and tag electrical equipment': 10,
  'Erect or dismantle the tower crane': 12, 'Assemble or dismantle the crawler crane': 12, 'Erect the safety screens': 12, 'Erect the temporary stair': 12,
  'Inspect and hand over the temporary stair': 13, 'Install, climb and dismantle the mast climbing work platform': 12, 'Install and use safety nets': 12,
  'Build the temporary bridge': 12, 'Install temporary event power and generators': 12, 'Set up the traffic switch and message signs': 10,
  'Install temporary support': 18, 'Set up the crossover work area': 10, 'Build the vehicle crossover': 10, 'Prepare the piling working platform': 12,
  'Cover the damaged roof with tarps': 12, 'Work in hot conditions': 'trail',
  // Deliveries, unloading and moving materials and plant into place.
  'Haul and deliver the loads on public roads': 11.4, 'Unload with the truck loading crane (hiab)': 11.5, 'Receive plant and move it into position': 15,
  'Deliver and place switchboards': 15, 'Lift materials to and from the roof': 'lead', 'Lift equipment and materials to the roof': 15,
  'Load panels onto the floors and move them to the work face': 15, 'Get soil and plants to the podium': 15, 'Get soil and plants to the roof': 15,
  'Deliver, assemble and dismantle the rig': 15, 'Rig and lift the load': 'lead', 'Land and release the load': 'trail', 'Rig, lift and land loads with the tower crane': 15,
  'Lift machines, rails and equipment into the shaft': 15, 'Load out the floors': 15, 'Carry out the heavy lift': 15, 'Carry out the dual lift': 15,
  'Move the load with transporters or a launching system': 15, 'Jack and skid the load into place': 15, 'Move the load with the transporters': 15,
  'Move materials into place': 16, 'Move loads with a pallet jack or walkie stacker': 16, 'Move membrane rolls and materials': 16, 'Handle glass and panels': 16,
  // Demolition and strip out: services isolated and made safe, asbestos out, then the old work out.
  'Have the supply disconnected': 'lead', 'Isolate and prove de-energised': 'lead', 'Isolate and make safe the old services': 19, 'Isolate the gas and disconnect the old appliance': 19,
  'Disconnect the plant being removed': 19, 'Prepare the asbestos work area': 19, 'Remove the asbestos': 20, 'Break out and remove asbestos cement pits or ducts': 20,
  'Bag, label and dispose of asbestos waste': 21.5, 'Pump out the septic tank': 20,
  'Strip out the room': 21, 'Strip out ceilings, partitions and floor coverings': 21, 'Remove fittings with PCB capacitors': 21, 'Remove the old services': 21,
  'Demolish': 22, 'Demolish the structure': 22, 'Demolish the bridge': 22, 'Remove the props': 23, 'Remove old roofing': 21.7, 'Lift and move out the plant being removed': 21,
  'Remove the fuel tanks': 21, 'Take down the old fence': 21, 'Take down the shed frame': 21, 'Take down the chimney': 21, 'Take down the old roller door': 21,
  'Remove the old frames': 21, 'Cut the lintel bearings': 21, 'Cut out the old lintel': 21, 'Cut an opening in a load-bearing wall': 21, 'Remove old line marking': 21,
  'Remove lead paint': 21, 'Remove bird droppings and nests': 21, 'Remove trees': 21, 'Remove stumps and roots': 21, 'Remove the fallen tree from the roof': 21,
  'Remove the old septic tank': 21, 'Remove the old heater and cap the flue': 21, 'Remove the old fan coil unit': 21, 'Remove the wall': 21, 'Remove cut sections': 21,
  'Lift down the transformer': 21, 'Remove the temporary poles': 21.5, 'Break out damaged concrete': 21, 'Repair the concrete': 22, 'Break out the damaged pit': 21,
  'Break out the cracked tiles': 21, 'Remove the old tiles': 21, 'Break out the old concrete steps': 21, 'Break out the pool': 21, 'Strip flood-damaged linings and insulation': 21,
  'Strip the water-damaged linings': 21, 'Strip wallpaper': 21, 'Strip the old membrane': 21, 'Strip the roof tiles': 21, 'Strip the slates': 21, 'Cut out the damaged floorboards': 21,
  'Rake out the joints': 21, 'Hydro demolish the concrete': 21, 'Clear the collapsed wall': 21, 'Saw cut asphalt': 21, 'Saw cut concrete': 21,
  'Clear vegetation with the mulcher and excavator': 21, 'Cut grass and scrub with a brushcutter': 21, 'Prune the trees': 21, 'Clear the drain with a drain machine or jetter': 21,
  'Clean and inspect the pipe': 21.5,
  // Set out and ground preparation.
  'Set out': 25, 'Prepare the ground': 26, 'Box out the crossover': 26,
  // Excavation.
  'Install the shoring wall': 29, 'Protect the basement edge': 29, 'Provide access into the basement': 29, 'Bulk excavate and load trucks': 30, 'Excavate': 30.5,
  'Dig the trench': 30.5, 'Dig post holes': 30.5, 'Dig footing holes': 30.5, 'Excavate in front of the retention wall': 30.5, 'Dig and support the underpinning pits': 30.5,
  'Hydro excavate with the vacuum truck': 30, 'Drill the blast holes': 30, 'Charge and fire the blast': 30, 'Excavate and set out the retaining wall': 30, 'Build the retaining wall': 30,
  'Break rock with a hydraulic hammer': 31, 'Cut rock with a rock saw': 31, 'Dewater the excavation': 31, 'Drill with the drill rig': 31,
  'Install and later remove ground anchors': 31, 'Stress the ground anchors': 31, 'Install and later remove props': 31, 'Excavate pile caps, lift pits and trenches': 47,
  // Footings, piles and in-ground services.
  'Drill and install piles': 40, 'Pitch and drive the piles': 40, 'Run the ground improvement rig': 40, 'Install and extract temporary casing': 40, 'Mix and handle bentonite or polymer support fluid': 40,
  'Lift, pitch and lower reinforcement cages': 43, 'Lift and plunge cages into the fresh CFA pile': 43, 'Place the reinforcement cage and concrete the pile': 44, 'Place concrete in the piles': 44,
  'Trim pile heads': 46, 'Bore under the road or ground with a directional drill': 40, 'Bore under the waterway with the directional drill': 40,
  'Isolate and repair the main': 39, 'Lift and place tanks, pits or precast units': 39, 'Reline the pipe': 40, 'Cut out and replace the pipe section': 40,
  'Lay pipes': 40, 'Install pits': 40, 'Lay conduits': 40, 'Lay the pipe or cable': 40, 'Lay the cable': 40, 'Lay the pipes': 40, 'Install pits and conduits': 40,
  'Lay drainage under the slab or floor': 40, 'Set floor wastes, slot drains and floor gutters': 40, 'Install the pump-out line': 40, 'Install the cattle grid': 42,
  'Butt fuse polyethylene pipe': 41, 'Join polyethylene pipe by electrofusion': 90, 'Stand the poles': 41, 'Stand and fix the poles': 41, 'Stand the shade sail posts': 41, 'Stand and fix the solar light poles': 41,
  'Set and fix the letterbox bank': 41, 'Trim and compact the base by hand': 41, 'Place the blinding concrete': 42, 'Form, fix reo and pour concrete in the excavation': 45,
  'Dig and pour footings': 41, 'Dig and pour the footings': 41, 'Drill and inject under the slab': 40, 'Dig and pour': 41,
  // Formwork and reo (precast floor units and metal decking are the deck a topping is poured on).
  'Land and fix the precast floor units': 48, 'Lay metal decking': 48, 'Weld shear studs': 48.5, 'Prepare to climb the jumpform': 49, 'Climb the jumpform': 49,
  'Set edge forms and prepare the base': 50, 'Erect falsework and shores': 50, 'Install edge protection': 50, 'Lay the formwork deck': 50, 'Load ply onto the deck while it is being laid': 50,
  'Form penetrations and voids': 50, 'Form the retaining wall': 50, 'Stand and brace wall and column forms': 50, 'Form the tank walls': 50, 'Fix the wall reo from the platforms': 50,
  'Set the wall forms from the platforms': 50, 'Place and tie reo on the ground': 51, 'Lift reo onto the deck': 51, 'Load reo onto the deck': 51, 'Place and tie reo': 51,
  'Fix the retaining wall reo': 51, 'Fix the tank wall reo': 51, 'Fix the pool shell reo': 51, 'Place post-tensioning ducts and tendons': 52,
  'Install cast-in conduits on the deck before the pour': 52, 'Install cast-in sleeves and puddle flanges on the deck before the pour': 52, 'Fix cast-in items and ferrules before the pour': 52,
  'Inspect before the pour': 55,
  // Pour.
  'Set up the concrete pump and placing boom': 58, 'Set up the concrete pump': 58, 'Mix bagged concrete': 59, 'Place concrete': 60, 'Pump and place concrete': 60,
  'Pour the core walls': 60, 'Pour the retaining wall': 60, 'Pour the tank walls': 60, 'Spray the pool shell': 60, 'Spray the shotcrete': 60,
  'Form and pour the kerb and channel': 60, 'Form and pour the new concrete steps': 60, 'Monitor the formwork during the pour': 61, 'Finish the concrete': 62, 'Finish concrete': 62,
  'Saw cut the joints': 63, 'Cure the concrete': 64, 'Stress the tendons': 64, 'Cut the tendon tails': 65, 'Grout the tendon ducts': 65.5, 'Strip the formwork': 66, 'Install backprops': 67,
  // Structure, walls and roof.
  'Lift and land steel with the crane company': 69, 'Mix mortar': 69, 'Erect and connect steel at height': 70, 'Install and remove temporary bracing': 71, 'Weld steel': 72, 'Weld aluminium': 72,
  'Land steel on temporary support towers': 70, 'Erect the mass timber panels and beams': 70, 'Lift and set the modules': 70, 'Lift and set the bathroom pods': 70,
  'Stand and brace the precast elements': 70, 'Grout the base': 72, 'Remove the braces': 75, 'Land and fix the precast stair': 70, 'Place precast seating units on the rakers': 70,
  'Install the seating units and tiers': 70, 'Lay blocks and bricks': 70, 'Core fill blockwork': 72, 'Build and fill gabion baskets': 70, 'Build the stone wall': 70,
  'Stand the noise wall posts and panels': 70, 'Build the fence': 70, 'Stand and brace wall frames': 70, 'Lay floor joists': 70, 'Lay the floor deck': 70, 'Build the deck frame': 70,
  'Fix roof trusses': 71, 'Erect the frame': 70, 'Erect the posts, beams and rafters': 70, 'Build the cubby house': 70, 'Lift and fix the purlins': 71, 'Lift and fix the new beam or lintel': 70,
  'Fit cyclone tie-downs': 72, 'Jack the house and replace stumps': 70, 'Jack and raise the house': 70, 'Prop the floor and replace joists or bearers': 70, 'Prop and repair the verandah': 70,
  'Prop and repair the pergola': 70, 'Prop and replace the damaged wall framing': 70, 'Remove and replace damaged timbers': 70, 'Remove and replace the deck boards': 70,
  'Cut slots and fit the helical ties': 70, 'Build in underneath the raised house': 72, 'Build the access ramp': 72, 'Lay the mezzanine floor': 72, 'Jack the deck and replace the bearings': 70,
  'Lift the tank onto the stand': 72, 'Build the tank stand': 70, 'Install the rainwater tank': 73, 'Lift the portable building onto its footings': 72, 'Install the ground mount frame': 70,
  'Lift and erect the tower sections': 70, 'Erect and dismantle the temporary grandstand': 70, 'Dismantle the temporary grandstand': 70, 'Erect the marquees and temporary structures': 70,
  'Build the stage': 70, 'Widen the station platform': 70, 'Build the helipad at the roof edge': 70, 'Install the steel staircase': 72, 'Build and fix the staircase': 72, 'Replace the timber stairs': 72,
  'Install access ladders, platforms and walkways': 73, 'Lay the decking': 74, 'Install balustrades at open edges': 76, 'Fix the shade fabric': 75, 'Fit and tension the shade sails': 75,
  'Install safety mesh': 74, 'Install sarking': 74, 'Lay the sarking': 74, 'Fix new roof battens': 74, 'Fix roof battens to the trusses': 74, 'Fix new roofing': 75, 'Fix the roof': 75,
  'Lay the roof tiles': 75, 'Lay the slates': 75, 'Replace the pergola roof sheets': 75, 'Install the fabric roof membrane': 75, 'Fix the battens': 76, 'Install the external cladding': 77,
  'Replace the cladding boards': 77, 'Fix the stone cladding': 77, 'Fix the fascia': 76, 'Replace the fascia boards': 76, 'Install gutters and downpipes': 76, 'Install downpipes': 76,
  'Install the eaves linings': 77, 'Fit the new eave lining': 77, 'Replace the box gutter': 76, 'Replace the flashing': 76, 'Replace the valley iron': 76, 'Rebed the tiles': 76.5,
  'Repair the roof membrane': 76, 'Find and repair the roof leak': 76, 'Cut in and install the skylight': 76, 'Remove and replace the damaged skylight': 76, 'Remove and replace the damaged skylights': 76,
  'Cut and flash the roof penetration': 76, 'Fix fittings on the roof': 78, 'Install bird netting at height': 78, 'Install bird spikes at height': 78, 'Wrap columns with fibre reinforced polymer': 76,
  'Fit and grout the pile jacket': 76, 'Seal and inject cracks': 76, 'Take down and replace the awning': 76, 'Cut out and replace the steel handrail': 76, 'Cut out and replace the window sill': 77,
  'Drill fixing holes in the slab edge': 75.5, 'Fix brackets at the slab edge': 76, 'Lift panels with the floor crane or monorail': 77, 'Install panels at the open slab edge': 77,
  'Install windows': 77, 'Replace the window frame': 77, 'Install the shopfront frames': 77, 'Install doors': 77, 'Install louvres': 77,
  'Replace the broken louvre blades': 77, 'Drill tiled walls for fixings': 77.5, 'Handle and install glass panels': 86,
  // A shopfront's glass doors are hung once its frames are glazed (messy round 12, run 4: the doors were hung before the
  // glass went in).
  'Hang the shopfront doors': 86.2, 'Seal glazing': 86.5, 'Seal the facade joints': 79, 'Handle glass in the wind': 'lead',
  'Install cyclone shutters': 85, 'Erect coolroom panels': 82,
  // Rough-in.
  'Remove the old board and fit the new one': 79, 'Set and fix the substation equipment': 79, 'Core drill through the slab or wall': 78, 'Fix hangers and supports': 79,
  'Install cable tray and containment': 80, 'Install communications containment': 80, 'Rough-in': 80, 'Plumbing rough-in': 80, 'Install risers and pipework': 80,
  'Open the pits and haul the cable through the conduits': 80.5, 'Install cabling': 81, 'Pull cables and handle cable drums': 81, 'Pull in and terminate the cables': 81,
  'Pull communications cabling': 81, 'Haul the optical fibre cable': 81, 'Install ductwork': 81, 'Install mechanical pipework': 81, 'Run and fix refrigerant pipe and pair coil': 81,
  'Install sprinkler pipework': 81, 'Install hydrant pipework': 81, 'Replace pipework in the ceiling': 81, 'Install pneumatic tube pipework in ceilings': 81, 'Install fuel lines': 81,
  'Lay and fix the hydronic pipes': 81, 'Run the sub-mains': 85.5, 'Install the overhead wiring': 81, 'Prepare and terminate the high voltage cables': 81,
  'Frame walls and bulkheads': 78.5, 'Cut and fix steel studs and track': 78.5, 'Install insulation': 82, 'Fix insulation boards to the slab soffit': 82, 'Spray polyurethane foam insulation': 82,
  'Install the MRI room shielding': 82, 'Install lead shielding': 82, 'Fix fire collars to the slab': 82, 'Fit the fire dampers': 82, 'Lay underfloor heating cables': 82,
  // Fit-out and equipment.
  'Install clean room walls and ceilings': 83, 'Cut and fix plasterboard': 83, 'Cut plasterboard': 83, 'Move and fix plasterboard sheets': 84, 'Fix ceiling sheets': 84,
  'Fix new wall sheets': 84, 'Install suspended grid ceilings': 84, 'Install raised access flooring': 84, 'Fix plant on its supports': 79.5, 'Move and set the boiler': 84,
  'Install plant and equipment on the roof': 79.6, 'Install split system indoor and outdoor units': 85, 'Fix the units in place': 85, 'Install the exhaust hood': 85,
  'Deliver and install commercial kitchen equipment': 85, 'Install commercial laundry machines': 85, 'Set and connect the appliance': 85, 'Install the heater and flue': 85,
  'Install and connect the pool heater': 85, 'Disconnect and connect the water heater': 85, 'Set and connect the water heater': 85, 'Install the pool plant': 85, 'Install the chemical dosing': 85,
  'Install the pool pump and filter': 85, 'Install the battery system': 85, 'Install the generators': 85, 'Install the fuel tanks and fuel lines': 85, 'Install boilers and pressure vessels': 85,
  'Connect the boiler': 86, 'Install the lift rails, car and machine': 85, 'Install the platform lift': 85, 'Install the stair lift': 85, 'Install the dumbwaiter': 85, 'Install the vehicle hoist': 85,
  'Install the escalator': 85, 'Replace escalator parts': 85, 'Replace the lift motor in the machine room': 85, 'Replace the lift controller': 85, 'Install comms racks and cabinets': 79.8,
  'Install comms equipment': 86, 'Install the fire detection and alarm system': 85, 'Install the gas suppression system': 85, 'Install the hydrant booster assembly': 85,
  'Install the sprinkler booster valve set': 85, 'Mount the sub-board': 79.8, 'Mount and wire the control panel': 79.8, 'Replace the meter box and consumer mains connection': 85,
  'Install the ceiling pendants': 85, 'Install sports lighting': 85, 'Install the screens': 85, 'Rig the lighting': 85, 'Hang the speakers and equipment from the roof structure': 85,
  'Install rooftop antennas and equipment': 85, 'Install antennas and equipment on the tower': 85, 'Maintain antennas and equipment on the tower': 85, 'Maintain rooftop antennas and equipment': 85,
  'Install the fume cupboards': 85, 'Install the exhaust fan and stack on the roof': 85, 'Install the conveyors': 85, 'Install pallet racking': 85, 'Install the dock leveller': 85,
  'Install the building maintenance unit': 85, 'Install the sauna': 85, 'Place and connect the spa': 85, 'Install playground equipment': 85, 'Install the grey water system': 85,
  'Install the solar panels': 85, 'Install solar panels and mounting rails on the roof': 85, 'Fix the solar collectors and tank frame to the roof': 85, 'Install the pump': 85,
  'Install the pump and pipework': 85, 'Lower in and connect the new pump': 85, 'Isolate and lift out the failed pump': 21, 'Install boom gates and automatic gates': 85,
  'Install the gate opener': 85, 'Install the barrier arm': 85, 'Install the door': 85, 'Install the roller door': 85, 'Install the door motor': 86, 'Replace the roller door spring': 85,
  'Install car park fans over traffic areas': 85, 'Lift and fix the tunnel ventilation fans': 85, 'Lift the fan coil unit into place and fix it': 85, 'Install lightning protection': 85,
  'Erect the plant': 85, 'Install the moveable pool floor and bulkheads': 85, 'Build the outdoor kitchen': 85, 'Install bollards': 85, 'Install barriers': 85, 'Install road safety barrier': 95,
  'Stand the door frames': 78.6, 'Hang the doors': 97.8, 'Install and commission the automatic doors': 86, 'Fit security doors': 86, 'Install joinery and cabinets': 87,
  'Remove and fit the benchtops': 87, 'Move and set heavy benchtops': 87, 'Cut and finish stone and porcelain benchtops': 'lead', 'Remove, repair or modify installed engineered stone': 87,
  'Fix skirting and architraves': 97.8, 'Remove and fit the vanity': 87, 'Install vanities and fixtures': 87, 'Remove and replace the bath and shower': 87, 'Remove and replace the bath': 87,
  'Remove and replace the shower': 87, 'Replace the fixture': 87, 'Install signs and screens': 98, 'Install signs on posts': 98, 'Install the signs': 98,
  // Waterproofing goes on before its flood test and the tiles over it.
  'Prepare surfaces by grinding': 87, 'Grind concrete': 'trail', 'Lay the screed': 88, 'Apply primers and liquid membranes': 88, 'Lay torch-on membranes': 88, 'Waterproof walls below ground': 88,
  // Joining, testing and commissioning.
  'Braze and solder pipe joints (hot work)': 90, 'Braze refrigerant pipework': 90, 'Braze medical gas pipework': 90, 'Join PVC pipe with primer and solvent cement': 90,
  'Splice and test optical fibre': 90, 'Pressure test with nitrogen': 90.5, 'Pressure test the gas line': 90.5, 'Pressure test the hydronic pipes': 90.5, 'Pressure test and commission': 90.5,
  'Test the high voltage cables': 90.5, 'Set up the flood test': 90.5, 'Check and drain the flood test': 90.6, 'Holiday test the membrane': 90.5, 'Lay protection board over the membrane': 91,
  'Connect to the live sewer': 91, 'Connect to the water supply': 91, 'Install water meters and backflow devices': 90.8, 'Install the backflow device': 90.8, 'Insulate ductwork and pipework': 91,
  'Test and connect to live medical gas services': 91, 'Seal penetrations and fire stop': 92, 'Check the steel and the area before spraying': 92, 'Spray the fire protection coating': 92,
  // Backfill and reinstatement.
  'Install drainage behind the retaining wall': 92, 'Lay the drainage cell': 92, 'Place the rock lining': 92, 'Backfill behind the retaining wall': 93, 'Backfill the trench': 93,
  'Backfill the tree pits': 93, 'Fill the pool void': 93, 'Compact with the rolling impact compactor': 93, 'Spread and compact the gravel': 94, 'Reinstate the surface': 94,
  'Reinstate asphalt': 95, 'Lay and roll asphalt': 95, 'Spray seal the road': 95, 'Lay and cut pavers': 96, 'Line the basin with a geomembrane liner': 93,
  // Finishes.
  'Abrasive blast the surfaces': 97, 'Water blast the surfaces': 97, 'Pressure clean surfaces': 97, 'Prepare and grind floors': 97, 'Set the joints': 97, 'Sand the joints': 97.5,
  'Prepare to paint': 98, 'Sand and fill surfaces': 98, 'Prepare the steel surfaces': 98, 'Set up access to the outside of the structure': 'lead', 'Paint the outside of the structure at height': 'lead',
  'Apply primers and levelling compounds': 98, 'Lay the acoustic matting': 98.5, 'Build the raised garden beds': 97, 'Install the green roof layers': 98, 'Install the green wall': 98,
  'Apply flooring adhesives': 99, 'Mix and spread the tile adhesive': 99, 'Move soil and mulch': 99,
  'Paint': 100, 'Paint the roof': 100, 'Apply solvent-based paint': 100, 'Spray paint with airless sprayers': 100, 'Lay floor coverings': 100, 'Lay timber floors': 100, 'Lay tiles': 100,
  'Fix the wall tiles': 100, 'Apply epoxy or polyurethane floor coatings': 100, 'Lay the synthetic track or sports surface': 100, 'Install clean room flooring': 100, 'Lay artificial turf': 100,
  'Lay the rubber softfall': 100, 'Apply render to walls': 100, 'Repoint the masonry': 100, 'Mix and apply the pebble finish': 100, 'Install tactile indicators': 100, 'Fix acoustic panels to the walls': 100,
  'Replace the ceiling tiles': 100, 'Apply the window film': 100, 'Paint line marking': 100, 'Heat and lay thermoplastic markings with a gas torch': 100, 'Install speed humps': 100, 'Install wheel stops': 100,
  'Grout the tiles': 101, 'Sand timber floors': 101, 'Strip and sand the deck': 101, 'Clean out and seal floor joints': 101, 'Plant': 101, 'Plant the green roof': 101, 'Lay turf': 101,
  'Clean down the brickwork': 101, 'Acid wash the pebble finish': 101, 'Install raised pavement markers': 101, 'Rout and seal the cracks': 101, 'Rake out and reseal the joints': 101,
  'Apply sealer to the tiles and grout': 102, 'Coat timber floors': 102, 'Oil or stain the deck': 102, 'Apply sealers to concrete, pavers or timber': 102, 'Apply sealer to the stone': 102,
  'Apply sealant and caulking': 103, 'Clean brushes and rollers': 104, 'Remove graffiti with chemicals': 100,
  // Fit-off.
  'Fit off': 105, 'Plumbing fit-off': 105, 'Install, connect and test the eyewash station': 105, 'Fit locks, closers and other hardware': 105, 'Fit fly screens': 105, 'Fit security screens': 105,
  'Fit fly and security screens': 105, 'Fix rails, fittings and equipment to walls and floors': 105, 'Fix the handrails to the boardwalk': 105, 'Mount the Wi-Fi access points': 105,
  'Terminate the data outlets and patch panels': 105, 'Install security devices': 105, 'Install the security devices and door strikes': 105, 'Mount the hose reels and extinguishers': 105,
  'Install high bay light fittings': 105, 'Install the smoke alarms': 105, 'Fix the bike racks': 105, 'Fit and connect the pool light': 105, 'Replace the gas regulator': 105,
  'Disconnect the old appliance and connect the new one': 105, 'Replace the pit lid or grate': 105, 'Install the stair lift': 85,
  // Final commissioning, after the fit-off.
  'Test the new work': 112, 'Connect and commission': 112, 'Connect the solar array and inverter': 110, 'Connect the inverter and battery': 110, 'Connect the inverter': 110,
  'Connect a temporary generator to the installation': 110, 'Commission and balance the system': 112, 'Commission hot water': 112, 'Commission boilers and pressure vessels': 112,
  'Connect, leak test and commission the gas appliance': 112, 'Evacuate and charge the system': 112, 'Recover refrigerant': 21, 'Commission the plant': 112, 'Run and load test generators': 112,
  'Connect and test the earthing': 89, 'Drive or drill the earth stakes': 40, 'Label pipes, ducts and equipment': 113, 'Label cables and equipment': 113, 'Leave unfinished work safe': 111,
  // Clean up and dismantling of temporary works.
  'Cart rubbish to the site bins': 120, 'Clean up the work area': 120, 'Load skips and bins': 120, 'Send waste down the rubbish chute': 120, 'Move full bins to the hoist': 120,
  'Wash out tools at the washout bay': 120, 'Remove hazardous waste': 120, 'Stockpile and cover spoil': 30.8, 'Cart away spoil': 30.9, 'Dismantle the scaffold': 121,
  'Dismantle the safety screens': 121, 'Dismantle the temporary stair': 121, 'Lift the safety screens with the hydraulic lifters': 'trail',
  // Steps that go with the step next to them: the way up, plant use, tools, and work in a place.
  'Use an elevating work platform': 'lead', 'Use mobile scaffolds': 'lead', 'Work from ladders': 'lead', 'Work from the scaffold': 'lead', 'Work from trestle platforms': 'lead',
  'Work from a swing stage': 'lead', 'Paint from a swing stage': 'lead', 'Work in a harness': 'lead', 'Work at edges': 'lead', 'Work near slab edges': 'lead', 'Work near balcony edges, voids and penetrations': 'lead',
  'Work at the upper wall and ceiling line': 'lead', 'Reach high walls and ceilings': 'lead', 'Work over the stair void': 'lead', 'Work in the roof space': 'lead', 'Get onto the roof': 'lead',
  'Set up roof access': 'lead', 'Set up roof fall protection': 'lead', 'Install roof edge protection': 'lead', 'Work on a tiled roof': 'lead', 'Work on a slate roof': 'lead',
  'Work with the crane crew during lifts': 'lead', 'Lift people in the crane workbox': 'lead', 'Operate small earthmoving plant': 'lead', 'Run earthmoving plant': 'lead',
  'Operate forklifts': 'lead', 'Operate the telehandler': 'lead', 'Set up and use laser levels': 'lead', 'Work on the jumpform platforms': 'lead', 'Set up and use the floor crane or monorail': 'lead',
  'Set up and use the brick elevator': 'lead', 'Climb the hoist mast': 'lead', 'Operate the hoist': 'lead', 'Climb the tower': 'lead', 'Work on the car top and in the pit': 'lead',
  'Work inside lift cars': 'lead', 'Work in pump rooms': 'lead', 'Work on live fire systems': 'lead', 'Work inside a deep excavation': 'lead', 'Work in the trench': 'lead',
  'Prepare to enter the confined space': 'lead', 'Enter and work': 'trail', 'Leave and close up': 'trail', 'Cut blocks and bricks': 'lead', 'Cut tiles and stone': 'lead',
  'Cut timber flooring to size': 'lead', 'Lay tiles near open edges': 'lead', 'Roll groove, thread and cut pipe': 'lead', 'Handle gas cylinders and manifolds': 'lead',
  'Run the road plant inside the work zone': 'lead', 'Work from the barge or marine plant': 'lead', 'Lift loads into and out of the shaft': 'trail', 'Work in the precast yard': 'lead',
  'Use power tools': 'trail', 'Drill or cut concrete, masonry or stone': 'trail', 'Fix with a powder-actuated tool': 'trail', 'Cut steel with oxy-acetylene (hot work)': 'trail',
  'Work on or near energised parts': 'trail', 'Isolate plant before work on it': 'lead', 'Protect open bores': 'trail', 'Mix and pump the grout': 'trail',
  'Handle contaminated or unknown material in the spoil': 'trail', 'Treat the ground with chemicals': 'trail', 'Repair the pipe in the pit': 'trail', 'Clean out the wet well': 'trail',
  'Work near live fuel, chemical or refrigerant lines': 'lead', 'Refuel plant on site': 'trail', 'Service and repair mobile plant on site': 'trail',
  // Whole-task work (a step that is all of its task): no order to keep with other work.
  'Rectify defects in the occupied building': 'trail', 'Carry out preventative maintenance on plant': 'trail', 'Isolate the conveyor and replace parts': 'trail',
  'Clean around a conveyor that is running': 'trail', 'Run the processing plant': 'trail', 'Maintain the processing plant': 'trail', 'Run the crushing and screening plant': 'trail',
  'Maintain the crushing and screening plant': 'trail', 'Run the batching plant': 'trail', 'Maintain the batching plant': 'trail', 'Work underground in the tunnel': 'trail',
  'Work at the TBM launch or retrieval shaft': 'lead', 'Launch or receive the TBM': 'trail', 'Run the dredge and discharge line': 'trail', 'Service and repair the rooftop units': 'trail',
  'Clean the kitchen exhaust duct': 'trail', 'Clean the solar panels': 'trail', 'Clean the gutters and downpipes': 'trail', 'Clean windows from the building maintenance unit': 'trail',
  'Clean windows and balconies': 'trail', 'Clean windows from the EWP': 'trail', 'Clean with chemicals': 'trail', 'Clean floors, fixtures and plant rooms': 'trail', 'Clean the stands and aisles': 'trail',
  'Place material with a blower truck': 'trail', 'Place material with a slinger truck': 'trail', 'Place and anchor the pontoon': 'trail', 'Repair the gate': 'trail', 'Cut the opening and fit the access hatch': 'trail',
  'Cut and machine timber and board in the workshop': 'trail', 'Assemble, sand and finish joinery': 'trail', 'Move and store finished joinery': 'trail', 'Build the switchboard enclosure': 'trail',
  'Fit out and interwire the switchboard': 'trail', 'Test the switchboard in the workshop': 'trail', 'Move and load finished switchboards': 'trail', 'Pre-treat items for powder coating': 'trail',
  'Powder coat in the booth': 'trail', 'Clean the booth and handle powder': 'trail', 'Cut metal in the workshop': 'trail', 'Drill, punch and rivet metal parts': 'trail', 'Grind and finish metal': 'trail',
  'Weld in the workshop': 'trail', 'Move and store fabricated items': 'trail', 'Replace the sleepers and ballast': 'trail', 'Tamp and regulate the ballast': 'trail', 'Lay the new track': 'trail',
  'Launch the girders': 15, 'Install fuel dispensers': 85, 'Place the underpinning and remove the shoring': 45, 'Drill the tiers and fix seats': 85,
};

// Where the same steps are done in another order for this work, by the steps named and the task's flags.
// - Tree pits: the tree is planted, then its pit backfilled and the surface reinstated.
// - A shallow trench to a fixture: the fixture is connected before the trench is backfilled.
// - Doors painted or sealed "before hanging" (messy round 10, run 4): the paint steps come before the doors are hung.
// - Core fill with no block laying in the SWMS is one of the pours.
const PAINT_STEPS = ['Prepare to paint', 'Sand and fill surfaces', 'Paint', 'Apply solvent-based paint', 'Spray paint with airless sprayers', 'Clean brushes and rollers'];
// - Isolation and energised work on new work go with the testing and connection at the end (messy round 11, runs 2 and
//   3: "Isolate and prove de-energised" and "Work on or near energised parts" came before any installation). Where the
//   task works on existing plant (strip out, removal, replacement, repair or maintenance), they lead into that work.
const EXISTING_WORK = /^(?:Remove|Replace|Disconnect|Repair|Maintain|Service|Rectify|Isolate the|Isolate and lift|Lift down|Strip|Demolish|Take down|Break out|Cut out)\b/;
const existingWork = (names) => [...names].some((name) => EXISTING_WORK.test(name) || (typeof BY_NAME[name] === 'number' && BY_NAME[name] >= 19 && BY_NAME[name] < 24));
function contextStages(names, flags = {}) {
  const has = (name) => names.has(name);
  const out = {};
  if (!flags.existingLive && !existingWork(names)) Object.assign(out, { 'Isolate and prove de-energised': 109.5, 'Work on or near energised parts': 110 });
  if (flags.treePits || has('Backfill the tree pits')) Object.assign(out, { 'Backfill the trench': 101.5, 'Backfill the tree pits': 101.5, 'Reinstate the surface': 101.6 });
  if ((has('Plumbing fit-off') || has('Fit off')) && ['Dig the trench', 'Lay the pipe or cable', 'Lay the pipes', 'Lay the cable'].some(has) && !['Lay pipes', 'Lay conduits', 'Install pits'].some(has)) Object.assign(out, { 'Backfill the trench': 106, 'Reinstate the surface': 106.5 });
  if (flags.paintBeforeHang && (has('Hang the doors') || has('Install doors'))) for (const name of PAINT_STEPS) out[name] = has('Hang the doors') ? 97.7 : 76.5;
  // Core fill in blockwork others laid is one of the pours, finished and cured with them (messy round 9, run 2); where the
  // crew lays the blocks too, it follows the laying (round 10, run 3).
  if (!has('Lay blocks and bricks')) out['Core fill blockwork'] = 60.5;
  return out;
}

const FLOAT = new Set(['lead', 'trail']);
// A step written by the user, or one the library does not name, has no stage: it stays next to the step
// it was placed beside.
const own = (map, name) => Boolean(map) && Object.prototype.hasOwnProperty.call(map, name);
const stageOf = (name, context) => (own(context, name) ? context[name] : own(BY_NAME, name) ? BY_NAME[name] : null);

// The way up and places of work at height (an EWP, scaffolds, ladders, the roof space, edges) lead into the first
// work done from them, not into a set-up or delivery step that happens to follow them (messy round 11, run 3: the EWP
// and the roof space went with the isolation, before the plant was received). Their run goes before the earliest
// work step (demolition onwards) that follows it.
const ACCESS = new Set(['Use an elevating work platform', 'Use mobile scaffolds', 'Work from ladders', 'Work from the scaffold', 'Work from trestle platforms',
  'Work from a swing stage', 'Work in a harness', 'Work at edges', 'Work near slab edges', 'Work near balcony edges, voids and penetrations', 'Work at the upper wall and ceiling line',
  'Reach high walls and ceilings', 'Work over the stair void', 'Get onto the roof', 'Set up roof access', 'Set up roof fall protection', 'Install roof edge protection']);
const WORK_FROM = 19;
// A step whose own hazards include a fall from height.
const FALL_HAZARD = (step) => Array.isArray(step && step.hazards) && step.hazards.some((line) => /\b(?:a (?:person )?falls?|falls? (?:from|off|through)|fall from (?:height|a ladder|a platform|the platform))\b/i.test(typeof line === 'string' ? line : (line && line.text) || ''));
// A step that leads into work, with nothing after it to lead into, goes where that work starts (messy round 11, run 8:
// "Run earthmoving plant" printed after the reinstatement).
// Earthmoving plant works in the demolition, the dig and the backfill: it goes before the first of those.
const EARTHMOVING = (stage) => (stage >= 22 && stage < 48) || (stage >= 93 && stage < 97);
const HOME = { 'Run earthmoving plant': EARTHMOVING, 'Operate small earthmoving plant': EARTHMOVING };

// The steps in stage order. Steps with no stage go with the staged step they are written before
// ('lead') or after ('trail', and any step not named in the library); a run of them goes as one, by
// its first step. Staged steps of the same stage keep their order.
function inStageOrder(steps, nameOf = (step) => step.step, flags = {}) {
  const list = Array.isArray(steps) ? steps : [];
  const context = contextStages(new Set(list.map(nameOf)), flags);
  const stages = list.map((step) => stageOf(nameOf(step), context));
  if (stages.filter((stage) => typeof stage === 'number').length < 2) return list;
  const blocks = [];
  const byIndex = new Map();
  list.forEach((step, index) => {
    if (typeof stages[index] !== 'number') return;
    const block = { stage: stages[index], before: [], steps: [step], after: [], index: blocks.length };
    blocks.push(block);
    byIndex.set(index, block);
  });
  // The runs of unstaged steps, each placed by its first step.
  for (let index = 0; index < list.length; index += 1) {
    if (typeof stages[index] === 'number') continue;
    const start = index;
    while (index + 1 < list.length && typeof stages[index + 1] !== 'number') index += 1;
    const run = list.slice(start, index + 1);
    const first = nameOf(run[0]);
    const lead = stages[start] === 'lead';
    const next = [...byIndex.keys()].filter((at) => at > index);
    const prev = [...byIndex.keys()].filter((at) => at < start);
    let anchor = null;
    let ahead = false;
    // Earthmoving plant goes before the first demolition, dig or backfill, wherever it was written (messy round 11, run 8).
    const homes = lead && own(HOME, first) ? blocks.filter((block) => HOME[first](block.stage)) : [];
    if (homes.length) { homes.reduce((best, block) => (block.stage < best.stage ? block : best), homes[0]).before.push(...run); continue; }
    if (lead && next.length) {
      ahead = true;
      anchor = byIndex.get(next[0]);
      if (ACCESS.has(first) || first === 'Work in the roof space') {
        const work = next.filter((at) => byIndex.get(at).stage >= WORK_FROM && byIndex.get(at).stage < 120);
        if (work.length) anchor = byIndex.get(work.reduce((best, at) => (byIndex.get(at).stage < byIndex.get(best).stage ? at : best), work[0]));
      }
    } else if (lead && own(HOME, first)) {
      blocks.push({ stage: 29.9, before: [], steps: run, after: [], index: -1 });
      continue;
    } else if (prev.length) anchor = byIndex.get(prev[prev.length - 1]);
    else if (next.length) { anchor = byIndex.get(next[0]); ahead = true; }
    // The way up goes before the first work at height done from it, wherever it was written (SiteLink messy round 11:
    // "Use an elevating work platform" printed after the riser work done from it).
    if (lead && ACCESS.has(first)) {
      const high = [...byIndex.keys()].filter((at) => byIndex.get(at).stage >= WORK_FROM && byIndex.get(at).stage < 120 && FALL_HAZARD(list[at]));
      const first = high.length ? byIndex.get(high.reduce((best, at) => (byIndex.get(at).stage < byIndex.get(best).stage ? at : best), high[0])) : null;
      // The work it leads into stays where that comes earlier (hangers fixed from the EWP before the ductwork).
      if (first && !(anchor && ahead && anchor.stage >= WORK_FROM && anchor.stage < 120 && anchor.stage <= first.stage)) { anchor = first; ahead = true; }
    }
    if (ahead) anchor.before.push(...run);
    else anchor.after.push(...run);
  }
  return blocks.sort((a, b) => a.stage - b.stage || a.index - b.index).flatMap((block) => [...block.before, ...block.steps, ...block.after]);
}

// The orders the map is sure of (messy round 11, B fault 3: W17 pushed correct orders the wrong way). Each chain is
// groups of steps in the order the work must be done: a step of a later group is never done before a step of an
// earlier one. Every other pair of stages is loose: the work can sensibly be done either way round on some jobs (piles
// before or after the dig, insulation over or under the ceiling, painting before or after the glazing), so the check
// does not flag it. A step written by the user is in no chain.
const FIRM = [
  // In-ground services: found, dug, laid, joined and tested, backfilled, then the surface put back.
  [['Locate underground services'], ['Excavate', 'Dig the trench', 'Bulk excavate and load trucks', 'Hydro excavate with the vacuum truck'],
    ['Lay pipes', 'Lay conduits', 'Install pits', 'Lay the pipe or cable', 'Lay the pipes', 'Lay the cable', 'Install pits and conduits', 'Lay drainage under the slab or floor', 'Lift and place tanks, pits or precast units', 'Install the pump-out line'],
    ['Join polyethylene pipe by electrofusion', 'Connect to the live sewer', 'Connect to the water supply'],
    ['Backfill the trench', 'Backfill behind the retaining wall'], ['Reinstate the surface', 'Reinstate asphalt', 'Lay and roll asphalt']],
  [['Excavate', 'Dig the trench', 'Dig footing holes', 'Dig post holes', 'Excavate and set out the retaining wall'], ['Place the blinding concrete', 'Form, fix reo and pour concrete in the excavation', 'Stand the poles', 'Stand and fix the poles', 'Build the fence']],
  [['Set out'], ['Excavate', 'Dig the trench', 'Dig footing holes', 'Dig post holes', 'Bulk excavate and load trucks']],
  // Slabs: the deck, the reo and cast-ins, the inspection, the pour and its finishing, then the strip.
  [['Erect falsework and shores', 'Lay the formwork deck', 'Set edge forms and prepare the base'],
    ['Place and tie reo', 'Place and tie reo on the ground', 'Lift reo onto the deck', 'Load reo onto the deck', 'Install cast-in conduits on the deck before the pour', 'Install cast-in sleeves and puddle flanges on the deck before the pour', 'Fix cast-in items and ferrules before the pour', 'Place post-tensioning ducts and tendons'],
    ['Inspect before the pour'], ['Pump and place concrete', 'Place concrete', 'Pour the retaining wall', 'Pour the tank walls', 'Pour the core walls'],
    ['Finish the concrete', 'Finish concrete'], ['Saw cut the joints', 'Cure the concrete', 'Strip the formwork'], ['Install backprops']],
  [['Pump and place concrete', 'Place concrete'], ['Stress the tendons'], ['Cut the tendon tails'], ['Grout the tendon ducts']],
  // Masonry walls: footings, blocks, core fill, drainage and membrane behind, then the backfill.
  [['Dig and pour footings', 'Dig and pour the footings'], ['Lay blocks and bricks'], ['Install drainage behind the retaining wall', 'Waterproof walls below ground'], ['Backfill behind the retaining wall']],
  [['Lay blocks and bricks'], ['Core fill blockwork']],
  // Roofs: the frame, battens, sarking and mesh, then the roofing.
  [['Fix roof trusses', 'Erect the frame', 'Stand and brace wall frames'], ['Fix roof battens to the trusses', 'Fix new roof battens', 'Install sarking', 'Install safety mesh'], ['Fix new roofing', 'Fix the roof', 'Lay the roof tiles']],
  [['Remove old roofing', 'Strip the roof tiles'], ['Fix new roof battens', 'Fix new roofing', 'Fix the roof', 'Lay the roof tiles']],
  [['Lift and land steel with the crane company', 'Erect and connect steel at height'], ['Weld steel']],
  // Walls and ceilings: the frame, the linings, the joints set and sanded, then the fit-off over them (round 11, run 6).
  [['Frame walls and bulkheads', 'Cut and fix steel studs and track', 'Stand the door frames'], ['Cut plasterboard', 'Move and fix plasterboard sheets', 'Fix ceiling sheets', 'Fix new wall sheets', 'Cut and fix plasterboard'],
    ['Set the joints'], ['Sand the joints'], ['Hang the doors', 'Fix skirting and architraves', 'Prepare to paint', 'Paint']],
  [['Frame walls and bulkheads', 'Cut and fix steel studs and track'], ['Handle and install glass panels']],
  [['Stand the door frames'], ['Hang the doors'], ['Fit locks, closers and other hardware']],
  [['Install windows', 'Install the shopfront frames', 'Handle and install glass panels'], ['Seal glazing']],
  // Wet areas: the membrane, its flood test, then the tiles, grout and sealer.
  [['Apply primers and liquid membranes', 'Lay torch-on membranes'], ['Set up the flood test'], ['Check and drain the flood test'], ['Mix and spread the tile adhesive', 'Lay tiles', 'Fix the wall tiles'], ['Grout the tiles'], ['Apply sealer to the tiles and grout']],
  [['Prepare and grind floors', 'Prepare surfaces by grinding'], ['Apply primers and levelling compounds'], ['Apply flooring adhesives'], ['Lay floor coverings']],
  [['Lay timber floors'], ['Sand timber floors'], ['Coat timber floors']],
  [['Prepare to paint', 'Sand and fill surfaces', 'Prepare the steel surfaces', 'Abrasive blast the surfaces'], ['Paint', 'Apply solvent-based paint', 'Spray paint with airless sprayers', 'Paint the roof'], ['Clean brushes and rollers']],
  // Pipework: holes and supports, the pipe, its joints, the test, then commissioning (round 11, run 5: PE joined before it was in).
  [['Plan core holes', 'Core drill through the slab or wall', 'Fix hangers and supports'],
    ['Install risers and pipework', 'Install mechanical pipework', 'Install sprinkler pipework', 'Install hydrant pipework', 'Run and fix refrigerant pipe and pair coil', 'Lay and fix the hydronic pipes', 'Install ductwork'],
    ['Braze and solder pipe joints (hot work)', 'Braze refrigerant pipework', 'Braze medical gas pipework', 'Join PVC pipe with primer and solvent cement', 'Join polyethylene pipe by electrofusion'],
    ['Pressure test with nitrogen', 'Pressure test and commission', 'Pressure test the gas line', 'Pressure test the hydronic pipes'], ['Evacuate and charge the system', 'Commission hot water', 'Commission and balance the system']],
  [['Install risers and pipework', 'Install mechanical pipework', 'Install ductwork', 'Lay and fix the hydronic pipes'], ['Insulate ductwork and pipework']],
  [['Plumbing rough-in'], ['Plumbing fit-off']],
  [['Set floor wastes, slot drains and floor gutters', 'Erect coolroom panels'], ['Deliver and install commercial kitchen equipment'], ['Plumbing fit-off']],
  // Electrical: containment, cable, the earthing, then testing and connection (round 11, run 2: the earthing after the HV test).
  [['Install cable tray and containment', 'Install communications containment', 'Rough-in'],
    ['Install cabling', 'Pull cables and handle cable drums', 'Pull in and terminate the cables', 'Pull communications cabling', 'Haul the optical fibre cable', 'Prepare and terminate the high voltage cables'],
    ['Fit off', 'Test the high voltage cables'], ['Test the new work', 'Connect and commission']],
  [['Drive or drill the earth stakes'], ['Connect and test the earthing'], ['Test the high voltage cables', 'Test the new work', 'Connect and commission']],
  [['Mount the sub-board', 'Install comms racks and cabinets'], ['Pull in and terminate the cables', 'Terminate the data outlets and patch panels']],
  // Plant: delivered, fixed in place, then connected and commissioned (round 11, run 3: deliveries at step 6).
  [['Receive plant and move it into position', 'Deliver and place switchboards', 'Lift equipment and materials to the roof'],
    ['Fix plant on its supports', 'Install plant and equipment on the roof', 'Install split system indoor and outdoor units', 'Fix the units in place', 'Mount the sub-board'],
    ['Connect and commission', 'Commission the plant', 'Evacuate and charge the system', 'Commission and balance the system']],
  // Temporary works up, inspected, then down.
  [['Erect the scaffold'], ['Inspect and hand over'], ['Dismantle the scaffold']],
  [['Erect the safety screens'], ['Dismantle the safety screens']],
  [['Erect the temporary stair'], ['Inspect and hand over the temporary stair'], ['Dismantle the temporary stair']],
  [['Haul and deliver the loads on public roads'], ['Unload with the truck loading crane (hiab)'], ['Move materials into place', 'Erect the scaffold']],
  // Demolition: asbestos and services dealt with, the strip out, the structure, then new work.
  [['Check for asbestos before starting', 'Take samples of suspect materials'], ['Prepare the asbestos work area'], ['Remove the asbestos'], ['Bag, label and dispose of asbestos waste']],
  [['Isolate and make safe the old services', 'Disconnect the plant being removed'], ['Remove the old services', 'Strip out the room', 'Strip out ceilings, partitions and floor coverings', 'Demolish', 'Demolish the structure', 'Lift and move out the plant being removed']],
  [['Strip out the room', 'Strip out ceilings, partitions and floor coverings'], ['Demolish', 'Demolish the structure']],
  [['Strip out the room', 'Strip out ceilings, partitions and floor coverings', 'Remove the old services', 'Remove the wall', 'Remove the old tiles', 'Break out the cracked tiles', 'Strip the old membrane', 'Strip wallpaper',
    'Strip the water-damaged linings', 'Strip flood-damaged linings and insulation', 'Remove the old frames', 'Take down the old fence', 'Remove the old fan coil unit', 'Lift and move out the plant being removed', 'Isolate and lift out the failed pump',
    'Remove the old septic tank', 'Break out the pool', 'Break out damaged concrete'],
  ['Frame walls and bulkheads', 'Move and fix plasterboard sheets', 'Fix new wall sheets', 'Fix ceiling sheets', 'Install insulation', 'Apply primers and liquid membranes', 'Lay tiles', 'Fix the wall tiles', 'Install windows',
    'Replace the window frame', 'Build the fence', 'Lift the fan coil unit into place and fix it', 'Lower in and connect the new pump', 'Install vanities and fixtures', 'Repair the concrete', 'Paint', 'Lay floor coverings',
    'Install suspended grid ceilings', 'Install joinery and cabinets']],
];
// For each step, the group it is in in each chain.
const FIRM_AT = new Map();
FIRM.forEach((chain, c) => chain.forEach((group, g) => group.forEach((name) => {
  if (!FIRM_AT.has(name)) FIRM_AT.set(name, []);
  FIRM_AT.get(name).push([c, g]);
})));
// True where the work of step a must come before the work of step b.
function firmBefore(a, b) {
  const atA = FIRM_AT.get(a) || [];
  const atB = FIRM_AT.get(b) || [];
  return atA.some(([c, g]) => atB.some(([c2, g2]) => c === c2 && g < g2));
}

// Each pair of steps printed in an order the map is sure is wrong: a step printed after a step that must come after it.
// One fault per step, naming the first step it should come before.
function firmFaults(steps, nameOf = (step) => step.step) {
  const list = (Array.isArray(steps) ? steps : []).map(nameOf);
  const faults = [];
  list.forEach((name, index) => {
    const earlier = list.slice(0, index).findIndex((other) => firmBefore(name, other));
    if (earlier >= 0) faults.push({ step: name, at: index + 1, after: list[earlier], afterAt: earlier + 1 });
  });
  return faults;
}

const stageName = (stage) => {
  let found = STAGES[0][1];
  for (const [at, name] of STAGES) if (stage >= at) found = name;
  return found;
};

// Each library step printed after a step whose stage comes later in the work (the order checker).
// Steps with no stage are passed over. Each fault names the step and the one before it.
function orderFaults(steps, nameOf = (step) => step.step, flags = {}) {
  const faults = [];
  let last = null;
  const list = Array.isArray(steps) ? steps : [];
  const context = contextStages(new Set(list.map(nameOf)), flags);
  list.forEach((step, index) => {
    const name = nameOf(step);
    const stage = stageOf(name, context);
    if (typeof stage !== 'number') return;
    if (last && stage < last.stage) faults.push({ step: name, at: index + 1, after: last.name, afterAt: last.at, stage: stageName(stage), afterStage: stageName(last.stage) });
    last = { name, stage, at: index + 1 };
  });
  return faults;
}

module.exports = { STAGES, BY_NAME, FIRM, stageOf, stageName, contextStages, inStageOrder, orderFaults, firmBefore, firmFaults };
