// Messy round 8, SiteLink stuck point 2: a worker reads the sign-on page on a phone with real touch
// scrolling. A long step partly on screen counts for its share of the screen (it counted for nothing,
// and the count stopped at "Read 4 of 12"), the form opens once every section is read at a reading pace,
// and "My supervisor has explained it to me" opens it with no reading at all. Run in a real browser
// (Playwright, installed globally), with the SWMS given by a stand-in for the server's answer; skipped
// where there is no browser.
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
  sections: [{ id: 'risks', label: 'High risk work', minSeconds: 2 }, { id: 'step-1', label: 'Step 1', minSeconds: 4 }, { id: 'ppe', label: 'PPE to wear', minSeconds: 2 }],
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

test('a long step partly on screen counts for its share, and touch scrolling at a reading pace opens the form', async (t) => {
  if (skip()) return t.skip(skip());
  const { context, page, errors, swipe } = await phone();
  try {
    const height = await page.evaluate(() => document.getElementById('sec-step-1').getBoundingClientRect().height);
    assert.ok(height > 2 * 844, `the step is long (${height} px)`);
    // Swiped until the step's top sits at 60% of the screen: 40% of the screen, under half the step.
    for (let i = 0; i < 20; i += 1) {
      const top = await page.evaluate(() => document.getElementById('sec-step-1').getBoundingClientRect().top);
      if (top < 844 * 0.7) break;
      await swipe(Math.min(300, top - 844 * 0.6));
    }
    const shown = await page.evaluate(() => { const box = document.getElementById('sec-step-1').getBoundingClientRect(); return Math.min(box.bottom, innerHeight) - Math.max(box.top, 0); });
    assert.ok(shown > 0 && shown < 0.6 * 844 && shown < height / 2, `partly on screen (${shown} px)`);
    await page.waitForTimeout(6000);
    const kept = await page.evaluate(() => JSON.parse(Object.entries(localStorage).find(([key]) => /sign/i.test(key))[1]).seconds || {});
    assert.ok(kept['step-1'] > 0.5, `time counted for the step while partly on screen: ${JSON.stringify(kept)}`);
    // Read on at a pace, with a swipe every few seconds, to the end: the form opens.
    for (let i = 0; i < 40 && await page.evaluate(() => document.getElementById('locked').disabled); i += 1) {
      await page.waitForTimeout(1500);
      await swipe(400);
    }
    assert.equal(await page.evaluate(() => document.getElementById('locked').disabled), false, await page.locator('#progress').innerText());
    assert.match(await page.locator('#progress').innerText(), /You have read the SWMS/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test('"My supervisor has explained it to me" is at the top, never greyed, and opens the form with no reading', async (t) => {
  if (skip()) return t.skip(skip());
  const { context, page, errors } = await phone();
  try {
    assert.equal(await page.evaluate(() => document.getElementById('locked').disabled), true);
    // The bar under the thumb says what to do, and goes to it.
    assert.match(await page.locator('#progress').innerText(), /Cannot read it\? Your supervisor can explain it\./);
    const top = await page.locator('#explained-go').boundingBox();
    assert.ok(top && top.y < 844, 'in view as the page opens');
    await page.tap('#explained-go');
    await page.waitForTimeout(500);
    assert.equal(await page.isChecked('#explained'), true);
    assert.equal(await page.evaluate(() => document.getElementById('locked').disabled), false, 'the form opens');
    assert.equal(await page.isVisible('#supervisor'), true);
    assert.match(await page.locator('#progress').innerText(), /Your supervisor has explained the SWMS\. Sign on below\./);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
