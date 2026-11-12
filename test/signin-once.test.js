// The main app sign-in form sends only one email link at a time (D367).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPage } = require('./fake-dom');

const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');

test('the sign-in form starts only one email request at a time', () => {
  const src = read('account.js');
  assert.match(src, /let sendingLink = false;/);
  assert.match(src, /if \(sendingLink\) return;/);
  assert.match(src, /sendingLink = true;/);
  assert.match(read('index.html'), /<button type="submit" id="signin-go">Email me a sign-in link<\/button>/);
});

test('a second press while a sign-in link is already being sent is ignored', async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const p = loadPage(['app.js', 'account.js'], async (method, route) => {
    if (method === 'POST' && String(route).endsWith('/api/auth/email')) {
      await held;
      return { body: { ok: true, message: 'If this email can be used to sign in, a link has been sent.' } };
    }
    return { body: {} };
  });
  p.document.getElementById('signin-email').value = 'sw-signin-once@siteready.test';
  const form = p.document.getElementById('signin-form');
  const button = p.document.getElementById('signin-go');
  form.requestSubmit();
  await settle();
  assert.equal(button.disabled, true, 'the button stays busy while the first request is on its way');
  form.requestSubmit();
  await settle();
  const posts = p.calls.filter((call) => call.method === 'POST' && String(call.route).endsWith('/api/auth/email'));
  assert.equal(posts.length, 1, 'the second press is ignored');
  assert.equal(posts[0].body.email, 'sw-signin-once@siteready.test');
  release();
  await settle();
  await settle();
  assert.equal(button.disabled, false, 'the button is free again once the link has been sent');
  assert.match(p.document.getElementById('signin-status').textContent, /link has been sent/);
});
