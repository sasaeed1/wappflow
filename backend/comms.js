'use strict';

// ════════════════════════════════════════════════════════════════════════════
//  COMMUNICATIONS 2.0  (Final Vision · Phase 4)
//  Additive module on top of the existing chat_channels / chat_messages /
//  chat_reactions tables. Adds DMs, threads, @mentions, pinned messages, presence,
//  unread + read-state, search, message edit, typing — all real-time over the
//  existing SSE broadcast (no polling) — plus LiveKit access-token minting for
//  voice/video/screenshare rooms (replacing the old public-Jitsi huddle).
//
//  Transport split: text/state ride the existing SSE (broadcastToWorkspace);
//  voice/video/screenshare ride self-hosted LiveKit (the client connects with the
//  token minted here). LiveKit env: LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET.
// ════════════════════════════════════════════════════════════════════════════

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

// Mint a LiveKit access token (a JWT with a `video` grant — same shape the
// livekit-server-sdk produces, hand-rolled to avoid a new dependency).
function mintLivekitToken({ room, identity, name, canPublish = true, canSubscribe = true }) {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: LIVEKIT_API_KEY,
    sub: identity,
    nbf: now,
    exp: now + 6 * 3600,
    name: name || identity,
    video: { room, roomJoin: true, canPublish, canSubscribe, canPublishData: true },
  };
  return jwt.sign(payload, LIVEKIT_API_SECRET, { algorithm: 'HS256' });
}

