'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Multi-key AI failover.
//
//  Each provider accepts a COMMA-SEPARATED LIST of keys. Free tiers are metered
//  per account, so several accounts of one provider multiply the quota. The
//  engine previously read only the first key of each provider, so extra keys —
//  which the owner had deliberately created — sat unused.
//
//  Exercised against a stubbed fetch, so the rotation is proven, not assumed.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');

let pass = 0, fail = 0;
const check = async (n, fn) => { try { await fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };

// Two Groq keys, one Cerebras — the shape the owner actually has.
process.env.GROQ_API_KEY = 'gk_one, gk_two';
process.env.CEREBRAS_API_KEY = 'ck_one';
process.env.OPENROUTER_API_KEY = '';
process.env.AI_PROVIDERS = 'groq,cerebras';
delete require.cache[require.resolve('./ai-engine')];

const seen = [];
let mode = {};
global.fetch = async (url, opts) => {
  const key = String(opts.headers.Authorization || opts.headers['x-api-key'] || '').replace('Bearer ', '');
  seen.push(key);
  if (mode[key] === 'rate') {
    return { ok: false, status: 429, json: async () => ({ error: { message: 'Rate limit reached for tokens per minute' } }) };
  }
  if (mode[key] === 'boom') {
    return { ok: false, status: 500, json: async () => ({ error: { message: 'upstream exploded' } }) };
  }
  return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok:' + key } }], usage: {} }) };
};
const ai = require('./ai-engine');

(async () => {
  await check('a comma-separated list is parsed into several usable keys', async () => {
    seen.length = 0; mode = {};
    const out = await ai.callLLM('hi');
    assert.strictEqual(out, 'ok:gk_one', 'should use the first key when all are healthy');
    assert.deepStrictEqual(seen, ['gk_one'], 'should not have tried more than one key');
  });

  await check('an exhausted key fails over to the NEXT KEY of the same provider', async () => {
    seen.length = 0; mode = { gk_one: 'rate' };
    const out = await ai.callLLM('hi');
    assert.strictEqual(out, 'ok:gk_two', 'did not roll onto the second key of the same provider');
    assert.deepStrictEqual(seen, ['gk_one', 'gk_two']);
  });

  await check('the exhausted key is remembered and skipped on the next call', async () => {
    seen.length = 0; mode = { gk_one: 'rate' };
    const out = await ai.callLLM('hi');
    assert.strictEqual(out, 'ok:gk_two');
    assert.deepStrictEqual(seen, ['gk_two'], 'it retried the key it already knew was exhausted');
  });

  await check('only when ALL of a provider’s keys are spent does it change provider', async () => {
    seen.length = 0; mode = { gk_one: 'rate', gk_two: 'rate' };
    const out = await ai.callLLM('hi');
    assert.strictEqual(out, 'ok:ck_one', 'did not fail over to the next provider');
    assert(seen.includes('gk_two') && seen[seen.length - 1] === 'ck_one', 'unexpected order: ' + seen.join(','));
  });

  await check('a broken key does NOT burn the provider’s other keys', async () => {
    // A bad key or a dead endpoint fails identically for every key of that
    // provider, so spinning through them all wastes time; move on instead.
    delete require.cache[require.resolve('./ai-engine')];
    const ai2 = require('./ai-engine');
    seen.length = 0; mode = { gk_one: 'boom', gk_two: 'boom' };
    const out = await ai2.callLLM('hi');
    assert.strictEqual(out, 'ok:ck_one');
    assert.strictEqual(seen.filter((k) => k.startsWith('gk_')).length, 1,
      'a non-quota error should try ONE key then move on, tried: ' + seen.join(','));
  });

  await check('a single key still works exactly as before (no regression)', async () => {
    process.env.GROQ_API_KEY = 'solo';
    process.env.AI_PROVIDERS = 'groq';
    delete require.cache[require.resolve('./ai-engine')];
    const ai3 = require('./ai-engine');
    seen.length = 0; mode = {};
    assert.strictEqual(await ai3.callLLM('hi'), 'ok:solo');
  });

  await check('no keys configured gives a clear, actionable error', async () => {
    process.env.GROQ_API_KEY = ''; process.env.CEREBRAS_API_KEY = '';
    delete require.cache[require.resolve('./ai-engine')];
    const ai4 = require('./ai-engine');
    await assert.rejects(() => ai4.callLLM('hi'), /No AI provider configured/);
  });

  await check('a tiny token budget is raised to a floor, so reasoning models still answer', async () => {
    // gpt-oss and similar spend tokens THINKING before emitting content, and that
    // spend counts against max_tokens. A 64-token request came back as an EMPTY
    // string with finish_reason 'length' - no error, so callers treated nothing
    // as a valid answer. Sentiment classification asked for exactly 64.
    process.env.GROQ_API_KEY = 'solo';
    process.env.AI_PROVIDERS = 'groq';
    delete require.cache[require.resolve('./ai-engine')];
    let asked = null;
    global.fetch = async (url, opts) => {
      asked = JSON.parse(opts.body).max_tokens;
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: {} }) };
    };
    const ai5 = require('./ai-engine');
    await ai5.callLLM('hi', { maxTokens: 64 });
    assert(asked >= 256, 'a 64-token request reached the provider as ' + asked + '; reasoning would eat it all');
    await ai5.callLLM('hi', { maxTokens: 4000 });
    assert.strictEqual(asked, 4000, 'a generous budget must be passed through untouched');
  });

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
