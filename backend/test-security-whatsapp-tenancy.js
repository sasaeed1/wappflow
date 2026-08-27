'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  WhatsApp tenant isolation — regression test for a LIVE cross-tenant leak.
//
//  WHAT HAPPENED (2026-08-27, production): a second studio signed up, connected
//  her own WhatsApp number, and sent a message to a contact from her own
//  WappFlow account. It was delivered from the FIRST studio's number — putting
//  her conversation into a stranger's phone, and that stranger's number in front
//  of her contact.
//
//  WHY: WhatsAppManager.getReadyService() resolved a client like this —
//
//      if (accountId) { ...ready? return it }
//      if (legacy?.isReady) return legacy;          // ← any workspace
//      for (const s of instances.values())
//        if (s.isReady) return s;                   // ← ANY workspace
//
//  …with no tenancy check anywhere, and every server.js call site invoked
//  sendMessage(phone, body) with no account and no workspace. So whenever a
//  workspace's own client was not ready, its messages silently went out over
//  whichever client happened to be connected.
//
//  A second leak sat on the inbound side: _resolveOwner() fell back to
//  "the oldest user in the system", filing every inbound message from an
//  unmapped session into the first signup's CRM.
//
//  These tests assert the CAPABILITY (a workspace can never reach another
//  workspace's client), not the shape of the code.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const { WhatsAppManager } = require('./whatsapp-service.js');

let pass = 0, fail = 0;
// A check may return a promise (some assertions need a microtask drain). Those
// are collected and awaited at the end. Returning one and NOT awaiting it is how
// an assertion silently always passes — which is exactly what happened to the
// "sending from Beta throws" check until the control run exposed it.
const pending = [];
const check = (n, fn) => {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      pending.push(r.then(
        () => { console.log('  ✓', n); pass++; },
        (e) => { console.log('  ✗', n, '—', e.message); fail++; },
      ));
      return;
    }
    console.log('  ✓', n); pass++;
  } catch (e) { console.log('  ✗', n, '—', e.message); fail++; }
};

// ── A two-tenant world ──────────────────────────────────────────────────────
const db = new Database(':memory:');
db.exec(`
  CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT, created_at TEXT);
  CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, workspace_id TEXT, created_at TEXT);
  CREATE TABLE platform_accounts (id TEXT PRIMARY KEY, workspace_id TEXT, platform TEXT, slot_index INT, status TEXT);
  CREATE TABLE messages (id TEXT PRIMARY KEY, lead_id TEXT, user_id TEXT, body TEXT, from_me INT, timestamp TEXT, platform TEXT);
`);
const WS_A = 'ws-alpha', WS_B = 'ws-beta';
db.prepare('INSERT INTO workspaces VALUES (?,?,?)').run(WS_A, 'Alpha Studio', '2026-01-01');
db.prepare('INSERT INTO workspaces VALUES (?,?,?)').run(WS_B, 'Beta Studio', '2026-06-01');
db.prepare('INSERT INTO users VALUES (?,?,?,?)').run('u-a', 'a@example.test', WS_A, '2026-01-01');
db.prepare('INSERT INTO users VALUES (?,?,?,?)').run('u-b', 'b@example.test', WS_B, '2026-06-01');
db.prepare('INSERT INTO platform_accounts VALUES (?,?,?,?,?)').run('acct-a', WS_A, 'whatsapp', 0, 'connected');
db.prepare('INSERT INTO platform_accounts VALUES (?,?,?,?,?)').run('acct-b', WS_B, 'whatsapp', 0, 'connected');

const mgr = new WhatsAppManager(db, () => {}, () => {}, () => {});
// Stand-in clients. Only Alpha is connected — precisely the situation that
// produced the leak (Beta's client not ready, Beta sends anyway).
const sent = [];
const fakeClient = (label, ready) => ({
  isReady: ready,
  sendMessage: async (phone, body) => { sent.push({ from: label, phone, body }); return { ok: true }; },
  sendVoiceNote: async () => ({ ok: true }),
  sendMedia: async () => ({ ok: true }),
  fetchHistory: async () => [{ from: label }],
  saveOutgoingMessage: () => {},
});
mgr.instances.set('acct-a', fakeClient('ALPHA', true));
mgr.instances.set('acct-b', fakeClient('BETA', false));

console.log('\n[1] A workspace can never be handed another workspace\'s client');

check('Beta gets NOTHING when only Alpha is connected (the actual leak)', () => {
  const svc = mgr.getReadyService(null, WS_B);
  assert.strictEqual(svc, null,
    'Beta was handed a ready client belonging to another workspace — this is the production bug');
});

check('Alpha still gets its own client', () => {
  const svc = mgr.getReadyService(null, WS_A);
  assert(svc, 'Alpha could not reach its own connected client');
  assert.strictEqual(svc.isReady, true);
});

