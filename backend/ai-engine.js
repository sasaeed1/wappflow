// ════════════════════════════════════════════════════════════
//  CENTRALIZED AI ENGINE
// ════════════════════════════════════════════════════════════
// Single source of truth for LLM calls, prompt patterns, context building.
// Existing server.js routes can migrate to use these functions over time;
// new AI features should be added here, not inline in server.js.

const DEFAULT_PROVIDER = process.env.AI_PROVIDER || 'cerebras';
const GROQ_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const CEREBRAS_KEY = process.env.CEREBRAS_API_KEY;
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || 'llama3.1-8b';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';

const _sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Provider fallback chain ─────────────────────────────────────────────────
// AI_PROVIDERS is an ordered, comma-separated list. callLLM tries each in turn;
// when one rate-limits it fails over to the next and puts the exhausted one on
// a short cooldown — pooling the free-tier quotas of every configured provider.
const PROVIDER_CHAIN = (process.env.AI_PROVIDERS || `${DEFAULT_PROVIDER},cerebras,groq,openrouter`)
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  .filter((v, i, a) => a.indexOf(v) === i);
const COOLDOWN_MS = 60000;
const _cooldownUntil = {}; // provider -> epoch ms until which it is skipped

// Normalize provider usage shapes (OpenAI-style prompt/completion vs Anthropic input/output).
function _norm(u = {}) {
  return {
    prompt_tokens: (u && (u.prompt_tokens ?? u.input_tokens)) || 0,
    completion_tokens: (u && (u.completion_tokens ?? u.output_tokens)) || 0,
  };
}

// ── Usage metering hook (Command Center §1.5 / §18) ──────────────────────────
// server.js wires setMeter(recordAiUsage) at boot so every callLLM records
// provider/model/tokens/latency to the ai_usage ledger. No-op until wired.
let _meter = null;
function setMeter(fn) { _meter = typeof fn === 'function' ? fn : null; }

function _hasKey(p) {
  return (p === 'cerebras'   && !!CEREBRAS_KEY)
      || (p === 'groq'       && !!GROQ_KEY)
      || (p === 'openai'     && !!OPENAI_KEY)
      || (p === 'anthropic'  && !!ANTHROPIC_KEY)
      || (p === 'openrouter' && !!OPENROUTER_KEY);
}

function _callProvider(p, prompt, system, maxTokens, temperature) {
  if (p === 'cerebras')   return _callCerebras(prompt, system, maxTokens, temperature);
  if (p === 'groq')       return _callGroq(prompt, system, maxTokens, temperature);
  if (p === 'openai')     return _callOpenAI(prompt, system, maxTokens, temperature);
  if (p === 'anthropic')  return _callAnthropic(prompt, system, maxTokens, temperature);
  if (p === 'openrouter') return _callOpenRouter(prompt, system, maxTokens, temperature);
  throw new Error('Unknown AI provider: ' + p);
}

function _isRateLimit(e) {
  const m = String((e && e.message) || e).toLowerCase();
  return m.includes('rate limit') || m.includes('429') || m.includes('tokens per minute')
    || m.includes('quota') || m.includes('too many requests')
    || m.includes('capacity') || m.includes('overloaded');
}

