// Designs the SWMS relies on (owner, 11 October 2026: "yes, the reference number and attachment
// first"). Many job steps are done to an engineer's or temporary works design: staged excavation
// with anchors, props and shoring; underpinning; a demolition sequence; scaffolds and mast climbers;
// formwork; propping; precast bracing; crane bases. The library's lines say to work to the design,
// but not which design. Where a printed step relies on one, the page asks once, for each design:
// what it is, who prepared it, its document or drawing number and revision, its date, and the file
// if the user has it. A reviewer checks the SWMS matches the design.
//
// Each design prints in a short table near the top of the SWMS, and in each step that relies on it
// as one line: "Work to the shoring design ABC-S-101 rev C (Smith Engineering, 3 October 2026)."
// A design "Not issued yet" prints as a hold point in those steps instead. A design the user says is
// not needed for this work is recorded as their choice in the table; the step's lines stay as they are.
// A SWMS with no step that relies on a design, and no design the user added, prints as before.
//
// No AI reads the design itself in this build (a later option).
//
// A written method or sequence of works (owner, D224, 12 October 2026: "Need to be cautious with the
// add a design. You cannot read drawings, only words and good chance we could muck this up. If its a
// written methodology, or sequence of works. Yes, it should be an option."): any SWMS may list one the
// work follows, such as the lift company's method for raising a jump lift's machine platform. It is
// kept with the designs ("method-1" and so on, kind "method"), with the same details and file, and
// prints in the same table once what it is, who prepared it, its number and its date are given.
// Nothing from it goes into the steps on its own: a typed one can be read to suggest job steps, which go
// in only as the user accepts them (method-read.js, D230). The download never waits for it and the
// builder check does not count it. The user makes the steps match it.
const { withoutCitation, controlLevel } = require('./control-level');

