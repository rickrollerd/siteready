// The download gate (goal 2, owner, 7 October 2026): "SiteWrite will not produce a download until
// the site questions are answered", and every SWMS names the site, the principal contractor and the
// person responsible for monitoring controls. Word, PDF, the project zip and saving all ask this
// module what a SWMS still needs; the preview stays open without it (D186).
//
// The other check before download (D184, the tick for work SiteWrite has no job steps for) is
// listed here too, so the page and the server name every outstanding item in one place.
//
// What is asked, and why:
// - The job address, the principal contractor and the person who makes sure the SWMS is followed:
//   the goal names them. "Not applicable" is accepted for the principal contractor only, as a job
//   with no principal contractor appointed (under the WHS Regulations' $250,000 threshold) truly
//   has none.
// - The person who reviews the controls: with the person above, who monitors the controls (WHS
//   Regulations s 299(1)(c): how the controls are implemented, monitored and reviewed). Both print
//   as boxes on every SWMS.
// - The first aider and the muster point: the emergency arrangements the goal asks for; unanswered,
//   they print as "First aider: ____" and "To be completed". The hospital or medical centre too (D292).
// - The scaffold supervisor, only where the SWMS involves a scaffold. "Not applicable" is accepted,
//   so a scaffold named only in passing never forces a false answer.
// - The five site questions (live services, public interface, other trades, ground, access).
//   "None" is accepted for all but access: there is always a way to the work.
// - The plant to be used (goal 2: "ask for the plant, do not guess it"): the user confirms the plant
//   SiteWrite lists, ticking what the crew uses and adding their own, and gives the licence or ticket
//   for an item of their own SiteWrite does not know. Plant SiteWrite lists after the user confirmed
//   (the task or steps changed) is asked about again.
// - The emergency response for each high risk category the SWMS involves (emergency.js): the one or
//   two facts a reviewer looks for. "Not applicable" is not accepted: a question is asked only where
//   its category applies.
// - Any blank (____) or "To be completed" left in what prints: in the user's own answers, which are
//   filled in their boxes, and in SiteWrite's control lines, which are filled where they show.
//   In a job step the user wrote for work SiteWrite does not cover, the user changes the step.
// - Each design a job step relies on (designs.js): its details, "Not issued yet" (a hold point), or
//   "Not needed for this work", recorded as the user's choice.
// - Each hazardous product the user listed (substances.js, owner D256): its name, the PPE and controls
//   from its safety data sheet, the SDS's issue date, the step that uses it, and the tick that the row
//   matches the SDS. Each type of substance SiteWrite suggests needs a product or the tick "Not used
//   on this job" (D277); a ticked type prints nothing.
const { SITE_FIELDS } = require('./legislation');
const { askQuestions, involvesScaffold, notCoveredRefusal, notCoveredLeft, notCoveredUnwritten } = require('./draft');
const { hasBlank, isPlaceholder, leftOpen, blankKey, blankParts } = require('./blanks');
// After the user lists a hazardous product from its safety data sheet, the safetyDataSheet blank is not
// needed: the listed products replace it (draft.js notSdsQuestion / productsListed).
const productsListed = (input) => Array.isArray(input && input.substances) && input.substances.some((row) => row && /^sub-\d{1,2}$/.test(String(row.id || '')) && String(row.product || '').trim());
// How each answer is judged, shared with the page so a box's note clears as soon as it is answered.
const { clean, heldIn, answerNeed, notAnswer, licenceNeed, PEOPLE_FIELDS, fieldRule, SITE_NEED, SITE_NONE: SITE_NONE_LIST, SITE_KIND, ownLineProblem, phoneNumber, fieldWeak } = require('./public/gate-rules');
const { emergencyQuestions, INVOLVES, SHORT } = require('./emergency');
const { designNeed } = require('./designs');
const substances = require('./substances');
const rules = require('./public/substance-rules');

// Each field: the input key, the page box it is answered in, its label and what is needed
// (public/gate-rules.js PEOPLE_FIELDS, shared with the page). The scaffold supervisor only where the
// SWMS involves a scaffold.
const FIELDS = PEOPLE_FIELDS.map((item) => (item.scaffold ? { ...item, when: (draft) => involvesScaffold(draft) } : item));

// Boxes that may be left empty, but not with a placeholder in them: it would print.
const OPTIONAL = [
  // A name box left empty is fine; a name in it is judged by the one person rule (messy round 11).
  { id: 'siteManager', field: 'site-manager', label: 'Site manager', kind: 'person' },
  { id: 'reviewDate', field: 'review-date', label: 'Review date' },
  { id: 'preparedBy', field: 'prepared-by', label: 'Prepared by', kind: 'person' },
  { id: 'swmsRef', field: 'swms-ref', label: 'SWMS reference number' },
];

const SITE_NONE = new Set(SITE_NONE_LIST);
// The gear a rescue answer names, which the rescue equipment answer must have too.
const RESCUE_GEAR = /\b(?:harness(?:es)?|lifelines?|(?:rescue )?lines?|ropes?|tripods?|winch(?:es)?|davits?|stretchers?|spinal boards?|rescue kits?|pole)\b/i;
// A first aid kit is not rescue gear (messy round 19, B run 8: "ladder n first aid kit at the trench box" passed beside a rescue
// with a harness and line).
const NO_GEAR_NEEDED = /\b(?:rescue kit|(?<!first aid )kit)\b/i;

