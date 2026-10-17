// Messy round 9, SiteLink stuck point 1: a worker who swipes past sections faster than they count is told
// so on the bar, with where to go back to. The time each section needs is unchanged (sl8 decision 1).
const test = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const { app } = require('../server');

let chromium = null;
try {
  chromium = require(`${execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()}/playwright`).chromium;
} catch {
  chromium = null;
}

let server;
let base;
let browser;
test.before(async () => {
  if (!chromium) return;
  try {
    browser = await chromium.launch();
  } catch {
    browser = null;
    return;
  }
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});
const skip = () => (browser ? false : 'no browser to drive (Playwright and Chromium are not installed)');

// A SWMS with one long step (about three phone screens) between two short sections.
const line = (n) => `Control line ${n}: the crew keeps the exclusion zone in place, checks the barriers each hour and stops work if anyone enters it.`;
const SWMS = {
  title: 'Testing and commissioning', company: 'Wallaroo Bend Electrical Pty Ltd', workplace: '22 Sunshine Beach Road, Noosa Heads QLD 4567', revision: 'Revision 2', checkedBy: '',
  readId: 'read-1', languages: [], questions: [],
  highRisk: ['Work on or near energised electrical installations or services'],
  jobSteps: [{ step: 'Test the circuits', hazards: ['Electric shock from energised parts.'], controls: Array.from({ length: 40 }, (_, i) => line(i + 1)) }],
  ppe: ['Hard hat', 'Safety boots'],
  sections: [{ id: 'risks', label: 'High risk work', minSeconds: 20 }, { id: 'step-1', label: 'Step 1: Test the circuits', minSeconds: 40 }, { id: 'ppe', label: 'PPE to wear', minSeconds: 20 }],
};

async function phone() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/sign/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SWMS) }));
  await page.goto(`${base}/sign.html?t=touch-test-token`);
  await page.waitForSelector('#sec-step-1');
  const cdp = await context.newCDPSession(page);
  // A finger swipe up the screen: touch start, moves, end.
  const swipe = async (distance) => {
    const from = 700;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: from }] });
    for (let i = 1; i <= 10; i += 1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: from - (distance * i) / 10 }] });
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(600);
  };
  return { context, page, errors, swipe };
}
test('sections swiped past too fast are named on the bar, with where to go back to', async (t) => {
  if (skip()) return t.skip(skip());
  const { context, page, errors, swipe } = await phone();
  try {
    assert.match(await page.locator('#progress').innerText(), /Read 0 of 3 sections\. Take your time with each one\. Each counts once it has a tick\./);
    // Skimmed to the end in a few seconds.
    for (let i = 0; i < 12; i += 1) await swipe(600);
    await page.waitForTimeout(800);
    const said = await page.locator('#progress').innerText();
    assert.match(said, /Read 0 of 3 sections\. Slow down: (?:2|3) sections went by too fast to count\. Go back up to "High risk work" and read on\. Each counts once it has a tick\./);
    assert.equal(await page.evaluate(() => document.getElementById('locked').disabled), true, 'the pace rule is unchanged');
    // Back at the top, the note goes.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
    assert.doesNotMatch(await page.locator('#progress').innerText(), /Slow down/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
