'use strict';
/**
 * Integration test: ZIP export + burned-in watermarking (worker zip_export job).
 *   node scripts/test-media-export.js
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
const isJpeg = (buf) => buf && buf.length > 2 && buf[0] === 0xFF && buf[1] === 0xD8;

async function gradientJpeg(seed = 0) {
  const img = new Jimp(120, 90, 0x000000ff);
  img.scan(0, 0, 120, 90, function (x, y, idx) {
    this.bitmap.data[idx] = (x * 2 + seed) % 256;
    this.bitmap.data[idx + 1] = (y * 3) % 256;
    this.bitmap.data[idx + 2] = ((x + y)) % 256;
    this.bitmap.data[idx + 3] = 255;
  });
  return img.getBufferAsync(Jimp.MIME_JPEG);
}

const drain = async (worker) => { let t = 0; while (await worker.processOnce() > 0 && t < 10) t++; };

(async () => {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msx-'));
  const db = new Database(':memory:');
  db.exec('CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, customer_name TEXT, customer_phone TEXT);');
  const WS = 'ws1';
  const fakeAuth = (req, _res, next) => { req.userId = 'u1'; req.workspaceId = WS; req.userRole = 'super_admin'; req.userPermissions = {}; req.senderName = 'T'; next(); };

  const app = express();
  app.use(express.json());
  app.use('/uploads', express.static(uploadsDir));
  const { worker } = mountMediaStudio(app, db, { auth: fakeAuth, generateId: () => crypto.randomUUID(), multer, path, fs, uploadsDir, startWorker: false, clientBaseUrl: 'https://app.test' });

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const POST = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const GET = (p) => fetch(base + p).then(r => r.json());

  try {
    // project + 2 real images, processed by the worker (→ web variants)
    const PID = (await (await POST('/api/media/projects', { title: 'Export Shoot' })).json()).id;
    const fd = new FormData();
    fd.append('files', new Blob([await gradientJpeg(0)], { type: 'image/jpeg' }), 'one.jpg');
    fd.append('files', new Blob([await gradientJpeg(90)], { type: 'image/jpeg' }), 'two.jpg');
    const ids = (await (await fetch(`${base}/api/media/projects/${PID}/assets`, { method: 'POST', body: fd })).json()).assets.map(a => a.id);
    await drain(worker);
    const haveWeb = db.prepare("SELECT variants FROM ms_assets WHERE id = ?").get(ids[0]);
    check('ingest produced web variants', JSON.parse(haveWeb.variants).web != null);

    // gallery with watermark + high-res download policy
    const g = await (await POST(`/api/media/projects/${PID}/galleries`, { title: 'Deliverables', visibility: 'private', settings: { watermark: 'ACME STUDIO', download_policy: 'high-res' } })).json();
    await POST(`/api/media/galleries/${g.id}/assets`, { asset_ids: ids });

    // ── WEB export (watermarked) ──
    let r = await POST(`/api/media/galleries/${g.id}/export`, { variant: 'web' });
    check('export request accepted (202)', r.status === 202);
    let exp = await r.json();
    check('export starts pending', exp.status === 'pending');
    check('web export records watermark intent', exp.watermark === true);
    await drain(worker);
    exp = await GET(`/api/media/exports/${exp.id}`);
    check('export becomes ready', exp.status === 'ready', JSON.stringify(exp));
    check('export reports 2 files + a download url', exp.file_count === 2 && !!exp.download_url);

    // open the produced zip
    const webZipAbs = path.join(uploadsDir, exp.download_url.replace('/uploads/', ''));
    check('zip written to disk', fs.existsSync(webZipAbs));
    const webEntries = new AdmZip(webZipAbs).getEntries();
    check('web zip contains 2 entries', webEntries.length === 2, `entries=${webEntries.length}`);
    check('every zip entry is a valid JPEG', webEntries.every(e => isJpeg(e.getData())));

    // watermark actually changed pixels vs the clean web variant
    const cleanWeb = fs.readFileSync(path.join(uploadsDir, JSON.parse(db.prepare('SELECT variants FROM ms_assets WHERE id = ?').get(ids[0]).variants).web.replace('/uploads/', '')));
    const wmEntry = webEntries.find(e => e.entryName.includes('one'));
    check('watermarked entry differs from the clean web image', wmEntry && !wmEntry.getData().equals(cleanWeb));

    // ── ORIGINAL export (clean, full-res) ──
    r = await POST(`/api/media/galleries/${g.id}/export`, { variant: 'original' });
    let oexp = await r.json();
    check('original export not watermarked', oexp.watermark === false);
    await drain(worker);
    oexp = await GET(`/api/media/exports/${oexp.id}`);
    const origZip = new AdmZip(path.join(uploadsDir, oexp.download_url.replace('/uploads/', '')));
    const origStoreKey = db.prepare('SELECT storage_key FROM ms_assets WHERE id = ?').get(ids[0]).storage_key;
    const origOnDisk = fs.readFileSync(path.join(uploadsDir, origStoreKey));
    const origEntry = origZip.getEntries().find(e => e.entryName.includes('one'));
    check('original zip ships the untouched source bytes', origEntry && origEntry.getData().equals(origOnDisk));

    // validation: empty gallery
    const empty = await (await POST(`/api/media/projects/${PID}/galleries`, { title: 'Empty' })).json();
    check('export of empty gallery → 400', (await POST(`/api/media/galleries/${empty.id}/export`, {})).status === 400);

    // ── client portal "Download all" (respects high-res policy → original) ──
    const pub = await (await POST(`/api/media/galleries/${g.id}/publish`, { notify: false })).json();
    const token = pub.share_url.split('/g/')[1];
    r = await POST(`/api/media/portal/${token}/export`, {});
    const pexp = await r.json();
    check('portal export accepted (202)', r.status === 202 && pexp.export_id);
    await drain(worker);
    const pstatus = await GET(`/api/media/portal/${token}/export/${pexp.export_id}`);
    check('portal export ready with download url', pstatus.status === 'ready' && !!pstatus.download_url);

    // control-first: exports never created cull decisions
    check('exporting created no cull decisions', db.prepare('SELECT COUNT(*) n FROM ms_cull_decisions').get().n === 0);

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
