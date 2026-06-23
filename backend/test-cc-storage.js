// Phase 10 CC storage dashboard test — no server boot. Run: node test-cc-storage.js
const Database = require('better-sqlite3');
const express = require('express');
const ccStorage = require('./cc-storage');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE ms_assets (id TEXT PRIMARY KEY, workspace_id TEXT, project_id TEXT, type TEXT, storage_provider TEXT, storage_size INTEGER, deleted_at TIMESTAMP, uploaded_at TIMESTAMP, filename TEXT);
  CREATE TABLE ms_projects (id TEXT PRIMARY KEY, workspace_id TEXT, title TEXT);
  CREATE TABLE ms_galleries (id TEXT PRIMARY KEY, workspace_id TEXT, title TEXT);
  CREATE TABLE ms_gallery_assets (gallery_id TEXT, asset_id TEXT);
`);
db.prepare("INSERT INTO ms_projects VALUES ('p1','ws1','Wedding')").run();
const GB = 1024 ** 3;
// ws1: 20GB on r2 (1 photo 20GB-ish via a big video), ws2: 5GB local
db.prepare("INSERT INTO ms_assets VALUES ('a1','ws1','p1','video','r2',?,NULL,datetime('now'),'big.mp4')").run(20 * GB);
db.prepare("INSERT INTO ms_assets VALUES ('a2','ws1','p1','photo','r2',?,NULL,datetime('now'),'p.jpg')").run(5 * 1e6);
db.prepare("INSERT INTO ms_assets VALUES ('a3','ws2',NULL,'photo','local',?,NULL,datetime('now','-60 days'),'old.jpg')").run(5 * GB);
db.prepare("INSERT INTO ms_assets VALUES ('a4','ws1','p1','photo','r2',?,datetime('now'),datetime('now'),'deleted.jpg')").run(99 * GB); // deleted → excluded

const app = express();
const platformAuth = (req, res, next) => next();
const entitlements = { getEntitlements: () => ({ limits: { storage_gb: 50 } }) };
ccStorage(app, { db, platformAuth, safeAll: (sql, ...a) => db.prepare(sql).all(...a), entitlements });

let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.error('  ✗', m); } else console.log('  ✓', m); };

(async () => {
  const srv = app.listen(0); await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const get = async (p) => (await fetch(base + p)).json();

  console.log('\n[1] Founder overview');
  const ov = await get('/api/cc/storage/overview');
  ok(ov.by_provider.length === 2, 'split by provider (r2 + local)');
  ok(ov.r2_gb >= 20 && ov.r2_gb < 21, 'r2 usage ~20GB (excludes deleted)');
  ok(ov.est_monthly_cost_usd === +((20.0046575 - 10) * 0.015).toFixed(2) || Math.abs(ov.est_monthly_cost_usd - 0.15) < 0.02, 'cost = (R2 GB − 10 free) × $0.015');
  ok(ov.growth_30d_bytes > 0, 'monthly growth tracked');

  console.log('\n[2] Top workspaces');
  const tw = await get('/api/cc/storage/workspaces');
  ok(tw.workspaces[0].workspace_id === 'ws1', 'largest workspace first (ws1)');
  ok(tw.workspaces.length === 2, 'both workspaces listed (deleted excluded)');

  console.log('\n[3] Per-workspace drilldown');
  const d = await get('/api/cc/storage/workspace/ws1');
  ok(d.limit_gb === 50, 'plan limit from entitlements');
  ok(d.pct_used !== null && d.pct_used >= 40, 'percent-used computed (≈40% of 50GB)');
  ok(d.largest_projects[0].id === 'p1', 'largest project listed');
  ok(d.largest_videos[0].filename === 'big.mp4', 'largest video listed');

  console.log(`\n${fails === 0 ? '✅ ALL CC-STORAGE CHECKS PASSED' : '❌ ' + fails + ' FAILED'}\n`);
  srv.close(() => { try { db.close(); } catch {} process.exit(fails ? 1 : 0); });
})();
