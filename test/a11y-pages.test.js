// Accessibility pass (D363): landmarks, the task picker's name, and state-tag contrast.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('../server');

const publicDir = path.join(__dirname, '..', 'public');
const page = (name) => fs.readFileSync(path.join(publicDir, name), 'utf8');

const PAGES = [
  ['index.html', '/'],
  ['welcome.html', '/welcome.html'],
  ['hse.html', '/sitelink'],
  ['check.html', '/check.html'],
];

function contrast(fg, bg) {
  const lum = (hex) => {
    const n = hex.replace('#', '');
    const to = (h) => {
      const c = parseInt(h, 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const r = to(n.slice(0, 2)); const g = to(n.slice(2, 4)); const b = to(n.slice(4, 6));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => x - y);
  return (b + 0.05) / (a + 0.05);
}

test('the public pages have a skip link and one main landmark', () => {
  for (const [name] of PAGES) {
    const html = page(name);
    assert.match(html, /<a class="skip" href="#main">Skip to the main content<\/a>/, name);
    assert.equal((html.match(/<main id="main">/g) || []).length, 1, `${name} one main`);
    assert.equal((html.match(/<\/main>/g) || []).length, 1, `${name} main closed`);
    // The skip link is the first thing in the body, so keyboard users reach it first.
    const body = html.slice(html.indexOf('<body>'));
    assert.match(body, /^<body>\s*<a class="skip" href="#main">/, name);
  }
});

test('the task picker on the app page has an accessible name', () => {
  const html = page('index.html');
  assert.match(html, /<label class="visually-hidden" for="preset">Choose a task<\/label>/);
  assert.match(html, /<select id="preset"/);
});

test('state tags on the app page meet AA contrast on white', () => {
  const html = page('index.html');
  const tag = html.match(/\.tag \{[^}]*color: (#[0-9a-fA-F]{6})/);
  assert.ok(tag, 'tag colour is set');
  assert.ok(contrast(tag[1], '#ffffff') >= 4.5, `${tag[1]} on white is ${contrast(tag[1], '#ffffff').toFixed(2)}`);
  const disabled = html.match(/\.state\.disabled \{[^}]*color: (#[0-9a-fA-F]{6})/);
  assert.ok(disabled, 'disabled state colour is set');
  assert.ok(contrast(disabled[1], '#f7f8fa') >= 4.5, `${disabled[1]} on #f7f8fa is ${contrast(disabled[1], '#f7f8fa').toFixed(2)}`);
});

test('the pages with skip links are served with the same markup', async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [name, route] of PAGES) {
      const res = await fetch(`${base}${route}`);
      assert.equal(res.status, 200, route);
      const html = await res.text();
      assert.match(html, /<a class="skip" href="#main">Skip to the main content<\/a>/, route);
      assert.match(html, /<main id="main">/, route);
      assert.equal(html.includes(page(name).match(/<title>[^<]+<\/title>/)[0]), true, route);
    }
  } finally {
    server.close();
  }
});