check('naming another workspace\'s account explicitly is refused', () => {
  assert.strictEqual(mgr.getReadyService('acct-a', WS_B), null,
    'Beta reached Alpha by passing Alpha\'s accountId');
});

// Deliberately NOT async: check() is synchronous, so a returned promise would
// never be observed and the assertion would silently always pass. (It did, in
// the control run against the broken code — caught only because every other
// check failed there.) sendMessage is async, so drive it to completion here.
check('sending from Beta throws instead of borrowing Alpha\'s number', () => {
  let settled = null;
  mgr.sendMessage('+15550000', 'hello', null, WS_B).then(
    () => { settled = 'sent'; },
    (e) => { settled = 'threw:' + e.message; },
  );
  // _requireService throws synchronously inside the async function, so the
  // rejection is already queued; one microtask drain is enough to observe it.
  return Promise.resolve().then(() => {
    assert(settled && settled.startsWith('threw'),
      `Beta's send did not fail (settled=${settled}) — it used another workspace's client`);
    assert.strictEqual(sent.length, 0,
      `a message was actually dispatched from another workspace: ${JSON.stringify(sent)}`);
  });
});

check('fetchHistory cannot read another workspace\'s WhatsApp history', () => {
  assert.strictEqual(mgr.getReadyService(null, WS_B), null,
    'Beta could reach a client that would return Alpha\'s conversation history');
});

console.log('\n[2] The legacy session belongs to nobody once a second tenant exists');

check('legacy client is not handed to any workspace in a multi-tenant install', () => {
  // Only the legacy session is running — no account-mapped client to mask the
  // result. In a two-tenant install it belongs to neither workspace.
  const only = new Database(':memory:');
  only.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY);
             CREATE TABLE platform_accounts (id TEXT PRIMARY KEY, workspace_id TEXT);`);
  only.prepare('INSERT INTO workspaces VALUES (?)').run(WS_A);
  only.prepare('INSERT INTO workspaces VALUES (?)').run(WS_B);
  const m = new WhatsAppManager(only, () => {}, () => {}, () => {});
  m.instances.set('__legacy__', fakeClient('LEGACY', true));
  assert.strictEqual(m.getReadyService(null, WS_A), null,
    'the legacy session was handed out despite belonging to no workspace');
  assert.strictEqual(m.getReadyService(null, WS_B), null);
  only.close();
});

check('legacy client IS usable in a single-tenant install', () => {
  const solo = new Database(':memory:');
  solo.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY);
             CREATE TABLE platform_accounts (id TEXT PRIMARY KEY, workspace_id TEXT);`);
  solo.prepare('INSERT INTO workspaces VALUES (?)').run(WS_A);
  const m2 = new WhatsAppManager(solo, () => {}, () => {}, () => {});
  m2.instances.set('__legacy__', fakeClient('LEGACY', true));
  assert(m2.getReadyService(null, WS_A), 'single-tenant legacy session broke');
  solo.close();
});

console.log('\n[3] Inbound attribution refuses to guess');

check('_resolveOwner returns null rather than filing into the oldest workspace', () => {
  const src = fs.readFileSync(path.join(__dirname, 'whatsapp-service.js'), 'utf8');
  const fn = src.slice(src.indexOf('_resolveOwner()'), src.indexOf('_cleanLocks'));
  assert(/SELECT id FROM workspaces LIMIT 2/.test(fn),
    '_resolveOwner does not check how many workspaces exist');
  assert(/return null/.test(fn),
    '_resolveOwner still attributes to a guessed owner when it cannot know the real one');
});

console.log('\n[4] No caller may send without saying which workspace it is');

check('every whatsappService send/read call passes a workspace', () => {
  const files = ['server.js', 'media-studio.js', 'booking.js', 'contracts-studio.js']
    .map((f) => path.join(__dirname, f))
    .filter((f) => fs.existsSync(f));
  const offenders = [];
  const RISKY = /whatsappService\.(sendMessage|sendVoiceNote|sendMedia|fetchHistory|saveOutgoingMessage|createGroup|setGroupSubject|setGroupDescription|setGroupPicture)\s*\(/;
  for (const f of files) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (!RISKY.test(line)) return;
      // The workspace is the last argument on every one of these signatures.
      if (!/workspace_id|workspaceId/.test(line)) {
        offenders.push(`${path.basename(f)}:${i + 1}  ${line.trim().slice(0, 78)}`);
      }
    });
  }
  assert.strictEqual(offenders.length, 0,
    `${offenders.length} call(s) can still be routed to any connected number:\n   ` + offenders.join('\n   '));
});

Promise.all(pending).then(() => {
  db.close();
  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
  process.exitCode = fail === 0 ? 0 : 1;
});
