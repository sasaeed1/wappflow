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
    notify = () => {},
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
    CREATE TABLE IF NOT EXISTS project_rooms (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL, channel_id TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (workspace_id, entity_type, entity_id)
    );
    CREATE TABLE IF NOT EXISTS user_presence (
      workspace_id TEXT NOT NULL, user_id TEXT NOT NULL,
      state TEXT DEFAULT 'online',           -- online | away | dnd
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS call_sessions (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, channel_id TEXT NOT NULL,
      room TEXT, started_by TEXT, started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP, duration_s INTEGER
    );
    CREATE TABLE IF NOT EXISTS call_events (
      id TEXT PRIMARY KEY, call_id TEXT NOT NULL, user_id TEXT, name TEXT,
      type TEXT NOT NULL,                    -- started | joined | left | screenshare | raise_hand | lower_hand | ended
      at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_mentions_user ON chat_mentions(user_id, read_at);
    CREATE INDEX IF NOT EXISTS idx_chat_pins_channel ON chat_pins(channel_id);
    CREATE INDEX IF NOT EXISTS idx_project_rooms_entity ON project_rooms(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_call_events_call ON call_events(call_id);
  `);

  const wsOf = (channelId) => { const c = db.prepare('SELECT workspace_id FROM chat_channels WHERE id = ?').get(channelId); return c && c.workspace_id; };
  // DND suppresses push + the unified feed (the in-app mention/record is still written).
  const presenceState = (workspaceId, userId) => { try { const r = db.prepare('SELECT state FROM user_presence WHERE workspace_id=? AND user_id=?').get(workspaceId, userId); return (r && r.state) || 'online'; } catch { return 'online'; } };
  const isDnd = (workspaceId, userId) => presenceState(workspaceId, userId) === 'dnd';
  // Members of a channel (explicit members for private/DM/room; all workspace members for public).
  function channelMemberIds(channelId, workspaceId) {
    const c = db.prepare('SELECT is_private FROM chat_channels WHERE id = ?').get(channelId);
    if (c && !c.is_private) return db.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ? AND user_id IS NOT NULL').all(workspaceId).map(r => r.user_id);
    return db.prepare('SELECT user_id FROM chat_members WHERE channel_id = ?').all(channelId).map(r => r.user_id);
  }
  // Fan a channel event out to THAT CHANNEL'S members only.
  //
  // Phase 5 (security): every chat event used to go to the whole workspace —
  // message bodies of private channels and 1:1 DMs were written to every
  // member's SSE stream, and only hidden by client-side filtering. The data was
  // on the wire regardless of who was allowed to read it. Membership already
  // had an authoritative answer (channelMemberIds); nothing was consulting it
  // for fan-out. Public channels resolve to the whole workspace, so their
  // behaviour is unchanged.
  function broadcastToChannel(channelId, workspaceId, type, data) {
    try {
      for (const uid of channelMemberIds(channelId, workspaceId)) broadcastToUser(uid, type, data);
    } catch {
      // Membership unresolvable (deleted channel mid-flight): drop the frame
      // rather than falling back to a workspace-wide send. Losing a live update
      // is recoverable; leaking a private message is not.
    }
  }

  // Resolve a project-room channel id to the lead it belongs to (for timeline mirroring).
  function resolveRoomLead(channelId) {
    const rm = String(channelId || '').match(/^room_([a-z]+)_(.+)$/);
    if (!rm) return null;
    const type = rm[1], eid = rm[2];
    try {
      if (type === 'lead') return eid;
      if (type === 'project') return (db.prepare('SELECT lead_id FROM ms_projects WHERE id = ?').get(eid) || {}).lead_id || null;
      if (type === 'contract') return (db.prepare('SELECT lead_id FROM cs_documents WHERE id = ?').get(eid) || {}).lead_id || null;
      if (type === 'booking') return (db.prepare('SELECT lead_id FROM bookings WHERE id = ?').get(eid) || {}).lead_id || null;
      if (type === 'gallery') { const g = db.prepare('SELECT project_id FROM ms_galleries WHERE id = ?').get(eid); if (g) return (db.prepare('SELECT lead_id FROM ms_projects WHERE id = ?').get(g.project_id) || {}).lead_id || null; }
    } catch {}
    return null;
  }
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
    broadcastToChannel(message.channel_id, workspaceId, 'chat_message', { channel_id: message.channel_id, message });
    // Project room → mirror onto the linked lead's timeline. Any entity type resolves
    // to its lead (project/contract/booking carry lead_id; gallery → project → lead).
    const rm = message.channel_id.match(/^room_([a-z]+)_(.+)$/);
    if (rm) {
      const type = rm[1], eid = rm[2];
      let leadId = null;
      try {
        if (type === 'lead') leadId = eid;
        else if (type === 'project') leadId = (db.prepare('SELECT lead_id FROM ms_projects WHERE id = ?').get(eid) || {}).lead_id;
        else if (type === 'contract') leadId = (db.prepare('SELECT lead_id FROM cs_documents WHERE id = ?').get(eid) || {}).lead_id;
        else if (type === 'booking') leadId = (db.prepare('SELECT lead_id FROM bookings WHERE id = ?').get(eid) || {}).lead_id;
        else if (type === 'gallery') { const g = db.prepare('SELECT project_id FROM ms_galleries WHERE id = ?').get(eid); if (g) leadId = (db.prepare('SELECT lead_id FROM ms_projects WHERE id = ?').get(g.project_id) || {}).lead_id; }
      } catch { /* entity/column may not exist — skip mirror */ }
      if (leadId) {
        try {
          db.prepare(`INSERT INTO activity_timeline (id, lead_id, workspace_id, user_id, actor_name, activity_type, title, body)
            VALUES (?,?,?,?,?,?,?,?)`).run(generateId(), leadId, workspaceId, message.user_id, message.sender_name, 'room_message', `${type} room message`, (message.body || '').slice(0, 200));
        } catch { /* timeline mirror is best-effort */ }
      }
    }
    // @mentions: persist + notify each mentioned user (deduped, never self).
    // @channel / @everyone / @here expand to the whole channel membership.
    let ids = Array.isArray(mentions) ? mentions.filter(Boolean) : [];
    if (/@(channel|everyone|here)\b/i.test(message.body || '')) {
      try { ids = ids.concat(channelMemberIds(message.channel_id, workspaceId)); } catch {}
    }
    ids = [...new Set(ids.filter(u => u && u !== message.user_id))];
    for (const uid of ids) {
      try {
        db.prepare('INSERT INTO chat_mentions (id, message_id, channel_id, user_id, author_id) VALUES (?,?,?,?,?)')
          .run(generateId(), message.id, message.channel_id, uid, message.user_id);
        broadcastToUser(uid, 'chat_mention', { channel_id: message.channel_id, message });
        if (!isDnd(workspaceId, uid)) sendPushToUser(uid, `${message.sender_name} mentioned you`, (message.body || '').slice(0, 140), { channel_id: message.channel_id, kind: 'mention' }).catch(() => {});
      } catch { /* mention is best-effort */ }
    }
    // Thread reply → notify the root author (if not self and not already mentioned).
    if (message.reply_to) {
      try {
        const root = db.prepare('SELECT user_id FROM chat_messages WHERE id = ?').get(message.reply_to);
        const rootAuthor = root && root.user_id;
        if (rootAuthor && rootAuthor !== message.user_id && !ids.includes(rootAuthor)) {
          broadcastToUser(rootAuthor, 'chat_thread_reply', { channel_id: message.channel_id, message, root_id: message.reply_to });
          if (!isDnd(workspaceId, rootAuthor)) sendPushToUser(rootAuthor, `${message.sender_name} replied in a thread`, (message.body || '').slice(0, 140), { channel_id: message.channel_id, kind: 'thread' }).catch(() => {});
        }
      } catch { /* best-effort */ }
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
      broadcastToChannel(m.channel_id, req.workspaceId, 'chat_pin', { channel_id: m.channel_id, message_id: m.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/comms/messages/:id/pin', auth, (req, res) => {
    try {
      const m = db.prepare('SELECT channel_id FROM chat_messages WHERE id = ?').get(req.params.id);
      db.prepare('DELETE FROM chat_pins WHERE message_id = ?').run(req.params.id);
      if (m) broadcastToChannel(m.channel_id, req.workspaceId, 'chat_unpin', { channel_id: m.channel_id, message_id: req.params.id });
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
      broadcastToChannel(m.channel_id, req.workspaceId, 'chat_edit', { channel_id: m.channel_id, message: updated });
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
  // online = has a live SSE connection AND hasn't set away/dnd; states carries the
  // self-set away/dnd overlay so the UI can show the right dot per member.
  app.get('/api/comms/presence', auth, (req, res) => {
    try {
      const online = new Set(onlineUsers());
      const members = db.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ? AND user_id IS NOT NULL').all(req.workspaceId).map(m => m.user_id);
      const states = {};
      for (const r of db.prepare('SELECT user_id, state FROM user_presence WHERE workspace_id = ?').all(req.workspaceId)) states[r.user_id] = r.state;
      const onlineIds = members.filter(id => online.has(id) && states[id] !== 'away' && states[id] !== 'dnd');
      res.json({ online: onlineIds, states, connected: members.filter(id => online.has(id)) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Set my presence state (online | away | dnd). Broadcast so rosters update live.
  app.post('/api/comms/presence/state', auth, (req, res) => {
    try {
      const state = ['online', 'away', 'dnd'].includes((req.body.state || '').toLowerCase()) ? req.body.state.toLowerCase() : 'online';
      db.prepare(`INSERT INTO user_presence (workspace_id, user_id, state, updated_at) VALUES (?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(workspace_id, user_id) DO UPDATE SET state = excluded.state, updated_at = CURRENT_TIMESTAMP`).run(req.workspaceId, req.userId, state);
      broadcastToWorkspace(req.workspaceId, 'chat_presence', { user_id: req.userId, state });
      res.json({ ok: true, state });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Per-message read receipts (derived from members' last_read_at — no extra writes) ──
  app.get('/api/comms/messages/:id/receipts', auth, (req, res) => {
    try {
      const m = db.prepare('SELECT id, channel_id, created_at, user_id FROM chat_messages WHERE id = ?').get(req.params.id);
      if (!m || !canSee(m.channel_id, req.userId, req.workspaceId)) return res.status(404).json({ error: 'message not found' });
      const seen = db.prepare(`SELECT user_id, last_read_at FROM chat_members
        WHERE channel_id = ? AND user_id != ? AND last_read_at IS NOT NULL AND last_read_at >= ?`).all(m.channel_id, m.user_id, m.created_at);
      res.json({ message_id: m.id, seen_by: seen.map(s => s.user_id), receipts: seen });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/comms/typing', auth, (req, res) => {
    try {
      const { channel_id } = req.body || {};
      if (channel_id) broadcastToChannel(channel_id, req.workspaceId, 'chat_typing', { channel_id, user_id: req.userId, name: req.senderName });
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

  // ── Calls: lifecycle + event log (Started / Joined / Left / Screenshare /
  //    Raise-hand / Ended) → real-time roster, call notifications, timeline. ───────
  function logCallTimeline(session, title, body) {
    const leadId = resolveRoomLead(session.channel_id);
    if (!leadId) return;
    try {
      db.prepare(`INSERT INTO activity_timeline (id, lead_id, workspace_id, user_id, actor_name, activity_type, title, body)
        VALUES (?,?,?,?,?,?,?,?)`).run(generateId(), leadId, session.workspace_id, session.started_by, null, 'call', title, body || '');
    } catch { /* best-effort */ }
  }
  const recordCallEvent = (callId, userId, name, type) => {
    try { db.prepare('INSERT INTO call_events (id, call_id, user_id, name, type) VALUES (?,?,?,?,?)').run(generateId(), callId, userId || null, name || null, type); } catch {}
  };

  // Start (or rejoin) a call on a channel. First start rings the other members.
  app.post('/api/comms/calls/start', auth, (req, res) => {
    try {
      const channelId = (req.body.channel_id || '').toString();
      if (!canSee(channelId, req.userId, req.workspaceId)) return res.status(404).json({ error: 'channel not found' });
      // Reuse a live (not-ended) call on this channel if one exists.
      let session = db.prepare('SELECT * FROM call_sessions WHERE channel_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(channelId);
      let fresh = false;
      if (!session) {
        const id = generateId();
        const room = channelId; // LiveKit room == channel id (per /livekit/token namespacing)
        db.prepare('INSERT INTO call_sessions (id, workspace_id, channel_id, room, started_by) VALUES (?,?,?,?,?)').run(id, req.workspaceId, channelId, room, req.userId);
        session = db.prepare('SELECT * FROM call_sessions WHERE id = ?').get(id);
        fresh = true;
        recordCallEvent(id, req.userId, req.senderName, 'started');
      }
      // The starter is the first participant.
      recordCallEvent(session.id, req.userId, req.senderName, 'joined');
      broadcastToChannel(channelId, req.workspaceId, 'call_event', { call_id: session.id, channel_id: channelId, type: fresh ? 'started' : 'joined', user_id: req.userId, name: req.senderName });
      if (fresh) {
        const ch = db.prepare('SELECT name FROM chat_channels WHERE id = ?').get(channelId) || {};
        const chName = ch.name || 'a channel';
        // Ring every other member: in-app feed (unless DND) + push + a targeted SSE invite.
        for (const uid of channelMemberIds(channelId, req.workspaceId)) {
          if (uid === req.userId) continue;
          broadcastToUser(uid, 'call_invite', { call_id: session.id, channel_id: channelId, room: session.room, from: req.senderName });
          if (!isDnd(req.workspaceId, uid)) {
            try { notify(req.workspaceId, { type: 'call', title: 'Incoming call', body: `${req.senderName} started a call in ${chName}`, url: `/chat?channel=${channelId}`, icon: '📞', userId: uid }); } catch {}
            sendPushToUser(uid, `${req.senderName} is calling`, `Call in ${chName}`, { channel_id: channelId, kind: 'call', call_id: session.id }).catch(() => {});
          }
        }
        logCallTimeline(session, 'Call started', `${req.senderName} started a call`);
      }
      res.json({ call_id: session.id, channel_id: channelId, room: session.room, fresh });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Record an in-call event (joined/left/screenshare/raise_hand/lower_hand) → live roster.
  app.post('/api/comms/calls/:id/event', auth, (req, res) => {
    try {
      const session = db.prepare('SELECT * FROM call_sessions WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!session) return res.status(404).json({ error: 'call not found' });
      const type = (req.body.type || '').toString();
      const ALLOWED = ['joined', 'left', 'screenshare', 'screenshare_stop', 'raise_hand', 'lower_hand'];
      if (!ALLOWED.includes(type)) return res.status(400).json({ error: 'bad event type' });
      recordCallEvent(session.id, req.userId, req.senderName, type);
      broadcastToChannel(session.channel_id, req.workspaceId, 'call_event', { call_id: session.id, channel_id: session.channel_id, type, user_id: req.userId, name: req.senderName });
      if (type === 'screenshare') logCallTimeline(session, 'Screen shared', `${req.senderName} shared their screen`);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // End the call → duration, timeline, and a missed-call ping to anyone who never joined.
  app.post('/api/comms/calls/:id/end', auth, (req, res) => {
    try {
      const session = db.prepare('SELECT * FROM call_sessions WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!session) return res.status(404).json({ error: 'call not found' });
      if (session.ended_at) return res.json({ ok: true, already: true });
      const started = new Date((session.started_at || '').replace(' ', 'T') + 'Z').getTime();
      const dur = started ? Math.max(0, Math.round((Date.now() - started) / 1000)) : null;
      db.prepare('UPDATE call_sessions SET ended_at = CURRENT_TIMESTAMP, duration_s = ? WHERE id = ?').run(dur, session.id);
      recordCallEvent(session.id, req.userId, req.senderName, 'ended');
      broadcastToChannel(session.channel_id, req.workspaceId, 'call_event', { call_id: session.id, channel_id: session.channel_id, type: 'ended', user_id: req.userId, duration_s: dur });
      const mins = dur != null ? `${Math.floor(dur / 60)}m ${dur % 60}s` : '';
      logCallTimeline(session, 'Call ended', `Duration ${mins}`);
      // Missed call: members who were invited but produced no 'joined' event.
      try {
        const joined = new Set(db.prepare("SELECT DISTINCT user_id FROM call_events WHERE call_id = ? AND type = 'joined'").all(session.id).map(r => r.user_id));
        for (const uid of channelMemberIds(session.channel_id, req.workspaceId)) {
          if (uid === session.started_by || joined.has(uid)) continue;
          broadcastToUser(uid, 'call_missed', { call_id: session.id, channel_id: session.channel_id });
          if (!isDnd(req.workspaceId, uid)) notify(req.workspaceId, { type: 'call', title: 'Missed call', body: `You missed a call`, url: `/chat?channel=${session.channel_id}`, icon: '📵', userId: uid });
        }
      } catch {}
      res.json({ ok: true, duration_s: dur });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Call detail + live roster (joined − left) + raised hands.
  app.get('/api/comms/calls/:id', auth, (req, res) => {
    try {
      const session = db.prepare('SELECT * FROM call_sessions WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!session) return res.status(404).json({ error: 'call not found' });
      const events = db.prepare('SELECT user_id, name, type, at FROM call_events WHERE call_id = ? ORDER BY at ASC').all(session.id);
      const inRoom = new Map(); const hands = new Set();
      for (const e of events) {
        if (e.type === 'joined') inRoom.set(e.user_id, e.name);
        else if (e.type === 'left' || e.type === 'ended') inRoom.delete(e.user_id);
        else if (e.type === 'raise_hand') hands.add(e.user_id);
        else if (e.type === 'lower_hand') hands.delete(e.user_id);
      }
      res.json({ call: session, events, participants: [...inRoom.entries()].map(([user_id, name]) => ({ user_id, name })), raised_hands: [...hands] });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Live (not-ended) call on a channel, if any — so the UI can show a "join" affordance.
  app.get('/api/comms/channels/:id/active-call', auth, (req, res) => {
    try {
      if (!canSee(req.params.id, req.userId, req.workspaceId)) return res.status(404).json({ error: 'channel not found' });
      const session = db.prepare('SELECT * FROM call_sessions WHERE channel_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(req.params.id) || null;
      res.json({ active: !!session, call: session });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Project Rooms (Phase 5) — contextual collaboration on a business entity ──
  // A room = a private channel bound to a Lead/Project/Gallery/Contract/Booking +
  // a LiveKit room (room = the channel id). Discussion reuses the chat message
  // routes; voice/video reuses /api/comms/livekit/token. Lead-room messages mirror
  // to the lead timeline (see afterMessage).
  const ROOM_ENTITIES = {
    lead:     { table: 'leads' },
    project:  { table: 'ms_projects' },
    gallery:  { table: 'ms_galleries' },
    contract: { table: 'cs_documents' },
    booking:  { table: 'bookings' },
  };
  function entityValid(type, id, workspaceId) {
    const e = ROOM_ENTITIES[type]; if (!e) return false;
    try { return !!db.prepare(`SELECT 1 FROM ${e.table} WHERE id = ? AND workspace_id = ?`).get(id, workspaceId); }
    catch { return false; }
  }
  const roomChannelId = (type, id) => `room_${type}_${id}`;

  // Find-or-create the room for an entity → returns its channel + LiveKit room.
  app.post('/api/comms/rooms/:type/:id', auth, (req, res) => {
    try {
      const { type, id } = req.params;
      if (!ROOM_ENTITIES[type]) return res.status(400).json({ error: 'unknown entity type' });
      if (!entityValid(type, id, req.workspaceId)) return res.status(404).json({ error: 'entity not found' });
      const cid = roomChannelId(type, id);
      if (!db.prepare('SELECT 1 FROM chat_channels WHERE id = ?').get(cid)) {
        db.prepare('INSERT INTO chat_channels (id, workspace_id, name, description, is_private, created_by) VALUES (?,?,?,?,1,?)')
          .run(cid, req.workspaceId, `${type} room`, 'room', req.userId);
        db.prepare('INSERT OR IGNORE INTO project_rooms (id, workspace_id, entity_type, entity_id, channel_id) VALUES (?,?,?,?,?)')
          .run(generateId(), req.workspaceId, type, id, cid);
      }
      db.prepare('INSERT OR IGNORE INTO chat_members (channel_id, user_id) VALUES (?,?)').run(cid, req.userId);
      res.json({ channel_id: cid, type, entity_id: id, livekit_room: cid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Get a room (channel meta + recent messages) without creating it.
  app.get('/api/comms/rooms/:type/:id', auth, (req, res) => {
    try {
      const { type, id } = req.params;
      if (!ROOM_ENTITIES[type]) return res.status(400).json({ error: 'unknown entity type' });
      const cid = roomChannelId(type, id);
      const channel = db.prepare('SELECT * FROM chat_channels WHERE id = ? AND workspace_id = ?').get(cid, req.workspaceId) || null;
      const messages = channel ? db.prepare('SELECT * FROM chat_messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT 50').all(cid).reverse() : [];
      res.json({ exists: !!channel, channel_id: cid, channel, messages, livekit_room: cid });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('💬 Communications 2.0 mounted at /api/comms/* (LiveKit ' + (LIVEKIT_URL ? 'configured' : 'NOT configured') + ')');
  return { afterMessage, mintLivekitToken, broadcastToChannel, canSee, channelMemberIds };
};

// Exposed for tests.
module.exports.mintLivekitToken = mintLivekitToken;
