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
  plant: ['Model Code of Practice: Managing the risks of plant in the workplace (Safe Work Australia, November 2024)', 'https://www.safeworkaustralia.gov.au/sites/default/files/2024-11/model_code_of_practice-managing_the_risks_of_plant_in_the_workplace-nov24.pdf'],
  ozoneRegs: ['Ozone Protection and Synthetic Greenhouse Gas Management Regulations 1995 (Cth), latest', 'https://www.legislation.gov.au/F1996B02085/latest/text'],
  ozoneDownloads: ['Ozone Protection and Synthetic Greenhouse Gas Management Regulations 1995 (Cth), downloads page', 'https://www.legislation.gov.au/F1996B02085/latest/downloads'],
  // The regulations' text loads in the browser, so follow the PDF link on the downloads page.
  ozonePdf: ['Ozone Protection and Synthetic Greenhouse Gas Management Regulations 1995 (Cth), latest PDF', 'https://www.legislation.gov.au/F1996B02085/latest/downloads', /href="([^"]+)"[^>]*>[^<]*\.pdf/i],
  refrigerantCode: ['Australia and New Zealand Refrigerant Handling Code of Practice 2025, Part 2 (ARC)', 'https://www.arctick.org/media/29167/air018-refrigerant-handling-codes-of-practice-2025_part-2_web_final_singles.pdf'],
  cablingRules: ['Telecommunications (Cabling Provider) Rules 2025 (Cth), as made', 'https://www.legislation.gov.au/F2025L00386/asmade/2025-03-21/text/original/pdf'],
  securityAct: ['Security Providers Act 1993 (Qld), current', 'https://www.legislation.qld.gov.au/view/whole/html/inforce/current/act-1993-083'],
  pilingStandard: ['Piling work and foundation engineering sites: A guide to managing safety (industry standard, WorkSafe Victoria and PFSF, edition 1, January 2014)', 'http://pilingfederation.org.au/wp-content/uploads/2017/08/Piling-Works-Industry-Standard.pdf'],
  steelStandard: ['Industry standard: Safe erection of structural steel for buildings (WorkSafe Victoria, edition 1, May 2009)', 'https://content-v2.api.worksafe.vic.gov.au/sites/default/files/2020-03/ISBN-Safe-erection-structural-steel-buildings-industry-standard-2009-05a.pdf'],
  scaffoldCode: ['Scaffolding Code of Practice 2021 (Qld)', 'https://www.worksafe.qld.gov.au/__data/assets/pdf_file/0027/76347/scaffolding-cop-2021.pdf'],
  mobilePlantSupport: ['Safe support of mobile plant guide (Office of Industrial Relations, Qld)', 'https://www.worksafe.qld.gov.au/__data/assets/pdf_file/0008/20150/safe-support-mobile-plant-guide.pdf'],
  constructionCode: ['Model Code of Practice: Construction work (Safe Work Australia, November 2024)', 'https://www.safeworkaustralia.gov.au/sites/default/files/2024-11/model_code_of_practice-construction_work-nov24.pdf'],
  noiseCode: ['Model Code of Practice: Managing noise and preventing hearing loss at work (Safe Work Australia)', 'https://www.safeworkaustralia.gov.au/system/files/documents/1810/model-cop-managing-noise-and-preventing-hearing-loss-at-work.pdf'],
  chemicalsCode: ['Model Code of Practice: Managing risks of hazardous chemicals in the workplace (Safe Work Australia)', 'https://www.safeworkaustralia.gov.au/system/files/documents/1702/managing_risks_of_hazardous_chemicals2.pdf'],
  nswReg: ['Work Health and Safety Regulation 2025 (NSW), current', 'https://legislation.nsw.gov.au/view/html/inforce/current/sl-2025-0440'],
  vicReg: ['Occupational Health and Safety Regulations 2017 (Vic), current', 'https://www.legislation.vic.gov.au/in-force/statutory-rules/occupational-health-and-safety-regulations-2017', /href="([^"]+\.pdf[^"]*)"/i],
  waReg: ['Work Health and Safety (General) Regulations 2022 (WA), current', 'https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s53267.html', /href="([^"]+\.pdf[^"]*)"/i],
  manual: ['Model Code of Practice: Hazardous manual tasks (Safe Work Australia)', 'https://www.safeworkaustralia.gov.au/system/files/documents/1705/mcop-hazardous-manual-tasks-v2.pdf'],
  electricalCode: ['Model Code of Practice: Managing electrical risks in the workplace (Safe Work Australia)', 'https://www.safeworkaustralia.gov.au/system/files/documents/1705/mcop-managing-electrical-risks_in_the_workplace-v3.pdf'],
};
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE || 550000);
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
  const [name, page, follow] = SOURCES[process.env.SOURCE];
  const chunk = Number(process.env.CHUNK || 0);
  const get = (address) => fetch(address, { signal: AbortSignal.timeout(120000), headers: { 'User-Agent': BROWSER, Accept: '*/*' } });
  let url = page;
  if (follow) {
    const listing = await (await get(page)).text();
    const link = listing.match(follow) || listing.match(/href="([^"]+\.pdf[^"]*)"/i) || listing.match(/href="([^"]*\/pdf[^"]*)"/i);
    if (!link) throw new Error(`no link found on ${page}; links: ${(listing.match(/href="[^"]+"/g) || []).join(' ')}`);
    url = new URL(link[1].replace(/&amp;/g, '&'), page).href;
  }
  const response = await get(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  let text;
  if (buffer.subarray(0, 4).toString() === '%PDF') {
    const file = path.join(os.tmpdir(), `source-${Date.now()}.pdf`);
    fs.writeFileSync(file, buffer);
    text = execFileSync('pdftotext', ['-layout', file, '-'], { maxBuffer: 128 * 1024 * 1024 }).toString();
  } else {
    text = html(buffer.toString('utf8'));
  }
  // OUT writes the whole text to a file, for a workflow that commits it.
  if (process.env.OUT) {
    fs.mkdirSync(path.dirname(process.env.OUT), { recursive: true });
    fs.writeFileSync(process.env.OUT, `${name}\n${url}\n\n${text}`);
    console.log(`Wrote ${text.length} characters of ${name} to ${process.env.OUT}`);
    return;
  }
  const part = text.slice(chunk * CHUNK_SIZE, (chunk + 1) * CHUNK_SIZE);
  console.log(`@@@@@ ${name} | chunk ${chunk} of ${Math.ceil(text.length / CHUNK_SIZE)}\n${url}\nHTTP ${response.status}, ${text.length} characters`);
  console.log(part);
  console.log(`@@@@@ END ${name} | chunk ${chunk}`);
})().catch((error) => { console.log(`FAILED: ${error.message}`); });