// A scaffold the user confirmed in the plant for this job.
// "a", "b" and "c", each in quotes.
const quotedList = (names) => {
  const quoted = names.map((name) => `"${name}"`);
  return quoted.length > 1 ? `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}` : quoted[0] || '';
};

function scaffoldInPlant(input, draft) {
  const used = input.plantChoice && Array.isArray(input.plantChoice.used) ? input.plantChoice.used : [];
  const added = input.plantChoice && Array.isArray(input.plantChoice.added) ? input.plantChoice.added.map((item) => item && item.item) : [];
  return [...used, ...added].some((name) => /\bscaffold/i.test(String(name || ''))) && (draft.plant || []).some((row) => /\bscaffold/i.test(String(row.item || '')));
}

// A SWMS whose own job steps erect or dismantle the scaffold: the user is the scaffolder.
const erectsScaffold = (draft) => (draft.jobSteps || []).some((step) => /^(?:Erect the scaffold|Dismantle the scaffold)$/.test(step.step));

// A job step whose hazard is a live electrical supply, or null: { step, hazard }. A shock from the crew's own leads,
// tools or wet cutting is not a live service at the work.
const LIVE_SUPPLY = /\b(?:electric(?:al)? shock|electrocution|arc flash)\b[^.]*\b(?:supply|supplies|switch ?boards?|mains|energised|live|circuits?|cables?|wiring|board|traction|isolated|connect\w*|controls?|motor)\b|\b(?:live|energised|energized) (?:parts?|cables?|circuits?|switch ?boards?|supply|supplies|services?|conductors?|mains|wiring|equipment|installations?)\b|\bcontact with (?:live|energised|buried|underground|overhead) (?:services|cables?|power|electrical|lines?|conductors?)\b/i;
// The first job step that digs into the ground (a trench, an excavation, holes), unless it does not apply.
const DIG_STEP = /\b(?:excavat\w*|trench\w*|dig(?:s|ging)?|pot ?hol\w*|bor(?:e|ing) (?:under|for|holes?)|footing holes?|post holes?|pier holes?|auger\w*|backfill\w*)\b/i;
function digStep(draft) {
  const step = (draft.jobSteps || []).find((one) => one && DIG_STEP.test(String(one.step || '')) && !/\(Does not apply to this job\)$/.test(String(one.step || '')));
  return step ? step.step : '';
}
// A step that sets plant up on the ground (an EWP, a crane or hiab, mobile plant), unless it does not apply: the ground under
// it matters (messy round 16, A run 2: "na" printed "Ground: Not applicable" with a boom lift set up in a back lane).
// An EWP counts where it is a boom-type one, which sets up outside on the ground: a scissor lift on a floor inside does not
// make "na" wrong for Ground (a ceiling job's answer stays as it was).
const PLANT_ON_GROUND = /\b(?:cranes?|hiabs?|outriggers?|excavators?|loaders?|forklifts?|telehandlers?|bobcats?|skid steers?|piling rigs?|drill rigs?|concrete pumps?|road plant|pavers?|rollers?|profilers?)\b/i;
const EWP_STEP = /\b(?:elevating work platforms?|ewps?|boom lifts?|cherry pickers?)\b/i;
const BOOM_NAMED = /\b(?:boom lifts?|boom-type|cherry pickers?|knuckle booms?|stick booms?|trailer[- ]mounted (?:ewps?|booms?))\b/i;
function plantOnGround(draft, input = {}) {
  const words = [input.task, input.jobDescription, ...Object.values((input && input.site) || {}), ...((input.plantChoice && input.plantChoice.used) || []), ...((input.plantChoice && input.plantChoice.added) || []).map((item) => item && item.item)].map((text) => String(text || '')).join('\n');
  const step = (draft.jobSteps || []).find((one) => one && !one.own && !/\(Does not apply to this job\)$/.test(String(one.step || '')) && (PLANT_ON_GROUND.test(String(one.step || '')) || (EWP_STEP.test(String(one.step || '')) && BOOM_NAMED.test(words))));
  return step ? step.step : '';
}
// Work beside the public: the task, the user's own steps or the Access answer name a street, footpath, lane or traffic (messy
// round 16, A run 4: "None" was taken for Public interface while the user's own step barricaded the street below the frames
// coming out). A site's own haul road or access road is not a public way, and "no traffic" is not one either.
// A public bridge or path counts too, typed as it may be ("pedestrain bridge": messy round 17, B run 7).
const PUBLIC_WAY = /\b(?:footpaths?|pavements?|streets?|laneways?|back lanes?|lanes?|roads?|verges?|kerbs?|nature strips?|pedestr\w*(?: (?:bridges?|paths?|crossings?|walkways?))?|foot ?bridges?|shared paths?|bike paths?|cycle ?ways?|walking (?:paths?|tracks?)|traffic|the public|members of the public|passers-?by|shoppers|neighbou?rs)\b/i;
// The Access answer says how the crew gets in: a street it comes in from ("the loading dock off Davey Street") is the way in,
// not a public way beside the work (messy round 17, B run 6: "None" for an indoor hotel fit-out was refused because the
// Access answer named "Davey Street"). Read as draft.js reads it for high risk work (ACCESS_ROUTE).
const ACCESS_ROUTE = /\b(?:off|from|via)\s+(?:the\s+)?(?:[\w'-]+\s+){0,3}?(?:roads?|rd|streets?|st|highways?|hwy|avenues?|ave|drives?|parades?|boulevards?|terraces?|tce|crescents?)\b/gi;
// A step that lifts loads with a crane or hiab: the lift area is where the public must be kept clear (messy round 17, A run 4:
// Public "none" passed beside hiab lifts on a driveway by a public terrace).
const LIFT_STEP = /\b(?:cranes?|hiabs?|truck loading crane|vehicle loading crane|crane crew)\b/i;
// Compaction rollers only, not paint rollers ("Clean brushes and rollers").
// A concrete pump and its trucks too (messy round 19, A run 1: Public "None" beside the pump and concrete trucks at the gate).
const MOBILE_PLANT_STEP = /\b(?:concrete pumps?|earthmoving plant|excavators?|skid steers?|bobcats?|loaders?|(?:vibrating|smooth drum|padfoot|road|compaction|steel drum|multi-tyred|ride-on) rollers?|graders?|dozers?|tippers?|dump trucks?|mobile plant)\b/i;
const AWNING_WORK = /\b(?:(?:street|footpath|external|entry|shopfront) )?awnings?\b/i;
const NOT_PUBLIC = /\b(?:site|haul|internal|access|private|construction|temporary|service)\s+(?:roads?|lanes?|tracks?)\b|\b(?:no|not|without|nil|none)\b[^.;,]{0,20}\b(?:traffic|public|pedestrians?|footpaths?|roads?|streets?)\b|\bopen (?:edges?|lanes? of the floor)\b/gi;
function publicWay(draft, input) {
  const sources = [
    ['The task', String((input && (input.task || input.jobDescription)) || '')],
    ...(draft.jobSteps || []).filter((step) => step.own).map((step) => [`Your step "${String(step.step || '').replace(/\s*\(Our own step\)$/, '')}"`, [step.step, ...(step.hazards || []), ...(step.controls || [])].join('\n')]),
    ['Your Access answer', String(((input && input.site) || {}).access || '').replace(ACCESS_ROUTE, ' ')],
  ];
  for (const [where, text] of sources) {
    const found = PUBLIC_WAY.exec(String(text).replace(NOT_PUBLIC, ' '));
    if (found) return { where, words: found[0], why: `${where} names "${found[0]}", so the public or traffic is near the work.`, ask: publicExample(found[0]) };
  }
  // An awning is built over the footpath or street frontage (messy round 19, B run 6: Public "none" passed for the external awning
  // soffits, worked from an EWP over the street frontages). "None" with how the public is kept away passes.
  const awning = AWNING_WORK.exec(String((input && (input.task || input.jobDescription)) || '').replace(NOT_PUBLIC, ' '));
  if (awning) return { where: 'The task', words: awning[0], why: `The task names "${awning[0]}", which is usually built over a footpath or street frontage, so the public may be below the work.`, ask: 'Say how the public is kept clear below it, for example "Footpath under the awning closed with barricades and signs while we work" or "None. The awning is inside the site hoarding, no public access".' };
  const lift = (draft.jobSteps || []).find((step) => step && !step.own && LIFT_STEP.test(String(step.step || '')) && !/\(Does not apply to this job\)$/.test(String(step.step || '')));
  if (lift) return { where: `The step "${lift.step}"`, words: 'lift', why: `The step "${lift.step}" lifts loads, so the lift area must be kept clear of the public.`, ask: 'Say how the public is kept out of the lift area, for example "Lift area inside the site fence, no public access" or "Footpath closed with barricades during each lift".' };
  // A step that runs mobile plant: its work area must be kept clear of the public too (messy round 18, B run 8: Public "none"
  // passed for a fence line dug by the crew's bobcat, with a soft finding only). "None" with how the public is kept away passes.
  const plant = (draft.jobSteps || []).find((step) => step && !step.own && MOBILE_PLANT_STEP.test(String(step.step || '')) && !/\(Does not apply to this job\)$/.test(String(step.step || '')));
  if (plant) return { where: `The step "${plant.step}"`, words: 'plant', why: `The step "${plant.step}" runs mobile plant, so its work area must be kept clear of the public.`, ask: 'Say how the public is kept clear of the plant, for example "None. The site is fenced, no public access" or "Footpath closed with barricades while the plant works".' };
  return null;
}
// The example in the refusal fits what was found (messy round 17, B runs 6 and 8: the example was about window frames
// coming out, for a hotel fit-out and for tree planting).
function publicExample(words) {
  const say = 'Say how the public and traffic are kept clear of the work, for example';
  if (/^(?:foot ?paths?|pavements?|verges?|nature strips?)$/i.test(words)) return `${say} "Footpath beside the work closed with barricades and signs" or "Footpath stays open behind a hoarding".`;
  if (/traffic|roads?|lanes?|streets?|kerbs?/i.test(words)) return `${say} "Work area fenced off from the street, deliveries inside the site" or "Lane closed under the traffic management plan".`;
  if (/pedestr|bridges?|paths?|ways?|tracks?/i.test(words)) return `${say} "Path closed at both ends with barricades and signs while we work" or "Path stays open behind a fenced walkway".`;
  return `${say} "Footpath beside the work closed with barricades and signs" or "Work area fenced off, no public inside".`;
}
function liveSupplyHazard(draft) {
  for (const step of draft.jobSteps || []) {
    const hazard = (step.hazards || []).find((line) => typeof line === 'string' && !/\(Does not apply to this job\)$/.test(line) && LIVE_SUPPLY.test(line) && !/\b(?:leads?|extension|tools?|wet cutting|water)\b[^.]*\.?$/i.test(line.replace(/\b(?:supply|switch ?boards?|mains)\b.*$/i, '')));
    if (hazard) return { step: step.step, hazard };
  }
  return null;
}
// A step that locates underground services before digging, or connects to a live sewer or main: the task has services at the
// work (messy round 18, B run 6: "none" passed for a sewer dug along a main road, whose steps locate underground services and
// connect to the live sewer; A run 1 refused it beside an energised step). A dig on its own ("Dig post holes") is not enough.
const SERVICES_STEP = /^(?:Locate underground services|Connect to the live sewer|Connect to the water supply|Test and connect to live medical gas services)$/;
function buriedServices(draft) {
  for (const step of draft.jobSteps || []) {
    if (!step || step.own || /\(Does not apply to this job\)$/.test(String(step.step || ''))) continue;
    if (SERVICES_STEP.test(String(step.step || ''))) return { step: step.step, why: /^Locate/.test(step.step) ? `The step "${step.step}" finds the services in the ground before digging, so there are services at the work.` : `The step "${step.step}" connects to a live service.` };
  }
  return null;
}

// The words of a job that say it has a principal contractor: a subcontract's "the Contractor" or "the Subcontractor",
// or the builder, head, main or principal contractor named in the task, the scope it came from or a site answer, or
// site details set by a main contractor (Goal 12). The words found, for the refusal, or ''.
const CONTRACTOR_WORDS = /\b(?:head|main|principal) contractor\b|\bsub-?contract(?:or)?s?\b|\bbuilder(?:'s|s'|s)?\b|\bthe PC\b|\btier ?(?:1|one)\b/i;
function contractorNamed(input) {
  if (clean(input.firstAidLocation) || (Array.isArray(input.siteRules) && input.siteRules.some((rule) => clean(rule)))) return 'the site details come from the main contractor';
  const scope = input.scopeTask && typeof input.scopeTask === 'object' ? [input.scopeTask.full, input.scopeTask.plain] : [];
  const site = input.site && typeof input.site === 'object' ? Object.values(input.site) : [];
  const words = [input.task, ...scope].filter((text) => typeof text === 'string').join('\n');
  const inTask = /\bthe Contractor\b/.exec(words) || CONTRACTOR_WORDS.exec(words);
  if (inTask) return `the task mentions "${inTask[0]}"`;
  const inSite = CONTRACTOR_WORDS.exec(site.filter((text) => typeof text === 'string').join('\n'));
  return inSite ? `your site answers mention "${inSite[0]}"` : '';
}

// What the plant still needs: confirming, plant listed since it was confirmed, or the licence for an
// item of the user's own. '' when it is confirmed.
const PLANT_NEED = 'Tick the plant and equipment your crew will use on this job, untick what it will not use, add any that is missing, then press Confirm the plant. Only the plant you confirm prints on the SWMS.';
function plantNeed(input, draft) {
  const choice = input.plantChoice && typeof input.plantChoice === 'object' ? input.plantChoice : null;
  if (!choice) return PLANT_NEED;
  const listed = Array.isArray(draft.plantInferred) ? draft.plantInferred : (draft.plant || []).map((row) => ({ item: row.item }));
  const seen = new Set([...(choice.used || []), ...(choice.notUsed || [])]);
  const unseen = listed.filter((item) => !seen.has(item.item)).map((item) => item.item);
  if (unseen.length) return `SiteWrite now also lists ${unseen.join(', ')}. Tick ${unseen.length === 1 ? 'it' : 'each one'} if your crew uses it, then press Confirm the plant.`;
  const open = (draft.plant || []).filter((row) => row.own && !clean(row.licence)).map((row) => row.item);
  if (open.length) return `Give the licence or ticket to operate ${open.join(', ')}, or write No if none is needed, then press Confirm the plant.`;
  // A licence that does not say which ("crane ticket", messy round 4) is changed under the plant.
  const vague = (draft.plant || []).filter((row) => row.own).map((row) => licenceNeed(row.item, row.licence)).find(Boolean);
  if (vague) return `${vague} Change it under Plant and equipment (Remove, then add it again with the licence), then press Confirm the plant.`;
  // "No" for plant that needs a licence by its size or use (messy round 6: a HIAB with licence "No").
  const asked = (draft.plant || []).find((row) => row.own && row.licenceAsked);
  if (asked) return `${asked.item}: "${clean(asked.licenceAsked)}" is not enough for this plant. ${asked.licence.replace(/^Yes,?\s*/, 'A high risk work licence is needed: ')}${/\.$/.test(asked.licence) ? '' : '.'} Give the licence, or say in a few words why none is needed (for example "No, it is under 10 metre-tonnes"). Change it under Plant and equipment (Remove, then add it again), then press Confirm the plant.`;
  return '';
}

// The question each answer belongs to, for its label.
function factLabels(input) {
  try {
    const asked = askQuestions(input);
    return new Map((asked.required || []).map((item) => [item.id, item.label]));
  } catch (error) {
    return new Map();
  }
}

// A printed line that came from one of the user's answers with a blank in it: the words beside one
// of the answer's blanks are in the line. An answer is split into lines by its sentences.
function fromAnswer(text, answers) {
  const line = clean(text).toLowerCase();
  if (!hasBlank(line)) return false;
  return answers.some((answer) => clean(answer).toLowerCase().split(/_{3,}/).map((part) => part.trim()).filter((part) => part.length >= 12)
    .some((part) => line.includes(part.slice(-30)) || line.includes(part.slice(0, 30))));
}

// Every text the SWMS prints from its steps, controls and registers.
function printedTexts(draft) {
  return [
    ...(draft.jobSteps || []).flatMap((step) => [...(step.hazards || []), ...(step.controls || [])]),
    ...(draft.controls || []).map((item) => item && item.text),
    ...(draft.references || []).map((item) => item && item.text),
    ...(draft.emergency || []).map((row) => [row.equipment, row.detail].filter(Boolean).join('. ')),
    ...(draft.plant || []).flatMap((row) => [row.item, row.inspection, row.licence]),
    ...(draft.qualifications || []),
  ].filter((text) => typeof text === 'string' && text);
}

// Every check the gate makes on this SWMS, answered or not: a list of
// { id, kind: 'cover' | 'field' | 'site' | 'plant' | 'emergency' | 'design' | 'substance' | 'substanceType' | 'fact' | 'line' | 'own' | 'other', field, label,
// need, rule?, key?, parts?, step? }. need is '' where the answer passes. rule, where given, is how the
// answer is judged (public/gate-rules.js answerNeed), so the page can judge it again as the user types
// and show the item again if the answer is taken out. Items without a rule (the plant, anything else
// left open in what prints) are judged here only.
// options.cover false leaves out the D184 tick, for a SWMS already saved (it was ticked when saved,
// or saved before the tick existed).
function gateChecks(input = {}, draft = {}, options = {}) {
  if (!draft || draft.kind !== 'draft') return [];
  const checks = [];
  const gaps = [];
  const add = (check) => { checks.push(check); if (check.need) gaps.push(check); };
  const judged = (check, rule, value) => add({ ...check, need: answerNeed(rule, value), rule });
  // Parts of the task with no job steps, not ticked as dealt with above the draft (D184).
  const uncovered = options.cover === false ? '' : notCoveredRefusal(draft, input);
  // Work that is all the task's work (D211) needs the user's own step, not the tick.
  const unwritten = uncovered ? notCoveredUnwritten(draft) : [];
  if (unwritten.length) add({ id: 'notCovered', kind: 'cover', field: 'not-covered-write', label: 'Your own step for work SiteWrite has no job steps for', need: `SiteWrite has no job steps for: ${unwritten.join('; ')}. This is the work of the task, so write your own step for it with "Write a step for this" above the draft.`, message: uncovered });
  else if (uncovered) add({ id: 'notCovered', kind: 'cover', field: 'not-covered-write', label: 'Work SiteWrite has no job steps for', need: `SiteWrite has no job steps for: ${notCoveredLeft(draft).join('; ')}. Above the draft, write your own step for it, say which step in this SWMS covers it, or say which SWMS covers it.`, message: uncovered });
  // Falls answered No while a step rates a fall from height High (draft.js withFallCheck): the person
  // checks the answer (messy round 8, run 5).
  const fall = draft.fallConflict;
  if (fall && !fall.kept) {
    // Every step is named, and an edge step No leaves out is said (messy round 9, run 8).
    const steps = fall.steps || [];
    const left = fall.leftOut || [];
    const said = fall.depth
      ? `but the work is ${fall.depth} metres deep${steps.length ? `, and ${steps.length === 1 ? 'the step' : 'the steps'} ${quotedList(steps)} ${steps.length === 1 ? 'rates' : 'rate'} a fall` : ''}${left.length ? `, and with No ${left.length === 1 ? 'the step' : 'the steps'} ${quotedList(left)} ${left.length === 1 ? 'is' : 'are'} left out of this SWMS` : ''}.`
      : steps.length
      ? `but ${steps.length === 1 ? 'the step' : 'the steps'} ${quotedList(steps)} ${steps.length === 1 ? 'rates' : 'rate'} a fall from height High${left.length ? `, and with No ${left.length === 1 ? 'the step' : 'the steps'} ${quotedList(left)} ${left.length === 1 ? 'is' : 'are'} left out of this SWMS` : ''}.`
      : `so ${left.length === 1 ? 'the step' : 'the steps'} ${quotedList(left)} ${left.length === 1 ? 'is' : 'are'} left out of this SWMS.`;
    add({ id: 'fallCheck', kind: 'fall', field: 'fall-check', label: 'Fall from height', need: `You answered No to a fall of more than ${fall.metres} metres, ${said} Answer Yes if anyone could fall more than ${fall.metres} metres.${steps.length ? ' If the step is not part of this job, untick it.' : ''} If no one can fall that far, press Keep No.` });
  }
  // "No crane" while the task names a crane (draft.js withCraneCheck): the person says who operates it, or keeps No crane
  // (messy round 16, B run 7).
  // The state ticked is not the job address's state (messy round 17, A run 4: Northern Territory ticked for a Fremantle WA
  // address printed no warning). The SWMS must use the law of the state where the work is done.
  const fromAddress = require('./public/address').stateFromAddress(String(input.workplace || '')).state;
  const ticked = String(input.state || '').toLowerCase();
  if (fromAddress && ticked && fromAddress !== ticked) {
    const name = (id) => ({ qld: 'Queensland', nsw: 'New South Wales', vic: 'Victoria', sa: 'South Australia', wa: 'Western Australia', tas: 'Tasmania', nt: 'the Northern Territory', act: 'the Australian Capital Territory' }[id] || id.toUpperCase());
    add({ id: 'stateCheck', kind: 'state', field: 'states', label: 'State', need: `The job address is in ${name(fromAddress)}, but ${name(ticked)} is ticked. Tick the state the job is in, or change the job address.` });
  }
  const crane = draft.craneConflict;
  if (crane && !crane.kept) add({ id: 'craneCheck', kind: 'crane', field: 'crane-check', label: 'Crane', need: `You answered No crane, but the task names "${crane.words}". Say who operates it: Our company or A crane company. If no crane, crane truck or hiab is used, press Keep No crane.` });
  for (const item of FIELDS) {
    if (item.when && !item.when(draft)) continue;
    const rule = fieldRule(item);
    // A scaffold ticked in the plant is a scaffold used for this work: "Not applicable" is refused
    // (messy round 3, run 6).
    if (item.scaffold && scaffoldInPlant(input, draft)) {
      rule.noneRefused = 'Scaffold is ticked in the plant for this job, so the scaffold supervisor is needed. If no scaffold is used, untick it under Plant and equipment.';
      rule.ask = 'Name the scaffolding company\'s supervisor who hands the scaffold over and tags it.';
    }
    // The scaffolder's own SWMS asks for their own scaffold supervisor, not "the scaffolding company's"
    // (messy round 4, run 9).
    if (item.scaffold && erectsScaffold(draft)) rule.ask = 'Your crew erects the scaffold. Name your scaffold supervisor who hands it over and tags it.';
    // A job that has a principal contractor does not print "Not applicable" for it (messy round 14, B run 7: the
    // pasted scope named the Contractor and the Subcontractor, and "n/a" printed "Not applicable").
    if (item.id === 'principalContractor') {
      const named = contractorNamed(input);
      if (named) {
        rule.noneRefused = `This job has a principal contractor: ${named}.`;
        rule.ask = 'Name the principal contractor running the site, for example "ABC Builders Pty Ltd".';
      }
    }
    judged({ id: item.id, kind: 'field', field: item.field, label: item.label }, rule, input[item.id] || (item.id === 'workplace' ? input.siteAddress : ''));
  }
  for (const item of OPTIONAL) judged({ id: item.id, kind: 'field', field: item.field, label: item.label }, { optional: true, ...(item.kind ? { kind: item.kind } : {}) }, input[item.id]);
  // The company phone prints in every SWMS's header: a number the site cannot ring is asked about before
  // download (messy round 8, runs 3 and 6: "0412 555 81" printed). Fixed in the Company profile.
  const companyPhone = clean(input.companyPhone);
  if (companyPhone) add({ id: 'companyPhone', kind: 'field', field: 'profile-phone', label: 'Company phone', need: phoneNumber(companyPhone) ? '' : `${fieldWeak('phone', companyPhone)} Fix it in the Company profile at the top, then press Save profile.` });
  // The plant to be used, confirmed by the user, and the emergency response for the work (goal 2).
  add({ id: 'plant', kind: 'plant', field: 'plant-ticks', label: 'Plant and equipment', need: plantNeed(input, draft) });
  const said = input.emergency && typeof input.emergency === 'object' ? input.emergency : {};
  const emergencyAsked = emergencyQuestions(draft, said);
  for (const item of emergencyAsked) {
    // The rescue equipment has the gear the rescue answer uses: "harness and line from the top" with "ladder at the trench"
    // as the only equipment is refused (messy round 17, A run 2).
    const rescue = item.kit ? emergencyAsked.find((other) => other.category === item.category && other.rescue) : null;
    const gear = rescue ? (String(rescue.answer || '').match(RESCUE_GEAR) || [])[0] : '';
    if (gear && item.answer && !RESCUE_GEAR.test(String(item.answer)) && !NO_GEAR_NEEDED.test(String(item.answer))) {
      judged({ id: `emergency.${item.id}`, kind: 'emergency', field: `emg-${item.id}`, label: `Emergency, ${SHORT[item.category]}: ${item.short}` }, { ask: `${item.ask} ${item.hint}`, emergency: true, involves: INVOLVES[item.category], kit: true, gear: { word: gear.toLowerCase(), pattern: RESCUE_GEAR.source } }, item.answer);
      continue;
    }
    judged({ id: `emergency.${item.id}`, kind: 'emergency', field: `emg-${item.id}`, label: `Emergency, ${SHORT[item.category]}: ${item.short}` }, { ask: `${item.ask} ${item.hint}`, emergency: true, involves: INVOLVES[item.category], ...(item.rescue ? { rescue: true } : {}), ...(item.kit ? { kit: true } : {}), ...(item.stop ? { stop: true } : {}), ...(item.controls ? { controls: true } : {}), ...(item.role ? { role: true } : {}), ...(item.category === 'fall' && item.rescue ? { fall: true } : {}) }, item.answer);
  }
  // Each design the steps rely on (designs.js, owner, 11 October 2026): issued with who prepared it,
  // its number and date; "Not issued yet", which prints as a hold point; or "Not needed for this
  // work", recorded as the user's choice. A design the user added is asked about only once named.
  // A written method the user chose to list (D224) is optional and never asked about here.
  for (const row of (draft.designs || []).filter((item) => item.kind !== 'method')) {
    add({ id: `design.${row.id}`, kind: 'design', field: `design-${row.id}`, label: `Design: ${row.what}`, design: row.id, need: designNeed(row) });
  }
  // Each type of substance SiteWrite suggests: a product added, or ticked "Not required" (D277).
  for (const item of substances.typeItems(draft, input)) {
    add({ id: `substanceType.${item.n}`, kind: 'substanceType', field: `sub-type-${item.n}`, label: `Hazardous substance: ${rules.promptName(item.type)}`, substanceType: item.type, need: item.need });
  }
  // Each hazardous product listed, checked against its safety data sheet (substances.js, D256).
  for (const item of substances.gateItems(draft)) {
    add({ id: `substance.${item.id}`, kind: 'substance', field: `substance-${item.id}`, label: item.label, substance: item.id, need: item.need });
  }
  // The user's own answers with a blank still in them where the SWMS prints them, filled in their own
  // boxes. An answer the SWMS does not print leaves no blank in it.
  const facts = input.facts && typeof input.facts === 'object' ? input.facts : {};
  const printed = printedTexts(draft);
  const blankFacts = Object.entries(facts).filter(([id, value]) => {
    if (id === 'safetyDataSheet' && productsListed(input)) return false;
    return typeof value === 'string' && hasBlank(value) && printed.some((text) => fromAnswer(text, [value]));
  });
  const labels = blankFacts.length ? factLabels(input) : new Map();
  for (const [id, value] of blankFacts) {
    judged({ id: `fact.${id}`, kind: 'fact', field: `fact-${id}`, label: labels.get(id) || 'Your answer to a question' }, { ask: 'Your answer still has a blank (____). Fill it in, or take out the part that does not apply.', blank: true }, value);
  }
  const site = input.site && typeof input.site === 'object' ? input.site : {};
  // "None" for Live services beside a step whose hazard is a live supply is not an answer (messy round 14, B run 5:
  // "n/a" printed "Not applicable" beside "Electric shock from the lift supply").
  const live = liveSupplyHazard(draft);
  // "None" for Ground where a step digs is not an answer either (messy round 15, SiteLink: "na" printed "Ground: Not
  // applicable" in the In-ground (trench) SWMS).
  const dig = digStep(draft);
  const ground = dig ? '' : plantOnGround(draft, input);
  const street = publicWay(draft, input);
  for (const field of SITE_FIELDS) {
    const rule = { ask: SITE_NEED[field.id] || `Answer ${field.label}.`, name: field.label, none: SITE_NONE.has(field.id), ...(SITE_KIND[field.id] ? { kind: SITE_KIND[field.id] } : {}) };
    if (field.id === 'liveServices' && live) {
      rule.noneRefused = `The step "${live.step}" has the hazard "${live.hazard.replace(/[.]+$/, '')}", so there are live services at the work.`;
      rule.ask = 'Name them and where they are, for example "Live 400 V supply to the lift controller in the machine room".';
    }
    const buried = field.id === 'liveServices' && !live ? buriedServices(draft) : null;
    if (buried) {
      rule.noneRefused = buried.why;
      rule.noneChecked = true;
      rule.ask = 'Name them and where they are, for example "Live sewer main at the manhole, gas and power marked out along the nature strip", or say how the dig was checked, for example "None found: the Before You Dig plans and the locator show none in the dig area".';
    }
    if (field.id === 'ground' && dig) {
      rule.noneRefused = `The step "${dig}" digs into the ground.`;
      rule.ask = 'Say what the ground is like where you dig, for example "Firm clay fill, no groundwater" or "Sandy soil, trench shields below 1.5 m".';
    }
    if (field.id === 'ground' && ground) {
      rule.noneRefused = `The step "${ground}" sets plant up on the ground.`;
      rule.ask = 'Say what the ground is like where it sets up, for example "Level asphalt in the back lane, firm" or "Level concrete slab, no loads over 3 kPa".';
    }
    if (field.id === 'publicInterface' && street) {
      rule.noneRefused = street.why;
      rule.ask = street.ask;
      // "None" that goes on to say how the public is kept away answers the question (messy round 17, B run 6: "None. The
      // hotel is closed for the fit-out and the site is fenced off from Davey Street.").
      rule.noneWithReason = true;
    }
    // "na" says the question does not apply, but other trades either work near the crew or none do (messy round 16, A
    // run 2: "na" printed "Other trades: Not applicable").
    if (field.id === 'otherTrades') rule.naRefused = 'Name the trades working near you and where, or write None if no other trade works near this work.';
    judged({ id: `site.${field.id}`, kind: 'site', field: `site-${field.id}`, label: `Site: ${field.label}` }, rule, site[field.id]);
  }
  // SiteWrite's own control lines with a blank, each filled in where it shows on the draft.
  const answers = blankFacts.map(([, value]) => String(value));
  const seen = new Set();
  const line = (text, step) => {
    if (typeof text !== 'string' || !hasBlank(text) || fromAnswer(text, answers)) return;
    const key = blankKey(text);
    if (seen.has(key)) return;
    seen.add(key);
    judged({ id: `line.${seen.size}`, kind: 'line', key, parts: blankParts(text), step: step || '', label: step ? `Job step: ${step}` : 'Controls' }, { ask: 'This control has a blank (____). Fill it in with what applies on this job.', line: key }, []);
  };
  for (const step of (draft.jobSteps || []).filter((item) => !item.own)) for (const text of [...(step.hazards || []), ...(step.controls || [])]) line(text, step.step);
  // A step the user wrote with a blank or "To be completed" left in it: the user changes the step. So is
  // one with a line too short to act on ("Gloves") or that is no answer ("TBC"), as the page says when
  // it is saved (messy round 3).
  (draft.jobSteps || []).filter((step) => step.own).forEach((step, n) => {
    const open = [step.step, ...(step.hazards || []), ...(step.controls || []), step.responsible].find((text) => typeof text === 'string' && leftOpen(text));
    // Judged as typed, so the check quotes the line as the page does (the printed line takes a capital: messy round 15).
    const typed = step.typed || step;
    const short = [...(typed.hazards || []).map((text) => ownLineProblem(text, 'hazard')), ...(typed.controls || []).map((text) => ownLineProblem(text, 'control'))].find(Boolean);
    if (open) add({ id: `own.${n + 1}`, kind: 'own', field: `own-step-${n + 1}`, label: `Your step: ${step.step}`, need: `Your step has a blank (____) or "To be completed" left in: "${clean(open)}". Change your step to say what applies.` });
    else if (short) add({ id: `own.${n + 1}`, kind: 'own', field: `own-step-${n + 1}`, label: `Your step: ${step.step}`, need: `${short} Change your step to say what is done and how.` });
  });
  // A hazard the user added needs at least one control (D254): ticked from SiteWrite's offers or written.
  (draft.ownHazards || []).forEach((item, n) => {
    if (item.need) add({ id: `ownHazard.${n + 1}`, kind: 'own', field: `own-hazard-${n + 1}`, label: `Your hazard: ${clean(item.hazard)}`, need: `Add at least one control for your hazard "${clean(item.hazard)}": tick a line SiteWrite offers under it, or write your own.` });
  });
  for (const item of draft.controls || []) line(item && item.text);
  // Anything else left open in what prints, not already asked for above: the emergency rows print
  // the first aider, muster point and hospital as answered.
  const asked = new Set(gaps.map((gap) => gap.id));
  const given = FIELDS.concat(OPTIONAL).filter((item) => asked.has(item.id)).map((item) => clean(input[item.id])).filter(Boolean);
  // An emergency answer left open is asked for above, under its question.
  given.push(...Object.values(said).map(clean).filter((value) => value && leftOpen(value)));
  const other = [];
  for (const row of draft.emergency || []) {
    const text = [row.equipment, row.detail].filter(Boolean).join('. ');
    if (!leftOpen(text) || (/First aider: _{3,}/.test(text) && asked.has('firstAider')) || given.some((value) => text.includes(value))) continue;
    if (!fromAnswer(text, answers)) other.push(['Emergency arrangements', text]);
  }
  for (const row of draft.plant || []) for (const text of [row.item, row.inspection, row.licence]) if (leftOpen(text) && !fromAnswer(text, answers)) other.push(['Plant and equipment', text]);
  for (const text of draft.qualifications || []) if (leftOpen(text) && !fromAnswer(text, answers)) other.push(['Licences, tickets and training', text]);
  for (const row of draft.references || []) if (leftOpen(row.text) && !fromAnswer(row.text, answers)) other.push([row.label || 'Documents', row.text]);
  for (const key of ['date', 'subcontractor']) if (leftOpen(draft[key])) other.push([key === 'date' ? 'Date of the draft' : 'Subcontractor', draft[key]]);
  for (const [label, text] of other) {
    add({ id: `other.${gaps.length}`, kind: 'other', field: '', label, need: `A blank or "To be completed" is left in: "${clean(text)}". Answer the question it comes from, or change the line.` });
  }
  // "na", "n/a" or "TBC" left inside a line that prints, however it got there (messy round 13, A run 2: "rated
  // for na m" and "report na" printed). The user's own steps and boxes are judged above, each in its own words.
  const ownLines = new Set((draft.jobSteps || []).filter((step) => step.own).flatMap((step) => [...(step.hazards || []), ...(step.controls || [])]));
  // An answer already asked for under its own box ("TBC" as the ground controls) is not asked for twice.
  const askedValues = gaps.map((gap) => (gap.id.startsWith('emergency.') ? said[gap.id.slice(10)] : gap.id.startsWith('site.') ? site[gap.id.slice(5)] : input[gap.id])).map(clean).filter((value) => value.length >= 2);
  const held = new Set();
  for (const text of printedTexts(draft)) {
    if (ownLines.has(text) || held.has(text) || leftOpen(text) || askedValues.some((value) => text.includes(value))) continue;
    const token = heldIn(text);
    if (!token) continue;
    held.add(text);
    add({ id: `held.${held.size}`, kind: 'other', field: '', label: 'A placeholder left in a line', need: `"${token}" is not an answer, and it is left in: "${clean(text)}". Answer the question it comes from, or change the line.` });
  }
  return checks;
}

// What this SWMS still needs before it is downloaded or saved: a list of
// { id, kind, field, label, need, key?, parts?, step? }, the checks above that did not pass.
// Empty when it can be downloaded. A stood-down SWMS has its own list of what is missing.
function downloadGaps(input = {}, draft = {}, options = {}) {
  return gateChecks(input, draft, options).filter((check) => check.need).map(({ rule: _rule, ...gap }) => gap);
}

// The refusal for the download routes, naming every item still outstanding: the site questions and
// blanks, then the D184 tick in its own words.
function gateMessage(gaps) {
  const names = [...new Set(gaps.filter((gap) => gap.kind !== 'cover').map((gap) => gap.label))];
  const cover = gaps.find((gap) => gap.kind === 'cover');
  return [
    names.length ? `SiteWrite does not produce a SWMS until the site questions are answered, the plant is confirmed, the emergency response is given${gaps.some((gap) => gap.kind === 'design') ? ', the designs it relies on are named' : ''}${gaps.some((gap) => gap.kind === 'substance' || gap.kind === 'substanceType') ? ', each hazardous product is listed and checked against its safety data sheet' : ''} and no blank is left in it. Still to answer: ${names.join('; ')}.` : '',
    cover ? cover.message : '',
  ].filter(Boolean).join(' ');
}

module.exports = { downloadGaps, gateChecks, gateMessage, FIELDS, isPlaceholder, liveSupplyHazard, buriedServices };
