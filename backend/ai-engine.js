// ════════════════════════════════════════════════════════════
//  CENTRALIZED AI ENGINE
// ════════════════════════════════════════════════════════════
// Single source of truth for LLM calls, prompt patterns, context building.
// Existing server.js routes can migrate to use these functions over time;
// new AI features should be added here, not inline in server.js.

const DEFAULT_PROVIDER = process.env.AI_PROVIDER || 'groq';
const GROQ_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

// ── Low-level LLM call — provider abstraction ──
async function callLLM(prompt, { maxTokens = 2048, temperature = 0.3, system = null, provider } = {}) {
  const p = provider || DEFAULT_PROVIDER;
  if (p === 'openai' && OPENAI_KEY) return _callOpenAI(prompt, system, maxTokens, temperature);
  if (p === 'anthropic' && ANTHROPIC_KEY) return _callAnthropic(prompt, system, maxTokens, temperature);
  if (!GROQ_KEY) throw new Error('No AI provider configured — set GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY');
  return _callGroq(prompt, system, maxTokens, temperature);
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
  return data.choices?.[0]?.message?.content || '';
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
  return data.choices?.[0]?.message?.content || '';
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
  return data.content?.[0]?.text || '';
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
