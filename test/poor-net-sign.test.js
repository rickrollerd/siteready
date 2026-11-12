// Poor site networks at 390 px (D366): worker sign-on under a lost connection mid-submit, a
// double press, and a reload mid-flow. Skipped where there is no browser.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_AUTH_VERIFY_REQUESTS = '1000';
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
  const launch = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  if (require('fs').existsSync('/usr/bin/google-chrome')) launch.executablePath = '/usr/bin/google-chrome';
  try {
    browser = await chromium.launch(launch);
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

const SWMS = {
  title: 'Fence repair', company: 'Example Build Pty Ltd', workplace: '1 Example Street, Brisbane QLD 4000',
  revision: 'Revision 1', checkedBy: '', readId: 'read-poor-net', languages: [], questions: [],
  highRisk: [], jobSteps: [{ step: 'Repair the fence', hazards: ['Manual handling.'], controls: ['Use two people to lift panels.'] }],
  ppe: ['Safety boots'],
  sections: [{ id: 'step-1', label: 'Step 1', minSeconds: 2 }, { id: 'ppe', label: 'PPE to wear', minSeconds: 2 }],
};

async function phone() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const posts = [];
  let holdPost = null;
  const ok = { status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'You have signed on to this SWMS.' }) };
  await page.route('**/api/sign/**', async (route) => {
    if (route.request().method() === 'POST') {
      posts.push(route.request().postData() || '');
      if (holdPost && posts.length === 1) {
        if (holdPost.status === 'hang') {
          await holdPost.promise;
          return;
        }
        await holdPost.promise;
        return route.fulfill({ status: holdPost.status, contentType: 'application/json', body: JSON.stringify(holdPost.body) });
      }
      return route.fulfill(ok);
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SWMS) });
  });
  await page.goto(`${base}/sign.html?t=poor-net-token`);
  await page.waitForSelector('#explained-go');
  return { context, page, posts, hold: (status, body) => {
    let release;
    const promise = new Promise((resolve) => { release = resolve; });
    holdPost = { promise, status, body, release };
    return () => { holdPost.release(); };
  } };
}

async function fillSignOn(page) {
  await page.locator('#explained-go').click();
  await page.waitForFunction(() => !document.getElementById('locked').disabled);
  await page.locator('#supervisor').fill('Alex Chen');
  await page.locator('#name').fill('Sam Lee');
  await page.locator('#company').fill('Example Crew');
  await page.evaluate(() => {
    const pad = document.getElementById('pad');
    const box = pad.getBoundingClientRect();
    const fire = (type, x, y) => pad.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch',
      clientX: box.left + x, clientY: box.top + y, buttons: 1,
    }));
    fire('pointerdown', 20, 20);
    fire('pointermove', 90, 50);
    fire('pointerup', 90, 50);
  });
  await page.locator('#confirmed').check();
}

test('a reload mid-flow keeps the name and company the worker had typed', async (t) => {
  if (skip()) return t.skip(skip());
  const { context, page } = await phone();
  try {
    await fillSignOn(page);
    await page.waitForTimeout(600);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#name');
    assert.equal(await page.locator('#name').inputValue(), 'Sam Lee');
    assert.equal(await page.locator('#company').inputValue(), 'Example Crew');
    assert.equal(await page.locator('#supervisor').inputValue(), 'Alex Chen');
  } finally {
    await context.close();
  }
});

test('a double press of Sign on sends the sign-on only once', async (t) => {
  if (skip()) return t.skip(skip());
  const { context, page, posts, hold } = await phone();
  try {
    await fillSignOn(page);
    const release = hold(200, { message: 'You have signed on to this SWMS.' });
    await page.locator('#submit').click();
    await page.waitForFunction(() => document.getElementById('submit').disabled);
    assert.equal(posts.length, 1, 'the first press is on its way');
    await page.locator('#submit').click({ force: true });
    await page.evaluate(() => document.getElementById('sign-form').requestSubmit());
    assert.equal(posts.length, 1, 'the second press is ignored while the first is on its way');
    release();
    await page.waitForSelector('#done:not(.hidden)');
    assert.equal(posts.length, 1);
    assert.match(await page.locator('#done').innerText(), /signed on/i);
  } finally {
    await context.close();
  }
});

test('going offline mid-submit shows Try again, and the sign-on is saved once signal is back', async (t) => {
  if (skip()) return t.skip(skip());
  const { context, page, posts, hold } = await phone();
  try {
    await fillSignOn(page);
    hold('hang');
    await page.locator('#submit').click();
    await page.waitForFunction(() => document.getElementById('submit').disabled);
    await context.setOffline(true);
    await page.waitForSelector('.net-bar', { timeout: 8000 });
    assert.match(await page.locator('.net-bar').innerText(), /No signal/);
    assert.equal(await page.locator('#done').isVisible(), false);
    await context.setOffline(false);
    await page.waitForSelector('#done:not(.hidden)', { timeout: 10000 });
    assert.match(await page.locator('#done').innerText(), /signed on/i);
    assert.ok(posts.length >= 1, 'the sign-on is sent when signal is back');
  } finally {
    await context.close();
  }
});
