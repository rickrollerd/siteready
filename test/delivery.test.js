// Goal 7: the page and the server's answers are compressed, the page's scripts are kept by the
// phone until they change, and a person's own answers are never kept by the browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('../server');
const { pickEncoding } = require('../delivery');

let server;
let port;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  server.keepAliveTimeout = 60000;
  port = server.address().port;
});

test.after(() => server.close());

// The raw answer, as the phone receives it, before anything is uncompressed.
function get(route, headers = {}, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path: route, method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    request.on('error', reject);
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

const unpack = (response) => {
  const encoding = response.headers['content-encoding'];
  if (encoding === 'br') return zlib.brotliDecompressSync(response.body);
  if (encoding === 'gzip') return zlib.gunzipSync(response.body);
  return response.body;
};

const PUBLIC = path.join(__dirname, '..', 'public');

test('the page\'s scripts go compressed, and come back the same', async () => {
  const brotli = await get('/app.js', { 'Accept-Encoding': 'gzip, deflate, br' });
  assert.equal(brotli.status, 200);
  assert.equal(brotli.headers['content-encoding'], 'br');
  assert.match(brotli.headers['content-type'], /^text\/javascript/);
  assert.match(brotli.headers.vary, /Accept-Encoding/);
  assert.ok(brotli.body.length < fs.statSync(path.join(PUBLIC, 'app.js')).size / 3, 'at least three times smaller');
  assert.deepEqual(unpack(brotli), fs.readFileSync(path.join(PUBLIC, 'app.js')));
  const gzip = await get('/app.js', { 'Accept-Encoding': 'gzip' });
  assert.equal(gzip.headers['content-encoding'], 'gzip');
  assert.deepEqual(unpack(gzip), fs.readFileSync(path.join(PUBLIC, 'app.js')));
  // A browser that takes neither gets the file as it is.
  const plain = await get('/app.js');
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.deepEqual(plain.body, fs.readFileSync(path.join(PUBLIC, 'app.js')));
  // A HEAD request gets the headers only.
  const head = await get('/app.js', { 'Accept-Encoding': 'br' }, 'HEAD');
  assert.equal(head.body.length, 0);
  assert.equal(head.headers['content-encoding'], 'br');
});

test('each page names its scripts by their content, so a phone keeps them until they change', async () => {
  const page = await get('/', { 'Accept-Encoding': 'br' });
  assert.equal(page.status, 200);
  assert.equal(page.headers['cache-control'], 'no-cache', 'the page itself is checked on every visit');
  const html = unpack(page).toString('utf8');
  const scripts = [...html.matchAll(/<script src="(\/[\w.-]+\.js)\?v=([0-9a-f]{12})"/g)];
  assert.ok(scripts.length >= 8, 'every script is named by its content');
  assert.ok(scripts.some(([, name]) => name === '/net.js'), 'the lost signal script is on the page');
  const [, name, version] = scripts.find(([, file]) => file === '/app.js');
  const kept = await get(`${name}?v=${version}`, { 'Accept-Encoding': 'br' });
  assert.equal(kept.headers['cache-control'], 'public, max-age=31536000, immutable');
  // Without the content's name, or with an old one, it is checked again.
  assert.equal((await get('/app.js')).headers['cache-control'], 'no-cache');
  assert.equal((await get('/app.js?v=000000000000')).headers['cache-control'], 'no-cache');
  // The other pages too.
  for (const other of ['/check.html', '/verify.html', '/sign.html']) {
    const text = unpack(await get(other, { 'Accept-Encoding': 'gzip' })).toString('utf8');
    assert.match(text, /<script src="\/[\w.-]+\.js\?v=[0-9a-f]{12}"/, other);
  }
});

test('a file not changed since the last visit is not sent again', async () => {
  const first = await get('/', { 'Accept-Encoding': 'br' });
  const again = await get('/', { 'Accept-Encoding': 'br', 'If-None-Match': first.headers.etag });
  assert.equal(again.status, 304);
  assert.equal(again.body.length, 0);
  // A different encoding is a different copy.
  assert.equal((await get('/', { 'Accept-Encoding': 'gzip', 'If-None-Match': first.headers.etag })).status, 200);
});

test('icons are kept for a day; files outside the page folder are not served', async () => {
  const icon = await get('/icon-192.png');
  assert.equal(icon.status, 200);
  assert.equal(icon.headers['cache-control'], 'public, max-age=86400');
  assert.equal(icon.headers['content-encoding'], undefined, 'a PNG is already compressed');
  for (const route of ['/..%2fserver.js', '/%2e%2e/server.js', '/.env', '/../package.json']) {
    assert.equal((await get(route)).status, 404, route);
  }
});

test('the server\'s answers are compressed and, unless a route says so, not kept', async () => {
  const steps = await get('/api/steps', { 'Accept-Encoding': 'br' });
  assert.equal(steps.headers['content-encoding'], 'br');
  assert.equal(steps.headers['cache-control'], 'public, max-age=3600');
  const library = JSON.parse(unpack(steps).toString('utf8'));
  assert.ok(Array.isArray(library.groups) && library.groups.length > 0);
  // The states and pick lists change only when SiteReady is updated.
  for (const route of ['/api/states', '/api/presets']) {
    const response = await get(route, { 'Accept-Encoding': 'gzip' });
    assert.equal(response.headers['cache-control'], 'public, max-age=3600', route);
    assert.ok(JSON.parse(unpack(response).toString('utf8')));
  }
  // Not changed: a short answer.
  const again = await get('/api/steps', { 'Accept-Encoding': 'br', 'If-None-Match': steps.headers.etag });
  assert.equal(again.status, 304);
  // A person's own answers are not kept by the browser, and a small answer goes as it is.
  const me = await get('/api/me', { 'Accept-Encoding': 'br' });
  assert.equal(me.headers['cache-control'], 'no-store');
  assert.equal(me.headers['content-encoding'], undefined);
  // A posted answer is compressed too.
  const questions = await get('/api/draft/questions', { 'Accept-Encoding': 'gzip' }, 'POST', { state: 'qld', task: 'Install a new switchboard and run cable on cable tray from a scissor lift.', fallRisk: 'no' });
  assert.equal(questions.status, 200);
  assert.equal(questions.headers['content-encoding'], 'gzip');
  assert.equal(questions.headers['cache-control'], 'no-store');
  assert.equal(JSON.parse(unpack(questions).toString('utf8')).kind, 'questions');
  // An error answer is still plain JSON.
  const missing = await get('/api/nothing-here', { 'Accept-Encoding': 'br' });
  assert.equal(missing.status, 404);
  assert.equal(JSON.parse(unpack(missing).toString('utf8')).kind, 'error');
});

test('the encoding follows what the browser says it takes', () => {
  const req = (value) => ({ headers: { 'accept-encoding': value } });
  assert.equal(pickEncoding(req('gzip, deflate, br, zstd')), 'br');
  assert.equal(pickEncoding(req('gzip, deflate')), 'gzip');
  assert.equal(pickEncoding(req('br;q=0, gzip')), 'gzip');
  assert.equal(pickEncoding(req('gzip;q=0')), '');
  assert.equal(pickEncoding(req('')), '');
  assert.equal(pickEncoding({ headers: {} }), '');
});
