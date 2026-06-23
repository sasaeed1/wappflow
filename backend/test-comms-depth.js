'use strict';
// Verifies the Comms-depth additions: @channel expansion, thread-reply notify, AWAY/DND
// presence, per-message receipts, and the call lifecycle (start→invite, event, end→missed).
const Database = require('better-sqlite3');
const assert = (c, m) => { if (!c) { console.log('✗ FAIL:', m); process.exitCode = 1; throw new Error(m); } console.log('  ✓', m); };

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE chat_channels (id TEXT PRIMARY KEY, workspace_id TEXT, name TEXT, description TEXT, is_private INTEGER DEFAULT 0, created_by TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE chat_messages (id TEXT PRIMARY KEY, channel_id TEXT, user_id TEXT, sender_name TEXT, body TEXT, reply_to TEXT, media_url TEXT, media_type TEXT, is_edited INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE chat_reactions (id TEXT PRIMARY KEY, message_id TEXT, user_id TEXT, emoji TEXT);
  CREATE TABLE workspace_members (workspace_id TEXT, user_id TEXT);
  CREATE TABLE activity_timeline (id TEXT PRIMARY KEY, lead_id TEXT, workspace_id TEXT, user_id TEXT, actor_name TEXT, activity_type TEXT, title TEXT, body TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
`);

// capture sinks
const sent = { toUser: [], notify: [], push: [], toWs: [] };
const deps = {
  auth: (req, res, next) => next(),
  generateId: () => 'id_' + Math.random().toString(16).slice(2, 10),
  broadcastToWorkspace: (ws, ev, p) => sent.toWs.push({ ws, ev, p }),
  broadcastToUser: (uid, ev, p) => sent.toUser.push({ uid, ev, p }),
  onlineUsers: () => ['u1', 'u2', 'u3'],
  sendPushToUser: async (uid, t, b, d) => { sent.push.push({ uid, t, b, d }); },
  notify: (ws, n) => sent.notify.push({ ws, ...n }),
};

// fake express capturing handlers
const routes = {};
const cap = (m) => (p, ...h) => { routes[m + ' ' + p] = h[h.length - 1]; };
const fakeApp = { get: cap('GET'), post: cap('POST'), put: cap('PUT'), delete: cap('DELETE') };
const comms = require('./comms')(fakeApp, db, deps);

const WS = 'ws1';
db.prepare("INSERT INTO chat_channels (id, workspace_id, name, is_private, created_by) VALUES ('general', ?, 'general', 0, 'u1')").run(WS);
for (const u of ['u1', 'u2', 'u3']) db.prepare('INSERT INTO workspace_members (workspace_id, user_id) VALUES (?,?)').run(WS, u);

function call(key, { user = 'u1', name = 'User One', params = {}, body = {} } = {}) {
  return new Promise((resolve) => {
    const req = { userId: user, workspaceId: WS, senderName: name, params, body };
    const res = { json: (o) => resolve({ status: 200, body: o }), status: (s) => ({ json: (o) => resolve({ status: s, body: o }) }) };
    routes[key](req, res);
  });
}
const msg = (id, user, body, reply_to = null) => { db.prepare('INSERT INTO chat_messages (id, channel_id, user_id, sender_name, body, reply_to) VALUES (?,?,?,?,?,?)').run(id, 'general', user, user, body, reply_to); return db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id); };

(async () => {
  console.log('[1] AWAY/DND presence');
  await call('POST /api/comms/presence/state', { user: 'u2', body: { state: 'dnd' } });
  const pres = await call('GET /api/comms/presence', { user: 'u1' });
  assert(pres.body.states.u2 === 'dnd', 'u2 presence state = dnd');
  assert(!pres.body.online.includes('u2'), 'dnd user is not shown as plain-online');
  assert(pres.body.connected.includes('u2'), 'dnd user still listed as connected');

  console.log('\n[2] @channel expands to all members (minus author), DND suppresses push not record');
  const m1 = msg('m1', 'u1', 'standup now @channel please');
  comms.afterMessage(m1, []);
  const mentionRows = db.prepare('SELECT user_id FROM chat_mentions WHERE message_id = ?').all('m1').map(r => r.user_id).sort();
  assert(JSON.stringify(mentionRows) === JSON.stringify(['u2', 'u3']), '@channel created mentions for u2 + u3, not the author');
  const pushedTo = sent.push.filter(p => p.d && p.d.kind === 'mention').map(p => p.uid);
  assert(pushedTo.includes('u3') && !pushedTo.includes('u2'), 'push sent to u3 but suppressed for DND u2 (record still written)');

  console.log('\n[3] thread reply notifies the root author');
  sent.toUser.length = 0;
  const m2 = msg('m2', 'u3', 'replying to you', 'm1');
  comms.afterMessage(m2, []);
  const threadPing = sent.toUser.find(e => e.ev === 'chat_thread_reply' && e.uid === 'u1');
  assert(!!threadPing, 'root author u1 got a chat_thread_reply event');

  console.log('\n[4] per-message read receipts (derived from last_read_at)');
  await call('POST /api/comms/channels/:id/read', { user: 'u3', params: { id: 'general' } });
  const rcpt = await call('GET /api/comms/messages/:id/receipts', { user: 'u1', params: { id: 'm1' } });
  assert(rcpt.body.seen_by.includes('u3'), 'u3 shows as having seen m1');
  assert(!rcpt.body.seen_by.includes('u1'), 'author is excluded from own receipts');

  console.log('\n[5] call start rings other members (DND suppresses feed)');
  sent.toUser.length = 0; sent.notify.length = 0;
  const start = await call('POST /api/comms/calls/start', { user: 'u1', name: 'User One', body: { channel_id: 'general' } });
  assert(start.body.call_id && start.body.fresh === true, 'fresh call session created');
  const invites = sent.toUser.filter(e => e.ev === 'call_invite').map(e => e.uid).sort();
  assert(JSON.stringify(invites) === JSON.stringify(['u2', 'u3']), 'call_invite sent to u2 + u3');
  const callNotified = sent.notify.filter(n => n.type === 'call').map(n => n.userId);
  assert(callNotified.includes('u3') && !callNotified.includes('u2'), 'in-app call notify to u3, suppressed for DND u2');
  const evtTypes = db.prepare('SELECT type FROM call_events WHERE call_id = ? ORDER BY at').all(start.body.call_id).map(r => r.type);
  assert(evtTypes.includes('started') && evtTypes.includes('joined'), 'started + joined events recorded');

  console.log('\n[6] join + end → missed-call only for the no-show');
  await call('POST /api/comms/calls/:id/event', { user: 'u2', name: 'User Two', params: { id: start.body.call_id }, body: { type: 'joined' } });
  sent.toUser.length = 0; sent.notify.length = 0;
  const end = await call('POST /api/comms/calls/:id/end', { user: 'u1', params: { id: start.body.call_id } });
  assert(end.body.duration_s != null, 'call end computed a duration');
  const missed = sent.toUser.filter(e => e.ev === 'call_missed').map(e => e.uid);
  assert(missed.includes('u3') && !missed.includes('u2'), 'missed-call only to u3 (u2 joined, u1 started)');

  console.log('\n[7] roster reconstruction from events');
  const detail = await call('GET /api/comms/calls/:id', { user: 'u1', params: { id: start.body.call_id } });
  assert(Array.isArray(detail.body.participants), 'call detail returns a participant roster');

  console.log('\n✅ ALL COMMS-DEPTH CHECKS PASSED');
  process.exit(0);
})().catch((e) => { console.log('ERROR', e); process.exit(1); });
