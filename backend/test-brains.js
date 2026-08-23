// Phase 9 Brains & Style test — no server.js boot. Run: node test-brains.js
const Database = require('better-sqlite3');
const express = require('express');
const brains = require('./brains');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE ms_cull_decisions (id TEXT PRIMARY KEY, workspace_id TEXT, asset_id TEXT, user_id TEXT, decision TEXT, rating INTEGER DEFAULT 0);
  CREATE TABLE ms_asset_scores (id TEXT PRIMARY KEY, asset_id TEXT, score_type TEXT, value REAL, reasons TEXT);
`);
// u1 culls: 7 keep, 3 reject (70% keep), some ratings; kept assets have aesthetic reasons
let id = 0; const nid = () => 's' + (id++);
const mk = (aid, dec, rating, exposure, contrast, colour, comp) => {
  db.prepare("INSERT INTO ms_cull_decisions VALUES (?,?,?,?,?,?)").run(nid(), 'ws1', aid, 'u1', dec, rating || 0);
  if (dec === 'keep') {
    db.prepare("INSERT INTO ms_asset_scores VALUES (?,?,?,?,?)").run(nid(), aid, 'aesthetic', 0.8, JSON.stringify({ exposure, contrast, colourfulness: colour }));
    db.prepare("INSERT INTO ms_asset_scores VALUES (?,?,?,?,?)").run(nid(), aid, 'composition', comp, null);
  }
};
for (let i = 0; i < 7; i++) mk('a' + i, 'keep', 4, 0.50, 0.7, 0.6, 0.62);
for (let i = 7; i < 10; i++) mk('a' + i, 'reject', 0, 0.2, 0.3, 0.2, 0.3);

const app = express(); app.use(express.json());
app.use((req, res, next) => { req.workspaceId = 'ws1'; req.userId = 'u1'; next(); });
brains(app, db, { auth: (req, res, next) => next(), generateId: nid });

let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.error('  ✗', m); } else console.log('  ✓', m); };

(async () => {
  const srv = app.listen(0); await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = async (p, b) => (await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b || {}) })).json();
  const get = async (p) => (await fetch(base + p)).json();

  console.log('\n[1] Creator Brain');
  const cb = await post('/api/media/creator-brain/derive');
  ok(Math.abs(cb.brain.cull_keep_rate.value - 0.7) < 0.001, 'keep-rate inferred = 0.70');
  ok(cb.brain.decisions_count.value === 10, 'decisions_count = 10');
  ok(cb.brain.avg_rating.value === 4, 'avg rating = 4 (kept shots)');
  const cbGet = await get('/api/media/creator-brain');
  ok(cbGet.brain.cull_keep_rate.value === 0.7, 'creator-brain persisted + readable');

  console.log('\n[2] Style Engine (house style from kept work)');
  const st = await post('/api/media/style-profile/derive', { scope: 'workspace' });
  ok(Math.abs(st.profile.exposure - 0.5) < 0.001, 'house exposure = 0.50 (avg of kept)');
  ok(Math.abs(st.profile.composition - 0.62) < 0.001, 'house composition = 0.62');
  ok(st.sample_n === 7, 'style sampled the 7 kept assets only');
  const stGet = await get('/api/media/style-profile?scope=workspace');
  ok(stGet.profile && stGet.profile.contrast === 0.7, 'style profile persisted + readable');

  console.log('\n[3] Recommendations');
  const rec = await get('/api/media/recommendations');
  ok(Array.isArray(rec.recommendations) && rec.recommendations.length >= 1, 'recommendations produced');
  ok(rec.recommendations.some(r => r.kind === 'cull'), 'has a cull recommendation');
  ok(rec.recommendations.some(r => r.kind === 'style'), 'has a style recommendation');

  console.log(`\n${fails === 0 ? '✅ ALL BRAINS & STYLE CHECKS PASSED' : '❌ ' + fails + ' FAILED'}\n`);
  // Let the loop drain instead of forcing process.exit(): tearing the process
  // down with the http server's handle still closing trips a libuv assertion on
  // Windows, which made this suite abort with a bogus exit code AFTER passing.
  process.exitCode = fails ? 1 : 0;
  try { srv.close(); } catch {}
  try { db.close(); } catch {}
})();
