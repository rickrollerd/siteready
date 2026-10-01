// Reads the electrical safety sources for SiteReady's electrical job steps from
// GitHub's servers and prints their full text, so each control can be checked
// against the source.
//
//   node legislation-watch/fetch-electrical.js

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SOURCES = [
  ['Electrical Safety Regulation 2013 (Qld), current', 'https://www.legislation.qld.gov.au/view/whole/html/inforce/current/sl-2013-0213'],
  ['Managing electrical risks in the workplace Code of Practice 2021 (Qld)', 'https://www.worksafe.qld.gov.au/__data/assets/pdf_file/0025/72637/managing-electrical-risks-in-the-workplace-cop-2021.pdf'],
  ['Electrical Safety Code of Practice 2021 (Qld), risk management', 'https://www.worksafe.qld.gov.au/__data/assets/pdf_file/0007/59677/es-code-of-practice-risk-management.pdf'],
  ['Model Code of Practice: Managing electrical risks in the workplace (Safe Work Australia)', 'https://www.safeworkaustralia.gov.au/system/files/documents/1705/mcop-managing-electrical-risks_in_the_workplace-v3.pdf'],
  ['Managing electrical risks in the workplace Code of Practice (NT copy of the model code)', 'https://worksafe.nt.gov.au/_resources/documents/pdf/codes-of-practice/code-of-practice-managing-electrical-risks-in-the-workplace.pdf'],
];

const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function html(text) {
  return String(text)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|h\d|li|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n');
}

async function read([name, url]) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(90000), headers: { 'User-Agent': BROWSER, Accept: '*/*' } });
    const buffer = Buffer.from(await response.arrayBuffer());
    let text;
    if (buffer.subarray(0, 4).toString() === '%PDF') {
      const file = path.join(os.tmpdir(), `source-${Date.now()}-${Math.random()}.pdf`);
      fs.writeFileSync(file, buffer);
      text = execFileSync('pdftotext', ['-layout', file, '-'], { maxBuffer: 64 * 1024 * 1024 }).toString();
    } else {
      text = html(buffer.toString('utf8'));
    }
    return `\n@@@@@ ${name}\n${url}\nHTTP ${response.status}, ${text.length} characters\n${text}\n@@@@@ END ${name}\n`;
  } catch (error) {
    return `\n@@@@@ ${name}\n${url}\nFAILED: ${error.message}\n@@@@@ END ${name}\n`;
  }
}

(async () => {
  for (const source of SOURCES) process.stdout.write(await read(source));
})();
