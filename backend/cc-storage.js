'use strict';

// ════════════════════════════════════════════════════════════════════════════
//  COMMAND CENTER — STORAGE DASHBOARD  (Final Vision · Phase 10)
//  Founder + per-workspace storage analytics from the per-asset storage_size /
//  storage_provider tracking. Mounted by command-center.js (platform auth).
//   • GET /api/cc/storage/overview     — global: total, by-provider, R2 GB, est. cost, growth
//   • GET /api/cc/storage/workspaces   — top-20 largest workspaces
//   • GET /api/cc/storage/workspace/:id— per-workspace: used vs limit, %, growth, largest
// ════════════════════════════════════════════════════════════════════════════

const GB = 1024 ** 3;
const R2_RATE = 0.015;   // USD / GB-month (Cloudflare R2 storage; egress is free)
const FREE_GB = 10;      // R2 free tier

module.exports = function mountCcStorage(app, deps = {}) {
  const { db, platformAuth = (req, res, next) => next(), safeAll = (sql, ...a) => { try { return db.prepare(sql).all(...a); } catch { return []; } }, entitlements } = deps;
  const one = (sql, ...a) => { try { return db.prepare(sql).get(...a) || {}; } catch { return {}; } };

  // ── Founder: global storage overview ────────────────────────────────────────
  app.get('/api/cc/storage/overview', platformAuth, (req, res) => {
    try {
      const byProvider = safeAll("SELECT COALESCE(storage_provider,'local') AS provider, COUNT(*) AS files, COALESCE(SUM(storage_size),0) AS bytes FROM ms_assets WHERE deleted_at IS NULL GROUP BY provider");
      const total = byProvider.reduce((s, r) => s + r.bytes, 0);
      const r2Bytes = (byProvider.find(p => p.provider === 'r2') || {}).bytes || 0;
      const r2GB = r2Bytes / GB;
      const estCost = Math.max(0, r2GB - FREE_GB) * R2_RATE;
      const growth = one("SELECT COALESCE(SUM(storage_size),0) AS bytes FROM ms_assets WHERE uploaded_at >= datetime('now','-30 days')").bytes || 0;
      // Linear forecast from the trailing-30d rate. New uploads land on the active
      // provider, so project R2 GB (and therefore cost) forward by the same growth.
      const growthRateGbPerDay = (growth / GB) / 30;
      const projected30dBytes = total + growth;
      const projectedR2Gb = r2GB + (growth / GB);
      const projectedCost = Math.max(0, projectedR2Gb - FREE_GB) * R2_RATE;
      res.json({
        total_bytes: total, by_provider: byProvider,
        r2_bytes: r2Bytes, r2_gb: +r2GB.toFixed(2),
        est_monthly_cost_usd: +estCost.toFixed(2), free_gb: FREE_GB, rate_per_gb_usd: R2_RATE,
        growth_30d_bytes: growth,
        growth_rate_gb_per_day: +growthRateGbPerDay.toFixed(3),
        projected_30d_bytes: projected30dBytes,
        projected_r2_gb: +projectedR2Gb.toFixed(2),
        projected_monthly_cost_usd: +projectedCost.toFixed(2),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Founder: top-20 largest workspaces ──────────────────────────────────────
  app.get('/api/cc/storage/workspaces', platformAuth, (req, res) => {
    try {
      const rows = safeAll("SELECT workspace_id, COUNT(*) AS files, COALESCE(SUM(storage_size),0) AS bytes FROM ms_assets WHERE deleted_at IS NULL GROUP BY workspace_id ORDER BY bytes DESC LIMIT 20");
      res.json({ workspaces: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Founder: storage by plan tier (where the bytes — and the bill — concentrate) ──
  app.get('/api/cc/storage/by-plan', platformAuth, (req, res) => {
    try {
      const rows = safeAll(`SELECT COALESCE(wp.plan,'creator') AS plan,
          COUNT(DISTINCT a.workspace_id) AS workspaces,
          COUNT(a.id) AS files,
          COALESCE(SUM(a.storage_size),0) AS bytes
        FROM ms_assets a LEFT JOIN workspace_plan wp ON wp.workspace_id = a.workspace_id
        WHERE a.deleted_at IS NULL GROUP BY plan ORDER BY bytes DESC`);
      res.json({ by_plan: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Founder: fastest-growing workspaces (trailing 30 days) ──────────────────
  app.get('/api/cc/storage/fastest-growing', platformAuth, (req, res) => {
    try {
      const rows = safeAll("SELECT workspace_id, COUNT(*) AS files, COALESCE(SUM(storage_size),0) AS growth_bytes FROM ms_assets WHERE deleted_at IS NULL AND uploaded_at >= datetime('now','-30 days') GROUP BY workspace_id ORDER BY growth_bytes DESC LIMIT 20");
      res.json({ workspaces: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Per-workspace drilldown (used vs plan limit, growth, largest projects/videos) ──
  app.get('/api/cc/storage/workspace/:id', platformAuth, (req, res) => {
    try {
      const ws = req.params.id;
      const total = one("SELECT COALESCE(SUM(storage_size),0) AS bytes, COUNT(*) AS files FROM ms_assets WHERE workspace_id = ? AND deleted_at IS NULL", ws);
      let limitGb = null;
      try { const ent = entitlements && entitlements.getEntitlements(db, ws); limitGb = ent && ent.limits ? ent.limits.storage_gb : null; } catch {}
      const limitBytes = (limitGb && limitGb > 0) ? limitGb * GB : null;
      const pct = limitBytes ? Math.round((total.bytes / limitBytes) * 100) : null;
      const growth = one("SELECT COALESCE(SUM(storage_size),0) AS bytes FROM ms_assets WHERE workspace_id = ? AND uploaded_at >= datetime('now','-30 days')", ws).bytes || 0;
      const largestProjects = safeAll("SELECT p.id, p.title, COALESCE(SUM(a.storage_size),0) AS bytes, COUNT(a.id) AS files FROM ms_projects p LEFT JOIN ms_assets a ON a.project_id = p.id AND a.deleted_at IS NULL WHERE p.workspace_id = ? GROUP BY p.id ORDER BY bytes DESC LIMIT 10", ws);
      const largestGalleries = safeAll("SELECT g.id, g.title, COALESCE(SUM(a.storage_size),0) AS bytes FROM ms_galleries g LEFT JOIN ms_gallery_assets ga ON ga.gallery_id = g.id LEFT JOIN ms_assets a ON a.id = ga.asset_id AND a.deleted_at IS NULL WHERE g.workspace_id = ? GROUP BY g.id ORDER BY bytes DESC LIMIT 10", ws);
      const largestVideos = safeAll("SELECT id, filename, COALESCE(storage_size,0) AS bytes FROM ms_assets WHERE workspace_id = ? AND type = 'video' AND deleted_at IS NULL ORDER BY bytes DESC LIMIT 10", ws);
      res.json({
        workspace_id: ws, used_bytes: total.bytes, files: total.files,
        limit_gb: limitGb, limit_bytes: limitBytes, pct_used: pct, growth_30d_bytes: growth,
        largest_projects: largestProjects, largest_galleries: largestGalleries, largest_videos: largestVideos,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('🗄️  Command Center Storage Dashboard mounted (/api/cc/storage/*)');
  return {};
};
