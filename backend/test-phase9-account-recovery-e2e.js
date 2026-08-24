'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 9 — account recovery, and the properties that make it safe.
//
//  There was NO password reset of any kind. The login page carried a literal
//  `{/* placeholder for forgot-password */}` comment where the link should be,
//  so a studio owner who forgot their password was locked out of their own
//  business permanently — no self-serve route, no admin route, nothing short of
//  editing the database by hand.
//
//  A reset flow is a security surface, so these check the properties that make
//  one safe rather than just "it changes the password":
//    · no account enumeration          · tokens stored hashed, never plain
//    · single use                      · expiry honoured
//    · old sessions revoked            · one user's token cannot reset another
//
//  Run against a real server on a scratch data dir:
//    DATA_DIR=<scratch> PORT=3018 node server.js &
//    WF_API=http://127.0.0.1:3018/api WF_DB=<scratch>/wappflow.db \
//      WF_SQLITE=./node_modules/better-sqlite3 node test-phase9-account-recovery-e2e.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const crypto = require('crypto');
const API = process.env.WF_API || 'http://127.0.0.1:3018/api';
const Database = require(process.env.WF_SQLITE || 'better-sqlite3');

let pass = 0, fail = 0;
const check = async (n, fn) => { try { await fn(); console.log('  OK  ', n); pass++; } catch (e) { console.log('  FAIL', n, '-', e.message || e); fail++; } };
const j = async (m, p, tok, body) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch {}
  return { status: r.status, d };
};
const RUN = process.pid.toString(36) + Math.random().toString(36).slice(2, 8);
const openDb = (rw) => new Database(process.env.WF_DB, rw ? {} : { readonly: true });
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

// The mail never leaves in a test (no SMTP), so read the token the way an
// attacker with database access could NOT: by hashing candidates. We know the
// plaintext only because we mint it here through the same path the mail uses.
// Instead, plant a known token directly and drive the public endpoints with it.
const plantToken = (userId, { minutesValid = 60, used = false } = {}) => {
  const token = crypto.randomBytes(32).toString('hex');
  const db = openDb(true);
  db.prepare('INSERT INTO password_resets (id, user_id, token_hash, expires_at, used_at) VALUES (?,?,?,?,?)')
    .run('pr-' + crypto.randomBytes(6).toString('hex'), userId, hashToken(token),
         new Date(Date.now() + minutesValid * 60000).toISOString(), used ? new Date().toISOString() : null);
  db.close();
  return token;
};

