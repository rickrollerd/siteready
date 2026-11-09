// Every OpenRouter request asks only for providers that do not collect prompts (D327).
const test = require('node:test');
const assert = require('node:assert/strict');
const aiScope = require('../ai-scope');

test('an OpenRouter request carries provider data_collection deny', async () => {
  const realFetch = globalThis.fetch;
  const before = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test-key-not-used';
  const sent = [];
  globalThis.fetch = async (url, options) => {
    sent.push({ url: String(url), body: JSON.parse(options.body) });
    return { ok: true, status: 200, json: async () => ({ model: 'openai/test', choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) };
  };
  try {
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
    const out = await aiScope.callModel({ system: 'Answer.', content: 'Text.', schema, model: 'openai/test' });
    assert.deepEqual(out.value, { ok: true });
    await aiScope.callModel({ system: 'Answer.', content: 'Text.', model: 'openai/test' }).catch(() => {});
  } finally {
    globalThis.fetch = realFetch;
    if (before === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = before;
  }
  assert.ok(sent.length >= 1);
  for (const call of sent) {
    assert.match(call.url, /openrouter\.ai\/api\/v1\/chat\/completions$/);
    assert.deepEqual(call.body.provider, { data_collection: 'deny' });
  }
});
