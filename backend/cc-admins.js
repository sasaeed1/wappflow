'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  COMMAND CENTER — ADMINS & SECURITY (PROP-005 §E)
//
//  `manage_admins` was declared and checked nowhere; the only way to add an admin
//  was the server CLI. Now: list, invite (temporary password, 2FA set up at first
//  sign-in), change role, disable/enable, reset 2FA, end sessions. Every change
//  needs a step-up. Guard rail: the platform can never be left without an active
//  founder. Everyone (any role) can change their own password here.
// ════════════════════════════════════════════════════════════════════════════
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const ROLES = ['founder', 'ops', 'finance', 'support', 'cs', 'readonly'];

module.exports = function mountAdmins(app, deps) {
  const { db, platformAuth, requirePerm, requireElevated, ccAudit, safeAll } = deps;
  const cc = require('./command-center');

  const view = (a) => ({
    id: a.id, email: a.email, name: a.name, role: a.cc_role, status: a.status, mfa_enabled: !!a.mfa_enabled,
    last_login_at: a.last_login_at, created_at: a.created_at,
    permissions: cc.permsFor(a.cc_role, a.cc_permissions),
  });
  const activeFounders = (exceptId) => db.prepare("SELECT COUNT(*) AS c FROM cc_admins WHERE cc_role = 'founder' AND status = 'active' AND id <> ?").get(exceptId || '').c;
  const tempPassword = () => crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);

  app.get('/api/cc/admins', platformAuth, requirePerm('manage_admins'), (req, res) => {
    res.json({ admins: safeAll('SELECT * FROM cc_admins ORDER BY created_at').map(view), roles: ROLES, role_permissions: cc.CC_ROLE_PERMISSIONS });
  });

  app.post('/api/cc/admins', platformAuth, requirePerm('manage_admins'), requireElevated, (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const role = ROLES.includes(req.body?.role) ? req.body.role : 'readonly';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
      if (db.prepare('SELECT id FROM cc_admins WHERE email = ?').get(email)) return res.status(409).json({ error: 'That email is already an admin' });
      const password = tempPassword();
      const id = cc.createOrUpdateAdmin(db, { email, password, role, name: String(req.body?.name || '').trim() || null });
      ccAudit(req, { action: 'admin_create', target_type: 'admin', target_id: id, after: { email, role } });
      // The temporary password is returned once, to hand over in person / securely.
      res.json({ ok: true, id, temporary_password: password });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.patch('/api/cc/admins/:id', platformAuth, requirePerm('manage_admins'), requireElevated, (req, res) => {
    try {
      const a = db.prepare('SELECT * FROM cc_admins WHERE id = ?').get(req.params.id);
      if (!a) return res.status(404).json({ error: 'Admin not found' });
      const role = req.body?.role != null ? (ROLES.includes(req.body.role) ? req.body.role : null) : a.cc_role;
      const status = req.body?.status != null ? (['active', 'disabled'].includes(req.body.status) ? req.body.status : null) : a.status;
      if (!role || !status) return res.status(400).json({ error: 'Unknown role or status' });
      const losingFounder = a.cc_role === 'founder' && a.status === 'active' && (role !== 'founder' || status !== 'active');
      if (losingFounder && activeFounders(a.id) === 0) return res.status(400).json({ error: 'There must always be at least one active founder.' });
      db.prepare(`UPDATE cc_admins SET cc_role = ?, status = ?, name = COALESCE(?, name),
        token_version = CASE WHEN ? <> status OR ? <> cc_role THEN COALESCE(token_version,0) + 1 ELSE token_version END WHERE id = ?`)
        .run(role, status, req.body?.name ?? null, status, role, a.id);
      ccAudit(req, { action: 'admin_update', target_type: 'admin', target_id: a.id, before: { role: a.cc_role, status: a.status }, after: { role, status } });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Lost phone: turn 2FA off so they set it up again at next sign-in. Ends their sessions.
  app.post('/api/cc/admins/:id/reset-2fa', platformAuth, requirePerm('manage_admins'), requireElevated, (req, res) => {
    try {
      const a = db.prepare('SELECT id, email FROM cc_admins WHERE id = ?').get(req.params.id);
      if (!a) return res.status(404).json({ error: 'Admin not found' });
      db.prepare('UPDATE cc_admins SET mfa_enabled = 0, mfa_secret = NULL, mfa_recovery = NULL, token_version = COALESCE(token_version,0) + 1 WHERE id = ?').run(a.id);
      ccAudit(req, { action: 'admin_mfa_reset', target_type: 'admin', target_id: a.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/cc/admins/:id/reset-password', platformAuth, requirePerm('manage_admins'), requireElevated, (req, res) => {
    try {
      const a = db.prepare('SELECT id FROM cc_admins WHERE id = ?').get(req.params.id);
      if (!a) return res.status(404).json({ error: 'Admin not found' });
      const password = tempPassword();
      db.prepare('UPDATE cc_admins SET password_hash = ?, token_version = COALESCE(token_version,0) + 1 WHERE id = ?').run(bcrypt.hashSync(password, 10), a.id);
      ccAudit(req, { action: 'admin_password_reset', target_type: 'admin', target_id: a.id });
      res.json({ ok: true, temporary_password: password });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/cc/admins/:id/sign-out', platformAuth, requirePerm('manage_admins'), (req, res) => {
    try {
      db.prepare('UPDATE cc_admins SET token_version = COALESCE(token_version,0) + 1 WHERE id = ?').run(req.params.id);
      ccAudit(req, { action: 'admin_sessions_revoked', target_type: 'admin', target_id: req.params.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Any admin: change your own password (current password required; ends other sessions).
  app.post('/api/cc/me/password', platformAuth, (req, res) => {
    try {
      const { current, next } = req.body || {};
      if (!bcrypt.compareSync(String(current || ''), req.admin.password_hash)) return res.status(401).json({ error: 'Your current password is wrong' });
      if (String(next || '').length < 12) return res.status(400).json({ error: 'Use at least 12 characters' });
      db.prepare('UPDATE cc_admins SET password_hash = ?, token_version = COALESCE(token_version,0) + 1 WHERE id = ?').run(bcrypt.hashSync(String(next), 10), req.admin.id);
      ccAudit(req, { action: 'admin_password_change', target_type: 'admin', target_id: req.admin.id });
      res.json({ ok: true, signed_out: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Recent security events for the signed-in admin's own account.
  app.get('/api/cc/me/activity', platformAuth, (req, res) => {
    res.json({ activity: safeAll(`SELECT action, ip, ua, created_at FROM cc_audit WHERE admin_id = ? AND action LIKE 'admin_%' ORDER BY created_at DESC LIMIT 30`, req.admin.id) });
  });

  return {};
};
