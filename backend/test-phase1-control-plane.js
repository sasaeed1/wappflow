// Phase-1 control-plane regression test — exercises the wiring WITHOUT booting
// server.js (so the WhatsApp service / loadAccounts is never started).
// Run: node test-phase1-control-plane.js
const Database = require('better-sqlite3');
const express = require('express');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE IF NOT EXISTS workspace_plan (workspace_id TEXT PRIMARY KEY, plan TEXT, features TEXT, limits TEXT, trial_ends_at TEXT);
  CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, status TEXT DEFAULT 'active');
`);

let fails = 0;
function assert(c, m) { if (!c) { fails++; console.error('  ✗ FAIL:', m); } else console.log('  ✓', m); }

console.log('\n[1] Entitlements resolver + sold-but-unbuilt guard');
const entitlements = require('./entitlements');
entitlements.ensureSchema(db);
db.prepare("INSERT INTO workspace_plan (workspace_id, plan) VALUES ('ws1','studio_plus')").run();
const ent = entitlements.getEntitlements(db, 'ws1', { fresh: true });
assert(ent.plan === 'studio_plus', 'studio_plus resolves');
assert(ent.features.media_studio === true, 'real feature (media_studio) stays ON');
assert(ent.features.local_ai === true, 'built feature (local_ai) stays ON');
assert(ent.features.style_profiles === false, 'style_profiles forced OFF (unbuilt)');
assert(ent.features.story_engine === false, 'story_engine forced OFF (unbuilt)');
assert(ent.features.reel_engine === false, 'reel_engine forced OFF (unbuilt)');
assert(ent.features.ai_editing === false, 'ai_editing forced OFF (unbuilt)');
assert(ent.features.desktop_sync === false, 'desktop_sync forced OFF (unbuilt)');
assert(ent.sources.style_profiles === 'unbuilt', 'unbuilt source tagged');

console.log('\n[2] Catalog hides unbuilt features (no selling vapor)');
const plans = entitlements.getAllPlans(db);
const sp = plans.find(p => p.key === 'studio_plus');
assert(sp && !('style_profiles' in sp.features), 'catalog omits style_profiles');
assert(sp && !('reel_engine' in sp.features), 'catalog omits reel_engine');
assert(sp && !('story_engine' in sp.features), 'catalog omits story_engine');
assert(sp && sp.features.media_studio === true, 'catalog keeps media_studio');

console.log('\n[3] Command Center schema (ai_usage + grace)');
const cc = require('./command-center');
cc.ensureSchema(db);
const aiCols = db.prepare('PRAGMA table_info(ai_usage)').all().map(c => c.name);
const need = ['id','workspace_id','user_id','feature','provider','model','prompt_tokens','completion_tokens','latency_ms','est_cost','success'];
assert(need.every(c => aiCols.includes(c)), 'ai_usage has all metering columns');
const gCols = db.prepare('PRAGMA table_info(cc_grace_periods)').all().map(c => c.name);
assert(gCols.includes('status') && gCols.includes('ends_at'), 'cc_grace_periods has status + ends_at');

console.log('\n[4] Grace auto-expiry sweep query');
db.prepare("INSERT INTO cc_grace_periods (id, workspace_id, days, ends_at, status) VALUES ('g1','ws1',1, datetime('now','-1 day'),'active')").run();
db.prepare("INSERT INTO cc_grace_periods (id, workspace_id, days, ends_at, status) VALUES ('g2','ws1',5, datetime('now','+5 day'),'active')").run();
const swept = db.prepare("UPDATE cc_grace_periods SET status='expired' WHERE status='active' AND ends_at IS NOT NULL AND ends_at < CURRENT_TIMESTAMP").run();
assert(swept.changes === 1, 'only the elapsed grace window expires');
assert(db.prepare("SELECT status FROM cc_grace_periods WHERE id='g2'").get().status === 'active', 'future grace stays active');

console.log('\n[5] AI metering hook on the failover engine');
const ai = require('./ai-engine');
assert(typeof ai.setMeter === 'function', 'ai-engine exports setMeter');
ai.setMeter(() => {});
assert(true, 'setMeter accepts a function without throwing');

console.log('\n[6] Track-0 model_version: no drift + ledger invalidation on version bump');
const intel = require('./analyzers')(db, { generateId: () => 'id-' + Math.random().toString(36).slice(2) });
intel.ensureSchema(db);
assert(intel.ANALYZERS.technical.modelVersion === 'tech-v1', 'technical registry version is tech-v1');
const A = 'asset-x';
assert(intel.needsAnalysis(A, 'vision') === true, 'never-analyzed asset needs analysis');
intel.markAnalyzed(A, 'vision', 'vision-OLD', 'desktop');
assert(intel.needsAnalysis(A, 'vision') === true, 'stale model_version → ledger invalidated (re-analyze)');
intel.markAnalyzed(A, 'vision', intel.ANALYZERS.vision.modelVersion, 'desktop');
assert(intel.needsAnalysis(A, 'vision') === false, 'current model_version → no re-analyze');

console.log('\n[7] Command Center mounts on a real Express app (submodule requires resolve)');
const app = express();
let mountErr = null;
try {
  require('./command-center')(app, db, {
    generateId: () => 'id-' + Math.random().toString(36).slice(2),
    broadcastToWorkspace: () => {}, broadcastToUser: () => {}, logAudit: () => {},
    JWT_SECRET: 'test', sendEmail: async () => ({ skipped: true }),
  });
} catch (e) { mountErr = e; }
assert(!mountErr, 'command-center mounts without throwing' + (mountErr ? ' — ' + mountErr.message : ''));

console.log(`\n${fails === 0 ? '✅ ALL PHASE-1 CHECKS PASSED' : '❌ ' + fails + ' CHECK(S) FAILED'}\n`);
process.exit(fails === 0 ? 0 : 1);
