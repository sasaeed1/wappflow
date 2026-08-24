'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  SECURITY — authentication and sessions.
//
//  Four weaknesses this pins, all found by audit rather than by failure:
//
//  1. Session tokens were signed with NO EXPIRY. token_version revokes on a
//     password reset, but a user who never resets had an immortal credential: a
//     token copied off a laptop worked forever.
//  2. A token was accepted from the QUERY STRING on all 384 authenticated
//     routes. A credential in a URL lands in nginx access logs, browser history
//     and the Referer header sent to any third party the page links to. Only the
//     SSE stream genuinely needs it — EventSource cannot set headers.
//  3. Registration accepted ANY password, including an empty string, while the
//     reset flow demanded eight characters. The weakest door defines the account.
//  4. Changing a password did not end other sessions, though someone changing it
//     because they think it leaked expects exactly that.
//
//  Run against a real server on a scratch data dir:
//    DATA_DIR=<scratch> PORT=3021 node server.js &
//    WF_API=http://127.0.0.1:3021/api WF_DB=<scratch>/wappflow.db \
//      WF_SQLITE=./node_modules/better-sqlite3 node test-security-auth.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const API = process.env.WF_API || 'http://127.0.0.1:3021/api';
const Database = require(process.env.WF_SQLITE || 'better-sqlite3');

let pass = 0, fail = 0;
const check = async (n, fn) => { try { await fn(); console.log('  OK  ', n); pass++; } catch (e) { console.log('  FAIL', n, '-', e.message || e); fail++; } };
const j = async (m, p, tok, body) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch {}
  return { status: r.status, d };
};
const raw = async (p) => { const r = await fetch(API + p); let d = null; try { d = await r.json(); } catch {} return { status: r.status, d }; };
const RUN = process.pid.toString(36) + Math.random().toString(36).slice(2, 8);
const openDb = (rw) => new Database(process.env.WF_DB, rw ? {} : { readonly: true });
const decode = (t) => JSON.parse(Buffer.from(String(t).split('.')[1], 'base64').toString());

