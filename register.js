// The registers a SWMS template carries alongside the job steps: plant and
// equipment, hazardous substances, licences and qualifications, emergency
// arrangements, the legislation and codes the controls rely on, and a suggested
// risk rating for each step. Each is worked out from the task and the finished
// job steps, and left for the supervisor to check and complete for the site.

// Plant and equipment. A licence is shown only where Schedule 3 of the WHS
// Regulation makes the work high risk work; otherwise the operator must be
// competent. Electrical equipment for construction work is inspected and tested
// to AS/NZS 3012 (Electrical Safety Regulation 2026 (Qld) s 140).
const TEST_TAG = 'Inspected, tested and tagged to AS/NZS 3012. Checked for damage before use.';
const PRESTART = 'Pre-start check each shift. Serviced to the manufacturer\'s instructions.';
const PLANT = [
  { item: 'Boom-type elevating work platform', pattern: /\b(boom (?:lifts?|ewps?|type)|boom-type|knuckle booms?|cherry pickers?)\b/i, inspection: `${PRESTART} Yearly inspection by a competent person.`, licence: 'Yes, where the boom can reach 11 m or more (WP)' },
  { item: 'Scissor lift', pattern: /\bscissor lifts?\b/i, inspection: `${PRESTART} Yearly inspection by a competent person.`, licence: 'No. Operator trained in the model used' },
  { item: 'Elevating work platform', pattern: /\b(elevating work platforms?|ewps?)\b/i, skipIf: /\b(scissor|boom)\b/i, inspection: `${PRESTART} Yearly inspection by a competent person.`, licence: 'Yes, for a boom-type platform that can reach 11 m or more (WP)' },
  { item: 'Tower crane', pattern: /\btower cranes?\b/i, inspection: 'Operated and maintained by the crane company under its log book and inspection regime.', licence: 'Yes (CT), with licensed doggers or riggers' },
  { item: 'Mobile crane or crane truck', pattern: /\b(mobile cranes?|crane trucks?|franna|slewing cranes?|the crane|a crane|cranes?)\b/i, skipIf: /\btower crane\b/i, inspection: 'Crane company\'s log book, pre-start check and yearly inspection.', licence: 'Yes (crane class to suit), with licensed doggers or riggers' },
  { item: 'Forklift', pattern: /\bforklifts?\b/i, inspection: PRESTART, licence: 'Yes (LF)' },
  { item: 'Telehandler', pattern: /\btelehandlers?\b/i, inspection: PRESTART, licence: 'Operator competent in the model used. A licence is needed when it is used as a crane or forklift that Schedule 3 covers' },
  { item: 'Personnel or materials hoist', pattern: /\b(hoists?|materials lifts?)\b/i, skipIf: /\bchain hoists?\b/i, inspection: 'Inspected after each climb and as the manufacturer sets out.', licence: 'Yes (HP or HM)' },
  { item: 'Concrete placing boom', pattern: /\b(placing booms?|boom pumps?|pump trucks?|truck-mounted pumps?)\b/i, inspection: 'Registered item of plant. Pre-start check, and pipeline checked for wear before each pour.', licence: 'Yes (PB)' },
  { item: 'Concrete line pump', pattern: /\b(line pumps?|concrete pumps?)\b/i, inspection: 'Pre-start check, and pipeline and clamps checked for wear before each pour.', licence: 'No. Operator competent' },
  { item: 'Scaffold', pattern: /\bscaffold(?:s|ing)?\b/i, inspection: 'Inspected before first use, after alterations or repairs, after an event that could affect it, and at least every 30 days.', licence: 'Yes, for erecting or altering where a fall of more than 4 m is possible (SB, SI or SA)' },
  { item: 'Mobile scaffold', pattern: /\bmobile scaffolds?\b/i, inspection: 'Checked before use: castors locked, guardrails complete.', licence: 'No, under 4 m. Yes (SB) where a person or object could fall more than 4 m' },
  { item: 'Excavator', pattern: /\b(excavators?|excavat\w* by machine|mini excavators?)\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Skid steer or posi-track', pattern: /\b(skid ?steers?|bobcats?|posi-?tracks?)\b/i, inspection: PRESTART, licence: 'No. Operator competent (verification of competency)' },
  { item: 'Roller or plate compactor', pattern: /\b(rollers?|plate compactors?|compactors?|wacker)\b/i, skipIf: /\bpaint rollers?\b/i, inspection: PRESTART, licence: 'No. Operator competent' },
  { item: 'Piling rig', pattern: /\b(piling rigs?|cfa rigs?|bored pil\w*)\b/i, inspection: 'Daily pre-start check and the rig\'s log book.', licence: 'No. Operator competent' },
  { item: 'Concrete truck', pattern: /\bconcrete trucks?\b/i, inspection: 'The supplier\'s pre-start check.', licence: 'Truck driver\'s licence' },
  { item: 'Power trowel', pattern: /\bpower trowels?\b/i, inspection: `${PRESTART} Guards and stop switch checked.`, licence: 'No' },
  { item: 'Concrete saw', pattern: /\b(concrete saws?|saw cut\w*|saw-cut\w*|floor saws?|wall saws?)\b/i, inspection: `${PRESTART} Blade guard in place. Electric saws: ${TEST_TAG}`, licence: 'No' },
  { item: 'Core drill', pattern: /\bcore[- ]?drill\w*\b/i, inspection: TEST_TAG, licence: 'No' },
  { item: 'Generator', pattern: /\bgenerators?\b/i, inspection: `${PRESTART} Electrical output protected by an RCD.`, licence: 'No' },
  { item: 'Chainsaw', pattern: /\bchainsaws?\b/i, inspection: `${PRESTART} Chain brake working.`, licence: 'No. Operator competent' },
  { item: 'Oxy-acetylene or gas torch set', pattern: /\b(oxy|acetylene|gas torch\w*|torch-on|torching|brazing|lpg)\b/i, inspection: 'Hoses, regulators and flashback arrestors checked before use.', licence: 'No' },
  { item: 'Welder', pattern: /\bweld\w*\b/i, skipIf: /\bvinyl seams?\b/i, inspection: TEST_TAG, licence: 'No' },
  { item: 'Nail gun', pattern: /\bnail guns?\b/i, inspection: 'Checked before use. Single shot trigger.', licence: 'No' },
  { item: 'Ladders', pattern: /\bladders?\b/i, inspection: 'Industrial rated, at least 120 kg. Checked before each use.', licence: 'No' },
  { item: 'Electric power tools and leads', pattern: /\b(power tools?|grinders?|drills?|drop saws?|circular saws?|leads?)\b/i, inspection: TEST_TAG, licence: 'No' },
];

// Hazardous substances that commonly come with the work. The product names and
// quantities are the user's to fill in.
const SUBSTANCES = [
  ['Paints and coatings', /\b(paints?|painting|coatings?|enamels?)\b/i],
  ['Solvents and thinners', /\b(solvents?|thinners?|turps)\b/i],
  ['Adhesives', /\b(adhesives?|glues?)\b/i],
  ['Sealants, mastics and silicone', /\b(sealants?|mastics?|silicone)\b/i],
  ['Waterproofing membranes and primers', /\b(membranes?|waterproof\w*)\b/i],
  ['Epoxy and two-part products', /\b(epoxy|two-part|two part|2-pack)\b/i],
  ['Cement, concrete, grout and mortar', /\b(cement|concrete|grout|mortar|render)\b/i],
  ['Curing compounds and form release agents', /\b(curing compounds?|form oil|release agents?)\b/i],
  ['PVC primer and solvent cement', /\b(solvent cement|pvc primer)\b/i],
  ['Fuels (diesel, petrol)', /\b(diesel|petrol|fuel|generators?)\b/i],
  ['Gases (LPG, acetylene, oxygen)', /\b(lpg|acetylene|oxy\w*|gas cylinders?|brazing|torch\w*)\b/i],
  ['Refrigerants', /\brefrigerants?\b/i],
  ['Cleaning chemicals', /\b(cleaning chemicals?|detergents?|acid wash\w*|cleaning products?)\b/i],
  ['Herbicides and termiticides', /\b(herbicides?|termiticides?|termite treatment|weed ?killers?|treat\w* the ground)\b/i],
  ['Bitumen and asphalt', /\b(bitumen|asphalt|hot mix)\b/i],
];

// Licences, tickets and training the work needs.
const QUALIFICATIONS = [
  ['General construction induction (white card)', /./],
  ['Site specific induction', /./],
  ['Electrical licence (electrician)', /\b(electrical work|electrician|cabling|switchboards?|fit[- ]off|terminations?|wiring)\b/i],
  ['Plumbing and drainage licence', /\b(plumb\w*|drainage|sanitary|sewer|hot water)\b/i],
  ['Refrigerant handling licence (ARC)', /\brefrigerant\b/i],
  ['Asbestos removal licence (Class A or B), or training for non-licensed removal', /\basbestos\b/i],
  ['Confined space entry training', /\bconfined spaces?\b/i],
  ['Crystalline silica training (VET accredited or regulator approved)', /\b(silica|crystalline)\b/i],
  ['Working at heights and harness training', /\b(harness|travel restraint|fall arrest)\b/i],
  ['Traffic controller accreditation', /\btraffic controllers?\b/i],
  ['Pest management licence and QBCC termite licence', /\b(termit\w*)\b/i],
  ['Hot work permit trained', /\bhot work\b/i],
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
const CATASTROPHIC = /\b(falls?|falling|collapse\w*|buried|engulf\w*|electric shock|electrocut\w*|energised|struck by|strikes? a person|crush\w*|overturn\w*|rolls? over|drown\w*|asphyxi\w*|explosion|explod\w*|oxygen|toxic|tips? or falls|load falls|swings? into)\b/i;
const MAJOR = /\b(silica|asbestos|amputat\w*|burns?|fire|hearing|isocyanates?|cancer|fumes?|vapour|hose whip|burst|kickback|impalement|chemical)\b/i;
const MODERATE = /\b(cuts?|strain\w*|back|manual|vibration|noise|dust|knee|eyes?|skin|heat|sun|flying)\b/i;
// Controls that change the hazard itself, rather than relying on people.
const ENGINEERING = /\b(edge protection|guardrails?|guards?|barricad\w*|exclusion zones?|shor\w*|bench\w*|batter\w*|extraction|wet (?:cutting|methods?)|water suppression|isolat\w*|de-?energis\w*|locked out|covers?|scaffolds?|working platforms?|elevating work platforms?|scissor lifts?|mechanical aids?|trolleys?|lifting aids?|ventilat\w*|rcds?|interlock\w*|gantr\w*)\b/i;

function consequenceOf(hazards) {
  const text = hazards.join(' ');
  if (CATASTROPHIC.test(text)) return 5;
  if (MAJOR.test(text)) return 4;
  if (MODERATE.test(text)) return 3;
  return 2;
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

function plantFor(text) {
  const found = [];
  for (const entry of PLANT) {
    if (!entry.pattern.test(text)) continue;
    if (entry.skipIf && entry.skipIf.test(text.match(entry.pattern)[0])) continue;
    if (entry.item === 'Elevating work platform' && found.some((item) => /elevating work platform|Scissor lift/.test(item.item))) continue;
    found.push({ item: entry.item, inspection: entry.inspection, licence: entry.licence });
  }
  return found;
}

function substancesFor(text, safetyDataSheet) {
  const found = SUBSTANCES.filter(([, pattern]) => pattern.test(text)).map(([product]) => ({ product, sds: '', quantity: '' }));
  return { items: found, note: safetyDataSheet || '' };
}

function qualificationsFor(text, plant) {
  const needed = QUALIFICATIONS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  for (const item of plant) {
    if (/^Yes/.test(item.licence)) needed.push(`High risk work licence: ${item.item.toLowerCase()} (${item.licence.replace(/^Yes,?\s*/, '')})`);
  }
  if (/\b(dogg\w*|slung|sling\w*|rigg\w*)\b/i.test(text)) needed.push('High risk work licence: dogging or rigging (DG, RB, RI or RA)');
  return [...new Set(needed)];
}

function emergencyFor(text, input, highRisk) {
  const rows = [];
  rows.push({ type: 'Emergency', equipment: 'Call 000. Site emergency procedure and muster point', detail: input.musterPoint || '' });
  rows.push({ type: 'Fire', equipment: /\b(hot work|weld\w*|torch\w*|brazing|grinding|oxy|lpg|electric\w*)\b/i.test(text) ? 'Fire extinguisher suited to the hazard (dry powder or CO2 near electrical equipment)' : 'Fire extinguisher', detail: '' });
  rows.push({ type: 'Injury', equipment: `First aid kit${input.firstAider ? `. First aider: ${input.firstAider}` : '. First aider: ____'}`, detail: input.hospital ? `Nearest hospital: ${input.hospital}` : '' });
  if (highRisk.some((item) => /falling more than/i.test(item)) || /\b(harness|elevating work platforms?|ewps?|boom lifts?)\b/i.test(text)) {
    rows.push({ type: 'Work at height', equipment: 'Rescue plan for a person stuck or suspended at height (EWP ground controls, rescue equipment)', detail: '' });
  }
  if (highRisk.some((item) => /trench|shaft/i.test(item))) rows.push({ type: 'Trench', equipment: 'Rescue plan for a trench collapse. No one enters an unsupported trench to rescue', detail: '' });
  if (highRisk.some((item) => /confined space/i.test(item))) rows.push({ type: 'Confined space', equipment: 'Rescue plan and equipment, started from outside the space', detail: '' });
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
      const title = part.replace(/\s+(?:s|ss|schedule|appendix|part|chapter|table|section)\s.*$/i, '').trim();
      if (/\b(Act|Regulation|Regulations|Code|Rules|standard|Council)\b/i.test(title)) sources.add(title);
    }
  }
  const all = [...sources].sort();
  return {
    legislation: all.filter((title) => !/\b(Code|standard|Council)\b/i.test(title)),
    codes: all.filter((title) => /\b(Code|standard|Council)\b/i.test(title)),
  };
}

function registersFor(draft, input = {}) {
  const steps = draft.jobSteps || [];
  const stepText = steps.flatMap((step) => [step.step, ...step.hazards, ...step.controls]).join('\n');
  const text = `${draft.task || ''}\n${stepText}`;
  const plant = plantFor(text);
  return {
    plant,
    substances: substancesFor(text, (input.facts || {}).safetyDataSheet),
    qualifications: qualificationsFor(text, plant),
    emergency: emergencyFor(text, input, draft.highRisk || []),
    sources: legislationFor([...steps.flatMap((step) => step.controls), ...(draft.controls || []).map((item) => item.text)]),
    // Before starting is checks and briefings, not a work step, so it is not rated.
    jobSteps: steps.map((step) => ({ ...step, risk: step.step === 'Before starting' ? null : riskFor(step) })),
  };
}

module.exports = { registersFor, MATRIX, LIKELIHOOD, CONSEQUENCE, riskFor, legislationFor };
