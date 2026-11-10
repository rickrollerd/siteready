// Every public page names its icon, so browsers do not ask for a missing /favicon.ico (a 404 in
// the console), and the sign-on page does not call the API when its link has no token.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'public');

test('every public HTML page links an icon', () => {
  const pages = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
  assert.ok(pages.length > 5);
  for (const page of pages) {
    const html = fs.readFileSync(path.join(dir, page), 'utf8');
    assert.match(html, /<link rel="icon" href="\/icon-48\.svg"/, `${page} has no icon link`);
  }
});

test('sign.js does not fetch when the link has no token', () => {
  const js = fs.readFileSync(path.join(dir, 'sign.js'), 'utf8');
  const load = js.slice(js.indexOf('async function load()'));
  assert.ok(load.indexOf('if (!token) throw') > -1);
  assert.ok(load.indexOf('if (!token) throw') < load.indexOf('await fetch('));
});
