'use strict';
/**
 * Integration test: non-destructive edits (render_edits worker job).
 *   node scripts/test-media-edits.js
 */
const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const Jimp = require('jimp');
const AdmZip = require('adm-zip');

const mountMediaStudio = require('../media-studio');

let passed = 0, failed = 0;
const check = (n, c, e) => { if (c) { console.log(`  ✅ ${n}`); passed++; } else { console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); failed++; } };

async function gradientJpeg() {
  const img = new Jimp(120, 90, 0x000000ff);
  img.scan(0, 0, 120, 90, function (x, y, idx) {
    this.bitmap.data[idx] = (x * 2) % 256; this.bitmap.data[idx + 1] = (y * 3) % 256;
    this.bitmap.data[idx + 2] = (x + y) % 256; this.bitmap.data[idx + 3] = 255;
  });
  return img.getBufferAsync(Jimp.MIME_JPEG);
}
const drain = async (w) => { let t = 0; while (await w.processOnce() > 0 && t < 12) t++; };

(async () => {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mse-'));
  const db = new Database(':memory:');
  db.exec('CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, customer_name TEXT);');
  const fakeAuth = (req, _res, next) => { req.userId = 'u1'; req.workspaceId = 'ws1'; req.userRole = 'super_admin'; req.userPermissions = {}; req.senderName = 'T'; next(); };

  const app = express();
  app.use(express.json());
  app.use('/uploads', express.static(uploadsDir));
  const { worker } = mountMediaStudio(app, db, { auth: fakeAuth, generateId: () => crypto.randomUUID(), multer, path, fs, uploadsDir, startWorker: false, clientBaseUrl: 'https://app.test' });

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const POST = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const PUT = (p, b) => fetch(base + p, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const GET = (p) => fetch(base + p).then(r => r.json());

  try {
    const PID = (await (await POST('/api/media/projects', { title: 'Edit Shoot' })).json()).id;
    const fd = new FormData();
    fd.append('files', new Blob([await gradientJpeg()], { type: 'image/jpeg' }), 'shot.jpg');
    const A = (await (await fetch(`${base}/api/media/projects/${PID}/assets`, { method: 'POST', body: fd })).json()).assets[0].id;
    await drain(worker);

    // validation
    check('exposure out of range → 400', (await PUT(`/api/media/assets/${A}/edits`, { exposure: 5 })).status === 400);
    check('bad crop → 400', (await PUT(`/api/media/assets/${A}/edits`, { crop: { x: 0.9, y: 0, w: 0.5, h: 0.5 } })).status === 400);

    // apply: rotate 90 + crop half + tone
    let r = await PUT(`/api/media/assets/${A}/edits`, { exposure: 0.3, saturation: 0.4, rotate: 90, crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } });
    check('valid edits accepted (202)', r.status === 202);
    await drain(worker);

    let asset = (await GET(`/api/media/projects/${PID}/assets`)).assets[0];
    check('variants carry full_edit + edited flag', !!asset.variants.full_edit && asset.variants.edited === true, JSON.stringify(asset.variants));
    check('web variant is rev-stamped (cache-bust)', (asset.variants.web || '').includes('-r1-'));
    const fullAbs = path.join(uploadsDir, asset.variants.full_edit.replace('/uploads/', ''));
    check('edited full render written to disk', fs.existsSync(fullAbs));
    // 120×90 → rotate90 → 90×120 → crop 0.5×0.5 → ≈45×60
    const rendered = await Jimp.read(fullAbs);
    check('rotate + crop applied (≈45×60)', Math.abs(rendered.bitmap.width - 45) <= 2 && Math.abs(rendered.bitmap.height - 60) <= 2, `${rendered.bitmap.width}x${rendered.bitmap.height}`);
    const origAbs = path.join(uploadsDir, db.prepare('SELECT storage_key FROM ms_assets WHERE id = ?').get(A).storage_key);
    const origImg = await Jimp.read(origAbs);
    check('original untouched on disk (120×90)', origImg.bitmap.width === 120 && origImg.bitmap.height === 90);

    // ZIP "original" ships the EDITED render for edited assets
    const g = await (await POST(`/api/media/projects/${PID}/galleries`, { title: 'Deliver', visibility: 'private' })).json();
    await POST(`/api/media/galleries/${g.id}/assets`, { asset_ids: [A] });
    const exp = await (await POST(`/api/media/galleries/${g.id}/export`, { variant: 'original' })).json();
    await drain(worker);
    const expRow = await GET(`/api/media/exports/${exp.id}`);
    const zip = new AdmZip(path.join(uploadsDir, expRow.download_url.replace('/uploads/', '')));
    const entry = zip.getEntries()[0];
    check('ZIP original delivers the edited bytes', entry.getData().equals(fs.readFileSync(fullAbs)));

    // extended film params (bw / fade / vignette / grain / tint)
    r = await PUT(`/api/media/assets/${A}/edits`, { bw: 1, fade: 0.2, vignette: 0.4, grain: 0.3, tint: 0.1 });
    check('extended film params accepted (202)', r.status === 202);
    check('vignette out of range → 400', (await PUT(`/api/media/assets/${A}/edits`, { vignette: 2 })).status === 400);
    await drain(worker);
    asset = (await GET(`/api/media/projects/${PID}/assets`)).assets[0];
    check('film render rev-stamped (r2+)', /-r[2-9]\d*-/.test(asset.variants.web || ''), asset.variants.web);

    // batch endpoint
    r = await POST(`/api/media/projects/${PID}/edits/batch`, { asset_ids: [A], edits: { exposure: 0.2, contrast: 0.1 } });
    const batch = await r.json();
    check('batch edits accepted (202, updated 1)', r.status === 202 && batch.updated === 1, JSON.stringify(batch));
    check('batch with bad params → 400', (await POST(`/api/media/projects/${PID}/edits/batch`, { asset_ids: [A], edits: { exposure: 9 } })).status === 400);
    await drain(worker);

    // copilot degrades gracefully without an AI provider
    r = await POST('/api/media/copilot', { message: 'analyze this shoot', project_id: PID });
    check('copilot without AI key → 503', r.status === 503);

    // reset restores plain variants
    r = await fetch(`${base}/api/media/assets/${A}/edits`, { method: 'DELETE' });
    check('reset accepted (202)', r.status === 202);
    await drain(worker);
    asset = (await GET(`/api/media/projects/${PID}/assets`)).assets[0];
    check('reset removed full_edit + restored plain web', !asset.variants.full_edit && (asset.variants.web || '').includes('media/variants/'));

    // control-first: editing never touched cull decisions or AI score lane semantics
    check('edits created no cull decisions', db.prepare('SELECT COUNT(*) n FROM ms_cull_decisions').get().n === 0);

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
