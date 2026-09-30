const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');

let server;
let base;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

const post = (route, body, raw) => fetch(`${base}${route}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: raw || JSON.stringify(body),
});

test('the old AI routes are gone', async () => {
  for (const route of ['/api/questions', '/api/generate-swms']) {
    const response = await post(route, { jobDescription: 'x' });
    assert.equal(response.status, 404);
  }
});

test('a bad request body gets a plain message', async () => {
  const response = await post('/api/draft', null, '{not json');
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.message, 'The request could not be read.');
  assert.doesNotMatch(JSON.stringify(data), /Unexpected|JSON at position/);
});

test('security headers and rate limit headers are set', async () => {
  const response = await fetch(`${base}/api/states`);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('content-security-policy'));
  assert.ok(response.headers.get('ratelimit-policy') || response.headers.get('ratelimit'));
});

test('a draft and its Word file are prepared', async () => {
  const body = { state: 'qld', task: 'Replace a 3m length of fence.', fallRisk: 'no' };
  const draft = await post('/api/draft', body);
  assert.equal(draft.status, 200);
  assert.equal((await draft.json()).kind, 'draft');
  const docx = await post('/api/draft.docx', body);
  assert.equal(docx.status, 200);
  assert.match(docx.headers.get('content-type'), /wordprocessingml/);
});
