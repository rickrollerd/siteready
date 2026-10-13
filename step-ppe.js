// PPE for all work and PPE for particular steps (owner, D246 and D247, 13 October 2026).
//
// "Some of the PPE is task specific and needs to be written that way in the SWMS": grinding needs a
// face shield over safety glasses, while placing and fixing reo needs only safety glasses. The PPE
// list is split in two. "For all work" is the site minimum and what every step of the SWMS needs.
// "For particular steps" is each extra item with the steps that need it, read from each printed
// step's own hazards and controls. Each such step gets one plain line saying what to wear, unless a
// line of its own already says it. Nothing is added that the PPE rules (each activity's PPE in
// activities.js and the ticks draft.js makes from the steps) do not already tick, except a face
// shield where a step grinds or cuts with a disc, as the library's own plant code lines do
// (Managing the risks of plant in the workplace s 2.3). The user can untick an item, move it to all
// work or add one to a step; those changes are kept (ppeSteps) and learned from (control-learning.js).
const { localControl } = require('./citations');
const { CITE, PPE, ACTIVITIES } = require('./activities');

// Items worn for all work: the site minimum, clothing, hi-vis and sun protection.
const ALL_WORK_ONLY = new Set(['hardHat', 'chinStrap', 'sunHat', 'glassesClear', 'glassesTinted', 'gloveGeneral', 'sleevesLong', 'sleevesShort', 'pantsLong', 'shorts', 'hivis', 'hivisNight', 'boots', 'sunscreen']);
// Steps every SWMS has, which are not the work itself.
const GENERAL_STEPS = new Set(['Before starting', 'Finish and clean up']);

// Grinding, or cutting, chasing or scabbling with a disc or saw. A sentence that says the tool is not
// used ("never cut with an angle grinder", "snips, not a grinder") does not count.
const ABRASIVE = /\bgrind(?:s|ing|er|ers)?\b|\bangle grinders?\b|\bcut-?off (?:saws?|wheels?|discs?)\b|\babrasive (?:discs?|wheels?|saws?|cut\w*|blades?)\b|\bdemo(?:lition)? saws?\b|\b(?:concrete|brick|masonry|tile|block|quick-?cut|road|floor|wall|ring) saws?\b|\bsaw ?cut\w*\b|\bchas(?:e|es|ing|er|ers)\b|\bscabbl\w*\b/i;
const NOT_USED = /\b(?:never|not|no|rather than|instead of|avoid\w*)\b/i;
const ABRASIVE_SOURCE = CITE.QCODE('Managing the risks of plant in the workplace', 's 2.3');

