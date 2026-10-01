// Tries to read second sources for a provision from GitHub's servers and prints
// what each one says, so the text can be saved and compared.
//
//   node legislation-watch/fetch-sources.js

const { execFileSync } = require('child_process');
const fs = require('fs');

const URLS = [];

// The current Western Australian regulation: the page lists each version, and the
// row marked Current links to its PDF.
const WA_PAGE = 'https://www.legislation.wa.gov.au/legislation/statutes.nsf/law_s53267.html';

async function waCurrent() {
  const page = await (await fetch(WA_PAGE, { signal: AbortSignal.timeout(30000) })).text();
  // The row marked Current links to its files with single-quoted RedirectURL addresses.
  const row = page.slice(page.indexOf("class='current'"), page.indexOf("class='current'") + 1500);
  const html = (row.match(/query=(mrdoc_\d+\.htm)/) || [])[1];
  console.log(`\n=== ${WA_PAGE}\nCurrent version: ${text(row).slice(0, 80)} | HTML file: ${html}`);
  if (!html) return;
  const url = `https://www.legislation.wa.gov.au/legislation/statutes.nsf/RedirectURL?OpenAgent&query=${html}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  const body = text(Buffer.from(await response.arrayBuffer()).toString('latin1'));
  console.log(`${url}: HTTP ${response.status}, ${body.length} characters`);
  console.log(body.slice(0, 300));
  // The contents page lists each provision too, so the last occurrence is the provision itself.
  const provisions = ['299.Safe work method statement required', '302.Review of safe work method statement', '166A.Duty of person conducting a business or undertaking: overhead', '306A.Terms used', '306B.Regulator to be notified', '306G.Tilt', '306H.Documents required'];
  for (const name of provisions) {
    const flat = body.replace(/\s+\./g, '.');
    const at = flat.lastIndexOf(name);
    console.log(`\n--- ${name}\n${at < 0 ? 'not found' : flat.slice(at, at + 2600)}`);
  }
}

function text(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tasmania's current regulation, read whole from its official site.
const TAS_URL = 'https://www.legislation.tas.gov.au/view/whole/html/inforce/current/sr-2022-109';

async function tasCurrent() {
  const response = await fetch(TAS_URL, { signal: AbortSignal.timeout(60000) });
  const html = await response.text();
  const body = text(html);
  const versions = [...html.matchAll(/inforce\/(\d{4}-\d{2}-\d{2})\/sr-2022-109/g)].map((match) => match[1]);
  console.log(`\n=== ${TAS_URL}\nHTTP ${response.status}, ${body.length} characters. Version dates linked: ${[...new Set(versions)].join(', ')}`);
  console.log(body.slice(0, 600));
  const flat = body.replace(/\s+/g, ' ');
  for (const name of ['299. Safe work method statement required', '166. Duty of person conducting a business or undertaking']) {
    const at = flat.lastIndexOf(name);
    console.log(`\n--- ${name}\n${at < 0 ? 'not found' : flat.slice(at, at + 2200)}`);
  }
  console.log(`\nVersion dates linked: ${[...new Set(versions)].join(', ')}`);
}

// The Northern Territory and the ACT publish the current regulation as a PDF.
const PDF_SOURCES = [
  { name: 'Northern Territory', page: 'https://legislation.nt.gov.au/Legislation/WORK-HEALTH-AND-SAFETY-NATIONAL-UNIFORM-LEGISLATION-REGULATIONS-2011', pick: /PDFVersion/i },
  { name: 'Australian Capital Territory', page: 'https://www.legislation.act.gov.au/sl/2011-36/', direct: 'https://www.legislation.act.gov.au/View/sl/2011-36/current/PDF/2011-36.PDF' },
];

async function pdfSource(source) {
  let pdf = source.direct;
  if (!pdf) {
    const page = await (await fetch(source.page, { signal: AbortSignal.timeout(30000) })).text();
    const links = [...page.matchAll(/href=["']([^"']+)["']/gi)].map((match) => new URL(match[1].replace(/&amp;/g, '&'), source.page).href);
    pdf = links.find((link) => source.pick.test(link));
    console.log(`\n=== ${source.name}: ${source.page}\nPDF links: ${links.filter((link) => /pdf/i.test(link)).join(' ')}`);
  }
  if (!pdf) return;
  const response = await fetch(pdf, { signal: AbortSignal.timeout(60000) });
  const buffer = Buffer.from(await response.arrayBuffer());
  console.log(`\n=== ${source.name} PDF: ${pdf} HTTP ${response.status}, ${buffer.length} bytes, starts ${buffer.slice(0, 5).toString()}`);
  if (buffer.slice(0, 4).toString() !== '%PDF') return;
  fs.writeFileSync('source.pdf', buffer);
  const flat = execFileSync('pdftotext', ['source.pdf', '-']).toString().replace(/\s+/g, ' ');
  console.log(flat.slice(0, 700));
  for (const marker of [/high risk construction work means/g, /299\s*Safe work method statement required/g, /166\s*Duty of person conducting a business or undertaking/g]) {
    const all = [...flat.matchAll(marker)];
    const at = all.length ? all[all.length - 1].index : -1;
    console.log(`\n--- ${marker}\n${at < 0 ? 'not found' : flat.slice(at, at + 2600)}`);
  }
}

async function main() {
  for (const source of PDF_SOURCES) await pdfSource(source).catch((error) => console.log(`${source.name} failed: ${error.message}`));
  for (const url of URLS) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'SiteReady legislation cross-check (github.com/rickrollerd/siteready)' },
        signal: AbortSignal.timeout(30000),
      });
      let body;
      if (/\.pdf$/i.test(url)) {
        // PDFs are turned into text with pdftotext, which the GitHub runner provides.
        fs.writeFileSync('source.pdf', Buffer.from(await response.arrayBuffer()));
        body = execFileSync('pdftotext', ['-layout', 'source.pdf', '-']).toString().replace(/[ \t]+/g, ' ');
      } else {
        body = text(await response.text());
      }
      const at = body.search(/high risk construction work/i);
      console.log(`\n=== ${url}\nHTTP ${response.status}, ${body.length} characters`);
      if (response.ok) console.log(body.slice(Math.max(0, at - 300), at + 6000));
    } catch (error) {
      console.log(`\n=== ${url}\nFailed: ${error.message}`);
    }
  }
}

main();
