'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 5 Batch 1 — real-time correctness + privacy.
//  The fan-out rules are exercised against a REAL SQLite with a real channel
//  membership graph; the wiring in server.js is asserted by inspection.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SERVER = read('server.js');
const S = strip(SERVER);
const COMMS = strip(read('comms.js'));
const WA = strip(read('whatsapp-service.js'));

// ── a real workspace: 3 members, a public channel, a private channel, a DM ──
const db = new Database(':memory:');
db.exec(`
  CREATE TABLE workspace_members (id TEXT PRIMARY KEY, workspace_id TEXT, user_id TEXT);
  CREATE TABLE chat_channels (id TEXT PRIMARY KEY, workspace_id TEXT, is_private INTEGER DEFAULT 0);
  CREATE TABLE chat_members (channel_id TEXT, user_id TEXT, PRIMARY KEY (channel_id, user_id));
  INSERT INTO workspace_members VALUES ('m1','ws1','alice'), ('m2','ws1','bob'), ('m3','ws1','carol');
  INSERT INTO chat_channels VALUES ('general','ws1',0), ('secret','ws1',1), ('dm_alice_bob','ws1',1);
  INSERT INTO chat_members VALUES ('secret','alice'), ('secret','bob'), ('dm_alice_bob','alice'), ('dm_alice_bob','bob');
`);

// Faithful copies of the two functions under test (same queries as the modules).
function channelMemberIds(channelId, workspaceId) {
  const c = db.prepare('SELECT is_private FROM chat_channels WHERE id = ?').get(channelId);
  if (c && !c.is_private) return db.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ? AND user_id IS NOT NULL').all(workspaceId).map(r => r.user_id);
  return db.prepare('SELECT user_id FROM chat_members WHERE channel_id = ?').all(channelId).map(r => r.user_id);
}
const delivered = [];
const broadcastToUser = (uid, type, data) => delivered.push({ uid, type, data });
function broadcastToChannel(channelId, workspaceId, type, data) {
  try { for (const uid of channelMemberIds(channelId, workspaceId)) broadcastToUser(uid, type, data); } catch {}
}
const recipients = (fn) => { delivered.length = 0; fn(); return [...new Set(delivered.map(d => d.uid))].sort(); };

check('a private-channel message reaches only its members', () => {
  assert.deepStrictEqual(
    recipients(() => broadcastToChannel('secret', 'ws1', 'chat_message', { message: { body: 'salary review' } })),
    ['alice', 'bob'], 'carol received a private channel message');
});

check('a DM reaches exactly the two participants', () => {
  assert.deepStrictEqual(
    recipients(() => broadcastToChannel('dm_alice_bob', 'ws1', 'chat_message', { message: { body: 'between us' } })),
    ['alice', 'bob'], 'a DM leaked beyond its participants');
});

check('public-channel behaviour is unchanged — still the whole workspace', () => {
  assert.deepStrictEqual(
    recipients(() => broadcastToChannel('general', 'ws1', 'chat_message', {})),
    ['alice', 'bob', 'carol'], 'public channel fan-out regressed');
});

check('an unresolvable channel drops the frame instead of falling back workspace-wide', () => {
  assert.deepStrictEqual(recipients(() => broadcastToChannel('deleted-channel', 'ws1', 'chat_message', {})), [],
    'a deleted channel fell back to a workspace-wide send — the exact leak being fixed');
});

check('EVERY channel-scoped chat/call event is routed through the scoped broadcaster', () => {
  // The leak was one unscoped call among many; a partial fix is not a fix.
  for (const ev of ['chat_message', 'chat_pin', 'chat_unpin', 'chat_edit', 'chat_typing', 'call_event']) {
    const re = new RegExp(`broadcastToWorkspace\\([^)]*'${ev}'`);
    assert(!re.test(COMMS), `comms.js still sends ${ev} workspace-wide`);
    assert(new RegExp(`broadcastToChannel\\([^)]*'${ev}'`).test(COMMS), `comms.js does not scope ${ev}`);
  }
  for (const ev of ['chat_delete', 'chat_reaction']) {
    assert(!new RegExp(`broadcastToWorkspace\\([^)]*'${ev}'`).test(S), `server.js still sends ${ev} workspace-wide`);
    assert(new RegExp(`broadcastToChannel\\([^)]*'${ev}'`).test(S), `server.js does not scope ${ev}`);
  }
  // Presence is deliberately workspace-wide — it is workspace-visible state.
  assert(/broadcastToWorkspace\([^)]*'chat_presence'/.test(COMMS), 'presence should stay workspace-wide');
});

