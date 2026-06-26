'use strict';
// Verifies style AUTO-APPLY: the pure styleAdjust grade, the reel renderer baking the
// house-style grade onto clips, and the per-asset style-suggestions endpoint.
const Database = require('better-sqlite3');
const styleApply = require('./style-apply');
const assert = (c, m) => { if (!c) { console.log('✗ FAIL:', m); process.exitCode = 1; throw new Error(m); } console.log('  ✓', m); };

console.log('[1] styleAdjust (pure)');
let r = styleApply.styleAdjust({ exposure: 0.3, contrast: 0.4, colourfulness: 0.3 }, { exposure: 0.55, contrast: 0.5, colourfulness: 0.6 });
assert(r.adjust.brightness > 0 && r.adjust.saturation > 0, 'under-target measures → positive brightness/saturation nudge');
r = styleApply.styleAdjust({ exposure: 0.9 }, { exposure: 0.5 });
assert(r.adjust.brightness < 0 && r.adjust.brightness >= -0.5, 'over-target → negative, clamped to -0.5');
assert(styleApply.styleAdjust({ exposure: 0.5, contrast: 0.5, colourfulness: 0.5 }, { exposure: 0.5, contrast: 0.5, colourfulness: 0.5 }).style_match === 1, 'on-style → style_match 1');
assert(styleApply.styleAdjust({}, {}).style_match === null, 'no data → null match (not 0)');
assert(!styleApply.hasGrade({ brightness: 0, contrast: 0, saturation: 0 }) && styleApply.hasGrade({ brightness: 0.2 }), 'hasGrade detects a non-zero grade');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE ms_projects (id TEXT PRIMARY KEY, workspace_id TEXT, title TEXT);
  CREATE TABLE ms_assets (id TEXT PRIMARY KEY, workspace_id TEXT, project_id TEXT, type TEXT, deleted_at TIMESTAMP);
  CREATE TABLE ms_asset_scores (asset_id TEXT, score_type TEXT, value REAL, reasons TEXT);
  CREATE TABLE ms_cull_decisions (workspace_id TEXT, user_id TEXT, asset_id TEXT, decision TEXT, rating INTEGER);
  CREATE TABLE style_profiles (id TEXT PRIMARY KEY, workspace_id TEXT, scope TEXT, scope_id TEXT, profile TEXT, confidence REAL, sample_n INTEGER, updated_at TIMESTAMP);
  CREATE TABLE creator_brain (workspace_id TEXT, user_id TEXT, key TEXT, value TEXT, confidence REAL, updated_at TIMESTAMP, PRIMARY KEY(workspace_id,user_id,key));
  CREATE TABLE ms_timelines (id TEXT PRIMARY KEY, workspace_id TEXT, project_id TEXT, name TEXT, source TEXT, aspect_ratio TEXT, width INTEGER, height INTEGER, fps INTEGER, duration_ms INTEGER, document TEXT, status TEXT, created_by TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE ms_video_exports (id TEXT PRIMARY KEY, workspace_id TEXT, timeline_id TEXT, project_id TEXT, preset TEXT, width INTEGER, height INTEGER, fps INTEGER, quality INTEGER, status TEXT DEFAULT 'pending', progress INTEGER, storage_key TEXT, size_bytes INTEGER, error_message TEXT, created_by TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, finished_at TIMESTAMP);
  CREATE TABLE ms_jobs (id TEXT PRIMARY KEY, workspace_id TEXT, type TEXT, asset_id TEXT, project_id TEXT, status TEXT, payload TEXT);
`);
const WS = 'ws1', PROJ = 'p1';
db.prepare("INSERT INTO ms_projects (id, workspace_id, title) VALUES (?,?, 'Wedding')").run(PROJ, WS);
const addScore = db.prepare('INSERT INTO ms_asset_scores (asset_id, score_type, value, reasons) VALUES (?,?,?,?)');
for (let i = 1; i <= 8; i++) {
  const id = 'a' + i;
  db.prepare("INSERT INTO ms_assets (id, workspace_id, project_id, type) VALUES (?,?,?, 'photo')").run(id, WS, PROJ);
  // each asset is a bit under the house style (so a positive grade is expected)
  addScore.run(id, 'aesthetic', 0.5 + i * 0.04, JSON.stringify({ exposure: 0.35, contrast: 0.4, colourfulness: 0.3 }));
  addScore.run(id, 'hero', 0.3 + i * 0.07, null);
  addScore.run(id, 'composition', 0.5, null);
  addScore.run(id, 'scene_class', 0.6, JSON.stringify({ label: i <= 4 ? 'portrait' : 'scene' }));
  db.prepare("INSERT INTO ms_cull_decisions (workspace_id, user_id, asset_id, decision, rating) VALUES (?,?,?, 'keep', 4)").run(WS, 'u1', id);
}
// the learned house style: brighter/more colourful than these assets
db.prepare("INSERT INTO style_profiles (id, workspace_id, scope, scope_id, profile, confidence, sample_n) VALUES (?,?,?,?,?,?,?)")
  .run('sp1', WS, 'workspace', WS, JSON.stringify({ exposure: 0.55, contrast: 0.5, colourfulness: 0.6, composition: 0.5 }), 0.8, 50);

const routes = {};
const cap = (m) => (p, ...h) => { routes[m + ' ' + p] = h[h.length - 1]; };
const app = { post: cap('POST'), get: cap('GET') };
const gen = () => 'id_' + Math.random().toString(16).slice(2, 10);
require('./brains')(app, db, { auth: (q, s, n) => n && n(), generateId: gen });
require('./reel-engine')(app, db, { auth: (q, s, n) => n && n(), generateId: gen, logAudit: () => {} });
const call = (key, body = {}) => new Promise((resolve) => {
  const res = { status: (s) => ({ json: (o) => resolve({ status: s, body: o }) }), json: (o) => resolve({ status: 200, body: o }) };
  routes[key]({ params: { id: PROJ }, workspaceId: WS, userId: 'u1', body }, res);
});

(async () => {
  console.log('\n[2] reel render auto-applies the house style to clips');
  const rr = await call('POST /api/media/projects/:id/reel-render', { title: 'Reel', target_count: 8 });
  assert(rr.status === 202 && rr.body.auto_style === true, 'reel-render reports auto_style applied');
  const tl = db.prepare('SELECT document FROM ms_timelines WHERE id = ?').get(rr.body.timeline_id);
  const doc = JSON.parse(tl.document);
  const vclips = doc.tracks.find(t => t.type === 'video').clips;
  const graded = vclips.filter(c => c.color && (c.color.brightness || c.color.saturation));
  assert(graded.length === vclips.length, 'every clip got a style colour grade');
  assert(graded.every(c => c.color.brightness > 0), 'grade brightens toward the (brighter) house style');

  console.log('\n[3] style-suggestions endpoint (per-asset match + adjust)');
  const ss = await call('GET /api/media/projects/:id/style-suggestions');
  assert(ss.status === 200 && Array.isArray(ss.body.suggestions) && ss.body.suggestions.length === 8, 'suggestions for all 8 assets');
  assert(ss.body.suggestions.every(s => s.style_match != null && s.adjust), 'each suggestion has a match score + adjust grade');
  assert(ss.body.style && ss.body.style.exposure != null, 'returns the house-style target');

  console.log('\n[4] auto_style:false opts out');
  const rr2 = await call('POST /api/media/projects/:id/reel-render', { target_count: 6, auto_style: false });
  const doc2 = JSON.parse(db.prepare('SELECT document FROM ms_timelines WHERE id = ?').get(rr2.body.timeline_id).document);
  assert(rr2.body.auto_style === false && doc2.tracks.find(t => t.type === 'video').clips.every(c => !c.color), 'auto_style:false → no grade');

  console.log('\n✅ ALL STYLE-APPLY CHECKS PASSED');
  process.exit(0);
})().catch(e => { console.log('ERROR', e); process.exit(1); });
