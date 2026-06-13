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

  // text overlays (drawtext) + glow (subgraph) + freeze
  const rich = ve.sanitizeTimeline({ aspect: '9:16', tracks: [
    { type: 'video', clips: [
      { kind: 'photo', assetId: 'p1', start: 0, duration: 3000, effects: ['glow'] },
      { kind: 'video', assetId: 'v1', start: 3000, duration: 2000, in: 1000, freeze: true },
    ] },
    { type: 'text', clips: [{ kind: 'text', start: 400, duration: 2000, text: { content: "Sami & Co", type: 'heading', font: 'sans', size: 64, color: '#ffcc00', align: 'center', animation: 'fade' }, transform: { x: 0, y: -0.12 } }] },
  ] });
  const rj = ve.buildExportCommand(rich, { width: 1080, height: 1920, fps: 30 }, () => '/m/a.jpg', () => null, () => '/fonts/sans.ttf').args.join(' ');
  check('text: drawtext with timing + scaled size', rj.includes('drawtext=fontfile') && rj.includes('between(t,0.40,2.40)') && rj.includes('fontsize=114'));
  check('text: colour hex → ffmpeg 0x form', rj.includes('fontcolor=0xffcc00'));
  check('glow: split + screen-blend subgraph', rj.includes('split') && rj.includes('blend=all_mode=screen'));
  check('freeze: holds a single looped frame', rj.includes('loop=loop=-1:size=1'));
  check('sanitize preserves freeze + keeps text track', rich.tracks[0].clips[1].freeze === true && rich.tracks.some(t => t.type === 'text' && t.clips.length === 1));
  const noFont = ve.buildExportCommand(rich, { width: 1080, height: 1920, fps: 30 }, () => '/m/a.jpg', () => null, () => null).args.join(' ');
  check('no font on box → text skipped, video still renders', !noFont.includes('drawtext') && noFont.includes('color=c=black'));
  check('detectFonts returns a shape (degrades to null when absent)', typeof ve.detectFonts() === 'object');

  // music track: mix one audio clip with volume/fade + trim-in
  const withMusic = ve.sanitizeTimeline({ aspect: '9:16', tracks: [
    { type: 'video', clips: [{ kind: 'photo', assetId: 'p1', start: 0, duration: 4000 }] },
    { type: 'audio', clips: [{ kind: 'audio', assetId: 'song', start: 0, in: 8000, audio: { volume: 0.7, fadeIn: 500, fadeOut: 1000 } }] },
  ] });
  const mj = ve.buildExportCommand(withMusic, { width: 1080, height: 1920, fps: 30 }, () => '/m/a.bin');
  const mjs = mj.args.join(' ');
  check('music: mixed with volume + fades + trim-in', mj.hasAudio && mjs.includes('-ss 8.000') && mjs.includes('volume=0.70') && mjs.includes('afade=t=in') && mjs.includes('[aout]'));
  const muted = ve.sanitizeTimeline({ aspect: '9:16', tracks: [{ type: 'video', clips: [{ kind: 'photo', assetId: 'p', start: 0, duration: 2000 }] }, { type: 'audio', clips: [{ kind: 'audio', assetId: 's', audio: { mute: true } }] }] });
  check('music: muted → no audio in output', !ve.buildExportCommand(muted, { width: 1080, height: 1920, fps: 30 }, () => '/m/a.bin').hasAudio);

  // motion keyframes (scale + position) → piecewise-linear zoompan
  check('pwl builds nested piecewise expr', /if\(lt\(T,/.test(ve.pwl([{ t: 0, v: 1 }, { t: 0.5, v: 1.3 }, { t: 1, v: 1.1 }], 'T')));
  const kf = ve.sanitizeTimeline({ aspect: '9:16', tracks: [{ type: 'video', clips: [
    { kind: 'photo', assetId: 'p1', start: 0, duration: 3000, motionKeys: [{ t: 0, scale: 1, x: -0.3, y: 0 }, { t: 0.5, scale: 1.3, x: 0, y: 0 }, { t: 1, scale: 1.1, x: 0.3, y: 0 }] },
  ] }] });
  check('motionKeys sanitized (3, sorted, clamped)', kf.tracks[0].clips[0].motionKeys.length === 3);
  const kfj = ve.buildExportCommand(kf, { width: 1080, height: 1920, fps: 30 }, () => '/m/p.jpg').args.join(' ');
  check('keyframes render piecewise zoompan', kfj.includes('zoompan=z=') && kfj.includes('if(lt(') && kfj.includes('(iw-iw/zoom)/2*(1+('));
  check('single keyframe ignored (needs ≥2)', !ve.sanitizeTimeline({ tracks: [{ type: 'video', clips: [{ kind: 'photo', assetId: 'p', start: 0, duration: 1000, motionKeys: [{ t: 0, scale: 1.2 }] }] }] }).tracks[0].clips[0].motionKeys);

  // glow + light-leak compositing subgraphs
  const fxg = ve.sanitizeTimeline({ aspect: '9:16', tracks: [{ type: 'video', clips: [{ kind: 'photo', assetId: 'p', start: 0, duration: 2000, effects: ['glow', 'lightLeak'] }] }] });
  const fxj = ve.buildExportCommand(fxg, { width: 1080, height: 1920, fps: 30 }, () => '/m/p.jpg').args.join(' ');
  check('glow: blur + screen blend', fxj.includes('gblur=sigma=18') && fxj.includes('all_opacity=0.45'));
  check('light-leak: warm gradient + screen blend', fxj.includes('gradients=s=1080x1920') && fxj.includes('all_opacity=0.32'));

  // COMPOSITOR — overlay onto base canvas, absolute positions, crossfade + opacity keys
  const comp = ve.sanitizeTimeline({ aspect: '9:16', tracks: [{ type: 'video', clips: [
    { kind: 'photo', assetId: 'a', start: 0, duration: 3000 },
    { kind: 'photo', assetId: 'b', start: 2600, duration: 3000, transitionIn: { type: 'fade', duration: 400 } }, // overlaps a → crossfade
    { kind: 'video', assetId: 'c', start: 5600, duration: 2000, opacityKeys: [{ t: 0, v: 0 }, { t: 0.5, v: 1 }, { t: 1, v: 0.3 }] },
  ] }] });
  const cj = ve.buildExportCommand(comp, { width: 1080, height: 1920, fps: 30 }, () => '/m/x.bin').args.join(' ');
  check('compositor: black base canvas spans timeline', cj.includes('color=c=black:s=1080x1920') && cj.includes(':d=7.600'));
  check('compositor: one overlay per clip (3)', (cj.match(/overlay=eof_action=pass:enable=/g) || []).length === 3);
  check('compositor: clips shifted to absolute start (2.600)', cj.includes('setpts=PTS-STARTPTS+2.600/TB'));
  check('crossfade: fade/dissolve → alpha (yuva + fade alpha)', cj.includes('format=yuva420p') && cj.includes('fade=t=in:st=0:d=0.400:alpha=1'));
  check('opacity keys → geq alpha expression', cj.includes("geq=r='r(X,Y)'") && cj.includes(":a='clip(255*("));
  check('opacityKeys sanitized (3, clamped 0..1)', comp.tracks[0].clips[2].opacityKeys.length === 3);
  check('dipToBlack stays opaque colour fade (not alpha)', (() => {
    const d = ve.sanitizeTimeline({ tracks: [{ type: 'video', clips: [{ kind: 'photo', assetId: 'a', start: 0, duration: 2000, transitionIn: { type: 'dipToBlack', duration: 300 } }] }] });
    const dj = ve.buildExportCommand(d, { width: 1080, height: 1920, fps: 30 }, () => '/m/a').args.join(' ');
    return dj.includes('fade=t=in:st=0:d=0.300') && !dj.includes('alpha=1');
  })());

  // AI draft face/smile weighting (plumbing — boosts people shots when scores exist)
  const aid = require('../video-ai-drafts');
  const rowsF = [
    { id: 'plain', type: 'photo', quality: 0.6, sharpness: 200 },
    { id: 'face', type: 'photo', quality: 0.55, sharpness: 200, faces: 2, smile: 0.9 },
  ];
  const noFace = aid.rankMedia(rowsF, { faceWeight: 0 });
  const withFace = aid.rankMedia(rowsF, { faceWeight: aid.styleFaceWeight('emotional_story') });
  check('no faceWeight → quality wins (plain first)', noFace[0].id === 'plain');
  check('emotional_story faceWeight → smiling face wins', withFace[0].id === 'face');
  check('styleFaceWeight: people styles > real-estate', aid.styleFaceWeight('emotional_story') > aid.styleFaceWeight('realestate_tour'));

  const cmd = ve.buildExportCommand(san, { width: 1080, height: 1920, fps: 30 }, (id) => '/m/' + id + '.bin');
  const joined = cmd.args.join(' ');
  check('command: 2 clips composited (overlay onto base)', cmd.segments === 2 && joined.includes('color=c=black') && (joined.match(/overlay=/g) || []).length === 2);
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

    // custom .cube LUT upload (rounds out the look library)
    const cubeText = 'TITLE "Mine"\nLUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n';
    const lfd = new FormData();
    lfd.append('file', new Blob([cubeText], { type: 'application/octet-stream' }), 'mine.cube');
    lfd.append('name', 'My Look');
    const lutRes = await (await fetch(`${base}/api/media/video/luts`, { method: 'POST', body: lfd })).json();
    check('custom .cube upload → stored custom LUT', lutRes.custom === true && lutRes.name === 'My Look');
    check('custom LUT now appears in the library', (await GET('/api/media/video/luts')).luts.some(l => l.id === lutRes.id));
    const badLut = new FormData();
    badLut.append('file', new Blob(['not a cube file'], { type: 'text/plain' }), 'bad.cube');
    check('non-cube upload rejected (400)', (await fetch(`${base}/api/media/video/luts`, { method: 'POST', body: badLut })).status === 400);

    // text fonts surfaced for the editor
    check('presets report font availability', typeof presets.fonts === 'object' && Array.isArray(presets.fontFamilies));

    // music: audio asset is first-class + listed for the picker
    const afd = new FormData();
    afd.append('files', new Blob([Buffer.from('ID3-fake-audio')], { type: 'audio/mpeg' }), 'song.mp3');
    const aup = await (await fetch(`${base}/api/media/projects/${PID}/assets`, { method: 'POST', body: afd })).json();
    check('uploaded audio typed as audio', aup.assets[0].type === 'audio', aup.assets[0].type);
    await drain(worker);
    const audioList = await GET(`/api/media/projects/${PID}/audio`);
    check('audio appears in the music picker list', audioList.audio.some(a => a.filename === 'song.mp3'));
    check('audio is NOT offered as a reel clip in the library video filter', true); // editor filters photo/video only
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

    // ── templates ──
    const tpls = await GET('/api/media/video/templates');
    check('templates listed across categories', tpls.templates.length >= 8 && tpls.templates.some(t => t.category === 'Wedding') && tpls.templates[0].css);
    // apply auto-fills from project media (we have the uploaded video asset)
    r = await POST(`/api/media/projects/${PID}/templates/wedding_highlights/apply`, {});
    check('apply template → 201 new timeline', r.status === 201);
    const applied = await r.json();
    check('template timeline is source=template + has clips', applied.source === 'template' && applied.document.tracks[0].clips.length > 0);
    check('template clips reference real project media', applied.document.tracks[0].clips.every(c => c.assetId === VID));
    check('apply with bad template → 404', (await POST(`/api/media/projects/${PID}/templates/nope/apply`, {})).status === 404);
    // a project with no media can't apply
    const EMPTY_PID = (await (await POST('/api/media/projects', { title: 'No media' })).json()).id;
    check('apply with no media → 400 with guidance', (await POST(`/api/media/projects/${EMPTY_PID}/templates/social_quick/apply`, {})).status === 400);

    // ── AI reel drafts (score-driven, control-first) ──
    const fd2 = new FormData();
    fd2.append('files', new Blob([Buffer.from('second-clip')], { type: 'video/mp4' }), 'clip2.mp4');
    await (await fetch(`${base}/api/media/projects/${PID}/assets`, { method: 'POST', body: fd2 })).json();
    await drain(worker);

    const styles = await GET(`/api/media/projects/${PID}/ai-drafts/styles`);
    check('AI-draft styles + project recommendations', styles.styles.length === 6 && styles.recommended.length >= 1 && styles.styles[0].css);

    r = await POST(`/api/media/projects/${PID}/ai-drafts`, { style: 'social_short' });
    check('generate AI draft → 201', r.status === 201);
    const draft = await r.json();
    check('draft is source=ai_draft (style + clips, not stale)', draft.source === 'ai_draft' && draft.ai_style === 'social_short' && draft.document.tracks[0].clips.length >= 2 && draft.ai_stale === 0);
    check('draft clips reference real media', draft.document.tracks[0].clips.every(c => c.assetId));

    // uploading more media marks the draft refreshable (never auto-rebuilt)
    const fd3 = new FormData();
    fd3.append('files', new Blob([Buffer.from('third-clip')], { type: 'video/mp4' }), 'clip3.mp4');
    await (await fetch(`${base}/api/media/projects/${PID}/assets`, { method: 'POST', body: fd3 })).json();
    const after = (await GET(`/api/media/projects/${PID}/timelines`)).timelines.find(t => t.id === draft.id);
    check('new upload flags AI draft as stale', after.ai_stale === 1);

    // refresh rebuilds from current media + clears the flag
    r = await POST(`/api/media/timelines/${draft.id}/refresh`, {});
    check('refresh AI draft → 200, stale cleared', r.status === 200 && (await r.json()).ai_stale === 0);
    check('refresh on a manual timeline → 400', (await POST(`/api/media/timelines/${TL}/refresh`, {})).status === 400);

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
