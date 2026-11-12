// Unknown pages and failed requests get a short, friendly answer with no stack (D365).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('../server');
const { setupAccounts, lastLinkToken } = require('./helpers');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', '404.html'), 'utf8');
const STACK = /at Object\.|at Module\.|node_modules|SyntaxError|Unexpected token|Cannot GET|Cannot POST|    at /;

let server;
let base;

test.before(async () => {
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  server.keepAliveTimeout = 60000;
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

const get = (route, headers = {}) => fetch(`${base}${route}`, { headers });
const post = (route, body, raw, headers = {}) => fetch(`${base}${route}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: raw || JSON.stringify(body),
});

test('the not-found page is a short SiteWrite page with a skip link and one main landmark', () => {
  assert.match(html, /<title>Page not found - SiteWrite<\/title>/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<a class="skip" href="#main">Skip to the main content<\/a>/);
  assert.equal((html.match(/<main id="main">/g) || []).length, 1);
  assert.match(html, /That address is not on SiteWrite/);
  assert.doesNotMatch(html, /—/);
});

test('an unknown URL gets that page, not Express\'s default error text', async () => {
  for (const route of ['/no-such-page', '/pricing', '/this/does/not/exist', '/no-such.png']) {
    const res = await get(route);
    assert.equal(res.status, 404, route);
    assert.match(res.headers.get('content-type') || '', /text\/html/);
    const body = await res.text();
    assert.match(body, /Page not found/);
    assert.match(body, /That address is not on SiteWrite/);
    assert.doesNotMatch(body, STACK, route);
    assert.doesNotMatch(body, /Cannot GET|Cannot POST/, route);
  }
  const posted = await post('/no-such-page', { x: 1 });
  assert.equal(posted.status, 404);
  const postedBody = await posted.text();
  assert.match(postedBody, /Page not found/);
  assert.doesNotMatch(postedBody, /Cannot POST/);
});

test('an unknown /api route gets a friendly JSON error', async () => {
  for (const route of ['/api/no-such-route', '/api']) {
    const res = await get(route, { Accept: 'application/json' });
    assert.equal(res.status, 404, route);
    assert.match(res.headers.get('content-type') || '', /application\/json/);
    const data = await res.json();
    assert.equal(data.kind, 'error');
    assert.equal(data.message, 'That address is not on SiteWrite.');
    assert.doesNotMatch(JSON.stringify(data), STACK);
  }
  const posted = await post('/api/no-such-route', {});
  assert.equal(posted.status, 404);
  assert.equal((await posted.json()).message, 'That address is not on SiteWrite.');
});

test('a page requested as JSON only still gets a JSON error', async () => {
  const res = await get('/no-such-page', { Accept: 'application/json' });
  assert.equal(res.status, 404);
  assert.match(res.headers.get('content-type') || '', /application\/json/);
  assert.equal((await res.json()).message, 'That address is not on SiteWrite.');
});

test('bad JSON is refused with a plain message and no parser text', async () => {
  const res = await post('/api/draft', null, '{not json');
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.message, 'The request could not be read.');
  assert.doesNotMatch(JSON.stringify(data), STACK);
  assert.doesNotMatch(JSON.stringify(data), /Unexpected|JSON at position/);
});

test('an oversized JSON body is refused in plain words', async () => {
  const res = await post('/api/auth/email', { email: 'a'.repeat(120 * 1024) + '@example.com' });
  assert.equal(res.status, 413);
  const data = await res.json();
  assert.equal(data.kind, 'error');
  assert.equal(data.message, 'That file or request is too large. Try a smaller one.');
  assert.doesNotMatch(JSON.stringify(data), STACK);
});

test('an invalid session token is asked to sign in, with no stack', async () => {
  const res = await get('/api/me', { Authorization: 'Bearer not-a-real-token', Accept: 'application/json' });
  assert.equal(res.status, 401);
  const data = await res.json();
  assert.equal(data.message, 'Sign in to use this.');
  assert.doesNotMatch(JSON.stringify(data), STACK);
});

test('an expired or invalid sign-in link is refused in plain words', async () => {
  const res = await post('/api/auth/verify', { token: 'deadbeefdeadbeefdeadbeefdeadbeef' });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.message, 'This sign-in link has expired or has been used. Ask for a new one.');
  assert.doesNotMatch(JSON.stringify(data), STACK);

  await post('/api/auth/email', { email: 'owner@sitewrite.example' });
  const token = lastLinkToken('owner@sitewrite.example');
  assert.ok(token);
  const first = await post('/api/auth/verify', { token });
  assert.equal(first.status, 200);
  const again = await post('/api/auth/verify', { token });
  assert.equal(again.status, 400);
  assert.equal((await again.json()).message, 'This sign-in link has expired or has been used. Ask for a new one.');
});
