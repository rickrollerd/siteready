// Writes a project's SWMS set as Word files, one per SWMS. With an email text named, it also writes
// the email's text and the project's title beside them (email.txt and title.txt), so the step that
// sends the email reads only this folder.
//
//   node scenarios/project-pack.js <project name> <output folder> [date] [email text name]
//
// Names are files in scenarios/projects without the ending, for example brisbane-tower and
// brisbane-tower-email. A path is refused (project-files.js).

const fs = require('fs');
const path = require('path');
const { projectFile } = require('./project-files');

const [name, out, date, emailName] = process.argv.slice(2);

(async () => {
  // Checked before anything is read: require() runs a .js file, and reads any .json it is given.
  const file = projectFile(name, '.json');
  const body = emailName ? fs.readFileSync(projectFile(emailName, '.txt'), 'utf8') : null;
  const project = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!project || !Array.isArray(project.swms) || !project.state) throw new Error(`${name}.json is not a project file.`);
  const { prepareDraft } = require('../draft');
  const { draftToDocx } = require('../docx-draft');
  if (!out) throw new Error('Give the output folder.');
  fs.mkdirSync(out, { recursive: true });
  for (const [index, swms] of project.swms.entries()) {
    const draft = prepareDraft({
      state: project.state,
      task: swms.task,
      fallRisk: swms.fallRisk,
      crane: swms.crane,
      residential: 'no',
      workplace: project.workplace,
      date: date || '',
      facts: swms.facts,
    });
    if (draft.kind !== 'draft') throw new Error(`${swms.id}: ${draft.kind} ${(draft.missing || []).join('; ')}`);
    const fileName = `${String(index + 1).padStart(2, '0')} ${swms.title.replace(/[^A-Za-z0-9 ,-]/g, '')} (${project.state.toUpperCase()}).docx`;
    fs.writeFileSync(path.join(out, fileName), Buffer.from(await draftToDocx(draft)));
    console.log(fileName);
  }
  if (body !== null) {
    fs.writeFileSync(path.join(out, 'email.txt'), body);
    fs.writeFileSync(path.join(out, 'title.txt'), String(project.title || name));
  }
})().catch((error) => { console.error(error.message); process.exit(1); });
