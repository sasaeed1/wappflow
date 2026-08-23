// Communications 2.0 regression test — exercises comms.js over real HTTP against an
// in-memory DB with a stub auth. No server.js boot (so WhatsApp never starts).
// Run: node test-comms.js
process.env.LIVEKIT_URL = 'wss://livekit.example';
process.env.LIVEKIT_API_KEY = 'devkey';
process.env.LIVEKIT_API_SECRET = 'devsecret-devsecret-devsecret';

const Database = require('better-sqlite3');
const express = require('express');
const jwt = require('jsonwebtoken');
const comms = require('./comms');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE chat_channels (id TEXT PRIMARY KEY, workspace_id TEXT, name TEXT, description TEXT, is_private INTEGER DEFAULT 0, created_by TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE chat_messages (id TEXT PRIMARY KEY, channel_id TEXT, user_id TEXT, sender_name TEXT, body TEXT, media_url TEXT, media_type TEXT, reply_to TEXT, is_edited INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE workspace_members (workspace_id TEXT, user_id TEXT, role TEXT);
  CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, customer_name TEXT);
  CREATE TABLE activity_timeline (id TEXT PRIMARY KEY, lead_id TEXT, workspace_id TEXT, user_id TEXT, actor_name TEXT, activity_type TEXT, title TEXT, body TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
`);
db.prepare("INSERT INTO leads (id, workspace_id, customer_name) VALUES ('lead1','ws1','Acme')").run();
db.exec("CREATE TABLE ms_projects (id TEXT PRIMARY KEY, workspace_id TEXT, lead_id TEXT, title TEXT);");
db.prepare("INSERT INTO ms_projects VALUES ('proj1','ws1','lead1','Wedding')").run();
db.prepare("INSERT INTO workspace_members VALUES ('ws1','u1','admin')").run();
db.prepare("INSERT INTO workspace_members VALUES ('ws1','u2','user')").run();
// a public channel + a message from u1
db.prepare("INSERT INTO chat_channels (id,workspace_id,name,is_private,created_by) VALUES ('c1','ws1','general',0,'u1')").run();
db.prepare("INSERT INTO chat_messages (id,channel_id,user_id,sender_name,body) VALUES ('m1','c1','u1','Alice','hello @bob meet me')").run();

const broadcasts = [];
const app = express();
app.use(express.json());
const stubAuth = (req, res, next) => { req.userId = req.headers['x-uid'] || 'u1'; req.workspaceId = 'ws1'; req.senderName = 'User ' + (req.headers['x-uid'] || 'u1'); next(); };
const api = comms(app, db, {
  auth: stubAuth,
  generateId: () => 'id-' + Math.random().toString(36).slice(2),
  broadcastToWorkspace: (ws, type, data) => broadcasts.push({ scope: 'ws', ws, type, data }),
  broadcastToUser: (uid, type, data) => broadcasts.push({ scope: 'user', uid, type, data }),
  onlineUsers: () => ['u1'],
  sendPushToUser: async () => {},
});

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('  ✗', m); } else console.log('  ✓', m); };

(async () => {
  const srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  const port = srv.address().port;
  const base = `http://127.0.0.1:${port}`;
  const call = async (method, path, { uid = 'u1', body } = {}) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-uid': uid }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };

  console.log('\n[1] LiveKit token minting');
  const tok = comms.mintLivekitToken({ room: 'ws_ws1_huddle', identity: 'u1', name: 'Alice' });
  const dec = jwt.decode(tok);
  ok(!!tok, 'token minted');
  ok(dec.iss === 'devkey' && dec.sub === 'u1', 'iss=apiKey, sub=identity');
  ok(dec.video && dec.video.room === 'ws_ws1_huddle' && dec.video.roomJoin === true, 'video grant: room + roomJoin');
  const cfg = await call('GET', '/api/comms/livekit/config');
  ok(cfg.json.configured === true, 'livekit/config reports configured');
  const troom = await call('POST', '/api/comms/livekit/token', { body: { room: 'huddle' } });
  ok(troom.status === 200 && troom.json.token && troom.json.room.startsWith('ws_ws1_'), 'token endpoint namespaces room per workspace');

  console.log('\n[2] Schema (2.0 tables)');
  const tbls = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  ok(['chat_members', 'chat_pins', 'chat_mentions'].every(t => tbls.includes(t)), 'chat_members + chat_pins + chat_mentions created');

  console.log('\n[3] Direct messages');
  const dm = await call('POST', '/api/comms/dm/u2');
  ok(dm.status === 200 && dm.json.channel_id.startsWith('dm_'), 'DM channel created');
  const dms = await call('GET', '/api/comms/dms');
  ok(dms.json.dms.length === 1 && dms.json.dms[0].other_id === 'u2', 'DM list shows counterpart u2');

  console.log('\n[4] Mentions via afterMessage + inbox');
  api.afterMessage(db.prepare('SELECT * FROM chat_messages WHERE id=?').get('m1'), ['u2']);
  ok(broadcasts.some(b => b.type === 'chat_message'), 'afterMessage broadcasts chat_message');
  ok(broadcasts.some(b => b.type === 'chat_mention' && b.uid === 'u2'), 'mention broadcast to u2');
  const mentions = await call('GET', '/api/comms/mentions', { uid: 'u2' });
  ok(mentions.json.mentions.length === 1, 'u2 mentions inbox has 1');

  console.log('\n[5] Unread + read');
  const unread = await call('GET', '/api/comms/unread', { uid: 'u2' });
  ok(unread.json.unread['c1'] >= 1, 'u2 has unread in c1');
  ok(unread.json.mentions === 1, 'u2 unread mention count = 1');
  await call('POST', '/api/comms/channels/c1/read', { uid: 'u2' });
  const unread2 = await call('GET', '/api/comms/unread', { uid: 'u2' });
  ok((unread2.json.unread['c1'] || 0) === 0, 'unread cleared after read');
  ok(unread2.json.mentions === 0, 'mention marked read');

  console.log('\n[6] Pins');
  await call('POST', '/api/comms/messages/m1/pin');
  const pins = await call('GET', '/api/comms/channels/c1/pins');
  ok(pins.json.pins.length === 1 && pins.json.pins[0].message_id === 'm1', 'message pinned + listed');
  await call('DELETE', '/api/comms/messages/m1/pin');
  const pins2 = await call('GET', '/api/comms/channels/c1/pins');
  ok(pins2.json.pins.length === 0, 'unpinned');

  console.log('\n[7] Search');
  const search = await call('GET', '/api/comms/search?q=meet');
  ok(search.json.results.length === 1 && search.json.results[0].id === 'm1', 'search finds the message');

  console.log('\n[8] Edit (author only)');
  const edit = await call('PUT', '/api/comms/messages/m1', { uid: 'u1', body: { body: 'edited body' } });
  ok(edit.json.message.is_edited === 1 && edit.json.message.body === 'edited body', 'author edit sets is_edited');
  const editDenied = await call('PUT', '/api/comms/messages/m1', { uid: 'u2', body: { body: 'hax' } });
  ok(editDenied.status === 403, 'non-author edit blocked');

  console.log('\n[9] Presence');
  const pres = await call('GET', '/api/comms/presence');
  ok(Array.isArray(pres.json.online) && pres.json.online.includes('u1'), 'presence lists online u1');

  console.log('\n[10] Project Rooms (Phase 5)');
  const badRoom = await call('POST', '/api/comms/rooms/lead/nope');
  ok(badRoom.status === 404, 'room for non-existent entity → 404');
  const room = await call('POST', '/api/comms/rooms/lead/lead1');
  ok(room.status === 200 && room.json.channel_id === 'room_lead_lead1', 'lead room find-or-create');
  ok(room.json.livekit_room === 'room_lead_lead1', 'room exposes a LiveKit room id');
  const room2 = await call('POST', '/api/comms/rooms/lead/lead1');
  ok(room2.json.channel_id === 'room_lead_lead1', 'idempotent (same room on re-create)');
  ok(db.prepare("SELECT COUNT(*) c FROM project_rooms WHERE entity_type='lead' AND entity_id='lead1'").get().c === 1, 'single project_rooms row');
  // a message in the room mirrors to the lead timeline via afterMessage
  db.prepare("INSERT INTO chat_messages (id,channel_id,user_id,sender_name,body) VALUES ('rm1','room_lead_lead1','u1','Alice','kickoff call notes')").run();
  api.afterMessage(db.prepare("SELECT * FROM chat_messages WHERE id='rm1'").get(), []);
  ok(db.prepare("SELECT COUNT(*) c FROM activity_timeline WHERE lead_id='lead1' AND activity_type='room_message'").get().c === 1, 'room message mirrors to lead timeline');
  const getRoom = await call('GET', '/api/comms/rooms/lead/lead1');
  ok(getRoom.json.exists === true && getRoom.json.messages.length >= 1, 'GET room returns messages');
  // a PROJECT room mirrors to the project's lead timeline (non-lead entity resolution)
  const proom = await call('POST', '/api/comms/rooms/project/proj1');
  ok(proom.json.channel_id === 'room_project_proj1', 'project room find-or-create');
  db.prepare("INSERT INTO chat_messages (id,channel_id,user_id,sender_name,body) VALUES ('pm1','room_project_proj1','u1','Alice','edit deadline?')").run();
  api.afterMessage(db.prepare("SELECT * FROM chat_messages WHERE id='pm1'").get(), []);
  ok(db.prepare("SELECT COUNT(*) c FROM activity_timeline WHERE lead_id='lead1' AND title='project room message'").get().c === 1, 'project-room msg mirrors to the project lead timeline');

  console.log(`\n${fails === 0 ? '✅ ALL COMMS 2.0 + ROOMS CHECKS PASSED' : '❌ ' + fails + ' FAILED'}\n`);
  // Let the loop drain instead of forcing process.exit(): tearing the process
  // down with the http server's handle still closing trips a libuv assertion on
  // Windows, which made this suite abort with a bogus exit code AFTER passing.
  process.exitCode = fails ? 1 : 0;
  try { srv.close(); } catch {}
  try { db.close(); } catch {}
})();
