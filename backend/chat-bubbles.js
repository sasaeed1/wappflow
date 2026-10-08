'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Chat bubbles (PROP-007) — Messenger-style chat heads.
//
//  • A per-user on/off setting: users.chat_bubbles (default on).
//      GET /api/me/preferences          → { chat_bubbles: true }
//      PUT /api/me/preferences          { chat_bubbles: false }
//  • When a customer message arrives and WappFlow is closed, the member gets a
//    push notification instead of a bubble (a web app cannot draw over other
//    apps). onBroadcast() is called from broadcastToWorkspace for every frame;
//    it acts only on inbound `new_message` frames. The WhatsApp service is not
//    touched — this rides the fan-out it already uses.
//
//  Pushes respect lead visibility (a member without view_all_leads hears only
//  about leads assigned to them), carry a per-lead tag so a burst of messages
//  replaces one notification instead of stacking, and are rate-limited per
//  member per lead.
// ════════════════════════════════════════════════════════════════════════════

const COOLDOWN_MS = 30 * 1000;
const PREVIEW = 80;

const MEDIA_LABEL = { image: '📷 Photo', video: '🎥 Video', audio: '🎤 Voice message', ptt: '🎤 Voice message', document: '📄 Document', sticker: 'Sticker' };

/** What the notification says for a message row. Pure, for tests. */
function previewOf(message) {
  const body = String(message?.body || '').replace(/\s+/g, ' ').trim();
  if (body && !/^\[(image|video|audio|document|sticker|media)\]$/i.test(body)) {
    return body.length > PREVIEW ? body.slice(0, PREVIEW - 1) + '…' : body;
  }
  const kind = String(message?.media_type || '').split('/')[0].toLowerCase();
  return MEDIA_LABEL[kind] || (message?.media_url ? '📎 Attachment' : 'New message');
}

module.exports = function chatBubbles(app, db, { auth, safeAlter, sendPushToUser, workspaceMemberIds, canMemberSeeLead }) {
  safeAlter('ALTER TABLE users ADD COLUMN chat_bubbles INTEGER DEFAULT 1');

  const enabledFor = (userId) => {
    const row = db.prepare('SELECT chat_bubbles FROM users WHERE id = ?').get(userId);
    return !row || row.chat_bubbles == null || row.chat_bubbles === 1;
  };

  app.get('/api/me/preferences', auth, (req, res) => {
    res.json({ chat_bubbles: enabledFor(req.userId) });
  });

  app.put('/api/me/preferences', auth, (req, res) => {
    const { chat_bubbles } = req.body || {};
    if (typeof chat_bubbles !== 'boolean') return res.status(400).json({ error: 'Choose on or off for chat bubbles.' });
    db.prepare('UPDATE users SET chat_bubbles = ? WHERE id = ?').run(chat_bubbles ? 1 : 0, req.userId);
    res.json({ chat_bubbles });
  });

  const lastPush = new Map(); // `${userId}:${leadId}` → ms

  function onBroadcast(workspaceId, type, data) {
    if (type !== 'new_message' || !workspaceId || !data) return;
    const msg = data.message;
    if (!msg || msg.from_me === 1 || msg.from_me === true) return; // the studio's own messages
    const leadId = data.lead_id || msg.lead_id;
    if (!leadId) return;
    let lead;
    try { lead = db.prepare('SELECT id, workspace_id, customer_name, customer_phone, assigned_to FROM leads WHERE id = ?').get(leadId); } catch { return; }
    if (!lead || lead.workspace_id !== workspaceId) return;

    const name = lead.customer_name || data.customer_name || lead.customer_phone || 'A customer';
    const body = previewOf(msg);
    const now = Date.now();
    for (const userId of workspaceMemberIds(workspaceId)) {
      try {
        if (!enabledFor(userId) || !canMemberSeeLead(workspaceId, userId, lead)) continue;
        const key = `${userId}:${leadId}`;
        if (now - (lastPush.get(key) || 0) < COOLDOWN_MS) continue;
        lastPush.set(key, now);
        sendPushToUser(userId, name, body, {
          url: `/dashboard?bubble=${encodeURIComponent(leadId)}`,
          tag: `wf-chat-${leadId}`, kind: 'chat', lead_id: leadId,
        }).catch(() => {});
      } catch { /* one member's failure never blocks the rest */ }
    }
    if (lastPush.size > 5000) { for (const [k, t] of lastPush) if (now - t > COOLDOWN_MS) lastPush.delete(k); }
  }

  return { onBroadcast, enabledFor };
};

module.exports.previewOf = previewOf;
