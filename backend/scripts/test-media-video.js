'use strict';
/**
 * Integration test: video module — manual clip selection (no auto-reel).
 *   node scripts/test-media-video.js
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
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msv-'));
  const db = new Database(':memory:');
  db.exec('CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, customer_name TEXT);');
  const WS = 'ws1';
  const fakeAuth = (req, _res, next) => { req.userId = 'u1'; req.workspaceId = WS; req.userRole = 'super_admin'; req.userPermissions = {}; req.senderName = 'T'; next(); };

  const app = express();
  app.use(express.json());
  app.use('/uploads', express.static(uploadsDir));
  mountMediaStudio(app, db, { auth: fakeAuth, generateId: () => crypto.randomUUID(), multer, path, fs, uploadsDir, startWorker: false });

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const POST = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const PUT = (p, b) => fetch(base + p, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const GET = (p) => fetch(base + p).then(r => r.json());

  try {
    const PID = (await (await POST('/api/media/projects', { title: 'Film Shoot' })).json()).id;
    // upload 2 videos + 1 photo
    const fd = new FormData();
    fd.append('files', new Blob([Buffer.from('vid1')], { type: 'video/mp4' }), 'ceremony.mp4');
    fd.append('files', new Blob([Buffer.from('vid2')], { type: 'video/mp4' }), 'reception.mp4');
    fd.append('files', new Blob([Buffer.from('img')], { type: 'image/jpeg' }), 'photo.jpg');
    const up = (await (await fetch(`${base}/api/media/projects/${PID}/assets`, { method: 'POST', body: fd })).json()).assets;
    const videos = up.filter(a => a.type === 'video');
    const V1 = videos[0].id, V2 = videos[1].id;

    // video list excludes the photo
    let list = await GET(`/api/media/projects/${PID}/videos`);
    check('lists only video assets (2)', list.videos.length === 2);
    check('clip_count starts at 0', list.videos.every(v => v.clip_count === 0));

    // store duration from the (client-side) <video>
    check('PUT meta duration ok', (await PUT(`/api/media/assets/${V1}/meta`, { duration_ms: 60000 })).status === 200);
    list = await GET(`/api/media/projects/${PID}/videos`);
    check('duration persisted', list.videos.find(v => v.id === V1).duration_ms === 60000);

    // create clips
    let r = await POST(`/api/media/assets/${V1}/clips`, { label: 'Vows', in_ms: 1000, out_ms: 5000 });
    check('clip created (201)', r.status === 201 && (await r.json()).label === 'Vows');
    check('clip end before start → 400', (await POST(`/api/media/assets/${V1}/clips`, { in_ms: 5000, out_ms: 3000 })).status === 400);
    await POST(`/api/media/assets/${V1}/clips`, { label: 'Kiss', in_ms: 8000, out_ms: 12000 });

    const clips = (await GET(`/api/media/assets/${V1}/clips`)).clips;
    check('two clips on the video', clips.length === 2);
    check('clips carry in/out points', clips[0].in_ms === 1000 && clips[0].out_ms === 5000);

    // edit a clip (trim + relabel)
    r = await PUT(`/api/media/clips/${clips[0].id}`, { label: 'The Vows', in_ms: 1500, out_ms: 6000 });
    const edited = await r.json();
    check('clip trimmed + relabelled', edited.in_ms === 1500 && edited.out_ms === 6000 && edited.label === 'The Vows');
    check('invalid trim (out<=in) → 400', (await PUT(`/api/media/clips/${clips[0].id}`, { in_ms: 9000, out_ms: 9000 })).status === 400);

    // reorder (specific route resolves, not treated as a clipId)
    check('reorder clips works', (await (await PUT(`/api/media/assets/${V1}/clips/order`, { clip_ids: [clips[1].id, clips[0].id] })).json()).count === 2);

    // delete
    await fetch(`${base}/api/media/clips/${clips[0].id}`, { method: 'DELETE' });
    check('deleting leaves 1 clip', (await GET(`/api/media/assets/${V1}/clips`)).clips.length === 1);

    // clips are scoped per asset
    check('second video has its own (empty) clip list', (await GET(`/api/media/assets/${V2}/clips`)).clips.length === 0);

    // control-first: clip selection is human-only; no AI scores invented
    check('no AI scores created by clip selection', db.prepare('SELECT COUNT(*) n FROM ms_asset_scores').get().n === 0);

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
