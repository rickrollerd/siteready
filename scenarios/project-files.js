// The files the Send SWMS pack workflow may read: a short name for a file in scenarios/projects,
// never a path. The person running the workflow types the name, so a name that is not one, a file
// that is not there, or a link that leads outside the folder is refused before anything reads it.
//
//   node scenarios/project-files.js <name> <.json or .txt>   (prints the file's full path)

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'projects');
const NAME = /^[a-z0-9][a-z0-9-]{0,99}$/;
const ENDINGS = ['.json', '.txt'];

function projectFile(name, ending, dir = DIR) {
  const value = String(name == null ? '' : name).trim();
  if (!ENDINGS.includes(ending)) throw new Error(`Only ${ENDINGS.join(' and ')} files are read from scenarios/projects.`);
  if (!NAME.test(value)) throw new Error(`"${value}" is not a file name. Give the name of a file in scenarios/projects without its folder or ending, for example brisbane-tower.`);
  const root = fs.realpathSync(dir);
  const file = path.join(root, `${value}${ending}`);
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    throw new Error(`There is no ${value}${ending} in scenarios/projects.`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${value}${ending} in scenarios/projects is not a plain file.`);
  // The folder itself could be reached through a link: the file must still be inside it.
  const real = fs.realpathSync(file);
  if (path.dirname(real) !== root) throw new Error(`${value}${ending} is not inside scenarios/projects.`);
  return real;
}

if (require.main === module) {
  try {
    process.stdout.write(`${projectFile(process.argv[2], process.argv[3])}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { projectFile, DIR };
