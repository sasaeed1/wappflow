'use strict';
/**
 * Integration test: album builder + print-ready PDF (worker pdf_export).
 *   node scripts/test-media-albums.js
 */
const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const Jimp = require('jimp');
const pdfParse = require('pdf-parse');

const mountMediaStudio = require('../media-studio');

let passed = 0, failed = 0;
const check = (n, c, e) => { if (c) { console.log(`  ✅ ${n}`); passed++; } else { console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); failed++; } };

async function gradientJpeg(seed = 0) {
  const img = new Jimp(100, 100, 0x000000ff);
  img.scan(0, 0, 100, 100, function (x, y, idx) {
    this.bitmap.data[idx] = (x * 2 + seed) % 256; this.bitmap.data[idx + 1] = (y * 2) % 256;
    this.bitmap.data[idx + 2] = ((x + y)) % 256; this.bitmap.data[idx + 3] = 255;
  });
  return img.getBufferAsync(Jimp.MIME_JPEG);
}
const drain = async (w) => { let t = 0; while (await w.processOnce() > 0 && t < 12) t++; };

(async () => {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msa-'));
  const db = new Database(':memory:');
  db.exec('CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, customer_name TEXT);');
  const WS = 'ws1';
  const fakeAuth = (req, _res, next) => { req.userId = 'u1'; req.workspaceId = WS; req.userRole = 'super_admin'; req.userPermissions = {}; req.senderName = 'T'; next(); };

  const app = express();
  app.use(express.json());
  app.use('/uploads', express.static(uploadsDir));
  const { worker } = mountMediaStudio(app, db, { auth: fakeAuth, generateId: () => crypto.randomUUID(), multer, path, fs, uploadsDir, startWorker: false });

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const POST = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const PUT = (p, b) => fetch(base + p, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const GET = (p) => fetch(base + p).then(r => r.json());

  try {
    // project + 4 real images, processed → on-disk originals
    const PID = (await (await POST('/api/media/projects', { title: 'Album Shoot' })).json()).id;
    const fd = new FormData();
    for (let i = 0; i < 4; i++) fd.append('files', new Blob([await gradientJpeg(i * 40)], { type: 'image/jpeg' }), `p${i}.jpg`);
    const ids = (await (await fetch(`${base}/api/media/projects/${PID}/assets`, { method: 'POST', body: fd })).json()).assets.map(a => a.id);
    await drain(worker);

    // album
    let r = await POST(`/api/media/projects/${PID}/albums`, { title: 'Wedding Album', spec: { w_mm: 200, h_mm: 200, margin_mm: 10 } });
    const album = await r.json();
    check('album created (201)', r.status === 201 && album.id);

    // pages
    const p1 = await (await POST(`/api/media/albums/${album.id}/pages`, { layout_template: 'single', slots: [{ asset_id: ids[0] }] })).json();
    await POST(`/api/media/albums/${album.id}/pages`, { layout_template: 'grid4', slots: ids.map(id => ({ asset_id: id })) });
    let det = await GET(`/api/media/albums/${album.id}`);
    check('album has 2 pages', det.pages.length === 2);
    check('single page → 1 slot with a resolved thumb', det.pages[0].slot_count === 1 && det.pages[0].slots[0].thumb_url);
    check('grid4 page → 4 filled slots', det.pages[1].slot_count === 4 && det.pages[1].slots.filter(s => s.asset_id).length === 4);

    // edit a page layout
    await PUT(`/api/media/albums/${album.id}/pages/${p1.id}`, { layout_template: 'two-h', slots: [{ asset_id: ids[0] }, { asset_id: ids[1] }] });
    det = await GET(`/api/media/albums/${album.id}`);
    check('page layout updated to two-h (2 slots)', det.pages.find(p => p.id === p1.id).slot_count === 2);

    // reorder
    check('reorder pages ok', (await (await PUT(`/api/media/albums/${album.id}/pages/order`, { page_ids: det.pages.map(p => p.id).reverse() })).json()).count === 2);

    // autofill from keepers
    await PUT(`/api/media/assets/${ids[2]}/cull`, { decision: 'keep' });
    await PUT(`/api/media/assets/${ids[3]}/cull`, { decision: 'keep' });
    check('autofill from keepers added 2 pages', (await (await POST(`/api/media/albums/${album.id}/autofill`, { decision: 'keep' })).json()).added === 2);
    det = await GET(`/api/media/albums/${album.id}`);
    check('album now has 4 pages', det.pages.length === 4);

    // export validation: empty album
    const empty = await (await POST(`/api/media/projects/${PID}/albums`, { title: 'Empty' })).json();
    check('export empty album → 400', (await POST(`/api/media/albums/${empty.id}/export`, {})).status === 400);

    // export the real album
    r = await POST(`/api/media/albums/${album.id}/export`, {});
    check('export accepted (202)', r.status === 202);
    check('pdf_status pending immediately', (await GET(`/api/media/albums/${album.id}`)).pdf_status === 'pending');
    await drain(worker);
    det = await GET(`/api/media/albums/${album.id}`);
    check('pdf becomes ready with a url', det.pdf_status === 'ready' && !!det.pdf_url, JSON.stringify({ s: det.pdf_status }));
    check('album reports 4 pages built', det.pdf_pages === 4);

    const pdfAbs = path.join(uploadsDir, det.pdf_url.replace('/uploads/', ''));
    check('pdf written to disk', fs.existsSync(pdfAbs));
    const head = fs.readFileSync(pdfAbs).slice(0, 5).toString();
    check('file is a real PDF (%PDF- header)', head === '%PDF-', head);
    const parsed = await pdfParse(fs.readFileSync(pdfAbs));
    check('PDF actually contains 4 pages', parsed.numpages === 4, `numpages=${parsed.numpages}`);

    // delete a page
    await fetch(`${base}/api/media/albums/${album.id}/pages/${det.pages[0].id}`, { method: 'DELETE' });
    check('deleting a page leaves 3', (await GET(`/api/media/albums/${album.id}`)).pages.length === 3);

    // control-first: album work created no AI scores; only the 2 human keepers exist
    check('albums created no cull decisions of their own', db.prepare('SELECT COUNT(*) n FROM ms_cull_decisions').get().n === 2);

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
