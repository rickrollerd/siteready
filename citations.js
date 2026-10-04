// Each control taken from the law carries its Queensland source. For the other
// states that have been checked, the Queensland regulation sections are
// swapped for the matching sections of that state's own regulation. The match
// was made by section heading and checked against the state's text
// (scenarios/state-citations.json). Sources that do not apply in a state, such
// as Queensland-only sections, Queensland Acts and model codes of practice not
// checked for that state, are left out rather than guessed.
const STATE_CITATIONS = require('./scenarios/state-citations.json');
// Queensland has approved its own versions of most model codes. Their section
// numbers were compared heading by heading with the model codes SiteReady was
// written from (scenarios/qld-codes.json). A model code section is cited as the
// Queensland code section where one matches; codes Queensland has not approved,
// such as Construction work, stay cited as the model code.
const QLD_CODES = require('./scenarios/qld-codes.json');

const QLD_REG = 'Work Health and Safety Regulation 2011 (Qld) ';
// National sources apply in every state.
const NATIONAL = [/^Ozone Protection/, /^Telecommunications \(Cabling Provider\)/, /^Australian Refrigeration Council/, /^Piling industry standard/];

function mapReference(reference, state) {
  const match = /^(s|schedule) (\d+[A-Z]{0,3})(\(.+\))?(?: to s (\d+[A-Z]{0,3}))?$/.exec(reference.trim());
  if (!match) return null;
  const [, kind, number, sub = '', to] = match;
  const key = kind === 'schedule' ? `schedule ${number}` : number;
  const mapped = state.sections[key];
  if (!mapped) return null;
  if (kind === 'schedule') return `Schedule ${mapped}`;
  const end = to ? state.sections[to] : null;
  if (to && !end) return null;
  // A subsection is kept only where the state's section is set out the same way.
  const keepSub = sub && (state.sameSubsections || []).includes(number);
  return `${state.unit} ${mapped}${keepSub ? sub : ''}${end ? ` to ${state.unit} ${end}` : ''}`;
}

function qldCode(part) {
  for (const [code, { title, sections }] of Object.entries(QLD_CODES)) {
    const prefix = `Model Code: ${code} `;
    if (!part.startsWith(prefix)) continue;
    const references = part.slice(prefix.length).split(', ');
    const mapped = [...new Set(references.map((ref) => sections[ref]).filter(Boolean))];
    const unmapped = references.filter((ref) => !sections[ref]);
    return [
      ...(mapped.length ? [`${title} ${mapped.join(', ')}`] : []),
      ...(unmapped.length ? [`${prefix}${unmapped.join(', ')}`] : []),
    ];
  }
  return [part];
}

// Lines whose wording goes further than a state's section that the Queensland source maps
// to. The section is left off for that state; the rest of the line's sources stay.
const DROP_SOURCES = {
  vic: [
    // Regulation 118 sets no written handover and no 30 day inspection.
    [/\b(?:written confirmation|handed over in writing|written handover|every 30 days)\b/, ['s 225']],
    // Regulation 112 says nothing about parking a forklift.
    [/\bA forklift left unattended is parked\b/, ['s 218']],
    // Regulation 327 has no duty to take the workplace's circumstances into account.
    [/^This SWMS takes into account that the work is next to an operating hospital\b/, ['s 299']],
    // Regulation 49 covers rescue, not anchor ratings, approval, clearances or lone work.
    [/\b\d+ kN\b|\banchors (?:are|is)\b/, ['s 80']],
  ],
};

function localSource(source, stateId, text = '') {
  if (!source) return '';
  if (stateId === 'qld') return source.split('; ').flatMap(qldCode).join('; ');
  const state = STATE_CITATIONS[stateId];
  // National sources apply everywhere, even where the state's sections are not yet mapped.
  if (!state) return source.split('; ').filter((part) => NATIONAL.some((pattern) => pattern.test(part))).join('; ');
  const parts = [];
  for (const part of source.split('; ')) {
    if (NATIONAL.some((pattern) => pattern.test(part))) {
      parts.push(part);
      continue;
    }
    if (!part.startsWith(QLD_REG)) continue;
    const dropped = (DROP_SOURCES[stateId] || []).filter(([pattern]) => pattern.test(text)).flatMap(([, refs]) => refs);
    const references = [...new Set(part.slice(QLD_REG.length).split(', ').filter((ref) => !dropped.includes(ref)).map((ref) => mapReference(ref, state)).filter(Boolean))];
    if (references.length) parts.push(`${state.regulation} ${references.join(', ')}`);
  }
  return parts.join('; ');
}