// ── Low-level LLM call — provider abstraction with automatic failover ──
async function callLLM(prompt, opts = {}) {
  const { maxTokens = 2048, temperature = 0.3, system = null, provider, ctx = {} } = opts;
  const tStart = Date.now();

  // Hard prompt-size cap — keeps every request inside the smallest free-tier
  // window (Groq ~6K tokens/min). Oversized prompts get their middle trimmed so
  // the instructions (start) and the latest context (end) both survive.
  const MAX_PROMPT_CHARS = 12000;
  if (typeof prompt === 'string' && prompt.length > MAX_PROMPT_CHARS) {
    const head = prompt.slice(0, 2600);
    const tail = prompt.slice(prompt.length - (MAX_PROMPT_CHARS - 2800));
    prompt = head + '\n\n…[earlier conversation trimmed to fit AI limits]…\n\n' + tail;
  }

  // Candidate list: an explicit provider first (if given), then the chain —
  // deduped, and only those that actually have an API key configured.
  const candidates = (provider ? [provider, ...PROVIDER_CHAIN] : [...PROVIDER_CHAIN])
    .filter((v, i, a) => a.indexOf(v) === i)
    .filter(_hasKey);
  if (candidates.length === 0) {
    throw new Error('No AI provider configured — set CEREBRAS_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY');
  }

  let lastErr;

  // Pass 1 — try each provider that is not currently cooling down.
  for (const p of candidates) {
    if (_cooldownUntil[p] && Date.now() < _cooldownUntil[p]) continue;
    const aT0 = Date.now();
    try {
      const out = await _callProvider(p, prompt, system, maxTokens, temperature);
      _cooldownUntil[p] = 0;
      if (_meter) { try { _meter({ ...ctx, provider: p, model: out.model, prompt_tokens: out.usage.prompt_tokens, completion_tokens: out.usage.completion_tokens, latency_ms: Date.now() - aT0, success: 1 }); } catch {} }
      return out.content;
    } catch (e) {
      lastErr = e;
      if (_isRateLimit(e)) {
        _cooldownUntil[p] = Date.now() + COOLDOWN_MS;
        console.log(`⏳ ${p} rate-limited — cooling down ${COOLDOWN_MS / 1000}s, failing over`);
      } else {
        console.log(`⚠️ ${p} failed (${(e && e.message) || e}) — trying next provider`);
      }
    }
  }

  // Pass 2 — everything was cooled-down or failing. Back off, retry the chain.
  for (let attempt = 0; attempt < 3; attempt++) {
    const wait = Math.min(2000 * Math.pow(2, attempt), 20000);
    console.log(`⏳ all AI providers busy — waiting ${wait}ms then retrying the chain`);
    await _sleep(wait);
    for (const p of candidates) {
      const aT0 = Date.now();
      try {
        const out = await _callProvider(p, prompt, system, maxTokens, temperature);
        _cooldownUntil[p] = 0;
        if (_meter) { try { _meter({ ...ctx, provider: p, model: out.model, prompt_tokens: out.usage.prompt_tokens, completion_tokens: out.usage.completion_tokens, latency_ms: Date.now() - aT0, success: 1 }); } catch {} }
        return out.content;
      } catch (e) {
        lastErr = e;
        if (_isRateLimit(e)) _cooldownUntil[p] = Date.now() + COOLDOWN_MS;
      }
    }
  }

  // Every provider failed — record a single failure row so the AI Control Center
  // reflects the error rate (one row per logical call, not per failover attempt).
  if (_meter) { try { _meter({ ...ctx, provider: candidates[candidates.length - 1] || 'unknown', model: null, latency_ms: Date.now() - tStart, success: 0 }); } catch {} }
  throw lastErr || new Error('All AI providers failed');
}

// OpenRouter — OpenAI-compatible aggregator (free model variants available).
async function _callOpenRouter(prompt, system, maxTokens, temperature) {
  const messages = system ? [{ role: 'system', content: system }, { role: 'user', content: prompt }]
                          : [{ role: 'user', content: prompt }];
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://wappflow.remoteops.co',
      'X-Title': 'WappFlow CRM',
    },
    body: JSON.stringify({ model: OPENROUTER_MODEL, messages, temperature, max_tokens: maxTokens })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.error?.message || err.message || 'request failed';
    // Include the HTTP status so callLLM's rate-limit detector classifies 429s
    // correctly and fails over instead of surfacing a vague error.
    throw new Error(`OpenRouter ${res.status}: ${detail}`);
  }
  const data = await res.json();
  return { content: data.choices?.[0]?.message?.content || '', usage: _norm(data.usage), model: OPENROUTER_MODEL };
}

// Cerebras — OpenAI-compatible chat completions API.
async function _callCerebras(prompt, system, maxTokens, temperature) {
  const messages = system ? [{ role: 'system', content: system }, { role: 'user', content: prompt }]
                          : [{ role: 'user', content: prompt }];
  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CEREBRAS_KEY}` },
    body: JSON.stringify({ model: CEREBRAS_MODEL, messages, temperature, max_tokens: maxTokens })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || err.message || `Cerebras error ${res.status}`);
  }
  const data = await res.json();
  return { content: data.choices?.[0]?.message?.content || '', usage: _norm(data.usage), model: CEREBRAS_MODEL };
}

async function _callGroq(prompt, system, maxTokens, temperature) {
  const messages = system ? [{ role: 'system', content: system }, { role: 'user', content: prompt }]
                          : [{ role: 'user', content: prompt }];
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages, temperature, max_tokens: maxTokens })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq error ${res.status}`);
  }
  const data = await res.json();
  return { content: data.choices?.[0]?.message?.content || '', usage: _norm(data.usage), model: GROQ_MODEL };
}

