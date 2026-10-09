'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  SECURITY — pre-launch sweep.
//
//  1. Studio mail settings could point the server at itself or the private
//     network (SSRF), and mailbox passwords sat in the database as plain text.
//  2. The public website form had no rate limit, no size caps and no honeypot,
//     and its "at least one field" check never fired (the name had a default).
//  3. Sign-up and "forgot password" were effectively unlimited: both answer
//     200, and the login limiter only counts failures. A real account also
//     answered slower than an unknown one (it waited on the mail server).
//  4. Portfolio cover/profile images accepted any string.
//
//  Run against a real server on a scratch data dir:
//    DATA_DIR=<scratch> PORT=3021 node server.js &
//    WF_API=http://127.0.0.1:3021/api WF_DB=<scratch>/wappflow.db \
//      WF_SQLITE=./node_modules/better-sqlite3 node test-security-sweep.js
//  Run it LAST against that server: the final check uses up the per-IP
//  account-request allowance.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const crypto = require('crypto');
const API = process.env.WF_API || 'http://127.0.0.1:3021/api';
const Database = require(process.env.WF_SQLITE || 'better-sqlite3');
const { requireSameDb } = require('./test-db-check');
const mailSec = require('./mail-security');

let pass = 0, fail = 0;
const check = async (n, fn) => { try { await fn(); console.log('  OK  ', n); pass++; } catch (e) { console.log('  FAIL', n, '-', e.message || e); fail++; } };
const j = async (m, p, tok, body) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch {}
  return { status: r.status, d };
};
const RUN = process.pid.toString(36) + Math.random().toString(36).slice(2, 8);
const openDb = (rw) => new Database(process.env.WF_DB, rw ? {} : { readonly: true });

