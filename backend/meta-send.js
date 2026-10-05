'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Replying on Instagram and Facebook Messenger (PROP-006).
//
//  Both channels only ever RECEIVED: a reply typed to an Instagram or Facebook lead
//  was saved as a draft and never left WappFlow. This sends it through Meta's
//  Send API with the page access token already saved on the connected account
//  (Settings → Connections), to the sender id the webhook recorded on the lead.
//
//  Meta only accepts business replies within 24 hours of the customer's last
//  message (the "standard messaging window"). Outside it — or with an expired
//  token — Meta refuses; the message stays in the chat as an undelivered draft and
//  the reason is shown, rather than pretending it went.
//
//  Separate from the WhatsApp flow on purpose: nothing here touches it.
// ════════════════════════════════════════════════════════════════════════════

const GRAPH = () => (process.env.META_GRAPH_URL || 'https://graph.facebook.com/v19.0').replace(/\/+$/, '');

function readCreds(account) {
  try { return JSON.parse(account?.credentials || '{}'); } catch { return {}; }
}

// Turn Meta's error into something a business owner can act on.
function explain(err) {
  const code = err?.code, sub = err?.error_subcode;
  if (code === 10 || sub === 2018278 || /outside of allowed window|24 hour/i.test(err?.message || '')) {
    return 'Meta only allows replies within 24 hours of the customer’s last message. Ask them to message you again, or reply from the Meta app.';
  }
  if (code === 190) return 'The page access token has expired. Reconnect this account in Settings → Connections.';
  if (code === 200 || code === 10 || code === 230) return 'This page token doesn’t have messaging permission. Reconnect it with the messaging permissions.';
  if (code === 551 || sub === 1545041) return 'This person isn’t available to message right now.';
  return err?.message ? `Meta refused the message: ${String(err.message).slice(0, 160)}` : 'Meta refused the message.';
}

/**
 * Send a text reply. Returns { delivered: true, id } or { delivered: false, error }.
 * `account` is the platform_accounts row; `recipientId` the sender id from the webhook.
 */
async function sendMetaText({ account, recipientId, text, fetchImpl = fetch }) {
  const token = readCreds(account).access_token;
  if (!token) return { delivered: false, error: 'This account has no page access token. Add it in Settings → Connections.' };
  if (!recipientId) return { delivered: false, error: 'This contact has no Instagram/Facebook id to reply to.' };
  const body = String(text || '').slice(0, 2000);
  if (!body.trim()) return { delivered: false, error: 'Write a message first.' };
  try {
    const r = await fetchImpl(`${GRAPH()}/me/messages?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: String(recipientId) }, messaging_type: 'RESPONSE', message: { text: body } }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) return { delivered: false, error: explain(data.error || { message: `HTTP ${r.status}` }) };
    return { delivered: true, id: data.message_id || null };
  } catch (e) {
    return { delivered: false, error: 'Couldn’t reach Meta. Check the server’s internet connection and try again.' };
  }
}

module.exports = { sendMetaText, explain };
