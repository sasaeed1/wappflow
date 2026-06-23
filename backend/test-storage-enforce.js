'use strict';
// Verifies storage-enforce.js (gate + threshold warnings) and the new cc-storage.js
// founder analytics (by-plan, fastest-growing, growth-rate, projection). In-memory DB.
const Database = require('better-sqlite3');
const assert = (c, m) => { if (!c) { console.log('✗ FAIL:', m); process.exitCode = 1; throw new Error(m); } console.log('  ✓', m); };

const GB = 1024 ** 3;
const db = new Database(':memory:');

// minimal schema the modules touch
db.exec(`
  CREATE TABLE ms_assets (id TEXT PRIMARY KEY, workspace_id TEXT, project_id TEXT, type TEXT,
    storage_provider TEXT DEFAULT 'local', storage_size INTEGER, size_bytes INTEGER,
    filename TEXT, deleted_at TIMESTAMP, uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE ms_exports (id TEXT PRIMARY KEY, workspace_id TEXT, size_bytes INTEGER);
  CREATE TABLE ms_projects (id TEXT PRIMARY KEY, workspace_id TEXT, title TEXT);
  CREATE TABLE ms_galleries (id TEXT PRIMARY KEY, workspace_id TEXT, title TEXT, project_id TEXT);
  CREATE TABLE ms_gallery_assets (gallery_id TEXT, asset_id TEXT);
  CREATE TABLE workspace_plan (workspace_id TEXT PRIMARY KEY, plan TEXT, updated_at TIMESTAMP);
  CREATE TABLE pricing_config (key TEXT PRIMARY KEY, value TEXT);
`);

const entitlements = require('./entitlements');
try { entitlements.ensureSchema(db); } catch (e) { console.log('entitlements schema note:', e.message); }
try { entitlements.invalidate && entitlements.invalidate(); } catch {}

const WS = 'ws_creator';
db.prepare("INSERT INTO workspace_plan (workspace_id, plan) VALUES (?, 'creator')").run(WS); // Creator = 50 GB

// sanity: entitlements should resolve a finite storage limit for Creator
const ent = entitlements.getEntitlements(db, WS);
const limitGb = ent && ent.limits ? ent.limits.storage_gb : null;
console.log('  · resolved Creator storage_gb =', limitGb);
assert(limitGb && limitGb > 0 && limitGb !== -1, 'Creator plan resolves a finite storage_gb limit');

const se = require('./storage-enforce');
se.ensureSchema(db);

let aid = 0;
function addAsset(gb, provider = 'local', daysAgo = 0) {
  const id = 'a' + (++aid);
  db.prepare(`INSERT INTO ms_assets (id, workspace_id, type, storage_provider, storage_size, uploaded_at)
    VALUES (?,?, 'photo', ?, ?, datetime('now', ?))`).run(id, WS, provider, Math.round(gb * GB), `-${daysAgo} days`);
  return id;
}

console.log('\n[1] levelFor thresholds');
assert(se.levelFor(0, -1).level === 'unlimited', 'limit -1 → unlimited');
assert(se.levelFor(79, 100).level === 'ok', '79% → ok');
assert(se.levelFor(80, 100).level === 'warn', '80% → warn');
assert(se.levelFor(90, 100).level === 'critical', '90% → critical');
assert(se.levelFor(100, 100).level === 'reached', '100% → reached');
assert(se.levelFor(120, 100).level === 'reached', 'over → reached');

console.log('\n[2] status reflects live bytes');
addAsset(20); // 20 GB on a 50 GB plan = 40%
let st = se.status(db, WS);
assert(Math.round(st.used_gb) === 20, 'used_gb ≈ 20');
assert(st.level === 'ok', '40% → ok');
assert(!st.unlimited, 'Creator is not unlimited');

console.log('\n[3] gate allows under-limit, blocks over-limit');
let g = se.gate(db, WS, 5 * GB); // 20+5=25 GB, under 50
assert(g.allowed === true, 'upload that stays under limit is allowed');
g = se.gate(db, WS, 40 * GB); // 20+40=60 GB, over 50
assert(g.allowed === false, 'upload that would exceed limit is blocked');

