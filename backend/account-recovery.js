'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  account-recovery — the way back in.
//
//  Phase 9 (audit settings-team-6). There was no password reset of any kind.
//  The login page carried a literal `{/* placeholder for forgot-password */}`
//  comment where the link should be. A studio owner who forgot their password
//  was locked out of their own business permanently, with no self-serve route
//  and no admin route either — the only fix was someone editing the database.
//
//  DESIGN NOTES, because a reset flow is a security surface:
//
//  · The token is random, and only its HASH is stored. A read of the database
//    (a backup, a leaked file) must not hand anybody a working reset link.
//  · Single use and short-lived. Using it consumes it.
//  · The response NEVER says whether an email is registered. Otherwise this
//    endpoint becomes a free account-enumeration oracle for the whole platform.
//  · Resetting REVOKES existing sessions. JWTs here are signed without expiry,
//    so without this a stolen token would outlive the password change that was
//    meant to stop it. users.token_version is bumped and the auth middleware
//    refuses tokens issued before the bump.
//  · Mail goes through the PLATFORM's SMTP when configured, because being
//    locked out is a platform problem — falling back to the studio's own SMTP
//    only if the platform has none.
// ════════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');

const TOKEN_TTL_MIN = 60;

/** Only the hash is ever stored, so the table is useless to a reader. */
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

