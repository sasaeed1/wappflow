// ════════════════════════════════════════════════════════════════════════════
//  COMMAND CENTER — the WappFlow platform control plane (additive module).
//  See COMMAND-CENTER-SPEC.md.
//
//  Unlike every other module, this one is PLATFORM-scoped: it intentionally reads
//  across all workspaces. It therefore does NOT use the workspace `auth` middleware
//  — it uses its own `platformAuth` over a separate identity tier (`cc_admins`)
//  with a distinct JWT audience ("command-center"), an IP allowlist, and full audit.
//
//  Mounted last in server.js so every ms_*/cs_* table already exists.
//
//  Phase 0 + first-slice surface implemented here:
//    identity/login • audit spine • event spine + admin SSE • executive overview
//    • customers list + workspace 360 • feature flags (incl. the live toggle)
//    • overrides + grace • events feed • audit feed • global search • config
//    • impersonation (read-only default)
// ════════════════════════════════════════════════════════════════════════════

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const entitlements = require('./entitlements');

const AUD = 'command-center';

// Platform roles → granular permissions. founder = everything.
const CC_PERMS = ['view', 'manage_plans', 'manage_flags', 'manage_overrides', 'manage_billing',
  'impersonate', 'impersonate_write', 'run_sql', 'manage_support', 'bulk_actions', 'manage_admins'];
// Per-workspace controllable modules. These are feature keys; the app gates the
// matching route groups via the moduleGate middleware in server.js. Default ON —
// only an explicit `false` (plan or override) disables them, so no regression.
const MODULE_KEYS = ['media_studio', 'contracts_studio', 'booking', 'print_store', 'payments'];

const CC_ROLE_PERMISSIONS = {
  founder: Object.fromEntries(CC_PERMS.map(p => [p, true])),
  ops:     { view: true, manage_flags: true, manage_overrides: true, manage_support: true, impersonate: true, bulk_actions: true },
  finance: { view: true, manage_plans: true, manage_billing: true },
  support: { view: true, manage_support: true, impersonate: true },
  cs:      { view: true, manage_support: true, manage_overrides: true },
  readonly:{ view: true },
};

function permsFor(role, custom) {
  let base = CC_ROLE_PERMISSIONS[role] || CC_ROLE_PERMISSIONS.readonly;
  if (custom) { try { base = { ...base, ...JSON.parse(custom) }; } catch {} }
  return base;
}

