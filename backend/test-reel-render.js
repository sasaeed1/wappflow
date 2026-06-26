'use strict';
// Verifies reel RENDER: plan → timeline EDL → (a) a valid ffmpeg render graph via the
// video-engine, and (b) the route writes a timeline + export job. No ffmpeg needed —
// buildExportCommand is pure.
const Database = require('better-sqlite3');
const videoEngine = require('./video-engine');
const assert = (c, m) => { if (!c) { console.log('✗ FAIL:', m); process.exitCode = 1; throw new Error(m); } console.log('  ✓', m); };

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE ms_projects (id TEXT PRIMARY KEY, workspace_id TEXT, title TEXT);
  CREATE TABLE ms_assets (id TEXT PRIMARY KEY, workspace_id TEXT, project_id TEXT, type TEXT, deleted_at TIMESTAMP);
  CREATE TABLE ms_asset_scores (asset_id TEXT, score_type TEXT, value REAL, reasons TEXT);
  CREATE TABLE ms_timelines (id TEXT PRIMARY KEY, workspace_id TEXT, project_id TEXT, name TEXT, source TEXT, template_id TEXT, aspect_ratio TEXT, width INTEGER, height INTEGER, fps INTEGER, duration_ms INTEGER, document TEXT, status TEXT, ai_style TEXT, ai_signature TEXT, ai_stale INTEGER, created_by TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE ms_video_exports (id TEXT PRIMARY KEY, workspace_id TEXT, timeline_id TEXT, project_id TEXT, preset TEXT, width INTEGER, height INTEGER, fps INTEGER, quality INTEGER, status TEXT DEFAULT 'pending', progress INTEGER DEFAULT 0, storage_key TEXT, size_bytes INTEGER, error_message TEXT, created_by TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, finished_at TIMESTAMP);
  CREATE TABLE ms_jobs (id TEXT PRIMARY KEY, workspace_id TEXT, type TEXT, asset_id TEXT, project_id TEXT, status TEXT, payload TEXT);
`);

const WS = 'ws1', PROJ = 'p1';
db.prepare("INSERT INTO ms_projects (id, workspace_id, title) VALUES (?,?, 'Ayesha & Bilal')").run(PROJ, WS);
// 8 photos with varied scores so the plan has a clear hook/climax/outro + body
const addScore = db.prepare('INSERT INTO ms_asset_scores (asset_id, score_type, value, reasons) VALUES (?,?,?,?)');
for (let i = 1; i <= 8; i++) {
  const id = 'a' + i;
  db.prepare("INSERT INTO ms_assets (id, workspace_id, project_id, type) VALUES (?,?,?, 'photo')").run(id, WS, PROJ);
  addScore.run(id, 'aesthetic', 0.4 + (i % 5) * 0.1, null);
  addScore.run(id, 'hero', 0.3 + i * 0.07, null);
  addScore.run(id, 'composition', 0.5, null);
  addScore.run(id, 'face_count', i <= 4 ? 2 : 0, null);
  addScore.run(id, 'scene_class', 0.6, JSON.stringify({ label: i % 3 === 0 ? 'landscape' : (i <= 4 ? 'portrait' : 'scene') }));
}

let routes = {};
const fakeApp = { post: (p, ...h) => { routes['POST ' + p] = h[h.length - 1]; }, get: (p, ...h) => { routes['GET ' + p] = h[h.length - 1]; } };
const eng = require('./reel-engine')(fakeApp, db, { auth: (q, s, n) => n && n(), generateId: () => 'id_' + Math.random().toString(16).slice(2, 10), logAudit: () => {} });

console.log('[1] plan → timeline EDL');
const assets = db.prepare("SELECT id, type FROM ms_assets WHERE project_id = ?").all(PROJ);
const sm = {};
for (const r of db.prepare('SELECT asset_id, score_type, value, reasons FROM ms_asset_scores').all()) {
  (sm[r.asset_id] = sm[r.asset_id] || {})[r.score_type] = r.value;
  if (r.score_type === 'scene_class' && r.reasons) { try { sm[r.asset_id].scene = JSON.parse(r.reasons).label; } catch {} }
}
assets.forEach(a => { a.scores = sm[a.id] || {}; });
const plan = eng.buildPlan(assets, 8);
assert(plan.segments.length >= 4, `plan has segments (${plan.segments.length})`);
assert(plan.segments[0].role === 'hook', 'first segment is the hook');
assert(plan.segments.some(s => s.role === 'climax') && plan.segments.some(s => s.role === 'outro'), 'plan has climax + outro');

const doc = eng.planToTimeline(plan, { title: 'Ayesha & Bilal — The Wedding', music_asset_id: 'm1' });
const vTrack = doc.tracks.find(t => t.type === 'video');
assert(vTrack && vTrack.clips.length === plan.segments.length, 'video track has one clip per segment');
assert(vTrack.clips.every(c => c.transitionIn && c.transitionOut), 'every clip has in/out transitions');
assert(vTrack.clips.filter(c => c.kind === 'photo').every(c => c.kenBurns), 'photo clips have Ken Burns');
assert(doc.tracks.some(t => t.type === 'text' && t.clips[0].text.content.includes('Ayesha')), 'title text track present');
assert(doc.tracks.some(t => t.type === 'audio' && t.clips[0].assetId === 'm1'), 'music audio track present');

console.log('\n[2] timeline → valid ffmpeg render graph (pure, no ffmpeg needed)');
const san = videoEngine.sanitizeTimeline(doc);
assert(san.aspect === '9:16' && san.width > 0 && san.height > 0, 'sanitized 9:16 with real dims');
assert(san.duration > 0, `timeline has a positive duration (${san.duration}ms)`);
const built = videoEngine.buildExportCommand(doc, { width: san.width, height: san.height, fps: 30 }, (id) => `/tmp/${id}.jpg`);
assert(Array.isArray(built.args) && built.args.length > 0, 'buildExportCommand produced ffmpeg args');
assert(built.segments === vTrack.clips.length, `render graph composites all ${built.segments} clips`);
assert(built.args.includes('-filter_complex') && built.args.includes('libx264'), 'args include filter_complex + libx264 encode');
assert(built.hasAudio === true, 'audio track wired into the render');

console.log('\n[3] reel-render route writes a timeline + export job');
let captured = null;
const res = { status: (s) => ({ json: (o) => { captured = { status: s, body: o }; } }), json: (o) => { captured = { status: 200, body: o }; } };
routes['POST /api/media/projects/:id/reel-render']({ params: { id: PROJ }, workspaceId: WS, userId: 'u1', body: { title: 'Wedding Reel', target_count: 8 } }, res);
assert(captured && captured.status === 202, 'route returns 202 Accepted');
assert(captured.body.timeline_id && captured.body.export_id, 'returns timeline_id + export_id');
const tl = db.prepare("SELECT * FROM ms_timelines WHERE id = ?").get(captured.body.timeline_id);
assert(tl && tl.source === 'ai_reel' && JSON.parse(tl.document).tracks.length >= 1, 'timeline row written (source ai_reel) with a document');
const exp = db.prepare("SELECT * FROM ms_video_exports WHERE id = ?").get(captured.body.export_id);
assert(exp && exp.timeline_id === tl.id && exp.status === 'pending', 'export row written + pending');
const job = db.prepare("SELECT * FROM ms_jobs WHERE type = 'video_export'").get();
assert(job && JSON.parse(job.payload).export_id === exp.id, 'video_export job enqueued for the worker');

console.log('\n✅ ALL REEL-RENDER CHECKS PASSED');
process.exit(0);
