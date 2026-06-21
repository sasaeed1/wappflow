'use strict';

// ════════════════════════════════════════════════════════════════════════════
//  COMMAND CENTER — DESKTOP MANAGEMENT  (Final Vision · Phase 7)
//  Fleet visibility + version governance for WappFlow Desktop.
//   • Desktop-facing (workspace auth): POST /api/desktop/report (self-register
//     version/machine/last-sync), GET /api/desktop/update-policy (must-update /
//     blocked / ok).
//   • Admin-facing (platform auth): GET /api/cc/desktop/fleet (installed versions,
//     machine count, last sync), POST /api/cc/desktop/policy (force-update via
//     min_version, block specific versions, advertise latest_version).
//  Additive; own tables (cc_desktops, cc_desktop_policy). Mounted by command-center.js.
// ════════════════════════════════════════════════════════════════════════════

module.exports = function mountCcDesktop(app, deps = {}) {
  const {
    db,
    auth = (req, res, next) => next(),
    platformAuth = (req, res, next) => next(),
    requirePerm = () => (req, res, next) => next(),
    ccAudit = () => {},
    emit = () => {},
  } = deps;

  db.exec(`
    CREATE TABLE IF NOT EXISTS cc_desktops (
      device_id TEXT PRIMARY KEY, workspace_id TEXT, user_id TEXT, version TEXT,
      platform TEXT, last_sync TIMESTAMP, last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cc_desktop_policy (
      id INTEGER PRIMARY KEY CHECK (id = 1), latest_version TEXT, min_version TEXT,
      blocked_versions TEXT DEFAULT '[]', updated_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cc_desktops_ws ON cc_desktops(workspace_id);
  `);
  try { db.prepare("INSERT OR IGNORE INTO cc_desktop_policy (id, blocked_versions) VALUES (1, '[]')").run(); } catch {}

  // dotted-version compare → -1 / 0 / 1
  function cmpVer(a, b) {
    const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0 ? -1 : 1; }
    return 0;
  }

  // ── Desktop-facing (workspace auth) ─────────────────────────────────────────
  app.post('/api/desktop/report', auth, (req, res) => {
    try {
      const { device_id, version, platform, last_sync } = req.body || {};
      if (!device_id) return res.status(400).json({ error: 'device_id required' });
      db.prepare(`INSERT INTO cc_desktops (device_id, workspace_id, user_id, version, platform, last_sync, last_seen)
        VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(device_id) DO UPDATE SET
          workspace_id = excluded.workspace_id, user_id = excluded.user_id, version = excluded.version,
          platform = excluded.platform, last_sync = COALESCE(excluded.last_sync, cc_desktops.last_sync),
          last_seen = CURRENT_TIMESTAMP`)
        .run(device_id, req.workspaceId, req.userId, version || null, platform || null, last_sync || null);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/desktop/update-policy', auth, (req, res) => {
    try {
      const v = (req.query.version || '').toString();
      const p = db.prepare('SELECT * FROM cc_desktop_policy WHERE id = 1').get() || {};
      let blocked = []; try { blocked = JSON.parse(p.blocked_versions || '[]'); } catch {}
      let action = 'ok';
      if (v && blocked.includes(v)) action = 'block';                       // hard kill this build
      else if (p.min_version && v && cmpVer(v, p.min_version) < 0) action = 'update'; // below the floor → must update
      res.json({ action, latest_version: p.latest_version || null, min_version: p.min_version || null });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin-facing (platform auth) ────────────────────────────────────────────
  app.get('/api/cc/desktop/fleet', platformAuth, (req, res) => {
    try {
      const devices = db.prepare('SELECT * FROM cc_desktops ORDER BY last_seen DESC LIMIT 500').all();
      const byVersion = db.prepare("SELECT COALESCE(version,'unknown') AS version, COUNT(*) AS n FROM cc_desktops GROUP BY version ORDER BY n DESC").all();
      const policy = db.prepare('SELECT * FROM cc_desktop_policy WHERE id = 1').get();
      const stale = db.prepare("SELECT COUNT(*) AS c FROM cc_desktops WHERE last_seen < datetime('now','-7 days')").get().c;
      res.json({ machine_count: devices.length, by_version: byVersion, stale_7d: stale, policy, devices });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/cc/desktop/policy', platformAuth, requirePerm('manage_flags'), (req, res) => {
    try {
      const { latest_version, min_version, blocked_versions } = req.body || {};
      db.prepare('UPDATE cc_desktop_policy SET latest_version = ?, min_version = ?, blocked_versions = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1')
        .run(latest_version || null, min_version || null, JSON.stringify(Array.isArray(blocked_versions) ? blocked_versions : []));
      const policy = db.prepare('SELECT * FROM cc_desktop_policy WHERE id = 1').get();
      try { ccAudit(req, { action: 'desktop_policy_update', target_type: 'desktop', target_id: 'policy', after: policy }); } catch {}
      try { emit({ actor_id: req.admin && req.admin.id, type: 'desktop_policy_update', entity_type: 'desktop', entity_id: 'policy', payload: policy }); } catch {}
      res.json({ ok: true, policy });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('🖥️  Command Center Desktop Management mounted (/api/desktop/*, /api/cc/desktop/*)');
  return { cmpVer };
};
