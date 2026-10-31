// D314: mailer must never log email bodies on Railway, and must use isProduction() from secret-keys.js.
const test = require('node:test');
const assert = require('node:assert/strict');

const MAILER_PATH = require.resolve('../mailer');

function freshMailer() {
  delete require.cache[MAILER_PATH];
  return require('../mailer');
}

const NAMES = ['RAILWAY_ENVIRONMENT_NAME', 'NODE_ENV', 'SMTP_HOST', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'POSTMARK_SERVER_TOKEN', 'MAIL_PROVIDER'];

let saved;

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

function captureConsole() {
  const logs = [];
  const original = console.log;
  console.log = (...args) => logs.push(args.join(' '));
  return {
    logs,
    restore() { console.log = original; }
  };
}

test('production via NODE_ENV throws 503 and does not log the email body', async () => {
  process.env.NODE_ENV = 'production';
  const { sendMail } = freshMailer();
  const cap = captureConsole();
  try {
    await assert.rejects(sendMail({ to: 'test@example.com', subject: 'Sign in', text: 'https://example.com/?login=secret-token' }), (err) => {
      assert.equal(err.status, 503);
      assert.ok(err.publicMessage);
      assert.ok(err.message.includes('Email is not set up'));
      return true;
    });
  } finally {
    cap.restore();
  }
  assert.equal(cap.logs.length, 0, 'nothing is logged in production');
  assert.ok(!cap.logs.some((l) => l.includes('secret-token')), 'login token never appears in logs');
});

test('production via Railway throws 503 and does not log the email body', async () => {
  process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
  const { sendMail } = freshMailer();
  const cap = captureConsole();
  try {
    await assert.rejects(sendMail({ to: 'test@example.com', subject: 'Sign in', text: 'https://example.com/?login=secret-token' }), (err) => {
      assert.equal(err.status, 503);
      return true;
    });
  } finally {
    cap.restore();
  }
  assert.equal(cap.logs.length, 0);
  assert.ok(!cap.logs.some((l) => l.includes('secret-token')));
});

test('Railway non-production returns null and does not log the email body', async () => {
  process.env.RAILWAY_ENVIRONMENT_NAME = 'staging';
  const { sendMail } = freshMailer();
  const cap = captureConsole();
  let result;
  try {
    result = await sendMail({ to: 'test@example.com', subject: 'Sign in', text: 'https://example.com/?login=secret-token' });
  } finally {
    cap.restore();
  }
  assert.equal(result, null);
  assert.equal(cap.logs.length, 0, 'nothing is logged on Railway even outside production');
  assert.ok(!cap.logs.some((l) => l.includes('secret-token')));
});

test('local dev without Railway logs the email for debugging', async () => {
  const { sendMail } = freshMailer();
  const cap = captureConsole();
  let result;
  try {
    result = await sendMail({ to: 'test@example.com', subject: 'Sign in', text: 'https://example.com/?login=secret-token' });
  } finally {
    cap.restore();
  }
  assert.equal(result, null);
  assert.equal(cap.logs.length, 1);
  assert.ok(cap.logs[0].includes('test@example.com'));
  assert.ok(cap.logs[0].includes('Sign in'));
  assert.ok(cap.logs[0].includes('secret-token'));
});
