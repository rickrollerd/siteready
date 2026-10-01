// Reads the regulators' SWMS templates and guidance from GitHub's servers and
// prints their text, so the field names can be checked against the originals.
//
//   node legislation-watch/fetch-templates.js

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SOURCES = [
  ['Safe Work Australia information sheet and template', 'https://www.safeworkaustralia.gov.au/system/files/documents/1703/information-sheet-safe-work-method-statement.pdf'],
  ['Safe Work Australia model Code of Practice: Construction work, Nov 2024', 'https://www.safeworkaustralia.gov.au/sites/default/files/2024-11/model_code_of_practice-construction_work-nov24.pdf'],
  ['Queensland guide', 'https://www.worksafe.qld.gov.au/resources/guides/safe-work-method-statements'],
  ['NSW high risk construction work SWMS template', 'https://www.safework.nsw.gov.au/__data/assets/pdf_file/0003/107886/SW08268-0818-427125.pdf'],
  ['NSW WHS Form 05', 'https://www.safework.nsw.gov.au/__data/assets/pdf_file/0003/52743/form-5-safe-work-method-statement.pdf'],
  ['Victoria SWMS page', 'https://www.worksafe.vic.gov.au/resources/safe-work-method-statements-swms'],
  ['Victoria SWMS PDF', 'https://content-v2.api.worksafe.vic.gov.au/sites/default/files/2023-07/Safe-work-method-statements-2023-07.pdf'],
  ['Western Australia SWMS page', 'https://www.worksafe.wa.gov.au/publications/safe-work-method-statements-high-risk-construction-work'],
  ['Western Australia SWMS PDF', 'https://www.worksafe.wa.gov.au/system/files/migrated/sites/default/files/atoms/files/231293_br_swms-highrisk.pdf'],
  ['South Australia SWMS page', 'https://www.safework.sa.gov.au/industry/construction/safe-work-method-statements'],
  ['Tasmania sample SWMS template', 'https://worksafe.tas.gov.au/__data/assets/word_doc/0009/546498/Construction-sample-Safe-work-method-statement-template.doc'],
  ['Northern Territory SWMS template', 'https://worksafe.nt.gov.au/_resources/documents/pdf/checklists/safe-work-method-statement-template.pdf'],
  ['ACT SWMS template', 'https://www.worksafe.act.gov.au/__data/assets/pdf_file/0007/2187880/Safe-Work-Method-Statement-Template.pdf'],
  ['ACT SWMS guidance note 2025', 'https://www.worksafe.act.gov.au/__data/assets/pdf_file/0003/2192124/SWMS-Guidance-Note-2025-2.pdf'],
];

// The Code of Practice is long; only the SWMS parts are printed.
const LIMITS = { default: 12000 };
const CODE_TERMS = ['Safe work method statement', 'Appendix E', 'personal protective equipment'];

function html(text) {
  return String(text)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function convert(buffer, url, type) {
  const file = path.join(os.tmpdir(), `source-${Date.now()}`);
  fs.writeFileSync(file, buffer);
  const run = (cmd, args) => execFileSync(cmd, args, { maxBuffer: 64 * 1024 * 1024 }).toString();
  if (buffer.subarray(0, 4).toString() === '%PDF') return run('pdftotext', ['-layout', file, '-']);
  if (/\.doc$/i.test(url) || /msword/.test(type)) return run('antiword', [file]);
  return html(buffer.toString('utf8'));
}

async function read([name, url]) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'Mozilla/5.0 SiteReady source check' } });
    const buffer = Buffer.from(await response.arrayBuffer());
    const text = convert(buffer, url, response.headers.get('content-type') || '');
    let shown = text.slice(0, LIMITS.default);
    if (/Code of Practice/.test(name)) {
      shown = CODE_TERMS.map((term) => {
        const parts = [];
        let at = text.indexOf(term);
        while (at >= 0 && parts.length < 4) { parts.push(text.slice(at, at + 3000)); at = text.indexOf(term, at + 3000); }
        return `--- ${term}\n${parts.join('\n...\n')}`;
      }).join('\n');
    }
    return `\n===== ${name}\n${url}\nHTTP ${response.status}, ${text.length} characters\n${shown}`;
  } catch (error) {
    return `\n===== ${name}\n${url}\nFAILED: ${error.message}`;
  }
}

(async () => {
  const results = await Promise.all(SOURCES.map(read));
  console.log(results.join('\n'));
})();
