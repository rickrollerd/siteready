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

function localSource(source, stateId) {
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
    const references = [...new Set(part.slice(QLD_REG.length).split(', ').map((ref) => mapReference(ref, state)).filter(Boolean))];
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
  [/^Give the distribution entity the notice of test, and issue the certificate of testing and safety\.$/, 'Give the network operator the notice it requires, and issue the electrical certificate of compliance or safety the state requires.'],
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
  [/^Where objects could fall on people outside the site, the principal contractor closes the adjoining area or erects perimeter containment screening before formwork is erected or dismantled\./, 'Where objects could fall on people outside the site, the principal contractor provides screening, a closure or a gantry before formwork is erected or dismantled.'],
  [/^Where the deck slopes more than 26 degrees, mesh or sheeting extends at least 900 mm up the edge protection\./, null],
  [/^The barricade or hoarding is set by the angle from the highest point of the work to the hoarding line/, 'The barricade, hoarding or gantry suits the height of the work and its distance from the boundary, as the local council or road authority requires.'],
  [/^Gantries are engineer designed \(5 kPa, or 10 kPa/, 'Gantries are engineer designed for the loads above them and stop falling objects, water and dust. The overhead platform is secured against lifting.'],
  [/^Before the insulation is installed, an on-site assessment of the electrical risk is done by a worker trained to do it/, 'Before the insulation is installed, the electrical risk in the ceiling space is assessed by a competent person, and live cables and fittings are isolated or kept clear of.'],
  [/^Insulation is not fastened to the ceiling structure with metal or other conductive fasteners/, 'Insulation is not fastened with metal staples or other conductive fasteners, and is kept clear of recessed light fittings and their transformers as the wiring rules require.'],
  [/^Fall hazards under 2 m \(3 m in housing construction\) are identified/, 'Fall hazards are identified, assessed and controlled before work starts. Platforms 2 m or higher have guardrails so a fall is prevented.'],
  [/^Trestle platforms where a person could fall 2 m or more \(3 m in housing construction\)/, 'Trestle platforms where a person could fall 2 m or more have their trestles secured and edge protection; lower platforms are at least 450 mm wide. Use only purpose-made pins.'],
  [/^Housing construction: where a person could fall 3 m or more/, null],
  [/^Cutting an opening in a load-bearing wall is demolition work: it is done by, or for, a holder of a demolition licence/, 'Cutting an opening in a load-bearing wall is demolition work, done by a contractor holding any demolition licence or registration the state requires.'],
  [/^The boom is not set up or worked over access ways or site sheds unless a 10 kPa gantry protects them\./, 'The boom is not set up or worked over access ways or site sheds unless a gantry designed for the load protects them. The pumping area is signed, and only authorised people enter it.'],
  [/^Every part of the boom and drop hose stays at least 3 m from overhead power lines up to 132 kV/, 'Every part of the boom and drop hose stays outside the safe distance from overhead power lines that the state\'s rules and the line owner set, and the boom is not worked over energised lines. De-energising or re-routing the lines is considered first.'],
];

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
];
const VIC_SILICA = /\b(processing is high risk|high risk processing|VET accredited or regulator approved)\b/i;

function localText(text, stateId) {
  if (stateId === 'qld' || text == null) return text;
  let out = text;
  let done = false;
  if (stateId === 'vic') {
    for (const [pattern, replacement] of VIC_TEXT) {
      if (!pattern.test(out)) continue;
      // A preset answer keeps its other sentences; a whole control line is replaced.
      if (replacement === null) { out = out.replace(pattern, '').replace(/\s{2,}/g, ' ').trim(); if (!out) return null; } else out = pattern.source.startsWith('^') ? replacement : out.replace(pattern, replacement);
      done = true;
      break;
    }
    if (!done && VIC_SILICA.test(out)) return null;
  }
  if (!done) for (const [pattern, replacement] of OUTSIDE_QLD) if (pattern.test(out)) { if (replacement === null) return null; out = replacement; break; }
  out = out.replace(/31 December 1989/g, '31 December 2003').replace(/ Qld has no piling rig licence\./g, '')
    .replace(/\bthe electricity entity's\b/g, 'the network operator\'s').replace(/\bthe distribution entity\b/g, 'the network operator').replace(/\bdistribution entity\b/g, 'network operator');
  // Queensland's 26 degree rule for mesh on sloping edge protection (s 306E) is stated generally elsewhere.
  out = out.replace(/(?:On slopes|Where the (?:roof|surface the work is done from|deck) slopes) (?:of |over |more than )?26 degrees[^.]*\./g, 'On steep slopes, mesh or sheeting is fitted to the edge protection as AS/NZS 4994 and the manufacturer require.');
  if (stateId === 'vic') out = out.replace(/\bhazardous chemicals register\b/g, 'register of hazardous substances').replace(/\s?\(the falls code suggests [^)]*\)/g, '');
  // The Northern Territory and the ACT are territories.
  if (stateId === 'nt' || stateId === 'act') out = out.replace(/\bthe state's\b/g, 'the territory\'s').replace(/\bstate's\b/g, 'territory\'s').replace(/\bthe state (requires|sets|allows)\b/g, 'the territory $1');
  return out;
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

module.exports = { localSource, localText, localNote, citedStates };
