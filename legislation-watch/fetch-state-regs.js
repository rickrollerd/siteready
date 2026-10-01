// Fetches the NSW, Victorian and WA regulations in full, with a real browser
// where a site needs one, and writes each as text to state-sources/, so the
// citations SiteReady prints for those states can be checked against them.
//
//   node legislation-watch/fetch-state-regs.js   (on GitHub's servers)

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = 'state-sources';

function save(name, title, url, text) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.txt`), `${title}\n${url}\n\n${text}`);
  console.log(`${name}: ${text.length} characters from ${url}`);
}

function pdfText(buffer) {
  const file = path.join(OUT, 'tmp.pdf');
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(file, buffer);
  const text = execFileSync('pdftotext', ['-layout', file, '-'], { maxBuffer: 256 * 1024 * 1024 }).toString();
  fs.unlinkSync(file);
  return text;
}

async function nsw(browser) {
  const page = await browser.newPage();
  const tries = [
    'https://legislation.nsw.gov.au/view/whole/html/inforce/current/sl-2025-0440',
    'https://legislation.nsw.gov.au/view/html/inforce/current/sl-2025-0440',
  ];
  for (const url of tries) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    // A bot check shows first on some visits; give it time to pass.
    for (let i = 0; i < 20 && /Just a moment|Enable JavaScript/i.test(await page.title() + await page.textContent('body').catch(() => '')); i += 1) await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    const text = await page.evaluate(() => document.body.innerText);
    console.log(`NSW ${url}: ${text.length} characters, starts: ${text.slice(0, 200).replace(/\s+/g, ' ')}`);
    if (text.length > 200000) return save('nswReg', 'Work Health and Safety Regulation 2025 (NSW), current', url, text);
  }
  // AustLII publishes the consolidated NSW regulations too.
  for (const index of ['https://www.austlii.edu.au/cgi-bin/viewdb/au/legis/nsw/consol_reg/', 'https://classic.austlii.edu.au/au/legis/nsw/consol_reg/']) {
    try {
      await page.goto(index.includes('viewdb') ? `${index}toc-W.html` : `${index}toc-W.html`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      const link = await page.evaluate(() => [...document.querySelectorAll('a')].find((a) => /Work Health and Safety Regulation 2025/i.test(a.innerText)));
      const href = await page.evaluate(() => { const a = [...document.querySelectorAll('a')].find((el) => /Work Health and Safety Regulation 2025/i.test(el.innerText)); return a ? a.href : ''; });
      console.log(`AustLII ${index}: link ${href || 'not found'}${link ? '' : ''}`);
      if (!href) continue;
      await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 90000 });
      // The regulation's contents page links each section; read them all.
      const sections = await page.evaluate(() => [...document.querySelectorAll('a')].map((a) => a.href).filter((h) => /\/s\d+[a-z]*\.html$|\/sch\d+\.html$/i.test(h)));
      console.log(`AustLII sections linked: ${sections.length}`);
      let text = '';
      for (const url of [...new Set(sections)]) {
        const response = await page.request.get(url, { timeout: 60000 }).catch(() => null);
        if (!response || !response.ok()) continue;
        text += (await response.text()).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n') + '\n';
      }
      if (text.length > 200000) return save('nswReg', 'Work Health and Safety Regulation 2025 (NSW), AustLII consolidation', href, text);
    } catch (error) {
      console.log(`AustLII failed: ${error.message}`);
    }
  }
  // Fall back to the PDF the page offers.
  const pdfLink = await page.evaluate(() => [...document.querySelectorAll('a')].map((a) => a.href).find((href) => /pdf/i.test(href)));
  console.log(`NSW PDF link: ${pdfLink}`);
  if (pdfLink) {
    const response = await page.request.get(pdfLink, { timeout: 120000 });
    const buffer = await response.body();
    if (buffer.subarray(0, 4).toString() === '%PDF') save('nswReg', 'Work Health and Safety Regulation 2025 (NSW), current', pdfLink, pdfText(buffer));
  }
}

async function vic(browser) {
  const page = await browser.newPage();
  const url = 'https://www.legislation.vic.gov.au/in-force/statutory-rules/occupational-health-and-safety-regulations-2017';
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  const links = await page.evaluate(() => [...document.querySelectorAll('a')].map((a) => ({ href: a.href, text: a.innerText })));
  const pdf = links.find((link) => /\.pdf/i.test(link.href) && /authorised|pdf/i.test(link.href + link.text));
  console.log(`Vic links with pdf: ${links.filter((l) => /pdf/i.test(l.href)).slice(0, 8).map((l) => l.href).join(' ')}`);
  if (!pdf) return;
  const response = await page.request.get(pdf.href, { timeout: 120000 });
  save('vicReg', 'Occupational Health and Safety Regulations 2017 (Vic), current authorised version', pdf.href, pdfText(await response.body()));
}

async function wa() {
  const listing = 'https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s53267.html';
  const page = await (await fetch(listing, { signal: AbortSignal.timeout(60000) })).text();
  const at = page.indexOf("class='current'");
  const row = page.slice(at, at + 2000);
  const pdf = (row.match(/query=(mrdoc_\d+\.pdf)/) || [])[1];
  const htm = (row.match(/query=(mrdoc_\d+\.htm)/) || [])[1];
  console.log(`WA current row files: pdf ${pdf}, htm ${htm}`);
  if (pdf) {
    const url = `https://www.legislation.wa.gov.au/legislation/statutes.nsf/RedirectURL?OpenAgent&query=${pdf}`;
    const buffer = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(120000) })).arrayBuffer());
    if (buffer.subarray(0, 4).toString() === '%PDF') return save('waReg', 'Work Health and Safety (General) Regulations 2022 (WA), current', url, pdfText(buffer));
  }
  if (htm) {
    const url = `https://www.legislation.wa.gov.au/legislation/statutes.nsf/RedirectURL?OpenAgent&query=${htm}`;
    const html = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(120000) })).arrayBuffer()).toString('latin1');
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<\/(p|div|h\d|li|tr|br)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ');
    save('waReg', 'Work Health and Safety (General) Regulations 2022 (WA), current', url, text);
  }
}

(async () => {
  const browser = await chromium.launch();
  for (const [name, job] of [['WA', () => wa()], ['Vic', () => vic(browser)], ['NSW', () => nsw(browser)]]) {
    await job().catch((error) => console.log(`${name} failed: ${error.message}`));
  }
  await browser.close();
})();