module.exports = function mountComms(app, db, deps = {}) {
  const {
    auth = (req, res, next) => next(),
    generateId = () => crypto.randomUUID(),
    broadcastToWorkspace = () => {},
    broadcastToUser = () => {},
    onlineUsers = () => [],
    sendPushToUser = async () => {},
  } = deps;

  // ── Schema (additive; the chat_* base tables are owned by server.js) ─────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_members (
      channel_id TEXT NOT NULL, user_id TEXT NOT NULL,
      last_read_at TIMESTAMP, muted INTEGER DEFAULT 0,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (channel_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS chat_pins (
      id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, message_id TEXT NOT NULL,
      pinned_by TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (channel_id, message_id)
    );
    CREATE TABLE IF NOT EXISTS chat_mentions (
      id TEXT PRIMARY KEY, message_id TEXT NOT NULL, channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL, author_id TEXT, read_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_mentions_user ON chat_mentions(user_id, read_at);
    CREATE INDEX IF NOT EXISTS idx_chat_pins_channel ON chat_pins(channel_id);
  `);

  const wsOf = (channelId) => { const c = db.prepare('SELECT workspace_id FROM chat_channels WHERE id = ?').get(channelId); return c && c.workspace_id; };
  const isDM = (id) => typeof id === 'string' && id.startsWith('dm_');
  // A user can see a channel if it's a public workspace channel OR they're a member.
  function canSee(channelId, userId, workspaceId) {
    const c = db.prepare('SELECT workspace_id, is_private FROM chat_channels WHERE id = ?').get(channelId);
    if (!c || c.workspace_id !== workspaceId) return false;
    if (!c.is_private) return true;
    return !!db.prepare('SELECT 1 FROM chat_members WHERE channel_id = ? AND user_id = ?').get(channelId, userId);
  }

  // ── Hook the server's message-send path: real-time + mentions ────────────────
  // server.js POST /api/chat/.../messages calls this after inserting a message.
  function afterMessage(message, mentions) {
    if (!message) return;
    const workspaceId = wsOf(message.channel_id);
    if (!workspaceId) return;
    // Real-time fan-out (replaces the 3s poll on the client).
    broadcastToWorkspace(workspaceId, 'chat_message', { channel_id: message.channel_id, message });
    // @mentions: persist + notify each mentioned user (deduped, never self).
    const ids = Array.isArray(mentions) ? [...new Set(mentions.filter(u => u && u !== message.user_id))] : [];
    for (const uid of ids) {
      try {
        db.prepare('INSERT INTO chat_mentions (id, message_id, channel_id, user_id, author_id) VALUES (?,?,?,?,?)')
          .run(generateId(), message.id, message.channel_id, uid, message.user_id);
        broadcastToUser(uid, 'chat_mention', { channel_id: message.channel_id, message });
        const ch = db.prepare('SELECT name FROM chat_channels WHERE id = ?').get(message.channel_id);
        sendPushToUser(uid, `${message.sender_name} mentioned you`, (message.body || '').slice(0, 140), { channel_id: message.channel_id, kind: 'mention' }).catch(() => {});
      } catch { /* mention is best-effort */ }
    }
  }

  // ── Direct messages ─────────────────────────────────────────────────────────
  // Open (find-or-create) a 1:1 DM channel with another workspace member.
  app.post('/api/comms/dm/:userId', auth, (req, res) => {
    try {
      const me = req.userId, other = req.params.userId;
      if (!other || other === me) return res.status(400).json({ error: 'pick another member' });
      const member = db.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(req.workspaceId, other);
      if (!member) return res.status(404).json({ error: 'member not found' });
      const key = [me, other].sort().join('_');
      const id = 'dm_' + crypto.createHash('sha1').update(req.workspaceId + ':' + key).digest('hex').slice(0, 24);
      if (!db.prepare('SELECT 1 FROM chat_channels WHERE id = ?').get(id)) {
        db.prepare('INSERT INTO chat_channels (id, workspace_id, name, description, is_private, created_by) VALUES (?,?,?,?,1,?)')
          .run(id, req.workspaceId, '', 'dm', me);
        const addMem = db.prepare('INSERT OR IGNORE INTO chat_members (channel_id, user_id) VALUES (?,?)');
        addMem.run(id, me); addMem.run(id, other);
      }
      res.json({ channel_id: id, dm: true, with: other });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // My DM channels (most-recent first), with the counterpart + last message.
  app.get('/api/comms/dms', auth, (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT c.id, c.created_at,
          (SELECT user_id FROM chat_members WHERE channel_id = c.id AND user_id != ? LIMIT 1) AS other_id,
          (SELECT body FROM chat_messages WHERE channel_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
          (SELECT created_at FROM chat_messages WHERE channel_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_at
        FROM chat_channels c
        JOIN chat_members m ON m.channel_id = c.id AND m.user_id = ?
        WHERE c.workspace_id = ? AND c.id LIKE 'dm_%'
        ORDER BY COALESCE(last_message_at, c.created_at) DESC
      `).all(req.userId, req.userId, req.workspaceId);
      res.json({ dms: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Read state + unread ─────────────────────────────────────────────────────
  app.post('/api/comms/channels/:id/read', auth, (req, res) => {
    try {
      if (!canSee(req.params.id, req.userId, req.workspaceId)) return res.status(404).json({ error: 'channel not found' });
      db.prepare(`INSERT INTO chat_members (channel_id, user_id, last_read_at) VALUES (?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(channel_id, user_id) DO UPDATE SET last_read_at = CURRENT_TIMESTAMP`).run(req.params.id, req.userId);
      db.prepare('UPDATE chat_mentions SET read_at = CURRENT_TIMESTAMP WHERE channel_id = ? AND user_id = ? AND read_at IS NULL').run(req.params.id, req.userId);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Per-channel unread counts + total unread mentions.
  app.get('/api/comms/unread', auth, (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT c.id AS channel_id,
          (SELECT COUNT(*) FROM chat_messages m
             WHERE m.channel_id = c.id AND m.user_id != ?
               AND m.created_at > COALESCE((SELECT last_read_at FROM chat_members WHERE channel_id = c.id AND user_id = ?), '1970-01-01')
          ) AS unread
        FROM chat_channels c
        LEFT JOIN chat_members mem ON mem.channel_id = c.id AND mem.user_id = ?
        WHERE c.workspace_id = ? AND (c.is_private = 0 OR mem.user_id IS NOT NULL)
      `).all(req.userId, req.userId, req.userId, req.workspaceId);
      const mentions = db.prepare('SELECT COUNT(*) AS c FROM chat_mentions WHERE user_id = ? AND read_at IS NULL').get(req.userId).c;
      const unread = {}; rows.forEach(r => { unread[r.channel_id] = r.unread; });
      res.json({ unread, mentions });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Mentions inbox ──────────────────────────────────────────────────────────
  app.get('/api/comms/mentions', auth, (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT mn.id, mn.channel_id, mn.read_at, mn.created_at, m.body, m.sender_name, m.id AS message_id, c.name AS channel_name
        FROM chat_mentions mn
        JOIN chat_messages m ON m.id = mn.message_id
        JOIN chat_channels c ON c.id = mn.channel_id
        WHERE mn.user_id = ? ORDER BY mn.created_at DESC LIMIT 50
      `).all(req.userId);
      res.json({ mentions: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Pinned messages ─────────────────────────────────────────────────────────
  app.post('/api/comms/messages/:id/pin', auth, (req, res) => {
    try {
      const m = db.prepare('SELECT id, channel_id FROM chat_messages WHERE id = ?').get(req.params.id);
      if (!m || !canSee(m.channel_id, req.userId, req.workspaceId)) return res.status(404).json({ error: 'message not found' });
      db.prepare('INSERT OR IGNORE INTO chat_pins (id, channel_id, message_id, pinned_by) VALUES (?,?,?,?)').run(generateId(), m.channel_id, m.id, req.userId);
      broadcastToWorkspace(req.workspaceId, 'chat_pin', { channel_id: m.channel_id, message_id: m.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/comms/messages/:id/pin', auth, (req, res) => {
    try {
      const m = db.prepare('SELECT channel_id FROM chat_messages WHERE id = ?').get(req.params.id);
      db.prepare('DELETE FROM chat_pins WHERE message_id = ?').run(req.params.id);
      if (m) broadcastToWorkspace(req.workspaceId, 'chat_unpin', { channel_id: m.channel_id, message_id: req.params.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/comms/channels/:id/pins', auth, (req, res) => {
    try {
      if (!canSee(req.params.id, req.userId, req.workspaceId)) return res.status(404).json({ error: 'channel not found' });
      const rows = db.prepare(`
        SELECT p.message_id, p.created_at AS pinned_at, m.body, m.sender_name, m.user_id, m.media_url, m.media_type
        FROM chat_pins p JOIN chat_messages m ON m.id = p.message_id
        WHERE p.channel_id = ? ORDER BY p.created_at DESC
      `).all(req.params.id);
      res.json({ pins: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Threads ─────────────────────────────────────────────────────────────────
  // Replies to a root message (reply_to already exists on chat_messages).
  app.get('/api/comms/messages/:id/thread', auth, (req, res) => {
    try {
      const root = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(req.params.id);
      if (!root || !canSee(root.channel_id, req.userId, req.workspaceId)) return res.status(404).json({ error: 'message not found' });
      const replies = db.prepare('SELECT * FROM chat_messages WHERE reply_to = ? ORDER BY created_at ASC').all(req.params.id);
      res.json({ root, replies });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Message edit (author only) ──────────────────────────────────────────────
  app.put('/api/comms/messages/:id', auth, (req, res) => {
    try {
      const m = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(req.params.id);
      if (!m || m.user_id !== req.userId) return res.status(403).json({ error: 'not your message' });
      const body = (req.body.body || '').toString();
      if (!body.trim()) return res.status(400).json({ error: 'empty' });
      db.prepare('UPDATE chat_messages SET body = ?, is_edited = 1 WHERE id = ?').run(body, m.id);
      const updated = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(m.id);
      broadcastToWorkspace(req.workspaceId, 'chat_edit', { channel_id: m.channel_id, message: updated });
      res.json({ message: updated });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Search (across the channels I can see) ──────────────────────────────────
  app.get('/api/comms/search', auth, (req, res) => {
    try {
      const q = (req.query.q || '').toString().trim();
      if (q.length < 2) return res.json({ results: [] });
      const rows = db.prepare(`
        SELECT m.id, m.channel_id, m.body, m.sender_name, m.created_at, c.name AS channel_name, c.is_private
        FROM chat_messages m JOIN chat_channels c ON c.id = m.channel_id
        LEFT JOIN chat_members mem ON mem.channel_id = c.id AND mem.user_id = ?
        WHERE c.workspace_id = ? AND (c.is_private = 0 OR mem.user_id IS NOT NULL)
          AND m.body LIKE ? ESCAPE '\\'
        ORDER BY m.created_at DESC LIMIT 50
      `).all(req.userId, req.workspaceId, '%' + q.replace(/[%_\\]/g, '\\$&') + '%');
      res.json({ results: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Presence + typing ───────────────────────────────────────────────────────
  app.get('/api/comms/presence', auth, (req, res) => {
    try {
      const online = new Set(onlineUsers());
      const members = db.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ? AND user_id IS NOT NULL').all(req.workspaceId);
      res.json({ online: members.map(m => m.user_id).filter(id => online.has(id)) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/comms/typing', auth, (req, res) => {
    try {
      const { channel_id } = req.body || {};
      if (channel_id) broadcastToWorkspace(req.workspaceId, 'chat_typing', { channel_id, user_id: req.userId, name: req.senderName });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── LiveKit: real-time voice/video/screenshare token ────────────────────────
  // POST /api/comms/livekit/token { room } → { token, url, room, identity }
  app.post('/api/comms/livekit/token', auth, (req, res) => {
    try {
      if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
        return res.status(503).json({ error: 'LiveKit not configured', configured: false });
      }
      const raw = (req.body.room || '').toString().trim();
      if (!raw) return res.status(400).json({ error: 'room required' });
      // Namespace rooms per workspace so two studios never share a room.
      const room = `ws_${req.workspaceId}_${raw}`.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 96);
      const identity = req.userId;
      const token = mintLivekitToken({ room, identity, name: req.senderName });
      if (!token) return res.status(503).json({ error: 'LiveKit not configured', configured: false });
      res.json({ token, url: LIVEKIT_URL, room, identity });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Lightweight capability probe for the client (show/hide call buttons).
  app.get('/api/comms/livekit/config', auth, (req, res) => {
    res.json({ configured: !!(LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET), url: LIVEKIT_URL || null });
  });

  console.log('💬 Communications 2.0 mounted at /api/comms/* (LiveKit ' + (LIVEKIT_URL ? 'configured' : 'NOT configured') + ')');
  return { afterMessage, mintLivekitToken };
};

// Exposed for tests.
module.exports.mintLivekitToken = mintLivekitToken;