// The words that show a step needs an item. Broad on purpose: an item a step may need stays with it.
const NOISE = String.raw`\bnoise\b|\bnoisy\b|\bhearing\b|\bear (?:muffs|plugs)\b|\bdB\b|\bjack ?hammers?\b|\bbreakers?\b|\bnail guns?\b|\bpowder[- ]actuated\b|\bchainsaws?\b|\bcompressors?\b|\brock drill\w*|\bpiling\b|\bvibrat\w*`;
const CHEMICAL = String.raw`\bchemical\w*|\bwet concrete\b|\bconcrete\b|\bcement\w*|\bmortar\b|\bgrout\w*|\brender\w*|\bepoxy\b|\bresins?\b|\bsolvents?\b|\badhesives?\b|\bglues?\b|\bprimers?\b|\bsealants?\b|\bsilicone\b|\bcuring\b|\bdegreas\w*|\bbitumen\b|\bpaints?\b|\bcoatings?\b|\bmembranes?\b|\bacids?\b|\bfuel\b|\bdiesel\b|\bpetrol\b|\boils?\b|\bsafety data sheets?\b|\bSDS\b|\bherbicides?\b|\bpesticides?\b|\bsewage\b|\bslurry\b|\bpools?\b|\bchlorine\b|\bpour\w*|\bfillers?\b|\bplaster\b|\bcompounds?\b|\bgloves resistant\b|\brefrigerant\w*`;
// A torch here is a flame (a cutting, gas or blow torch, or torch-on membrane), not a light; oxy means a gas flame.
const HOT = String.raw`\bweld\w*|\bbraz\w*|\boxy[- ]?(?:acetylene|propane|fuel|cutting|lpg)\b|\b(?:cutting|gas|blow|lpg|propane) ?torch\w*|\btorch[- ]on\b|\bplasma\b|\bsolder\w*|\bhot work\b|\bthermal (?:cutting|lances?)\b|\bfilter eye\b`;
const ELECTRIC = String.raw`\benergi[sz]ed\b|\blive\b|\barc\w*|\btest\w*|\belectric\w*|\bterminals?\b|\bisolat\w*|\bvoltage\b|\bswitchboards?\b|\bbatter(?:y|ies)\b|\bcables?\b|\bDC\b`;
const DUST = String.raw`\bsilica\b|\bdust\w*|\brespirators?\b|\bP2\b|\basbestos\b|\bfibres?\b|\bmould\w*|\blead (?:paint|dust|fume)|\bfumes?\b|\bsanding\b|\bsanders?\b|\bvapours?\b|\bisocyanate\w*|\bspray\w*|\bsewage\b|\bsewer gas\b|\bcontaminat\w*`;
const re = (...parts) => new RegExp(parts.join('|'), 'i');
const NEEDS = {
  // Grinding and cutting with a disc are read sentence by sentence (abrasiveWork), as are hearing
  // protection's.
  faceShield: re(String.raw`\bface shields?\b|\bnozzles?\b|\bwater ?blast\w*|\bhot bitumen\b|\bchainsaws?\b|\bstump grind\w*|\bsplash\w*`),
  goggles: re(String.raw`\bgoggles\b|\bsplash\w*|\bspray\w*|\bcorrosive\w*|\bliquid nitrogen\b|\bcryogenic\b`, CHEMICAL),
  filterEye: re(HOT),
  earPlugs: re(NOISE),
  earMuffs: re(NOISE),
  p2: re(DUST),
  halfFace: re(DUST),
  gloveCut: re(String.raw`\bcut resistant\b|\bcuts?\b|\bsharp\w*|\bglass\w*|\bsheets?\b|\bsheeting\b|\bblades?\b|\bburrs?\b|\bsplinters?\b|\bbars?\b|\breo\b|\bstrand\b|\bwire\w*|\bmetal\b|\bsteel\b|\bduct\w*|\bknives?\b|\bknife\b|\bswarf\b|\bmesh\b|\btiles?\b|\bstone\b|\bpipes?\b|\btimber\b|\bchainsaws?\b`),
  gloveChemical: re(CHEMICAL),
  gloveWelding: re(HOT, String.raw`\bheat resistant\b|\bhot bitumen\b|\bmolten\b`),
  gloveCold: re(String.raw`\brefrigerant\w*|\bcold\b|\bliquid nitrogen\b|\bcryogenic\b|\bfrost\w*`),
  gloveInsulated: re(ELECTRIC),
  arcRated: re(ELECTRIC),
  coveralls: re(String.raw`\bcoveralls?\b|\binsulation\b|\bglass ?wool\b|\bceramic fibre\b|\blead\b|\bblast\w*`, DUST),
  chaps: re(String.raw`\bchainsaws?\b|\bchaps\b`),
  kneePads: re(String.raw`\bknee\w*|\bkneel\w*`),
  gumboots: re(String.raw`\bgumboots\b|\bwet concrete\b|\bconcrete\b|\bpour\w*|\bslurry\b|\bwater\b|\bmud\w*|\bwash\w*|\bscreed\w*|\bwet\b|\bflood\w*|\bsewage\b|\bpools?\b|\bpumps?\b|\bdrain\w*|\bponds?\b|\bbasins?\b|\btrench\w*`),
  // Not "anchor" (a fixing anchor), "rescue" (a low voltage rescue kit) or "tower" (a cooling tower).
  harness: re(String.raw`\bharness\w*|\bfall arrest\b|\btravel restraint\b|\brestraint (?:lines?|systems?)\b|\banchorage points?\b|\btie[- ]off\b|\blanyards?\b|\bboom(?:-type)? (?:lifts?|elevating)\b|\bswing stages?\b|\bEWPs?\b|\belevating work platforms?\b|\brope access\b|\bstatic lines?\b`),
  lifeJacket: re(String.raw`\bwater\w*|\bdrown\w*|\blife jackets?\b|\bPFDs?\b|\bbarges?\b|\bboats?\b|\brivers?\b|\bcreeks?\b|\bwaterways?\b|\bpontoons?\b|\bwharf\b|\bjett(?:y|ies)\b|\bbasins?\b|\bponds?\b|\bpools?\b|\btanks?\b|\bdams?\b`),
};

