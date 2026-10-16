'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  SECURITY — team invites.
//
//  1. Inviting an email that already had an account joined it to the inviting
//     workspace ON THE SPOT and rewrote its users.workspace_id — anyone could pull
//     another studio's owner into their own workspace, with no email and no consent.
//  2. Every member, down to the "user" role, could read pending invite tokens in
//     GET /api/team — and accept an admin invite under a new account.
//  3. Accepting an invite for an existing account now checks THAT account's
//     password, so accept-invite is rate limited like sign-in.
//
//  Run against a real server on a scratch data dir:
//    DATA_DIR=<scratch> PORT=3021 RATE_LIMIT_ACCOUNT=5000 node server.js &
//    WF_API=http://127.0.0.1:3021/api WF_DB=<scratch>/wappflow.db \
//      WF_SQLITE=./node_modules/better-sqlite3 node test-security-invites.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const crypto = require('crypto');
const API = process.env.WF_API || 'http://127.0.0.1:3021/api';
const Database = require(process.env.WF_SQLITE || 'better-sqlite3');
const { requireSameDb } = require('./test-db-check');

let pass = 0, fail = 0;
const check = async (n, fn) => { try { await fn(); console.log('  OK  ', n); pass++; } catch (e) { console.log('  FAIL', n, '-', e.message || e); fail++; } };
const j = async (m, p, tok, body) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch {}
  return { status: r.status, d };
};
const RUN = crypto.randomBytes(4).toString('hex');
const openDb = (rw) => new Database(process.env.WF_DB, rw ? {} : { readonly: true });

(async () => {
  await requireSameDb(API, Database);
  const reg = async (tag) => (await j('POST', '/auth/register', null, { email: `${tag}-${RUN}@test.local`, password: `${tag}-password-1`, businessName: tag })).d;
  const attacker = await reg('attacker');
  const victim = await reg('victim');
  assert(attacker?.token && victim?.token, 'could not register - is the server up on ' + API + ' ?');

  await check('inviting an existing account does NOT move it into the inviting workspace', async () => {
    const r = await j('POST', '/workspace/invite', attacker.token, { email: `victim-${RUN}@test.local`, role: 'user' });
    assert(r.status < 300, JSON.stringify(r.d));
    const db = openDb();
    const u = db.prepare('SELECT workspace_id FROM users WHERE id = ?').get(victim.user.id);
    const m = db.prepare("SELECT invite_status FROM workspace_members WHERE workspace_id = ? AND invite_email = ?").get(attacker.user.workspace_id, `victim-${RUN}@test.local`);
    db.close();
    assert.strictEqual(u.workspace_id, victim.user.workspace_id, "the victim's account was moved into the attacker's workspace");
    assert.strictEqual(m?.invite_status, 'pending', 'the invite was not left pending');
    const me = await j('GET', '/workspace', victim.token);
    assert.strictEqual(me.d?.workspace?.id, victim.user.workspace_id, "the victim now sees the attacker's workspace");
  });

  const tokenFor = (wsId, email) => { const db = openDb(); const t = db.prepare('SELECT invite_token FROM workspace_members WHERE workspace_id = ? AND invite_email = ?').get(wsId, email)?.invite_token; db.close(); return t; };

  await check("accepting for an existing account needs THAT account's password, and never changes it", async () => {
    const token = tokenFor(attacker.user.workspace_id, `victim-${RUN}@test.local`);
    assert(token, 'no invite token');
    const info = await j('GET', `/auth/invite-info/${token}`, null);
    assert(!('existing_account' in (info.d || {})), 'invite-info reveals whether the email has an account');
    const wrong = await j('POST', '/auth/accept-invite', null, { token, password: 'attacker-chosen-password', full_name: 'x' });
    assert.strictEqual(wrong.status, 401, 'an invite was accepted for an existing account without its password: ' + JSON.stringify(wrong.d));
    const login = await j('POST', '/auth/login', null, { email: `victim-${RUN}@test.local`, password: 'victim-password-1' });
    assert.strictEqual(login.status, 200, "the victim's password changed");
    const right = await j('POST', '/auth/accept-invite', null, { token, password: 'victim-password-1' });
    assert.strictEqual(right.status, 200, 'the owner could not accept with their own password: ' + JSON.stringify(right.d));
  });

  await check('pending invite tokens are not listed to team members', async () => {
    await j('POST', '/workspace/invite', attacker.token, { email: `newadmin-${RUN}@test.local`, role: 'admin' });
    const team = await j('GET', '/team', attacker.token);
    assert.strictEqual(team.status, 200);
    assert(!JSON.stringify(team.d).includes(tokenFor(attacker.user.workspace_id, `newadmin-${RUN}@test.local`)), 'GET /api/team lists invite tokens');
    assert(!(team.d.members || []).some((m) => 'invite_token' in m), 'members carry an invite_token field');
  });

  await check('a plain member cannot change the legacy team list', async () => {
    const member = await reg('member');
    const db = openDb(true);
    db.prepare('UPDATE users SET workspace_id = ? WHERE id = ?').run(attacker.user.workspace_id, member.user.id);
    db.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role, invite_status) VALUES (?, ?, ?, 'user', 'active')").run('wm-' + RUN, attacker.user.workspace_id, member.user.id);
    db.close();
    const r = await j('POST', '/team', member.token, { name: 'x', email: 'x@x.com', role: 'admin' });
    assert.strictEqual(r.status, 403, `a plain member got ${r.status}`);
  });

  await check('invite tokens are two UUIDs long (shape only — randomness comes from crypto.randomUUID)', async () => {
    const t = tokenFor(attacker.user.workspace_id, `newadmin-${RUN}@test.local`);
    assert(/^[0-9a-f-]{72}$/.test(t), 'unexpected token shape: ' + t);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