console.log('\n[4] warn fires once per threshold crossing (dedup)');
const fired = [];
const notify = (ws, n) => fired.push(n.title);
se.warn(db, WS, notify); // at 40% → ok, no fire
assert(fired.length === 0, 'no warning at 40%');
addAsset(21); // now 41 GB = 82% → warn
se.warn(db, WS, notify);
assert(fired.length === 1 && /80%/.test(fired[0]), 'fires 80% warning once when crossing into warn band');
se.warn(db, WS, notify); // still 82% → no re-fire
assert(fired.length === 1, 'does not re-fire while staying in the same band (dedup)');
addAsset(4); // now 45 GB = 90% → critical
se.warn(db, WS, notify);
assert(fired.length === 2 && /90%/.test(fired[1]), 'fires 90% critical when crossing up');
addAsset(6); // now 51 GB = over → reached
se.warn(db, WS, notify);
assert(fired.length === 3 && /limit reached/i.test(fired[2]), 'fires limit-reached at 100%');
se.warn(db, WS, notify);
assert(fired.length === 3, 'no further fire once at reached');

console.log('\n[5] gate blocks once at/over the limit');
g = se.gate(db, WS, 1);
assert(g.allowed === false, 'any new upload blocked once over the limit');

console.log('\n[6] enforcement master-switch OFF → never blocks');
db.prepare("INSERT OR REPLACE INTO pricing_config (key, value) VALUES ('enforcement','off')").run();
g = se.gate(db, WS, 100 * GB);
assert(g.allowed === true, 'enforcement off → upload allowed even over limit');
db.prepare("INSERT OR REPLACE INTO pricing_config (key, value) VALUES ('enforcement','on')").run();

console.log('\n[7] unlimited plan (Enterprise) never blocks');
const WS2 = 'ws_ent';
db.prepare("INSERT INTO workspace_plan (workspace_id, plan) VALUES (?, 'enterprise')").run(WS2);
try { entitlements.invalidate && entitlements.invalidate(); } catch {}
const ent2 = entitlements.getEntitlements(db, WS2);
console.log('  · Enterprise storage_gb =', ent2.limits.storage_gb);
db.prepare(`INSERT INTO ms_assets (id, workspace_id, type, storage_provider, storage_size, uploaded_at)
  VALUES ('big', ?, 'photo', 'r2', ?, CURRENT_TIMESTAMP)`).run(WS2, 5000 * GB);
g = se.gate(db, WS2, 1000 * GB);
assert(g.allowed === true, 'Enterprise (unlimited) upload allowed');
const st2 = se.warn(db, WS2, notify);
assert(st2 === null, 'unlimited plan never warns');

console.log('\n[8] cc-storage founder analytics (by-plan, fastest-growing, growth-rate, projection)');
// fake express app capturing route handlers
const routes = {};
const cap = (m) => (p, ...h) => { routes[m + ' ' + p] = h[h.length - 1]; };
const fakeApp = { get: cap('GET'), post: cap('POST') };
require('./cc-storage')(fakeApp, { db, platformAuth: (req, res, next) => next(), entitlements });
const run = (key, params = {}) => new Promise((resolve) => {
  const res = { json: (o) => resolve({ status: 200, body: o }), status: (s) => ({ json: (o) => resolve({ status: s, body: o }) }) };
  routes[key]({ params }, res);
});

(async () => {
  const ov = await run('GET /api/cc/storage/overview');
  assert(ov.body.growth_rate_gb_per_day != null, 'overview exposes growth_rate_gb_per_day');
  assert(ov.body.projected_30d_bytes >= ov.body.total_bytes, 'projected_30d_bytes ≥ total');
  assert(ov.body.projected_monthly_cost_usd != null, 'overview exposes projected_monthly_cost_usd');

  const byPlan = await run('GET /api/cc/storage/by-plan');
  assert(Array.isArray(byPlan.body.by_plan) && byPlan.body.by_plan.length >= 1, 'by-plan returns rows');
  const plans = byPlan.body.by_plan.map(r => r.plan);
  assert(plans.includes('creator') && plans.includes('enterprise'), 'by-plan splits creator + enterprise');

  const fast = await run('GET /api/cc/storage/fastest-growing');
  assert(Array.isArray(fast.body.workspaces), 'fastest-growing returns a workspace list');

  const drill = await run('GET /api/cc/storage/workspace/:id', { id: WS });
  assert(drill.body.limit_gb && drill.body.pct_used != null, 'per-workspace drilldown has limit + pct');

  console.log('\n✅ ALL STORAGE-ENFORCE + CC-STORAGE CHECKS PASSED');
  process.exit(0);
})();
