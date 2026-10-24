// Sign-in links in production (outside review, finding 3): they go only to APP_URL, an https
// address, never to the Host header a request carries. Without a usable APP_URL none are sent.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
process.env.RATE_LIMIT_EMAIL_IP_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { app } = require('../server');
const auth = require('../auth');
const db = require('../db');
const { setupAccounts, mailbox } = require('./helpers');

const NAMES = ['RAILWAY_ENVIRONMENT_NAME', 'NODE_ENV', 'APP_URL'];
let saved;
let server;
let port;

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  port = server.address().port;
});
test.after(() => server.close());
test.beforeEach(() => {
  saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
  for (const name of NAMES) delete process.env[name];
});
test.afterEach(() => {
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

// fetch() sets Host itself, so the forged one is sent with http.request.
function post(route, body, host) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path: route, method: 'POST', headers: { Host: host, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text || '{}') }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

const lastTo = (email) => [...mailbox].reverse().find((item) => item.to === email);

test('in production a forged Host header cannot change an emailed sign-in link', async () => {
  process.env.NODE_ENV = 'production';
  process.env.APP_URL = 'https://sitewrite.example/';
  const sent = await post('/api/auth/email', { email: 'host1@co.example' }, 'evil.example');
  assert.equal(sent.status, 200);
  const text = lastTo('host1@co.example').text;
  assert.match(text, /https:\/\/sitewrite\.example\/\?login=[A-Za-z0-9_-]+/);
  assert.ok(!text.includes('evil.example'));
  // SiteLink's sign-in link too.
  assert.equal((await post('/api/hse/email', { email: 'host2@co.example' }, 'evil.example')).status, 200);
  assert.match(lastTo('host2@co.example').text, /https:\/\/sitewrite\.example\/sitelink\?login=/);
  assert.ok(!lastTo('host2@co.example').text.includes('evil.example'));
});

test('in production with no APP_URL, or one that is not an https address, no sign-in link is sent', async () => {
  process.env.NODE_ENV = 'production';
  for (const value of [undefined, 'http://sitewrite.example', 'https://sitewrite.example/app', 'sitewrite.example', 'https://']) {
    if (value === undefined) delete process.env.APP_URL; else process.env.APP_URL = value;
    const before = mailbox.length;
    const email = `nolink${mailbox.length}@co.example`;
    const sent = await post('/api/auth/email', { email }, 'evil.example');
    assert.equal(sent.status, 503, String(value));
    assert.match(sent.body.message, /cannot send sign-in links/);
    assert.equal((await post('/api/hse/email', { email }, 'evil.example')).status, 503);
    assert.equal(mailbox.length, before, 'nothing was sent');
    assert.equal((await db.query('SELECT token_hash FROM login_tokens WHERE email = $1', [email])).length, 0, 'no link was made');
    assert.match(auth.appUrlProblem(), /^APP_URL /);
    assert.equal(auth.appUrl({ protocol: 'https', get: () => 'evil.example' }), '');
  }
});

test('the reviewer and list link senders refuse without the address too', async () => {
  process.env.NODE_ENV = 'production';
  const req = { protocol: 'https', get: () => 'evil.example' };
  await assert.rejects(auth.sendReviewerLink(req, 'rev@co.example', 'SW-1'), /cannot send sign-in links/);
  await assert.rejects(auth.sendListLink(req, 'list@co.example', { listToken: 't', source: '', builder: 'B' }), /cannot send sign-in links/);
  process.env.APP_URL = 'https://sitewrite.example';
  await auth.sendReviewerLink(req, 'rev@co.example', 'SW-1');
  assert.match(lastTo('rev@co.example').text, /^https:\/\/sitewrite\.example\/review\.html\?ref=SW-1&login=/m);
  await auth.sendListLink(req, 'list@co.example', { listToken: 't', source: '', builder: 'B' });
  assert.match(lastTo('list@co.example').text, /^https:\/\/sitewrite\.example\/list\.html\?t=t&login=/m);
  assert.equal(auth.appUrlProblem(), null);
});

test('production is told at start; staging and local copies work as before', async () => {
  // Railway's staging environment is not production, even with NODE_ENV=production.
  process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
  process.env.NODE_ENV = 'production';
  assert.equal(auth.appUrlProblem(), null);
  assert.equal(auth.appUrl({ protocol: 'http', get: () => 'localhost:3849' }), 'http://localhost:3849');
  process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
  assert.match(auth.appUrlProblem(), /APP_URL is not set/);
  process.env.APP_URL = 'http://sitewrite.example';
  assert.match(auth.appUrlProblem(), /not an https address/);
  delete process.env.RAILWAY_ENVIRONMENT_NAME;
  delete process.env.NODE_ENV;
  delete process.env.APP_URL;
  const sent = await post('/api/auth/email', { email: 'local@co.example' }, 'localhost:3849');
  assert.equal(sent.status, 200);
  assert.match(lastTo('local@co.example').text, /http:\/\/localhost:3849\/\?login=/);
});
