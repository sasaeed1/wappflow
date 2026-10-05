'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  COMMAND CENTER — SYSTEM HEALTH (PROP-005 §E; spec §20, previously unbuilt)
//
//  One read-only snapshot of the box WappFlow runs on: load, memory, disk, uptime,
//  database + WAL size, the newest backup, the last run of every scheduled job,
//  and connected WhatsApp numbers. Thresholds turn each line green/amber/red.
//
//  Scheduled jobs report in through recordJob(name, result) — stored in cc_config
//  (namespace 'jobs') so the page can show "last ran 3h ago · ok".
// ════════════════════════════════════════════════════════════════════════════
const os = require('os');
const fs = require('fs');
const path = require('path');

function recordJob(db, name, result = {}) {
  try {
    db.prepare(`INSERT OR REPLACE INTO cc_config (namespace, key, value, updated_by, updated_at) VALUES ('jobs', ?, ?, 'system', CURRENT_TIMESTAMP)`)
      .run(name, JSON.stringify({ at: new Date().toISOString(), ok: result.ok !== false, ...result }));
  } catch {}
}

// Wrap a job so every run is recorded (success or failure) without changing it.
function tracked(db, name, fn) {
  return (...args) => {
    const t0 = Date.now();
    try {
      const out = fn(...args);
      recordJob(db, name, { ok: true, ms: Date.now() - t0, summary: typeof out === 'object' ? out : { result: out } });
      return out;
    } catch (e) {
      recordJob(db, name, { ok: false, ms: Date.now() - t0, error: e.message });
      throw e;
    }
  };
}

