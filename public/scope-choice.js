// What the user chooses from a scope reading, carried straight through to the SWMS to prepare
// (owner testing, 13 October 2026). The work packages are chosen once: each ticked package becomes
// one SWMS in the project, with its scope review answers, who runs the crane, and the trade and
// task from the pick lists that match it. Used by the browser (scope.js) and the tests.
(function (root) {
  const scopeTask = typeof module === 'object' && module.exports ? require('./scope-task') : root.SiteReadyScopeTask;

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
  const BY_OTHERS = /\b(?:by others|by the (?:head |principal |main )?contractor|by the builder|excluded|exclusions?|not included|not part of)\b/i;

  // The first clause in which the scope gives this subcontractor the cranage, from the quotes of its site work.
  function craneClause(reading) {
    for (const row of ((reading && reading.activities) || []).filter((item) => item.type !== 'Duty')) {
      for (const quote of row.quotes || []) {
        const sentence = String(quote).split(/(?<=[.;])\s+/).find((part) => CRANAGE_SUPPLY.test(part) && !BY_OTHERS.test(part));
        if (sentence) return { clause: String(row.clause || '').trim(), quote: sentence.trim() };
      }
    }
    return null;
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

  // One SWMS in the project for each package chosen. answers holds the scope review answers by
  // package name ({ [step]: 'yes' | 'no' }): Yes adds that step's group, No leaves the step out.
  function projectItems(reading, chosen, { answers = {}, crane = '', slinging = '' } = {}) {
    const { work } = packagesOf(reading);
    const steps = new Map(((reading && reading.packages) || []).map((item) => [item.package, item]));
    const flags = new Map(((reading && reading.highRisk) || []).map((item) => [item.package, item]));
    return work.filter((pack) => chosen.includes(pack.name)).map((pack) => {
      const mapped = steps.get(pack.name);
      const kinds = mapped ? [...(mapped.groups || [])] : null;
      const leaveOut = [];
      for (const entry of (mapped && mapped.byOthers) || []) {
        if ((answers[pack.name] || {})[entry.step] === 'yes') { if (kinds && !kinds.includes(entry.group)) kinds.push(entry.group); } else leaveOut.push(entry.step);
      }
      return {
        title: pack.name,
        // The task prints as a plain list of the work (D251). SiteReady reads the work from the scope's
        // full words, with its places, conditions and plant, so "near roads" or "energised switchboards"
        // still reach the high risk check; the conditions go to the matching site questions and the
        // plant to the plant list, for the user to check (D252).
        task: scopeTask.plainTask(pack.rows),
        scopeTask: scopeTask.scopeWords(pack.rows),
        site: scopeTask.scopeSite(pack.rows),
        plant: scopeTask.scopePlant(pack.rows),
        trade: '',
        pick: pickFor(pack.name, pack.rows),
        kinds,
        leaveOut: mapped ? leaveOut : null,
        unmatched: mapped ? (mapped.unmatched || []) : null,
        fallRisk: fallFrom(flags.get(pack.name)),
        crane: crane || '',
        slinging: slinging || '',
        body: null,
        status: 'todo',
      };
    });
  }

  const api = { packagesOf, isCranage, craneClause, cranageOffer, CRANAGE_TICK, pickFor, fallFrom, projectItems, TRADE_RULES };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteReadyScopeChoice = api;
})(typeof window !== 'undefined' ? window : globalThis);
