// ════════════════════════════════════════════════════════════════════════════
//  ENTITLEMENTS — configuration-as-data + the single resolver.
//  See COMMAND-CENTER-SPEC.md §1.2 and §6.
//
//  This is the make-or-break foundation of the Command Center: every plan / limit
//  / feature gate in the platform must ultimately resolve through getEntitlements()
//  so that the Plans / Flags / Overrides screens take effect WITHOUT code changes.
//
//  SAFE-MIGRATION NOTE: this module is purely additive today. It seeds the config
//  tables to EXACT parity with the existing PLAN_DEFINITIONS in server.js and then
//  layers per-workspace overrides + feature flags on top. Re-pointing server.js's
//  getPlanInfo()/`/api/workspace/plan-info` route at this resolver is a deliberate,
//  separate step — do it behind a flag and verify parity first (see spec §6).
// ════════════════════════════════════════════════════════════════════════════

// EXACT copy of server.js PLAN_DEFINITIONS — used both to seed the plan_* tables
// and as the safety fallback if those tables are empty. Keep in sync with server.js
// until `/api/workspace/plan-info` is migrated to read from the tables.
const PLAN_DEFINITIONS = {
  free: {
    name: 'Free',
    features: {
      whatsapp: true, basic_inbox: true, basic_crm: true, basic_ai: 'limited',
      email_integration: false, email_templates: false, email_sending: false, email_receiving: false,
      instagram: false, facebook: false, website_capture: false,
      auto_reply: false, automations: false, workflows: false,
      google_calendar: false, calendly: false,
      team_collaboration: false, shared_inbox: false,
      analytics: false, reports: false, multi_pipeline: false,
      flux: false, api_access: false, byok: false, white_label: false,
    },
    limits: { whatsapp_accounts: 1, users: 1, leads: 50, brand_profiles: 0, ig_accounts: 0, carousels_monthly: 0 },
  },
  starter: {
    name: 'Starter',
    features: {
      whatsapp: true, basic_inbox: true, basic_crm: true, basic_ai: true,
      email_integration: true, email_templates: true, email_sending: true, email_receiving: true,
      shared_inbox: true, voice_notes: true, analytics: 'basic', priority_support: 'email',
      instagram: false, facebook: false, website_capture: false,
      auto_reply: false, automations: false, workflows: false,
      google_calendar: false, calendly: false,
      team_collaboration: false, multi_pipeline: false,
      flux: false, api_access: false, byok: false, white_label: false,
    },
    limits: { whatsapp_accounts: 1, users: 2, leads: 300, brand_profiles: 0, ig_accounts: 0, carousels_monthly: 0 },
  },
  growth: {
    name: 'Growth',
    features: {
      whatsapp: true, basic_inbox: true, basic_crm: true, basic_ai: true,
      email_integration: true, email_templates: true, email_sending: true, email_receiving: true,
      shared_inbox: true, voice_notes: true,
      instagram: true, facebook: true, website_capture: true,
      auto_reply: true, automations: true, workflows: true,
      google_calendar: true, calendly: true,
      team_collaboration: true, analytics: true, reports: true, multi_pipeline: true,
      flux: true, priority_support: true,
      api_access: false, byok: false, white_label: false,
    },
    limits: { whatsapp_accounts: 3, users: 5, leads: -1, brand_profiles: 5, ig_accounts: 5, carousels_monthly: 250 },
  },
  enterprise: {
    name: 'Enterprise',
    features: {
      whatsapp: true, basic_inbox: true, basic_crm: true, basic_ai: true,
      email_integration: true, email_templates: true, email_sending: true, email_receiving: true,
      shared_inbox: true, voice_notes: true,
      instagram: true, facebook: true, website_capture: true,
      auto_reply: true, automations: true, workflows: true,
      google_calendar: true, calendly: true,
      team_collaboration: true, analytics: true, reports: true, multi_pipeline: true,
      flux: true, priority_support: true,
      api_access: true, byok: true, white_label: true, sso: true, audit_logs: true, dedicated_support: true,
    },
    // -1 means unlimited (matches usePlan's interpretation)
    limits: { whatsapp_accounts: -1, users: -1, leads: -1, brand_profiles: -1, ig_accounts: -1, carousels_monthly: -1 },
  },
};

// Monthly list prices from the landing pricing table (USD). enterprise = custom (null).
const PLAN_MONTHLY_PRICE = { free: 0, starter: 19, growth: 49, enterprise: null };

const CACHE_TTL_MS = 30 * 1000;
const _cache = new Map(); // workspaceId -> { data, exp }

function safeJson(v, fallback) {
  if (v === null || v === undefined) return fallback;
  try { return JSON.parse(v); } catch { return v; }
}

