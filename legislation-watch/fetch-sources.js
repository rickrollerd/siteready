// Tries to read second sources for a provision from GitHub's servers and prints
// what each one says, so the text can be saved and compared.
//
//   node legislation-watch/fetch-sources.js

const { execFileSync } = require('child_process');
const fs = require('fs');

const URLS = [
  'https://www.worksafe.vic.gov.au/safe-work-method-statements-swms',
  'https://content-v2.api.worksafe.vic.gov.au/sites/default/files/2022-03/ISBN-Safe-work-method-statements-2022-03.pdf',
];

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
