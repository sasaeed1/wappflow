'use strict';
/**
 * Integration test: human culling (ms_cull_decisions) + library decision filter.
 *   node scripts/test-media-cull.js
 */
const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const mountMediaStudio = require('../media-studio');

let passed = 0, failed = 0;
const check = (n, c, e) => { if (c) { console.log(`  ✅ ${n}`); passed++; } else { console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); failed++; } };

(async () => {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msc-'));
  const db = new Database(':memory:');
  db.exec('CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, customer_name TEXT);');
  const WS = 'ws1', USER = 'photographer1';

  const fakeAuth = (req, _res, next) => { req.userId = USER; req.workspaceId = WS; req.userRole = 'super_admin'; req.userPermissions = {}; req.senderName = 'T'; next(); };
  const app = express();
  app.use(express.json());
  app.use('/uploads', express.static(uploadsDir));
  mountMediaStudio(app, db, { auth: fakeAuth, generateId: () => crypto.randomUUID(), multer, path, fs, uploadsDir, startWorker: false });

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const PUT = (p, b) => fetch(base + p, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const POST = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const GET = (p) => fetch(base + p).then(r => r.json());

  try {
    const PID = (await (await POST('/api/media/projects', { title: 'Cull Shoot' })).json()).id;
    const fd = new FormData();
    for (let i = 0; i < 4; i++) fd.append('files', new Blob([Buffer.from('x' + i)], { type: 'image/jpeg' }), `p${i}.jpg`);
    const ids = (await (await fetch(`${base}/api/media/projects/${PID}/assets`, { method: 'POST', body: fd })).json()).assets.map(a => a.id);

    // human decisions
    let r = await PUT(`/api/media/assets/${ids[0]}/cull`, { decision: 'keep' });
    check('PUT cull keep → 200', r.status === 200 && (await r.json()).cull.decision === 'keep');
    await PUT(`/api/media/assets/${ids[1]}/cull`, { decision: 'reject' });
    await PUT(`/api/media/assets/${ids[2]}/cull`, { decision: 'maybe' });

    // one row per asset, each owned by the human
    const rows = db.prepare('SELECT * FROM ms_cull_decisions').all();
    check('3 decision rows created', rows.length === 3, `rows=${rows.length}`);
    check('every decision is owned by a human user_id', rows.every(x => x.user_id === USER));

    // library decision filter
    check('filter keep → 1', (await GET(`/api/media/projects/${PID}/assets?decision=keep`)).total === 1);
    check('filter reject → 1', (await GET(`/api/media/projects/${PID}/assets?decision=reject`)).total === 1);
    check('filter undecided → 1 (the 4th)', (await GET(`/api/media/projects/${PID}/assets?decision=undecided`)).total === 1);

    // idempotent upsert: deciding the same asset again does not add a row
    await PUT(`/api/media/assets/${ids[0]}/cull`, { decision: 'keep' });
    check('re-deciding keeps a single row per asset', db.prepare('SELECT COUNT(*) n FROM ms_cull_decisions WHERE asset_id = ?').get(ids[0]).n === 1);

    // partial update: rating without touching decision
    r = await PUT(`/api/media/assets/${ids[0]}/cull`, { rating: 5 });
    const c0 = (await r.json()).cull;
    check('rating updates, decision preserved', c0.rating === 5 && c0.decision === 'keep');

    // bulk
    r = await POST(`/api/media/projects/${PID}/cull/bulk`, { asset_ids: [ids[3], ids[2]], decision: 'keep' });
    check('bulk cull updates 2', (await r.json()).updated === 2);

    // summary
    const sum = await GET(`/api/media/projects/${PID}/cull/summary`);
    check('summary totals correct', sum.total === 4 && sum.keep === 3 && sum.reject === 1 && sum.maybe === 0 && sum.undecided === 0, JSON.stringify(sum));

    // validation
    check('invalid decision → 400', (await PUT(`/api/media/assets/${ids[0]}/cull`, { decision: 'banana' })).status === 400);
    check('rating out of range → 400', (await PUT(`/api/media/assets/${ids[0]}/cull`, { rating: 9 })).status === 400);

    // one-click: build a delivery gallery straight from the keepers (3: asset0, asset2, asset3)
    r = await POST(`/api/media/projects/${PID}/galleries/from-cull`, { title: 'Final Selects', visibility: 'private', decision: 'keep' });
    const fg = await r.json();
    check('gallery from keepers created (201)', r.status === 201, `status ${r.status}`);
    check('gallery pre-filled with all 3 keepers', fg.added === 3, `added=${fg.added}`);
    check('gallery_assets rows match keepers', db.prepare('SELECT COUNT(*) n FROM ms_gallery_assets WHERE gallery_id = ?').get(fg.id).n === 3);
    check('from-cull with no matching photos → 400', (await POST(`/api/media/projects/${PID}/galleries/from-cull`, { decision: 'maybe' })).status === 400);

    // CONTROL-FIRST: AI scores never created a decision; the worker/scores table is untouched by culling
    check('cull never wrote to ms_asset_scores', db.prepare('SELECT COUNT(*) n FROM ms_asset_scores').get().n === 0);

  } catch (e) {
    console.log('  ❌ threw:', e.stack || e.message); failed++;
  } finally {
    await new Promise(res => server.close(res));
    try { db.close(); } catch {}
    try { fs.rmSync(uploadsDir, { recursive: true, force: true }); } catch {}
  }

  console.log(`\n${failed === 0 ? '🎉 PASS' : '🔴 FAIL'} — ${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
})();
