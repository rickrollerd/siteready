// Builds the pick lists (pick-lists.json, read by presets.js) from the owner's trade catalogue
// (goal 1, decisions D189 to D192). Run it again after the catalogue changes:
//   node scripts/build-presets.js [catalogue trades folder]
// The folder defaults to the catalogue in the data repo. Each trade file gives the trade's label
// and its tasks: a generic label, whether it rests on evidence or is inferred, and the job step
// kinds that cover it (siteReady.kinds, checked here against activities.js). The task words and
// the parts with no job steps come from pick-wording.js. Only the trades, labels, kinds and
// coverage are copied: the evidence and its sources stay in the data repo.
// It prints what needs a look: tasks with no wording, kinds the library does not have, and
// kinds a task's words call for that its steps leave out.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'pick-lists.json');
const DEFAULT_CATALOGUE = '/home/user/siteready-data/scratchpad/catalogue/trades';

// The groups the trades are shown in, in order, and the trades in each, in order. A trade the
// catalogue adds that is not listed here goes at the end of its own group, "Other trades".
const GROUPS = [
  ['Site and plant', ['site-establishment-traffic', 'demolition-stripout', 'asbestos-removal', 'scaffolding', 'cranes-rigging']],
  ['Civil and infrastructure', ['civil-earthworks', 'basement-excavation', 'pipelines-drainage', 'roads-pavements', 'line-marking', 'retaining-walls', 'bridges', 'rail', 'landscaping']],
  ['Structure', ['piling', 'formwork', 'steel-fixing-pt', 'concreting', 'precast', 'structural-steel', 'concrete-cutting', 'masonry']],
  // ICT and security are two trades (D197). Passive fire is a trade of its own as well as each
  // services trade's own penetrations task (D198).
  ['Services', ['electrical', 'ict-communications', 'security-access-control', 'plumbing-hydraulics', 'mechanical', 'fire-services', 'passive-fire', 'hospital-specialist-services', 'lifts']],
  ['Finishes', ['roofing-cladding', 'facade-glazing', 'waterproofing', 'insulation', 'plasterboard-walls-ceilings', 'carpentry-joinery', 'shopfitting', 'tiling', 'flooring', 'painting', 'cleaning']],
  // Work any trade does (EWPs, mobile scaffolds, ladders, forklifts): its own pick (owner rule:
  // EWP and mobile scaffold use are their own SWMS, D172).
  ['Any trade', ['shared-access-and-handling']],
];

