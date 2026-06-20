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

// ════════════════════════════════════════════════════════════════════════════
//  PLAN CATALOG — spec 2026-06-21 (PKR). Creator → Studio → Studio+ → Enterprise.
//  This is the seed + fallback for the data-driven plan_* tables. Feature sets use
//  inheritance (each tier spreads the one below + its additions) so the catalog
//  stays maintainable; everything still resolves through the plan_* tables at
//  runtime, so Command Center can edit any of it without code changes.
//  Limit convention: -1 = unlimited. leads = NEW leads per calendar month;
//  contract_sends = contracts/proposals/quotes sent per month; storage_gb = GB.
// ════════════════════════════════════════════════════════════════════════════

// CREATOR — solo creators/freelancers. Core modules on; growth/AI/team/contract
// depth off. (Modules: CRM, Contracts Studio, Booking, Media Studio, Portfolio,
// Client Portal, Print Store.)
const CREATOR_FEATURES = {
  // Core modules (included)
  crm: true, contracts_studio: true, booking: true, media_studio: true,
  portfolio: true, client_portal: true, print_store: true,
  // CRM essentials
  whatsapp: true, basic_inbox: true, basic_crm: true, shared_inbox: true, voice_notes: true,
  email: true, email_integration: true, email_templates: true, email_sending: true, email_receiving: true,
  basic_ai: true,
  // Extra lead-capture channels — EXCLUDED on Creator
  instagram: false, facebook: false, website_capture: false, lead_source_tracking: false,
  // Team / reporting / knowledge — EXCLUDED
  team_collaboration: false, team_permissions: false,
  analytics: false, reports: false, advanced_reporting: false, multi_pipeline: false,
  knowledge_base: false,
  // AI depth — EXCLUDED
  ai_reply_suggestions: false, ai_lead_intelligence: false, next_best_actions: false,
  studio_brain: false, ai_asset_scoring: false, ai_hero_shot: false, ai_culling: false, ai_project_intelligence: false,
  // Contracts depth — EXCLUDED
  clause_library: false, version_history: false, redline_comparison: false, approval_workflows: false, bulk_send: false,
  // Gallery / studio depth — EXCLUDED
  gallery_collections: false, story_sections: false, advanced_proofing: false, portfolio_management: false,
  // Automation / integrations — EXCLUDED
  auto_reply: false, automations: false, workflows: false, advanced_automation: false,
  google_calendar: false, calendly: false,
  // Premium / platform — EXCLUDED
  white_label: false, priority_support: false,
  desktop_access: false, desktop_sync: false, local_ai: false,
  style_profiles: false, story_engine: false, reel_engine: false, ai_editing: false,
  // Enterprise — EXCLUDED
  api_access: false, byok: false, sso: false, audit_logs: false, dedicated_support: false,
  custom_integrations: false, custom_branding: false,
  flux: false,
};

// STUDIO — growing studios/teams. Everything in Creator + growth/AI/team/contract/
// gallery depth + advanced automation + Desktop Beta.
const STUDIO_ADD = {
  instagram: true, facebook: true, website_capture: true, lead_source_tracking: true,
  team_collaboration: true, team_permissions: true,
  analytics: true, reports: true, advanced_reporting: true, multi_pipeline: true,
  knowledge_base: true,
  ai_reply_suggestions: true, ai_lead_intelligence: true, next_best_actions: true,
  studio_brain: true, ai_asset_scoring: true, ai_hero_shot: true, ai_culling: true, ai_project_intelligence: true,
  clause_library: true, version_history: true, redline_comparison: true, approval_workflows: true, bulk_send: true,
  gallery_collections: true, story_sections: true, advanced_proofing: true, portfolio_management: true,
  auto_reply: true, automations: true, workflows: true, advanced_automation: true,
  google_calendar: true, calendly: true,
  desktop_access: true, // Desktop Beta
};

