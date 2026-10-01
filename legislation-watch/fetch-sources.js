// Tries to read second sources for a provision from GitHub's servers and prints
// what each one says, so the text can be saved and compared.
//
//   node legislation-watch/fetch-sources.js

const URLS = [
  'https://www.austlii.edu.au/cgi-bin/viewdoc/au/legis/vic/consol_reg/ohasr2017382/s322.html',
  'https://www.austlii.edu.au/au/legis/vic/consol_reg/ohasr2017382/s322.html',
  'https://www5.austlii.edu.au/au/legis/vic/consol_reg/ohasr2017382/s322.html',
  'https://www.worksafe.vic.gov.au/safe-work-method-statements',
  'https://www.worksafe.vic.gov.au/high-risk-construction-work',
  'https://www.worksafe.vic.gov.au/resources/safe-work-method-statement-swms-template',
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
      const body = text(await response.text());
      const at = body.search(/high risk construction work/i);
      console.log(`\n=== ${url}\nHTTP ${response.status}, ${body.length} characters`);
      if (response.ok) console.log(body.slice(Math.max(0, at - 200), at + 3500));
    } catch (error) {
      console.log(`\n=== ${url}\nFailed: ${error.message}`);
    }
  }
}

main();