check('scoped fan-out never silently degrades to workspace-wide', () => {
  const fn = COMMS.slice(COMMS.indexOf('function broadcastToChannel'), COMMS.indexOf('function resolveRoomLead'));
  assert(!/broadcastToWorkspace/.test(fn), 'broadcastToChannel falls back to a workspace send on error');
  const seam = S.slice(S.indexOf('function broadcastToChannel'), S.indexOf('function broadcastToChannel') + 400);
  assert(!/broadcastToWorkspace/.test(seam), 'the server-side seam falls back to a workspace send');
});

check('a payload cannot rename the event it travels in', () => {
  // Found live: notify()'s rows carry a category under `type` ('lead', 'call'…),
  // and the frame was built as { type, ...data } — so the spread renamed every
  // notification frame after its category and the 'notification' event that
  // consumers were told to subscribe to never appeared on the wire at all.
  const fn = S.slice(S.indexOf('function broadcastToUser('), S.indexOf('function broadcastToUser(') + 400);
  assert(/JSON\.stringify\(\{ \.\.\.data, type \}\)/.test(fn),
    'event name is still spread-over by payload data');
  // Exercise the exact construction with a colliding payload.
  const build = (type, data) => JSON.parse(JSON.stringify({ ...data, type }));
  assert.strictEqual(build('notification', { kind: 'lead', title: 'New lead' }).type, 'notification');
  assert.strictEqual(build('notification', { type: 'lead' }).type, 'notification', 'a rogue type key still wins');
  assert(/kind: type \|\| 'info'/.test(S), 'notify still puts its category under `type`, re-creating the collision');
});

check('a user-targeted notification pushes to that user only', () => {
  const notifyBody = S.slice(S.indexOf('function notify('), S.indexOf('function notify(') + 1200);
  assert(/if \(userId\) broadcastToUser\(userId, 'notification', frame\)/.test(notifyBody),
    'user-targeted rows still broadcast workspace-wide (incoming calls, private alerts)');
  assert(/else broadcastToWorkspace\(workspaceId, 'notification', frame\)/.test(notifyBody),
    'workspace-wide notifications lost their broadcast');
});

check('webhook lead events use the keyed-by-user broadcaster, not a raw write', () => {
  assert(!/sseClients\.get\(account\.workspace_id\)/.test(S),
    'raw write into a userId-keyed map by workspace_id — social leads never arrived');
  assert.strictEqual((S.match(/broadcastToWorkspace\(account\.workspace_id, 'lead_created', \{ lead \}\)/g) || []).length, 3,
    'expected Instagram, Facebook and website-form paths to broadcast lead_created');
  assert(!/'new_lead'/.test(S), 'the duplicate event name survives — consumers would double-handle one lead');
});

