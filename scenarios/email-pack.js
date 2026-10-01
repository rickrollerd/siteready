// Builds an email with every Word file in a folder attached, ready for curl to send.
//
//   node scenarios/email-pack.js <folder> <from> <to> <subject> <body file> > message.eml

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [folder, from, to, subject, bodyFile] = process.argv.slice(2);
const boundary = `siteready-${crypto.randomBytes(12).toString('hex')}`;
const files = fs.readdirSync(folder).filter((name) => name.endsWith('.docx')).sort();
const wrap = (text) => text.replace(/.{1,76}/g, '$&\r\n');
const plain = (text) => String(text).replace(/[^\x20-\x7e]/g, '');

const parts = [
  `From: SiteReady <${from}>`,
  `To: ${to}`,
  `Subject: ${plain(subject)}`,
  `Date: ${new Date().toUTCString()}`,
  'MIME-Version: 1.0',
  `Content-Type: multipart/mixed; boundary="${boundary}"`,
  '',
  `--${boundary}`,
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: base64',
  '',
  wrap(Buffer.from(fs.readFileSync(bodyFile, 'utf8')).toString('base64')),
];
for (const name of files) {
  parts.push(
    `--${boundary}`,
    `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document; name="${plain(name)}"`,
    `Content-Disposition: attachment; filename="${plain(name)}"`,
    'Content-Transfer-Encoding: base64',
    '',
    wrap(fs.readFileSync(path.join(folder, name)).toString('base64')),
  );
}
parts.push(`--${boundary}--`, '');
process.stdout.write(parts.join('\r\n'));
