// "Read this SWMS in my language" on the main app's draft (task #94), with a stand-in for the model.
process.env.RATE_LIMIT_EMAIL_REQUESTS = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const db = require('../db');
const aiScope = require('../ai-scope');
const signRead = require('../sign-read');
const draftTranslate = require('../draft-translate');
const { setupAccounts, lastLinkToken } = require('./helpers');

let server;
let base;
let client = null;

test.before(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  await setupAccounts();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  delete process.env.ANTHROPIC_API_KEY;
  aiScope.useClient(null);
});

function call(method, route, { body, token } = {}) {
  return fetch(`${base}${route}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function signIn(email) {
  await call('POST', '/api/auth/email', { body: { email } });
  return (await (await call('POST', '/api/auth/verify', { body: { token: lastLinkToken(email) } })).json()).token;
}

// A stand-in for the model: it "translates" by marking each string, and counts its calls.
function translator() {
  const calls = [];
  const mark = (value) => (typeof value === 'string' ? `[tr] ${value}` : Array.isArray(value) ? value.map(mark)
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mark(item)])));
  return {
    calls,
    broken: false,
    beta: {
      messages: {
        stream: (params) => {
          calls.push(params);
          const english = JSON.parse(/<swms>\n([^]*)\n<\/swms>/.exec(params.messages[0].content)[1]);
          const answer = client.broken ? { ...mark(english), steps: mark(english.steps).slice(1) } : mark(english);
          return { finalMessage: async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 100, output_tokens: 100 }, content: [{ type: 'text', text: JSON.stringify(answer) }] }) };
        },
      },
    },
  };
}

const INPUT = { state: 'qld', task: 'Dig a trench 1 m deep with an excavator.', fallRisk: 'no' };

test('translation is hidden and refused without an API key', async () => {
  assert.deepEqual(await (await call('GET', '/api/draft/translation')).json(), { enabled: false, languages: [] });
  const token = await signIn('nokey@translate.example');
  const response = await call('POST', '/api/draft/translation', { token, body: { input: INPUT, language: 'vi' } });
  assert.equal(response.status, 503);
});

test('a draft is translated for signed-in users only, kept, and the English stays as it was', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-key-not-used';
  client = translator();
  aiScope.useClient(client);
  try {
    const config = await (await call('GET', '/api/draft/translation')).json();
    assert.equal(config.enabled, true);
    assert.deepEqual(config.languages.map((item) => item.code), signRead.LANGUAGES.map((item) => item.code));
    assert.ok(config.languages.some((item) => item.code === 'ar' && item.rtl));

    // Not signed in: refused, and no call made.
    assert.equal((await call('POST', '/api/draft/translation', { body: { input: INPUT, language: 'vi' } })).status, 401);
    assert.equal(client.calls.length, 0);

    const token = await signIn('reader@translate.example');
    const english = await (await call('POST', '/api/draft', { body: INPUT })).json();
    const response = await call('POST', '/api/draft/translation', { token, body: { input: INPUT, language: 'vi' } });
    assert.equal(response.status, 200);
    const translated = await response.json();
    assert.equal(client.calls.length, 1);
    const params = client.calls[0];
    assert.equal(params.output_config.effort, 'medium');
    assert.equal(params.output_config.format.schema, draftTranslate.SCHEMA);
    assert.match(params.system[0].text, /Translate faithfully/);
    assert.match(params.messages[0].content, /into Vietnamese/);
    assert.deepEqual(translated.language, { code: 'vi', name: 'Vietnamese', rtl: false, lessReliable: false });
    assert.equal(translated.title, `[tr] ${english.task}`);
    assert.deepEqual(translated.highRisk, english.highRisk.map((item) => `[tr] ${item}`));
    assert.equal(translated.steps.length, english.jobSteps.length);
    assert.deepEqual(translated.steps[1].controls, english.jobSteps[1].controls.map((item) => `[tr] ${item}`));
    assert.deepEqual(translated.english.steps[1].controls, english.jobSteps[1].controls, 'the English is sent back to show beneath');
    assert.deepEqual(translated.ppe, signRead.tickedPpe(english).map((item) => `[tr] ${item}`));

    // Asked again: kept, so no second call. The draft itself is unchanged English.
    assert.equal((await call('POST', '/api/draft/translation', { token, body: { input: INPUT, language: 'vi' } })).status, 200);
    assert.equal(client.calls.length, 1);
    assert.deepEqual(await (await call('POST', '/api/draft', { body: INPUT })).json(), english);
    assert.equal(Number((await db.one('SELECT COUNT(*) AS n FROM draft_translations')).n), 1);

    // Arabic reads right to left; each language is its own translation.
    const arabic = await (await call('POST', '/api/draft/translation', { token, body: { input: INPUT, language: 'ar' } })).json();
    assert.equal(arabic.language.rtl, true);
    assert.equal(client.calls.length, 2);

    // A changed draft is a new translation.
    await call('POST', '/api/draft/translation', { token, body: { input: { ...INPUT, controlEdits: { Excavate: { added: ['Toolbox talk each morning.'] } } }, language: 'vi' } });
    assert.equal(client.calls.length, 3);
    assert.match(client.calls[2].messages[0].content, /Toolbox talk each morning\. \(Our own control\)/);

    assert.equal((await call('POST', '/api/draft/translation', { token, body: { input: INPUT, language: 'xx' } })).status, 400);
    // A stood-down task has nothing to translate.
    assert.equal((await call('POST', '/api/draft/translation', { token, body: { input: { state: 'qld', task: 'Erect a modular scaffold to 6 m.', fallRisk: 'yes' }, language: 'vi' } })).status, 400);

    // A translation that does not match the English item for item is not used or kept.
    client.broken = true;
    assert.equal((await call('POST', '/api/draft/translation', { token, body: { input: INPUT, language: 'ko' } })).status, 502);
    client.broken = false;
    assert.equal((await call('POST', '/api/draft/translation', { token, body: { input: INPUT, language: 'ko' } })).status, 200);
    assert.equal(client.calls.length, 5);
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    aiScope.useClient(null);
  }
});
