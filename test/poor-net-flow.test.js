// Poor site networks (D366): a sign-on or SWMS submit already on its way is not started twice,
// and a lost connection mid-request is cut so the page can say to try again.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');

test('the sign-on form starts only one submit at a time', () => {
  const src = read('sign.js');
  assert.match(src, /let sending = false;/);
  assert.match(src, /if \(sending \|\| finished\) return;/);
  assert.match(src, /sending = true;/);
});

test('Prepare the statement waits for one already on its way, so a double press cannot leave the button stuck', () => {
  const src = read('app.js');
  assert.match(src, /let preparing = null;/);
  assert.match(src, /let prepareAgain = null;/);
  assert.match(src, /if \(preparing\) \{\s*prepareAgain = \{ scroll, keep \};\s*return preparing;/);
  assert.match(src, /preparing = runPrepareDrafts/);
});

test('Continue stays busy until the questions are back, so a double press is ignored', () => {
  const src = read('app.js');
  assert.match(src, /if \(continueBtn && continueBtn\.disabled\) return;/);
  assert.match(src, /continueBtn\.disabled = true;/);
  assert.match(src, /\.finally\(\(\) => \{ if \(continueBtn\) continueBtn\.disabled = false; \}\)/);
});

test('net.js still loads before sign.js, with the no-signal wording for a kept sign-on', () => {
  const html = read('sign.html');
  const order = ['/net.js', '/sign-keep.js', '/sign.js'].map((src) => html.indexOf(`<script src="${src}"`));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])));
  assert.match(html, /data-message="No signal\. What you have read and typed is kept on this phone\./);
});