// The designs a step can rely on. lines: what a printed control says when the step is done to the
// design, read without its citation. Only lines that require the design are listed: a line that
// applies only "where" something is so, or that lets something happen "unless" it is designed for it,
// does not make the step rely on a design. steps, where given: the job steps the line counts in.
const KINDS = [
  {
    id: 'shoring', label: 'Shoring design',
    steps: /^(Install the shoring wall|Install and later remove ground anchors|Stress the ground anchors|Install and later remove props|Spray the shotcrete|Drill with the drill rig|Dewater the excavation)$/,
    // Where a step relies on the shoring design, the trench is dug and worked in to it too, so its hold point is on those
    // steps (messy round 11, run 2: only "Dewater the excavation" printed it).
    joins: {
      steps: /^(Excavate|Dig the trench|Work in the trench)$/,
      lines: [
        /^Trenches 1\.5 m deep or more are shored with a trench shield rated for\b/,
        /^Shoring, trench shields and boxes are installed, moved and removed only by workers trained and competent in that system, to its manufacturer's or designer's instructions\b/,
        /^Trench shields and boxes are installed, used, removed and maintained to the manufacturer's instructions, never loaded beyond their design\b/,
        /^A trench 1\.5 m deep or more has all sides supported by shoring, benching or battering\b/,
      ],
    },
    lines: [
      /\bThe shoring is designed by an engineer and installed in the sequence on the drawings\b/,
      /\bGround anchors are designed by a competent person\b/,
      /\bto the engineer's procedure, with an exclusion zone around and behind the jack\b/,
      /\bHydraulic props are designed for the expected ground pressures\b/,
      /\bwherever the engineer's removal sequence shows them\b/,
      /\bThe excavated face is sprayed in the lifts the engineer sets\b/,
      /\bAnchors are installed, grouted and tested to the designer's method\b/,
      /^Support is designed for groundwater pressure\b/,
    ],
  },
  {
    id: 'underpinning', label: 'Underpinning design',
    steps: /underpinning/i,
    lines: [/\bUnderpinning is dug and supported only to a design\b/, /\bThe shoring is designed for the site conditions by a competent person\b/],
  },
  {
    id: 'demolition', label: 'Engineer\'s demolition plan',
    // The structure's own demolition sequence and the engineer's written instructions are this plan too (messy round 15, B run
    // 7: nothing asked for the engineer's sequence for a load-bearing brick annexe; the Demolition work code s 3.3).
    lines: [/\bin the sequence the engineer's demolition plan sets\b/, /\bin the sequence the structural engineer's demolition design or instructions set\b/, /\buntil the structural engineer has given the demolition design or clear written instructions\b/],
    holdSteps: /^(Demolish the structure|Demolish the bridge)$/,
  },
  {
    id: 'propping', label: 'Temporary works design (propping)',
    steps: /^(Install temporary support|Jack the house and replace stumps|Build in underneath the raised house|Lift and fix the new beam or lintel)$/,
    lines: [
      /\bagainst the temporary works design\b/,
      /\bthe temporary works designer's written approval\b/,
      /\bthe engineer's design is followed where the house is raised\b/,
      /\btemporary supports designed and checked for the job\b/,
      /\bthe person who designed the propping says it is safe\b/,
    ],
  },
  {
    id: 'beam', label: 'Structural design for the new beam',
    lines: [/\bThe beam or lintel, its bearings and its fixings are to the engineer's design\b/],
  },
  {
    id: 'towers', label: 'Temporary support tower design',
    lines: [/\bTowers are erected to the engineer's design\b/],
  },
  {
    id: 'scaffold', label: 'Scaffold design',
    steps: /^(Set up and protect the area below|Erect the scaffold)$/,
    lines: [
      /\bset out base plates and sole boards to the scaffold design\b/,
      /\berects the scaffold to the manufacturer's or designer's instructions\b/,
      /\bThe scaffold is erected to the manufacturer's or designer's instructions\b/,
    ],
  },
  {
    id: 'stairTower', label: 'Stair tower design',
    steps: /temporary stair/i,
    lines: [/\bbase plates and sole boards to the design\b/, /\bas its design shows, before anyone climbs above the first lift\b/],
  },
  {
    id: 'suspended', label: 'Swing stage or mast climber design',
    mast: 'Mast climber design',
    lines: [/\bNeedles are fixed to an engineer-certified detail\b/, /\bObtain engineer certification that the parapet\b/],
  },
  {
    id: 'bmu', label: 'Building maintenance unit design',
    lines: [/\bto the BMU designer's drawings and the engineer's certified fixings\b/],
  },
  {
    id: 'formwork', label: 'Formwork design',
    steps: /^(?!.*jumpform)/i,
    // The forming steps build to the design, so a design not issued yet holds them all, the deck too (messy round 15, A run 1:
    // "Lay the formwork deck" was neither held nor named). The pour and the loading only keep within it (D291).
    holdSteps: /^(?:Erect falsework and shores|Lay the formwork deck|Form penetrations and voids|Stand and brace wall and column forms|Form the (?:tank walls|retaining wall)|Inspect before the pour|Install backprops)$/,
    lines: [
      /\bErect falsework to the formwork design\b/,
      /\bas the formwork design sets out\b/,
      /\bwithin the load the formwork design allows\b/,
      /\bpacks are placed only where the formwork design allows\b/,
      /\bthe formwork designer confirms the formwork can take\b/,
      /\bchecks the formwork and falsework are built to the design\b/,
      /\bConcrete is placed no faster than the calculated pour rate\b/,
      /\bBackprops are installed to the structural engineer's design\b/,
      /\bDo not heap it on the deck beyond what the formwork design allows\b/,
      /\bWall forms are built and braced to their design\b/,
      /\bConcrete is placed at the rate the form design allows\b/,
    ],
    // Lines that only keep a load or the pour rate within the design. A step with only these uses the
    // design but does not build to it, so a design not issued yet holds the steps that build the
    // formwork, not the pour or the loading (messy-user test, 14 October 2026: the pour crew's SWMS
    // printed the formwork hold point on the pour itself).
    limits: [
      /\bwithin the load the formwork design allows\b/,
      /\bpacks are placed only where the formwork design allows\b/,
      /\bthe formwork designer confirms the formwork can take\b/,
      /\bConcrete is placed no faster than the calculated pour rate\b/,
      /\bDo not heap it on the deck beyond what the formwork design allows\b/,
      /\bConcrete is placed at the rate the form design allows\b/,
    ],
  },
  {
    id: 'jumpform', label: 'Jumpform design and climbing procedure',
    steps: /jumpform|core walls/i,
    lines: [/\bPour the walls at the rate in the formwork design\b/, /\bthe supplier or engineer confirms the concrete strength at the climbing anchors\b/],
  },
  {
    id: 'precast', label: 'Precast erection and bracing design',
    lines: [
      /\bas the erection design shows, before the crane hook is released\b/,
      /\bremoved only under the engineer's endorsed procedure\b/,
      /\blanded on its bearings to the erection design\b/,
      /\blanded on its bearings and fixed to the erection design\b/,
      /\bwith the rigging the precast designer specifies\b/,
    ],
  },
  {
    id: 'precastPanel', label: 'Precast panel drawings',
    lines: [/\bwhere the engineer-certified panel drawing shows them\b/],
  },
  {
    id: 'craneBase', label: 'Tower crane base design',
    lines: [/\bon a base or footing designed by an engineer\b/, /\bthe base is certified by an engineer before erection\b/, /\bthe same as those on the engineer's crane base drawing\b/],
  },
  {
    id: 'steelErection', label: 'Steel erection sequence and bracing design',
    lines: [/\bas the erection engineer's sequential erection procedure and marking plan show\b/],
    // The steel is erected in that sequence, so the erection step is held too, not only the bracing step (messy round 12,
    // A run 1: "Not issued yet" held "Install and remove temporary bracing" but not "Erect and connect steel at height").
    holdSteps: /^(Erect and connect steel at height|Install and remove temporary bracing|Land steel on temporary support towers)$/,
  },
  {
    id: 'timberErection', label: 'Erection sequence and bracing design',
    lines: [/\bMembers are erected to the engineer's sequence and braced as they go up\b/],
  },
  {
    id: 'platform', label: 'Piling working platform design',
    lines: [
      /\bdesigns the working platform from the rig's operating bearing pressures\b/,
      /\bThe rig works on a working platform designed for its (?:track )?loads\b/,
      /\bThe piling rig works on a working platform designed for it\b/,
    ],
  },
  {
    id: 'gantry', label: 'Gantry design',
    lines: [/^Gantries are engineer designed for an imposed load\b/, /\bSheds on a gantry go only where the engineer's design allows\b/],
  },
  // The hoarding line applies only to hoardings over 2.4 m high or carrying signs or shade cloth, so it
  // counts where the task says so (messy round 6: the builder check said no step relies on a design
  // beside "built to an engineer's design for wind load" for hoardings with shade cloth).
  {
    id: 'hoarding', label: 'Hoarding design',
    when: /\b(?:shade ?cloth|signboards?|signs?|banners?|mesh)\b[^.]{0,60}\bhoardings?\b|\bhoardings?\b[^.]{0,60}\b(?:shade ?cloth|signboards?|signs?|banners?|mesh)\b|\bhoardings?\b[^.]{0,30}?\b(?:2\.(?:[5-9]|4\d*[1-9])|[3-9](?:\.\d+)?)\s?m\b(?!\s+(?:wide|long|apart))/i,
    lines: [/^Hoardings over 2\.4 m high, or carrying signboards or shade cloth, are built to an engineer's design for wind load\b/],
  },
  {
    id: 'screens', label: 'Safety screen design',
    lines: [/\bto the supplier's design and instructions\b/, /\bthe concrete strength the screen design sets\b/],
  },
  {
    id: 'safetyNet', label: 'Safety net design',
    lines: [/^Safety nets are designed by an engineer or competent person for the purpose\b/],
  },
  {
    id: 'tempBridge', label: 'Temporary bridge design',
    lines: [/\bare built to an engineer's design for the haul trucks\b/],
  },
  {
    id: 'tempStructure', label: 'Engineered drawings for the temporary structure',
    lines: [/\bis erected to its engineer's or supplier's design for the crowd and wind loads\b/, /\bare built to the supplier's engineered drawings\b/, /\bStructures are erected to the supplier's engineered drawings\b/],
  },
  {
    id: 'move', label: 'Engineered move procedure',
    lines: [/^The move follows an engineered procedure\b/],
  },
  {
    id: 'jacking', label: 'Jacking procedure',
    lines: [/\bJacking is done to the bridge engineer's jacking procedure\b/],
  },
  {
    id: 'structural', label: 'Structural design for the supports',
    lines: [/\bfixed to the structure to the engineer's design for the wet weight\b/, /\bare installed to the engineer's design for the pendant's load\b/, /\bbuilt to an engineer's or the supplier's design for the full weight of the tank\b/],
  },
  {
    id: 'tunnel', label: 'Tunnel support design',
    lines: [/\bThe face and crown are supported as the design requires\b/],
  },
  {
    id: 'blast', label: 'Blast design',
    lines: [/\bagainst the design minimum\b/, /^The blast is designed, and explosives are handled, charged and fired, only by a shotfirer\b/],
  },
  // Designs asked for only at their question (D243, public/design-fill.js): no library line names
  // them, so they print only once given there.
  { id: 'loadDrawing', label: 'Structural engineer\'s drawing for the load limits', lines: [] },
  // holdSteps: the steps that do the work the design covers, which carry its hold point while it is not
  // issued even where no line in them names it (messy round 3: the geotechnical design was tied to no
  // step, and the core hole approval held "Plan core holes" but not the coring itself).
  // A retaining wall's cut, footing and backfill are dug and placed to it too (messy round 18, A run 3: the design was linked only to
  // "Run earthmoving plant", where its answer printed).
  { id: 'excavation', label: 'Geotechnical design for the excavation', lines: [], holdSteps: /^(Excavate|Dig the trench|Work in the trench|Work inside a deep excavation|Bulk excavate and load trucks|Excavate pile caps, lift pits and trenches|Excavate in front of the retention wall|Excavate and set out the retaining wall|Dig and pour footings|Backfill behind the retaining wall)$/ },
  {
    id: 'cutApproval', label: 'Engineer\'s approval for the cuts and core holes',
    lines: [/^Each core hole has the structural engineer's written approval\b/, /^Every opening has the structural engineer's written approval before cutting\b/],
    holdSteps: /^(Plan core holes|Core drill through the slab or wall|Saw cut concrete|Cut an opening in a load-bearing wall)$/,
  },
];
const KIND_BY_ID = new Map(KINDS.map((kind) => [kind.id, kind]));

// What the page says about why it asks, on the page only.
const WHY = 'A reviewer checks the SWMS matches the design the work is done to. Name each design here so the SWMS identifies it.';

const clean = (value) => String(typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim();
const HOLD = 'Hold point:';
// What a design blank in an answer reads while the design is not issued yet (public/design-fill.js NOT_ISSUED).
const NOT_ISSUED_FILL = 'not issued yet: the work does not start until it is issued and this SWMS is updated';
const isHoldPoint = (line) => clean(line).startsWith(HOLD);

// The designs the printed steps rely on, in the order the steps print: a list of { id, label, steps },
// with each step's line that relies on it. A step the user wrote is the user's own and is not read.
function designsNeeded(draft) {
  const found = new Map();
  const task = clean(draft && draft.task);
  for (const step of (draft && draft.jobSteps) || []) {
    // The user's own step that names a design ("Form up the capping beam to the formwork design") relies on it, and is held by it
    // where it builds the work (messy round 17, B run 7: the own formwork step named the design and was not linked to it).
    if (step.own) {
      const words = [step.step, ...(step.controls || []), ...(step.hazards || [])].map((line) => withoutCitation(String(line || ''))).join('\n');
      for (const kind of KINDS) {
        const label = clean(kind.label).toLowerCase();
        if (!label || !new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}s?\\b`, 'i').test(words)) continue;
        if (kind.when && !kind.when.test(task)) continue;
        if (!found.has(kind.id)) found.set(kind.id, { id: kind.id, label: kind.label, steps: [] });
        const line = (step.controls || []).find((item) => typeof item === 'string' && new RegExp(label.split(/\s+/)[0], 'i').test(item)) || '';
        found.get(kind.id).steps.push({ step: step.step, line, holds: /^(?:erect|stand|form|build|install|set|fix|place)\w*\b/i.test(clean(step.step)), own: true });
      }
      continue;
    }
    for (const kind of KINDS) {
      if (kind.steps && !kind.steps.test(step.step || '')) continue;
      if (kind.when && !kind.when.test(task)) continue;
      const at = (step.controls || []).findIndex((line) => typeof line === 'string' && !isHoldPoint(line) && kind.lines.some((pattern) => pattern.test(withoutCitation(line))));
      if (at < 0) continue;
      if (!found.has(kind.id)) found.set(kind.id, { id: kind.id, label: kind.mast && /\bmast[- ]climb\w*|\bmcwps?\b/i.test(task) ? kind.mast : kind.label, steps: [] });
      // holds: the step builds or installs to the design, so a design not issued yet holds it. A step
      // whose only lines keep a load or a rate within the design (kind.limits) is not held.
      const relies = (line) => typeof line === 'string' && !isHoldPoint(line) && kind.lines.some((pattern) => pattern.test(withoutCitation(line)));
      // A step that erects, stands, forms or builds the work is held even where its only line is a limit.
      const holds = /^(?:Erect|Stand|Form|Build)\b/.test(step.step || '') || (step.controls || []).some((line) => relies(line) && !(kind.limits || []).some((pattern) => pattern.test(withoutCitation(line))));
      found.get(kind.id).steps.push({ step: step.step, line: step.controls[at], holds });
    }
  }
  // Steps that join a design another step relies on, in the order the steps print.
  for (const kind of KINDS.filter((item) => item.joins && found.has(item.id))) {
    const entry = found.get(kind.id);
    const at = (step) => (step.controls || []).findIndex((line) => typeof line === 'string' && !isHoldPoint(line) && kind.joins.lines.some((pattern) => pattern.test(withoutCitation(line))));
    const joined = ((draft && draft.jobSteps) || []).filter((step) => !step.own && kind.joins.steps.test(step.step || '') && at(step) >= 0 && !entry.steps.some((item) => item.step === step.step));
    if (!joined.length) continue;
    const order = ((draft && draft.jobSteps) || []).map((step) => step.step);
    entry.steps = [...entry.steps, ...joined.map((step) => ({ step: step.step, line: step.controls[at(step)], holds: true }))].sort((a, b) => order.indexOf(a.step) - order.indexOf(b.step));
  }
  return [...found.values()];
}

// A date as the user gave it: "2026-10-03" from a date box reads "3 October 2026".
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function dateText(value) {
  const text = clean(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!iso || Number(iso[2]) < 1 || Number(iso[2]) > 12) return text;
  return `${Number(iso[3])} ${MONTHS[Number(iso[2]) - 1]} ${iso[1]}`;
}
// "Rev C", "revision C" or "C" all print as "rev C".
const revisionText = (value) => clean(value).replace(/^(?:rev(?:ision)?\.?\s*)/i, '');
// "Shoring design" reads "the shoring design" inside a sentence; "BMU design" keeps its capitals.
const inSentence = (what) => (/^[A-Z][a-z]/.test(what) ? `${what[0].toLowerCase()}${what.slice(1)}` : what);

// The design as one reference: "ABC-S-101 rev C (Smith Engineering, 3 October 2026)".
function referenceText(row) {
  const number = clean(row.number);
  const revision = revisionText(row.revision);
  const by = clean(row.by);
  const date = dateText(row.date);
  const after = [by, date].filter(Boolean).join(', ');
  return `${[number, revision ? `rev ${revision}` : ''].filter(Boolean).join(' ')}${after ? ` (${after})` : ''}`;
}
const workLine = (row) => `Work to the ${inSentence(clean(row.what))} ${referenceText(row)}.`;
const holdLine = (row) => `${HOLD} the ${inSentence(clean(row.what))} is not issued yet. Do not start this step until the design is issued and this SWMS is updated.`;

// The user's answers for the designs, by id: { id, what, by, number, revision, date, status, file }.
// status is 'given', 'notIssued' or 'notNeeded'; '' while unanswered.
const answersOf = (input) => new Map((Array.isArray(input && input.designs) ? input.designs : []).filter((row) => row && row.id).map((row) => [row.id, row]));
const ADDED = /^added-\d+$/;
const METHOD = /^method-\d+$/;

// What a design still needs before download: '' once it is answered (download-gate.js, and the page
// through gate-rules.js designNeed).
function designNeed(row) {
  const { designNeed: need } = require('./public/gate-rules');
  return need(row);
}

// The rows of the "Designs this SWMS relies on" table: each design needed, then each the user added,
// with the user's answers and the steps that rely on it, then each written method with its details
// given (kind "method"). A method not yet given in full does not print.
function designRows(draft, input) {
  const answers = answersOf(input);
  // The number and revision the answer to the design's own question already gives fill its card, so it is
  // not asked twice (messy round 8, run 1: the erection sequence given in the answer, then asked again).
  const { QUESTION_DESIGNS: ASKED_AT } = require('./public/design-fill');
  const givenFacts = (input && input.facts) || {};
  const fromQuestion = (id) => {
    const question = Object.keys(ASKED_AT).find((key) => ASKED_AT[key].id === id);
    const text = question && typeof givenFacts[question] === 'string' ? givenFacts[question] : '';
    // A drawing number in capitals, with each part of it ("ABC-S-101 (revision C)").
    const found = /\b((?:[A-Z]{1,6}[- ]?){1,3}\d{1,5}[A-Z]?(?:[-/]\d{1,4})?)\s*,?\s*\(?\s*[Rr]ev(?:ision)?\.?\s*([A-Za-z0-9]{1,3})\b/.exec(text);
    return found ? { number: found[1], revision: found[2] } : null;
  };
  const needed = designsNeeded(draft).map((item) => {
    const answer = answers.get(item.id) || {};
    // Only a card not yet answered: a card the user is filling in keeps what they typed.
    const prefill = !answer.status && !clean(answer.number) && fromQuestion(item.id);
    return { ...answerFields(prefill ? { ...answer, ...prefill } : answer), ...(prefill ? { fromAnswer: true } : {}), id: item.id, what: clean(answer.what) || item.label, label: item.label, steps: item.steps.map((entry) => entry.step), held: item.steps.filter((entry) => entry.holds).map((entry) => entry.step), needed: true };
  });
  // A design given at the question that asks for it (D243), where no step relies on it: it prints
  // once given in full, or as not issued yet.
  const { QUESTION_DESIGNS } = require('./public/design-fill');
  const listed = new Set(needed.map((row) => row.id));
  const asked = Object.values(QUESTION_DESIGNS).filter((item) => !listed.has(item.id) && answers.has(item.id)).map((item) => {
    const answer = answers.get(item.id);
    return { ...answerFields(answer), id: item.id, what: clean(answer.what) || item.label, label: item.label, steps: [], needed: false };
  }).filter((row) => row.status === 'notIssued' || (row.status === 'given' && designNeed(row) === ''));
  // A design named by its number and revision in the answer to the question that asks for it, but not given
  // on its card, is listed with that number and revision, and asked for in full so it prints in the table
  // (messy round 7: "temporary support design SK-201 rev B" printed only as a control).
  const facts = (input && input.facts) || {};
  // So is one named by its number alone after "design" or "drawing", as the design revision is optional (D222), and one whose card holds
  // only the number the answer filled (messy round 19, A run 1: the temporary support design TW-04 and the load limit drawing S-201
  // printed only under Documents to keep).
  const named = Object.entries(QUESTION_DESIGNS).filter(([question, item]) => !listed.has(item.id) && (!answers.has(item.id) || !answerFields(answers.get(item.id)).status) && typeof facts[question] === 'string').map(([question, item]) => {
    const found = /\b([A-Z]{1,6}[- ]?\d{1,5}[A-Z]?(?:[-/]\d{1,4})?)\s*,?\s*\(?\s*rev(?:ision)?\.?\s*([A-Z0-9]{1,3})\b/i.exec(facts[question])
      || /\b(?:design|drawing|document)\s+(?:no\.?\s*|number\s*)?([A-Z]{1,6}[- ]?\d{1,5}[A-Z]?(?:[-/]\d{1,4})?)\b()/.exec(facts[question]);
    const card = answers.has(item.id) ? answerFields(answers.get(item.id)) : null;
    return found ? { id: item.id, what: item.label, label: item.label, status: '', by: card ? card.by : '', number: (card && card.number) || found[1], revision: (card && card.revision) || found[2] || '', date: card ? card.date : '', file: null, steps: [], needed: true, fromAnswer: true } : null;
  }).filter(Boolean);
  const added = [...answers.values()].filter((row) => ADDED.test(row.id) && clean(row.what)).map((row) => ({ ...answerFields(row), id: row.id, what: clean(row.what), label: '', steps: [], needed: false }));
  const { methodNeed } = require('./public/gate-rules');
  const methods = [...answers.values()].filter((row) => METHOD.test(row.id) && methodNeed(row) === '')
    .map((row) => ({ ...answerFields({ ...row, status: 'given' }), id: row.id, what: clean(row.what), label: '', steps: [], needed: false, kind: 'method' }));
  return [...needed, ...asked, ...named, ...added, ...methods];
}
function answerFields(row) {
  const status = ['given', 'notIssued', 'notNeeded'].includes(row.status) ? row.status : '';
  const file = row.file && typeof row.file === 'object' && row.file.id ? { id: row.file.id, name: clean(row.file.name), type: clean(row.file.type), size: Number(row.file.size) || 0 } : null;
  const read = row.read && Array.isArray(row.read.fields) && row.read.fields.length ? { read: { fields: [...row.read.fields], checked: row.read.checked === true } } : {};
  return { status, by: clean(row.by), number: clean(row.number), revision: clean(row.revision), date: clean(row.date), file: status === 'given' ? file : null, ...read };
}

// The draft with its designs: the table rows, and the reference or hold point in each step that
// relies on a design. The line goes straight after the line that relies on the design, where the
// controls stay in hierarchy order; otherwise at the start of the lines of its own level. A hold
// point goes first in the step, where the crew reads it before anything else.
function withDesigns(draft, input) {
  if (!draft || draft.kind !== 'draft' || !Array.isArray(draft.jobSteps)) return draft;
  const rows = designRows(draft, input);
  if (!rows.length) return draft;
  const ready = new Map(rows.filter((row) => row.needed && designNeed(row) === '' && row.status !== 'notNeeded').map((row) => [row.id, row]));
  const needed = designsNeeded(draft);
  const RANK = { Eliminate: 0, Substitute: 1, 'Isolate or engineer': 2, Administrative: 3, PPE: 4 };
  const rank = (line) => RANK[controlLevel(line)] ?? 3;
  const jobSteps = draft.jobSteps.map((step) => {
    const uses = needed.filter((item) => ready.has(item.id) && item.steps.some((entry) => entry.step === step.step));
    if (!uses.length) return step;
    let controls = [...step.controls];
    const holds = [];
    for (const item of uses) {
      const row = ready.get(item.id);
      const entry = item.steps.find((other) => other.step === step.step);
      if (row.status === 'notIssued') { if (entry.holds) holds.push(holdLine(row)); continue; }
      const line = workLine(row);
      const anchor = controls.indexOf(entry.line);
      const level = rank(line);
      const fits = anchor >= 0 && rank(controls[anchor]) <= level && (anchor + 1 >= controls.length || level <= rank(controls[anchor + 1]));
      const at = fits ? anchor + 1 : Math.max(0, controls.findIndex((other) => rank(other) >= level));
      controls = [...controls.slice(0, at < 0 ? controls.length : at), line, ...controls.slice(at < 0 ? controls.length : at)];
    }
    // The lines added here, so the page shows them as coming from the designs, not as controls to change.
    return { ...step, controls: [...holds, ...controls], designLines: [...holds, ...controls.filter((line) => !step.controls.includes(line))] };
  });
  // A design tied to the steps that do its work (holdSteps): those steps are listed against it, and
  // carry its hold point while it is not issued.
  for (const row of rows) {
    const kind = KIND_BY_ID.get(row.id);
    if (!kind || !kind.holdSteps || row.status === 'notNeeded') continue;
    const doing = jobSteps.filter((step) => !step.own && kind.holdSteps.test(step.step || ''));
    if (!doing.length) continue;
    const order = jobSteps.map((step) => step.step);
    row.steps = [...new Set([...row.steps, ...doing.map((step) => step.step)])].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    row.held = [...new Set([...(row.held || []), ...doing.map((step) => step.step)])].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (row.status !== 'notIssued' || designNeed(row) !== '') continue;
    const hold = holdLine(row);
    for (const step of doing) {
      const at = jobSteps.indexOf(step);
      if (step.controls.includes(hold)) continue;
      jobSteps[at] = { ...step, controls: [hold, ...step.controls], designLines: [hold, ...(step.designLines || [])] };
    }
  }
  // A design given at its question (D243) with no step relying on it is used where that answer prints
  // (messy round 8, run 4: "Hold point" named no step, while the load line cited the drawing).
  const { QUESTION_DESIGNS } = require('./public/design-fill');
  const facts = (input && input.facts) || {};
  for (const row of rows) {
    if (row.steps.length || row.kind === 'method') continue;
    const question = Object.keys(QUESTION_DESIGNS).find((key) => QUESTION_DESIGNS[key].id === row.id);
    const said = question && typeof facts[question] === 'string' ? clean(facts[question]).replace(/\.$/, '') : '';
    if (!said) continue;
    const using = jobSteps.filter((step) => !step.own && (step.controls || []).some((line) => typeof line === 'string' && clean(line).includes(said.slice(0, 60))));
    if (using.length) row.steps = using.map((step) => step.step);
  }
  // One message for a design not issued yet, wherever it is said (messy round 15, A run 1: the pour SWMS's designs table said
  // "Update this SWMS when it is issued" while its Controls table said the work does not start until it is issued, and the
  // propping design's answer said the same). A design that holds steps here says those steps do not start until it is issued;
  // one that holds none (the pour crew's formwork design, D291) says to update the SWMS when it is issued. The answer to the
  // design's question is said the same way.
  const sayOnce = (line, row, answer) => {
    if (typeof line !== 'string') return line;
    const label = clean(row.label || row.what);
    const name = `${label.charAt(0).toLowerCase()}${label.slice(1)}`;
    const holding = (row.held || []).length > 0;
    let out = line.split(`Hold point: the ${name} is not issued yet, so the work it covers does not start until it is issued and this SWMS is updated.`)
      .join(holding ? `Hold point: the ${name} is not issued yet, so the steps that rely on it do not start until it is issued and this SWMS is updated.` : `The ${name} is not issued yet. Update this SWMS when it is issued.`);
    if (answer && clean(out).includes(answer.slice(0, 40))) out = out.split(NOT_ISSUED_FILL).join(holding ? 'not issued yet: the steps that rely on it do not start until it is issued and this SWMS is updated' : 'not issued yet: update this SWMS when it is issued');
    return out;
  };
  for (const row of rows.filter((item) => item.status === 'notIssued' && item.kind !== 'method')) {
    const question = Object.keys(QUESTION_DESIGNS).find((key) => QUESTION_DESIGNS[key].id === row.id);
    const answer = question && typeof facts[question] === 'string' ? clean(facts[question]).replace(NOT_ISSUED_FILL, '').replace(/[.()\s]+$/, '') : '';
    for (let n = 0; n < jobSteps.length; n += 1) jobSteps[n] = { ...jobSteps[n], controls: (jobSteps[n].controls || []).map((line) => sayOnce(line, row, answer)) };
    if (Array.isArray(draft.controls)) draft = { ...draft, controls: draft.controls.map((item) => (item && typeof item.text === 'string' ? { ...item, text: sayOnce(item.text, row, answer) } : item)) };
    if (Array.isArray(draft.references)) draft = { ...draft, references: draft.references.map((item) => (item && typeof item.text === 'string' ? { ...item, text: sayOnce(item.text, row, answer) } : item)) };
  }
  return {
    ...draft,
    jobSteps,
    designs: rows.map((row) => ({ ...row, reference: row.status === 'given' && (row.kind === 'method' || designNeed(row) === '') ? referenceText(row) : '', statusText: statusText(row) })),
  };
}

// What the table says of a design's status.
function statusText(row) {
  if (row.kind === 'method') return `The work follows this methodology.${row.file ? ` A copy is attached to this SWMS in SiteWrite (${row.file.name || 'file'}).` : ''}`;
  // A design whose steps only keep loads within it (the pour crew's formwork design) holds no step.
  if (row.status === 'notIssued' && !(Array.isArray(row.held) && row.held.length)) return 'Not issued yet. Update this SWMS when it is issued.';
  if (row.status === 'notIssued') return 'Not issued yet. Hold point: the steps that rely on it do not start until it is issued and this SWMS is updated.';
  if (row.status === 'notNeeded') return 'Not needed for this work (the business\'s choice when preparing this SWMS).';
  if (row.status === 'given' && designNeed(row) === '') return row.file ? `Issued. A copy is attached to this SWMS in SiteWrite (${row.file.name || 'file'}).` : 'Issued.';
  return 'Not given yet.';
}

// The printed table: what it is, who prepared it, its number and revision, its date, and its status
// with a note where a file is attached. Rows as text, for the Word file, the PDF and the page.
const TABLE_HEAD = ['Design', 'Prepared by', 'Document or drawing, revision', 'Date', 'Status'];
function tableRows(draft) {
  return (draft.designs || []).map((row) => [
    row.what,
    row.status === 'given' ? row.by : '',
    row.status === 'given' ? [row.number, revisionText(row.revision) ? `rev ${revisionText(row.revision)}` : ''].filter(Boolean).join(' ') : '',
    row.status === 'given' ? dateText(row.date) : '',
    // A design not issued that holds no step says so where it names the steps, as the page does (messy round 17, A run 2 and B run 7:
    // the page said no step is held while the table said "Used in: Pump and place concrete").
    `${row.statusText}${row.steps.length ? (row.status === 'notIssued' && Array.isArray(row.held) && !row.held.length ? ` Worked to in: ${row.steps.join('; ')}. No step is held.` : ` Used in: ${row.steps.join('; ')}.`) : ''}`,
  ]);
}
const TABLE_TITLE = 'Designs this SWMS relies on';
const TABLE_NOTE = 'Each step that relies on a design names it. Work to the revision listed here. If a new revision is issued, check this SWMS against it and update it before work continues.';
// With a written method in the table, its title, first column and note say so. A table of designs
// only prints as before.
const METHOD_TITLE = 'Written methodologies this SWMS relies on';
const BOTH_TITLE = 'Designs and methodologies this SWMS relies on';
const METHOD_NOTE = 'The work follows each methodology listed here. Work to the revision listed here. If a new revision is issued, check this SWMS against it and update it before work continues.';
const BOTH_NOTE = 'Each step that relies on a design names it. The work follows each methodology listed here. Work to the revision listed here. If a new revision is issued, check this SWMS against it and update it before work continues.';
function tableKinds(draft) {
  const rows = (draft && draft.designs) || [];
  const methods = rows.filter((row) => row.kind === 'method').length;
  return { methods, designs: rows.length - methods };
}
function tableTitle(draft) {
  const { methods, designs } = tableKinds(draft);
  return !methods ? TABLE_TITLE : designs ? BOTH_TITLE : METHOD_TITLE;
}
function tableHead(draft) {
  const { methods, designs } = tableKinds(draft);
  return !methods ? TABLE_HEAD : [designs ? 'Design or methodology' : 'Methodology', ...TABLE_HEAD.slice(1)];
}
function tableNote(draft) {
  const { methods, designs } = tableKinds(draft);
  return !methods ? TABLE_NOTE : designs ? BOTH_NOTE : METHOD_NOTE;
}

// The file ids a SWMS input refers to (its designs' and written methods' attached files).
function fileIds(input) {
  return [...new Set((Array.isArray(input && input.designs) ? input.designs : []).filter((row) => row && (row.status === 'given' || METHOD.test(row.id || '')) && row.file && typeof row.file.id === 'string').map((row) => row.file.id))];
}

module.exports = { KINDS, KIND_BY_ID, WHY, designsNeeded, designRows, withDesigns, designNeed, referenceText, workLine, holdLine, dateText, isHoldPoint, tableRows, statusText, fileIds, tableTitle, tableHead, tableNote, TABLE_HEAD, TABLE_TITLE, TABLE_NOTE, HOLD };
