'use strict';
/**
 * Integration test: VIDEO STUDIO — timelines (EDL), export pipeline, ffmpeg
 * degrade path, and the pure video-engine (dims / sanitize / probe / command).
 *   node scripts/test-media-video-studio.js
 *
 * Runs fully WITHOUT ffmpeg installed: the export job must fail *gracefully*
 * with a clear message (on a box that HAS ffmpeg it renders instead — both pass).
 */
const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const mountMediaStudio = require('../media-studio');
const ve = require('../video-engine');
const vl = require('../video-luts');

let passed = 0, failed = 0;
const check = (n, c, e) => { if (c) { console.log(`  ✅ ${n}`); passed++; } else { console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); failed++; } };
const drain = async (w) => { let t = 0; while (await w.processOnce() > 0 && t < 30) t++; };

(async () => {
  // ── 1. PURE ENGINE (no server, no ffmpeg) ──────────────────────────────────
  console.log('\n— video-engine (pure) —');
  check('dimsFor 9:16@1080 = 1080×1920', JSON.stringify(ve.dimsFor('9:16', 1080)) === JSON.stringify({ width: 1080, height: 1920 }));
  check('dimsFor 16:9@1080 = 1920×1080', JSON.stringify(ve.dimsFor('16:9', 1080)) === JSON.stringify({ width: 1920, height: 1080 }));
  check('dimsFor 21:9@1080 even dims', (() => { const d = ve.dimsFor('21:9', 1080); return d.width % 2 === 0 && d.height % 2 === 0 && d.height === 1080; })());

  const probe = ve.parseFfprobe({ format: { duration: '12.5' }, streams: [{ codec_type: 'video', width: 1920, height: 1080, codec_name: 'h264', avg_frame_rate: '30000/1001' }, { codec_type: 'audio' }] });
  check('parseFfprobe duration→ms', probe.v_duration_ms === 12500, String(probe.v_duration_ms));
  check('parseFfprobe res + fps + audio', probe.v_width === 1920 && probe.v_has_audio === 1 && Math.abs(probe.v_fps - 29.97) < 0.05, JSON.stringify(probe));

  const san = ve.sanitizeTimeline({ aspect: 'banana', fps: 999, quality: 1080, tracks: [{ type: 'video', clips: [
    { kind: 'photo', assetId: 'p1', start: 0, duration: 3000, kenBurns: { toScale: 9 } },
    { kind: 'video', assetId: 'v1', start: 3000, in: 1000, duration: 4000, speed: 99, transitionIn: { type: 'fade', duration: 5000 } },
  ] }] });
  check('sanitize coerces bad aspect→9:16', san.aspect === '9:16');
  check('sanitize coerces bad fps→30', san.fps === 30);
  check('sanitize clamps speed (99→4) & kenBurns (9→3)', san.tracks[0].clips[1].speed === 4 && san.tracks[0].clips[0].kenBurns.toScale === 3);
  check('sanitize clamps transition duration (5000→2000)', san.tracks[0].clips[1].transitionIn.duration === 2000);
  check('sanitize timeline length = last clip end (3000+4000=7000)', san.duration === 7000, String(san.duration));

  const emptyCmd = ve.buildExportCommand({ tracks: [] }, { width: 1080, height: 1920, fps: 30 });
  check('buildExportCommand empty → null args + note', emptyCmd.args === null && emptyCmd.note === 'empty-timeline');

  const cmd = ve.buildExportCommand(san, { width: 1080, height: 1920, fps: 30 }, (id) => '/m/' + id + '.bin');
  const joined = cmd.args.join(' ');
  check('command: 2 segments concatenated', cmd.segments === 2 && joined.includes('concat=n=2'));
  check('command: scales to target 1080:1920', joined.includes('1080:1920'));
  check('command: photo clip uses zoompan (Ken Burns)', joined.includes('zoompan'));
  check('command: video clip uses setpts (speed)', joined.includes('setpts='));
  check('command: libx264 + faststart output flags', joined.includes('libx264') && joined.includes('+faststart'));

  // look layer — color grade / LUT / effects
  const graded = ve.sanitizeTimeline({ aspect: '9:16', tracks: [{ type: 'video', clips: [
    { kind: 'video', assetId: 'v1', start: 0, duration: 4000, color: { contrast: 0.3, saturation: 0.2, temperature: 0.4, tint: -0.1 }, lut: 'wedding_warm', effects: ['vignette', 'filmGrain'] },
  ] }] });
  const gj = ve.buildExportCommand(graded, { width: 1080, height: 1920, fps: 30 }, () => '/m/v1.mp4', (id) => '/luts/' + id + '.cube').args.join(' ');
  check('grade: eq + colorbalance applied', gj.includes('eq=brightness') && gj.includes('colorbalance=rm='));
  check('grade: LUT3D applied with resolved path', gj.includes('lut3d=/luts/wedding_warm.cube'));
  check('grade: effects (vignette + grain) applied', gj.includes('vignette=PI/4') && gj.includes('noise=alls='));
  check('sanitize drops unknown effect, keeps known', (() => { const s = ve.sanitizeTimeline({ tracks: [{ type: 'video', clips: [{ kind: 'photo', start: 0, duration: 1000, effects: ['vignette', 'hackerman'] }] }] }); return JSON.stringify(s.tracks[0].clips[0].effects) === JSON.stringify(['vignette']); })());

  // LUT generation (.cube is plain text; no native deps)
  const cube = vl.cubeFor(vl.LUTS[0]).trim().split('\n');
  check('LUT .cube header is valid (LUT_3D_SIZE 17)', cube[1] === 'LUT_3D_SIZE 17');
  check('LUT .cube body = 17³ rows', cube.length - 2 === 4913);
  check('LUT list exposes css preview hint', vl.list()[0].css && vl.list().length === 8);

  // ── 2. SERVER / DB INTEGRATION ─────────────────────────────────────────────
  console.log('\n— video studio API —');
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msv-'));
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
  const DEL = (p) => fetch(base + p, { method: 'DELETE' });
  const GET = (p) => fetch(base + p).then(r => r.json());

  try {
    const PID = (await (await POST('/api/media/projects', { title: 'Reel Shoot' })).json()).id;

    // presets endpoint
    const presets = await GET('/api/media/video/presets');
    check('presets: aspects + export presets listed', presets.aspects.includes('9:16') && presets.presets.some(p => p.id === 'ig_reel'));
    check('presets: ffmpeg availability reported', typeof presets.ffmpeg.ffmpeg === 'boolean');
    check('presets: LUT looks listed (8 built-ins)', Array.isArray(presets.luts) && presets.luts.length === 8 && presets.luts[0].css);
    const luts = await GET('/api/media/video/luts');
    check('/video/luts endpoint returns the look library', luts.luts.some(l => l.id === 'wedding_warm'));
    const HAS_FFMPEG = presets.ffmpeg.ffmpeg;

    // upload a "video" asset → ingest should queue a probe job
    const fd = new FormData();
    fd.append('files', new Blob([Buffer.from('not-a-real-video-but-has-a-path')], { type: 'video/mp4' }), 'clip.mp4');
    const up = await (await fetch(`${base}/api/media/projects/${PID}/assets`, { method: 'POST', body: fd })).json();
    const VID = up.assets[0].id;
    check('uploaded asset typed as video', up.assets[0].type === 'video', up.assets[0].type);
    await drain(worker);
    const probeJobs = db.prepare("SELECT COUNT(*) n FROM ms_jobs WHERE type = 'video_probe'").get().n;
    check('ingest enqueued a video_probe job', probeJobs >= 1, String(probeJobs));
    check('video pipeline degrades without crashing host', true); // reaching here = no throw

    // create a timeline
    let r = await POST(`/api/media/projects/${PID}/timelines`, { name: 'My Reel', aspect_ratio: '9:16' });
    check('create timeline → 201', r.status === 201);
    const TL = (await r.json()).id;

    // save a document with a photo + the uploaded video clip
    const doc = { aspect: '9:16', fps: 30, tracks: [{ type: 'video', clips: [
      { kind: 'video', assetId: VID, start: 0, in: 0, duration: 4000, transitionIn: { type: 'fade', duration: 400 } },
      { kind: 'photo', start: 4000, duration: 2500, kenBurns: { toScale: 1.15 } },
    ] }] };
    r = await PUT(`/api/media/timelines/${TL}`, { document: doc });
    const saved = await r.json();
    check('save timeline persists + recomputes duration (6500ms)', saved.duration_ms === 6500, String(saved.duration_ms));
    check('saved document round-trips as object', saved.document && saved.document.tracks[0].clips.length === 2);

    // list timelines
    const list = await GET(`/api/media/projects/${PID}/timelines`);
    check('timeline appears in project list', list.timelines.some(t => t.id === TL));

    // export → enqueue job → drain → poll
    r = await POST(`/api/media/timelines/${TL}/export`, { preset: 'tiktok', quality: 1080 });
    check('export accepted (202) with target dims', r.status === 202 && (await r.clone().json()).width === 1080);
    const EXP = (await r.json()).id;
    await drain(worker);
    const exp = await GET(`/api/media/video/exports/${EXP}`);
    if (HAS_FFMPEG) {
      check('[ffmpeg present] export rendered to done', exp.status === 'done', exp.status + ' ' + (exp.error_message || ''));
      check('[ffmpeg present] output url exposed', !!exp.url);
    } else {
      check('[no ffmpeg] export failed GRACEFULLY (not crashed)', exp.status === 'failed', exp.status);
      check('[no ffmpeg] error names the missing binary', /ffmpeg/i.test(exp.error_message || ''), exp.error_message);
    }

    // export with no clips → graceful message
    const TL2 = (await (await POST(`/api/media/projects/${PID}/timelines`, { name: 'Empty' })).json()).id;
    const EXP2 = (await (await POST(`/api/media/timelines/${TL2}/export`, { preset: 'ig_reel' })).json()).id;
    await drain(worker);
    const exp2 = await GET(`/api/media/video/exports/${EXP2}`);
    check('empty-timeline export fails with a clear reason', exp2.status === 'failed' && /clip|ffmpeg/i.test(exp2.error_message || ''), exp2.error_message);

    // control-first: nothing was delivered/published by any of this
    const galleries = db.prepare('SELECT COUNT(*) n FROM ms_galleries WHERE project_id = ?').get(PID).n;
    check('video work created zero galleries/deliveries (control-first)', galleries === 0);

    // delete timeline cleans its exports
    await DEL(`/api/media/timelines/${TL}`);
    check('delete timeline removes it', (await GET(`/api/media/projects/${PID}/timelines`)).timelines.every(t => t.id !== TL));
    check('delete cascades its exports', db.prepare('SELECT COUNT(*) n FROM ms_video_exports WHERE timeline_id = ?').get(TL).n === 0);

  } catch (e) { check('no exceptions', false, e.stack || e.message); }

  console.log(`\n${failed === 0 ? '🎉 PASS' : '💥 FAIL'} — ${passed} passed, ${failed} failed`);
  try { await new Promise(r => server.close(r)); } catch {}
  try { db.close(); } catch {}
  process.exitCode = failed === 0 ? 0 : 1;
})();