// STUDIO+ — established studios at scale. Everything in Studio + white-label,
// priority support, desktop (incl. sync) + future creative engines.
const STUDIO_PLUS_ADD = {
  white_label: true, priority_support: true,
  desktop_sync: true, local_ai: true,
  style_profiles: true, story_engine: true, reel_engine: true, ai_editing: true,
  flux: true,
};

// ENTERPRISE — custom. Everything + integrations/SLAs/branding/support.
const ENTERPRISE_ADD = {
  api_access: true, byok: true, sso: true, audit_logs: true, dedicated_support: true,
  custom_integrations: true, custom_branding: true,
};

const PLAN_DEFINITIONS = {
  creator: {
    name: 'Creator',
    features: { ...CREATOR_FEATURES },
    limits: { users: 1, leads: 200, whatsapp_accounts: 1, storage_gb: 50, contract_sends: 25, ig_accounts: 0, facebook_accounts: 0 },
  },
  studio: {
    name: 'Studio',
    features: { ...CREATOR_FEATURES, ...STUDIO_ADD },
    limits: { users: 5, leads: 500, whatsapp_accounts: 2, storage_gb: 250, contract_sends: 100, ig_accounts: -1, facebook_accounts: -1 },
  },
  studio_plus: {
    name: 'Studio+',
    features: { ...CREATOR_FEATURES, ...STUDIO_ADD, ...STUDIO_PLUS_ADD },
    limits: { users: 15, leads: 5000, whatsapp_accounts: 5, storage_gb: 1024, contract_sends: 500, ig_accounts: -1, facebook_accounts: -1 },
  },
  enterprise: {
    name: 'Enterprise',
    features: { ...CREATOR_FEATURES, ...STUDIO_ADD, ...STUDIO_PLUS_ADD, ...ENTERPRISE_ADD },
    // -1 means unlimited (matches usePlan's interpretation)
    limits: { users: -1, leads: -1, whatsapp_accounts: -1, storage_gb: -1, contract_sends: -1, ig_accounts: -1, facebook_accounts: -1 },
  },
};

// Standard monthly list price (PKR). enterprise = custom (null).
const PLAN_MONTHLY_PRICE = { creator: 7999, studio: 14999, studio_plus: 29999, enterprise: null };
// Founding 100 price (PKR) — 50% off, locked permanently for the first 100 paying
// customers. Stored as is_founding rows in plan_prices.
const PLAN_FOUNDING_PRICE = { creator: 3999, studio: 7499, studio_plus: 14999, enterprise: null };
const PLAN_CURRENCY = 'PKR';
const DEFAULT_PLAN = 'creator'; // entry plan for new workspaces / unknown tiers

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