// A line of the step that already says the item is worn: the step line does not say it again.
const SAYS = {
  faceShield: /\bface shields?\b/i,
  goggles: /\bgoggles\b/i,
  filterEye: /\bfilter\w* (?:eye|lens|shade)|\bwelding (?:helmets?|masks?|shields?)\b/i,
  earPlugs: /\bhearing protection\b|\bear ?(?:muffs|plugs)\b/i,
  earMuffs: /\bhearing protection\b|\bear ?(?:muffs|plugs)\b/i,
  p2: /\bP2\b|\brespirators?\b|\bRPE\b/i,
  halfFace: /\bhalf[- ]face\b|\brespirators? with (?:\w+ )?filters\b/i,
  gloveCut: /\bcut[- ]resistant gloves\b/i,
  gloveChemical: /\bchemical(?:[- ]resistant)? gloves\b|\bgloves resistant to the product\b|\bgloves and eye protection their safety data sheets list\b|\bnitrile gloves\b/i,
  gloveWelding: /\b(?:welding|heat[- ]resistant) gloves\b/i,
  gloveCold: /\b(?:cold|cryogenic)[- ]?(?:resistant )?gloves\b/i,
  gloveInsulated: /\binsulated (?:electrical )?gloves\b/i,
  arcRated: /\barc[- ]rated\b/i,
  coveralls: /\bcoveralls?\b/i,
  chaps: /\bchaps\b|\bchainsaw trousers\b/i,
  kneePads: /\bknee pads?\b/i,
  gumboots: /\bgumboots\b/i,
  harness: /\bharness\w*\b/i,
  lifeJacket: /\blife ?jackets?\b|\bPFDs?\b|\bpersonal flotation\b/i,
};

// The lines whose citations the step line carries for an item: the step's own sourced lines that
// name that kind of protection, cited as they are.
const GLOVES_FOR = (kind) => new RegExp(String.raw`\bgloves\b[^.]*\b(?:${kind})|\b(?:${kind})\b[^.]*\bgloves\b`, 'i');
const CITES = {
  faceShield: /\bface shields?\b|\beye protection\b/i,
  goggles: /\bgoggles\b|\beye protection\b/i,
  filterEye: /\bfilter\w* (?:eye|lens|shade)|\bwelding (?:helmets?|masks?|shields?)\b|\beye protection\b/i,
  earPlugs: /\bhearing protect\w*|\bear (?:muffs|plugs)\b/i,
  earMuffs: /\bhearing protect\w*|\bear (?:muffs|plugs)\b/i,
  p2: /\brespirat\w*|\bP2\b|\bRPE\b/i,
  halfFace: /\brespirat\w*|\bRPE\b/i,
  gloveCut: /\bcut[- ]resistant gloves\b/i,
  gloveChemical: GLOVES_FOR('chemical\\w*|safety data sheets?|SDS|product|solvents?|cement|concrete'),
  gloveWelding: GLOVES_FOR('weld\\w*|heat|leather'),
  harness: /\bharness\w*|\bfall arrest\b|\btravel restraint\b/i,
  lifeJacket: /\blife ?jackets?\b|\bPFDs?\b|\bpersonal flotation\b/i,
  kneePads: /\bknee pads?\b/i,
  gumboots: /\bgumboots\b/i,
  coveralls: /\bcoveralls?\b/i,
};

// How each item reads in the step line.
const WORN = {
  faceShield: 'a face shield', goggles: 'goggles', filterEye: 'filter eye protection', earPlugs: 'ear plugs', earMuffs: 'ear muffs',
  p2: 'a P2 respirator', halfFace: 'a half-face respirator with filters', gloveCut: 'cut resistant gloves', gloveChemical: 'chemical resistant gloves',
  gloveInsulated: 'insulated electrical gloves', gloveWelding: 'welding or heat resistant gloves', gloveCold: 'cold resistant gloves',
  coveralls: 'disposable coveralls', chaps: 'chainsaw chaps or trousers', arcRated: 'an arc-rated face shield and flame-resistant clothing',
  kneePads: 'knee pads', gumboots: 'safety gumboots', harness: 'a full body harness', lifeJacket: 'a life jacket',
};
const ORDER = PPE.flatMap((group) => group.items.map(([id]) => id));
const LABELS = new Map(PPE.flatMap((group) => group.items));

