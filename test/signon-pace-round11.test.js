// Messy round 11, SiteLink stuck point 1: a worker reading at a fair pace (under 5 words a second over the
// SWMS, swiping at an even pace) was told "Slow down" at a long step with long control lines, though the
// steps before it had been read with time to spare. The section the worker is on now counts in full while
// any of it shows. Each section still needs about 5 words a second (sl8 decision 1), so skimming stays
// locked. The page's clock is run forward, so a reading of some minutes takes a moment.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const { app } = require('../server');
const signRead = require('../sign-read');

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

// Short steps with short lines, then one long step with long control lines (more words to the screen), as
// the round 11 Risers SWMS had. Made-up wording.
const short = (n) => `Check item ${n}.`;
const long = (n) => `Control line ${n}: the operator and the spotter agree who lowers the platform, who stops the plant and who calls for help, and the crew keeps the exclusion zone barricaded under the platform at all times.`;
const draft = {
  highRisk: ['Is carried out in an area at a workplace in which there is any movement of powered mobile plant'],
  jobSteps: [
    { step: 'Before starting', hazards: Array.from({ length: 12 }, (_, i) => short(i + 1)), controls: Array.from({ length: 12 }, (_, i) => short(i + 20)) },
    { step: 'Set out the work', hazards: Array.from({ length: 12 }, (_, i) => short(i + 40)), controls: Array.from({ length: 12 }, (_, i) => short(i + 60)) },
    { step: 'Use an elevating work platform', hazards: ['Fall from the platform.'], controls: Array.from({ length: 24 }, (_, i) => long(i + 1)) },
    { step: 'Finish and clean up', hazards: Array.from({ length: 8 }, (_, i) => short(i + 80)), controls: Array.from({ length: 8 }, (_, i) => short(i + 90)) },
  ],
  ppe: [],
};
const SWMS = {
  title: 'Risers and pipework at height', company: 'Galah & Gecko Plumbing Pty Ltd', workplace: '25 Grenfell St, Kent Town SA 5067', revision: 'Revision 1', checkedBy: '',
  readId: 'read-1', languages: [], questions: [], highRisk: draft.highRisk, jobSteps: draft.jobSteps, ppe: ['Hard hat'],
  sections: signRead.readSections(draft),
};
const words = [...draft.highRisk, ...draft.jobSteps.flatMap((step) => [step.step, ...step.hazards, ...step.controls]), 'Hard hat'].join(' ').split(/\s+/).length;

// Reads the SWMS with an even swipe of `px` every `seconds`, as a worker scrolling by touch, until the form
// opens or the bar says to slow down. Returns what the bar said and the pace over the SWMS.
async function read(px, seconds) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/sign/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SWMS) }));
  await page.clock.install();
  await page.goto(`${base}/sign.html?t=pace-test-token`);
  await page.waitForSelector('#sec-step-3');
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  let said = '';
  let time = 0;
  try {
    for (let n = 0; n < 200; n += 1) {
      await page.clock.runFor(seconds * 1000);
      time += seconds;
      said = (await page.locator('#progress').innerText()).replace(/\s+/g, ' ');
      if (/Slow down|You have read the SWMS/.test(said)) break;
      await page.evaluate((by) => window.scrollBy(0, by), px);
    }
    return { said, pace: words / time, perScreen: (words * px) / height / seconds, errors };
  } finally {
    await context.close();
  }
}

test('a worker reading at a fair, even pace is not told to slow down at a long step with long lines', async (t) => {
  if (skip()) return t.skip(skip());
  const fair = await read(350, 19);
  assert.match(fair.said, /You have read the SWMS/, fair.said);
  assert.ok(fair.pace < 5, `read at ${fair.pace.toFixed(1)} words a second`);
  assert.deepEqual(fair.errors, []);
});

test('reading faster than about 5 words a second, or skimming, is still told to slow down', async (t) => {
  if (skip()) return t.skip(skip());
  const fast = await read(700, 12);
  assert.match(fast.said, /Slow down: .* went by too fast to count\./, fast.said);
  const skim = await read(800, 3);
  assert.match(skim.said, /Slow down/, skim.said);
});
