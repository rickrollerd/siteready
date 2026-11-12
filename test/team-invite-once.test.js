// Team and review invitations send only one email at a time (D368).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPage } = require('./fake-dom');

const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'public', name), 'utf8');

test('the team invite form starts only one request at a time', () => {
  const src = read('account.js');
  assert.match(src, /let sendingInvite = false;/);
  assert.match(src, /if \(sendingInvite\) return;/);
  assert.match(src, /sendingInvite = true;/);
  assert.match(src, /if \(!button \|\| button\.disabled\) return;/);
});

test('a second press while a team invitation is already being sent is ignored', async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const p = loadPage(['app.js', 'account.js'], async (method, route) => {
    if (method === 'POST' && String(route).endsWith('/api/company/users')) {
      await held;
      return { body: { ok: true, message: 'An invitation has been sent to worker@siteready.test.' } };
    }
    return { body: {} };
  });
  p.document.getElementById('team-email').value = 'worker@siteready.test';
  const form = p.document.getElementById('team-form');
  const button = p.document.getElementById('team-invite');
  form.requestSubmit();
  await settle();
  assert.equal(button.disabled, true, 'the button stays busy while the first request is on its way');
  form.requestSubmit();
  await settle();
  const posts = p.calls.filter((call) => call.method === 'POST' && String(call.route).endsWith('/api/company/users'));
  assert.equal(posts.length, 1, 'the second press is ignored');
  assert.equal(posts[0].body.email, 'worker@siteready.test');
  release();
  await settle();
  await settle();
  assert.equal(button.disabled, false, 'the button is free again once the invitation has been sent');
  assert.match(p.document.getElementById('team-status').textContent, /invitation has been sent/);
});