// A printed line's trailing citation, where it has one, and the line without it.
function splitCitation(line) {
  const text = String(line || '');
  if (!text.endsWith(')')) return { text, cited: '' };
  let depth = 0;
  for (let i = text.length - 1; i >= 0; i -= 1) {
    if (text[i] === ')') depth += 1;
    else if (text[i] === '(' && --depth === 0) {
      const cited = text.slice(i + 1, -1);
      return /\b(?:Regulations?|Code|Act|Standard|AS\/NZS|Compliance code)\b/.test(cited) ? { text: text.slice(0, i).trimEnd(), cited } : { text, cited: '' };
    }
  }
  return { text, cited: '' };
}
const lineText = (line) => splitCitation(typeof line === 'string' ? line : (line && line.text) || '').text;
const sentencesOf = (line) => lineText(line).split(/(?<=[.;!?])\s+/).filter(Boolean);
const stepLines = (step) => [step.step, ...(step.hazards || []), ...(step.controls || [])];
const isWorkStep = (step) => !GENERAL_STEPS.has(step.step);

// The kinds of abrasive work a step does, as words for its line: grinding, cutting, chasing, scabbling.
function abrasiveWork(step) {
  const words = new Set();
  for (const sentence of stepLines(step).flatMap(sentencesOf)) {
    if (!ABRASIVE.test(sentence) || NOT_USED.test(sentence)) continue;
    if (/\bgrind/i.test(sentence)) words.add('grinding');
    if (/\bsaws?\b|\bsaw ?cut|\bcut-?off\b|\babrasive\b/i.test(sentence)) words.add('cutting');
    if (/\bchas(?:e|es|ing|er|ers)\b/i.test(sentence)) words.add('chasing');
    if (/\bscabbl/i.test(sentence)) words.add('scabbling');
  }
  return ['grinding', 'cutting', 'chasing', 'scabbling'].filter((word) => words.has(word));
}

const needs = (id, step) => Boolean(NEEDS[id]) && (stepLines(step).some((line) => NEEDS[id].test(lineText(line)))
  || (['faceShield', 'earPlugs', 'earMuffs'].includes(id) && abrasiveWork(step).length > 0));
const says = (id, step) => Boolean(SAYS[id]) && stepLines(step).slice(1).some((line) => SAYS[id].test(lineText(line)));

// The PPE each library step's own kind of work ticks (each activity's ppe in activities.js), by the
// step's name. A step the draft renames, or one the user wrote, is read from its words alone.
const LIBRARY = new Map();
for (const activity of ACTIVITIES) {
  for (const step of activity.steps || []) {
    if (!LIBRARY.has(step.step)) LIBRARY.set(step.step, new Set());
    for (const id of activity.ppe || []) LIBRARY.get(step.step).add(id);
  }
}

// The steps of the work that need an item: where the item comes from a kind of work's own PPE, the
// steps of that work (those whose words call for it, where any do); otherwise the steps whose words
// call for it. A step whose own line already says the item is worn needs it too.
function stepsNeeding(id, work) {
  const own = work.filter((step) => LIBRARY.has(step.step) && LIBRARY.get(step.step).has(id));
  const worded = (own.length ? own : work).filter((step) => needs(id, step));
  const found = own.length && !worded.length ? own : worded;
  return work.filter((step) => found.includes(step) || says(id, step)).map((step) => step.step);
}
const ids = (ppe) => (ppe || []).flatMap((group) => group.items.filter((item) => item.ticked).map((item) => item.id));
const joinAnd = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);

