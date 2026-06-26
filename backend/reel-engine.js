'use strict';

// ════════════════════════════════════════════════════════════════════════════
//  REEL / STORY ENGINE  (Final Vision · Phase 8 — planning layer)
//  Turns a project's analyzed assets (Track-0 scores) into a STORY-STRUCTURED
//  reel plan — an ordered shot list with roles (hook → build → climax → outro),
//  grouped by scene and ranked by hero/aesthetic. This is the deterministic
//  planning brain; actual clip frame-analysis + rendering are the tracked
//  follow-ups (ffmpeg + models + the existing video-engine export path).
//
//  Advisory-only + non-destructive: it reads scores, writes nothing. A human
//  approves/edits the plan before any render.
// ════════════════════════════════════════════════════════════════════════════

const videoEngine = require('./video-engine');
const styleApply = require('./style-apply');

module.exports = function mountReelEngine(app, db, deps = {}) {
  const { auth = (req, res, next) => next(), generateId = () => require('crypto').randomUUID(), logAudit = () => {} } = deps;

  // Per-role clip lengths + crossfade overlap (ms). Tuned for a punchy social reel.
  const ROLE_DUR = { hook: 2800, build: 2200, climax: 3000, outro: 3400 };
  const OVERLAP = 350;

  // PURE: reel plan → a Media-Studio timeline EDL (the video-engine renders this).
  // A 9:16 video track of the plan's segments — photos get a gentle alternating Ken
  // Burns push, every cut is a crossDissolve, with a title card + optional music.
  function planToTimeline(plan, opts = {}) {
    const segs = plan.segments || [];
    const clips = [];
    let cursor = 0;
    segs.forEach((seg, i) => {
      const dur = ROLE_DUR[seg.role] || 2400;
      const start = i === 0 ? 0 : Math.max(0, cursor - OVERLAP);
      const isVideo = seg.type === 'video';
      const dir = i % 2 ? -1 : 1;
      const clip = {
        id: `rc_${i}`, kind: isVideo ? 'video' : 'photo', assetId: seg.asset_id,
        start, duration: dur, in: 0,
        transitionIn: i > 0 ? { type: 'crossDissolve', duration: OVERLAP } : { type: 'fade', duration: 500 },
        transitionOut: i < segs.length - 1 ? { type: 'crossDissolve', duration: OVERLAP } : { type: 'fade', duration: 600 },
      };
      if (!isVideo) clip.kenBurns = { fromScale: 1.0, toScale: 1.12, fromX: dir * 0.04, toX: -dir * 0.04, fromY: -0.02, toY: 0.03 };
      // Auto-apply house style: bake a subtle colour grade nudging this clip toward the
      // learned style profile (opt-in via styleByAsset; non-destructive — grades the render).
      const grade = (opts.styleByAsset || {})[seg.asset_id];
      if (styleApply.hasGrade(grade)) clip.color = { brightness: grade.brightness || 0, contrast: grade.contrast || 0, saturation: grade.saturation || 0 };
      clips.push(clip);
      cursor = start + dur;
    });
    const tracks = [{ id: 'v1', type: 'video', clips }];
    if (opts.title) {
      tracks.push({ id: 'txt', type: 'text', clips: [{ id: 'title', start: 200, duration: 2600,
        text: { content: String(opts.title).slice(0, 80), type: 'heading', size: 64, weight: 800, color: '#ffffff', align: 'center', animation: 'fade' },
        transform: { x: 0, y: -0.05, opacity: 1 } }] });
    }
    if (opts.music_asset_id) {
      tracks.push({ id: 'aud', type: 'audio', clips: [{ id: 'music', start: 0, duration: cursor, assetId: String(opts.music_asset_id), in: 0,
        audio: { volume: 0.8, fadeIn: 400, fadeOut: 1200 } }] });
    }
    return { version: 1, aspect: '9:16', fps: 30, quality: 1080, preset: opts.preset || 'ig_reel', tracks };
  }

  function scoreMap(assetIds) {
    const map = {};
    if (!assetIds.length) return map;
    const rows = db.prepare(
      `SELECT asset_id, score_type, value, reasons FROM ms_asset_scores WHERE asset_id IN (${assetIds.map(() => '?').join(',')})`
    ).all(...assetIds);
    for (const r of rows) {
      const a = (map[r.asset_id] = map[r.asset_id] || {});
      a[r.score_type] = r.value;
      if (r.score_type === 'scene_class' && r.reasons) { try { a.scene = JSON.parse(r.reasons).label; } catch {} }
    }
    return map;
  }

  // Build the story-arc plan from scored assets.
  function buildPlan(assets, target) {
    const scored = assets.map(a => {
      const s = a.scores || {};
      const aesthetic = s.aesthetic || 0;
      const hero = s.hero != null ? s.hero : aesthetic; // composite if present, else aesthetic
      const faces = s.face_count || 0;
      const scene = s.scene || (faces ? 'portrait' : 'scene');
      // "energy" = grabbiness for the opening hook
      const energy = aesthetic * 0.5 + (s.composition || 0) * 0.2 + Math.min(1, faces / 3) * 0.3;
      return { asset_id: a.id, type: a.type, hero: +hero.toFixed(3), aesthetic: +aesthetic.toFixed(3), faces, scene, energy: +energy.toFixed(3) };
    });
    if (!scored.length) return { structure: [], segments: [] };

    const byHero = [...scored].sort((x, y) => y.hero - x.hero);
    const used = new Set();
    const take = (arr, pred) => { const f = arr.find(x => !used.has(x.asset_id) && (!pred || pred(x))); if (f) used.add(f.asset_id); return f; };

    const hook = take([...scored].sort((x, y) => y.energy - x.energy));         // grabbiest opener
    const climax = take(byHero);                                                 // best shot as the peak
    const outro = take(byHero, x => x.scene === 'landscape' || x.faces === 0)    // calm/wide closer
                 || take([...scored].sort((x, y) => x.energy - y.energy));       // else the calmest

    // Body: remaining, grouped by scene then hero, capped to the target length.
    const bodyPool = byHero.filter(x => !used.has(x.asset_id));
    const byScene = {};
    for (const s of bodyPool) (byScene[s.scene] = byScene[s.scene] || []).push(s);
    const body = [];
    const sceneOrder = Object.keys(byScene).sort((a, b) => byScene[b].length - byScene[a].length);
    let i = 0;
    while (body.length < Math.max(0, (target || 12) - 3)) {
      let added = false;
      for (const sc of sceneOrder) { const next = byScene[sc][i]; if (next) { body.push(next); added = true; } }
      if (!added) break; i++;
    }

    const segments = [];
    if (hook) segments.push({ ...hook, role: 'hook' });
    body.forEach(b => segments.push({ ...b, role: 'build' }));
    if (climax && !segments.some(s => s.asset_id === climax.asset_id)) segments.push({ ...climax, role: 'climax' });
    if (outro && !segments.some(s => s.asset_id === outro.asset_id)) segments.push({ ...outro, role: 'outro' });

    const structure = [...new Set(segments.map(s => s.role))].map(role => ({ role, count: segments.filter(s => s.role === role).length }));
    return { structure, segments };
  }

  // POST /api/media/projects/:id/reel-plan { target_count? } → story-arc shot list
  app.post('/api/media/projects/:id/reel-plan', auth, (req, res) => {
    try {
      const project = db.prepare('SELECT id FROM ms_projects WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const assets = db.prepare("SELECT id, type FROM ms_assets WHERE project_id = ? AND workspace_id = ?").all(req.params.id, req.workspaceId);
      const sm = scoreMap(assets.map(a => a.id));
      assets.forEach(a => { a.scores = sm[a.id] || {}; });
      const target = Math.max(3, Math.min(40, parseInt(req.body && req.body.target_count, 10) || 12));
      const plan = buildPlan(assets, target);
      res.json({ project_id: req.params.id, target_count: target, asset_count: assets.length, ...plan, note: 'advisory plan — review/edit before render' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/media/projects/:id/reel-render { target_count?, preset?, quality?, title?, music_asset_id? }
  // Build the plan → compose a timeline → enqueue a real video render (the existing
  // video-engine export path). This is a deliberate human action (not the advisory
  // plan), so it WRITES: a timeline + an export job. Returns ids to poll/download.
  app.post('/api/media/projects/:id/reel-render', auth, (req, res) => {
    try {
      const project = db.prepare('SELECT id FROM ms_projects WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const assets = db.prepare("SELECT id, type FROM ms_assets WHERE project_id = ? AND workspace_id = ? AND deleted_at IS NULL").all(req.params.id, req.workspaceId);
      const sm = scoreMap(assets.map(a => a.id));
      assets.forEach(a => { a.scores = sm[a.id] || {}; });
      const target = Math.max(3, Math.min(40, parseInt(req.body && req.body.target_count, 10) || 12));
      const plan = buildPlan(assets, target);
      if (!plan.segments.length) return res.status(400).json({ error: 'No analyzed assets to build a reel from — run analysis first.' });

      const opts = { preset: req.body && req.body.preset, title: req.body && req.body.title, music_asset_id: req.body && req.body.music_asset_id };
      // Auto-apply the house style: grade each clip toward the learned style profile
      // (on by default; pass auto_style:false to skip). Skipped silently if no profile yet.
      let autoStyle = false;
      if (!(req.body && req.body.auto_style === false)) {
        try {
          const prof = db.prepare("SELECT profile FROM style_profiles WHERE workspace_id = ? AND scope = 'workspace' AND scope_id = ?").get(req.workspaceId, req.workspaceId);
          const target = prof ? JSON.parse(prof.profile) : null;
          if (target && (target.exposure || target.contrast || target.colourfulness)) {
            const ids = plan.segments.map(s => s.asset_id);
            const rows = db.prepare(`SELECT asset_id, reasons FROM ms_asset_scores WHERE score_type = 'aesthetic' AND asset_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
            const map = {};
            for (const r of rows) {
              let m = {}; try { m = JSON.parse(r.reasons) || {}; } catch {}
              map[r.asset_id] = styleApply.styleAdjust({ exposure: m.exposure, contrast: m.contrast, colourfulness: m.colourfulness }, target).adjust;
            }
            opts.styleByAsset = map; autoStyle = true;
          }
        } catch { /* no profile / best-effort → render ungraded */ }
      }
      const doc = planToTimeline(plan, opts);
      const san = videoEngine.sanitizeTimeline(doc);

      const timelineId = generateId();
      db.prepare(`INSERT INTO ms_timelines (id, workspace_id, project_id, name, source, aspect_ratio, width, height, fps, duration_ms, document, status, created_by)
        VALUES (?,?,?,?, 'ai_reel', ?,?,?,?,?, ?, 'ready', ?)`)
        .run(timelineId, req.workspaceId, project.id, (opts.title || 'AI Reel'), san.aspect, san.width, san.height, san.fps, san.duration, JSON.stringify(doc), req.userId);

      const presetId = videoEngine.EXPORT_PRESETS[opts.preset] ? opts.preset : 'ig_reel';
      const preset = videoEngine.EXPORT_PRESETS[presetId];
      const quality = videoEngine.QUALITIES[req.body && req.body.quality] ? Number(req.body.quality) : 1080;
      const aspect = preset.aspect || san.aspect;
      const { width, height } = videoEngine.dimsFor(aspect, quality);
      const exportId = generateId();
      db.prepare(`INSERT INTO ms_video_exports (id, workspace_id, timeline_id, project_id, preset, width, height, fps, quality, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(exportId, req.workspaceId, timelineId, project.id, presetId, width, height, san.fps, quality, req.userId);
      db.prepare(`INSERT INTO ms_jobs (id, workspace_id, type, project_id, status, payload) VALUES (?,?,'video_export',?,'pending',?)`)
        .run(generateId(), req.workspaceId, project.id, JSON.stringify({ export_id: exportId }));

      try { logAudit(req.workspaceId, req.userId, 'reel_render', 'ms_project', project.id, { preset: presetId, segments: plan.segments.length }); } catch {}
      res.status(202).json({ timeline_id: timelineId, export_id: exportId, segments: plan.segments.length, duration_ms: san.duration, structure: plan.structure, preset: presetId, auto_style: autoStyle, status: 'rendering', note: 'rendering — poll GET /api/media/exports/:export_id' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('🎬 Reel/Story engine mounted (POST /api/media/projects/:id/reel-plan + /reel-render)');
  return { buildPlan, planToTimeline };
};
