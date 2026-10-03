// Fetches a PDF that sits behind a bot check, with a real browser, and saves its text.
//
//   URL=... NAME=... OUT=guidance-sources/x.txt node legislation-watch/fetch-browser.js

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  let body = null;
  page.on('response', async (response) => {
    if (/application\/pdf/i.test(response.headers()['content-type'] || '')) body = await response.body().catch(() => null);
  });
  const download = page.waitForEvent('download', { timeout: 90000 }).catch(() => null);
  await page.goto(process.env.URL, { waitUntil: 'networkidle', timeout: 90000 }).catch((error) => console.log(`goto: ${error.message.split('\n')[0]}`));
  for (let i = 0; i < 15 && !body; i += 1) await page.waitForTimeout(2000);
  if (!body) {
    const file = await download;
    if (file) body = fs.readFileSync(await file.path());
  }
  await browser.close();
  if (!body || body.subarray(0, 4).toString() !== '%PDF') {
    console.log(`${process.env.NAME}: no PDF (${body ? body.subarray(0, 60).toString() : 'nothing'})`);
    return;
  }
  const tmp = path.join(require('os').tmpdir(), 'b.pdf');
  fs.writeFileSync(tmp, body);
  const text = execFileSync('pdftotext', ['-layout', tmp, '-'], { maxBuffer: 128 * 1024 * 1024 }).toString();
  fs.mkdirSync(path.dirname(process.env.OUT), { recursive: true });
  fs.writeFileSync(process.env.OUT, `${process.env.NAME}\n${process.env.URL}\n\n${text}`);
  console.log(`${process.env.NAME}: ${text.length} characters`);
})();