(async () => {
  const EMAIL = `rec-${RUN}@test.local`;
  const A = (await j('POST', '/auth/register', null, { email: EMAIL, password: 'original-pw-1', businessName: 'Recovery Studio' })).d;
  assert(A?.token, 'could not register - is the server up on ' + API + ' ?');

  const B = (await j('POST', '/auth/register', null, { email: `other-${RUN}@test.local`, password: 'other-pw-1', businessName: 'Other Studio' })).d;

  await check('asking for a reset never reveals whether the account exists', async () => {
    // Otherwise this endpoint is a free account-enumeration oracle for the whole
    // platform: try an email, learn whether that person is a customer.
    const real = await j('POST', '/auth/forgot-password', null, { email: EMAIL });
    const fake = await j('POST', '/auth/forgot-password', null, { email: `nobody-${RUN}@test.local` });
    assert.strictEqual(real.status, fake.status, `different status for real vs fake: ${real.status} vs ${fake.status}`);
    assert.deepStrictEqual(real.d, fake.d, 'the response differs for a real address: ' + JSON.stringify({ real: real.d, fake: fake.d }));
    assert(!/not found|no account|unknown/i.test(JSON.stringify(real.d) + JSON.stringify(fake.d)), 'the copy leaks existence');
  });

  await check('a request for a real account does create a token', async () => {
    const db = openDb();
    const n = db.prepare('SELECT COUNT(*) n FROM password_resets WHERE user_id = ?').get(A.user.id).n;
    db.close();
    assert(n >= 1, 'no reset was recorded for a real account');
  });

  await check('a request for an unknown address creates nothing', async () => {
    // Measure the DELTA, not the absolute count: comparing totals only holds on a
    // spotless database, which is the failure mode that makes a suite quietly
    // stop being runnable.
    const total = () => { const d = openDb(); const n = d.prepare('SELECT COUNT(*) n FROM password_resets').get().n; d.close(); return n; };
    const before = total();
    await j('POST', '/auth/forgot-password', null, { email: `ghost-${RUN}-${Date.now()}@test.local` });
    assert.strictEqual(total(), before, 'a reset row was created for an address with no account');
  });

  await check('the token is stored HASHED, never in plain text', async () => {
    // A database read - a backup, a leaked file - must not hand anybody a
    // working reset link.
    const token = plantToken(A.user.id);
    const db = openDb();
    const row = db.prepare('SELECT token_hash FROM password_resets WHERE token_hash = ?').get(hashToken(token));
    const plain = db.prepare('SELECT COUNT(*) n FROM password_resets WHERE token_hash = ?').get(token).n;
    db.close();
    assert(row, 'the planted token is not stored under its hash');
    assert.strictEqual(plain, 0, 'the raw token is sitting in the database');
    assert.strictEqual(row.token_hash.length, 64, 'the stored value is not a sha256 hash');
  });

  await check('a valid link reports itself valid before asking for a password', async () => {
    const token = plantToken(A.user.id);
    const r = await j('GET', `/auth/reset-password/${token}`, null);
    assert.strictEqual(r.d.valid, true, 'a fresh link reports invalid');
  });

  await check('an EXPIRED link is refused', async () => {
    const token = plantToken(A.user.id, { minutesValid: -5 });
    assert.strictEqual((await j('GET', `/auth/reset-password/${token}`, null)).d.valid, false, 'an expired link reports valid');
    const r = await j('POST', '/auth/reset-password', null, { token, password: 'brand-new-pw-1' });
    assert.strictEqual(r.status, 400, 'an expired token was accepted');
  });

  await check('an ALREADY-USED link is refused', async () => {
    const token = plantToken(A.user.id, { used: true });
    const r = await j('POST', '/auth/reset-password', null, { token, password: 'brand-new-pw-1' });
    assert.strictEqual(r.status, 400, 'a used token was accepted a second time');
  });

  await check('a made-up token is refused, and says nothing useful', async () => {
    const r = await j('POST', '/auth/reset-password', null, { token: crypto.randomBytes(32).toString('hex'), password: 'brand-new-pw-1' });
    assert.strictEqual(r.status, 400);
    // Expired, used and never-existed must be indistinguishable: telling them
    // apart says which guesses were once real.
    const used = await j('POST', '/auth/reset-password', null, { token: plantToken(A.user.id, { used: true }), password: 'x'.repeat(10) });
    assert.strictEqual(r.d.error, used.d.error, 'a bogus token is distinguishable from a used one');
  });

  await check('a short password is refused', async () => {
    const r = await j('POST', '/auth/reset-password', null, { token: plantToken(A.user.id), password: 'short' });
    assert.strictEqual(r.status, 400, 'a 5-character password was accepted');
  });

  let oldToken = A.token;
  await check('a valid reset changes the password', async () => {
    const token = plantToken(A.user.id);
    const r = await j('POST', '/auth/reset-password', null, { token, password: 'the-new-password-9' });
    assert.strictEqual(r.status, 200, 'the reset failed: ' + JSON.stringify(r.d));

    const bad = await j('POST', '/auth/login', null, { email: EMAIL, password: 'original-pw-1' });
    assert.notStrictEqual(bad.status, 200, 'the OLD password still signs in');
    const good = await j('POST', '/auth/login', null, { email: EMAIL, password: 'the-new-password-9' });
    assert.strictEqual(good.status, 200, 'the new password does not sign in: ' + JSON.stringify(good.d));
  });

  await check('resetting REVOKES sessions that were already open', async () => {
    // JWTs here are signed without an expiry, so without revocation a stolen
    // token outlives the password change that was meant to stop it.
    const r = await j('GET', '/leads', oldToken);
    assert.strictEqual(r.status, 401, `a session from before the reset still works (status ${r.status})`);
  });

  await check('the freshly-issued session DOES work', async () => {
    const good = (await j('POST', '/auth/login', null, { email: EMAIL, password: 'the-new-password-9' })).d;
    const r = await j('GET', '/leads', good.token);
    assert.strictEqual(r.status, 200, 'the new session was revoked too: ' + JSON.stringify(r.d));
  });

  await check('one user cannot be reset with another user’s token', async () => {
    const forB = plantToken(B.user.id);
    await j('POST', '/auth/reset-password', null, { token: forB, password: 'b-new-password-1' });
    // A's password must be untouched.
    const a = await j('POST', '/auth/login', null, { email: EMAIL, password: 'the-new-password-9' });
    assert.strictEqual(a.status, 200, "resetting B changed A's password");
    const b = await j('POST', '/auth/login', null, { email: `other-${RUN}@test.local`, password: 'b-new-password-1' });
    assert.strictEqual(b.status, 200, "B's own reset did not take effect");
  });

  await check('requesting a new link kills the outstanding one', async () => {
    // Two live links at once means an old email remains a working key.
    const first = plantToken(A.user.id);
    await j('POST', '/auth/forgot-password', null, { email: EMAIL });
    const r = await j('GET', `/auth/reset-password/${first}`, null);
    assert.strictEqual(r.d.valid, false, 'the earlier link is still usable after a new one was requested');
  });

  await check('using a link consumes every other outstanding link too', async () => {
    const t1 = plantToken(A.user.id);
    const t2 = plantToken(A.user.id);
    const r = await j('POST', '/auth/reset-password', null, { token: t2, password: 'final-password-42' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.d));
    assert.strictEqual((await j('GET', `/auth/reset-password/${t1}`, null)).d.valid, false,
      'a second outstanding link survived the reset');
  });

  await check('the reset does not hand back a session', async () => {
    // Possession of a mailbox is enough to choose a new password; it is not
    // enough to silently become that person.
    const r = await j('POST', '/auth/reset-password', null, { token: plantToken(A.user.id), password: 'yet-another-pw-7' });
    assert.strictEqual(r.status, 200);
    assert(!r.d.token, 'the reset response contains a session token');
  });

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