// Queensland's demolition and refurbishment rules apply to buildings built before
// 31 December 1989 (Qld reg s 447). Elsewhere the date that matters is the national
// asbestos ban of 31 December 2003, the date in WA reg r 447.
// Remarks about Queensland law are left out of other states' drafts.
//
// Lines that state a Queensland electrical, plumbing or gas rule are given wording
// that holds in any state, so another state's draft does not present Queensland law
// as its own. Each state's own electrical, plumbing and gas licensing law is named
// generally until it has been checked line by line. A null drops the line.
const OUTSIDE_QLD = [
  [/^Electrical work is done or supervised only by licensed electrical workers, for a licensed electrical contractor\.$/, 'Electrical work is done or supervised only by licensed electricians, for a licensed electrical contractor, as the state\'s electrical licensing law requires.'],
  [/^Apprentices are supervised at all times by a licensed electrical worker\. In their first 6 months/, 'Apprentices are supervised by a licensed electrician as the state\'s electrical licensing rules require.'],
  [/^Everyone who performs or helps in performing electrical work is competent in rescue and resuscitation\.$/, 'Everyone working on or near energised electrical equipment is trained in low voltage rescue and CPR.'],
  [/^A serious electrical incident or dangerous electrical event is reported to the regulator/, 'A notifiable incident is reported to the regulator immediately, and the site is left undisturbed.'],
  [/^Plumbing and drainage work is done by licensed workers/, 'Plumbing and drainage work is done by plumbers licensed or registered under the state\'s plumbing law, and trainees are supervised as that law requires.'],
  [/^Hired electrical equipment is inspected, tested and tagged by a competent person at least once every 6 months/, 'Hired electrical equipment is inspected and tested by the hire company and carries a current test tag. Reject it if the tag is missing or out of date.'],
  [/^Workers without an electrical licence build conduits only if/, 'Workers without an electrical licence do only the conduit work the state\'s electrical licensing law allows, under a licensed electrician\'s supervision. Any earthing or bonding is done by licensed workers.'],
  [/^Work in a roof space \(between the roof and the top floor ceiling\) only when the electrical installation is de-energised\./, 'Before work in a roof space, the electrical installation is de-energised where practicable. If it cannot be, cables are treated as energised and the controls are set out in this SWMS.'],
  [/^A safety observer, assessed in the last 12 months as competent in rescue and resuscitation/, 'A safety observer competent in low voltage rescue and CPR watches the work and does no other work.'],
  [/^Keep the risk assessment until at least 28 days after the work/, 'Keep the risk assessment and this SWMS readily available to the workers until the work is complete.'],
  [/^The consumer mains and main switchboard are not connected for the first time until the distribution entity has examined them/, 'The consumer mains and main switchboard are not connected for the first time until the network operator has inspected or approved them as its connection rules require.'],
  [/^The electrical contractor connects only when satisfied the Act and regulation have been complied with\.$/, 'The installation is connected only when the electrical contractor is satisfied it complies with the state\'s electrical safety law and the wiring rules.'],
  [/^Issue the certificate of testing and safety, and give the distribution entity the notice of test where it must examine or test the installation\.$/, 'Give the network operator the notice it requires, and issue the electrical certificate of compliance or safety the state requires.'],
  [/^Where we connect the installation, issue the certificate of testing and compliance\.$/, null],
  [/^Any high voltage electrical installation is not connected until an accredited auditor has inspected and certified it\.$/, 'Any high voltage electrical installation is inspected and approved as the state\'s electrical safety law and the network operator require before it is connected.'],
  [/^No electrical work is done on or near energised parts \(within 3 m of an exposed energised part\)\./, 'No electrical work is done on or near energised parts. Parts of the installation that stay energised, such as construction power, are identified, and the work is kept separated from them. If that changes, stop and prepare for energised work as the state\'s WHS or electrical safety law requires.'],
  [/^Work on or near energised parts is done only where the regulation allows, such as testing/, 'Work on or near energised parts is done only where the state\'s law allows, such as testing, and never because it is more convenient.'],
  [/^Traffic controllers who hold Queensland traffic controller accreditation/, 'Traffic controllers who hold the traffic controller accreditation the state\'s road authority requires direct vehicles, pedestrians and traffic on the footpath and road, as the traffic management plan sets out.'],
  [/^Where the scaffold is next to a street, the principal contractor provides the hoarding, gantry or closure the regulation requires,/, 'Where the scaffold is next to a street, the principal contractor provides the hoarding, gantry or closure the local council or road authority requires, and lifts over the footpath happen only with the area closed or a gantry in place.'],
  [/^Security equipment such as CCTV, access control, intercoms and alarms is installed only by licensed security equipment installers\.$/, 'Security equipment such as CCTV, access control, intercoms and alarms is installed by installers holding any security licence or registration the state requires.'],
  [/^Where objects could fall onto the street or footpath, work goes ahead only once the principal contractor has the protection the regulation sets/, 'Where objects could fall onto the street or footpath, work goes ahead only once the principal contractor has a hoarding, gantry, closure or catch platform in place as the local council or road authority requires.'],
  [/^Single or extension ladders are used for access, with 3 points of contact, or for permitted work only:/, 'Single or extension ladders are used for access, with 3 points of contact, or for short light work done with one hand, with the ladder secured and the body kept between the stiles. Ladders are industrial and rated for at least 120 kg.'],
  [/^Extension ladders used for electrical work are no longer than 9\.2 m\.$/, null],
  [/^(?:The travel restraint system|Travel restraint) is inspected at least every 6 months\.$/, null],
  [/^Where objects could fall on people outside the site, the principal contractor closes the adjoining area or erects perimeter containment screening before formwork is erected or dismantled\./, 'Where objects could fall on people outside the site, the principal contractor provides screening, a closure or a gantry before formwork is erected or dismantled.'],
  [/^Where the deck slopes more than 26 degrees, mesh or sheeting extends at least 900 mm up the edge protection\./, null],
  [/^The barricade or hoarding is set by the angle from the highest point of the work to the hoarding line/, 'The barricade, hoarding or gantry suits the height of the work and its distance from the boundary, as the local council or road authority requires.'],
  [/^Gantries are engineer designed \(5 kPa, or 10 kPa/, 'Gantries are engineer designed for the loads above them and stop falling objects, water and dust. The overhead platform is secured against lifting.'],
  [/^Before the insulation is installed, an on-site assessment of the electrical risk is done by a worker trained to do it/, 'Before the insulation is installed, the electrical risk in the ceiling space is assessed by a competent person, and live cables and fittings are isolated or kept clear of.'],
  [/^Insulation is not fastened to the ceiling structure with metal or other conductive fasteners/, 'Insulation is not fastened with metal staples or other conductive fasteners, and is kept clear of recessed light fittings and their transformers as the wiring rules require.'],
  [/^Edge protection or travel restraint where a fall of 2 m or more \(3 m in housing construction\) is possible/, 'Edge protection or travel restraint where a fall of 2 m or more is possible, before work starts.'],
  [/^Fall hazards under 2 m \(3 m in housing construction\) are identified/, 'Fall hazards are identified, assessed and controlled before work starts. Platforms 2 m or higher have guardrails so a fall is prevented.'],
  [/^Trestle platforms where a person could fall 2 m or more \(3 m in housing construction\)/, 'Trestle platforms where a person could fall 2 m or more have their trestles secured and edge protection; lower platforms are at least 450 mm wide. Use only purpose-made pins.'],
  [/^Housing construction: where a person could fall 3 m or more/, null],
  [/^Cutting an opening in a load-bearing wall is demolition work: it is done by, or for, a holder of a demolition licence/, 'Cutting an opening in a load-bearing wall is demolition work, done by a contractor holding any demolition licence or registration the state requires.'],
  [/^The boom is not set up or worked over access ways or site sheds unless a 10 kPa gantry protects them\./, 'The boom is not set up or worked over access ways or site sheds unless a gantry designed for the load protects them. The pumping area is signed, and only authorised people enter it.'],
  // Queensland's 2 m barrier rule is s 306D. Elsewhere a trench at least 1.5 m deep is secured from unauthorised access (r 306(1)).
  [/^Barriers go up around a pit or trench as it is dug, before it is 2 m deep \(3 m in housing construction\)\.$/, 'Barriers go up around a pit or trench as it is dug, and the work area around a trench 1.5 m deep or more is secured from unauthorised access, including inadvertent entry.'],
  // Queensland's edge protection rules are s 306E; the model regulations set none.
  [/^Work only inside edge protection installed by others to the regulation\./, 'Work only inside edge protection installed by others to its design or the manufacturer\'s instructions. Do not remove or alter it, and report any damage.'],
  [/^Every part of the boom and drop hose stays at least 3 m from overhead power lines up to 132 kV/, 'Every part of the boom and drop hose stays outside the safe distance from overhead power lines that the state\'s rules and the line owner set, and the boom is not worked over energised lines. De-energising or re-routing the lines is considered first.'],
];

// A state's own regulation, cited in a line reworded for that state.
function cite(stateId, ...refs) {
  const { regulation, unit } = STATE_CITATIONS[stateId];
  return ` (${regulation} ${refs.map((ref) => (/^Schedule /.test(ref) ? ref : `${unit} ${ref}`)).join(', ')})`;
}

// Lines reworded for one state. A pattern starting with ^ replaces the whole line, any
// other pattern only the words it matches, and null removes them. A replacement may be
// a function of the state. Rewordings marked KEEP still hold for the line's own sources,
// so those stay; any other rewording carries its own citation or none.
const KEEP = true;

// Victoria has its own crystalline silica rules (high risk crystalline silica work and
// a hazard control statement), not the model regulations' high risk processing and
// silica risk control plan, and its own names for the coordination plan and the
// register of hazardous substances. Prescribed electrical work there is inspected by a
// licensed electrical inspector.
const VIC_TEXT = [
  [/^Assess in writing before \w+ whether the processing is high risk[.,]/, 'Before work starts, determine whether the work is high risk crystalline silica work.'],
  [/Assess in writing before \w+ whether it is high risk, without counting PPE or administrative controls, and without relying only on the dust controls used for the processing\. If it cannot be determined, treat it as (?:a risk to health|high risk)\./, 'Before work starts, determine whether the work is high risk crystalline silica work.'],
  [/^.*silica risk control plan/, 'Before high risk crystalline silica work starts, a hazard control statement is prepared, and workers are given the information, instruction and training the crystalline silica rules in the Occupational Health and Safety Regulations 2017 (Vic) require.'],
  [/^Air monitoring is done where it is not certain the exposure standard is met/, 'Air monitoring is done where it is not certain the exposure standard is met, and health monitoring is provided where the regulations require it.'],
  [/The written silica assessment is done before work starts and attached to this SWMS\./, null],
  [/^This SWMS takes into account the principal contractor's WHS management plan for the site\.$/, 'This SWMS takes into account the principal contractor\'s health and safety coordination plan for the site.'],
  [/^The consumer mains and main switchboard are not connected for the first time until the distribution entity has examined them/, 'Consumer mains, main switchboards and other prescribed electrical work are inspected by a licensed electrical inspector, and the certificate of electrical safety is issued, before the installation is connected by the network operator.'],
  // Regulation 115(3)(d): one load is lifted by more than one piece of plant only where that cannot reasonably be avoided.
  [/only where each crane is specifically designed to lift a load\./, 'only where a single crane cannot reasonably be used, and each crane is designed to lift a load.', KEEP],
  [/only where each machine is designed to lift a load\./, 'only where one machine cannot reasonably do it, and each machine is designed to lift a load.', KEEP],
  [/Dual lifts only where each machine is designed to lift\./, 'Dual lifts only where one machine cannot reasonably do the lift, and each machine is designed to lift.', KEEP],
  // Confined spaces: regulation 56 sets the matters to take into account, not a written
  // assessment; the employer issues the permit (r 63); permits are kept as r 64 says, with
  // a record that everyone has left (r 68); r 73 keeps no training records.
  [/^A competent person does a written risk assessment first, including whether the work can be done without entering\.$/, 'Entry is avoided where the work can be done from outside. Otherwise the risks are reduced, taking into account the space, its atmosphere, the work and the method, any work outside the space, the way in and out, and the emergency procedures.', KEEP],
  [/after a competent person's risk assessment recorded in writing,/, 'after its risks have been assessed and controlled,', KEEP],
  [/^No one enters without a written entry permit from a competent person, naming the space, the people entering, the time and the controls\.$/, 'No one enters without a written entry permit issued by the employer for that space, listing the controls, the people permitted to enter, the standby person and the period it covers.', KEEP],
  [/a written entry permit from a competent person,/, 'a written entry permit issued by the employer,', KEEP],
  [/^Workers are trained in the hazards, controls, permit and emergency procedures, with training records kept for 2 years\.$/, 'Workers are given information, instruction and training in the hazards, the risk controls, PPE, the entry permit and the emergency procedures.', KEEP],
  [/^Close and sign off the entry permit, confirming everyone has left\. Keep the risk assessment until at least 28 days after the work and the permit until the work is complete, or both for at least 2 years after a notifiable incident, available for inspection and to workers on request\.$/, `Close and sign off the entry permit, and keep a written record that everyone has left. Keep the permit until the work is complete, or for at least 2 years if a notifiable incident occurs.${cite('vic', '64', '68')}`],
  // Asbestos: no licensed asbestos assessor; a clearance certificate from an independent
  // person after Class A or B removal (r 294, r 296, r 297). Asbestos is identified before
  // any demolition or refurbishment, whatever the building's age (r 240, r 245).
  [/^When licensed asbestos removal is finished, a clearance inspection is done by an independent competent person/, `When Class A or Class B asbestos removal is finished, the person who commissioned it obtains a clearance certificate from an independent person with the knowledge, skills and experience to give it, before the area is re-occupied. For Class A work that needed air monitoring, the airborne fibre level is first shown to be less than 0.01 f/ml. No certificate is needed for 10 m2 or less of non-friable asbestos.${cite('vic', '294', '296', '297')}`],
  [/^Buildings built before 31 December 1989 are checked for asbestos before demolition or refurbishment\./, `Before demolition or refurbishment, asbestos likely to be disturbed is identified from the asbestos register. Where there is no register, the work does not start until it has been determined whether asbestos is present. Where that is uncertain, or areas cannot be reached, asbestos is assumed to be present or a sample is analysed.${cite('vic', '226', '240', '245')}`],
  [/In a building built before 31 December 1989, asbestos likely/, 'Asbestos likely', KEEP],
  // Victoria registers plant designs (r 125, Schedule 2). Only amusement structures are registered items (r 127C).
  [/^An escalator is plant whose design and item are registered\. The registration numbers are sighted before it is installed and before it is used\.$/, `An escalator is a lift, and its design is registered. The design registration number is sighted before it is installed.${cite('vic', '125', 'Schedule 2')}`],
  [/^Boilers and pressure vessels at hazard level A, B or C have a registered design and are registered items before they are used\.$/, `Boilers, pressure vessels and other pressure equipment have a registered design before they are used, unless Schedule 2 item 1.1 leaves them out.${cite('vic', '125', 'Schedule 2')}`],
  [/^A concrete placing boom used for core filling has a registered design and is a registered item, with a licensed operator\./, `A concrete placing boom used for core filling has a registered design and a licensed operator. Never stand under a working boom.${cite('vic', '125', '128', 'Schedule 2', 'Schedule 3')}`],
  [/^Where a concrete placing boom is used, it is registered plant and its operator holds a high risk work licence for a concrete placing boom\.$/, `Where a concrete placing boom is used, it has a registered design and its operator holds a high risk work licence for a concrete placing boom.${cite('vic', '125', '128', 'Schedule 2', 'Schedule 3')}`],
  [/^Concrete placing booms are registered items of plant\. Check the registration before use\.$/, 'Concrete placing booms have a registered design. Check the design registration before use.'],
  [/\bThe crane is a registered item of plant and/, 'The crane has a registered design and'],
  [/^Mobile and crawler cranes over 10 t are registered items\. Get the registration details from the crane company\.$/, 'Mobile and crawler cranes over 10 t have a registered design. Get the design registration details from the crane company.'],
  [/^A mobile crane with a maximum rated capacity over 10 t is registered, and its registration is current\.$/, `A mobile crane with a rated capacity over 10 t has a registered design.${cite('vic', '125', 'Schedule 2')}`],
  [/^The lift design is registered before it is supplied, and the lift is registered before it is commissioned for use\./, `The lift design is registered before it is supplied.${cite('vic', '125', 'Schedule 2')}`],
  // Schedule 3 item 18A licenses non-slewing telehandlers over 3 t; a slewing telehandler is a slewing mobile crane (r 5).
  [/, and hold a crane licence where its set-up needs one\./, '. A non-slewing telehandler rated over 3 t needs the non-slewing telehandler licence or a mobile crane licence, and a slewing telehandler the slewing mobile crane licence for its capacity.'],
  // Regulation 322(g): a trench deeper than 1.5 m. The regulations set no shoring rule.
  [/a trench deeper than 1\.5 m is high risk construction work, and a trench 1\.5 m deep or more is shored, benched or battered before anyone enters\./, 'a trench deeper than 1.5 m is high risk construction work, and its sides are supported before anyone enters.', KEEP],
  // Part 3.3 applies to falls of more than 2 m, and sets no rail sizes.
  [/\bWork from a solid surface with edge protection wherever a fall of 2 m or more is possible:/, 'Work from a solid surface with edge protection wherever a fall of more than 2 m is possible:'],
  // Installed engineered stone: regulation 319ZB allows removal, repair, modification and disposal
  // done with the engineered stone controls (r 319S to r 319X), and sets no notice to the regulator.
  [/^Installed engineered stone is cut, drilled or broken only to remove, repair, make minor modifications to or dispose of it, and only if the processing is controlled:/, `Installed engineered stone is cut, drilled or broken only to remove, repair, modify or dispose of it. The power tool or plant is used with an integrated water delivery system giving a continuous supply of water to the point of contact, or on-tool extraction connected to a Dust Class H vacuum or another system that captures the dust, and with local exhaust ventilation only where neither is reasonably practicable. Employees wear the respiratory protective equipment provided and are trained in the tool and the equipment, and compressed air is not used to clean the work area or clothing.${cite('vic', '319S', '319V', '319W', '319X', '319Y', '319ZB')}`],
  [/^Before installed engineered stone is processed, written notice of the work.*$/, null],
  // Regulation 5: porcelain and sintered stone are not engineered stone only where they contain no resin.
  [/\bPorcelain and sintered stone are not engineered stone\./, 'Porcelain and sintered stone products that contain no resin are not engineered stone.', KEEP],
  [/\bCeramic and porcelain tiles and grout are not engineered stone\./, 'Ceramic tiles, porcelain tiles that contain no resin, and grout are not engineered stone.', KEEP],
  // Part 4.5 duties apply to any material containing crystalline silica (r 319B, r 319J); the 1%
  // "crystalline silica substance" (r 5) is used only for manufacturers and suppliers.
  [/\b(?:with )?1% or more crystalline silica\b/, 'containing crystalline silica', KEEP],
  [/a product containing crystalline silica is a crystalline silica substance, and power sanding or cutting it is processing that must be controlled, with a written assessment before it starts\./, `power sanding or cutting a product that contains crystalline silica is a crystalline silica process. Before it starts, it is assessed, with a written record, to find whether it is high risk crystalline silica work, or it is treated as high risk crystalline silica work.${cite('vic', '165', '166', '319B', '319J', '319K')}`],
  // Victoria's Class A removal duties are set out differently (Part 4.4 Subdivision 4) and are not stated here.
  [/^Friable asbestos is removed inside an enclosure that is tested for leaks.*$/, null],
  // Victoria has no demolition notice (Part 5.1 has none); r 355 requires notice of excavation work.
  [/^Written notice is given to the regulator at least 5 days before the work starts where the structure, or a load-bearing part of it, is at least 6 m high,.*$/, null],
  [/^Get the current underground services information from the principal contractor and service plans, for example through Before You Dig Australia, locate services on site before digging, and work to it\.$/, `Get the current underground services information from the principal contractor and service plans, for example through Before You Dig Australia, locate services on site before digging, and work to it. Where a shaft, trench or tunnel will be big enough for a person to enter, or poses a risk, the Authority is notified in writing at least 3 days before the excavation work starts, unless it is part of building work under a building permit.${cite('vic', '354', '355')}`],
  // Regulations 118, 128 and Schedule 3: the licence, not a written handover or a 30 day inspection.
  [/^Where a person or thing could fall more than 4 m from it, it is erected by a licensed scaffolder, handed over in writing by a competent person, and inspected at least every 30 days\.$/, `Where a person or thing could fall more than 4 m from it, it is erected by a licensed scaffolder.${cite('vic', '128', 'Schedule 3')}`],
  // Schedule 2 item 1.6; no regulation requires the registration number to be kept at the hoist.
  [/^A personnel hoist with platform travel over 2\.4 m has a registered design, and the registration number is kept at the hoist\.$/, `A personnel hoist with platform travel over 2.4 m has a registered design.${cite('vic', '125', 'Schedule 2')}`],
  // Regulation 298(1): 24 hours for 10 m2 or less of non-friable asbestos, unless a licence condition varies it.
  [/^For licensed removal, the licensed removalist gives the regulator written notice at least 5 days before the work starts\.$/, `For licensed removal, the licence holder gives the Authority written notice at least 5 days before the work starts (24 hours for 10 m2 or less of non-friable asbestos), unless a licence condition sets other notice.${cite('vic', '298')}`],
  // Regulation 341 names the construction induction card.
  [/\bgeneral construction induction card\b/, 'construction induction card', KEEP],
];

// The model regulations, except where a state differs (each checked against the state's text).
// Regulation 219(7): a load is lifted by more than one item of plant only where the method of
// lifting keeps the load on each within its design capacity. Queensland's s 219(7) asks instead
// that each is specifically designed to lift a load.
const MODEL_TEXT = [
  [/only where each crane is specifically designed to lift a load\./, 'only where the method of lifting keeps the load on each crane within its design capacity.', KEEP],
  [/only where each machine is designed to lift a load\./, 'only where the method of lifting keeps the load on each machine within its design capacity.', KEEP],
  [/Dual lifts only where each machine is designed to lift\./, 'Dual lifts only where the method of lifting keeps the load on each machine within its design capacity.', KEEP],
];
// Regulations 529CA and 529CE as the model states have them: the assessment does not rely on
// the dust controls at all; processing that cannot be assessed is taken to be high risk; and
// high risk processing has air monitoring, results over the exposure standard given to the
// regulator within 14 days, and health monitoring for every worker doing it. The ACT has its
// own rules and is not one of these.
const MODEL_SILICA_TEXT = [
  [/\brely only on the dust controls\b/, 'rely on the dust controls', KEEP],
  [/\brelying only on the dust controls\b/, 'relying on the dust controls', KEEP],
  [/treat it as a risk to health(?: until that is determined)?\./, 'treat it as high risk until it is determined that it is not.', KEEP],
  [/For high risk processing, (?:air monitoring )?results (over|above) the exposure standard (go to|are reported to) the regulator within 14 days\./, 'For high risk processing, air monitoring is done, results $1 the exposure standard $2 the regulator within 14 days, and all workers doing the processing have health monitoring.', KEEP],
];
// Regulations 161(4) and 162 on energised electrical work, in the states whose text has them
// (Western Australia leaves them out, and the Northern Territory text read has no Part 4.7).
const ENERGISED_TEXT = [
  [/^A safety observer, assessed in the last 12 months as competent in rescue and resuscitation, watches the work and does no other work\.$/, (id) => `A safety observer, competent to apply the emergency controls and to rescue and resuscitate the worker, and assessed in the previous 12 months as competent to rescue and resuscitate a person, watches the work and does no other work.${cite(id, '161')}`],
  [/^Keep the risk assessment until at least 28 days after the work and this SWMS until the work is complete, or both for at least 2 years after a serious electrical incident or dangerous electrical event, readily available to the workers\.$/, (id) => `Keep the risk assessment until at least 28 days after the work and this SWMS until the work is complete, or both for at least 2 years after a notifiable incident, readily available to the workers.${cite(id, '162')}`],
];
// Western Australia has no 6 m notice (r 142 is not used). Class 1 and Class 2 demolition work
// is licensed (r 142B, r 142C), and notified 5 working days ahead when done to AS 2601 (r 142F),
// or approved by the regulator when it is not (r 142G, r 142I).
const WA_TEXT = [
  // Regulation 153: before work in the roof space of a Class 1, 2 or 10a building, its electrical
  // installation is de-energised by a competent person, with no "where practicable" exception.
  [/^Work in a roof space \(between the roof and the top floor ceiling\) only when the electrical installation is de-energised\./, `Before anyone works in the roof space of a house, a unit building or a Class 10a building such as a garage or shed, a competent person de-energises the building's electrical installation, and no one works there until it is. Service apparatus, and the supply cables regulation 153(6) leaves out, stay live; where the roof space is divided between separate dwellings, only the dwelling the work is in is de-energised. A competent person testing, servicing or commissioning an appliance may energise it only as regulation 153(5) allows, after a risk assessment.${cite('wa', '153')}`],
  [/^Before the insulation is installed, an on-site assessment of the electrical risk is done by a worker trained to do it/, `Before the insulation is installed, the electrical risk in the ceiling space is assessed by a competent person, and live cables and fittings are isolated or kept clear of. In the roof space of a house, a unit building or a Class 10a building, a competent person de-energises the building's electrical installation before the work starts.${cite('wa', '153')}`],
  // Schedule 3 items 14A and 15A: earthmoving machinery used as a crane, with a safe working load
  // over 3 t, needs a high risk work licence (r 5 "crane", r 81).
  [/^Where (pipes, pits or conduit bundles|pipes or pits) are lifted with the excavator, this is done only where it has a rated lifting point, the load is within its lifting chart, and the operator is competent to lift with it\.$/, (id, all) => `Where ${all} are lifted with the excavator, this is done only where it has a rated lifting point and the load is within its lifting chart. An excavator with a safe working load over 3 t used as a crane is operated by the holder of the high risk work licence for earthmoving machinery used as a crane (Schedule 3 item 14A, non-slewing, or item 15A, slewing); otherwise the operator is competent to lift with it.${cite('wa', '81', 'Schedule 3')}`],
  [/^(An excavator lifts broken pile heads only where it is designed to lift that load, or the lift creates no greater risk than with plant designed for it\.|Props and walers are lifted with plant designed to lift them, never over people, and slung by a licensed dogman\. An excavator is used to lift only where plant designed to lift is not reasonably practicable, and it creates no greater risk\.)$/, (id, line) => `${line} An excavator with a safe working load over 3 t used as a crane is operated by the holder of the high risk work licence for earthmoving machinery used as a crane (Schedule 3 item 14A or 15A).${cite('wa', '81', '219', 'Schedule 3')}`],
  [/^Written notice is given to the regulator at least 5 days before the work starts where the structure, or a load-bearing part of it, is at least 6 m high,/, `Class 1 or Class 2 demolition work is done by, or for, the holder of the demolition licence it needs. Done to AS 2601, it is notified to the regulator at least 5 working days before it begins; done any other way, the regulator's approval is applied for at least 10 working days before, and the work waits for it.${cite('wa', '142B', '142C', '142F', '142G', '142I')}`],
];
// The ACT has no 10 m2 exception: any asbestos is removed by a licensed asbestos
// removalist (Work Health and Safety Regulation 2011 (ACT) s 458, s 487), and every licensed
// removal is cleared by an independent licensed asbestos assessor (s 473, s 474).
const ACT_TEXT = [
  [/^Asbestos is removed by a licensed asbestos removalist, except for 10 m2 or less of non-friable asbestos removed under the regulation\.$/, 'Asbestos is removed only by a licensed asbestos removalist, whatever the amount.'],
  [/ unless the regulation allows otherwise\./, '.', KEEP],
  // Section 477 has no glove bag exception.
  [/ \(negative pressure and the monitoring before the start are not needed where glove bags are used\)/, '', KEEP],
  // Porcelain tiles and sintered stone are stone-substitute material (s 418A, s 418B, s 418C);
  // ceramic tiles and natural stone are crystalline silica material (s 418CAA).
  [/^Tiles and stone with 1% or more crystalline silica are a crystalline silica substance\. Cutting them with power tools/, `Porcelain tiles and sintered stone containing crystalline silica are stone-substitute material: they are cut with power tools only with a continuous water feed and at least one other crystalline silica control, and everyone who may be exposed wears respiratory protective equipment. Ceramic tiles, natural stone and other crystalline silica material are cut with a continuous water feed and at least one other control, or the next control section 418CAA allows where that is not reasonably practicable.${cite('act', '418A', '418B', '418C', '418CAA')}`],
  // Section 142(1)(d): demolishing a structure that contains, or has contained, loose-fill asbestos insulation.
  [/, where load shifting machinery is used on a suspended floor, or where explosives are used\./, ', where load shifting machinery is used on a suspended floor, where explosives are used, or where the structure contains or has contained loose-fill asbestos insulation.', KEEP],
  [/^When licensed asbestos removal is finished, a clearance inspection is done by an independent competent person/, `When licensed asbestos removal is finished, an independent licensed asbestos assessor inspects the removal area and the area around it, and issues a clearance certificate before the area is reoccupied.${cite('act', '473', '474')}`],
  // Porcelain and sintered stone are stone-substitute material (s 418A): water and one other control, and respirators (s 418B, s 418C).
  [/^Natural stone and porcelain with 1% or more crystalline silica: .*$/, `Porcelain and sintered stone containing crystalline silica are stone-substitute material: they are processed with power tools only with a continuous water feed and at least one other crystalline silica control, and exposed workers wear respiratory protective equipment. Natural stone is processed with the controls section 418CAA requires. Cut in the factory where possible.${cite('act', '418B', '418C', '418CAA')}`],
  [/a product with 1% or more crystalline silica is a crystalline silica substance, and power sanding or cutting it is processing that must be controlled, with a written assessment before it starts\./, 'a product containing crystalline silica, such as plasterboard, grout, render or a concrete product, is crystalline silica material, and power sanding or cutting it is processing that must use the crystalline silica controls sections 418BAA and 418CAA require.', KEEP],
  [/Where rock is drilled or broken with plant, control the silica dust \(wet methods or extraction\) and assess it in writing before starting\./, () => `Where rock is drilled or broken with plant, ${ACT_MATERIAL}.`, KEEP],
  // Installed engineered stone (s 418H): stone installed before 1 July 2024 or as s 418G allows, a
  // continuous water feed with one other control and respiratory protective equipment; notice
  // before the work, kept for 5 years (s 418I, s 418J). The ACT has no change or 12 month notice.
  [/^Installed engineered stone is cut, drilled or broken only to remove, repair, make minor modifications to or dispose of it, and only if the processing is controlled:/, `Installed engineered stone is cut, drilled or broken only to remove, repair or make minor modifications to stone installed before 1 July 2024 (or as section 418G allows), or to dispose of it, and only if the work is controlled: the risk is eliminated so far as is reasonably practicable or, where it cannot be, minimised with a continuous water feed over the processing area, at least one other crystalline silica control, and respiratory protective equipment provided to and worn by each worker who may be exposed.${cite('act', '418F', '418H')}`],
  [/^Before installed engineered stone is processed, written notice of the work/, `Before installed engineered stone is processed, written notice of the work, its type, and its frequency and duration is given to the regulator, and a copy is kept for 5 years.${cite('act', '418I', '418J')}`],
];

// Tasmania's r 529CB(2) asks more of a silica risk control plan than the model regulations, so a
// SWMS stands in for it only where it documents all of that (r 529CB(3)(c)).
const TAS_TEXT = [
  [/\(this SWMS can be the plan only where the work is also high risk construction work and the SWMS names the high risk processing, includes the written assessment, and says how the controls are implemented, monitored and reviewed\)/, '(this SWMS can be the plan only where the work is also high risk construction work and the SWMS identifies all the high risk processing and, for each, documents the processing, the form and proportion (w/w) of crystalline silica, the hazards and the likely frequency and duration of exposure, whether airborne respirable crystalline silica is likely to exceed half the exposure standard, why the processing is high risk, the controls and how they are implemented, monitored and reviewed, past air and health monitoring results at the workplace, and previous silica incidents, illnesses and diseases there)', KEEP],
];

const STATE_TEXT = {
  vic: VIC_TEXT,
  nsw: [...ENERGISED_TEXT, ...MODEL_SILICA_TEXT, ...MODEL_TEXT],
  sa: [...ENERGISED_TEXT, ...MODEL_SILICA_TEXT, ...MODEL_TEXT],
  wa: [...WA_TEXT, ...MODEL_SILICA_TEXT, ...MODEL_TEXT],
  tas: [...TAS_TEXT, ...ENERGISED_TEXT, ...MODEL_SILICA_TEXT, ...MODEL_TEXT],
  nt: [...MODEL_SILICA_TEXT, ...MODEL_TEXT],
  act: [...ACT_TEXT, ...ENERGISED_TEXT, ...MODEL_TEXT],
};
const MODEL_SILICA = new Set(['nsw', 'sa', 'wa', 'tas', 'nt']);

// The ACT has its own crystalline silica rules (Work Health and Safety Regulation 2011 (ACT)
// chapter 7A): no written high risk assessment or silica risk control plan, but set controls
// for processing with a power tool (s 418B to 418CAA) and an awareness course the Minister
// declares for high risk crystalline silica work (s 418D).
const ACT_SILICA_CONTROLS = 'a continuous water feed is used with at least one other crystalline silica control, such as a Class H vacuum on the tool or isolating the area. For material other than stone-substitute material, where water cannot reasonably be used, the next control the ACT crystalline silica rules allow is used. Everyone who may be exposed while porcelain, sintered stone or engineered stone is processed wears respiratory protective equipment.';
const ACT_SILICA_TRAINING = 'Workers who carry out high risk crystalline silica work have completed the crystalline silica awareness course the Minister declares under section 418D.';
// Section 418CAA for crystalline silica material other than stone-substitute material.
const ACT_MATERIAL = 'a continuous water feed is used with at least one other crystalline silica control, or the next control section 418CAA allows where that is not reasonably practicable, and anyone still at risk wears a fit tested respirator';
function actSilica(text) {
  return text
    .replace(/^Where (?:the processing|it) is high risk[:,].*$/s, ACT_SILICA_TRAINING)
    .replace(/Assess in writing before (\w+(?: or \w+)?) whether (?:the processing|it) is high risk[^.]*\.(?: The assessment does not count[^.]*\.)?(?: If it cannot be determined, treat it as [^.]*\.)?(?: (?:If it is|Where it is high risk), [^.]*\.)?/g, (all, when) => `Before ${when === 'starting' ? 'starting' : when}, ${ACT_SILICA_CONTROLS}${/silica risk control plan/.test(all) ? ` ${ACT_SILICA_TRAINING}` : ''}`)
    .replace(/Before ([^,.]+), assess in writing whether the processing is high risk\.(?: The assessment does not count[^.]*\.)?(?: If it cannot be determined, treat it as [^.]*\.)?/g, (all, when) => `Before ${when}, ${ACT_SILICA_CONTROLS}`)
    .replace(/,? and the written silica assessment covers the [^.]*\./g, '.');
}
// The ACT names concrete, masonry, tiles and stone "crystalline silica material", with no 1%
// test, and sets its controls in s 418BAA and s 418CAA: a line's own "wet or extraction" is
// replaced with them, unless the line goes on to give them.
// Porcelain tiles are stone-substitute material (s 418A): never cut with extraction alone (s 418B).
const ACT_TILE_CUT = /\b(cut|drilled) (?:with a wet saw or a saw with on-tool extraction|wet or with on-tool extraction|with on-tool extraction or water|with water or on-tool extraction)\b(?:, never dry cut without extraction)?/g;
function actMaterial(text) {
  const controls = text.includes(ACT_SILICA_CONTROLS) ? '' : `: ${ACT_MATERIAL}`;
  if (/\btiles?\b|\bporcelain\b/i.test(text)) text = text.replace(ACT_TILE_CUT, (all, verb) => `${verb} with water and at least one other control, such as on-tool extraction (porcelain is never processed dry)`);
  return text
    .replace(/, it is done wet or with on-tool extraction\. This is processing a crystalline silica substance\. Anyone still at risk of exposure wears a fit tested P2 respirator\./, `, it is processing crystalline silica material${controls}.`)
    .replace(/^Saw cut existing asphalt and concrete wet or with dust extraction, with hearing and eye protection\. Cutting concrete is processing a crystalline silica substance\./, `Saw cut existing asphalt and concrete with hearing and eye protection. Cutting concrete is processing crystalline silica material${controls}.`)
    .replace(/ with 1% or more crystalline silica\b/g, ' containing crystalline silica')
    .replace(/\bare a crystalline silica substance\b/g, 'are crystalline silica material')
    // A reason given after the controls ("..., as cutting it is processing crystalline silica") only takes the ACT term.
    .replace(/\b(is|are) processing (?:a crystalline silica substance|crystalline silica)\b(?! material)(?: and must be controlled)?(?:: [^.]*|, controlled by [^.]*)?\.(?: (?:It is controlled by|Control it with) [^.]*\.)?/g, (all, verb, at, whole) => `${verb} processing crystalline silica material${/, as [^.]*$/.test(whole.slice(0, at)) ? '' : controls}.`)
    .replace(/\bis processing that must be controlled(?:: [^.]*|, with [^.]*)\./g, `is processing that must be controlled${controls}.`);
}
const VIC_SILICA = /\b(processing is high risk|high risk processing|VET accredited or regulator approved)\b/i;

function applyLine(out, pattern, replacement, stateId) {
  // A function is given the state and what the pattern's groups matched.
  const value = typeof replacement === 'function' ? replacement(stateId, ...(pattern.exec(out) || []).slice(1)) : replacement;
  // A preset answer keeps its other sentences; a whole control line is replaced.
  if (value === null) return out.replace(pattern, '').replace(/\s{2,}/g, ' ').trim() || null;
  return pattern.source.startsWith('^') ? value : out.replace(pattern, value);
}

// The line as it reads in the state, and the wording it had after the KEEP rewordings,
// which still hold for its own sources.
function rewrite(text, stateId) {
  if (stateId === 'qld' || text == null) return { text, kept: text };
  const table = STATE_TEXT[stateId] || [];
  let out = text;
  for (const [pattern, replacement, keep] of table) {
    if (keep && out != null && pattern.test(out)) out = applyLine(out, pattern, replacement, stateId);
  }
  if (out == null) return { text: null, kept: null };
  const kept = out;
  let done = false;
  for (const [pattern, replacement, keep] of table) {
    if (keep || !pattern.test(out)) continue;
    out = applyLine(out, pattern, replacement, stateId);
    if (out == null) return { text: null, kept };
    done = true;
    break;
  }
  if (stateId === 'vic' && !done && VIC_SILICA.test(out)) return { text: null, kept };
  if (stateId === 'act') out = actMaterial(actSilica(out));
  if (!done) for (const [pattern, replacement] of OUTSIDE_QLD) if (pattern.test(out)) { if (replacement === null) return { text: null, kept }; out = replacement; break; }
  // Where the state has no rule like s 529CE, the 14 day silica report is stated generally.
  if (!MODEL_SILICA.has(stateId)) out = out.replace(/ ?For high risk processing, (?:air monitoring )?results (?:over|above) the exposure standard (?:go to|are reported to) the regulator within 14 days\./g, ' Results above the exposure standard are reported to the regulator where the state\'s rules require it.').trim();
  out = out.replace(/31 December 1989/g, '31 December 2003').replace(/ Qld has no piling rig licence\./g, '')
    .replace(/\bthe electricity entity's\b/g, 'the network operator\'s').replace(/\bthe distribution entity\b/g, 'the network operator').replace(/\bdistribution entity\b/g, 'network operator');
  // Queensland's 26 degree rule for mesh on sloping edge protection (s 306E) is stated generally elsewhere.
  out = out.replace(/(?:On slopes|Where the (?:roof|surface the work is done from|deck) slopes) (?:of |over |more than )?26 degrees[^.]*\./g, 'On steep slopes, mesh or sheeting is fitted to the edge protection as AS/NZS 4994 and the manufacturer require.');
  // Queensland Health and QBCC licences, and Queensland's regulated areas for herbicide spraying, are Queensland's.
  out = out.replace(/Termite treatments are applied only by a holder of a Queensland Health pest management licence for timber pests, who also holds a QBCC termite management \(chemical\) licence for treatments to new building work\./g, 'Termite treatments are applied only by a holder of the pest management licence the state requires, and any termite management licence it requires for new building work.')
    .replace(/Herbicide spraying with powered ground equipment in a regulated area is done only by a licensed commercial operator\./g, 'Herbicide spraying is done by a holder of any chemical application licence the state requires.');
  // Victoria: processing any material containing crystalline silica is a crystalline silica process (r 319B).
  if (stateId === 'vic') out = out.replace(/\b(?:is )?processing (?:a crystalline silica substance|crystalline silica)\b/g, (all) => (all.startsWith('is ') ? 'is a crystalline silica process' : 'a crystalline silica process'))
    .replace(/\bis processing that must be controlled\b/g, 'is a crystalline silica process that must be controlled')
    .replace(/^Tiles and stone containing crystalline silica are a crystalline silica substance\. Cutting them with power tools is a crystalline silica process/, 'Cutting tiles and stone containing crystalline silica with power tools is a crystalline silica process')
    .replace(/ containing crystalline silica are a crystalline silica substance\./g, ' contain crystalline silica.');
  if (stateId === 'vic') out = out.replace(/\bhazardous chemicals register\b/g, 'register of hazardous substances').replace(/\s?\(the falls code suggests [^)]*\)/g, '')
    .replace(/\bthe state's WHS or electrical safety law\b/g, 'the state\'s occupational health and safety or electrical safety law');
  // The Northern Territory and the ACT are territories.
  if (stateId === 'nt' || stateId === 'act') out = out.replace(/\bthe state's\b/g, 'the territory\'s').replace(/\bstate's\b/g, 'territory\'s').replace(/\bthe state (requires|sets|allows)\b/g, 'the territory $1');
  return { text: out, kept };
}

function localText(text, stateId) {
  return rewrite(text, stateId).text;
}

// A control line with its sources, as printed for the state. A line reworded for the state
// keeps its own sources only where the rewording still holds for them (KEEP); otherwise it
// carries the citation written into it, or none.
function localControl(text, source, stateId) {
  const { text: out, kept } = rewrite(text, stateId);
  if (out == null) return null;
  const cited = stateId && source && out === kept ? localSource(source, stateId, text) : '';
  return cited ? `${out} (${cited})` : out;
}

// Short Queensland regulation references in register notes, such as "(WHS Reg s 213)",
// given as the state's own sections, or left out where the section has not been matched.
function localNote(text, stateId) {
  if (stateId === 'qld' || !text) return text;
  return text.replace(/\s?\((?:WHS Reg )?((?:s \d+[A-Z]*)(?:, s \d+[A-Z]*)*)((?:, [^()]*)?)\)/g, (all, refs, rest) => {
    const mapped = localSource(`${QLD_REG}${refs}`, stateId);
    const extra = rest.replace(/^, /, '');
    if (mapped) return ` (${mapped}${extra ? `, ${extra}` : ''})`;
    return extra ? ` (${extra})` : '';
  });
}

const citedStates = () => ['qld', ...Object.keys(STATE_CITATIONS)];

module.exports = { localSource, localText, localControl, localNote, citedStates };