// The PPE list split into all work and particular steps. ppe: the PPE groups with each item ticked or
// not; steps: the printed job steps; options: suggest (no list chosen by the user: a face shield is
// added where a step grinds or cuts with a disc, and general purpose gloves stay for all work when
// every other glove is for particular steps) and placed (the user's own placements: an item id to
// 'all', or to the names of the steps it is for). Returns the groups, each ticked item for particular
// steps carrying steps: [names].
function splitPpe(ppe, steps, { suggest = false, placed = null } = {}) {
  const work = (steps || []).filter(isWorkStep);
  const names = new Set((steps || []).map((step) => step.step));
  const ticked = new Set(ids(ppe));
  const forSteps = new Map();
  for (const id of ticked) {
    if (ALL_WORK_ONLY.has(id) || !NEEDS[id]) continue;
    const need = stepsNeeding(id, work);
    // An item no step names stays for all work, and so does one every step of the work needs, except
    // a face shield, which is worn only while grinding or cutting.
    if (need.length && (need.length < work.length || id === 'faceShield')) forSteps.set(id, need);
  }
  if (suggest) {
    const cutting = work.filter((step) => abrasiveWork(step).length).map((step) => step.step);
    if (cutting.length) {
      if (!ticked.has('faceShield') || forSteps.has('faceShield')) forSteps.set('faceShield', [...new Set([...(forSteps.get('faceShield') || []), ...cutting])]);
      ticked.add('faceShield');
    }
  }
  // The user's own placements stand: all work, or the steps they chose that still print.
  for (const [id, where] of Object.entries(placed && typeof placed === 'object' ? placed : {})) {
    if (!LABELS.has(id)) continue;
    if (where === 'all') { forSteps.delete(id); continue; }
    const kept = (Array.isArray(where) ? where : []).filter((name) => names.has(name));
    if (!kept.length) continue;
    forSteps.set(id, [...new Set(kept)]);
    ticked.add(id);
  }
  for (const id of forSteps.keys()) if (!ticked.has(id)) forSteps.delete(id);
  // Hands are always covered for all work: where every glove ticked is for particular steps, general
  // purpose gloves are worn for the rest.
  const gloves = ['gloveGeneral', 'gloveCut', 'gloveChemical', 'gloveInsulated', 'gloveWelding', 'gloveCold'];
  if (suggest && gloves.some((id) => ticked.has(id)) && !gloves.some((id) => ticked.has(id) && !forSteps.has(id))) ticked.add('gloveGeneral');
  return (ppe || []).map((group) => ({
    ...group,
    items: group.items.map(({ steps: _, ...item }) => ({ ...item, ticked: ticked.has(item.id), ...(ticked.has(item.id) && forSteps.has(item.id) ? { steps: [...names].filter((name) => forSteps.get(item.id).includes(name)) } : {}) })),
  }));
}

// The step line saying what to wear: the step's own items, less any a line of the step already says,
// cited as the step's own lines that call for them are. A face shield is worn over safety glasses,
// while grinding or cutting where the step does more than that. Returns null when nothing is left to say.
function stepPpeLine(step, items, { glasses = true, stateId = 'qld' } = {}) {
  const said = stepLines(step).slice(1).map(lineText);
  const say = items.filter((id) => WORN[id] && !(SAYS[id] && said.some((line) => SAYS[id].test(line)))).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
    // Ear plugs and ear muffs both ticked for a step are one choice: "ear muffs or ear plugs".
    .filter((id, index, list) => !(id === 'earPlugs' && list.includes('earMuffs')));
  if (!say.length) return null;
  const worn = (id) => (id === 'earMuffs' && items.includes('earPlugs') ? 'ear muffs or ear plugs' : WORN[id]);
  const shield = glasses ? 'a face shield over safety glasses' : 'a face shield';
  const work = say.includes('faceShield') ? abrasiveWork(step) : [];
  const others = say.filter((id) => id !== 'faceShield').map(worn);
  let text;
  // A step that is itself the grinding or cutting needs no "while".
  if (work.length && !ABRASIVE.test(String(step.step))) {
    const qualified = `${shield} while ${joinAnd(work).replace(/ and /, ' or ')}`;
    text = others.length ? `Wear ${joinAnd(others)}. Wear ${qualified}.` : `Wear ${qualified}.`;
  } else {
    text = `Wear ${joinAnd(say.map((id) => (id === 'faceShield' ? shield : worn(id))))}.`;
  }
  // The citations of the step's own lines that call for each item, and the plant code for a face
  // shield worn while grinding or cutting, as the library's own lines cite it.
  const parts = [];
  const add = (cited) => { for (const part of String(cited || '').split('; ').filter(Boolean)) if (!parts.includes(part)) parts.push(part); };
  for (const id of say) {
    for (const line of (step.controls || [])) {
      const { text: words, cited } = splitCitation(typeof line === 'string' ? line : (line && line.text) || '');
      if (cited && CITES[id] && CITES[id].test(words)) add(cited);
    }
    if (id === 'faceShield' && work.length) add(splitCitation(localControl('x', ABRASIVE_SOURCE, stateId) || '').cited);
  }
  // A long list of citations is cut to the first four, each still one the step's own lines carry.
  return parts.length ? `${text} (${parts.slice(0, 4).join('; ')})` : text;
}

