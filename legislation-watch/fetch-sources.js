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
  const links = [...page.matchAll(/href="([^"]+)"/gi)]
    .map((match) => new URL(match[1].replace(/&amp;/g, '&'), WA_PAGE).href)
    .filter((link) => /01-c0-00|mrdoc|\.htm|\.pdf|\.docx?/i.test(link) && !/law_s53267/.test(link));
  console.log(`\n=== ${WA_PAGE}\nLinks: ${[...new Set(links)].join('\n')}`);
  const at = page.indexOf('01-c0-00');
  console.log(`Markup near the current version: ${page.slice(Math.max(0, at - 1500), at + 1500).replace(/\s+/g, ' ')}`);
  const pdf = links.find((link) => /01-c0-00/.test(link) && /\.pdf/i.test(link)) || links.find((link) => /01-c0-00/.test(link));
  if (!pdf) return;
  const response = await fetch(pdf, { signal: AbortSignal.timeout(60000) });
  const buffer = Buffer.from(await response.arrayBuffer());
  let body;
  if (buffer.slice(0, 4).toString() === '%PDF') {
    fs.writeFileSync('wa.pdf', buffer);
    body = execFileSync('pdftotext', ['-layout', 'wa.pdf', '-']).toString().replace(/[ \t]+/g, ' ');
  } else {
    body = text(buffer.toString('latin1'));
  }
  console.log(`PDF ${pdf}: HTTP ${response.status}`);
  console.log(body.slice(0, 400));
  for (const marker of [/291\.\s*Term used: high risk construction work/i, /high risk construction work means/i, /299\.\s*Safe work method statement required/i, /166\.\s*Duty of person conducting/i]) {
    const at = body.search(marker);
    console.log(`\n--- ${marker}\n${at < 0 ? 'not found' : body.slice(at, at + 3500)}`);
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

async function main() {
  await waCurrent().catch((error) => console.log(`WA failed: ${error.message}`));
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
