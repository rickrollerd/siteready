// Review finding 2: the "Your trade" select must not overflow a 390 px phone screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('../server');

test('index.html gives #your-trade a 100% width that cannot overflow', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /#your-trade\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;/);
});

let chromium = null;
try {
  chromium = require(`${execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()}/playwright`).chromium;
} catch {
  chromium = null;
}

test('the home page does not scroll sideways at 390 px', async (t) => {
  if (!chromium) { t.skip('Playwright is not installed'); return; }
  let browser;
  try {
    browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  } catch {
    try {
      browser = await chromium.launch();
    } catch {
      t.skip('Chromium is not available');
      return;
    }
  }
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    const measure = await page.evaluate(() => ({
      inner: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
      trade: (() => {
        const el = document.querySelector('#your-trade');
        if (!el) return null;
        const box = el.getBoundingClientRect();
        return { width: box.width, right: box.right };
      })(),
    }));
    assert.ok(measure.trade, 'the Your trade select is on the page');
    assert.ok(measure.trade.width <= 390, `select width ${measure.trade.width} should be at most 390`);
    assert.ok(measure.trade.right <= 390 + 1, `select right edge ${measure.trade.right} overflows 390`);
    assert.ok(measure.scroll <= measure.inner + 1, `page scrollWidth ${measure.scroll} exceeds innerWidth ${measure.inner}`);
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }
});
