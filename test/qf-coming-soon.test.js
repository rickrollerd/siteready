// The QuantityForge tab sits beside SiteLink on every page with the tabs, and says "Coming soon"
// until the server has QuantityForge switched on (qf-tab.js then shows what it does).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const read = (name) => fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');
const TAB = /<a href="\/quantityforge" id="qf-tab">QuantityForge<span id="qf-tab-note">Coming soon<\/span><\/a>/;

for (const page of ['index.html', 'hse.html', 'welcome.html']) {
  test(`${page} shows the QuantityForge tab after SiteLink, marked as coming soon`, () => {
    const html = read(page);
    assert.match(html, TAB);
    assert.doesNotMatch(html, /id="qf-tab"[^>]*hidden/);
    assert.ok(html.indexOf('href="/sitelink"') < html.indexOf('id="qf-tab"'), 'the tab comes after SiteLink');
    assert.match(html, /<script src="\/qf-tab\.js"><\/script>/);
  });
}

test('the tab says what QuantityForge does once the server has it switched on', () => {
  const js = read('qf-tab.js');
  assert.match(js, /qf-tab-note/);
  assert.match(js, /Quantities from drawings/);
  assert.doesNotMatch(js, /tab\.hidden/);
});

test('the QuantityForge page says it is coming soon while it is switched off', () => {
  const html = read('qf.html');
  assert.match(html, /<div id="view-off" class="panel hidden"><p><strong>Coming soon\.<\/strong>/);
});
