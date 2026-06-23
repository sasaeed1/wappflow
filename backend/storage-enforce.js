'use strict';

// ════════════════════════════════════════════════════════════════════════════
//  STORAGE QUOTA ENFORCEMENT + THRESHOLD WARNINGS  (Final Vision · roadmap R2)
//
//  Two responsibilities, both additive and fail-open:
//   • gate(db, ws, incomingBytes)  — at upload time, block bytes that would push a
//     workspace OVER its plan storage limit. Only fires when enforcement is ON
//     (pricing_config.enforcement != 'off') and the limit is finite. Unlimited
//     plans (Enterprise / founder overrides) and any error → allowed:true.
//   • warn(db, ws, notify)         — after an upload lands, fire ONE notification
//     per threshold crossing (80% warn → 90% critical → 100% reached). Dedup is
//     held in storage_warn_state so we never spam the feed on every upload.
//
//  Limit resolves from the entitlements resolver (storage_gb, incl. overrides), so
//  changing a plan in Command Center changes enforcement with no code change. Usage
//  is computed LIVE from ms_assets + ms_exports (no counter drift), matching the
//  Command Center storage dashboard's definition.
// ════════════════════════════════════════════════════════════════════════════

const entitlements = require('./entitlements');
const GB = 1024 ** 3;
const LEVEL_ORDER = { ok: 0, unlimited: 0, warn: 1, critical: 2, reached: 3 };

function ensureSchema(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS storage_warn_state (
      workspace_id TEXT PRIMARY KEY,
      last_level TEXT DEFAULT 'ok',
      notified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
  } catch {}
}

// Live bytes for a workspace: non-deleted assets (provider-tracked storage_size,
// falling back to legacy size_bytes) + export bundles. Mirrors cc-storage.js.
function usedBytes(db, ws) {
  const n = (sql) => { try { const r = db.prepare(sql).get(ws); return (r && r.b) || 0; } catch { return 0; } };
  let b = n('SELECT COALESCE(SUM(COALESCE(storage_size, size_bytes)),0) b FROM ms_assets WHERE workspace_id=? AND deleted_at IS NULL');
  b += n('SELECT COALESCE(SUM(size_bytes),0) b FROM ms_exports WHERE workspace_id=?');
  return b;
}

// -1 = unlimited. Otherwise plan storage_gb → bytes.
function limitBytes(db, ws) {
  let gb = null;
  try { const ent = entitlements.getEntitlements(db, ws); gb = ent && ent.limits ? ent.limits.storage_gb : null; } catch {}
  if (gb == null || gb === -1) return -1;
  return gb * GB;
}

function enforcementOn(db) {
  try { const r = db.prepare("SELECT value FROM pricing_config WHERE key='enforcement'").get(); return !r || r.value !== 'off'; }
  catch { return true; }
}

function levelFor(used, limit) {
  if (limit === -1 || limit == null) return { pct: 0, level: 'unlimited' };
  if (limit === 0) return { pct: 100, level: 'reached' };
  const pct = Math.min(100, Math.round((used / limit) * 100));
  let level = 'ok';
  if (used >= limit) level = 'reached';
  else if (pct >= 90) level = 'critical';
  else if (pct >= 80) level = 'warn';
  return { pct, level };
}

// Full picture, optionally accounting for an in-flight upload of `incomingBytes`.
function status(db, ws, incomingBytes = 0) {
  const limit = limitBytes(db, ws);
  const used = usedBytes(db, ws);
  const projected = used + Math.max(0, Number(incomingBytes) || 0);
  const cur = levelFor(used, limit);
  const proj = levelFor(projected, limit);
  return {
    unlimited: limit === -1,
    limit_bytes: limit,
    limit_gb: limit === -1 ? -1 : +(limit / GB).toFixed(2),
    used_bytes: used,
    used_gb: +(used / GB).toFixed(3),
    projected_bytes: projected,
    pct: cur.pct,
    level: cur.level,
    projected_level: proj.level,
    remaining_bytes: limit === -1 ? -1 : Math.max(0, limit - used),
  };
}

// Hard gate. allowed:false only when enforcement is on, the limit is finite, and
// this upload would push the workspace strictly OVER the limit. Fail-open on error.
function gate(db, ws, incomingBytes = 0) {
  try {
    const s = status(db, ws, incomingBytes);
    if (s.unlimited || !enforcementOn(db)) return { allowed: true, ...s };
    return { allowed: s.projected_bytes <= s.limit_bytes, ...s };
  } catch {
    return { allowed: true, level: 'ok', unlimited: true };
  }
}

// Fire a single notification when a workspace crosses UP into a new warning band.
// Records the current level either way (so dropping below then re-crossing re-notifies).
function warn(db, ws, notify) {
  try {
    ensureSchema(db);
    const s = status(db, ws);
    if (s.unlimited) {
      try { db.prepare(`INSERT INTO storage_warn_state (workspace_id, last_level, notified_at) VALUES (?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(workspace_id) DO UPDATE SET last_level=excluded.last_level, notified_at=CURRENT_TIMESTAMP`).run(ws, 'ok'); } catch {}
      return null;
    }
    const prevRow = db.prepare('SELECT last_level FROM storage_warn_state WHERE workspace_id=?').get(ws);
    const prevLevel = (prevRow && prevRow.last_level) || 'ok';
    let fired = null;
    if (LEVEL_ORDER[s.level] > LEVEL_ORDER[prevLevel] && s.level !== 'ok') {
      const copy = {
        warn: { title: 'Storage 80% full', icon: '🟡', tail: 'Consider upgrading your plan soon.' },
        critical: { title: 'Storage 90% full', icon: '🟠', tail: 'Upgrade to avoid hitting your limit.' },
        reached: { title: 'Storage limit reached', icon: '🔴', tail: 'New uploads are blocked until you free space or upgrade.' },
      }[s.level];
      if (copy) {
        const body = `${s.used_gb} GB of ${s.limit_gb} GB used (${s.pct}%). ${copy.tail}`;
        try { notify(ws, { type: 'storage', title: copy.title, body, url: '/settings/storage', icon: copy.icon }); } catch {}
        fired = s.level;
      }
    }
    try { db.prepare(`INSERT INTO storage_warn_state (workspace_id, last_level, notified_at) VALUES (?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id) DO UPDATE SET last_level=excluded.last_level, notified_at=CURRENT_TIMESTAMP`).run(ws, s.level); } catch {}
    return fired;
  } catch { return null; }
}

module.exports = { ensureSchema, status, gate, warn, levelFor, usedBytes, limitBytes, enforcementOn, GB };