(async () => {
  // ── mail-security, no server needed ──────────────────────────────────────
  await check('mail passwords seal and unseal; legacy plain text still reads', async () => {
    const sealed = mailSec.sealSecret('app-password-123');
    assert(sealed.startsWith('v1:') && !sealed.includes('app-password-123'), 'not sealed');
    assert.strictEqual(mailSec.unsealSecret(sealed), 'app-password-123');
    assert.strictEqual(mailSec.sealSecret(sealed), sealed, 'sealed twice');
    assert.strictEqual(mailSec.unsealSecret('legacy-plain'), 'legacy-plain');
    const tampered = sealed.slice(0, -4) + (sealed.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    assert.strictEqual(mailSec.unsealSecret(tampered), '', 'tampered value was accepted');
  });

  await check('mail hosts on the private network or odd ports are refused', async () => {
    for (const h of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '169.254.169.254', '::1', 'localhost']) {
      const r = await mailSec.checkMailHost(h, 587, 'smtp');
      assert(!r.ok, `${h} was allowed`);
      assert(/private|internal/i.test(r.error), `unclear message for ${h}: ${r.error}`);
    }
    assert(!(await mailSec.checkMailHost('8.8.8.8', 6379, 'smtp')).ok, 'a non-mail port was allowed');
    assert(!(await mailSec.checkMailHost('8.8.8.8', 587, 'imap')).ok, 'an SMTP port was allowed for IMAP');
    assert((await mailSec.checkMailHost('8.8.8.8', 587, 'smtp')).ok, 'a public address was refused');
    assert((await mailSec.checkMailHost('8.8.8.8', 993, 'imap')).ok, 'a public IMAP address was refused');
  });

  await check('a transport is never built for a private host', async () => {
    const fake = { createTransport: () => { throw new Error('should not be called'); } };
    await assert.rejects(mailSec.smtpTransport(fake, { smtp_host: '127.0.0.1', smtp_port: 25 }), (e) => e.code === 'EMAILHOST');
  });

  // ── Against the server ───────────────────────────────────────────────────
  await requireSameDb(API, Database);
  const reg = await j('POST', '/auth/register', null, { email: `sweep-${RUN}@test.local`, password: 'a-good-password-1', businessName: 'Sweep Studio' });
  assert(reg.status >= 200 && reg.status < 300, 'could not register - is the server up on ' + API + ' ? ' + JSON.stringify(reg.d));
  const A = reg.d;

  await check('saving SMTP settings refuses an internal host', async () => {
    const r = await j('PUT', '/settings/email-smtp', A.token, { smtp_host: '127.0.0.1', smtp_port: 25, smtp_user: 'x', smtp_pass: 'y' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.d));
    assert(/private|internal/i.test(r.d?.error || ''), r.d?.error);
  });

  await check('saving IMAP settings refuses an internal host', async () => {
    const r = await j('PUT', '/settings/email-imap', A.token, { imap_host: '169.254.169.254', imap_port: 993, imap_user: 'x', imap_pass: 'y' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.d));
  });

  await check('a saved SMTP password is stored sealed and shown masked', async () => {
    const r = await j('PUT', '/settings/email-smtp', A.token, { smtp_host: '8.8.8.8', smtp_port: 587, smtp_user: 'me@x.com', smtp_pass: 'plain-secret-9' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.d));
    const db = openDb(false);
    const row = db.prepare('SELECT smtp_pass FROM email_smtp_settings WHERE user_id = ?').get(A.user.id);
    db.close();
    assert(row && row.smtp_pass.startsWith('v1:') && !row.smtp_pass.includes('plain-secret-9'), 'stored in plain text');
    assert.strictEqual(mailSec.unsealSecret(row.smtp_pass), 'plain-secret-9');
    const g = await j('GET', '/settings/email-smtp', A.token);
    assert.strictEqual(g.d.smtp.smtp_pass, '••••••••');
  });

  // Website form: a token planted straight into the DB.
  const formToken = 'sweep' + crypto.randomBytes(12).toString('hex');
  { const db = openDb(true);
    db.prepare("INSERT INTO platform_accounts (id, workspace_id, platform, webhook_verify_token, status) VALUES (?, ?, 'website', ?, 'connected')")
      .run('pa-' + RUN, A.user.workspace_id, formToken);
    db.close(); }
  const leadsFor = () => { const db = openDb(false); const n = db.prepare("SELECT COUNT(*) n FROM leads WHERE workspace_id = ? AND platform_source = 'website'").get(A.user.workspace_id).n; db.close(); return n; };

  await check('website form: an empty post is refused, a honeypot post makes no lead', async () => {
    const before = leadsFor();
    const empty = await j('POST', `/website-form/${formToken}/submit`, null, { name: 'Only A Name' });
    assert.strictEqual(empty.status, 400, 'a post with no way to reach the person was accepted');
    const bot = await j('POST', `/website-form/${formToken}/submit`, null, { name: 'Bot', email: 'bot@x.com', _gotcha: 'filled' });
    assert.strictEqual(bot.status, 200);
    assert.strictEqual(leadsFor(), before, 'the honeypot post created a lead');
  });

  await check('website form: fields are capped', async () => {
    const r = await j('POST', `/website-form/${formToken}/submit`, null, { name: 'N'.repeat(5000), email: 'a@b.com', message: 'M'.repeat(20000) });
    assert.strictEqual(r.status, 200, JSON.stringify(r.d));
    const db = openDb(false);
    const lead = db.prepare('SELECT customer_name, first_message FROM leads WHERE id = ?').get(r.d.lead_id);
    db.close();
    assert(lead.customer_name.length <= 120 && lead.first_message.length <= 5000, 'not capped');
  });

  await check('website form: one form + IP is rate limited', async () => {
    let limited = false;
    for (let i = 0; i < 60 && !limited; i++) {
      const r = await j('POST', `/website-form/${formToken}/submit`, null, { email: `v${i}@x.com` });
      if (r.status === 429) limited = true;
    }
    assert(limited, 'no 429 after 60 submissions');
  });

  await check('portfolio images must be an upload or a web link', async () => {
    const bad = await j('PUT', '/media/portfolio', A.token, { cover_url: 'javascript:alert(1)' });
    assert.strictEqual(bad.status, 400, 'a javascript: URL was accepted');
    const bad2 = await j('PUT', '/media/portfolio', A.token, { avatar_url: '//evil.example/x.png' });
    assert.strictEqual(bad2.status, 400, 'a protocol-relative URL was accepted');
    const ok = await j('PUT', '/media/portfolio', A.token, { cover_url: '/uploads/abc.jpg', avatar_url: 'https://cdn.example.com/a.png' });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.d));
  });

  await check('an unknown email and a wrong password get the same answer', async () => {
    const a = await j('POST', '/auth/login', null, { email: `nobody-${RUN}@test.local`, password: 'whatever-123' });
    const b = await j('POST', '/auth/login', null, { email: `sweep-${RUN}@test.local`, password: 'wrong-password-1' });
    assert.strictEqual(a.status, 401); assert.strictEqual(b.status, 401);
    assert.deepStrictEqual(a.d, b.d);
  });

  await check('forgot-password sends at most 3 emails per account per 15 minutes', async () => {
    for (let i = 0; i < 6; i++) await j('POST', '/auth/forgot-password', null, { email: `sweep-${RUN}@test.local` });
    const db = openDb(false);
    const n = db.prepare('SELECT COUNT(*) n FROM password_resets WHERE user_id = ?').get(A.user.id).n;
    db.close();
    assert.strictEqual(n, 3, `${n} reset links were issued`);
  });

  // LAST: uses up this IP's account-request allowance.
  await check('forgot-password is rate limited per IP even though it always answers 200', async () => {
    let limited = false;
    for (let i = 0; i < 120 && !limited; i++) {
      const r = await j('POST', '/auth/forgot-password', null, { email: `x${i}-${RUN}@test.local` });
      if (r.status === 429) limited = true;
    }
    assert(limited, 'no 429 after 120 requests');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
