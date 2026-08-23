'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Self-healing model ids.
//
//  On 2026-08-21 every configured model id was retired by its provider at the
//  same time. All keys were valid; the entire AI chain still failed, and the
//  error read like a credentials problem. This makes that recoverable: when a
//  provider says the model is unknown, ask what it has, and retry.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');

let pass = 0, fail = 0;
const check = async (n, fn) => { try { await fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };

process.env.GROQ_API_KEY = 'gk_one';
process.env.CEREBRAS_API_KEY = '';
process.env.OPENROUTER_API_KEY = '';
process.env.AI_PROVIDERS = 'groq';
process.env.GROQ_MODEL = 'retired-model-v1';

let calls = [];
let listServed = ['whisper-large', 'llama-guard-4', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'];
let modelAccepted = 'openai/gpt-oss-20b';

global.fetch = async (url, opts) => {
  if (String(url).includes('/models') && (!opts || opts.method !== 'POST')) {
    return { ok: true, json: async () => ({ data: listServed.map((id) => ({ id })) }) };
  }
  const body = JSON.parse(opts.body);
  calls.push(body.model);
  if (body.model !== modelAccepted) {
    return { ok: false, status: 404, json: async () => ({ error: { message: `The model \`${body.model}\` does not exist or you do not have access to it.` } }) };
  }
  return { ok: true, json: async () => ({ choices: [{ message: { content: 'hello' } }], usage: {} }) };
};

const fresh = () => { delete require.cache[require.resolve('./ai-engine')]; return require('./ai-engine'); };

(async () => {
  await check('a retired model is detected, replaced from the provider list, and retried', async () => {
    calls = [];
    const ai = fresh();
    const out = await ai.callLLM('hi');
    assert.strictEqual(out, 'hello', 'the call should have succeeded after healing');
    assert.strictEqual(calls[0], 'retired-model-v1', 'it should try the configured model first');
    assert.strictEqual(calls[1], 'openai/gpt-oss-20b', 'it should retry with a discovered model, got: ' + calls[1]);
  });

  await check('the discovered model is remembered — no re-discovery on later calls', async () => {
    calls = [];
    const ai = fresh();
    await ai.callLLM('one');
    const afterFirst = calls.length;
    await ai.callLLM('two');
    assert.strictEqual(calls.length, afterFirst + 1, 'the second call should go straight to the healed model');
    assert.strictEqual(calls[calls.length - 1], 'openai/gpt-oss-20b');
  });

  await check('non-chat models are never chosen', async () => {
    // A moderation classifier or speech model would "exist" and then behave bizarrely.
    calls = [];
    listServed = ['whisper-large-v3', 'llama-prompt-guard-2', 'openai/gpt-oss-safeguard-20b', 'qwen/qwen3.6-27b'];
    modelAccepted = 'qwen/qwen3.6-27b';
    const ai = fresh();
    await ai.callLLM('hi');
    const picked = calls[calls.length - 1];
    assert.strictEqual(picked, 'qwen/qwen3.6-27b', 'picked a non-chat model: ' + picked);
  });

  await check('if the provider offers nothing usable it fails over instead of looping', async () => {
    calls = [];
    listServed = ['whisper-large-v3', 'llama-prompt-guard-2'];   // nothing conversational
    modelAccepted = 'never';
    const ai = fresh();
    await assert.rejects(() => ai.callLLM('hi'));
    assert(calls.length <= 4, 'it kept retrying instead of giving up: ' + calls.length + ' attempts');
  });

  await check('a rate limit is NOT mistaken for a retired model', async () => {
    calls = [];
    listServed = ['openai/gpt-oss-20b'];
    global.fetch = async (url, opts) => {
      if (String(url).includes('/models') && (!opts || opts.method !== 'POST')) {
        return { ok: true, json: async () => ({ data: [{ id: 'openai/gpt-oss-20b' }] }) };
      }
      calls.push(JSON.parse(opts.body).model);
      return { ok: false, status: 429, json: async () => ({ error: { message: 'Rate limit reached' } }) };
    };
    const ai = fresh();
    await assert.rejects(() => ai.callLLM('hi'));
    // Should have cooled the key down, not swapped the model.
    assert(calls.every((m) => m === 'retired-model-v1'), 'a 429 triggered model discovery: ' + calls.join(','));
  });

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
