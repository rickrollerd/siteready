// Builds an email with every Word file in a pack folder attached, ready for curl to send. The text
// is the folder's email.txt and the subject names its title.txt, both written by project-pack.js:
// this script reads nothing outside the folder, as the step that runs it holds the mail login.
//
//   node scenarios/email-pack.js <folder> <from> <to> > message.eml

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// One plain address: no name, no list, nothing that could start another header line.
const ADDRESS = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/;
const plain = (text) => String(text).replace(/[^\x20-\x7e]/g, '');
const wrap = (text) => text.replace(/.{1,76}/g, '$&\r\n');

// A plain file directly in the folder: a link is not followed.
function packFile(folder, name) {
  const file = path.join(folder, name);
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${name} in the pack is not a plain file.`);
  return file;
}

function buildMessage(folder, from, to) {
  if (!ADDRESS.test(String(from || ''))) throw new Error('The sending address is not a plain email address.');
  if (!ADDRESS.test(String(to || ''))) throw new Error('Send to must be one plain email address.');
  const body = fs.readFileSync(packFile(folder, 'email.txt'), 'utf8');
  const title = fs.readFileSync(packFile(folder, 'title.txt'), 'utf8').trim();
  const boundary = `sitewrite-${crypto.randomBytes(12).toString('hex')}`;
  const files = fs.readdirSync(folder).filter((name) => name.endsWith('.docx')).sort();
  const parts = [
    `From: SiteWrite <${from}>`,
    `To: ${to}`,
    `Subject: ${plain(`SiteWrite SWMS for review: ${title}`)}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(Buffer.from(body).toString('base64')),
  ];
  for (const name of files) {
    parts.push(
      `--${boundary}`,
      `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document; name="${plain(name)}"`,
      `Content-Disposition: attachment; filename="${plain(name)}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrap(fs.readFileSync(packFile(folder, name)).toString('base64')),
    );
  }
  parts.push(`--${boundary}--`, '');
  return parts.join('\r\n');
}

if (require.main === module) {
  try {
    const [folder, from, to] = process.argv.slice(2);
    process.stdout.write(buildMessage(folder, from, to));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { buildMessage, ADDRESS };
