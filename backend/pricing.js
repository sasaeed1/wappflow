// ════════════════════════════════════════════════════════════════════════════
//  PRICING / USAGE / ENFORCEMENT  (data-driven)
//
//  Limits come from the entitlements resolver (plan_* tables → feature flags →
//  per-workspace overrides), so changing a plan in Command Center changes
//  enforcement with NO code changes. Usage is computed LIVE from source tables
//  (no counter drift), scoped to the current calendar month for monthly metrics.
//
//  Metrics: leads (NEW leads/month), users, whatsapp_accounts, storage_gb,
//  contract_sends (contracts/proposals/quotes sent/month).
//  Limit convention: -1 (or null) = unlimited. Soft levels: 80% warn, 90%
//  critical, 100% reached (hard stop). Master switch: pricing_config.enforcement.
// ════════════════════════════════════════════════════════════════════════════

const entitlements = require('./entitlements');

const MONTHLY = { leads: true, contract_sends: true };
const METRICS = ['leads', 'users', 'whatsapp_accounts', 'storage_gb', 'contract_sends'];

function pad(n) { return String(n).padStart(2, '0'); }

// Calendar-month bounds as SQLite-naive UTC strings ("YYYY-MM-DD HH:MM:SS") so
// they compare correctly against CURRENT_TIMESTAMP columns (leads.created_at,
// cs_documents.sent_at). reset = first instant of next month.
function monthBounds(now) {
  const d = now || new Date();
  const y = d.getUTCFullYear(), m = d.getUTCMonth(); // 0-indexed
  const start = `${y}-${pad(m + 1)}-01 00:00:00`;
  const ny = m === 11 ? y + 1 : y, nm = m === 11 ? 1 : m + 2;
  const reset = `${ny}-${pad(nm)}-01 00:00:00`;
  return { start, reset };
}