// The draft's steps with each step's PPE line added at the end of its controls, where it has items for
// particular steps a line of its own does not already say.
function withStepPpeLines(jobSteps, ppe, stateId) {
  const items = (ppe || []).flatMap((group) => group.items.filter((item) => item.ticked && Array.isArray(item.steps)));
  if (!items.length) return jobSteps;
  const glasses = ids(ppe).some((id) => ['glassesClear', 'glassesTinted'].includes(id));
  return jobSteps.map((step) => {
    const mine = items.filter((item) => item.steps.includes(step.step)).map((item) => item.id);
    const line = mine.length ? stepPpeLine(step, mine, { glasses, stateId }) : null;
    // The line is marked (ppeLines), as design lines are, so the page sends the user to the PPE section to change it.
    return line ? { ...step, controls: [...step.controls, line], ppeLines: [line] } : step;
  });
}

// Each item where it is worn: 'all', the step names, or none.
function placements(ppe) {
  const out = new Map();
  for (const group of ppe || []) for (const item of group.items) if (item.ticked) out.set(item.id, Array.isArray(item.steps) ? item.steps : 'all');
  return out;
}

// What the user changed from SiteReady's suggestion, for the learning store (D212): items unticked,
// moved to all work, or added to a step or to all work. Only the user's own changes count: the items
// they ticked or unticked (input.ppe) and the items they placed (input.ppeSteps), not where SiteReady
// put an item. Each change has its kind, its step ('' for all work) and the item's label.
function ppeChanges(suggested, final, input = {}) {
  const was = placements(suggested);
  const now = placements(final);
  const placed = input && input.ppeSteps && typeof input.ppeSteps === 'object' ? input.ppeSteps : {};
  const chosen = input && Array.isArray(input.ppe) && input.ppe.length ? new Set(input.ppe) : null;
  const out = [];
  const push = (kind, step, id) => out.push({ kind, step, item: LABELS.get(id) || id });
  const stepsOf = (where) => (Array.isArray(where) ? where : []);
  for (const id of ORDER) {
    const before = was.get(id);
    const after = now.get(id);
    if (chosen && before && !chosen.has(id)) {
      // Unticked.
      if (before === 'all') push('ppeAllRemoved', '', id);
      else for (const step of before) push('ppeStepRemoved', step, id);
      continue;
    }
    if (chosen && !before && chosen.has(id) && after) {
      // Ticked, for all work or for the steps the user put it in.
      if (after === 'all') push('ppeAllAdded', '', id);
      else for (const step of after) push('ppeStepAdded', step, id);
      continue;
    }
    if (!(id in placed) || !before || !after) continue;
    if (placed[id] === 'all') {
      if (Array.isArray(before)) for (const step of before) push('ppeToAllWork', step, id);
      continue;
    }
    for (const step of stepsOf(after).filter((name) => !stepsOf(before).includes(name))) push('ppeStepAdded', step, id);
    for (const step of stepsOf(before).filter((name) => Array.isArray(after) && !after.includes(name))) push('ppeStepRemoved', step, id);
  }
  return out;
}

// The items for particular steps, as "Face shield: Saw cut concrete; Cut the reo", for the PPE tables.
function stepPpeRows(ppe) {
  return (ppe || []).flatMap((group) => group.items.filter((item) => item.ticked && Array.isArray(item.steps) && item.steps.length).map((item) => ({ id: item.id, label: item.label, steps: item.steps })));
}

module.exports = { splitPpe, withStepPpeLines, stepPpeLine, ppeChanges, stepPpeRows, abrasiveWork, ALL_WORK_ONLY, GENERAL_STEPS };
