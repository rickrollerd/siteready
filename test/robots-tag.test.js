// Review finding 9: staging and other non-production hosts send X-Robots-Tag: noindex.
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

test('pages send X-Robots-Tag: noindex when the host is not production', async () => {
  const beforeName = process.env.RAILWAY_ENVIRONMENT_NAME;
  const beforeNode = process.env.NODE_ENV;
  delete process.env.RAILWAY_ENVIRONMENT_NAME;
  process.env.NODE_ENV = 'test';
  try {
    const home = await fetch(`${base}/`);
    const welcome = await fetch(`${base}/welcome.html`);
    const health = await fetch(`${base}/api/health`);
    for (const response of [home, welcome, health]) {
      assert.match(String(response.headers.get('x-robots-tag') || ''), /noindex/i);
    }
  } finally {
    if (beforeName === undefined) delete process.env.RAILWAY_ENVIRONMENT_NAME;
    else process.env.RAILWAY_ENVIRONMENT_NAME = beforeName;
    if (beforeNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = beforeNode;
  }
});

test('pages do not send noindex when Railway names the environment production', async () => {
  const beforeName = process.env.RAILWAY_ENVIRONMENT_NAME;
  process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
  try {
    const home = await fetch(`${base}/`);
    const tag = String(home.headers.get('x-robots-tag') || '');
    assert.doesNotMatch(tag, /noindex/i);
  } finally {
    if (beforeName === undefined) delete process.env.RAILWAY_ENVIRONMENT_NAME;
    else process.env.RAILWAY_ENVIRONMENT_NAME = beforeName;
  }
});