function ensurePricing(db) {
  // plan_*, feature_flags, flag_assignments, entitlement_overrides, cc_config (+ seed)
  try { entitlements.ensureSchema(db); } catch (e) { console.error('entitlements schema:', e.message); }
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_usage (
      workspace_id TEXT PRIMARY KEY,
      period_start TEXT, reset_date TEXT,
      snapshot TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS workspace_usage_history (
      id TEXT PRIMARY KEY, workspace_id TEXT, period_start TEXT, period_end TEXT,
      metric TEXT, used INTEGER, lim INTEGER, plan TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS founding_program (
      workspace_id TEXT PRIMARY KEY, slot INTEGER, plan TEXT,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS pricing_config (
      key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_usage_hist_ws ON workspace_usage_history(workspace_id);
  `);
  const setCfg = db.prepare('INSERT OR IGNORE INTO pricing_config (key, value) VALUES (?,?)');
  setCfg.run('founding_slots', '100');
  setCfg.run('enforcement', 'on');            // master switch — Command Center can flip to 'off'
  try { grandfatherExisting(db); } catch (e) { console.error('grandfather:', e.message); }
}

// One-time migration: every workspace that predates pricing is grandfathered to
// Studio+ (generous, never locked out, and the usage UI renders with real data).
// New signups default to Creator (set at the workspace_plan insert in server.js).
function grandfatherExisting(db) {
  const done = db.prepare("SELECT value FROM pricing_config WHERE key='grandfathered'").get();
  if (done && done.value === '1') return;
  const VALID = ['creator', 'studio', 'studio_plus', 'enterprise'];
  // existing plan rows on a legacy/unknown tier → studio_plus
  try {
    const rows = db.prepare('SELECT workspace_id, plan FROM workspace_plan').all();
    const upd = db.prepare("UPDATE workspace_plan SET plan='studio_plus', updated_at=CURRENT_TIMESTAMP WHERE workspace_id=?");
    for (const r of rows) {
      if (!VALID.includes((r.plan || '').toLowerCase())) upd.run(r.workspace_id);
    }
  } catch {}
  // any existing workspace with no plan row → studio_plus
  try {
    const ins = db.prepare("INSERT OR IGNORE INTO workspace_plan (workspace_id, plan) VALUES (?, 'studio_plus')");
    const wss = db.prepare('SELECT DISTINCT workspace_id FROM users WHERE workspace_id IS NOT NULL').all();
    for (const w of wss) ins.run(w.workspace_id);
  } catch {}
  db.prepare("INSERT OR REPLACE INTO pricing_config (key, value) VALUES ('grandfathered','1')").run();
  try { entitlements.invalidate(); } catch {}
}

function enforcementOn(db) {
  try {
    const r = db.prepare("SELECT value FROM pricing_config WHERE key='enforcement'").get();
    return !r || r.value !== 'off';
  } catch { return true; }
}

// Live usage counts for a workspace (current calendar month for monthly metrics).
function computeUsage(db, workspaceId) {
  const { start } = monthBounds();
  const n = (sql, ...args) => { try { const r = db.prepare(sql).get(...args); return (r && (r.n ?? r.b)) || 0; } catch { return 0; } };
  const leads = n('SELECT COUNT(*) n FROM leads WHERE workspace_id=? AND created_at >= ?', workspaceId, start);
  const users = n('SELECT COUNT(*) n FROM workspace_members WHERE workspace_id=?', workspaceId);
  const whatsapp_accounts = n("SELECT COUNT(*) n FROM platform_accounts WHERE workspace_id=? AND platform='whatsapp'", workspaceId);
  const contract_sends = n('SELECT COUNT(*) n FROM cs_documents WHERE workspace_id=? AND sent_at IS NOT NULL AND sent_at >= ?', workspaceId, start);
  let bytes = n('SELECT COALESCE(SUM(size_bytes),0) b FROM ms_assets WHERE workspace_id=?', workspaceId);
  bytes += n('SELECT COALESCE(SUM(size_bytes),0) b FROM ms_exports WHERE workspace_id=?', workspaceId);
  const storage_gb = Math.round((bytes / (1024 * 1024 * 1024)) * 1000) / 1000;
  return { leads, users, whatsapp_accounts, contract_sends, storage_gb };
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

// Rich per-metric usage block: { metric: { used, limit, remaining, pct, level, reset_date, monthly } }
function buildUsage(db, workspaceId, limits) {
  const raw = computeUsage(db, workspaceId);
  const { reset } = monthBounds();
  const out = {};
  for (const m of METRICS) {
    const limit = limits && limits[m] != null ? limits[m] : -1;
    const used = raw[m] || 0;
    const { pct, level } = levelFor(used, limit);
    out[m] = {
      used,
      limit,
      remaining: (limit === -1) ? -1 : Math.max(0, limit - used),
      pct,
      level,
      monthly: !!MONTHLY[m],
      reset_date: MONTHLY[m] ? reset : null,
    };
  }
  return out;
}

// Enforcement check for a single metric. allowed=false only when enforcement is on,
// the limit is finite, and usage has reached it. Founder overrides / unlimited pass.
// `limits` should be the resolved entitlements limits (incl. overrides).
function checkLimit(db, workspaceId, metric, limits) {
  try {
    const lim = limits && limits[metric] != null ? limits[metric] : -1;
    if (lim === -1) return { allowed: true, level: 'unlimited', used: 0, limit: -1 };
    if (!enforcementOn(db)) return { allowed: true, level: 'ok', used: 0, limit: lim };
    const used = computeUsage(db, workspaceId)[metric] || 0;
    const { pct, level } = levelFor(used, lim);
    return { allowed: used < lim, level, pct, used, limit: lim };
  } catch {
    return { allowed: true, level: 'ok' };
  }
}

// Convenience: resolve limits then check (used by server.js event sites).
function canCreate(db, workspaceId, metric) {
  let limits = null;
  try { limits = entitlements.getEntitlements(db, workspaceId).limits; } catch {}
  return checkLimit(db, workspaceId, metric, limits);
}

function foundingStatus(db) {
  let slots = 100, taken = 0;
  try { const r = db.prepare("SELECT value FROM pricing_config WHERE key='founding_slots'").get(); if (r) slots = parseInt(r.value, 10) || 100; } catch {}
  try { taken = db.prepare('SELECT COUNT(*) n FROM founding_program WHERE active=1').get().n || 0; } catch {}
  return { slots, taken, remaining: Math.max(0, slots - taken), open: taken < slots };
}

module.exports = {
  ensurePricing, buildUsage, computeUsage, checkLimit, canCreate,
  enforcementOn, foundingStatus, monthBounds, levelFor, METRICS,
};
