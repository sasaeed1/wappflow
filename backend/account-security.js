'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Account security for customer users (PROP-006): two-step sign-in with an
//  authenticator app, recovery codes, an owner switch that requires it for the
//  whole team, and email verification.
//
//  Reuses cc-security.js (RFC 6238 TOTP, AES-256-GCM sealing, hashed recovery
//  codes) — the same primitives Command Center admins already sign in with.
//
//  Sign-in becomes two steps only for people who need it:
//    password (or Google) ok → gate(user, res)
//      • 2FA on                → { mfa_required, mfa_token }
//      • team requires, not on → { mfa_setup_required, mfa_token }
//      • otherwise             → the normal session response, unchanged
//  The mfa_token is a 5-minute JWT with its own audience: it can do nothing but
//  finish this sign-in.
//
//  Email verification never blocks anyone (mail may not be configured on the
//  server); it records the address works and the app nudges until it does.
// ════════════════════════════════════════════════════════════════════════════
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const sec = require('./cc-security');

module.exports = function mountAccountSecurity(app, db, deps) {
  const { auth, signSession, JWT_SECRET, logAudit = () => {}, sendPlatformMail, frontendUrl = () => '', loginLimiter } = deps;
  const limit = loginLimiter || ((req, res, next) => next());

  const addCol = (table, def) => { try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`); } catch {} };
  addCol('users', 'mfa_enabled INTEGER DEFAULT 0');
  addCol('users', 'mfa_secret TEXT');
  addCol('users', 'mfa_recovery TEXT');
  addCol('users', 'email_verified_at TEXT');
  addCol('users', 'email_verify_token TEXT');
  addCol('workspaces', 'require_2fa INTEGER DEFAULT 0');
  // Everyone who existed before verification shipped is treated as verified once —
  // nagging every current customer about an address they have used for months
  // would be noise, not security.
  try {
    const flag = db.prepare("SELECT value FROM cc_config WHERE namespace = 'migrations' AND key = 'email_verified_backfill'").get();
    if (!flag) {
      db.prepare("UPDATE users SET email_verified_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE email_verified_at IS NULL").run();
      db.prepare("INSERT INTO cc_config (namespace, key, value) VALUES ('migrations', 'email_verified_backfill', '1')").run();
    }
  } catch {
    // cc_config may not exist on a bare install; a missing flag just means the
    // backfill runs again on the next boot, which is harmless (only NULLs change).
    try { db.prepare("UPDATE users SET email_verified_at = COALESCE(created_at, CURRENT_TIMESTAMP) WHERE email_verified_at IS NULL AND created_at < datetime('now', '-1 day')").run(); } catch {}
  }

  const MFA_AUD = 'wf-mfa';
  const mfaToken = (userId) => jwt.sign({ userId, aud: MFA_AUD }, JWT_SECRET, { expiresIn: '5m' });
  const readMfaToken = (t) => { const d = jwt.verify(String(t || ''), JWT_SECRET, { audience: MFA_AUD }); return d.userId; };

  const teamRequires = (user) => {
    try { return !!db.prepare('SELECT require_2fa FROM workspaces WHERE id = ?').get(user.workspace_id)?.require_2fa; } catch { return false; }
  };

  // The session response every sign-in path returns (same shape as before).
  function sessionPayload(user) {
    const workspace = db.prepare('SELECT id, name FROM workspaces WHERE id = ?').get(user.workspace_id);
    const memberRow = db.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?').get(user.workspace_id || user.id, user.id);
    return {
      token: signSession(user.id),
      user: { id: user.id, email: user.email, business_name: user.business_name, full_name: user.full_name, role: memberRow?.role || 'super_admin', workspace_id: user.workspace_id, profile_picture: user.profile_picture },
      workspace,
    };
  }

  /** Called by every sign-in path after the first factor succeeds. Returns true if it answered. */
  function gate(user, res) {
    if (user.mfa_enabled) { res.json({ mfa_required: true, mfa_token: mfaToken(user.id) }); return true; }
    if (teamRequires(user)) { res.json({ mfa_setup_required: true, mfa_token: mfaToken(user.id) }); return true; }
    return false;
  }

  function checkSecondFactor(user, code) {
    const c = String(code || '').trim();
    if (/^\d{6}$/.test(c.replace(/\s+/g, ''))) {
      const secret = sec.unseal(user.mfa_secret, JWT_SECRET);
      return !!secret && sec.verifyTotp(secret, c);
    }
    const rest = sec.consumeRecoveryCode(user.mfa_recovery, c);
    if (rest) { db.prepare('UPDATE users SET mfa_recovery = ? WHERE id = ?').run(JSON.stringify(rest), user.id); return 'recovery'; }
    return false;
  }

  async function qrFor(uri) { try { return await require('qrcode').toDataURL(uri, { margin: 1, width: 240 }); } catch { return null; } }

  // ── Sign-in, step 2 ─────────────────────────────────────────────────────────
  app.post('/api/auth/login/mfa', limit, (req, res) => {
    let userId; try { userId = readMfaToken(req.body?.mfa_token); } catch { return res.status(401).json({ error: 'Your sign-in expired. Enter your password again.' }); }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user || !user.mfa_enabled) return res.status(400).json({ error: 'Two-step sign-in is not on for this account.' });
    const okCode = checkSecondFactor(user, req.body?.code);
    if (!okCode) return res.status(401).json({ error: 'That code didn’t work. Use the 6-digit code from your app, or a recovery code.' });
    if (okCode === 'recovery') logAudit(user.workspace_id, user.id, 'mfa_recovery_code_used', 'user', user.id, {});
    res.json(sessionPayload(user));
  });

  // Required by the team but not set up yet: enrol during sign-in.
  app.post('/api/auth/mfa/setup', limit, async (req, res) => {
    let userId; try { userId = readMfaToken(req.body?.mfa_token); } catch { return res.status(401).json({ error: 'Your sign-in expired. Enter your password again.' }); }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'Account not found' });
    if (user.mfa_enabled) return res.status(400).json({ error: 'Two-step sign-in is already on.' });
    const secret = sec.newTotpSecret();
    db.prepare('UPDATE users SET mfa_secret = ? WHERE id = ?').run(sec.seal(secret, JWT_SECRET), user.id);
    const uri = sec.otpauthUri(secret, user.email, 'WappFlow');
    res.json({ secret, uri, qr: await qrFor(uri) });
  });
  app.post('/api/auth/mfa/enable', limit, (req, res) => {
    let userId; try { userId = readMfaToken(req.body?.mfa_token); } catch { return res.status(401).json({ error: 'Your sign-in expired. Enter your password again.' }); }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const secret = user && sec.unseal(user.mfa_secret, JWT_SECRET);
    if (!secret || !sec.verifyTotp(secret, req.body?.code)) return res.status(401).json({ error: 'That code didn’t work. Check the time on your phone and try the newest code.' });
    const rc = sec.newRecoveryCodes();
    db.prepare('UPDATE users SET mfa_enabled = 1, mfa_recovery = ? WHERE id = ?').run(JSON.stringify(rc.hashes), user.id);
    logAudit(user.workspace_id, user.id, 'mfa_enabled', 'user', user.id, { during: 'sign-in' });
    res.json({ ...sessionPayload(user), recovery_codes: rc.codes });
  });

  // ── Managing it from Settings ───────────────────────────────────────────────
  app.get('/api/account/security', auth, (req, res) => {
    const u = db.prepare('SELECT email, mfa_enabled, mfa_recovery, email_verified_at FROM users WHERE id = ?').get(req.userId);
    let left = 0; try { left = JSON.parse(u?.mfa_recovery || '[]').length; } catch {}
    res.json({
      email: u?.email, mfa_enabled: !!u?.mfa_enabled, recovery_codes_left: left,
      email_verified: !!u?.email_verified_at, team_requires_2fa: teamRequires({ workspace_id: req.workspaceId }),
      can_set_team_policy: req.userRole === 'super_admin',
      mail_configured: !!process.env.SMTP_HOST,
    });
  });
  app.post('/api/account/mfa/setup', auth, async (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (user.mfa_enabled) return res.status(400).json({ error: 'Two-step sign-in is already on.' });
    const secret = sec.newTotpSecret();
    db.prepare('UPDATE users SET mfa_secret = ? WHERE id = ?').run(sec.seal(secret, JWT_SECRET), user.id);
    const uri = sec.otpauthUri(secret, user.email, 'WappFlow');
    res.json({ secret, uri, qr: await qrFor(uri) });
  });
  app.post('/api/account/mfa/enable', auth, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    const secret = sec.unseal(user.mfa_secret, JWT_SECRET);
    if (!secret || !sec.verifyTotp(secret, req.body?.code)) return res.status(401).json({ error: 'That code didn’t work. Try the newest code from your app.' });
    const rc = sec.newRecoveryCodes();
    db.prepare('UPDATE users SET mfa_enabled = 1, mfa_recovery = ? WHERE id = ?').run(JSON.stringify(rc.hashes), user.id);
    logAudit(req.workspaceId, req.userId, 'mfa_enabled', 'user', req.userId, {});
    res.json({ ok: true, recovery_codes: rc.codes });
  });
  app.post('/api/account/mfa/disable', auth, async (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!user.mfa_enabled) return res.json({ ok: true });
    if (teamRequires({ workspace_id: req.workspaceId })) return res.status(400).json({ error: 'Your workspace requires two-step sign-in, so it can’t be turned off.' });
    const pwOk = await require('bcryptjs').compare(String(req.body?.password || ''), user.password || '');
    if (!pwOk || !checkSecondFactor(user, req.body?.code)) return res.status(401).json({ error: 'Enter your password and a current code to turn this off.' });
    db.prepare('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL, mfa_recovery = NULL WHERE id = ?').run(user.id);
    logAudit(req.workspaceId, req.userId, 'mfa_disabled', 'user', req.userId, {});
    res.json({ ok: true });
  });
  app.post('/api/account/mfa/recovery-codes', auth, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!user.mfa_enabled) return res.status(400).json({ error: 'Turn on two-step sign-in first.' });
    const secret = sec.unseal(user.mfa_secret, JWT_SECRET);
    if (!secret || !sec.verifyTotp(secret, req.body?.code)) return res.status(401).json({ error: 'Enter a current code from your app.' });
    const rc = sec.newRecoveryCodes();
    db.prepare('UPDATE users SET mfa_recovery = ? WHERE id = ?').run(JSON.stringify(rc.hashes), user.id);
    logAudit(req.workspaceId, req.userId, 'mfa_recovery_codes_regenerated', 'user', req.userId, {});
    res.json({ recovery_codes: rc.codes });
  });

  // Owner: require it for everyone in the workspace. The owner must be using it
  // first, so nobody can lock a team into something they haven't tried.
  app.put('/api/workspace/security', auth, (req, res) => {
    if (req.userRole !== 'super_admin') return res.status(403).json({ error: 'Only the workspace owner can change this.', permission_denied: 'manage_team' });
    const on = !!req.body?.require_2fa;
    if (on && !db.prepare('SELECT mfa_enabled FROM users WHERE id = ?').get(req.userId)?.mfa_enabled) {
      return res.status(400).json({ error: 'Turn on two-step sign-in for your own account first.' });
    }
    db.prepare('UPDATE workspaces SET require_2fa = ? WHERE id = ?').run(on ? 1 : 0, req.workspaceId);
    logAudit(req.workspaceId, req.userId, on ? 'workspace_require_2fa_on' : 'workspace_require_2fa_off', 'workspace', req.workspaceId, {});
    res.json({ ok: true, require_2fa: on });
  });

  // ── Email verification ──────────────────────────────────────────────────────
  async function sendVerification(user) {
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('UPDATE users SET email_verify_token = ? WHERE id = ?').run(token, user.id);
    const link = `${String(frontendUrl() || '').replace(/\/+$/, '')}/verify-email?token=${token}`;
    if (!sendPlatformMail) return { skipped: true };
    try {
      return await sendPlatformMail({
        to: user.email,
        subject: 'Confirm your email for WappFlow',
        text: `Confirm this is your email address so we can reach you about your account:\n\n${link}\n\nIf you didn't create a WappFlow account, ignore this email.`,
        html: `<p>Confirm this is your email address so we can reach you about your account.</p><p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none">Confirm email</a></p><p style="color:#666;font-size:13px">If you didn't create a WappFlow account, ignore this email.</p>`,
      });
    } catch (e) { return { error: e.message }; }
  }
  const resendAt = new Map();
  app.post('/api/account/verify-email/send', auth, async (req, res) => {
    const user = db.prepare('SELECT id, email, email_verified_at FROM users WHERE id = ?').get(req.userId);
    if (user.email_verified_at) return res.json({ ok: true, already: true });
    const last = resendAt.get(user.id) || 0;
    if (Date.now() - last < 60 * 1000) return res.status(429).json({ error: 'We just sent one. Check your inbox, or try again in a minute.' });
    resendAt.set(user.id, Date.now());
    const r = await sendVerification(user);
    if (r.skipped) return res.status(503).json({ error: 'Email isn’t set up on this server yet, so we can’t send the link.' });
    if (r.error) return res.status(502).json({ error: 'We couldn’t send the email. Try again later.' });
    res.json({ ok: true });
  });
  app.post('/api/auth/verify-email', limit, (req, res) => {
    const token = String(req.body?.token || '');
    if (!/^[a-f0-9]{48}$/.test(token)) return res.status(400).json({ error: 'This link is not valid.' });
    const user = db.prepare('SELECT id, workspace_id FROM users WHERE email_verify_token = ?').get(token);
    if (!user) return res.status(400).json({ error: 'This link has already been used or is no longer valid.' });
    db.prepare('UPDATE users SET email_verified_at = CURRENT_TIMESTAMP, email_verify_token = NULL WHERE id = ?').run(user.id);
    logAudit(user.workspace_id, user.id, 'email_verified', 'user', user.id, {});
    res.json({ ok: true });
  });

  return { gate, sendVerification, markVerified: (userId) => { try { db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE id = ?').run(userId); } catch {} } };
};
