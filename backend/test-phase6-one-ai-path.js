'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  ONE AI path.
//
//  server.js carried a second LLM implementation called `callGemini` — a name
//  that never called Gemini. It hardcoded 'llama-3.1-8b-instant', read a single
//  API key directly, and had no failover, sitting alongside ai-engine.js and
//  ignoring everything it provides.
//
//  When Groq retired that model id, nine user-facing features broke with an
//  error naming a model nobody had configured, while the engine's own provider
//  chain was healthy and correctly configured. This pins the consolidation.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SERVER = strip(read('server.js'));

check('server.js never talks to an LLM provider directly', () => {
  // The whole point: one place decides which model, which key, and what to do
  // when either fails.
  for (const marker of ['api.groq.com', 'api.openai.com', 'api.anthropic.com', 'api.cerebras.ai', 'openrouter.ai/api']) {
    assert(!SERVER.includes(marker), `server.js still calls ${marker} directly`);
  }
});

check('no hardcoded model id is used to CALL a provider', () => {
  // The rate table legitimately still lists retired ids so historical usage rows
  // price correctly — exclude it, then assert nothing else pins a model.
  const withoutRates = SERVER.replace(/const AI_RATES = [^;]*;/, '');
  assert(!/llama-3\.1-8b-instant/.test(withoutRates), 'the retired hardcoded model is still used somewhere');
  assert(!/model:\s*['"`][\w.\/-]+['"`]/.test(withoutRates), 'a model id is pinned outside the rate table');
});

check('the legacy name is gone and every call site moved', () => {
  assert(!/callGemini/.test(SERVER), 'callGemini still exists — a name that never called Gemini');
  const n = (SERVER.match(/callAI\(/g) || []).length;
  assert(n >= 9, `expected the 9+ former callGemini sites to use callAI, found ${n}`);
});

check('callAI is a thin delegate to the engine, not a reimplementation', () => {
  const fn = SERVER.slice(SERVER.indexOf('async function callAI('), SERVER.indexOf('async function callAI(') + 260);
  assert(/aiEngine\.callLLM\(prompt, \{ maxTokens, ctx \}\)/.test(fn), 'callAI does not delegate to the engine');
  assert(!/fetch\(/.test(fn), 'callAI still makes its own HTTP call');
});

check('metering happens once, in the engine', () => {
  assert(/aiEngine\.setMeter\(recordAiUsage\)/.test(SERVER), 'the engine is not wired to the usage ledger');
  const fn = SERVER.slice(SERVER.indexOf('async function callAI('), SERVER.indexOf('async function callAI(') + 260);
  assert(!/recordAiUsage/.test(fn), 'callAI meters too — usage would be double-counted');
});

check('the cost table prices the models actually in use', () => {
  for (const m of ['openai/gpt-oss-20b', 'gemma-4-31b', 'z-ai/glm-5.2:free']) {
    assert(SERVER.includes(m), `AI_RATES has no entry for ${m}, so its usage would price at the flat fallback`);
  }
  // Retired ids stay, so historical rows still price correctly.
  assert(read('server.js').includes("'llama-3.1-8b-instant': { in:"), 'retired model rates were dropped, breaking historical costing');
});

check('the UI no longer claims a provider the app does not use', () => {
  const web = path.join(__dirname, '..', 'wappflow-web', 'src');
  const offenders = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { walk(p); continue; }
      if (/\.jsx?$/.test(f.name) && /Gemini|callGemini/.test(fs.readFileSync(p, 'utf8'))) offenders.push(p);
    }
  };
  walk(web);
  assert.deepStrictEqual(offenders, [], 'stale provider naming in the UI:\n   ' + offenders.join('\n   '));
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