// Flat array of objects → RFC-4180-ish CSV. Used by the export engine (§23).
function toCSV(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

// ── Admin lifecycle helpers (also used by scripts/cc-create-admin.js) ──────────
function ensureSchema(db) {
  entitlements.ensureSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cc_admins (
      id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, name TEXT,
      cc_role TEXT DEFAULT 'readonly', cc_permissions TEXT, mfa_secret TEXT,
      status TEXT DEFAULT 'active', last_login_at TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cc_audit (
      id TEXT PRIMARY KEY, admin_id TEXT, action TEXT, target_type TEXT, target_id TEXT,
      workspace_id TEXT, before TEXT, after TEXT, reason TEXT, ip TEXT, ua TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cc_impersonations (
      id TEXT PRIMARY KEY, admin_id TEXT, workspace_id TEXT, audit_id TEXT, mode TEXT,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, ended_at TIMESTAMP, reason TEXT
    );
    CREATE TABLE IF NOT EXISTS platform_events (
      id TEXT PRIMARY KEY, ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP, workspace_id TEXT,
      actor_type TEXT, actor_id TEXT, type TEXT, entity_type TEXT, entity_id TEXT,
      payload TEXT, source TEXT
    );
    CREATE TABLE IF NOT EXISTS ai_usage (
      id TEXT PRIMARY KEY, ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP, workspace_id TEXT, user_id TEXT,
      feature TEXT, provider TEXT, model TEXT, prompt_tokens INTEGER, completion_tokens INTEGER,
      latency_ms INTEGER, est_cost REAL, success INTEGER
    );
    CREATE TABLE IF NOT EXISTS workspace_usage_daily (
      workspace_id TEXT, date TEXT, leads INTEGER, messages INTEGER, ai_calls INTEGER, ai_cost REAL,
      storage_bytes INTEGER, active_users INTEGER, contracts INTEGER, bookings INTEGER, galleries INTEGER,
      PRIMARY KEY (workspace_id, date)
    );
    CREATE TABLE IF NOT EXISTS workspace_scores (
      workspace_id TEXT PRIMARY KEY, health INTEGER, churn INTEGER, expansion INTEGER, activity INTEGER,
      risk_factors TEXT, computed_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cc_tickets (
      id TEXT PRIMARY KEY, workspace_id TEXT, admin_id TEXT, kind TEXT, priority TEXT,
      status TEXT DEFAULT 'open', subject TEXT, body TEXT, source TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, resolved_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cc_ticket_comments (
      id TEXT PRIMARY KEY, ticket_id TEXT, admin_id TEXT, body TEXT, internal INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cc_notes (
      id TEXT PRIMARY KEY, workspace_id TEXT, admin_id TEXT, body TEXT, pinned INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cc_inbox (
      id TEXT PRIMARY KEY, kind TEXT, workspace_id TEXT, severity TEXT, title TEXT, body TEXT,
      status TEXT DEFAULT 'open', link TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cc_reports (
      id TEXT PRIMARY KEY, name TEXT, definition TEXT, schedule TEXT, recipients TEXT,
      last_run_at TIMESTAMP, created_by TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cc_saved_views (
      id TEXT PRIMARY KEY, admin_id TEXT, surface TEXT, name TEXT, query TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cc_grace_periods (
      id TEXT PRIMARY KEY, workspace_id TEXT, days INTEGER, reason TEXT, admin_id TEXT,
      starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, ends_at TIMESTAMP, status TEXT DEFAULT 'active', notified TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cc_audit_admin ON cc_audit(admin_id);
    CREATE INDEX IF NOT EXISTS idx_cc_audit_target ON cc_audit(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_platform_events_ts ON platform_events(ts);
    CREATE INDEX IF NOT EXISTS idx_platform_events_ws ON platform_events(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_ai_usage_ws ON ai_usage(workspace_id);
  `);
  // A workspace status column for suspend/restore (guarded — ALTER can't be IF NOT EXISTS).
  try { db.prepare('SELECT status FROM workspaces LIMIT 1').get(); }
  catch { try { db.exec("ALTER TABLE workspaces ADD COLUMN status TEXT DEFAULT 'active'"); } catch {} }

  // Seed the founder from env on first boot (no admins yet).
  try {
    const n = db.prepare('SELECT COUNT(*) AS c FROM cc_admins').get().c;
    if (n === 0 && process.env.CC_FOUNDER_EMAIL && process.env.CC_FOUNDER_PASSWORD) {
      createOrUpdateAdmin(db, { email: process.env.CC_FOUNDER_EMAIL, password: process.env.CC_FOUNDER_PASSWORD, role: 'founder', name: 'Founder' });
      console.log('🛡️  Command Center founder seeded from env:', process.env.CC_FOUNDER_EMAIL);
    }
  } catch (e) { console.error('cc founder seed:', e.message); }
}

function createOrUpdateAdmin(db, { email, password, role = 'founder', name = null }) {
  if (!email || !password) throw new Error('email and password required');
  const hash = bcrypt.hashSync(String(password), 10);
  const existing = db.prepare('SELECT id FROM cc_admins WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    db.prepare('UPDATE cc_admins SET password_hash = ?, cc_role = ?, name = COALESCE(?, name), status = "active" WHERE id = ?')
      .run(hash, role, name, existing.id);
    return existing.id;
  }
  const id = 'adm-' + crypto.randomBytes(8).toString('hex');
  db.prepare('INSERT INTO cc_admins (id, email, password_hash, name, cc_role, status) VALUES (?,?,?,?,?,?)')
    .run(id, email.toLowerCase(), hash, name, role, 'active');
  return id;
}

// ════════════════════════════════════════════════════════════════════════════
//  MOUNT
// ════════════════════════════════════════════════════════════════════════════
module.exports = function mountCommandCenter(app, db, deps = {}) {
  const {
    generateId = () => crypto.randomBytes(12).toString('hex'),
    broadcastToWorkspace = () => {},
    JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  } = deps;

  try { ensureSchema(db); } catch (e) { console.error('Command Center schema error:', e.message); }

  const rid = generateId;

  // ── IP allowlist ────────────────────────────────────────────────────────────
  function ipAllowed(req) {
    const allow = (process.env.CC_IP_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!allow.length) return true; // unset = allow (dev)
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
    return allow.some(a => ip === a || ip.endsWith(a));
  }

  // ── Platform auth middleware ─────────────────────────────────────────────────
  function platformAuth(req, res, next) {
    try {
      if (!ipAllowed(req)) return res.status(403).json({ error: 'Not allowed from this network' });
      const token = req.header('Authorization')?.replace('Bearer ', '') || req.query.token;
      if (!token) throw new Error('no token');
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.aud !== AUD || !decoded.adminId) throw new Error('bad audience');
      const admin = db.prepare('SELECT * FROM cc_admins WHERE id = ? AND status = "active"').get(decoded.adminId);
      if (!admin) throw new Error('no admin');
      req.admin = admin;
      req.adminPerms = permsFor(admin.cc_role, admin.cc_permissions);
      req.elevated = !!decoded.elevated;
      next();
    } catch {
      res.status(401).json({ error: 'Command Center authentication required' });
    }
  }
  function requirePerm(perm) {
    return (req, res, next) => {
      if (req.adminPerms && req.adminPerms[perm]) return next();
      res.status(403).json({ error: `Missing permission: ${perm}` });
    };
  }

  // ── Audit spine ──────────────────────────────────────────────────────────────
  function ccAudit(req, { action, target_type, target_id, workspace_id = null, before = null, after = null, reason = null }) {
    const id = rid();
    try {
      db.prepare(`INSERT INTO cc_audit (id, admin_id, action, target_type, target_id, workspace_id, before, after, reason, ip, ua)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, req.admin?.id || null, action, target_type, target_id || null, workspace_id,
        before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, reason,
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null,
        req.headers['user-agent'] || null
      );
    } catch (e) { console.error('ccAudit:', e.message); }
    return id;
  }

  // ── Event spine + admin SSE ──────────────────────────────────────────────────
  const ccSse = new Set(); // Set<res>
  function broadcastToAdmins(type, data) {
    const payload = `data: ${JSON.stringify({ type, ...data })}\n\n`;
    ccSse.forEach(r => { try { r.write(payload); } catch {} });
  }
  function emit(ev) {
    try {
      db.prepare(`INSERT INTO platform_events (id, workspace_id, actor_type, actor_id, type, entity_type, entity_id, payload, source)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
        rid(), ev.workspace_id || null, ev.actor_type || 'admin', ev.actor_id || null, ev.type,
        ev.entity_type || null, ev.entity_id || null, ev.payload ? JSON.stringify(ev.payload) : null, ev.source || 'command-center');
    } catch (e) { console.error('emit:', e.message); }
    broadcastToAdmins('event', { event: { ...ev, ts: new Date().toISOString() } });
  }

  // ── helpers ──────────────────────────────────────────────────────────────────
  const num = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
  const safeCount = (sql, ...args) => { try { return db.prepare(sql).get(...args)?.c || 0; } catch { return 0; } };
  const safeAll = (sql, ...args) => { try { return db.prepare(sql).all(...args); } catch { return []; } };

  // ════════════════════════════════════════════════════════════════════════════
  //  AUTH
  // ════════════════════════════════════════════════════════════════════════════
  app.post('/api/cc/login', (req, res) => {
    try {
      if (!ipAllowed(req)) return res.status(403).json({ error: 'Not allowed from this network' });
      const { email, password } = req.body || {};
      const admin = db.prepare('SELECT * FROM cc_admins WHERE email = ? AND status = "active"').get(String(email || '').toLowerCase());
      if (!admin || !bcrypt.compareSync(String(password || ''), admin.password_hash)) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const token = jwt.sign({ adminId: admin.id, aud: AUD }, JWT_SECRET, { expiresIn: '12h' });
      db.prepare('UPDATE cc_admins SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(admin.id);
      ccAudit(req, { action: 'admin_login', target_type: 'admin', target_id: admin.id });
      res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.cc_role, permissions: permsFor(admin.cc_role, admin.cc_permissions) } });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/cc/me', platformAuth, (req, res) => {
    res.json({ id: req.admin.id, email: req.admin.email, name: req.admin.name, role: req.admin.cc_role, permissions: req.adminPerms });
  });

  // Step-up: re-verify password → short-lived elevated token for destructive actions.
  app.post('/api/cc/step-up', platformAuth, (req, res) => {
    try {
      const ok = bcrypt.compareSync(String(req.body?.password || ''), req.admin.password_hash);
      if (!ok) return res.status(401).json({ error: 'Invalid password' });
      const token = jwt.sign({ adminId: req.admin.id, aud: AUD, elevated: true }, JWT_SECRET, { expiresIn: '5m' });
      ccAudit(req, { action: 'admin_step_up', target_type: 'admin', target_id: req.admin.id });
      res.json({ token });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  SECTION 1 — EXECUTIVE OVERVIEW  (implied MRR; real billing is not built)
  // ════════════════════════════════════════════════════════════════════════════
  app.get('/api/cc/overview', platformAuth, (req, res) => {
    try {
      const totalWorkspaces = safeCount('SELECT COUNT(*) AS c FROM workspaces');
      const byPlan = safeAll(`SELECT COALESCE(wp.plan,'free') AS plan, COUNT(*) AS c
        FROM workspaces w LEFT JOIN workspace_plan wp ON wp.workspace_id = w.id GROUP BY plan`);
      const byStatus = safeAll(`SELECT COALESCE(status,'active') AS status, COUNT(*) AS c FROM workspaces GROUP BY status`);

      // Implied MRR — sum of monthly list price per workspace's plan. LABELLED IMPLIED.
      const price = entitlements.PLAN_MONTHLY_PRICE;
      let impliedMrr = 0;
      byPlan.forEach(r => { const p = price[r.plan]; if (p) impliedMrr += p * r.c; });

      const totals = {
        workspaces: totalWorkspaces,
        users: safeCount('SELECT COUNT(*) AS c FROM users'),
        leads: safeCount('SELECT COUNT(*) AS c FROM leads WHERE is_deleted = 0 OR is_deleted IS NULL'),
        messages: safeCount('SELECT COUNT(*) AS c FROM messages'),
        contracts: safeCount('SELECT COUNT(*) AS c FROM cs_documents'),
        galleries: safeCount('SELECT COUNT(*) AS c FROM ms_galleries'),
        bookings: safeCount('SELECT COUNT(*) AS c FROM bookings'),
        storage_bytes: (() => { try { return db.prepare('SELECT COALESCE(SUM(size_bytes),0) AS c FROM ms_assets').get().c || 0; } catch { return 0; } })(),
      };
      const ai = {
        calls: safeCount('SELECT COUNT(*) AS c FROM ai_usage'),
        cost: (() => { try { return db.prepare('SELECT COALESCE(SUM(est_cost),0) AS c FROM ai_usage').get().c || 0; } catch { return 0; } })(),
        metered: safeCount('SELECT COUNT(*) AS c FROM ai_usage') > 0,
      };
      res.json({
        revenue: { implied_mrr: impliedMrr, implied_arr: impliedMrr * 12, note: 'Implied from plan list price — real MRR requires live subscription billing (not built).' },
        workspaces: { total: totalWorkspaces, by_plan: byPlan, by_status: byStatus },
        totals, ai,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  SECTION 2 — CUSTOMER MANAGEMENT (list)
  // ════════════════════════════════════════════════════════════════════════════
  app.get('/api/cc/workspaces', platformAuth, (req, res) => {
    try {
      const { q = '', plan = '', status = '', sort = 'last_active', dir = 'desc' } = req.query;
      const limit = Math.min(num(req.query.limit, 50), 200);
      const offset = num(req.query.offset, 0);
      const where = [], params = [];
      if (q) { where.push('(w.name LIKE ? OR u.email LIKE ? OR u.business_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
      if (plan) { where.push("COALESCE(wp.plan,'free') = ?"); params.push(plan); }
      if (status) { where.push("COALESCE(w.status,'active') = ?"); params.push(status); }
      const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const sortCol = ({ last_active: 'last_active', name: 'w.name', plan: 'plan', users: 'users', leads: 'leads', storage: 'storage_bytes' })[sort] || 'last_active';
      const sortDir = dir === 'asc' ? 'ASC' : 'DESC';
      const rows = safeAll(`
        SELECT w.id, w.name, w.owner_id, COALESCE(w.status,'active') AS status,
          u.email AS owner_email, u.business_name AS owner_name,
          COALESCE(wp.plan,'free') AS plan, wp.trial_ends_at,
          (SELECT COUNT(*) FROM workspace_members m WHERE m.workspace_id = w.id) AS users,
          (SELECT COUNT(*) FROM leads l WHERE l.workspace_id = w.id AND (l.is_deleted = 0 OR l.is_deleted IS NULL)) AS leads,
          (SELECT COALESCE(SUM(a.size_bytes),0) FROM ms_assets a WHERE a.workspace_id = w.id) AS storage_bytes,
          (SELECT MAX(l.last_contacted_at) FROM leads l WHERE l.workspace_id = w.id) AS last_active
        FROM workspaces w
        LEFT JOIN users u ON u.id = w.owner_id
        LEFT JOIN workspace_plan wp ON wp.workspace_id = w.id
        ${whereSql}
        ORDER BY ${sortCol} ${sortDir}
        LIMIT ? OFFSET ?`, ...params, limit, offset);
      const total = (() => { try {
        return db.prepare(`SELECT COUNT(*) AS c FROM workspaces w LEFT JOIN users u ON u.id = w.owner_id LEFT JOIN workspace_plan wp ON wp.workspace_id = w.id ${whereSql}`).get(...params).c;
      } catch { return rows.length; } })();
      res.json({ rows, total, limit, offset });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  SECTION 3 — WORKSPACE 360
  // ════════════════════════════════════════════════════════════════════════════
  app.get('/api/cc/workspaces/:id', platformAuth, (req, res) => {
    try {
      const wid = req.params.id;
      const w = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(wid);
      if (!w) return res.status(404).json({ error: 'Workspace not found' });
      const owner = db.prepare('SELECT id, email, business_name, full_name, phone, created_at FROM users WHERE id = ?').get(w.owner_id);
      const members = safeAll('SELECT user_id, role, full_name, invite_email, invite_status FROM workspace_members WHERE workspace_id = ?', wid);
      const wp = db.prepare('SELECT * FROM workspace_plan WHERE workspace_id = ?').get(wid) || { plan: 'free' };
      const ent = entitlements.getEntitlements(db, wid, { fresh: true });
      const counts = {
        leads: safeCount('SELECT COUNT(*) AS c FROM leads WHERE workspace_id = ? AND (is_deleted=0 OR is_deleted IS NULL)', wid),
        clients: safeCount('SELECT COUNT(*) AS c FROM leads WHERE workspace_id = ? AND is_client = 1', wid),
        messages: safeCount('SELECT COUNT(*) AS c FROM messages m JOIN leads l ON l.id = m.lead_id WHERE l.workspace_id = ?', wid),
        projects: safeCount('SELECT COUNT(*) AS c FROM ms_projects WHERE workspace_id = ?', wid),
        galleries: safeCount('SELECT COUNT(*) AS c FROM ms_galleries WHERE workspace_id = ?', wid),
        contracts: safeCount('SELECT COUNT(*) AS c FROM cs_documents WHERE workspace_id = ?', wid),
        bookings: safeCount('SELECT COUNT(*) AS c FROM bookings WHERE workspace_id = ?', wid),
        invoices: safeCount('SELECT COUNT(*) AS c FROM invoices i JOIN leads l ON l.id = i.lead_id WHERE l.workspace_id = ?', wid),
        storage_bytes: (() => { try { return db.prepare('SELECT COALESCE(SUM(size_bytes),0) AS c FROM ms_assets WHERE workspace_id = ?').get(wid).c || 0; } catch { return 0; } })(),
      };
      const overrides = safeAll('SELECT * FROM entitlement_overrides WHERE workspace_id = ? AND revoked_at IS NULL ORDER BY created_at DESC', wid);
      const grace = safeAll("SELECT * FROM cc_grace_periods WHERE workspace_id = ? AND status = 'active' ORDER BY created_at DESC", wid);
      const notes = safeAll('SELECT * FROM cc_notes WHERE workspace_id = ? ORDER BY pinned DESC, created_at DESC', wid);
      const scores = db.prepare('SELECT * FROM workspace_scores WHERE workspace_id = ?').get(wid) || null;
      const activity = safeAll('SELECT * FROM platform_events WHERE workspace_id = ? ORDER BY ts DESC LIMIT 50', wid);
      res.json({
        workspace: { ...w, status: w.status || 'active' },
        owner, members,
        plan: { key: wp.plan || 'free', trial_ends_at: wp.trial_ends_at || null },
        entitlements: ent, counts, overrides, grace, notes, scores, activity,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Customer write actions (audited) ─────────────────────────────────────────
  app.post('/api/cc/workspaces/:id/suspend', platformAuth, requirePerm('manage_overrides'), (req, res) => {
    try {
      const wid = req.params.id;
      const before = db.prepare('SELECT status FROM workspaces WHERE id = ?').get(wid);
      if (!before) return res.status(404).json({ error: 'Not found' });
      db.prepare("UPDATE workspaces SET status = 'suspended' WHERE id = ?").run(wid);
      ccAudit(req, { action: 'workspace_suspend', target_type: 'workspace', target_id: wid, workspace_id: wid, before, after: { status: 'suspended' }, reason: req.body?.reason });
      emit({ workspace_id: wid, actor_id: req.admin.id, type: 'workspace_suspended', entity_type: 'workspace', entity_id: wid });
      res.json({ ok: true, status: 'suspended', note: 'Login enforcement for suspended workspaces is a follow-up rewire (see spec §6).' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/cc/workspaces/:id/restore', platformAuth, requirePerm('manage_overrides'), (req, res) => {
    try {
      const wid = req.params.id;
      db.prepare("UPDATE workspaces SET status = 'active' WHERE id = ?").run(wid);
      ccAudit(req, { action: 'workspace_restore', target_type: 'workspace', target_id: wid, workspace_id: wid, after: { status: 'active' } });
      emit({ workspace_id: wid, actor_id: req.admin.id, type: 'workspace_restored', entity_type: 'workspace', entity_id: wid });
      res.json({ ok: true, status: 'active' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/cc/workspaces/:id/notes', platformAuth, (req, res) => {
    try {
      const id = rid();
      db.prepare('INSERT INTO cc_notes (id, workspace_id, admin_id, body, pinned) VALUES (?,?,?,?,?)')
        .run(id, req.params.id, req.admin.id, String(req.body?.body || ''), req.body?.pinned ? 1 : 0);
      ccAudit(req, { action: 'note_add', target_type: 'workspace', target_id: req.params.id, workspace_id: req.params.id });
      res.json({ ok: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Change a workspace's plan tier (enforces immediately via the resolver).
  app.post('/api/cc/workspaces/:id/plan', platformAuth, requirePerm('manage_plans'), (req, res) => {
    try {
      const wid = req.params.id;
      const { plan } = req.body || {};
      if (!plan || !db.prepare('SELECT key FROM plans WHERE key = ?').get(plan)) return res.status(400).json({ error: 'Unknown plan' });
      const before = db.prepare('SELECT plan FROM workspace_plan WHERE workspace_id = ?').get(wid) || { plan: null };
      db.prepare(`INSERT INTO workspace_plan (workspace_id, plan) VALUES (?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET plan = excluded.plan, updated_at = CURRENT_TIMESTAMP`).run(wid, plan);
      entitlements.invalidate(wid);
      ccAudit(req, { action: 'workspace_plan_change', target_type: 'workspace', target_id: wid, workspace_id: wid, before, after: { plan } });
      emit({ workspace_id: wid, actor_id: req.admin.id, type: 'workspace_plan_changed', entity_type: 'workspace', entity_id: wid, payload: { plan } });
      try { broadcastToWorkspace(wid, 'plan_updated', {}); } catch {}
      res.json({ ok: true, plan });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Impersonation (read-only by default; mints a token the core `auth` accepts) ─
  app.post('/api/cc/workspaces/:id/impersonate', platformAuth, requirePerm('impersonate'), (req, res) => {
    try {
      const wid = req.params.id;
      const owner = db.prepare("SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role = 'super_admin' LIMIT 1").get(wid)
        || db.prepare('SELECT owner_id AS user_id FROM workspaces WHERE id = ?').get(wid);
      if (!owner?.user_id) return res.status(404).json({ error: 'No owner to impersonate' });
      const writeMode = req.body?.mode === 'write' && req.adminPerms.impersonate_write;
      const auditId = ccAudit(req, { action: 'impersonate_start', target_type: 'workspace', target_id: wid, workspace_id: wid, after: { mode: writeMode ? 'write' : 'read' } });
      const impId = rid();
      db.prepare('INSERT INTO cc_impersonations (id, admin_id, workspace_id, audit_id, mode, reason) VALUES (?,?,?,?,?,?)')
        .run(impId, req.admin.id, wid, auditId, writeMode ? 'write' : 'read', req.body?.reason || null);
      // Signed with the SAME secret as normal user tokens so the core `auth` accepts it; the
      // `imp` claim lets the app show a banner and tag every resulting action as impersonated.
      const token = jwt.sign({ userId: owner.user_id, imp: { admin_id: req.admin.id, audit_id: auditId, imp_id: impId, mode: writeMode ? 'write' : 'read' } }, JWT_SECRET, { expiresIn: '30m' });
      emit({ workspace_id: wid, actor_id: req.admin.id, type: 'impersonation_started', entity_type: 'workspace', entity_id: wid, payload: { mode: writeMode ? 'write' : 'read' } });
      res.json({ token, mode: writeMode ? 'write' : 'read', expires_in: 1800 });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  SECTIONS 4/5/21 — PLANS + FEATURE FLAGS  (the live toggle is here)
  // ════════════════════════════════════════════════════════════════════════════
  app.get('/api/cc/plans', platformAuth, (req, res) => {
    try {
      const plans = safeAll('SELECT * FROM plans ORDER BY sort_order');
      const out = plans.map(p => ({
        ...p,
        prices: safeAll('SELECT * FROM plan_prices WHERE plan_key = ? AND active = 1', p.key),
        limits: Object.fromEntries(safeAll('SELECT key, value FROM plan_limits WHERE plan_key = ?', p.key).map(r => [r.key, r.value])),
        features: Object.fromEntries(safeAll('SELECT feature_key, enabled FROM plan_features WHERE plan_key = ?', p.key).map(r => { try { return [r.feature_key, JSON.parse(r.enabled)]; } catch { return [r.feature_key, r.enabled]; } })),
      }));
      res.json({ plans: out });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Create a plan (config-as-data). Editing limits/features here enforces app-wide
  // immediately via the resolver (plan-info reads getEntitlements).
  app.post('/api/cc/plans', platformAuth, requirePerm('manage_plans'), (req, res) => {
    try {
      const { key, name } = req.body || {};
      if (!key) return res.status(400).json({ error: 'key required' });
      if (db.prepare('SELECT key FROM plans WHERE key = ?').get(key)) return res.status(409).json({ error: 'Plan key already exists' });
      db.prepare('INSERT INTO plans (id, key, name, status, visibility, sort_order) VALUES (?,?,?,?,?,?)').run(rid(), key, name || key, 'active', 'public', 99);
      entitlements.invalidate();
      ccAudit(req, { action: 'plan_create', target_type: 'plan', target_id: key, after: { key, name } });
      emit({ actor_id: req.admin.id, type: 'plan_created', entity_type: 'plan', entity_id: key });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Update plan meta + (optionally) replace its limits / features / prices in one call.
  app.put('/api/cc/plans/:key', platformAuth, requirePerm('manage_plans'), (req, res) => {
    try {
      const key = req.params.key;
      const plan = db.prepare('SELECT * FROM plans WHERE key = ?').get(key);
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      const { name, status, limits, features, prices } = req.body || {};
      const before = {
        name: plan.name, status: plan.status,
        limits: Object.fromEntries(safeAll('SELECT key, value FROM plan_limits WHERE plan_key = ?', key).map(r => [r.key, r.value])),
      };
      db.transaction(() => {
        if (name !== undefined || status !== undefined) {
          db.prepare('UPDATE plans SET name = COALESCE(?, name), status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP WHERE key = ?')
            .run(name ?? null, status ?? null, key);
        }
        if (limits && typeof limits === 'object') {
          db.prepare('DELETE FROM plan_limits WHERE plan_key = ?').run(key);
          const ins = db.prepare('INSERT INTO plan_limits (plan_key, key, value) VALUES (?,?,?)');
          Object.entries(limits).forEach(([k, v]) => ins.run(key, k, Number.isFinite(+v) ? Math.trunc(+v) : -1));
        }
        if (features && typeof features === 'object') {
          db.prepare('DELETE FROM plan_features WHERE plan_key = ?').run(key);
          const ins = db.prepare('INSERT INTO plan_features (plan_key, feature_key, enabled) VALUES (?,?,?)');
          Object.entries(features).forEach(([k, v]) => ins.run(key, k, JSON.stringify(v)));
        }
        if (Array.isArray(prices)) {
          db.prepare('DELETE FROM plan_prices WHERE plan_key = ?').run(key);
          const ins = db.prepare('INSERT INTO plan_prices (id, plan_key, interval, currency, amount, active) VALUES (?,?,?,?,?,1)');
          prices.forEach(p => ins.run(rid(), key, p.interval || 'month', p.currency || 'USD', Number(p.amount) || 0));
        }
      })();
      entitlements.invalidate(); // global — a plan edit affects every workspace on that plan
      ccAudit(req, { action: 'plan_update', target_type: 'plan', target_id: key, before, after: { name, status, limits } });
      emit({ actor_id: req.admin.id, type: 'plan_updated', entity_type: 'plan', entity_id: key });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/cc/flags', platformAuth, (req, res) => {
    try {
      const flags = safeAll('SELECT * FROM feature_flags ORDER BY key').map(f => ({
        ...f,
        assignments: safeAll('SELECT * FROM flag_assignments WHERE flag_key = ? ORDER BY created_at DESC', f.key),
      }));
      res.json({ flags });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/cc/flags', platformAuth, requirePerm('manage_flags'), (req, res) => {
    try {
      const { key, description = '', default_state = 0, rollout_pct = 0 } = req.body || {};
      if (!key) return res.status(400).json({ error: 'key required' });
      db.prepare('INSERT OR REPLACE INTO feature_flags (key, description, default_state, rollout_pct, status) VALUES (?,?,?,?,?)')
        .run(key, description, default_state ? 1 : 0, num(rollout_pct, 0), 'active');
      entitlements.invalidate();
      ccAudit(req, { action: 'flag_create', target_type: 'flag', target_id: key, after: { description, default_state, rollout_pct } });
      emit({ actor_id: req.admin.id, type: 'flag_created', entity_type: 'flag', entity_id: key });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put('/api/cc/flags/:key', platformAuth, requirePerm('manage_flags'), (req, res) => {
    try {
      const before = db.prepare('SELECT * FROM feature_flags WHERE key = ?').get(req.params.key);
      if (!before) return res.status(404).json({ error: 'Not found' });
      const { description = before.description, default_state = before.default_state, rollout_pct = before.rollout_pct, status = before.status } = req.body || {};
      db.prepare('UPDATE feature_flags SET description = ?, default_state = ?, rollout_pct = ?, status = ? WHERE key = ?')
        .run(description, default_state ? 1 : 0, num(rollout_pct, 0), status, req.params.key);
      entitlements.invalidate();
      ccAudit(req, { action: 'flag_update', target_type: 'flag', target_id: req.params.key, before, after: { description, default_state, rollout_pct, status } });
      emit({ actor_id: req.admin.id, type: 'flag_updated', entity_type: 'flag', entity_id: req.params.key });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // THE LIVE TOGGLE — assign a flag to global / a workspace / a user.
  app.post('/api/cc/flags/:key/assign', platformAuth, requirePerm('manage_flags'), (req, res) => {
    try {
      const { scope = 'global', scope_id = null, state = 1, starts_at = null, ends_at = null } = req.body || {};
      const flag = db.prepare('SELECT key FROM feature_flags WHERE key = ?').get(req.params.key);
      if (!flag) return res.status(404).json({ error: 'Flag not found' });
      const id = rid();
      db.prepare('INSERT INTO flag_assignments (id, flag_key, scope, scope_id, state, starts_at, ends_at, set_by) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, req.params.key, scope, scope_id, state ? 1 : 0, starts_at, ends_at, req.admin.id);
      entitlements.invalidate(scope === 'workspace' ? scope_id : undefined);
      ccAudit(req, { action: 'flag_assign', target_type: 'flag', target_id: req.params.key, workspace_id: scope === 'workspace' ? scope_id : null, after: { scope, scope_id, state } });
      emit({ workspace_id: scope === 'workspace' ? scope_id : null, actor_id: req.admin.id, type: 'flag_assigned', entity_type: 'flag', entity_id: req.params.key, payload: { scope, scope_id, state } });
      // Nudge affected workspace tabs to refresh usePlan.
      if (scope === 'workspace' && scope_id) { try { broadcastToWorkspace(scope_id, 'plan_updated', {}); } catch {} }
      res.json({ ok: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  SECTIONS 6/8/9 — OVERRIDES + GRACE PERIODS + MODULE CONTROL
  // ════════════════════════════════════════════════════════════════════════════
  app.get('/api/cc/workspaces/:id/overrides', platformAuth, (req, res) => {
    res.json({ overrides: safeAll('SELECT * FROM entitlement_overrides WHERE workspace_id = ? ORDER BY created_at DESC', req.params.id) });
  });
  app.post('/api/cc/workspaces/:id/overrides', platformAuth, requirePerm('manage_overrides'), (req, res) => {
    try {
      const { kind, key, value, reason = null, ends_at = null } = req.body || {};
      if (!kind || !key) return res.status(400).json({ error: 'kind and key required' });
      const id = rid();
      db.prepare('INSERT INTO entitlement_overrides (id, workspace_id, kind, key, value, reason, admin_id, ends_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, req.params.id, kind, key, JSON.stringify(value), reason, req.admin.id, ends_at);
      entitlements.invalidate(req.params.id);
      ccAudit(req, { action: 'override_add', target_type: 'workspace', target_id: req.params.id, workspace_id: req.params.id, after: { kind, key, value } });
      emit({ workspace_id: req.params.id, actor_id: req.admin.id, type: 'override_added', entity_type: 'workspace', entity_id: req.params.id, payload: { kind, key, value } });
      try { broadcastToWorkspace(req.params.id, 'plan_updated', {}); } catch {}
      res.json({ ok: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/cc/overrides/:id', platformAuth, requirePerm('manage_overrides'), (req, res) => {
    try {
      const o = db.prepare('SELECT * FROM entitlement_overrides WHERE id = ?').get(req.params.id);
      if (!o) return res.status(404).json({ error: 'Not found' });
      db.prepare('UPDATE entitlement_overrides SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);
      entitlements.invalidate(o.workspace_id);
      ccAudit(req, { action: 'override_revoke', target_type: 'workspace', target_id: o.workspace_id, workspace_id: o.workspace_id, before: o });
      try { broadcastToWorkspace(o.workspace_id, 'plan_updated', {}); } catch {}
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/cc/workspaces/:id/grace', platformAuth, requirePerm('manage_overrides'), (req, res) => {
    try {
      const days = num(req.body?.days, 7);
      const id = rid();
      const ends = new Date(Date.now() + days * 86400000).toISOString();
      db.prepare('INSERT INTO cc_grace_periods (id, workspace_id, days, reason, admin_id, ends_at) VALUES (?,?,?,?,?,?)')
        .run(id, req.params.id, days, req.body?.reason || null, req.admin.id, ends);
      ccAudit(req, { action: 'grace_grant', target_type: 'workspace', target_id: req.params.id, workspace_id: req.params.id, after: { days, ends_at: ends } });
      emit({ workspace_id: req.params.id, actor_id: req.admin.id, type: 'grace_granted', entity_type: 'workspace', entity_id: req.params.id, payload: { days } });
      res.json({ ok: true, id, ends_at: ends });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Module Control (§6): enable/disable a module per workspace. Disable writes a
  // kind='module' override (value false) that the moduleGate enforces; enable revokes
  // it (back to default-on / plan value). Enforced immediately via the resolver.
  app.post('/api/cc/workspaces/:id/modules/:module', platformAuth, requirePerm('manage_overrides'), (req, res) => {
    try {
      const wid = req.params.id, mod = req.params.module;
      if (!MODULE_KEYS.includes(mod)) return res.status(400).json({ error: 'Unknown module' });
      const enabled = req.body?.enabled !== false; // default true
      db.prepare("UPDATE entitlement_overrides SET revoked_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND kind = 'module' AND key = ? AND revoked_at IS NULL").run(wid, mod);
      if (!enabled) {
        db.prepare('INSERT INTO entitlement_overrides (id, workspace_id, kind, key, value, reason, admin_id) VALUES (?,?,?,?,?,?,?)')
          .run(rid(), wid, 'module', mod, JSON.stringify(false), 'module disabled via Command Center', req.admin.id);
      }
      entitlements.invalidate(wid);
      ccAudit(req, { action: 'module_toggle', target_type: 'workspace', target_id: wid, workspace_id: wid, after: { module: mod, enabled } });
      emit({ workspace_id: wid, actor_id: req.admin.id, type: 'module_toggled', entity_type: 'workspace', entity_id: wid, payload: { module: mod, enabled } });
      try { broadcastToWorkspace(wid, 'plan_updated', {}); } catch {}
      res.json({ ok: true, module: mod, enabled });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  SECTION 13/14 — LIVE EVENT STREAM + AUDIT CENTER
  // ════════════════════════════════════════════════════════════════════════════
  app.get('/api/cc/events', platformAuth, (req, res) => {
    try {
      const limit = Math.min(num(req.query.limit, 100), 500);
      const { type = '', workspace_id = '' } = req.query;
      const where = [], params = [];
      if (type) { where.push('type = ?'); params.push(type); }
      if (workspace_id) { where.push('workspace_id = ?'); params.push(workspace_id); }
      const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const events = safeAll(`SELECT * FROM platform_events ${whereSql} ORDER BY ts DESC LIMIT ?`, ...params, limit);
      // Until modules fully adopt emit(), also surface recent core audit_logs as events.
      const legacy = safeAll(`SELECT id, created_at AS ts, workspace_id, 'user' AS actor_type, user_id AS actor_id,
        action AS type, entity_type, entity_id, details AS payload, 'audit_logs' AS source FROM audit_logs ORDER BY created_at DESC LIMIT ?`, limit);
      const merged = [...events, ...legacy].sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, limit);
      res.json({ events: merged });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/cc/events/stream', platformAuth, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*', 'X-Accel-Buffering': 'no' });
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    ccSse.add(res);
    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch {} }, 25000);
    req.on('close', () => { clearInterval(hb); ccSse.delete(res); });
  });
  app.get('/api/cc/audit', platformAuth, (req, res) => {
    try {
      const limit = Math.min(num(req.query.limit, 100), 500);
      const { admin_id = '', action = '', target_type = '', workspace_id = '' } = req.query;
      const where = [], params = [];
      if (admin_id) { where.push('a.admin_id = ?'); params.push(admin_id); }
      if (action) { where.push('a.action = ?'); params.push(action); }
      if (target_type) { where.push('a.target_type = ?'); params.push(target_type); }
      if (workspace_id) { where.push('a.workspace_id = ?'); params.push(workspace_id); }
      const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const rows = safeAll(`SELECT a.*, ad.email AS admin_email FROM cc_audit a LEFT JOIN cc_admins ad ON ad.id = a.admin_id ${whereSql} ORDER BY a.created_at DESC LIMIT ?`, ...params, limit);
      res.json({ audit: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/cc/audit/:id', platformAuth, (req, res) => {
    const row = db.prepare('SELECT * FROM cc_audit WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ ...row, before: row.before ? JSON.parse(row.before) : null, after: row.after ? JSON.parse(row.after) : null });
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  SECTION 28/29 — CONFIGURATION CENTER + GLOBAL SEARCH
  // ════════════════════════════════════════════════════════════════════════════
  app.get('/api/cc/config/:namespace', platformAuth, (req, res) => {
    const rows = safeAll('SELECT key, value FROM cc_config WHERE namespace = ?', req.params.namespace);
    res.json({ namespace: req.params.namespace, config: Object.fromEntries(rows.map(r => { try { return [r.key, JSON.parse(r.value)]; } catch { return [r.key, r.value]; } })) });
  });
  app.put('/api/cc/config/:namespace', platformAuth, requirePerm('manage_plans'), (req, res) => {
    try {
      const entries = Object.entries(req.body || {});
      const up = db.prepare('INSERT OR REPLACE INTO cc_config (namespace, key, value, updated_by, updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP)');
      entries.forEach(([k, v]) => up.run(req.params.namespace, k, JSON.stringify(v), req.admin.id));
      ccAudit(req, { action: 'config_update', target_type: 'config', target_id: req.params.namespace, after: req.body });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/cc/search', platformAuth, (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) return res.json({ results: [] });
      const like = `%${q}%`;
      const results = [];
      const push = (type, rows, map) => rows.forEach(r => results.push({ type, ...map(r) }));
      push('workspace', safeAll('SELECT id, name FROM workspaces WHERE name LIKE ? LIMIT 8', like), r => ({ id: r.id, label: r.name, link: `/control/customers/${r.id}` }));
      push('user', safeAll('SELECT id, email, business_name, workspace_id FROM users WHERE email LIKE ? OR business_name LIKE ? LIMIT 8', like, like), r => ({ id: r.id, label: r.email || r.business_name, sub: r.business_name, link: r.workspace_id ? `/control/customers/${r.workspace_id}` : null }));
      push('lead', safeAll('SELECT id, customer_name, customer_phone, workspace_id FROM leads WHERE (customer_name LIKE ? OR customer_phone LIKE ?) AND (is_deleted=0 OR is_deleted IS NULL) LIMIT 8', like, like), r => ({ id: r.id, label: r.customer_name || r.customer_phone, sub: r.customer_phone, link: r.workspace_id ? `/control/customers/${r.workspace_id}` : null }));
      push('contract', safeAll('SELECT id, title, workspace_id FROM cs_documents WHERE title LIKE ? LIMIT 8', like), r => ({ id: r.id, label: r.title, link: r.workspace_id ? `/control/customers/${r.workspace_id}` : null }));
      push('project', safeAll('SELECT id, title, workspace_id FROM ms_projects WHERE title LIKE ? LIMIT 8', like), r => ({ id: r.id, label: r.title, link: r.workspace_id ? `/control/customers/${r.workspace_id}` : null }));
      res.json({ results });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  SECTIONS 10/11 — USAGE ROLLUPS + HEALTH / ADOPTION
  // ════════════════════════════════════════════════════════════════════════════
  const metering = require('./cc-metering')(db, { generateId: rid });
  try { metering.start(); } catch (e) { console.error('metering start:', e.message); }

  app.post('/api/cc/rollup/run', platformAuth, (req, res) => {
    try {
      const n = metering.runAll();
      ccAudit(req, { action: 'rollup_run', target_type: 'system', target_id: 'rollup', after: { workspaces: n } });
      res.json({ ok: true, workspaces: n });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/cc/health', platformAuth, (req, res) => {
    try {
      const sortCol = ({ churn: 's.churn', health: 's.health', expansion: 's.expansion', activity: 's.activity' })[req.query.sort] || 's.churn';
      const rows = safeAll(`SELECT w.id, w.name, COALESCE(wp.plan,'free') AS plan, COALESCE(w.status,'active') AS status,
        s.health, s.churn, s.expansion, s.activity, s.risk_factors, s.computed_at
        FROM workspaces w
        LEFT JOIN workspace_plan wp ON wp.workspace_id = w.id
        LEFT JOIN workspace_scores s ON s.workspace_id = w.id
        ORDER BY (${sortCol} IS NULL), ${sortCol} DESC`).map(r => ({ ...r, risk_factors: r.risk_factors ? JSON.parse(r.risk_factors) : [] }));
      res.json({ computed: rows.some(r => r.computed_at), rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/cc/adoption', platformAuth, (req, res) => {
    try {
      const total = safeCount('SELECT COUNT(*) AS c FROM workspaces') || 1;
      const distinct = (sql) => { try { return db.prepare(sql).get().c || 0; } catch { return 0; } };
      const modules = [
        { key: 'contracts', label: 'Contracts Studio', count: distinct('SELECT COUNT(DISTINCT workspace_id) AS c FROM cs_documents') },
        { key: 'media', label: 'Media Studio', count: distinct('SELECT COUNT(DISTINCT workspace_id) AS c FROM ms_projects') },
        { key: 'galleries', label: 'Galleries', count: distinct('SELECT COUNT(DISTINCT workspace_id) AS c FROM ms_galleries') },
        { key: 'booking', label: 'Booking', count: distinct('SELECT COUNT(DISTINCT workspace_id) AS c FROM bookings') },
        { key: 'ai', label: 'AI', count: distinct('SELECT COUNT(DISTINCT workspace_id) AS c FROM ai_usage WHERE workspace_id IS NOT NULL') },
      ].map(m => ({ ...m, pct: Math.round((m.count / total) * 100) }));
      const powerUsers = safeAll('SELECT w.id, w.name, s.health, s.expansion FROM workspace_scores s JOIN workspaces w ON w.id = s.workspace_id ORDER BY s.health DESC LIMIT 10');
      res.json({ total, modules, powerUsers });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  SECTION 25 — FOUNDER INBOX  (one feed; computed signals + persisted items)
  // ════════════════════════════════════════════════════════════════════════════
  app.get('/api/cc/inbox', platformAuth, (req, res) => {
    try {
      const items = [];
      const link = (id) => `/control/customers/${id}`;

      safeAll("SELECT id, name FROM workspaces WHERE status = 'suspended'").forEach((w) =>
        items.push({ kind: 'suspended', severity: 'high', title: `${w.name || 'Workspace'} is suspended`, workspace_id: w.id, link: link(w.id) }));

      safeAll('SELECT s.workspace_id, w.name, s.churn FROM workspace_scores s JOIN workspaces w ON w.id = s.workspace_id WHERE s.churn >= 70 ORDER BY s.churn DESC LIMIT 20').forEach((r) =>
        items.push({ kind: 'churn_risk', severity: r.churn >= 85 ? 'high' : 'medium', title: `${r.name || 'Workspace'} — churn risk ${r.churn}`, workspace_id: r.workspace_id, link: link(r.workspace_id) }));

      safeAll('SELECT s.workspace_id, w.name, s.expansion FROM workspace_scores s JOIN workspaces w ON w.id = s.workspace_id WHERE s.expansion >= 60 ORDER BY s.expansion DESC LIMIT 10').forEach((r) =>
        items.push({ kind: 'expansion', severity: 'low', title: `${r.name || 'Workspace'} — expansion opportunity (${r.expansion})`, workspace_id: r.workspace_id, link: link(r.workspace_id) }));

      try {
        const ai = db.prepare("SELECT COALESCE(SUM(est_cost),0) AS c, COUNT(*) AS n FROM ai_usage WHERE ts >= datetime('now','-7 days')").get();
        if (ai.n > 0) items.push({ kind: 'ai_cost', severity: ai.c > 5 ? 'medium' : 'info', title: `AI spend (7d): $${ai.c.toFixed(2)} across ${ai.n} calls`, link: '/control/ai' });
      } catch {}

      // Persisted, manually-flagged items
      safeAll("SELECT * FROM cc_inbox WHERE status = 'open' ORDER BY created_at DESC LIMIT 50").forEach((r) =>
        items.push({ id: r.id, kind: r.kind, severity: r.severity || 'medium', title: r.title, body: r.body, workspace_id: r.workspace_id, link: r.link, persisted: true }));

      const order = { high: 0, medium: 1, low: 2, info: 3 };
      items.sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4));
      const counts = items.reduce((m, i) => { m[i.severity] = (m[i.severity] || 0) + 1; return m; }, {});
      res.json({ items, counts, total: items.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/cc/inbox/:id/dismiss', platformAuth, (req, res) => {
    try {
      db.prepare("UPDATE cc_inbox SET status = 'dismissed' WHERE id = ?").run(req.params.id);
      ccAudit(req, { action: 'inbox_dismiss', target_type: 'inbox', target_id: req.params.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  SECTION 18 — AI CONTROL CENTER  (reads the ai_usage metering ledger)
  // ════════════════════════════════════════════════════════════════════════════
  app.get('/api/cc/ai', platformAuth, (req, res) => {
    try {
      const totals = (() => { try {
        return db.prepare(`SELECT COUNT(*) AS calls, COALESCE(SUM(est_cost),0) AS cost,
          COALESCE(SUM(prompt_tokens + completion_tokens),0) AS tokens, COALESCE(AVG(latency_ms),0) AS avg_latency,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS ok FROM ai_usage`).get();
      } catch { return { calls: 0, cost: 0, tokens: 0, avg_latency: 0, ok: 0 }; } })();
      const byProvider = safeAll('SELECT provider, COUNT(*) AS calls, COALESCE(SUM(est_cost),0) AS cost FROM ai_usage GROUP BY provider');
      const byFeature = safeAll("SELECT COALESCE(feature,'(unattributed)') AS feature, COUNT(*) AS calls, COALESCE(SUM(est_cost),0) AS cost, COALESCE(AVG(latency_ms),0) AS avg_latency FROM ai_usage GROUP BY feature ORDER BY calls DESC");
      const recent = safeAll('SELECT * FROM ai_usage ORDER BY ts DESC LIMIT 60');
      res.json({ metered: totals.calls > 0, totals, byProvider, byFeature, recent });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  SECTION 23 — EXPORT ENGINE  (full dataset, respects filters, audited)
  //  Auth via ?token= (platformAuth accepts it) so a plain download link works.
  // ════════════════════════════════════════════════════════════════════════════
  app.get('/api/cc/export', platformAuth, (req, res) => {
    try {
      const { dataset, format = 'csv' } = req.query;
      let rows = [];
      if (dataset === 'customers') {
        const where = [], params = [];
        if (req.query.q) { where.push('(w.name LIKE ? OR u.email LIKE ? OR u.business_name LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`); }
        if (req.query.plan) { where.push("COALESCE(wp.plan,'free') = ?"); params.push(req.query.plan); }
        if (req.query.status) { where.push("COALESCE(w.status,'active') = ?"); params.push(req.query.status); }
        const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
        rows = safeAll(`SELECT w.id, w.name, u.email AS owner_email, u.business_name AS owner_name,
          COALESCE(wp.plan,'free') AS plan, COALESCE(w.status,'active') AS status,
          (SELECT COUNT(*) FROM workspace_members m WHERE m.workspace_id = w.id) AS users,
          (SELECT COUNT(*) FROM leads l WHERE l.workspace_id = w.id AND (l.is_deleted = 0 OR l.is_deleted IS NULL)) AS leads,
          (SELECT COALESCE(SUM(a.size_bytes),0) FROM ms_assets a WHERE a.workspace_id = w.id) AS storage_bytes,
          (SELECT MAX(l.last_contacted_at) FROM leads l WHERE l.workspace_id = w.id) AS last_active
          FROM workspaces w LEFT JOIN users u ON u.id = w.owner_id LEFT JOIN workspace_plan wp ON wp.workspace_id = w.id
          ${whereSql} ORDER BY w.name LIMIT 10000`, ...params);
      } else if (dataset === 'health') {
        rows = safeAll(`SELECT w.id, w.name, COALESCE(wp.plan,'free') AS plan, COALESCE(w.status,'active') AS status,
          s.health, s.churn, s.expansion, s.activity, s.risk_factors
          FROM workspaces w LEFT JOIN workspace_plan wp ON wp.workspace_id = w.id LEFT JOIN workspace_scores s ON s.workspace_id = w.id
          ORDER BY (s.churn IS NULL), s.churn DESC LIMIT 10000`).map((r) => ({ ...r, risk_factors: (() => { try { return JSON.parse(r.risk_factors || '[]').join('; '); } catch { return ''; } })() }));
      } else if (dataset === 'audit') {
        rows = safeAll('SELECT a.created_at, ad.email AS admin_email, a.action, a.target_type, a.target_id, a.workspace_id, a.reason, a.ip FROM cc_audit a LEFT JOIN cc_admins ad ON ad.id = a.admin_id ORDER BY a.created_at DESC LIMIT 10000');
      } else if (dataset === 'ai_usage') {
        rows = safeAll('SELECT ts, workspace_id, feature, provider, model, prompt_tokens, completion_tokens, latency_ms, est_cost, success FROM ai_usage ORDER BY ts DESC LIMIT 10000');
      } else {
        return res.status(400).json({ error: 'Unknown dataset' });
      }
      ccAudit(req, { action: 'export', target_type: 'dataset', target_id: dataset, after: { format, count: rows.length } });
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${dataset}-${stamp}.json"`);
        return res.send(JSON.stringify(rows, null, 2));
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${dataset}-${stamp}.csv"`);
      return res.send(toCSV(rows));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Mounted sub-modules (additive; share the platform auth/audit/event seams) ─
  //  Database Explorer + SQL console, Support ops, Time Machine, Report engine.
  const ccDeps = { db, platformAuth, requirePerm, ccAudit, emit, rid, safeAll, safeCount, broadcastToWorkspace, sendEmail: deps.sendEmail, entitlements };
  try { require('./cc-explorer')(app, ccDeps); } catch (e) { console.error('cc-explorer mount:', e.message); }
  try { require('./cc-support')(app, ccDeps); } catch (e) { console.error('cc-support mount:', e.message); }
  try { require('./cc-timemachine')(app, ccDeps); } catch (e) { console.error('cc-timemachine mount:', e.message); }
  try {
    const reportsApi = require('./cc-reports')(app, ccDeps);
    if (reportsApi && typeof reportsApi.runDue === 'function') {
      let cron = null; try { cron = require('node-cron'); } catch {}
      if (cron) { try { cron.schedule('0 3 * * *', () => { try { reportsApi.runDue(); } catch (e) { console.error('reports runDue:', e.message); } }); } catch {} }
    }
  } catch (e) { console.error('cc-reports mount:', e.message); }

  // ── Grace-period auto-expiry ─────────────────────────────────────────────────
  // Elapsed grace windows flip active → expired so suspension/limit enforcement
  // resumes. Runs once on boot (catches missed schedules across restarts) + nightly.
  function sweepExpiredGrace() {
    try {
      const r = db.prepare("UPDATE cc_grace_periods SET status = 'expired' WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at < CURRENT_TIMESTAMP").run();
      if (r.changes > 0) console.log(`⏳ Command Center: expired ${r.changes} grace period(s)`);
    } catch (e) { console.error('grace sweep:', e.message); }
  }
  try { sweepExpiredGrace(); } catch {}
  try {
    let cron = null; try { cron = require('node-cron'); } catch {}
    if (cron) { cron.schedule('5 3 * * *', sweepExpiredGrace); }
  } catch (e) { console.error('grace cron:', e.message); }

  console.log('🛡️  Command Center mounted at /api/cc/* (+ explorer/support/timemachine/reports)');
  return { platformAuth, emit, ccAudit, ensureSchema };
};

// Exposed for scripts/cc-create-admin.js
module.exports.ensureSchema = ensureSchema;
module.exports.createOrUpdateAdmin = createOrUpdateAdmin;
module.exports.CC_ROLE_PERMISSIONS = CC_ROLE_PERMISSIONS;
module.exports.toCSV = toCSV;
