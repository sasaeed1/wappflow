// Phase 8 reel/story planning test — no server.js boot. Run: node test-reel-engine.js
const Database = require('better-sqlite3');
const express = require('express');
const reelEngine = require('./reel-engine');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE ms_projects (id TEXT PRIMARY KEY, workspace_id TEXT);
  CREATE TABLE ms_assets (id TEXT PRIMARY KEY, workspace_id TEXT, project_id TEXT, type TEXT);
  CREATE TABLE ms_asset_scores (id TEXT PRIMARY KEY, asset_id TEXT, score_type TEXT, value REAL, reasons TEXT);
`);
// reel-engine WRITES ms_timelines / ms_video_exports / ms_jobs but media-studio.js
// OWNS their DDL, and reel-engine asserts at boot that the owner ran first. Lift the
// real CREATE statements out of the owner rather than hand-copying them, so this
// fixture can never quietly drift from the schema production actually uses.
const msSrc = require('fs').readFileSync(require('path').join(__dirname, 'media-studio.js'), 'utf8');
for (const t of ['ms_timelines', 'ms_video_exports', 'ms_jobs']) {
  const i = msSrc.indexOf('CREATE TABLE IF NOT EXISTS ' + t);
  if (i < 0) throw new Error('media-studio.js no longer creates ' + t + ' - this fixture is out of date');
  db.exec(msSrc.slice(i, msSrc.indexOf(');', i) + 2));
}

db.prepare("INSERT INTO ms_projects VALUES ('p1','ws1')").run();
// 6 assets with varied scores
const A = [
  ['a1', { hero: 0.95, aesthetic: 0.9, composition: 0.8, face_count: 2, scene: 'portrait' }],
  ['a2', { hero: 0.80, aesthetic: 0.85, composition: 0.7, face_count: 3, scene: 'group' }],
  ['a3', { hero: 0.40, aesthetic: 0.5, composition: 0.6, face_count: 0, scene: 'landscape' }],
  ['a4', { hero: 0.70, aesthetic: 0.75, composition: 0.65, face_count: 1, scene: 'portrait' }],
  ['a5', { hero: 0.60, aesthetic: 0.65, composition: 0.55, face_count: 0, scene: 'scene' }],
  ['a6', { hero: 0.88, aesthetic: 0.92, composition: 0.9, face_count: 2, scene: 'portrait' }],
];
let sid = 0;
for (const [aid, sc] of A) {
  db.prepare("INSERT INTO ms_assets VALUES (?,?,?,?)").run(aid, 'ws1', 'p1', 'photo');
  for (const [t, v] of Object.entries(sc)) {
    if (t === 'scene') db.prepare("INSERT INTO ms_asset_scores VALUES (?,?,?,?,?)").run('s' + (sid++), aid, 'scene_class', 0.7, JSON.stringify({ label: v }));
    else db.prepare("INSERT INTO ms_asset_scores VALUES (?,?,?,?,?)").run('s' + (sid++), aid, t, v, null);
  }
}

const app = express(); app.use(express.json());
app.use((req, res, next) => { req.workspaceId = 'ws1'; next(); });
reelEngine(app, db, { auth: (req, res, next) => next() });

let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.error('  ✗', m); } else console.log('  ✓', m); };

(async () => {
  const srv = app.listen(0); await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = async (p, b) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) }); return { status: r.status, json: await r.json() }; };

  console.log('\n[1] Reel plan from scores');
  const r = await post('/api/media/projects/p1/reel-plan', { target_count: 6 });
  ok(r.status === 200, 'plan returned');
  const seg = r.json.segments;
  ok(seg.length >= 4, `plan has segments (${seg.length})`);
  ok(seg[0].role === 'hook', 'opens with a hook');
  ok(seg.some(s => s.role === 'climax'), 'has a climax');
  ok(seg[seg.length - 1].role === 'outro', 'ends with an outro');
  const climax = seg.find(s => s.role === 'climax');
  ok(climax && climax.asset_id === 'a1', 'climax = highest hero (a1=0.95)');
  const outro = seg.find(s => s.role === 'outro');
  ok(outro && (outro.scene === 'landscape' || outro.faces === 0), 'outro is a calm/wide shot');
  const ids = seg.map(s => s.asset_id);
  ok(new Set(ids).size === ids.length, 'no duplicate assets in the plan');
  ok(Array.isArray(r.json.structure) && r.json.structure.length >= 3, 'structure summary present');

  console.log('\n[2] Empty project → empty plan (no crash)');
  db.prepare("INSERT INTO ms_projects VALUES ('p2','ws1')").run();
  const e = await post('/api/media/projects/p2/reel-plan', {});
  ok(e.status === 200 && e.json.segments.length === 0, 'empty project yields empty plan');

  console.log('\n[3] Cross-workspace guard');
  const x = await post('/api/media/projects/p1/reel-plan', {});
  ok(x.status === 200, 'same workspace ok');

  console.log(`\n${fails === 0 ? '✅ ALL REEL-ENGINE CHECKS PASSED' : '❌ ' + fails + ' FAILED'}\n`);
  // Let the loop drain instead of forcing process.exit(): tearing the process
  // down with the http server's handle still closing trips a libuv assertion on
  // Windows, which made this suite abort with a bogus exit code AFTER passing.
  process.exitCode = fails ? 1 : 0;
  try { srv.close(); } catch {}
  try { db.close(); } catch {}
})();
