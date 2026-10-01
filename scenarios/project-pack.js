// Writes a project's SWMS set as Word files, one per SWMS.
//
//   node scenarios/project-pack.js <project file> <output folder> [date]

const fs = require('fs');
const path = require('path');
const { prepareDraft } = require('../draft');
const { draftToDocx } = require('../docx-draft');

const [file, out, date] = process.argv.slice(2);
const project = require(path.resolve(file));
fs.mkdirSync(out, { recursive: true });

(async () => {
  for (const [index, swms] of project.swms.entries()) {
    const draft = prepareDraft({
      state: project.state,
      task: swms.task,
      fallRisk: swms.fallRisk,
      residential: 'no',
      workplace: project.workplace,
      date: date || '',
      facts: swms.facts,
    });
    if (draft.kind !== 'draft') throw new Error(`${swms.id}: ${draft.kind} ${(draft.missing || []).join('; ')}`);
    const name = `${String(index + 1).padStart(2, '0')} ${swms.title.replace(/[^A-Za-z0-9 ,-]/g, '')} (${project.state.toUpperCase()}).docx`;
    fs.writeFileSync(path.join(out, name), Buffer.from(await draftToDocx(draft)));
    console.log(name);
  }
})().catch((error) => { console.error(error.message); process.exit(1); });