async function _callOpenAI(prompt, system, maxTokens, temperature) {
  const messages = system ? [{ role: 'system', content: system }, { role: 'user', content: prompt }]
                          : [{ role: 'user', content: prompt }];
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({ model: OPENAI_MODEL, messages, temperature, max_tokens: maxTokens })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI error ${res.status}`);
  }
  const data = await res.json();
  return { content: data.choices?.[0]?.message?.content || '', usage: _norm(data.usage), model: OPENAI_MODEL };
}

async function _callAnthropic(prompt, system, maxTokens, temperature) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      temperature,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic error ${res.status}`);
  }
  const data = await res.json();
  return { content: data.content?.[0]?.text || '', usage: _norm(data.usage), model: ANTHROPIC_MODEL };
}

// ── JSON extraction from messy LLM output ──
function extractJSON(raw, type = 'object') {
  if (!raw) return null;
  let cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
  if (type === 'array') {
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
  } else {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
  }
  try { return JSON.parse(cleaned); } catch { return null; }
}

// ── Conversation context builder — used by every analysis prompt ──
function buildConversationContext(messages, lead, limit = 30) {
  const recent = messages.slice(-limit);
  const msgText = recent.map(m =>
    `${m.from_me ? 'Staff' : 'Customer'} [${new Date(m.timestamp).toLocaleTimeString()}]: ${m.body || '[media]'}`
  ).join('\n');
  return [
    `Lead Name: ${lead.customer_name || 'Unknown'}`,
    `Lead Status: ${lead.status || 'New'}`,
    `Lead Phone: ${lead.customer_phone || ''}`,
    `Source Platform: ${lead.platform_source || 'whatsapp'}`,
    `Estimated Value: ${lead.estimated_value || 0}`,
    `Messages (${messages.length} total, last ${recent.length} shown):`,
    msgText || 'No messages yet.'
  ].join('\n');
}

// ── High-level capabilities ────────────────────────────────────

// Combined lead intelligence: score + sentiment + urgency + intent in a single LLM call.
// Returns an object with: lead_score, lead_score_reason, sentiment, urgency, intent,
// intent_category, temperature, next_action, key_entities.
async function analyzeLeadIntelligence(messages, lead, memoryContext = '') {
  const context = buildConversationContext(messages, lead);
  const prompt = `
You are an AI sales analyst for a CRM. Analyze this conversation and return a JSON object with these fields:
{
  "intent": "one short phrase describing what the customer wants",
  "intent_category": "one of: pricing_inquiry, product_inquiry, appointment_booking, complaint, payment_issue, follow_up, general_inquiry, not_interested",
  "lead_score": <number 1-10>,
  "lead_score_reason": "one sentence explaining the score",
  "temperature": "one of: cold, warm, hot, urgent",
  "sentiment": "one of: positive, neutral, negative, frustrated",
  "urgency": "one of: low, medium, high, critical",
  "next_action": "one specific action the sales staff should take next",
  "key_entities": ["important", "topics", "mentioned"]
}
${memoryContext}
Return JSON only, no explanation, no markdown.

${context}
  `.trim();
  const raw = await callLLM(prompt, { temperature: 0.2 });
  const parsed = extractJSON(raw, 'object');
  return parsed || {
    intent: 'Unable to analyze',
    intent_category: 'general_inquiry',
    lead_score: 5,
    lead_score_reason: 'Insufficient data',
    temperature: 'warm',
    sentiment: 'neutral',
    urgency: 'low',
    next_action: 'Review conversation manually',
    key_entities: []
  };
}

// Quick single-message sentiment — cheap, used for inline UI hints.
async function detectSentiment(text) {
  if (!text || text.trim().length < 3) return { sentiment: 'neutral', confidence: 0 };
  const prompt = `Classify the sentiment of this customer message. Return JSON only:
{"sentiment": "positive|neutral|negative|frustrated", "confidence": 0-100}

Message: ${text}`;
  try {
    const raw = await callLLM(prompt, { temperature: 0.1, maxTokens: 64 });
    return extractJSON(raw, 'object') || { sentiment: 'neutral', confidence: 0 };
  } catch {
    return { sentiment: 'neutral', confidence: 0 };
  }
}