module.exports = function mountSystem(app, deps) {
  const { db, platformAuth, safeAll } = deps;
  const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/data' : __dirname);
  const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
  const EXPECTED_JOBS = {
    usage_rollup: 'Usage rollup + health scores (nightly 02:00 UTC)',
    reports: 'Scheduled reports (daily 03:00 UTC)',
    grace_sweep: 'Grace-period expiry (daily 03:05 UTC)',
    billing_daily: 'Billing renewals + overdue check (daily 04:00 UTC)',
    backup_watch: 'Backup freshness check (hourly)',
  };

  const sizeOf = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };
  function newestBackup() {
    try {
      let best = null;
      const walk = (dir, depth) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory() && depth < 2) walk(p, depth + 1);
          else if (e.isFile()) { const st = fs.statSync(p); if (!best || st.mtimeMs > best.mtime) best = { file: path.relative(BACKUP_DIR, p), mtime: st.mtimeMs, size: st.size }; }
        }
      };
      walk(BACKUP_DIR, 0);
      return best ? { file: best.file, at: new Date(best.mtime).toISOString(), size: best.size, age_hours: +((Date.now() - best.mtime) / 3600000).toFixed(1) } : null;
    } catch { return null; }
  }
  function disk() {
    try {
      const s = fs.statfsSync(DATA_DIR);
      const total = s.blocks * s.bsize, free = s.bavail * s.bsize;
      return { total, free, used: total - free, pct: total ? Math.round(((total - free) / total) * 100) : 0 };
    } catch { return null; }
  }
  const level = (v, warn, crit) => (v == null ? 'unknown' : v >= crit ? 'critical' : v >= warn ? 'warn' : 'ok');

  app.get('/api/cc/system', platformAuth, (req, res) => {
    try {
      const cpus = os.cpus().length || 1;
      const load = os.loadavg();
      const mem = { total: os.totalmem(), free: os.freemem() };
      mem.used = mem.total - mem.free; mem.pct = Math.round((mem.used / mem.total) * 100);
      const d = disk();
      const dbPath = db.name;
      const database = { path: path.basename(dbPath), size: sizeOf(dbPath), wal: sizeOf(dbPath + '-wal') };
      const backup = newestBackup();
      const jobsRaw = Object.fromEntries(safeAll("SELECT key, value FROM cc_config WHERE namespace = 'jobs'").map((r) => { try { return [r.key, JSON.parse(r.value)]; } catch { return [r.key, null]; } }));
      const jobs = Object.entries(EXPECTED_JOBS).map(([key, label]) => {
        const j = jobsRaw[key];
        const ageH = j?.at ? (Date.now() - new Date(j.at).getTime()) / 3600000 : null;
        return { key, label, last_run: j?.at || null, ok: j ? j.ok : null, error: j?.error || null, ms: j?.ms ?? null,
          level: !j ? 'unknown' : !j.ok ? 'critical' : ageH > 26 ? 'warn' : 'ok' };
      });
      const wa = (() => { try {
        return db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status IN ('connected','ready','active') THEN 1 ELSE 0 END) AS connected FROM platform_accounts WHERE platform = 'whatsapp'").get();
      } catch { return null; } })();
      const proc = process.memoryUsage();

      const checks = [
        { key: 'cpu', label: 'CPU load (1 min)', value: `${load[0].toFixed(2)} on ${cpus} core${cpus > 1 ? 's' : ''}`, level: level(load[0] / cpus, 0.8, 1.5) },
        { key: 'memory', label: 'Memory', value: `${mem.pct}% used`, level: level(mem.pct, 85, 95) },
        d ? { key: 'disk', label: 'Disk (data volume)', value: `${d.pct}% used`, level: level(d.pct, 80, 92) } : { key: 'disk', label: 'Disk', value: 'unavailable', level: 'unknown' },
        { key: 'backup', label: 'Newest backup', value: backup ? `${backup.age_hours} h ago` : 'none found', level: !backup ? 'critical' : level(backup.age_hours, 30, 72) },
        { key: 'wal', label: 'Database write-ahead log', value: `${Math.round(database.wal / 1048576)} MB`, level: level(database.wal / 1048576, 256, 1024) },
      ];
      const overall = checks.concat(jobs).some((c) => c.level === 'critical') ? 'critical'
        : checks.concat(jobs).some((c) => c.level === 'warn') ? 'warn' : 'ok';

      res.json({
        overall, checks,
        host: { hostname: os.hostname(), platform: `${os.type()} ${os.release()}`, node: process.version, uptime_s: Math.round(os.uptime()), cpus, load },
        process: { uptime_s: Math.round(process.uptime()), rss: proc.rss, heap_used: proc.heapUsed, pid: process.pid },
        memory: mem, disk: d, database, backup, backup_dir_configured: !!process.env.BACKUP_DIR, jobs,
        whatsapp: wa ? { total: wa.total || 0, connected: wa.connected || 0 } : null,
        generated_at: new Date().toISOString(),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Backup watchdog (PROP-006). A backup job that silently stopped is only found
  // on the day you need a restore. Every hour: if the newest backup is older than
  // 36 hours (or there is none), raise ONE open Founder Inbox item; close it again
  // once a fresh backup appears.
  function checkBackups() {
    const b = newestBackup();
    const stale = !b || b.age_hours > 36;
    const open = db.prepare("SELECT id FROM cc_inbox WHERE kind = 'backup_stale' AND status = 'open'").get();
    if (stale && !open) {
      db.prepare('INSERT INTO cc_inbox (id, kind, workspace_id, severity, title, body, link) VALUES (?,?,?,?,?,?,?)').run(
        'bk-' + Date.now().toString(36), 'backup_stale', null, 'high',
        b ? `No backup for ${Math.round(b.age_hours)} hours` : 'No backups found on the server',
        `Expected a nightly backup in ${BACKUP_DIR}. Check the cron job (/etc/cron.daily/wappflow-backup) and run: node backup.js`,
        '/control/system');
    } else if (!stale && open) {
      db.prepare("UPDATE cc_inbox SET status = 'dismissed' WHERE kind = 'backup_stale' AND status = 'open'").run();
    }
    return { stale, age_hours: b ? b.age_hours : null };
  }
  const watch = tracked(db, 'backup_watch', checkBackups);
  if (process.env.NODE_ENV !== 'test') {
    setTimeout(() => { try { watch(); } catch {} }, 60 * 1000).unref?.();
    setInterval(() => { try { watch(); } catch {} }, 60 * 60 * 1000).unref?.();
  }

  return { checkBackups };
};

module.exports.recordJob = recordJob;
module.exports.tracked = tracked;
