'use strict';
/**
 * Integration test for the Media Studio WORKER.
 * Uploads REAL (jimp-generated) images through the ingest route, then drains
 * ms_jobs via worker.processOnce() and asserts variants + advisory CV scores +
 * perceptual-hash duplicate grouping. No server.js / WhatsApp.
 *
 *   node scripts/test-media-worker.js
 */
const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const Jimp = require('jimp');

const mountMediaStudio = require('../media-studio');

let passed = 0, failed = 0;
const check = (name, cond, extra) => {
  if (cond) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}${extra ? ' → ' + extra : ''}`); failed++; }
};

// a 64×64 gradient JPEG (non-flat → real sharpness/exposure signal)
async function gradientJpeg(seed = 0) {
  const img = new Jimp(64, 64, 0x000000ff);
  img.scan(0, 0, 64, 64, function (x, y, idx) {
    this.bitmap.data[idx] = (x * 4 + seed) % 256;       // R
    this.bitmap.data[idx + 1] = (y * 4) % 256;          // G
    this.bitmap.data[idx + 2] = ((x + y) * 2) % 256;    // B
    this.bitmap.data[idx + 3] = 255;
  });
  return img.getBufferAsync(Jimp.MIME_JPEG);
}

(async () => {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msw-'));
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, customer_name TEXT);`);
  const WS = 'ws1';

  const fakeAuth = (req, _res, next) => {
    req.userId = 'u1'; req.workspaceId = WS; req.userRole = 'super_admin';
    req.userPermissions = {}; req.senderName = 'T'; next();
  };

  const app = express();
  app.use(express.json());
  app.use('/uploads', express.static(uploadsDir));
  const { worker } = mountMediaStudio(app, db, {
    auth: fakeAuth, generateId: () => crypto.randomUUID(),
    multer, path, fs, uploadsDir,
    startWorker: false,          // we drive processOnce() by hand
  });

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    check('worker reports jimp available', worker.hasImageLib === true);

    // project
    let r = await fetch(`${base}/api/media/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Worker Test Shoot' }),
    });
    const PID = (await r.json()).id;

    // upload two DISTINCT images + one DUPLICATE of the first
    const a = await gradientJpeg(0);
    const b = await gradientJpeg(120);
    const fd = new FormData();
    fd.append('files', new Blob([a], { type: 'image/jpeg' }), 'a.jpg');
    fd.append('files', new Blob([b], { type: 'image/jpeg' }), 'b.jpg');
    fd.append('files', new Blob([a], { type: 'image/jpeg' }), 'a-copy.jpg'); // duplicate of a
    r = await fetch(`${base}/api/media/projects/${PID}/assets`, { method: 'POST', body: fd });
    const up = await r.json();
    check('uploaded 3 files', up.uploaded === 3);

    // before processing: jobs pending, no variants
    const pendingBefore = db.prepare("SELECT COUNT(*) n FROM ms_jobs WHERE status='pending'").get().n;
    check('3 ingest jobs pending before worker runs', pendingBefore === 3, `pending=${pendingBefore}`);

    // DRAIN
    const processed = await worker.processOnce();
    check('worker processed 3 jobs', processed === 3, `processed=${processed}`);
    const doneJobs = db.prepare("SELECT COUNT(*) n FROM ms_jobs WHERE status='done'").get().n;
    check('all jobs marked done', doneJobs === 3, `done=${doneJobs}`);

    // assets now have dimensions + variants
    const assets = db.prepare('SELECT * FROM ms_assets WHERE project_id = ? ORDER BY created_at').all(PID);
    check('assets carry real dimensions (64×64)', assets.every(x => x.width === 64 && x.height === 64));
    const v0 = JSON.parse(assets[0].variants || '{}');
    check('variants include thumb + web + original', !!(v0.thumb && v0.web && v0.original));

    // variant files actually exist on disk and are served
    const thumbAbs = path.join(uploadsDir, v0.thumb.replace('/uploads/', ''));
    check('thumb file written to disk', fs.existsSync(thumbAbs), thumbAbs);
    r = await fetch(`${base}${v0.thumb}`);
    check('thumb served over /uploads', r.status === 200, `status ${r.status}`);

    // advisory scores written (sharpness + exposure + clipping per asset)
    const sharp = db.prepare("SELECT value FROM ms_asset_scores WHERE asset_id=? AND score_type='sharpness'").get(assets[0].id);
    const expo = db.prepare("SELECT value FROM ms_asset_scores WHERE asset_id=? AND score_type='exposure'").get(assets[0].id);
    check('sharpness score recorded (>0 for a gradient)', sharp && sharp.value > 0, JSON.stringify(sharp));
    check('exposure score recorded in 0..1', expo && expo.value >= 0 && expo.value <= 1, JSON.stringify(expo));

    // perceptual-hash duplicate grouping: a.jpg and a-copy.jpg share a group_key
    const groups = db.prepare("SELECT asset_id, group_key FROM ms_asset_scores WHERE score_type='duplicate_group'").all();
    const keys = groups.map(g => g.group_key);
    const dupShared = keys.length >= 2 && new Set(keys).size === 1;
    check('duplicate image grouped with its copy via phash', dupShared, JSON.stringify(groups));

    // CONTROL-FIRST: worker wrote scores but ZERO cull decisions
    const culls = db.prepare('SELECT COUNT(*) n FROM ms_cull_decisions').get().n;
    check('worker created NO cull decisions (advisory only)', culls === 0);

    // idempotency: re-running processOnce does nothing (no pending jobs) and scores don't duplicate
    const again = await worker.processOnce();
    const sharpCount = db.prepare("SELECT COUNT(*) n FROM ms_asset_scores WHERE asset_id=? AND score_type='sharpness'").get(assets[0].id).n;
    check('re-drain is a no-op (0 processed)', again === 0);
    check('scores not duplicated on asset', sharpCount === 1, `count=${sharpCount}`);

  } catch (e) {
    console.log('  ❌ threw:', e.stack || e.message); failed++;
  } finally {
    worker.stop();
    await new Promise(res => server.close(res));
    try { db.close(); } catch {}
    try { fs.rmSync(uploadsDir, { recursive: true, force: true }); } catch {}
  }

  console.log(`\n${failed === 0 ? '🎉 PASS' : '🔴 FAIL'} — ${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
})();
