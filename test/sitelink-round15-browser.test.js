// Messy round 15, SiteLink stuck point 2, in a real browser: a SWMS of a project opened to check asks its
// questions before their boxes are drawn. It is asked with its own answers, not none: asked with no site answers,
// the suggested PPE ticked a harness for the EWP step, and three SWMS prepared on the project page opened "This
// SWMS is not finished. Harness and anchors: Not answered yet".
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

test('a SWMS put back into the form asks its first questions with its own answers (stuck point 2)', async (t) => {
  if (skip()) return t.skip(skip());
  const page = await browser.newPage();
  await page.goto(`${base}/`);
  const sent = await page.evaluate(() => {
    // As the project page opens a prepared SWMS (scope.js openItem, app.js fillForm): the form is emptied for it,
    // and its questions are asked before their boxes are drawn.
    fillStart({ task: 'Test and commission the switchboards from an EWP.', facts: { fallControl: 'Work above 2 m is done from a scissor lift with its guardrails closed.' }, site: { access: 'Stairs and the builder\'s hoist. Scissor lift on the slab.', ground: '' } });
    const asked = payload();
    return { facts: asked.facts, site: asked.site };
  });
  assert.equal(sent.facts.fallControl, 'Work above 2 m is done from a scissor lift with its guardrails closed.');
  assert.deepEqual(sent.site, { access: 'Stairs and the builder\'s hoist. Scissor lift on the slab.' });
  // Once its boxes are drawn, what is in them is what is sent, as before.
  const shown = await page.evaluate(() => {
    document.getElementById('site-block').innerHTML = '<textarea data-site="access">Through the main gate.</textarea>';
    return payload().site;
  });
  assert.deepEqual(shown, { access: 'Through the main gate.' });
  await page.close();
});