// Seed the plan catalog into the plan_* tables. Re-seeds (retiring any prior
// catalog, e.g. legacy free/starter/growth) when the current plans aren't present,
// so a change to PLAN_DEFINITIONS here flows into the tables on next boot. Per-
// workspace overrides/flags/usage are never touched. Command Center edits the
// tables afterward (config-as-data).
function seed(db) {
  const has = db.prepare('SELECT 1 AS x FROM plans WHERE key = ?').get(DEFAULT_PLAN);
  if (has) return; // current catalog already seeded
  const rid = () => 'pl-' + Math.random().toString(36).slice(2, 10);
  try {
    db.prepare('DELETE FROM plans').run();
    db.prepare('DELETE FROM plan_limits').run();
    db.prepare('DELETE FROM plan_features').run();
    db.prepare('DELETE FROM plan_prices').run();
  } catch {}
  const insPlan = db.prepare('INSERT OR REPLACE INTO plans (id, key, name, status, visibility, sort_order, is_default) VALUES (?,?,?,?,?,?,?)');
  const insLimit = db.prepare('INSERT OR REPLACE INTO plan_limits (plan_key, key, value) VALUES (?,?,?)');
  const insFeat = db.prepare('INSERT OR REPLACE INTO plan_features (plan_key, feature_key, enabled) VALUES (?,?,?)');
  const insPrice = db.prepare('INSERT INTO plan_prices (id, plan_key, interval, region, currency, amount, is_founding) VALUES (?,?,?,?,?,?,?)');
  let order = 0;
  for (const [key, def] of Object.entries(PLAN_DEFINITIONS)) {
    insPlan.run(rid(), key, def.name, 'active', 'public', order++, key === DEFAULT_PLAN ? 1 : 0);
    for (const [k, v] of Object.entries(def.limits)) insLimit.run(key, k, v);
    for (const [k, v] of Object.entries(def.features)) insFeat.run(key, k, JSON.stringify(v));
    const price = PLAN_MONTHLY_PRICE[key];
    if (price !== null && price !== undefined) insPrice.run(rid(), key, 'month', 'default', PLAN_CURRENCY, price, 0);
    const founding = PLAN_FOUNDING_PRICE[key];
    if (founding !== null && founding !== undefined) insPrice.run(rid(), key, 'month', 'default', PLAN_CURRENCY, founding, 1);
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
  const planKey = (wp?.plan || DEFAULT_PLAN).toLowerCase();

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
    const def = PLAN_DEFINITIONS[planKey] || PLAN_DEFINITIONS[DEFAULT_PLAN];
    features = { ...def.features };
    limits = { ...def.limits };
  }

  // Preserve the existing per-workspace JSON overrides on workspace_plan.
  try { if (wp?.features) Object.assign(features, JSON.parse(wp.features)); } catch {}
  try { if (wp?.limits) Object.assign(limits, JSON.parse(wp.limits)); } catch {}

  const sources = {};
  try { applyFlags(db, workspaceId, features, sources); } catch {}
  try { applyOverrides(db, workspaceId, features, limits, sources); } catch {}

  const data = {
    plan: planKey,
    name: (PLAN_DEFINITIONS[planKey] || {}).name || planKey,
    features, limits, sources,
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
  const priceFor = (key) => {
    try {
      const std = db.prepare("SELECT amount, currency FROM plan_prices WHERE plan_key = ? AND COALESCE(is_founding,0)=0 AND COALESCE(active,1)=1 ORDER BY amount LIMIT 1").get(key);
      const fnd = db.prepare("SELECT amount FROM plan_prices WHERE plan_key = ? AND is_founding=1 AND COALESCE(active,1)=1 ORDER BY amount LIMIT 1").get(key);
      return { price: std ? std.amount : (PLAN_MONTHLY_PRICE[key] ?? null), founding_price: fnd ? fnd.amount : (PLAN_FOUNDING_PRICE[key] ?? null), currency: (std && std.currency) || PLAN_CURRENCY };
    } catch { return { price: PLAN_MONTHLY_PRICE[key] ?? null, founding_price: PLAN_FOUNDING_PRICE[key] ?? null, currency: PLAN_CURRENCY }; }
  };
  try {
    const plans = db.prepare("SELECT key, name FROM plans WHERE status = 'active' ORDER BY sort_order").all();
    if (plans.length) {
      return plans.map(p => ({
        key: p.key,
        name: p.name,
        ...priceFor(p.key),
        features: Object.fromEntries(db.prepare('SELECT feature_key, enabled FROM plan_features WHERE plan_key = ?').all(p.key).map(r => [r.feature_key, safeJson(r.enabled, r.enabled)])),
        limits: Object.fromEntries(db.prepare('SELECT key, value FROM plan_limits WHERE plan_key = ?').all(p.key).map(r => [r.key, r.value])),
      }));
    }
  } catch {}
  return Object.entries(PLAN_DEFINITIONS).map(([k, v]) => ({ key: k, name: v.name, price: PLAN_MONTHLY_PRICE[k] ?? null, founding_price: PLAN_FOUNDING_PRICE[k] ?? null, currency: PLAN_CURRENCY, features: v.features, limits: v.limits }));
}

module.exports = {
  ensureSchema, getEntitlements, invalidate, getAllPlans,
  PLAN_DEFINITIONS, PLAN_MONTHLY_PRICE, PLAN_FOUNDING_PRICE, PLAN_CURRENCY, DEFAULT_PLAN,
};
