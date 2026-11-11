// Review finding 1: /api/qf/review must use the 5 MB body limit through the real server wiring.
// Finding 10: the QuantityForge page names the server in the sitewrite-api meta tag, as other app pages do.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, gracefulClose } = require('../server');

let server;
let base;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server && server.listening) await gracefulClose(server, { timeoutMs: 5000 });
});

function post(route, body) {
  return fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('POST /api/qf/review accepts a bill over 100 KB through the real server', async () => {
  const bulky = { bill: { lines: [{ item_ref: '6.1/001', description: 'x'.repeat(120 * 1024), unit: 'm2', qty_billed: 1 }] } };
  assert.ok(Buffer.byteLength(JSON.stringify(bulky)) > 100 * 1024);
  const response = await post('/api/qf/review', bulky);
  assert.notEqual(response.status, 413, 'the 100 KB limit must not apply to review');
});

test('POST /api/qf/review still refuses a body over 5 MB', async () => {
  const bulky = { bill: { lines: [{ item_ref: '6.1/001', description: 'x'.repeat(5.1 * 1024 * 1024), unit: 'm2', qty_billed: 1 }] } };
  const response = await post('/api/qf/review', bulky);
  assert.equal(response.status, 413);
});

test('a small JSON route still uses the 100 KB limit', async () => {
  const bulky = { email: 'a'.repeat(120 * 1024) + '@example.com' };
  const response = await post('/api/auth/email', bulky);
  assert.equal(response.status, 413);
});

test('the QuantityForge page has a sitewrite-api meta tag and uses it', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/qf.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../public/qf.js'), 'utf8');
  assert.match(html, /<meta\s+name="sitewrite-api"\s+content="">/);
  assert.match(js, /meta\[name="sitewrite-api"\]/);
  assert.match(js, /apiUrl\(`\/api\/qf\/\$\{path\}`\)/);
});

test('gracefulClose stops the server accepting new connections', async () => {
  const extra = app.listen(0);
  await new Promise((resolve) => extra.once('listening', resolve));
  const url = `http://127.0.0.1:${extra.address().port}/api/health`;
  assert.equal((await fetch(url)).status, 200);
  await gracefulClose(extra, { timeoutMs: 5000 });
  await assert.rejects(() => fetch(url), { name: 'TypeError' });
});
