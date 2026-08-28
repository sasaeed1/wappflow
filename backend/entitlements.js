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
//  PLAN CATALOG — Free → Creator → Studio → Studio+ → Enterprise.
//  This is the seed + fallback for the data-driven plan_* tables. Tiers differ by
//  QUANTITY ONLY: every plan carries every feature (see ALL_FEATURES below).
//  Everything still resolves through the plan_* tables at runtime, so Command
//  Center can edit any of it without code changes.
//  Limit convention: -1 = unlimited. leads = NEW leads per calendar month;
//  contract_sends = contracts/proposals/quotes sent per month; storage_gb = GB.
// ════════════════════════════════════════════════════════════════════════════

// ── FEATURES ARE NOT A TIER ──────────────────────────────────────────────────
//
// OWNER DECISION: every plan gets every feature. Plans differ ONLY by QUANTITY —
// how many leads, seats, WhatsApp numbers, gigabytes, contract sends.
//
// This file previously gated features across four tiers: Creator had no
// Instagram, no team, no analytics, no AI suggestions, no automations, no
// knowledge base. That is not the product that was agreed, and it is the wrong
// shape for this one — someone on the smallest plan running a real business
// should hit a CEILING, not a wall. A ceiling says "you have outgrown this";
// a wall says "we built something and you cannot have it".
//
// Keep the keys. Everything downstream (the resolver, Command Center, the
// per-workspace overrides, the UI's LockBadge) reads feature keys, so removing
// the vocabulary would break all of it. They are simply all true now, and a plan
// that wants to withhold one can still do it per-workspace through an override.
const ALL_FEATURE_KEYS = [
  // Core modules
  'crm', 'contracts_studio', 'booking', 'media_studio', 'portfolio', 'client_portal', 'print_store',
  // CRM essentials
  'whatsapp', 'basic_inbox', 'basic_crm', 'shared_inbox', 'voice_notes',
  'email', 'email_integration', 'email_templates', 'email_sending', 'email_receiving', 'basic_ai',
  // Lead capture
  'instagram', 'facebook', 'website_capture', 'lead_source_tracking',
  // Team / reporting / knowledge
  'team_collaboration', 'team_permissions',
  'analytics', 'reports', 'advanced_reporting', 'multi_pipeline', 'knowledge_base',
  // AI depth
  'ai_reply_suggestions', 'ai_lead_intelligence', 'next_best_actions',
  'studio_brain', 'ai_asset_scoring', 'ai_hero_shot', 'ai_culling', 'ai_project_intelligence',
  // Contracts depth
  'clause_library', 'version_history', 'redline_comparison', 'approval_workflows', 'bulk_send',
  // Gallery / studio depth
  'gallery_collections', 'story_sections', 'advanced_proofing', 'portfolio_management',
  // Automation / integrations
  'auto_reply', 'automations', 'workflows', 'advanced_automation', 'google_calendar', 'calendly',
  // Platform
  'white_label', 'desktop_access', 'desktop_sync', 'local_ai',
  'style_profiles', 'story_engine', 'reel_engine', 'ai_editing',
  'api_access', 'byok', 'sso', 'audit_logs', 'custom_integrations', 'custom_branding',
  'flux',
  // SUPPORT TIERS are a commercial commitment, not software. They stay per-plan
  // below rather than being switched on for everyone, because turning them on
  // here would promise a human response the business has not agreed to give.
];

const ALL_FEATURES = Object.fromEntries(ALL_FEATURE_KEYS.map((k) => [k, true]));

