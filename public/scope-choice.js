// What the user chooses from a scope reading, carried straight through to the SWMS to prepare
// (owner testing, 13 October 2026). The work packages are chosen once: each ticked package becomes
// one SWMS in the project, with its scope review answers, who runs the crane, and the trade and
// task from the pick lists that match it. Used by the browser (scope.js) and the tests.
(function (root) {
  const scopeTask = typeof module === 'object' && module.exports ? require('./scope-task') : root.SiteWriteScopeTask;

  // The work packages with site work, each with only its site work, and the duties (supervision,
  // records, tickets) in a list of their own: a duty never sits in a package's activities.
  function packagesOf(reading) {
    const groups = new Map();
    for (const row of (reading && reading.activities) || []) {
      const name = row.package || 'Other work';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(row);
    }
    const all = [...groups].map(([name, rows]) => ({ name, rows: rows.filter((row) => row.type !== 'Duty'), duties: rows.filter((row) => row.type === 'Duty') }));
    return {
      work: all.filter((pack) => pack.rows.length).map(({ name, rows }) => ({ name, rows })),
      duties: all.flatMap((pack) => pack.duties.map((row) => ({ ...row, package: pack.name }))),
    };
  }

  // Cranage (owner testing, 13 October 2026, item 9): offered as a SWMS where our company runs the
  // crane, or where the scope says this subcontractor supplies the cranage.
  const isCranage = (name) => /\bcran(?:e|es|age)\b/i.test(String(name || ''));
  const CRANAGE_SUPPLY = /\b(?:sub-?contractors?|we|our company)\b[^.;]{0,80}?\b(?:allow\w*|suppl\w*|provid\w*|includ\w*|responsible for)\b[^.;]{0,80}?\b(?:cranage|craneage|crane hire|cranes)\b/i;
  // The same said other ways (stage 4 decision 4, D307): "a mobile crane supplied by the Subcontractor",
  // "the Subcontractor's own crane", and "the Subcontractor is to supply a 20 t crane" (one crane the
  // subcontractor brings, not slinging for a crane someone else runs).
  const CRANAGE_BY_US = [
    /\b(?:cranage|craneage|crane hire|cranes?)\b[^.;]{0,60}?\b(?:supplied|provided|hired|arranged|engaged|organised|organized|allowed for|included)\s+by\s+(?:the\s+)?(?:sub-?contractors?|us|our company)\b/i,
    /\b(?:(?:the\s+)?sub-?contractor['’]s|our)\s+(?:own\s+)?(?:[\w-]+\s+){0,2}?(?:cranes?|cranage|crane hire)\b/i,
    /\b(?:sub-?contractors?|we|our company)\b[^.;]{0,80}?\b(?:suppl\w*|provid\w*|hir\w*|bring\w*)\s+(?:a|an|the|its own|their own|our own)\s+(?:[\w-]+\s+){0,3}?cranes?\b/i,
  ];
  const suppliesCranage = (part) => CRANAGE_SUPPLY.test(part) || CRANAGE_BY_US.some((pattern) => pattern.test(part));
  const BY_OTHERS = /\b(?:by others|by the (?:head |principal |main )?contractor|by the builder|excluded|exclusions?|not included|not part of)\b/i;

  // The first clause in which the scope gives this subcontractor the cranage, from the quotes of its site work.
  function craneClause(reading) {
    for (const row of ((reading && reading.activities) || []).filter((item) => item.type !== 'Duty')) {
      for (const quote of row.quotes || []) {
        const sentence = String(quote).split(/(?<=[.;])\s+/).find((part) => suppliesCranage(part) && !BY_OTHERS.test(part));
        if (sentence) return { clause: String(row.clause || '').trim(), quote: sentence.trim() };
      }
    }
    return null;
  }

  // Who runs the crane, read from the scope only where it clearly says cranes are used by others for
  // this subcontract (messy round 3: "A crane company" was ticked for scopes that mention a crane in
  // passing, or never mention one). 'company' then, else '' (unanswered: the user answers it).
  // "The contractor's cranes may be used" is not clear: a crane that may be used, if required or
  // subject to something, leaves it unanswered.
  const CRANE_WORD = /\b(?:cranage|craneage|cranes?|crane hire|mobile cranes?|tower cranes?)\b/i;
  const BY_OTHERS_CRANE = /\b(?:by others|by the (?:builder|head contractor|principal contractor|main contractor|client)|(?:provided|supplied|operated|arranged|organised|organized) by (?:the )?(?:builder|head contractor|principal contractor|main contractor|others|client)|(?:the )?(?:builder|head contractor|principal contractor|main contractor) (?:will )?(?:provides?|supplies|supply|operates?|arranges?)\b)/i;
  const HEDGED = /\b(?:may|might|could|if required|where required|as required|if needed|subject to|if available|where available|by arrangement|tbc|to be confirmed)\b/i;
  function craneFromReading(reading) {
    for (const row of ((reading && reading.activities) || []).filter((item) => item.type !== 'Duty')) {
      const words = [...(row.quotes || []), row.conditions || '', row.plant || ''].map(String);
      for (const text of words) {
        const sentence = text.split(/(?<=[.;])\s+/).find((part) => CRANE_WORD.test(part) && BY_OTHERS_CRANE.test(part) && !HEDGED.test(part) && !suppliesCranage(part));
        if (sentence) return 'company';
      }
    }
    return '';
  }

  // Whether a package's own words point to a fall of more than 2 m ('yes'), to none ('no'), or say
  // nothing either way (''), so a fall answer given in one SWMS is not filled into another its own
  // task contradicts (messy round 3: "Yes" was filled into the ground floor SWMS).
  const GROUND_ONLY = /\b(?:ground (?:floor|level)|at grade|on grade|slab on ground|ground slabs?|footpaths?|kerbs?|car ?parks?|landscap\w*|in-ground|below ground)\b/i;
  function fallHint(flag, task) {
    if (((flag && flag.categories) || []).some((item) => item.id === 'fall')) return 'yes';
    if (GROUND_ONLY.test(String(task || '')) && !/\b(?:roofs?|ceilings?|levels? [2-9]|upper|suspended|scaffold\w*|ewps?|ladders?|heights?|voids?|risers?|shafts?|facade|fa\u00e7ade|external walls?)\b/i.test(String(task || ''))) return 'no';
    return '';
  }

  // How the cranage package is offered for the crane answer: own, company or none.
  function cranageOffer(crane, clause) {
    if (crane === 'own') return { full: true, ticked: true, note: '' };
    // "You answered" only after a real answer: the crane question starts unanswered.
    const answered = crane === 'none' ? ' You answered that no crane is used.' : crane === 'company' ? ' You answered that a crane company operates the crane.' : '';
    if (clause) {
      return {
        full: true,
        ticked: true,
        note: `The scope says you supply the cranage${clause.clause ? ` (${clause.clause})` : ''}: "${clause.quote}"${answered} Untick this if the crane company's lift plan and SWMS cover the lifts.`,
      };
    }
    if (!crane) return { full: false, ticked: false, note: 'Answer the crane question above. Tick the box if you need a cranage SWMS.' };
    return {
      full: false,
      ticked: false,
      note: crane === 'none'
        ? 'You answered that no crane is used, so there is no cranage SWMS. Tick the box if you need one after all.'
        : 'You answered that a crane company operates the crane. The crane company normally provides the lift plan and its own SWMS for the lifts, so there is no cranage SWMS. Tick the box if you still need one.',
    };
  }
  const CRANAGE_TICK = 'Yes, we need a cranage SWMS';

  // The pick list trade, and the task where one clearly fits, for a package (owner testing, item 11).
  // The package name decides the trade; the task comes from the package's own words. Where a task
  // list is marked one, a task is picked only when exactly one fits.
  const TRADE_RULES = [
    { test: /\bjump ?forms?\b|\bself[- ]climbing form/i, trade: 'formwork', tasks: [[/./, 'jumpform']] },
    { test: /\b(?:perimeter|slab edge|safety) screens?\b/i, trade: 'formwork', tasks: [[/./, 'perimeter-screens']] },
    { test: /\bedge protection\b|\bhandrails?\b|\bguardrails?\b|\bpenetration covers?\b/i, trade: 'scaffolding', tasks: [[/./, 'edge-protection-stairs-nets']] },
    { test: /\bform ?work\b|\bfalsework\b|\bforming\b/i, trade: 'formwork', tasks: [[/\b(?:suspended|slabs?|decks?|beams?)\b/i, 'slab-formwork'], [/\b(?:columns?|walls?|stairs?)\b/i, 'columns-walls-stairs'], [/\b(?:footings?|ground slabs?|slabs? on ground|edges?)\b/i, 'ground-forms']] },
    { test: /\breinforc\w*|\breo\b|\bsteel fix\w*/i, trade: 'steel-fixing-pt', tasks: [[/\b(?:suspended|decks?)\b/i, 'reo-decks'], [/\b(?:footings?|pile caps?|ground slabs?|slabs? on ground)\b/i, 'reo-ground'], [/\b(?:walls?|columns?|cores?|cages?)\b/i, 'reo-vertical']] },
    { test: /\bconcret\w*|\bplace and finish\b|\bpours?\b/i, trade: 'concreting', tasks: [[/\bsuspended\b/i, 'suspended-placing'], [/\b(?:slabs? on ground|ground slabs?|footings?|paths?)\b/i, 'ground-placing']] },
    { test: /\bcran(?:e|es|age)\b|\blifting\b/i, trade: 'cranes-rigging', tasks: [] },
    { test: /\bpenetrations?\b|\bcore[- ]?drill\w*|\bcoring\b/i, trade: 'concrete-cutting', tasks: [[/\bcore[- ]?drill\w*|\bcoring\b/i, 'scanning-coring']] },
    { test: /\baccess equipment\b|\bewps?\b|\bladders?\b/i, trade: 'shared-access-and-handling', unique: true, tasks: [[/\b(?:ewps?|elevat\w* work platforms?|scissor lifts?|boom lifts?)\b/i, 'ewp-use'], [/\bmobile (?:aluminium )?scaffold\w*/i, 'mobile-scaffold-use'], [/\bladders?\b/i, 'ladders']] },
    { test: /\bmaterials? handling\b|\bdeliveries\b/i, trade: 'shared-access-and-handling', unique: true, tasks: [[/\b(?:forklifts?|telehandlers?)\b/i, 'forklifts'], [/\bpallet jacks?\b/i, 'pallet-jacks'], [/\bmanual handling\b|\bby hand\b/i, 'manual-handling']] },
    { test: /\b(?:clean[- ]?ups?|waste|rubbish)\b/i, trade: 'cleaning', tasks: [[/./, 'site-cleanup']] },
    { test: /\belectrical\b/i, trade: 'electrical', unique: true, tasks: [[/\b(?:temporary power|construction power|leads|task lighting|three[- ]phase)\b/i, 'construction-power']] },
    { test: /\bscaffold\w*/i, trade: 'scaffolding', tasks: [] },
    { test: /\bdemoli\w*|\bstrip[- ]?out\b/i, trade: 'demolition-stripout', tasks: [] },
  ];
  function pickFor(name, rows) {
    const rule = TRADE_RULES.find((item) => item.test.test(String(name || '')));
    if (!rule) return null;
    const words = [name, ...(rows || []).map((row) => `${row.activity || ''} ${row.where || ''}`)].join(' ');
    const fits = rule.tasks.filter(([test]) => test.test(words)).map(([, id]) => id);
    return { trade: rule.trade, task: rule.unique ? (fits.length === 1 ? fits[0] : '') : (fits[0] || '') };
  }

  // A fall of more than 2 m the package's own words state settles the fall question; a likely one does not.
  const fallFrom = (flag) => (((flag && flag.categories) || []).some((item) => item.id === 'fall' && !item.likely) ? 'yes' : '');

  // A step the reading says is done by others, where this package's own work names it in a sentence that
  // does not give it to others ("Supply and install edge protection to all slab edges ... Perimeter
  // screens are supplied by others"): the scope gives it to this crew, so its question starts at Yes
  // (messy round 7, run 1: it started at "No, leave it out").
  const STEP_VERBS = /\b(?:supply|supplied|install\w*|erect\w*|fit\w*|fix\w*|remov\w*|dismantl\w*|strip\w*|maintain\w*|provid\w*|the|and|of|to|for|with|from|on|in|at|all|work|works)\b/gi;
  const TO_OTHERS = /\b(?:by others|others (?:to )?(?:supply|install|provide|erect)|(?:supplied|installed|provided|erected|done) by (?:the )?(?:builder|head contractor|principal contractor|client|others))\b/i;
  const OWN_VERB = /\b(?:supply|install|erect|fit|fix|provide|maintain|put up|set up)\b[^.;]*$/;
  function ownsStep(rows, step) {
    const words = String(step || '').toLowerCase().replace(STEP_VERBS, ' ').split(/[^a-z]+/).filter((word) => word.length >= 4);
    if (!words.length) return false;
    return (rows || []).some((row) => [row.activity, ...(row.quotes || [])].join('. ').split(/(?<=[.;])\s+/).some((sentence) => {
      const lower = sentence.toLowerCase();
      const at = lower.indexOf(words[0].replace(/s$/, ''));
      // The crew's own verb comes just before the work: "install edge protection", not "handed over to the perimeter screens".
      return at >= 0 && words.every((word) => lower.includes(word.replace(/s$/, ''))) && OWN_VERB.test(lower.slice(Math.max(0, at - 40), at)) && !TO_OTHERS.test(sentence);
    }));
  }
  // The answer to a "by others" step: the user's, else Yes where the package's own work names it.
  // The reading's own quote of the clause, and the scope's other packages, count too: the clause that gives the crew the work may be
  // quoted only in the "by others" entry, or read into another package (messy round 19, A run 1: scope 2.4 "Supply and install edge
  // protection to all slab edges ... Perimeter screens are supplied by others" started at "No, leave it out").
  const othersAnswer = (answers, pack, entry, allRows = []) => (answers[pack.name] || {})[entry.step]
    || (ownsStep([...(pack.rows || []), ...(entry && entry.says ? [{ activity: entry.says }] : []), ...(Array.isArray(allRows) ? allRows : [])], entry.step) ? 'yes' : 'no');
  // The sentence of the package's own work, not given to others, that names a step's work, or '' (messy
  // round 10, run 4: "No, leave it out" for final painting by others also took off the crew's own step for
  // "Bottoms of doors are to be sealed (painted) prior to being hung"). That work keeps its step.
  function ownWorkNaming(rows, step) {
    const words = String(step || '').toLowerCase().replace(STEP_VERBS, ' ').split(/[^a-z]+/).filter((word) => word.length >= 4).map((word) => word.replace(/s$/, ''));
    if (!words.length) return '';
    // The sentence that also does the step's own work ("Hang timber doors" for "Hang the doors") is the one quoted, before one
    // that only works on the same thing ("Seal (paint) bottoms of doors before hanging"): messy round 14, A run 4.
    const verb = (String(step || '').toLowerCase().match(/^[a-z]+/) || [''])[0].replace(/e$/, '');
    const doing = verb.length >= 3 ? new RegExp(`\\b${verb}(?:e|es|s|ed|ing)?\\b`, 'i') : null;
    const found = [];
    for (const row of rows || []) {
      for (const sentence of [row.activity, ...(row.quotes || [])].join('. ').split(/(?<=[.;])\s+/)) {
        const lower = sentence.toLowerCase();
        if (words.every((word) => new RegExp(`\\b${word}`).test(lower)) && !TO_OTHERS.test(sentence) && !/\b(?:excluded|not included|not part of|by the (?:builder|principal|head contractor|client))\b/i.test(sentence)) found.push(sentence.trim());
      }
    }
    const own = doing && found.find((sentence) => doing.test(sentence.replace(/\b(?:before|prior to|after|ready for|until)\s+\w+/gi, ' ')));
    return own || found[0] || '';
  }

  // One SWMS in the project for each package chosen. answers holds the scope review answers by
  // package name ({ [step]: 'yes' | 'no' }): Yes adds that step's group, No leaves the step out.
  function projectItems(reading, chosen, { answers = {}, crane = '', slinging = '' } = {}) {
    const { work } = packagesOf(reading);
    const steps = new Map(((reading && reading.packages) || []).map((item) => [item.package, item]));
    const flags = new Map(((reading && reading.highRisk) || []).map((item) => [item.package, item]));
    // The scope's own words giving this subcontractor the cranage go with each SWMS, so No crane is queried there even where
    // the task line names no crane (messy round 19, A run 1).
    const cranage = craneClause(reading);
    return work.filter((pack) => chosen.includes(pack.name)).map((pack) => {
      const mapped = steps.get(pack.name);
      const kinds = mapped ? [...(mapped.groups || [])] : null;
      const leaveOut = [];
      for (const entry of (mapped && mapped.byOthers) || []) {
        if (othersAnswer(answers, pack, entry, work.flatMap((other) => other.rows)) === 'yes') { if (kinds && !kinds.includes(entry.group)) kinds.push(entry.group); } else if (!ownWorkNaming(pack.rows, entry.step)) leaveOut.push(entry.step);
      }
      return {
        // A work title where the package's name is bare or an area (handover.js packageTitles, messy round
        // 9); the package keeps its name, which the choice is kept by.
        title: (reading && reading.titles && reading.titles[pack.name]) || pack.name,
        package: pack.name,
        // The task prints as a plain list of the work (D251). SiteWrite reads the work from the scope's
        // full words, with its places, conditions and plant, so "near roads" or "energised switchboards"
        // still reach the high risk check; the conditions go to the matching site questions and the
        // plant to the plant list, for the user to check (D252).
        task: scopeTask.plainTask(pack.rows),
        scopeTask: { ...scopeTask.scopeWords(pack.rows), ...(cranage ? { crane: cranage.quote } : {}) },
        site: scopeTask.scopeSite(pack.rows),
        plant: scopeTask.scopePlant(pack.rows),
        trade: '',
        pick: pickFor(pack.name, pack.rows),
        kinds,
        leaveOut: mapped ? leaveOut : null,
        unmatched: mapped ? (mapped.unmatched || []) : null,
        fallRisk: fallFrom(flags.get(pack.name)),
        fallHint: fallHint(flags.get(pack.name), scopeTask.plainTask(pack.rows)),
        crane: crane || '',
        slinging: slinging || '',
        body: null,
        status: 'todo',
      };
    });
  }

  const api = { packagesOf, ownsStep, ownWorkNaming, othersAnswer, isCranage, craneClause, suppliesCranage, craneFromReading, fallHint, cranageOffer, CRANAGE_TICK, pickFor, fallFrom, projectItems, TRADE_RULES };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteWriteScopeChoice = api;
})(typeof window !== 'undefined' ? window : globalThis);
