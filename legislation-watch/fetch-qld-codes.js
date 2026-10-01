// Tries to read Queensland's approved codes of practice from WorkSafe Queensland
// with a real browser, and writes each as text to qld-codes/, so SiteReady's
// code references can be checked against the Queensland versions.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = 'qld-codes';
const WANT = [/falls/i, /construction/i, /hazardous manual/i, /noise/i, /hazardous chemicals/i, /confined spaces/i, /excavation/i, /plant/i, /welding/i, /electrical/i,
  /concrete pumping/i, /formwork/i, /demolition/i, /tilt-up/i, /crane/i, /traffic/i, /asbestos/i, /manage work health/i, /spray painting/i, /work environment/i, /first aid/i];

// The site answers a plain request with a check page, so the PDF is opened in
// the browser itself, which keeps the cookies from the index page.
async function getPdf(page, href) {
  const direct = await page.request.get(href, { timeout: 120000 }).catch(() => null);
  if (direct) {
    const body = await direct.body();
    if (body.subarray(0, 4).toString() === '%PDF') return body;
    console.log(`Plain request gave ${direct.status()} ${direct.headers()['content-type']}: ${body.subarray(0, 120).toString().replace(/\s+/g, ' ')}`);
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60000 }),
        page.goto(href, { timeout: 60000 }).catch(() => null),
      ]);
      const file = await download.path();
      const body = fs.readFileSync(file);
      if (body.subarray(0, 4).toString() === '%PDF') return body;
    } catch (error) {
      console.log(`Browser attempt ${attempt + 1} failed for ${href}: ${error.message.split('\n')[0]} (title: ${await page.title().catch(() => '')})`);
      await page.waitForTimeout(5000);
    }
  }
  return null;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' });
  const index = 'https://www.worksafe.qld.gov.au/laws-and-compliance/codes-of-practice';
  try {
    await page.goto(index, { waitUntil: 'domcontentloaded', timeout: 90000 });
    for (let i = 0; i < 15 && /verif|moment|denied/i.test(await page.title()); i += 1) await page.waitForTimeout(3000);
    console.log(`Index title: ${await page.title()}`);
    const links = await page.evaluate(() => [...document.querySelectorAll('a')].map((a) => ({ href: a.href, text: a.innerText.trim() })));
    const pdfs = links.filter((link) => /\.pdf/i.test(link.href) && /code/i.test(link.href + link.text));
    console.log(`PDF links: ${pdfs.length}\n${pdfs.map((l) => `${l.text} | ${l.href}`).join('\n')}`);
    for (const link of pdfs.filter((l) => WANT.some((w) => w.test(l.text + l.href)))) {
      const buffer = await getPdf(page, link.href);
      if (!buffer) continue;
      const file = path.join(OUT, 'tmp.pdf');
      fs.writeFileSync(file, buffer);
      const text = execFileSync('pdftotext', ['-layout', file, '-'], { maxBuffer: 256 * 1024 * 1024 }).toString();
      const name = link.href.split('/').pop().replace(/\.pdf.*$/i, '').replace(/[^A-Za-z0-9-]+/g, '-').slice(0, 80);
      fs.writeFileSync(path.join(OUT, `${name}.txt`), `${link.text}\n${link.href}\n\n${text}`);
      console.log(`Saved ${name}: ${text.length} characters`);
    }
    if (fs.existsSync(path.join(OUT, 'tmp.pdf'))) fs.unlinkSync(path.join(OUT, 'tmp.pdf'));
  } catch (error) {
    console.log(`Failed: ${error.message}`);
  }
  await browser.close();
})();