check('workspace member lookup is cached, with an explicit invalidation seam', () => {
  assert(/const memberCache = new Map\(\)/.test(S), 'no member cache — a SELECT per SSE frame, per ffmpeg tick');
  assert(/function invalidateWorkspaceMembers\(/.test(S), 'no invalidation seam');
  assert(/for \(const userId of workspaceMemberIds\(workspaceId\)\) broadcastToUser/.test(S), 'broadcast does not use the cache');
  // The seam is worthless unless the mutations actually call it: join, invite-accept, remove.
  assert.strictEqual((S.match(/invalidateWorkspaceMembers\(/g) || []).length - 1, 3,
    'expected 3 invalidation call sites (invite accepted, member added, member removed)');
});

check('restore is no longer silent, and merge sends a full lead like every other site', () => {
  assert(/broadcastToWorkspace\(req\.workspaceId, 'lead_restored', \{ lead \}\)/.test(S),
    'restoring a lead pushes nothing — other sessions keep it hidden');
  assert(/broadcastToWorkspace\(req\.workspaceId, 'lead_updated', \{ lead: mergedLead, id: primary_id \}\)/.test(S),
    'merge still emits { id } only, so consumers reading data.lead skip it');
});

check('inbound WhatsApp reaches the workspace, not just the owner', () => {
  assert(/_emit\(user, 'lead_created'/.test(WA) && /_emit\(user, 'new_message'/.test(WA),
    'WhatsApp events still go to the owner alone — teammates see nothing');
  assert(/this\.broadcastToWorkspace\(user\.workspace_id, type, data\)/.test(WA), 'no workspace fan-out in _emit');
  assert(/new WhatsAppManager\(db, broadcastToUser, broadcastToWorkspace/.test(S), 'the manager never receives the workspace broadcaster');
});

check('WhatsApp status transitions push instead of being polled for', () => {
  assert(/set status\(next\) \{/.test(WA) && /'whatsapp_status'/.test(WA), 'status transitions still silent');
  assert(/if \(prev === undefined \|\| prev === next \|\| !this\.broadcastToWorkspace\) return;/.test(WA),
    'status pushes on construction or on no-op writes — noisy frames');
  assert(/this\._status = 'disconnected';/.test(WA), 'constructor assignment would fire a frame before wiring exists');
});

// ════════════════════════════════════════════════════════════════════════════
//  Legacy chat-route authorization. These routes predate comms.js and shipped
//  with NO workspace clause at all — read/write by channel id from any tenant.
// ════════════════════════════════════════════════════════════════════════════
const routeBody = (marker) => {
  const i = S.indexOf(marker);
  assert(i !== -1, 'route not found: ' + marker);
  const rest = S.slice(i);
  return rest.slice(0, rest.indexOf('\n});'));
};

check('reading or posting messages is authorized, and cross-tenant ids 404', () => {
  for (const [name, marker] of [
    ['GET', "app.get('/api/chat/channels/:channelId/messages'"],
    ['POST', "app.post('/api/chat/channels/:channelId/messages'"],
  ]) {
    const body = routeBody(marker);
    assert(/canSeeChannel\(req\.params\.channelId, req\.userId, req\.workspaceId\)/.test(body),
      `${name} messages has no authorization — any tenant could reach any channel`);
    assert(/return res\.status\(404\)/.test(body), `${name} should 404 rather than confirm the channel exists`);
  }
});

check('reacting to a message is authorized through its channel', () => {
  const body = routeBody("app.post('/api/chat/messages/:id/react'");
  assert(/SELECT channel_id FROM chat_messages WHERE id = \?/.test(body) && /canSeeChannel\(target\.channel_id/.test(body),
    'react still accepts any message id from any workspace');
});

check('the channel list hides private channels from non-members', () => {
  const body = routeBody("app.get('/api/chat/channels'");
  assert(/c\.is_private = 0 OR EXISTS \(SELECT 1 FROM chat_members m WHERE m\.channel_id = c\.id AND m\.user_id = \?\)/.test(body),
    'private channels are still listed to the whole workspace');
});

check('creating a private channel makes the creator a member', () => {
  const body = routeBody("app.post('/api/chat/channels'");
  assert(/INSERT OR IGNORE INTO chat_members \(channel_id, user_id\) VALUES \(\?, \?\)/.test(body),
    'a new private channel would have no members — invisible to its creator and silent over SSE');
});

check('the fallback authorization still refuses cross-tenant access', () => {
  const fn = S.slice(S.indexOf('function canSeeChannel('), S.indexOf('function canSeeChannel(') + 600);
  assert(/return !!c && c\.workspace_id === workspaceId/.test(fn),
    'without comms mounted the guard would allow any workspace');
});

// The backfill is exercised against a real DB, since it decides who keeps access.
check('legacy private channels are backfilled from creator + actual participants', () => {
  const d = new Database(':memory:');
  d.exec(`
    CREATE TABLE chat_channels (id TEXT PRIMARY KEY, workspace_id TEXT, is_private INTEGER, created_by TEXT);
    CREATE TABLE chat_members (channel_id TEXT, user_id TEXT, PRIMARY KEY (channel_id, user_id));
    CREATE TABLE chat_messages (id TEXT PRIMARY KEY, channel_id TEXT, user_id TEXT);
    INSERT INTO chat_channels VALUES ('legacy','ws1',1,'alice'), ('public','ws1',0,'alice'), ('fresh','ws1',1,'alice');
    INSERT INTO chat_members VALUES ('fresh','alice');
    INSERT INTO chat_messages VALUES ('m1','legacy','bob'), ('m2','legacy','bob'), ('m3','legacy',NULL);
  `);
  const legacy = d.prepare(`SELECT c.id, c.created_by FROM chat_channels c
    WHERE c.is_private = 1 AND NOT EXISTS (SELECT 1 FROM chat_members m WHERE m.channel_id = c.id)`).all();
  assert.deepStrictEqual(legacy.map(r => r.id), ['legacy'], 'backfill targeted the wrong channels');
  const addMember = d.prepare('INSERT OR IGNORE INTO chat_members (channel_id, user_id) VALUES (?, ?)');
  const participants = d.prepare('SELECT DISTINCT user_id FROM chat_messages WHERE channel_id = ? AND user_id IS NOT NULL');
  for (const ch of legacy) { if (ch.created_by) addMember.run(ch.id, ch.created_by); for (const p of participants.all(ch.id)) addMember.run(ch.id, p.user_id); }
  const members = d.prepare('SELECT user_id FROM chat_members WHERE channel_id = ? ORDER BY user_id').all('legacy').map(r => r.user_id);
  assert.deepStrictEqual(members, ['alice', 'bob'], 'creator + participants not preserved: ' + JSON.stringify(members));
  assert.strictEqual(d.prepare("SELECT COUNT(*) c FROM chat_members WHERE channel_id='public'").get().c, 0,
    'public channels should not need membership rows');
  d.close();
});

// ════════════════════════════════════════════════════════════════════════════
//  Notification bus reach (Batch 3). Events users care about that wrote no row.
// ════════════════════════════════════════════════════════════════════════════
const modSrc = (f) => strip(read(f));

check('every module that raises user-visible events receives the notify seam', () => {
  // Four modules were mounted without it, so their events could only ever be
  // live frames — invisible to anyone not staring at the right screen.
  for (const [mod, marker] of [
    ['payments', /require\('\.\/payments'\)\(app, db, \{[^}]*notify/],
    ['print-store', /require\('\.\/print-store'\)\(app, db, \{[\s\S]{0,120}?notify/],
    ['media-studio', /require\('\.\/media-studio'\)\(app, db, \{[\s\S]{0,120}?notify/],
    ['booking', /require\('\.\/booking'\)\(app, db, \{[\s\S]{0,120}?notify/],
  ]) assert(marker.test(S), `${mod} is mounted without notify`);
  // Assert the worker RECEIVES notify, not that notify happens to be the last key
  // in the literal - this pinned `notify }` and broke the moment another dep
  // joined it.
  assert(/createMediaWorker\(db, \{[^}]*notify[^}]*\}\)/.test(modSrc('media-studio.js')),
    'the media WORKER — where jobs actually finish — still has no notify');
});

check('money landing writes a feed row', () => {
  const pay = modSrc('payments.js');
  assert(/notify\(p\.workspace_id, \{/.test(pay), 'markPaid still only broadcasts a live frame');
  assert(/type: 'payment'/.test(pay), 'payment notifications have no category');
  assert(/notify = \(\) => \{\},/.test(pay), 'notify is not destructured with a safe default');
});

check('mentions and thread replies survive being offline', () => {
  const c = modSrc('comms.js');
  assert(/type: 'mention', userId: uid/.test(c), 'a mention still leaves no record (audit comms-2)');
  assert(/type: 'reply', userId: rootAuthor/.test(c), 'a thread reply still leaves no record at all');
  // Both must stay user-targeted: a mention is not workspace news.
  assert(!/notify\(workspaceId, \{\s*type: 'mention',\s*title/.test(c), 'mention notification is not user-scoped');
});

check('contract viewed/declined and booking reschedule/cancel notify', () => {
  const cs = modSrc('contracts-studio.js');
  assert(/title: 'Contract viewed'/.test(cs), 'only signing notified — "did they open it?" was unanswerable');
  assert(/title: 'Contract declined'/.test(cs), 'a declined contract still says nothing');
  const bk = modSrc('booking.js');
  assert(/title: 'Booking rescheduled'/.test(bk) && /title: 'Booking cancelled'/.test(bk),
    'the client was messaged but the studio feed stayed silent');
  assert(/'booking_updated'/.test(bk) && /'booking_cancelled'/.test(bk),
    "reschedule and cancel both still emit 'booking_created'");
});

check('media jobs report completion AND failure', () => {
  const w = modSrc('media-worker.js');
  for (const t of ['Gallery ZIP ready', 'Album PDF ready', 'Video export finished', 'Video export failed']) {
    assert(w.includes(t), `media worker does not notify: ${t}`);
  }
});

check('the badge summary counts unread team messages', () => {
  const route = S.slice(S.indexOf("app.get('/api/notifications/summary'"), S.indexOf("app.get('/api/notifications/summary'") + 1800);
  assert(/JOIN chat_members mem ON mem\.channel_id = m\.channel_id AND mem\.user_id = \?/.test(route),
    'comms unread is not counted — team messages invisible outside /chat');
  assert(/m\.user_id != \?/.test(route), 'your own messages would count as unread');
  // The bell badge must NOT include comms: its panel has no row for a team
  // message, so counting them made the badge point at nothing (it cleared on
  // click and returned on the next poll). Comms rides the Communications nav badge.
  assert(/total: reminders \+ unread/.test(route),
    'the bell badge must count only clearable items (reminders + unread)');
  assert(/comms,/.test(route), 'comms must still be returned for the nav badge');
  // todayLeads is DERIVED from the leads table, so nothing can mark it read: counting
  // it made the badge point at rows the panel hid behind a local dismissed-set.
  assert(!/total: todayLeads/.test(route), 'the badge counts derived leads again — those cannot be cleared');
});

// The comms-unread SQL decides a number users will trust — run it for real.
check('the comms unread count is correct per member and ignores your own messages', () => {
  const d = new Database(':memory:');
  d.exec(`
    CREATE TABLE chat_members (channel_id TEXT, user_id TEXT, last_read_at TIMESTAMP, PRIMARY KEY (channel_id, user_id));
    CREATE TABLE chat_messages (id TEXT PRIMARY KEY, channel_id TEXT, user_id TEXT, created_at TIMESTAMP);
    INSERT INTO chat_members VALUES ('c1','alice','2026-01-01 00:00:00'), ('c1','bob',NULL), ('c2','bob','2026-01-01 00:00:00');
    INSERT INTO chat_messages VALUES
      ('m1','c1','bob','2026-01-02 10:00:00'),
      ('m2','c1','bob','2026-01-02 11:00:00'),
      ('m3','c1','alice','2026-01-02 12:00:00'),
      ('m4','c2','carol','2025-12-01 09:00:00'),
      ('m5','c3','carol','2026-01-03 09:00:00');
  `);
  const q = d.prepare(`SELECT COUNT(*) c FROM chat_messages m
    JOIN chat_members mem ON mem.channel_id = m.channel_id AND mem.user_id = ?
    WHERE m.user_id != ? AND (mem.last_read_at IS NULL OR m.created_at > mem.last_read_at)`);
  assert.strictEqual(q.get('alice', 'alice').c, 2, "alice should see bob's 2 messages, not her own");
  assert.strictEqual(q.get('bob', 'bob').c, 1, 'a NULL last_read_at means everything is unread; c2 is already read');
  assert.strictEqual(q.get('carol', 'carol').c, 0, 'a non-member must count nothing (c3 has no membership row)');
  // The stated trade-off, pinned so it cannot drift into a bug report: a DM
  // counts immediately (its membership row is written at creation), a public
  // channel only after you have opened it once.
  d.exec("INSERT INTO chat_members VALUES ('dm_x','dave',NULL); INSERT INTO chat_messages VALUES ('m6','dm_x','erin','2026-01-04 09:00:00');");
  assert.strictEqual(q.get('dave', 'dave').c, 1, 'a DM must badge from the first message');
  d.close();
});

// ── the accessor's real behaviour, not just its shape ──
check('the status accessor emits once per real transition and reads back correctly', () => {
  const src = read('whatsapp-service.js');
  const body = src.slice(src.indexOf('  get status()'), src.indexOf('  _emit(user, type, data)'));
  const Fake = new Function('return class { ' +
    'constructor(bc){ this.broadcastToWorkspace = bc; this.accountId = "a1"; this.qrCode = null; this.phoneNumber = null; this._status = "disconnected"; }' +
    ' _resolveOwner(){ return { id: "u1", workspace_id: "ws1" }; } ' + body + ' }')();
  const seen = [];
  const svc = new Fake((ws, type, data) => seen.push(data.status));
  assert.strictEqual(seen.length, 0, 'constructing a service emitted a status frame');
  svc.status = 'qr_ready';
  svc.status = 'qr_ready';   // no-op write must not re-emit
  svc.status = 'connected';
  assert.deepStrictEqual(seen, ['qr_ready', 'connected'], 'wrong emission sequence: ' + JSON.stringify(seen));
  assert.strictEqual(svc.status, 'connected', 'status does not read back');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