module.exports = function mountAccountRecovery(app, db, deps = {}) {
  const {
    bcrypt = require('bcryptjs'),
    nodemailer = require('nodemailer'),
    generateId = () => crypto.randomUUID(),
    limiter = (req, res, next) => next(),
    clientBaseUrl = process.env.FRONTEND_URL || '',
    logAudit = () => {},
  } = deps;

  db.exec(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      requested_ip TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
    CREATE INDEX IF NOT EXISTS idx_password_resets_hash ON password_resets(token_hash);
  `);
  // Session revocation. Defaults to 0 so every token already in the wild keeps
  // working — nobody is logged out by deploying this. The first reset bumps it.
  try { db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0'); } catch { /* exists */ }

  /**
   * Send through the platform's own SMTP if it has one, else the studio's.
   * Returns true when the message actually left.
   */
  async function sendResetMail(user, link) {
    const platform = process.env.SMTP_HOST ? {
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_SECURE || '') === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
    } : null;

    let cfg = platform;
    if (!cfg) {
      // Fall back to the workspace owner's own sending setup.
      try {
        const ownerId = db.prepare("SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role = 'super_admin' LIMIT 1")
          .get(user.workspace_id || user.id)?.user_id || user.id;
        const s = db.prepare('SELECT * FROM email_smtp_settings WHERE user_id = ?').get(ownerId);
        if (s?.smtp_host) {
          cfg = { host: s.smtp_host, port: s.smtp_port, secure: !!s.smtp_secure, auth: { user: s.smtp_user, pass: s.smtp_pass }, from: s.from_email || s.smtp_user };
        }
      } catch { /* no workspace SMTP either */ }
    }
    if (!cfg) {
      // Loudly, for the operator — the user still gets the neutral response.
      console.error('[account-recovery] no SMTP configured; cannot deliver a reset link to', user.email,
        '— set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM to fix this for every workspace.');
      return false;
    }

    const transporter = nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: cfg.auth });
    await transporter.sendMail({
      from: cfg.from || 'no-reply@wappflow.app',
      to: user.email,
      subject: 'Reset your WappFlow password',
      text: `Someone asked to reset the password for this account.\n\nOpen this link within ${TOKEN_TTL_MIN} minutes:\n${link}\n\nIf it wasn't you, ignore this email — nothing changes until the link is used.`,
      html: `<p>Someone asked to reset the password for this account.</p>
             <p><a href="${link}">Choose a new password</a></p>
             <p>The link works once and expires in ${TOKEN_TTL_MIN} minutes.</p>
             <p style="color:#666">If it wasn't you, ignore this email — nothing changes until the link is used.</p>`,
    });
    return true;
  }

  // ── Ask for a link ────────────────────────────────────────────────────────
  app.post('/api/auth/forgot-password', limiter, async (req, res) => {
    // ONE response, whatever happens. Any variation — a different message, a
    // different status, a measurably different delay — turns this into a way to
    // ask "does this person have an account?" about anybody on the platform.
    const neutral = { ok: true, message: 'If that email has an account, a reset link is on its way.' };
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!email) return res.json(neutral);

      const user = db.prepare('SELECT id, email, workspace_id FROM users WHERE lower(email) = ?').get(email);
      if (!user) return res.json(neutral);

      // Supersede any outstanding request: a second link should not leave the
      // first one alive.
      db.prepare("UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL").run(user.id);

      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + TOKEN_TTL_MIN * 60000).toISOString();
      db.prepare('INSERT INTO password_resets (id, user_id, token_hash, expires_at, requested_ip) VALUES (?,?,?,?,?)')
        .run(generateId(), user.id, hashToken(token), expires,
             (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim() || null);

      const link = `${String(clientBaseUrl).replace(/\/+$/, '')}/reset-password?token=${token}`;
      try { await sendResetMail(user, link); } catch (e) { console.error('[account-recovery] send failed:', e.message); }
      logAudit(user.workspace_id || user.id, user.id, 'password_reset_requested', 'user', user.id, {});
      return res.json(neutral);
    } catch (e) {
      console.error('[account-recovery] forgot-password:', e.message);
      return res.json(neutral);          // still neutral, even on our own failure
    }
  });

  // ── Is this link still good? (so the page can say so before asking for a password)
  app.get('/api/auth/reset-password/:token', (req, res) => {
    try {
      const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(hashToken(req.params.token));
      const ok = !!row && !row.used_at && new Date(row.expires_at) > new Date();
      res.json({ valid: ok });
    } catch { res.json({ valid: false }); }
  });

  // ── Use it ────────────────────────────────────────────────────────────────
  app.post('/api/auth/reset-password', limiter, async (req, res) => {
    try {
      const { token, password } = req.body || {};
      if (!token || !password) return res.status(400).json({ error: 'Missing token or password.' });
      if (String(password).length < 8) return res.status(400).json({ error: 'Use at least 8 characters.' });

      const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(hashToken(token));
      // One message for expired, used and never-existed: distinguishing them
      // tells an attacker which of their guesses was once real.
      if (!row || row.used_at || new Date(row.expires_at) <= new Date()) {
        return res.status(400).json({ error: 'That link has expired or already been used. Request a new one.' });
      }

      const user = db.prepare('SELECT id, email, workspace_id FROM users WHERE id = ?').get(row.user_id);
      if (!user) return res.status(400).json({ error: 'That link has expired or already been used. Request a new one.' });

      const hash = await bcrypt.hash(String(password), 10);
      db.transaction(() => {
        db.prepare('UPDATE users SET password = ?, token_version = COALESCE(token_version, 0) + 1 WHERE id = ?').run(hash, user.id);
        db.prepare('UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);
        // Any other outstanding link for this account dies with it.
        db.prepare('UPDATE password_resets SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL').run(user.id);
      })();

      logAudit(user.workspace_id || user.id, user.id, 'password_reset_completed', 'user', user.id, {});
      // Deliberately does NOT log them in: possession of a mailbox is enough to
      // choose a new password, and then they prove it by signing in with it.
      res.json({ ok: true, message: 'Password changed. Sign in with your new password.' });
    } catch (e) {
      console.error('[account-recovery] reset-password:', e.message);
      res.status(500).json({ error: 'Could not reset the password.' });
    }
  });

  console.log('🔑 Account recovery mounted (/api/auth/forgot-password, /api/auth/reset-password)');
  return { hashToken, TOKEN_TTL_MIN };
};
