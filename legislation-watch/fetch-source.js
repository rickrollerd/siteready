// Reads one legislation or code of practice source from GitHub's servers and prints
// a chunk of its text, so job steps can be checked against the source.
//
//   SOURCE=whsReg CHUNK=0 node legislation-watch/fetch-source.js

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SOURCES = {
  whsReg: ['Work Health and Safety Regulation 2011 (Qld), current', 'https://www.legislation.qld.gov.au/view/whole/html/inforce/current/sl-2011-0240'],
  plumbingAct: ['Plumbing and Drainage Act 2018 (Qld), current', 'https://www.legislation.qld.gov.au/view/whole/html/inforce/current/act-2018-017'],
  confined: ['Model Code of Practice: Confined spaces (Safe Work Australia, November 2024)', 'https://www.safeworkaustralia.gov.au/sites/default/files/2024-11/model_code_of_practice-confined_spaces-nov24.pdf'],
  excavation: ['Model Code of Practice: Excavation work (Safe Work Australia)', 'https://www.safeworkaustralia.gov.au/system/files/documents/1705/mcop-excavation-work-v3.pdf'],
  welding: ['Model Code of Practice: Welding processes (Safe Work Australia, July 2020)', 'https://www.safeworkaustralia.gov.au/sites/default/files/2020-07/model_code_of_practice_welding_processes.pdf'],
  falls: ['Managing the risk of falls at workplaces Code of Practice (model code, SafeWork SA copy, June 2020)', 'https://www.safework.sa.gov.au/__data/assets/pdf_file/0004/136273/Managing-the-risk-of-falls-at-workplaces.pdf'],
  manual: ['Model Code of Practice: Hazardous manual tasks (Safe Work Australia)', 'https://www.safeworkaustralia.gov.au/system/files/documents/1705/mcop-hazardous-manual-tasks-v2.pdf'],
};
const CHUNK_SIZE = 550000;
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

(async () => {
  const [name, url] = SOURCES[process.env.SOURCE];
  const chunk = Number(process.env.CHUNK || 0);
  const response = await fetch(url, { signal: AbortSignal.timeout(120000), headers: { 'User-Agent': BROWSER, Accept: '*/*' } });
  const buffer = Buffer.from(await response.arrayBuffer());
  let text;
  if (buffer.subarray(0, 4).toString() === '%PDF') {
    const file = path.join(os.tmpdir(), `source-${Date.now()}.pdf`);
    fs.writeFileSync(file, buffer);
    text = execFileSync('pdftotext', ['-layout', file, '-'], { maxBuffer: 128 * 1024 * 1024 }).toString();
  } else {
    text = html(buffer.toString('utf8'));
  }
  const part = text.slice(chunk * CHUNK_SIZE, (chunk + 1) * CHUNK_SIZE);
  console.log(`@@@@@ ${name} | chunk ${chunk} of ${Math.ceil(text.length / CHUNK_SIZE)}\n${url}\nHTTP ${response.status}, ${text.length} characters`);
  console.log(part);
  console.log(`@@@@@ END ${name} | chunk ${chunk}`);
})().catch((error) => { console.log(`FAILED: ${error.message}`); });