// Generate a concise chat summary (2-3 sentences).
async function summarizeConversation(messages, lead, memoryContext = '') {
  const context = buildConversationContext(messages, lead);
  const prompt = `
You are an AI sales assistant for a CRM.
${memoryContext}
Analyze this conversation and provide a concise summary in 2-3 sentences.
Focus on: what the customer wants, their current status, and what action is needed next.
Respond in plain text only, no formatting.

${context}
  `.trim();
  return callLLM(prompt, { temperature: 0.3, maxTokens: 512 });
}

// Draft 3 ready-to-send reply suggestions, optionally biased by intent.
async function suggestReplies(messages, lead, { businessName = '', presets = [], memoryContext = '', intent = null } = {}) {
  const context = buildConversationContext(messages, lead);
  const presetsText = presets.length ? `Existing message templates:\n${presets.map(p => `- ${p.title}: ${p.body}`).join('\n')}` : '';
  const intentLine = intent ? `The customer's likely intent is: ${intent}. Tailor your replies accordingly.` : '';
  const prompt = `
You are an AI sales assistant for a CRM.
Business: ${businessName || 'Unknown Business'}
${memoryContext}
${presetsText}
${intentLine}

Based on this conversation, suggest exactly 3 short WhatsApp reply options.
Each reply should be natural, professional, and ready to send. Avoid generic openings.
Format your response as a JSON array only, no explanation:
["reply 1", "reply 2", "reply 3"]

${context}
  `.trim();
  const raw = await callLLM(prompt, { temperature: 0.5, maxTokens: 512 });
  const parsed = extractJSON(raw, 'array');
  if (parsed && Array.isArray(parsed)) return parsed.slice(0, 3);
  return raw.split('\n')
    .map(l => l.replace(/^[\d.\-*\s"]+|["]+$/g, '').trim())
    .filter(l => l.length > 5)
    .slice(0, 3);
}

// Conversation tools — small one-shot transforms on text snippets.
async function rewriteMessage(text, tone = 'professional') {
  if (!text) return '';
  const prompt = `Rewrite this WhatsApp message in a ${tone} tone. Keep the meaning, change only the style. Return only the rewritten text:\n\n${text}`;
  return (await callLLM(prompt, { temperature: 0.4, maxTokens: 256 })).trim().replace(/^["']|["']$/g, '');
}

async function translateMessage(text, targetLang = 'English') {
  if (!text) return '';
  const prompt = `Translate the following message to ${targetLang}. Return only the translation, no explanation:\n\n${text}`;
  return (await callLLM(prompt, { temperature: 0.2, maxTokens: 512 })).trim().replace(/^["']|["']$/g, '');
}

async function shortenMessage(text) {
  if (!text) return '';
  const prompt = `Shorten this message to its essential meaning while keeping a friendly tone. Return only the shortened text:\n\n${text}`;
  return (await callLLM(prompt, { temperature: 0.3, maxTokens: 256 })).trim().replace(/^["']|["']$/g, '');
}

// Build a memory-context string for prompts from workspace ai_memories rows.
function formatMemoryContext(memories) {
  if (!memories || memories.length === 0) return '';
  return '\nBusiness Knowledge:\n' + memories.map(m => `- ${m.key}: ${m.value}`).join('\n');
}

// Format a workspace AI profile into a system-prompt-ready string.
// Pass this as `system` to callLLM, or prepend to prompt.
function formatProfileContext(profile) {
  if (!profile) return '';
  const parts = [];
  if (profile.business_description) parts.push(`About the business:\n${profile.business_description}`);
  if (profile.tone) parts.push(`Preferred tone: ${profile.tone}`);
  if (profile.language) parts.push(`Respond in: ${profile.language}`);
  if (profile.dos) parts.push(`DO:\n${profile.dos}`);
  if (profile.donts) parts.push(`DO NOT:\n${profile.donts}`);
  if (profile.signature) parts.push(`Sign off with: ${profile.signature}`);
  return parts.length ? '\n' + parts.join('\n\n') + '\n' : '';
}

module.exports = {
  callLLM,
  setMeter,
  extractJSON,
  buildConversationContext,
  formatMemoryContext,
  formatProfileContext,
  analyzeLeadIntelligence,
  detectSentiment,
  summarizeConversation,
  suggestReplies,
  rewriteMessage,
  translateMessage,
  shortenMessage,
  // Provider info for diagnostics
  getActiveProvider: () => DEFAULT_PROVIDER,
};