const PLAN_DEFINITIONS = {
  // FREE — a real free tier, not a trial. Everything works; you simply run out
  // of room. 1 of each connected thing, 20 new leads a month.
  free: {
    name: 'Free',
    features: { ...ALL_FEATURES, priority_support: false, dedicated_support: false },
    limits: { users: 1, leads: 20, whatsapp_accounts: 1, storage_gb: 1, contract_sends: 1, ig_accounts: 1, facebook_accounts: 1 },
  },
  creator: {
    name: 'Creator',
    features: { ...ALL_FEATURES, priority_support: false, dedicated_support: false },
    limits: { users: 1, leads: 200, whatsapp_accounts: 1, storage_gb: 50, contract_sends: 25, ig_accounts: 1, facebook_accounts: 1 },
  },
  studio: {
    name: 'Studio',
    features: { ...ALL_FEATURES, priority_support: true, dedicated_support: false },
    limits: { users: 5, leads: 500, whatsapp_accounts: 2, storage_gb: 250, contract_sends: 100, ig_accounts: -1, facebook_accounts: -1 },
  },
  studio_plus: {
    name: 'Studio+',
    features: { ...ALL_FEATURES, priority_support: true, dedicated_support: false },
    limits: { users: 15, leads: 5000, whatsapp_accounts: 5, storage_gb: 1024, contract_sends: 500, ig_accounts: -1, facebook_accounts: -1 },
  },
  enterprise: {
    name: 'Enterprise',
    features: { ...ALL_FEATURES, priority_support: true, dedicated_support: true },
    // -1 means unlimited (matches usePlan's interpretation)
    limits: { users: -1, leads: -1, whatsapp_accounts: -1, storage_gb: -1, contract_sends: -1, ig_accounts: -1, facebook_accounts: -1 },
  },
};

// Standard monthly list price (PKR). enterprise = custom (null).
const PLAN_MONTHLY_PRICE = { free: 0, creator: 29, studio: 59, studio_plus: 119, enterprise: null };
// Founding 100 price (USD) — 50% off, locked permanently for the first 100 paying
// customers. Stored as is_founding rows in plan_prices.
const PLAN_FOUNDING_PRICE = { free: 0, creator: 14, studio: 29, studio_plus: 59, enterprise: null };
const PLAN_CURRENCY = 'USD';
const DEFAULT_PLAN = 'free'; // entry plan for new workspaces / unknown tiers

// ── Sold-but-unbuilt guard ───────────────────────────────────────────────────
// These features are advertised on higher tiers but have NO working implementation
// yet (Final Vision phases). We force them OFF at the resolver and hide them from the
// advertised catalog so no workspace can reach an empty/broken feature. Delete a key
// here the moment its phase ships:
//   reel_engine, story_engine  → P8 (Video AI)        — SHIPPED (reel plan + render)
//   style_profiles             → P9 (Style Engine)     — SHIPPED (auto-apply + suggestions)
//   desktop_sync               → P6 (Offline-first)     — SHIPPED (verified live)
//   ai_editing                 → P10 (Desktop native editing) — still unbuilt
const UNBUILT_FEATURES = new Set(['ai_editing']);

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
  applyCatalogVersion(db);
  repriceCurrency(db);
}

// One-time currency switch: PKR → USD.
//
// seed() deliberately returns early once a catalog exists, so editing
// PLAN_MONTHLY_PRICE alone would change fresh installs and leave every deployed
// database quoting the old currency — the marketing site and the in-app Plan tab
// would then disagree about what the product costs. This rewrites the standard
// price rows to the current catalog when they are still denominated in a
// currency we no longer sell in.
//
// Safe to run against production: billing is not connected to a live gateway
// (payments default to provider='manual'), so no customer is mid-charge on a
// PKR amount. Only the 'default' region rows are touched — a region-specific or
// Command-Center-authored price is somebody's deliberate decision and is left
// exactly as it is.
// Re-apply the catalog when the shape of it changes underneath a live database.
//
// seed() returns early once the default plan exists, so editing PLAN_DEFINITIONS
// alone never reaches a box that has already booted — the same trap that made a
// currency change silently do nothing (see repriceCurrency below).
//
// This runs ONCE per catalog version, recorded in plan_meta. It upserts features
// and limits for the plans it knows about and never deletes a plan, so
// per-workspace assignments survive. It is deliberately not run on every boot:
// Command Center edits these tables as config-as-data, and re-applying constantly
// would silently undo a deliberate change made there.
const CATALOG_VERSION = 2;   // 2 = features ungated; quantity-only tiers + free plan

