'use strict';
// Verifies the AI auto-edit-to-house-style endpoint: it grades each photo toward the
// learned style_profiles and applies a real edit via the existing edit pipeline
// (ms_assets.edits + render_edits job). Mounts media-studio with the worker OFF.
const Database = require('better-sqlite3');
const assert = (c, m) => { if (!c) { console.log('✗ FAIL:', m); process.exitCode = 1; throw new Error(m); } console.log('  ✓', m); };

const db = new Database(':memory:');
const routes = {};
const cap = (m) => (p, ...h) => { routes[m + ' ' + p] = h[h.length - 1]; };
const app = { get: cap('GET'), post: cap('POST'), put: cap('PUT'), delete: cap('DELETE'), patch: cap('PATCH'), use: () => {} };

// Mount media-studio (creates the ms_* schema); worker OFF so no background loop.
require('./media-studio')(app, db, {
  auth: (q, s, n) => n && n(), generateId: () => 'id_' + Math.random().toString(16).slice(2, 10),
  logAudit: () => {}, broadcastToWorkspace: () => {}, startWorker: false,
});
// style_profiles is owned by brains.js; create it here for the test.
db.exec(`CREATE TABLE IF NOT EXISTS style_profiles (id TEXT PRIMARY KEY, workspace_id TEXT, scope TEXT, scope_id TEXT, profile TEXT, confidence REAL, sample_n INTEGER, updated_at TIMESTAMP);`);

const WS = 'ws1', PROJ = 'p1';
db.prepare("INSERT INTO ms_projects (id, workspace_id, title) VALUES (?,?, 'Wedding')").run(PROJ, WS);
const addScore = db.prepare('INSERT INTO ms_asset_scores (asset_id, workspace_id, score_type, value, reasons) VALUES (?,?,?,?,?)');
for (let i = 1; i <= 6; i++) {
  const id = 'a' + i;
  db.prepare("INSERT INTO ms_assets (id, workspace_id, project_id, type, storage_key, filename, status) VALUES (?,?,?, 'photo', ?, ?, 'ready')").run(id, WS, PROJ, `media/${id}.jpg`, `${id}.jpg`);
  // measured look UNDER the (brighter/more colourful) house style → expect a positive grade
  addScore.run(id, WS, 'aesthetic', 0.6, JSON.stringify({ exposure: 0.35, contrast: 0.4, colourfulness: 0.3 }));
  db.prepare("INSERT INTO ms_cull_decisions (id, workspace_id, project_id, asset_id, user_id, decision) VALUES (?,?,?,?, 'u1', 'keep')").run('c' + i, WS, PROJ, id);
}

function call(body = {}) {
  return new Promise((resolve) => {
    const res = { status: (s) => ({ json: (o) => resolve({ status: s, body: o }) }), json: (o) => resolve({ status: 200, body: o }) };
    routes['POST /api/media/projects/:id/auto-edit']({ params: { id: PROJ }, workspaceId: WS, userId: 'u1', body }, res);
  });
}

(async () => {
  console.log('[1] no house style yet → 400 (nothing to grade toward)');
  let r = await call({});
  assert(r.status === 400 && /house style/i.test(r.body.error), 'rejects when no style_profile exists');

  // learn a house style: brighter + more colourful than the assets
  db.prepare("INSERT INTO style_profiles (id, workspace_id, scope, scope_id, profile, confidence, sample_n) VALUES (?,?,?,?,?,?,?)")
    .run('sp1', WS, 'workspace', WS, JSON.stringify({ exposure: 0.55, contrast: 0.5, colourfulness: 0.6, composition: 0.5 }), 0.8, 40);

  console.log('\n[2] auto-edit all photos → real edits queued via the pipeline');
  r = await call({});
  assert(r.status === 202 && r.body.queued === 6, `queued an edit for all 6 photos (queued=${r.body.queued})`);
  const edited = db.prepare("SELECT id, edits FROM ms_assets WHERE project_id = ? AND edits IS NOT NULL").all(PROJ);
  assert(edited.length === 6, 'all 6 ms_assets now carry edit params');
  const e0 = JSON.parse(edited[0].edits);
  assert(e0.exposure > 0 && e0.rev === 1, 'edit brightens toward the house style (exposure>0) at rev 1');
  assert(['exposure', 'contrast', 'saturation'].every(k => k in e0 ? Math.abs(e0[k]) <= 1 : true), 'edit params are valid (within -1..1)');
  const jobs = db.prepare("SELECT COUNT(*) n FROM ms_jobs WHERE type = 'render_edits'").get().n;
  assert(jobs === 6, 'a render_edits job was enqueued per photo');

  console.log('\n[3] keepers scope + idempotent rev bump');
  r = await call({ keepers: true });
  assert(r.status === 202 && r.body.queued === 6, 'keepers:true scopes to kept photos (all 6 kept)');
  const e0b = JSON.parse(db.prepare("SELECT edits FROM ms_assets WHERE id = 'a1'").get().edits);
  assert(e0b.rev === 2, 're-running bumps the rev (cache-busts the render)');

  console.log('\n[4] explicit asset_ids scope');
  r = await call({ asset_ids: ['a1', 'a2'] });
  assert(r.status === 202 && r.body.queued === 2, 'explicit asset_ids limits the scope to 2');

  console.log('\n✅ ALL AI-EDIT CHECKS PASSED');
  process.exit(0);
})().catch(e => { console.log('ERROR', e && e.stack || e); process.exit(1); });
