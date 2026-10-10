// Where a control sits in the hierarchy of control (WHS Regulations s 36), read from its wording.
// One ranking for the builder check (W2, W10) and for the order SiteReady prints each step's
// controls in, so a SiteReady draft is checked by the same rule it was written to.
const { HIERARCHY } = require('./legislation');

// A printed code or law citation, such as "(Scaffolding Code of Practice 2021 (Qld) s 4.1)", is not
// part of the control: a section title must not move the line (goal 5 review, 7 October 2026).
const CITATION = /\s*\((?:[^()]|\([^()]*\))*?(?:\bRegulations?\b|\b[Cc]ode of [Pp]ractice\b|\bCoP\b|\bAct\b|\bRules \d{4})(?:[^()]|\([^()]*\))*\)/g;

// A sentence that only checks, inspects, tests or trains does not put the thing it names in place
// ("Pre-start check of the dust extraction", "A competent person checks the EWP").
const CHECK_SENTENCE = new RegExp([
  /^(?:(?:before|after|at|when|while)\b[^,]*,\s*)?(?:pre-start |pre-use |pre-operational )?(?:check|inspect|test)\w*\b/.source,
  /^(?:(?:before|after|at|when|while)\b[^,]*,\s*)?(?:the |a |an |each |every )?[\w' -]{0,40}?\b(?:checks|inspects|tests|does (?:a|an) [\w -]{0,30}?(?:inspection|check|test))\b/.source,
  /^(?:(?:before|after|at|when|while)\b[^,]*,\s*)?[^,.]{0,80}?\b(?:is|are)\s+(?:\w+\s+)?(?:checked|inspected|tested|confirmed)\b(?![^.]*\band (?:is|are) (?:supplied|fitted|protected|used|installed))/.source,
  /^(?:workers|operators|users|everyone|the crew)\b[^.]{0,30}\b(?:are|is) trained\b/.source,
].join('|'), 'i');

// "Use snips rather than an abrasive disc": a less hazardous tool, product, gas or method in place of
// a more hazardous one. The replaced thing must be such a hazard: "fall arrest instead of a restraint
// technique" or "a barrier in place of guardrails" swaps one control for another, and "lifting aids
// rather than holding by hand" is a mechanical aid, which the hazardous manual tasks code ranks as
// engineering.
const SWAP = /\b(?:rather than|instead of|in place of)\s+((?:an? |the )?[^.,;]*)/i;
const SWAPPED_HAZARD = /\b(?:abrasive|discs?|saws?|power tools?|mains tools?|tools?|sanders?|solvent\w*|acid|hydrochloric|air|dry\b|powders?|nail\w*|petrol|diesel|engine\w*|epoxy|refrigerant|oxygen|grinders?)\b/i;
const SUBSTITUTE = /\b(?:substitut(?:e|es|ed|ing)\b(?! (?:material|certified))|replaced? with|low[- ]voc|low[- ]vibration|less hazardous|lower hazard|ready-to-use|pre-mixed|lighter|use (?:a |the )?water[- ]based)\b/i;

const ELIMINATE = /\b(?:eliminat(?:e|es|ed|ing|ion)\b|do not place a person|stay(?:s|ing)? on the ground|not (?:done|carried out) at height|purg(?:e|ed|ing) (?:all )?traces\b|(?:felled|sl[iu]ng|released|installed|assembled|done|work(?:s|ed|ing)?|carried out|operated|fixed|fitted|cleaned|painted) (?:only )?from (?:the )?(?:ground|floor)\b|(?:made|built|assembled|fabricated|prefabricated|cut|done) (?:off[- ]?site|in the factory|at ground level|on the ground))/i;
// "Gaps ... are eliminated" closes them, which is engineering.
const NOT_ELIMINATE = /\bgaps?\b[^.]{0,80}\beliminated\b/i;

// Physical separation and engineering that is always a control when named in a line.
const ENGINEER = new RegExp(String.raw`\b(?:edge protection|guard\s?rails?|handrails?|safety mesh|safety nets?|catch platforms?|perimeter (?:containment )?screens?|edge screens?|screens|screened|gates?|fenc\w*|barriers?|barricad\w*|closed off|hoardings?|(?<!(?:plan|procedure|permit|training|assessment|swms|it|this) )(?:cover|covers(?! (?:the|all|any|adjacent|each|every|how|what|who|when|where)\b))|covered|isolat\w*|lock ?out|lockout|de-?energi[sz]\w*|shor(?:e|es|ed|ing)|trench (?:shields?|box\w*)|batter\w*|bench(?:ed|ing)|extract(?:ion|ed|s)?|on-tool|water suppression|wet (?:cut\w*|method\w*|sanding|drilling)|interlock\w*|guards?|guarded|guarding|ventilat\w*|local exhaust|propp(?:ed|ing)|props?|exclusion zones?|no[- ]go zones?|travel restraint|restraint system|hasps?|padlocks?|personal (?:danger )?locks?|lock(?:ed|ing)? (?:on|off)|(?:switch\w*|turn\w*) (?:the )?(?:\w+ )?(?:circuit )?(?:breakers?|isolators?|main switch) off|(?:breakers?|isolators?) (?:is |are )?(?:switched|turned) off|switch\w* off (?:the )?(?:power|supply)|pva|encapsulat\w*|seal\w* (?:with|in)|wrapp?\w*\b[^.]{0,30}\bin (?:\d+\s?(?:µm|microns?)\s+)?(?:heavy[- ]duty )?(?:plastic|polyethylene|poly)|hepa|h[- ]class vacuum\w*|enclosures?|negative pressure|rcds?|residual current|safety switch|trolleys?|lifting aids?|mechanical aids?|skates|\w*lifters?|bunds?|toe ?boards?|tool lanyards?|tethered|wheel stops?|fixed stops?|boarded runs?|(?:lay|laid|provide[sd]?|install\w*|use) (?:\w+ ){0,2}walkways?|insulated|non-conducting|voltage reduction device|hazard reducing device|flashback arrestors?|relief valves?|secondary guarding|(?:designed|rated|certified|suitable) for (?:use in )?(?:the )?(?:hazardous areas?|explosive atmospheres?)|(?:install\w*|fit\w*) (?:the )?ties\b|ties? (?:is|are) installed)\b`, 'i');
// Access equipment counts where the line works from it or puts it in place, not where it is the
// subject of a licence, plan, inspection or use rule ("a licensed scaffolder", "the scaffold plan").
const ACCESS = String.raw`(?:mobile |tower |modular |perimeter )?(?:scaffolds?|scaffolding|elevating work platforms?|ewps?|scissor lifts?|boom lifts?|work(?:ing)? platforms?|platform ladders?|step platforms?)`;
const ACCESS_USED = new RegExp(String.raw`\b(?:from|on|inside|within|behind|use[sd]?|using|provide[sd]?|install(?:s|ed)?|fit(?:s|ted)?|with|has|have|via|(?:is|are) by) (?:a |an |the |their |its )?(?:\w+ ){0,2}?${ACCESS}\b(?!')|\b${ACCESS}\b[^.;]{0,40}?\b(?:is|are) (?:used|in place|fitted|installed|provided|set up)\b`, 'i');
// Lifting plant used to move the load, not the crane company or its operator.
const LIFTED = /\b(?:lift(?:ed|s)?|mov(?:ed|e|es)|rais(?:ed|e)|lower(?:ed|s)?|plac(?:ed|e)|land(?:ed|s)?|carri(?:ed|es)|stood|hoisted)\b[^.]{0,50}?\b(?:with|by|on) (?:a |an |the )?(?:\w+ )?(?:cranes?|hoists?|forklifts?|telehandlers?|winch\w*|gin wheels?|chain blocks?|davits?|lifting gear)\b(?! (?:company|operator|crew))|\b(?:move|moves|moved) [^.]{0,40}\bwith it\b/i;
const SECURED = /\b(?:secured|anchored|tied|clamped|strapped|chained|bolted)\b(?: \w+){0,3}? (?:to|against|upright|at both|top and bottom|with|down)\b|\bfixed against\b/i;
// Isolation by distance: no one is in, under or between the hazard area while it is there (owner's
// test: "No worker is in the drop area while lifting").
const KEPT_OUT = /\bno (?:one|person|persons|workers?|people)\b[^.]{0,25}?\b(?:in|within|under|underneath|between|beside|inside)\b|\bno (?:load|loads)\b[^.]{0,25}?\bover (?:people|anyone|a person|persons|the public)\b|\bnever (?:\w+ ){0,3}over (?:people|anyone|a person|persons)\b|\b(?:area|zone)s? (?:is |are )?(?:kept )?clear of people\b|\b(?:do not|never) (?:stand|go|work|walk|enter)\w* (?:under|beneath|between)\b/i;
const HARNESS = /\b(?:harness\w*|(?<!tool )lanyards?|fall arrest|inertia reels?|srls?|self-retracting lifelines?)\b/i;
const PREVENTS_FALL = /\b(?:edge protection|guard\s?rails?|scaffold\w*|ewps?|elevating work platforms?|safety mesh|restraint system|travel restraint)\b/i;
const PPE = /\b(?:harness\w*|(?<!tool )lanyards?|fall arrest|inertia reels?|srls?|self-retracting lifelines?|ppe|respirators?|respiratory protective equipment|rpe|p2|gloves|glasses|sunglasses|goggles|eye protection|face protection|hearing protection|ear ?(?:plugs|muffs)|hard hats?|helmets?|\w*boots|footwear|hi-?vis|high visibility|life jackets?|face shields?|coveralls|overalls|knee ?pads|sunscreen|sun protection|long sleeves|protective clothing|natural fibre clothing)\b/i;

// The line as it bears on its level: no citation, no negated clause, no checking sentence, and no
// thing named only as what is being replaced.
function controlText(input, keepChecks = false) {
  let line = String(input).replace(CITATION, '');
  // Talking about an exclusion zone does not set one up.
  line = line.replace(/\b(?:communicat\w*|discuss\w*|brief\w*|regarding|about)\b[^.]{0,40}?\bexclusion zones?\b/gi, ' ');
  // "The assessment does not rely on ... extraction": named only to be set aside.
  line = line.replace(/\b(?:does|do) not (?:count|rely|include)\b[^.]*|[^.]*\bnot relied on\b[^.]*|\bwithout relying\b[^.]*/gi, ' ');
  // Vacuuming dusty clothing is personal hygiene, not dust control at the source.
  line = line.replace(/[^.]*\bclothing\b[^.]*\bvacuum\w*[^.]*|[^.]*\bvacuum\w*[^.]*\bclothing\b[^.]*/gi, ' ');
  if (keepChecks) return line;
  return line.split(/(?<=\.)\s+/).filter((sentence) => !CHECK_SENTENCE.test(sentence.trim())).join(' ');
}

function levelOf(line) {
  if (ELIMINATE.test(line) && !NOT_ELIMINATE.test(line)) return 'Eliminate';
  const swap = line.match(SWAP);
  if ((swap && SWAPPED_HAZARD.test(swap[1])) || SUBSTITUTE.test(line)) return 'Substitute';
  // What a swap replaces is not in place, and a negated rule ("do not use ladders on the scaffold",
  // "are not set up on a scaffold") does not put anything in place either.
  const kept = (swap ? line.replace(swap[0], ' ') : line)
    .replace(/\b(?:do not|don't|never|must not)\b(?! (?:\w+ ){0,3}over (?:people|anyone))[^.,;]*/gi, ' ')
    .replace(/\b(?:is|are) not (?!(?:\w+ ){0,2}(?:removed|moved|left))[^.,;]*/gi, ' ')
    // "has no guardrail", "rested on the platform's guardrails": the rail is not the control here.
    .replace(/\b(?:has|have|with) no\b[^.,;]*|\b(?:on|over|onto) (?:the |its |their )?(?:platform's )?guard\s?rails?\b/gi, ' ');
  // "Where prefabricated scaffold is used, it has a registered design": the condition does not put
  // the scaffold in place.
  const unconditioned = kept.replace(/^\s*(?:where|if|when)\b[^,]*,/i, ' ');
  const engineered = ENGINEER.test(kept) || ACCESS_USED.test(unconditioned) || LIFTED.test(kept) || SECURED.test(kept) || KEPT_OUT.test(line);
  // A harness line is PPE unless it also prevents the fall (edge protection, a platform, restraint).
  if (engineered && !(HARNESS.test(kept) && !PREVENTS_FALL.test(kept))) return 'Isolate or engineer';
  if (PPE.test(kept)) return 'PPE';
  return 'Administrative';
}

function controlLevel(input) {
  const line = controlText(input);
  const level = levelOf(line);
  // "Respirators are fit tested to the wearer": checking PPE is part of the PPE control.
  if (level === 'Administrative' && !PPE.test(line) && PPE.test(controlText(input, true))) return 'PPE';
  // "Where harnesses are used, anchors ... and a rescue procedure": the condition names the PPE the
  // line is about, so the line stays with the PPE.
  if (level === 'Administrative') {
    const condition = line.match(/^\s*(?:where|if|when)\b[^,]*,/i);
    if (condition && PPE.test(condition[0])) return 'PPE';
  }
  return level;
}

// A physical fall control (H3): what stops the fall, not a harness, a ladder, a barricade under
// the work or an isolation elsewhere in the step. Working from the ground removes the fall, and a
// barricade or fence at a trench, hole or edge stops a fall into it.
const PHYSICAL_FALL = /\b(guard ?rails?|edge protection|scaffold\w*|ewps?|elevat\w* work platforms?|scissor ?lifts?|boom lifts?|cherry pickers?|(?:mobile |temporary )?work(?:ing)? platforms?|safety (?:mesh|nets?)|catch (?:platforms?|scaffold\w*|decks?)|handrails?|roof rails?|perimeter (?:screens?|protection)|edge screens?|void protection|(?:void|penetration|hole|opening)s? covers?|cover\w* (?:all |the |any )?(?:voids?|penetrations?|openings?|holes?|skylights?)|(?:skylight|fragile roof) (?:covers?|mesh|guards?)|from the ground|stay\w* on the ground|(?:assembl|fabricat|buil)\w* (?:\w+ )?(?:on|at) (?:the )?ground(?: level)?|do not place a person)\b|\b(?:barricad\w*|fenc\w*|barriers?)\b[^.]{0,30}\b(?:trench\w*|excavat\w*|holes?|openings?|voids?|pits?|edges?|penetrations?|shafts?)\b|\b(?:trench\w*|excavat\w*|holes?|openings?|voids?|pits?|edges?|penetrations?|shafts?)\b[^.]{0,30}\b(?:barricad\w*|fenc\w*|barriers?)|\b(?:holes?|openings?|hatch\w*|voids?|penetrations?)\b[^.]{0,30}\b(?:protected|guarded)\b/i;
// "No edge protection" or "without a scaffold" says it is not there.
const NO_FALL_CONTROL = /\b(?:no|without|absence of|lack of|not (?:installed|provided|available))\b[^.,;]{0,20}\b(?:guard ?rails?|edge protection|scaffold\w*|ewps?|handrails?|safety mesh)\b/i;

// A line that stops a fall by itself, read without its printed citation: "(Scaffolding Code of
// Practice ...)" names a code, not a scaffold.
const withoutCitation = (line) => String(line || '').replace(CITATION, '');
function stopsFall(line) {
  const text = withoutCitation(line);
  return PHYSICAL_FALL.test(text) && !NO_FALL_CONTROL.test(text);
}

// Elimination, substitution, isolation and engineering controls.
const HIGHER = new Set(['Eliminate', 'Substitute', 'Isolate or engineer']);

const RANK = Object.fromEntries(HIERARCHY.map((level, index) => [level, index]));

// A step's controls in hierarchy order: elimination, substitution, isolation and engineering,
// administrative, then PPE. Lines of the same level keep the order they were written in.
function inHierarchyOrder(controls) {
  return controls
    .map((line, index) => ({ line, index, rank: RANK[controlLevel(line)] }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.line);
}

module.exports = { controlLevel, HIGHER, inHierarchyOrder, PHYSICAL_FALL, NO_FALL_CONTROL, stopsFall, withoutCitation };