function applyCatalogVersion(db) {
  try {
    db.exec("CREATE TABLE IF NOT EXISTS plan_meta (key TEXT PRIMARY KEY, value TEXT)");
    const cur = Number(db.prepare("SELECT value FROM plan_meta WHERE key = 'catalog_version'").get()?.value || 0);
    if (cur >= CATALOG_VERSION) return;

    const insPlan = db.prepare('INSERT OR IGNORE INTO plans (id, key, name, status, visibility, sort_order, is_default) VALUES (?,?,?,?,?,?,?)');
    const setDefault = db.prepare('UPDATE plans SET is_default = CASE WHEN key = ? THEN 1 ELSE 0 END');
    const insLimit = db.prepare('INSERT OR REPLACE INTO plan_limits (plan_key, key, value) VALUES (?,?,?)');
    const insFeat = db.prepare('INSERT OR REPLACE INTO plan_features (plan_key, feature_key, enabled) VALUES (?,?,?)');

    const run = db.transaction(() => {
      let order = 0;
      for (const [key, def] of Object.entries(PLAN_DEFINITIONS)) {
        insPlan.run('pl-' + Math.random().toString(36).slice(2, 10), key, def.name, 'active', 'public', order++, 0);
        for (const [k, v] of Object.entries(def.limits)) insLimit.run(key, k, v);
        for (const [k, v] of Object.entries(def.features)) insFeat.run(key, k, JSON.stringify(v));
      }
      setDefault.run(DEFAULT_PLAN);
      db.prepare("INSERT OR REPLACE INTO plan_meta (key, value) VALUES ('catalog_version', ?)").run(String(CATALOG_VERSION));
    });
    run();
    console.log(`✓ Plan catalog updated to v${CATALOG_VERSION} (features ungated; quantity-only tiers)`);
  } catch (e) {
    console.error('Plan catalog migration failed:', e.message);
  }
}

function repriceCurrency(db) {
  try {
    const stale = db.prepare(
      `SELECT COUNT(*) AS n FROM plan_prices WHERE region = 'default' AND currency <> ?`
    ).get(PLAN_CURRENCY);
    if (!stale || !stale.n) return;

    const upd = db.prepare(
      `UPDATE plan_prices SET currency = ?, amount = ?
        WHERE plan_key = ? AND interval = 'month' AND region = 'default' AND is_founding = ?`
    );
    const run = db.transaction(() => {
      for (const key of Object.keys(PLAN_DEFINITIONS)) {
        const std = PLAN_MONTHLY_PRICE[key];
        if (std !== null && std !== undefined) upd.run(PLAN_CURRENCY, std, key, 0);
        const found = PLAN_FOUNDING_PRICE[key];
        if (found !== null && found !== undefined) upd.run(PLAN_CURRENCY, found, key, 1);
      }
    });
    run();
    console.log(`💱 pricing: repriced ${stale.n} plan price row(s) to ${PLAN_CURRENCY}`);
  } catch (e) {
    console.error('pricing: currency migration failed —', e.message);
  }
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

  // Sold-but-unbuilt guard: force off regardless of plan/flag/override (see UNBUILT_FEATURES).
  for (const k of UNBUILT_FEATURES) { if (features[k]) { features[k] = false; sources[k] = 'unbuilt'; } }

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
        features: Object.fromEntries(db.prepare('SELECT feature_key, enabled FROM plan_features WHERE plan_key = ?').all(p.key).filter(r => !UNBUILT_FEATURES.has(r.feature_key)).map(r => [r.feature_key, safeJson(r.enabled, r.enabled)])),
        limits: Object.fromEntries(db.prepare('SELECT key, value FROM plan_limits WHERE plan_key = ?').all(p.key).map(r => [r.key, r.value])),
      }));
    }
  } catch {}
  return Object.entries(PLAN_DEFINITIONS).map(([k, v]) => ({ key: k, name: v.name, price: PLAN_MONTHLY_PRICE[k] ?? null, founding_price: PLAN_FOUNDING_PRICE[k] ?? null, currency: PLAN_CURRENCY, features: Object.fromEntries(Object.entries(v.features).filter(([fk]) => !UNBUILT_FEATURES.has(fk))), limits: v.limits }));
}

module.exports = {
  ensureSchema, getEntitlements, invalidate, getAllPlans,
  PLAN_DEFINITIONS, PLAN_MONTHLY_PRICE, PLAN_FOUNDING_PRICE, PLAN_CURRENCY, DEFAULT_PLAN,
};