// Deterministic 0..99 bucket for percentage rollouts — stable per (workspace, flag),
// so a 25% rollout always hits the same workspaces (never random, never drifting).
function bucket(seed) {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 100;
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY, key TEXT UNIQUE, name TEXT, description TEXT,
      status TEXT DEFAULT 'active', visibility TEXT DEFAULT 'public',
      sort_order INTEGER DEFAULT 0, is_default INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS plan_prices (
      id TEXT PRIMARY KEY, plan_key TEXT, interval TEXT DEFAULT 'month',
      region TEXT DEFAULT 'default', currency TEXT DEFAULT 'USD',
      amount REAL, is_founding INTEGER DEFAULT 0, active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS plan_limits (
      plan_key TEXT, key TEXT, value INTEGER, PRIMARY KEY (plan_key, key)
    );
    CREATE TABLE IF NOT EXISTS plan_features (
      plan_key TEXT, feature_key TEXT, enabled TEXT, PRIMARY KEY (plan_key, feature_key)
    );
    CREATE TABLE IF NOT EXISTS feature_flags (
      key TEXT PRIMARY KEY, description TEXT, default_state INTEGER DEFAULT 0,
      rollout_pct INTEGER DEFAULT 0, status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS flag_assignments (
      id TEXT PRIMARY KEY, flag_key TEXT, scope TEXT, scope_id TEXT, state INTEGER,
      starts_at TIMESTAMP, ends_at TIMESTAMP, set_by TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS entitlement_overrides (
      id TEXT PRIMARY KEY, workspace_id TEXT, kind TEXT, key TEXT, value TEXT,
      reason TEXT, admin_id TEXT, starts_at TIMESTAMP, ends_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, revoked_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cc_config (
      namespace TEXT, key TEXT, value TEXT, updated_by TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (namespace, key)
    );
    CREATE INDEX IF NOT EXISTS idx_ent_ovr_ws ON entitlement_overrides(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_flag_assign ON flag_assignments(flag_key, scope, scope_id);
  `);
  seed(db);
}

// Idempotent seed of the plan catalog to exact parity with PLAN_DEFINITIONS.
function seed(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM plans').get().c;
  if (count > 0) return;
  const rid = () => 'pl-' + Math.random().toString(36).slice(2, 10);
  const insPlan = db.prepare('INSERT INTO plans (id, key, name, status, visibility, sort_order, is_default) VALUES (?,?,?,?,?,?,?)');
  const insLimit = db.prepare('INSERT OR REPLACE INTO plan_limits (plan_key, key, value) VALUES (?,?,?)');
  const insFeat = db.prepare('INSERT OR REPLACE INTO plan_features (plan_key, feature_key, enabled) VALUES (?,?,?)');
  const insPrice = db.prepare('INSERT INTO plan_prices (id, plan_key, interval, currency, amount) VALUES (?,?,?,?,?)');
  let order = 0;
  for (const [key, def] of Object.entries(PLAN_DEFINITIONS)) {
    insPlan.run(rid(), key, def.name, 'active', 'public', order++, key === 'free' ? 1 : 0);
    for (const [k, v] of Object.entries(def.limits)) insLimit.run(key, k, v);
    for (const [k, v] of Object.entries(def.features)) insFeat.run(key, k, JSON.stringify(v));
    const price = PLAN_MONTHLY_PRICE[key];
    if (price !== null && price !== undefined) insPrice.run(rid(), key, 'month', 'USD', price);
  }
}

function activeNow(starts, ends, now) {
  if (starts && new Date(starts).getTime() > now) return false;
  if (ends && new Date(ends).getTime() < now) return false;
  return true;
}

// Layer feature flags onto the feature map. Precedence: explicit workspace assignment
// > explicit global assignment > flag default_state > percentage rollout.
function applyFlags(db, workspaceId, features, sources) {
  const now = Date.now();
  const flags = db.prepare("SELECT * FROM feature_flags WHERE status = 'active'").all();
  for (const f of flags) {
    let state = null, src = null;
    const ws = db.prepare("SELECT * FROM flag_assignments WHERE flag_key = ? AND scope = 'workspace' AND scope_id = ? ORDER BY created_at DESC").all(f.key, workspaceId)
      .find(a => activeNow(a.starts_at, a.ends_at, now));
    if (ws) { state = !!ws.state; src = 'flag:workspace'; }
    if (state === null) {
      const g = db.prepare("SELECT * FROM flag_assignments WHERE flag_key = ? AND scope = 'global' ORDER BY created_at DESC").all(f.key)
        .find(a => activeNow(a.starts_at, a.ends_at, now));
      if (g) { state = !!g.state; src = 'flag:global'; }
    }
    if (state === null) {
      if (f.default_state) { state = true; src = 'flag:default'; }
      else if (f.rollout_pct > 0) { state = bucket(workspaceId + ':' + f.key) < f.rollout_pct; src = 'flag:rollout'; }
    }
    if (state !== null) { features[f.key] = state; sources[f.key] = src; }
  }
}

// Layer per-workspace overrides on top (highest precedence). Time-windowed; revoked rows ignored.
function applyOverrides(db, workspaceId, features, limits, sources) {
  const now = Date.now();
  const rows = db.prepare('SELECT * FROM entitlement_overrides WHERE workspace_id = ? AND revoked_at IS NULL').all(workspaceId);
  for (const o of rows) {
    if (!activeNow(o.starts_at, o.ends_at, now)) continue;
    const val = safeJson(o.value, o.value);
    if (o.kind === 'limit') { limits[o.key] = val; sources[o.key] = 'override:limit'; }
    else if (o.kind === 'feature' || o.kind === 'module') { features[o.key] = val; sources[o.key] = 'override:' + o.kind; }
    // kind 'grace' is tracked in cc_grace_periods and consumed elsewhere
  }
}

// ── The resolver ────────────────────────────────────────────────────────────
// Returns { plan, name, features, limits, sources }. `sources` records where each
// non-base value came from (flag/override) for the Command Center "why" view.
function getEntitlements(db, workspaceId, { fresh = false } = {}) {
  if (!fresh) {
    const c = _cache.get(workspaceId);
    if (c && c.exp > Date.now()) return c.data;
  }

  const wp = db.prepare('SELECT * FROM workspace_plan WHERE workspace_id = ?').get(workspaceId);
  const planKey = (wp?.plan || 'free').toLowerCase();

  // Base from the plan_* tables; fall back to the embedded definitions if unseeded
  // or if the tables don't exist (resolver stays usable without Command Center mounted).
  let features = {}, limits = {};
  try {
    const fRows = db.prepare('SELECT feature_key, enabled FROM plan_features WHERE plan_key = ?').all(planKey);
    const lRows = db.prepare('SELECT key, value FROM plan_limits WHERE plan_key = ?').all(planKey);
    fRows.forEach(r => { features[r.feature_key] = safeJson(r.enabled, r.enabled); });
    lRows.forEach(r => { limits[r.key] = r.value; });
  } catch {}
  if (!Object.keys(features).length && !Object.keys(limits).length) {
    const def = PLAN_DEFINITIONS[planKey] || PLAN_DEFINITIONS.free;
    features = { ...def.features };
    limits = { ...def.limits };
  }

  // Preserve the existing per-workspace JSON overrides on workspace_plan.
  try { if (wp?.features) Object.assign(features, JSON.parse(wp.features)); } catch {}
  try { if (wp?.limits) Object.assign(limits, JSON.parse(wp.limits)); } catch {}

  const sources = {};
  try { applyFlags(db, workspaceId, features, sources); } catch {}
  try { applyOverrides(db, workspaceId, features, limits, sources); } catch {}

  // ── ACCESS FULLY OPEN (pricing/plans retired 2026-06-21) ──────────────────
  // Every workspace gets every feature unlocked and all limits unlimited. We
  // override here — the single resolver every gate flows through — so all plan
  // enforcement (module gates, requireFeature-style checks, usePlan) reports
  // unlocked without touching each call site. Proxies make even un-seeded keys
  // read as unlocked, so a never-defined feature/limit can never block a user.
  for (const k of Object.keys(features)) features[k] = true;
  for (const k of Object.keys(limits)) limits[k] = -1;
  const featuresOpen = new Proxy(features, { get: (t, p) => (p in t ? t[p] : true) });
  const limitsOpen = new Proxy(limits, { get: (t, p) => (p in t ? t[p] : -1) });

  const data = {
    plan: planKey,
    name: (PLAN_DEFINITIONS[planKey] || {}).name || planKey,
    features: featuresOpen, limits: limitsOpen, sources,
  };
  _cache.set(workspaceId, { data, exp: Date.now() + CACHE_TTL_MS });
  return data;
}

function invalidate(workspaceId) {
  if (workspaceId) _cache.delete(workspaceId);
  else _cache.clear();
}

// The "all plans" catalog in the exact shape `/api/workspace/plan-info` returns
// (so the frontend's plan-comparison UI keeps working). Reads from the plan_* tables
// (config-as-data) so a future Plans editor reflects automatically; falls back to the
// embedded definitions if unseeded.
function getAllPlans(db) {
  try {
    const plans = db.prepare("SELECT key, name FROM plans WHERE status = 'active' ORDER BY sort_order").all();
    if (plans.length) {
      return plans.map(p => ({
        key: p.key,
        name: p.name,
        features: Object.fromEntries(db.prepare('SELECT feature_key, enabled FROM plan_features WHERE plan_key = ?').all(p.key).map(r => [r.feature_key, safeJson(r.enabled, r.enabled)])),
        limits: Object.fromEntries(db.prepare('SELECT key, value FROM plan_limits WHERE plan_key = ?').all(p.key).map(r => [r.key, r.value])),
      }));
    }
  } catch {}
  return Object.entries(PLAN_DEFINITIONS).map(([k, v]) => ({ key: k, name: v.name, features: v.features, limits: v.limits }));
}

module.exports = {
  ensureSchema, getEntitlements, invalidate, getAllPlans,
  PLAN_DEFINITIONS, PLAN_MONTHLY_PRICE,
};
