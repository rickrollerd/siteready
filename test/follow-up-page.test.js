// Goals 1, 2 and 7: a question that an answer brings in (Harness and anchors, once the fall control
// names a harness or the PPE ticks one; Life jackets; the transformer's oil) shows on the questions
// page straight away, and no answer is cleared by Continue or by a question coming or going. Run in
// a real browser (Playwright, installed globally); skipped where there is none.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const { app } = require('../server');
const { setupAccounts } = require('./helpers');

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
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  server.keepAliveTimeout = 60000;
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});

const skip = () => (browser ? false : 'no browser to drive (Playwright and Chromium are not installed)');

async function openTask(task, { phone = true } = {}) {
  const context = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/`);
  await page.waitForFunction(() => document.querySelectorAll('#states input').length > 0);
  await page.fill('#workplace', '1 Queen Street, Brisbane QLD 4000');
  await page.keyboard.press('Escape');
  await page.fill('#task', task);
  await page.check('input[name="fallRisk"][value="yes"]');
  await page.click('#continue');
  await page.waitForSelector('#facts:not(.hidden)');
  return { page, context, errors };
}

// The answers on the page, by question, and the site answers.
const answers = (page) => page.$$eval('#required-block [data-fact]', (els) => {
  const out = {};
  els.forEach((el) => { if (el.type !== 'radio') out[el.dataset.fact] = el.value; else if (el.checked) out[el.dataset.fact] = el.value; });
  return out;
});
const siteAnswers = (page) => page.$$eval('[data-site]', (els) => Object.fromEntries(els.map((el) => [el.dataset.site, el.value])));
const asked = (page, id) => page.$(`#required-block [data-q="${id}"]`).then(Boolean);

async function addStep(page, words, label) {
  await page.fill('#step-search', words);
  await page.waitForFunction((name) => [...document.querySelectorAll('#step-add option')].some((option) => option.textContent.startsWith(name)), label);
  const value = await page.$$eval('#step-add option', (options, name) => options.find((option) => option.textContent.startsWith(name)).value, label);
  await page.selectOption('#step-add', value);
}

test('choosing an EWP and a fall control that names a harness brings Harness and anchors at once, and Continue keeps every answer', { timeout: 120000 }, async (t) => {
  if (skip()) return t.skip(skip());
  const { page, context, errors } = await openTask('Intumescent fire spray to the steel beams');
  await addStep(page, 'spray', 'Spray painting');
  await page.waitForSelector('#required-block [data-fact="fallAccess"]');
  assert.equal(await asked(page, 'harnessSystem'), false, 'not asked before the answers');
  await page.check('#required-block input[data-fact="fallAccess"][value="ewp"]');
  await page.click('[data-pick-for="fallControl"]:has-text("Boom lifts")');
  // Shown without pressing Continue.
  await page.waitForSelector('#fact-harnessSystem');
  await page.fill('#fact-controlsConsidered', 'A scaffold was considered but the floor below stays in use, so boom lifts are used.');
  await page.fill('#fact-safetyDataSheet', 'Intumescent coating, safety data sheet at the work area, used with ventilation and away from ignition sources.');
  await page.fill('#fact-harnessSystem', 'Full body harness and short lanyard clipped to the basket anchor, inspected every 6 months by the hire company, users trained by the hire company, rescue by lowering the basket from the ground controls.');
  for (const id of ['liveServices', 'publicInterface', 'otherTrades', 'ground']) await page.fill(`#site-${id}`, 'None');
  await page.fill('#site-access', 'Boom lift from the loading dock');
  const given = await answers(page);
  const site = await siteAnswers(page);
  assert.equal(given.fallAccess, 'ewp');
  assert.match(given.fallControl, /harnesses/);
  // Continue again: nothing is cleared.
  await page.click('#continue');
  await page.waitForTimeout(800);
  assert.deepEqual(await answers(page), given);
  assert.deepEqual(await siteAnswers(page), site);
  await page.click('#prepare');
  await page.waitForFunction(() => { const r = document.getElementById('result'); return r && !r.classList.contains('hidden') && r.innerText.length > 50; });
  const result = await page.innerText('#result');
  assert.doesNotMatch(result, /Stood down/, result.slice(0, 400));
  assert.match(result, /Use an elevating work platform/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a harness typed in the fall control asks about it once the typing pauses; taking the word out takes the question away and its answer comes back with it', { timeout: 120000 }, async (t) => {
  if (skip()) return t.skip(skip());
  const { page, context, errors } = await openTask('Install the steel handrail at the slab edge on level 3', { phone: false });
  await page.waitForSelector('#fact-fallControl');
  await page.click('#fact-fallControl');
  await page.keyboard.type('Workers wear harnesses on a static line along the slab edge.');
  await page.waitForSelector('#fact-harnessSystem');
  // The box being typed in keeps the cursor.
  assert.equal(await page.evaluate(() => document.activeElement.id), 'fact-fallControl');
  await page.fill('#fact-harnessSystem', 'Harness anchors rated 15 kN by the engineer.');
  await page.fill('#fact-fallControl', 'Edge protection is fixed at every open edge before work starts.');
  await page.dispatchEvent('#fact-fallControl', 'change');
  await page.waitForSelector('#fact-harnessSystem', { state: 'detached' });
  await page.fill('#fact-fallControl', 'Travel restraint harnesses on the static line.');
  await page.dispatchEvent('#fact-fallControl', 'change');
  await page.waitForSelector('#fact-harnessSystem');
  assert.equal(await page.inputValue('#fact-harnessSystem'), 'Harness anchors rated 15 kN by the engineer.');
  assert.deepEqual(errors, []);
  await context.close();
});

test('ticking a life jacket asks about it, with the answers given kept; a new task from the pick list starts blank', { timeout: 120000 }, async (t) => {
  if (skip()) return t.skip(skip());
  const { page, context, errors } = await openTask('Paint the handrails on the jetty over the river.');
  await page.waitForSelector('#required-block [data-fact]');
  const first = await page.$eval('#required-block textarea[data-fact]', (el) => el.dataset.fact);
  await page.fill(`#fact-${first}`, 'Answered before the PPE changed.');
  const jacket = '[data-ppe][value="lifeJacket"]';
  if (await page.isChecked(jacket)) {
    await page.uncheck(jacket);
    await page.waitForSelector('#fact-lifeJacketDetails', { state: 'detached' });
  }
  await page.check(jacket);
  await page.waitForSelector('#fact-lifeJacketDetails');
  assert.equal(await page.inputValue(`#fact-${first}`), 'Answered before the PPE changed.');
  // A different task from the pick list is a new SWMS: its questions start blank.
  await page.selectOption('#trade', { index: 1 });
  await page.waitForFunction(() => !document.getElementById('preset').disabled);
  page.once('dialog', (dialog) => dialog.accept());
  await page.selectOption('#preset', { index: 1 });
  await page.check('input[name="fallRisk"][value="yes"]');
  await page.click('#continue');
  await page.waitForTimeout(800);
  const values = Object.values(await answers(page)).filter((value) => value && !/^[a-z]+$/i.test(value));
  assert.ok(!values.includes('Answered before the PPE changed.'), 'the last task\'s answer is not carried over');
  assert.deepEqual(errors, []);
  await context.close();
});

test('the transformer\'s oil is asked as soon as the pole is said to have a transformer', { timeout: 120000 }, async (t) => {
  if (skip()) return t.skip(skip());
  const { page, context, errors } = await openTask('Remove temporary 11kV poles and transformers.');
  await page.waitForSelector('#required-block [data-fact="poleTransformer"]', { state: 'attached' });
  assert.equal(await page.isVisible('fieldset[data-show-if="poleTransformer"]'), false);
  await page.check('#required-block input[data-fact="poleTransformer"][value="yes"]');
  await page.waitForSelector('fieldset[data-show-if="poleTransformer"]', { state: 'visible' });
  assert.deepEqual(errors, []);
  await context.close();
});

test('when changing the steps ticks a harness in the PPE, Harness and anchors is asked too', { timeout: 120000 }, async (t) => {
  if (skip()) return t.skip(skip());
  const { page, context, errors } = await openTask('Intumescent fire spray to the steel beams');
  await addStep(page, 'spray', 'Spray painting');
  await page.waitForSelector('#fact-fallControl');
  // An EWP of no stated type may be a boom lift, so SiteReady suggests a harness once it asks again.
  await page.fill('#fact-fallControl', 'Work is done from an EWP with guardrails.');
  await page.dispatchEvent('#fact-fallControl', 'change');
  await page.waitForTimeout(500);
  assert.equal(await page.isChecked('[data-ppe][value="harness"]'), false);
  assert.equal(await asked(page, 'harnessSystem'), false);
  await addStep(page, 'power tools', 'Use power tools');
  await page.waitForFunction(() => document.querySelector('[data-ppe][value="harness"]:checked'));
  await page.waitForSelector('#fact-harnessSystem');
  assert.equal(await page.inputValue('#fact-fallControl'), 'Work is done from an EWP with guardrails.');
  assert.deepEqual(errors, []);
  await context.close();
});