// A kind as the catalogue writes it, such as "concrete (Pump and place)" or "roadPlant (limeWork
// option)": the kind is the first word, the rest is a note.
const kindOf = (text) => String(text).trim().split(/[\s(]/)[0];

function build(folder) {
  const { ACTIVITIES } = require(path.join(ROOT, 'activities'));
  const { questionsFor } = require(path.join(ROOT, 'draft'));
  const WORDING = require(path.join(ROOT, 'pick-wording'));
  const known = new Set(ACTIVITIES.map((activity) => activity.when).filter(Boolean));
  const notes = [];
  const files = fs.readdirSync(folder).filter((name) => name.endsWith('.json')).sort();
  const catalogue = new Map(files.map((name) => {
    const trade = JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8'));
    return [trade.trade, trade];
  }));
  const placed = new Set(GROUPS.flatMap(([, ids]) => ids));
  const groups = GROUPS.map(([name, ids]) => ({ name, trades: ids.filter((id) => catalogue.has(id)) }));
  const others = [...catalogue.keys()].filter((id) => !placed.has(id));
  if (others.length) {
    groups.splice(groups.length - 1, 0, { name: 'Other trades', trades: others });
    notes.push(`Trades not in a group yet (shown under Other trades): ${others.join(', ')}`);
  }
  for (const [, ids] of GROUPS) for (const id of ids) if (!catalogue.has(id)) notes.push(`Grouped trade not in the catalogue: ${id}`);

  const trades = [];
  for (const group of groups) {
    for (const id of group.trades) {
      const source = catalogue.get(id);
      const wording = WORDING[id] || {};
      const tasks = (source.tasks || []).map((item) => {
        const words = wording[item.id] || {};
        if (!wording[item.id]) notes.push(`No wording for ${id}/${item.id}: its label is used as the task`);
        const site = item.siteReady || {};
        const listed = (site.kinds || []).map(kindOf).filter(Boolean);
        for (const kind of listed) if (!known.has(kind)) notes.push(`${id}/${item.id}: the library has no kind ${kind}`);
        const drop = new Set(words.drop || []);
        const kinds = [...new Set([...listed, ...(words.add || [])])].filter((kind) => known.has(kind) && !drop.has(kind));
        const task = words.task || item.label;
        // The fall answer: the words' own reading of a place at height, unless the wording sets it.
        const found = questionsFor({ task, state: 'qld', fallRisk: 'no', crane: words.crane || 'company' });
        const fallRisk = words.fallRisk || (found.fall && found.fall.detected ? 'yes' : 'no');
        const locked = (found.steps && found.steps.locked) || [];
        const left = locked.filter((kind) => !kinds.includes(kind));
        if (left.length && kinds.length) notes.push(`${id}/${item.id}: the words call for ${left.join(', ')}, which its steps leave out`);
        // Steps of those kinds that do not fit this task, left out as a scope task's work by others is.
        const named = new Set(ACTIVITIES.filter((activity) => kinds.includes(activity.when)).flatMap((activity) => activity.steps.map((step) => step.step)));
        const leaveOut = (words.omit || []).filter((step) => named.has(step));
        for (const step of words.omit || []) if (!named.has(step)) notes.push(`${id}/${item.id}: no step "${step}" to leave out`);
        const gaps = words.gaps || [];
        if (site.coverage && site.coverage !== 'full' && !words.gaps) notes.push(`${id}/${item.id}: the catalogue says ${site.coverage} coverage, but no part is named as having no job steps`);
        return {
          id: item.id,
          title: item.label,
          task,
          fallRisk,
          crane: words.crane || 'company',
          kinds,
          leaveOut,
          gaps,
          coverage: site.coverage || 'full',
          basis: item.basis === 'inferred' ? 'inferred' : 'evidence',
        };
      });
      for (const taskId of Object.keys(wording)) if (!(source.tasks || []).some((item) => item.id === taskId)) notes.push(`Wording for a task no longer in the catalogue: ${id}/${taskId}`);
      // "Any trade: access, handling and tools" sits under its group's own label, so it is not repeated.
      const name = source.label.replace(new RegExp(`^${group.name}:\\s*`, 'i'), '');
      trades.push({ id, name: name.charAt(0).toUpperCase() + name.slice(1), group: group.name, tasks });
    }
  }
  for (const tradeId of Object.keys(WORDING)) if (!catalogue.has(tradeId)) notes.push(`Wording for a trade no longer in the catalogue: ${tradeId}`);
  return { pickLists: { note: 'Built by scripts/build-presets.js from the trade catalogue. Do not edit by hand: change the catalogue or pick-wording.js and build again.', groups: groups.map((group) => group.name), trades }, notes };
}

if (require.main === module) {
  const folder = process.argv[2] || DEFAULT_CATALOGUE;
  const { pickLists, notes } = build(folder);
  fs.writeFileSync(OUT, `${JSON.stringify(pickLists, null, 1)}\n`);
  const tasks = pickLists.trades.reduce((n, trade) => n + trade.tasks.length, 0);
  console.log(`Wrote ${path.relative(ROOT, OUT)}: ${pickLists.trades.length} trades, ${tasks} tasks, from ${folder}`);
  for (const note of notes) console.log(`  ${note}`);
}

module.exports = { build, GROUPS };