(async () => {
  const EMAIL = `auth-${RUN}@test.local`;
  const reg = await j('POST', '/auth/register', null, { email: EMAIL, password: 'a-good-password-1', businessName: 'Auth Studio' });
  assert(reg.status >= 200 && reg.status < 300, 'could not register - is the server up on ' + API + ' ? ' + JSON.stringify(reg.d));
  const A = reg.d;

  // ── Password policy ───────────────────────────────────────────────────────
  await check('registration refuses a weak password', async () => {
    for (const pw of ['', 'x', 'short7']) {
      const r = await j('POST', '/auth/register', null, { email: `weak-${RUN}-${pw.length}@test.local`, password: pw, businessName: 'X' });
      assert.strictEqual(r.status, 400, `a ${pw.length}-character password was accepted`);
    }
  });

  await check('registration refuses a non-email', async () => {
    const r = await j('POST', '/auth/register', null, { email: 'not-an-email', password: 'a-good-password-1', businessName: 'X' });
    assert.strictEqual(r.status, 400, 'a malformed email was accepted');
  });

  await check('every door that sets a password agrees on the minimum', async () => {
    // The weakest one defines the account's security, so they cannot disagree.
    const r = await j('PUT', '/auth/password', A.token, { current_password: 'a-good-password-1', new_password: 'weak' });
    assert.strictEqual(r.status, 400, 'change-password accepted a 4-character password');
  });

  // ── Sessions expire ───────────────────────────────────────────────────────
  await check('a session token carries an expiry', async () => {
    const claims = decode(A.token);
    assert(claims.exp, 'the token has no exp claim — it is valid forever');
    const days = (claims.exp - claims.iat) / 86400;
    assert(days > 1 && days <= 90, `implausible session length: ${days.toFixed(1)} days`);
  });

  await check('an EXPIRED token is refused', async () => {
    // Forge one with the real secret but a past expiry: proves the expiry is
    // actually checked, not merely present.
    const jwt = require('jsonwebtoken');
    const dead = jwt.sign({ userId: A.user.id, tv: 0 }, process.env.JWT_SECRET || 'test-only-secret', { expiresIn: '-1h' });
    const r = await j('GET', '/leads', dead);
    assert.strictEqual(r.status, 401, `an expired token was accepted (status ${r.status})`);
  });

  await check('a token signed with the WRONG secret is refused', async () => {
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign({ userId: A.user.id, tv: 0 }, 'not-the-real-secret', { expiresIn: '1h' });
    const r = await j('GET', '/leads', forged);
    assert.strictEqual(r.status, 401, 'a forged token was accepted — the secret is not being checked');
  });

  await check('an unsigned "alg:none" token is refused', async () => {
    // The classic JWT bypass. jsonwebtoken defends against it, but the app has to
    // actually be verifying rather than decoding.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ userId: A.user.id, tv: 0 })).toString('base64url');
    const r = await j('GET', '/leads', `${header}.${body}.`);
    assert.strictEqual(r.status, 401, 'an unsigned token was accepted');
  });

  // ── Credentials in URLs ───────────────────────────────────────────────────
  await check('a token in the QUERY STRING does not authenticate a normal route', async () => {
    // A credential in a URL ends up in access logs, browser history and Referer
    // headers. This used to work on all 384 authenticated routes.
    const r = await raw(`/leads?token=${encodeURIComponent(A.token)}`);
    assert.strictEqual(r.status, 401, `a query-string token authenticated /leads (status ${r.status})`);
  });

  await check('…on several routes, not just the one', async () => {
    for (const p of ['/invoices', '/media/projects', '/cs/documents', '/analytics']) {
      const r = await raw(`${p}?token=${encodeURIComponent(A.token)}`);
      assert.strictEqual(r.status, 401, `a query-string token authenticated ${p} (status ${r.status})`);
    }
  });

  await check('but the SSE stream still works, because EventSource cannot send a header', async () => {
    // Breaking realtime to close the leak would be a bad trade; the point is that
    // this is the ONLY route where the query token is honoured.
    const r = await fetch(`${API}/events?token=${encodeURIComponent(A.token)}`, { headers: { Accept: 'text/event-stream' } });
    assert.strictEqual(r.status, 200, `the SSE stream rejected its own token (status ${r.status})`);
    try { r.body?.cancel(); } catch {}
  });

  // ── Session revocation ────────────────────────────────────────────────────
  await check('changing a password ends other sessions', async () => {
    const old = (await j('POST', '/auth/login', null, { email: EMAIL, password: 'a-good-password-1' })).d.token;
    assert.strictEqual((await j('GET', '/leads', old)).status, 200, 'the fresh session does not work');

    const ch = await j('PUT', '/auth/password', old, { current_password: 'a-good-password-1', new_password: 'another-good-one-2' });
    assert.strictEqual(ch.status, 200, 'change-password failed: ' + JSON.stringify(ch.d));

    assert.strictEqual((await j('GET', '/leads', old)).status, 401, 'the old session survived a password change');
    const fresh = (await j('POST', '/auth/login', null, { email: EMAIL, password: 'another-good-one-2' })).d.token;
    assert.strictEqual((await j('GET', '/leads', fresh)).status, 200, 'the new session does not work');
  });

  await check('login does not reveal whether an account exists', async () => {
    const noUser = await j('POST', '/auth/login', null, { email: `ghost-${RUN}@test.local`, password: 'whatever-1234' });
    const badPw = await j('POST', '/auth/login', null, { email: EMAIL, password: 'wrong-password-99' });
    assert.strictEqual(noUser.status, badPw.status, `different status: ${noUser.status} vs ${badPw.status}`);
    assert.deepStrictEqual(noUser.d, badPw.d, 'the message differs, so an attacker can enumerate accounts');
  });

  await check('no token at all is refused', async () => {
    assert.strictEqual((await raw('/leads')).status, 401, 'an unauthenticated request reached the data');
  });

  await check('bumping a user’s token_version invalidates their live sessions', async () => {
    // This is the revocation lever behind password reset and change. It has to
    // work on its own, because anything that needs to kill a session — a stolen
    // laptop, an offboarded member — will reach for it.
    //
    // (A user cannot simply be DELETED: a foreign key keeps anybody with data,
    // so "deleted user's token" is not a state this schema can reach.)
    const V = (await j('POST', '/auth/register', null, { email: `victim-${RUN}@test.local`, password: 'victim-password-1', businessName: 'V' })).d;
    assert.strictEqual((await j('GET', '/leads', V.token)).status, 200, 'the fresh session does not work');
    const db = openDb(true);
    db.prepare('UPDATE users SET token_version = COALESCE(token_version,0) + 1 WHERE id = ?').run(V.user.id);
    db.close();
    assert.strictEqual((await j('GET', '/leads', V.token)).status, 401, 'a revoked session still reads data');
  });

  await check('brute force is rate limited', async () => {
    const email = `brute-${RUN}@test.local`;
    await j('POST', '/auth/register', null, { email, password: 'brute-password-1', businessName: 'B' });
    let limited = false;
    for (let i = 0; i < 40; i++) {
      const r = await j('POST', '/auth/login', null, { email, password: 'wrong-' + i });
      if (r.status === 429) { limited = true; break; }
    }
    assert(limited, '40 wrong passwords in a row were all accepted for processing — no rate limit');
  });

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
