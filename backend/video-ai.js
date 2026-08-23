'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · VIDEO AI — intelligence-driven video (P7–P11).
 *    • P7 Video Intelligence — scores arrive via the Track-0 ingestion endpoints
 *      (analyzer 'video': shake/motion/quality/speech/emotion/scene_cut/action).
 *    • P8 Video Culling — best moments / clips / reactions, niche-aware.
 *    • P9 Template System — DATA-DRIVEN templates (slots/durations/transitions/
 *      motion/caption/music_markers). No hardcoded timelines. Marketplace-ready.
 *    • P10 Story Engine — narrative spec (hook→build→peak→resolve) from media.
 *    • P11 Reel Studio — fills a template from a story to a target length → a
 *      render PLAN (the existing video-engine renders it). Auto + manual.
 *  All advisory; the human approves/edits before render.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');

const videoEngine = require('./video-engine');

module.exports = function mountVideoAI(app, db, deps = {}) {
  const {
    auth = (req, res, next) => next(),
    generateId = () => crypto.randomUUID(),
    broadcastToWorkspace = () => {},
  } = deps;

  // This module writes ms_timelines, whose DDL and semantics belong to
  // media-studio.js. That only works because media-studio mounts first; make the
  // dependency explicit so a reordering fails loudly at boot.
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ms_timelines'").get()) {
    throw new Error('ms_timelines must be created by media-studio before video-ai mounts');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS ms_template_library (
      id TEXT PRIMARY KEY, workspace_id TEXT,  -- 'system' for built-ins
      kind TEXT DEFAULT 'reel', niche TEXT, name TEXT, def TEXT DEFAULT '{}',
      is_system INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ms_story_specs (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
      spec TEXT DEFAULT '{}', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ms_reel_plans (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
      story_id TEXT, template_id TEXT, length_s INTEGER, plan TEXT DEFAULT '{}',
      status TEXT DEFAULT 'draft', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
  const getProject = (ws, id) => db.prepare('SELECT * FROM ms_projects WHERE id = ? AND workspace_id = ?').get(id, ws);

  // ── P9: seed data-driven system templates (idempotent) ──────────────────────
  function slot(role, min, max, media, motion, tin) { return { role, min_ms: min, max_ms: max, media, motion, transition_in: tin }; }
  const SYSTEM_TEMPLATES = [
    { niche: 'wedding', name: 'Wedding Cinematic', def: { aspect: '9:16', slots: [slot('hook', 800, 1500, 'any', 'kenburns', 'fade'), slot('establish', 1200, 2200, 'video', 'pan', 'cut'), slot('build', 800, 1600, 'any', 'kenburns', 'cut'), slot('peak', 1200, 2400, 'video', 'static', 'whip'), slot('resolve', 1500, 2600, 'any', 'kenburns', 'fade')], caption_rules: { style: 'elegant', position: 'lower' }, music_markers: [0, 1500, 4000, 7000] } },
    { niche: 'real_estate', name: 'Real Estate Tour', def: { aspect: '16:9', slots: [slot('hook', 700, 1200, 'video', 'pan', 'cut'), slot('establish', 1500, 2500, 'video', 'pan', 'cut'), slot('build', 1200, 2000, 'video', 'pan', 'cut'), slot('peak', 1200, 2000, 'video', 'static', 'cut'), slot('resolve', 1200, 2000, 'any', 'kenburns', 'fade')], caption_rules: { style: 'clean', position: 'upper' }, music_markers: [0, 2000, 5000] } },
    { niche: 'restaurant', name: 'Restaurant Mood', def: { aspect: '9:16', slots: [slot('hook', 600, 1000, 'video', 'static', 'whip'), slot('build', 700, 1300, 'any', 'kenburns', 'cut'), slot('peak', 900, 1600, 'video', 'static', 'cut'), slot('resolve', 900, 1500, 'any', 'kenburns', 'fade')], caption_rules: { style: 'bold', position: 'center' }, music_markers: [0, 1000, 3000] } },
    { niche: 'fitness', name: 'Fitness Energy', def: { aspect: '9:16', slots: [slot('hook', 500, 900, 'video', 'static', 'whip'), slot('build', 500, 1000, 'video', 'static', 'cut'), slot('peak', 700, 1300, 'video', 'static', 'whip'), slot('resolve', 700, 1200, 'any', 'static', 'cut')], caption_rules: { style: 'bold', position: 'center' }, music_markers: [0, 800, 1600, 2400] } },
    { niche: 'travel', name: 'Travel Story', def: { aspect: '9:16', slots: [slot('hook', 800, 1400, 'any', 'kenburns', 'fade'), slot('establish', 1200, 2200, 'video', 'pan', 'cut'), slot('build', 900, 1600, 'any', 'kenburns', 'cut'), slot('peak', 1200, 2200, 'video', 'pan', 'whip'), slot('resolve', 1400, 2400, 'any', 'kenburns', 'fade')], caption_rules: { style: 'minimal', position: 'lower' }, music_markers: [0, 1500, 4000] } },
    { niche: 'corporate', name: 'Corporate Clean', def: { aspect: '16:9', slots: [slot('hook', 800, 1400, 'video', 'static', 'fade'), slot('build', 1200, 2200, 'any', 'static', 'cut'), slot('peak', 1200, 2000, 'video', 'static', 'cut'), slot('resolve', 1200, 2200, 'any', 'static', 'fade')], caption_rules: { style: 'clean', position: 'lower' }, music_markers: [0, 2500] } },
    { niche: 'commercial', name: 'Commercial Punch', def: { aspect: '1:1', slots: [slot('hook', 500, 900, 'video', 'static', 'whip'), slot('build', 700, 1300, 'any', 'kenburns', 'cut'), slot('peak', 900, 1500, 'video', 'static', 'whip'), slot('resolve', 800, 1400, 'any', 'kenburns', 'fade')], caption_rules: { style: 'bold', position: 'center' }, music_markers: [0, 900, 2200] } },
  ];
  function seedTemplates() {
    const have = db.prepare("SELECT COUNT(*) c FROM ms_template_library WHERE is_system = 1").get().c;
    if (have > 0) return;
    const ins = db.prepare("INSERT INTO ms_template_library (id, workspace_id, kind, niche, name, def, is_system) VALUES (?, 'system', 'reel', ?, ?, ?, 1)");
    db.transaction(() => SYSTEM_TEMPLATES.forEach(t => ins.run(generateId(), t.niche, t.name, JSON.stringify(t.def))))();
  }
  seedTemplates();


  // ── P8: video culling — rank video assets / scenes by purpose ───────────────
  function videoScores(projectId) {
    const rows = db.prepare(`SELECT s.asset_id, s.score_type, s.value FROM ms_asset_scores s
      JOIN ms_assets a ON a.id = s.asset_id WHERE a.project_id = ? AND a.type = 'video' AND a.deleted_at IS NULL`).all(projectId);
    const m = {}; for (const r of rows) { (m[r.asset_id] = m[r.asset_id] || {})[r.score_type] = r.value; } return m;
  }
  const VKIND = {
    best_moments: { hook: 0.5, emotion: 0.3, quality: 0.2 },
    best_clips:   { quality: 0.5, motion: 0.3, hook: 0.2 },
    best_reactions: { emotion: 0.7, quality: 0.3 },
    best_action:  { action: 0.6, motion: 0.4 },
    best_interviews: { speech: 0.6, quality: 0.4 },
    best_drone:   { motion: 0.5, quality: 0.5 },
  };

  // ── P10: Story Engine — assemble a narrative spec from project media ─────────
  function bestPhotoSelection(project) {
    // reuse studio-ai's highlights if present, else top hero scores
    const sel = db.prepare("SELECT asset_ids FROM ms_selections WHERE project_id = ? AND kind IN ('highlights','best_of') ORDER BY created_at DESC LIMIT 1").get(project.id);
    if (sel) return J(sel.asset_ids, []);
    return db.prepare(`SELECT s.asset_id FROM ms_asset_scores s JOIN ms_assets a ON a.id = s.asset_id
      WHERE a.project_id = ? AND a.type='photo' AND a.deleted_at IS NULL AND s.score_type='hero' ORDER BY s.value DESC LIMIT 30`).all(project.id).map(r => r.asset_id);
  }
  function generateStory(project) {
    const photos = bestPhotoSelection(project);
    const sc = videoScores(project.id);
    const vids = Object.keys(sc).map(id => ({ id, hook: sc[id].hook || 0, emotion: sc[id].emotion || 0, quality: sc[id].quality || 0 }))
      .sort((a, b) => (b.hook + b.emotion) - (a.hook + a.emotion));
    // beats: hook (strongest), establish (a video), build (photos), peak (emotional video/photo), resolve (warm)
    const beats = [];
    const hookAsset = vids[0]?.id || photos[0];
    if (hookAsset) beats.push({ role: 'hook', asset_id: hookAsset, reason: 'strongest opening (hook/emotion)' });
    if (vids[1]) beats.push({ role: 'establish', asset_id: vids[1].id, reason: 'scene-setting clip' });
    photos.slice(0, 6).forEach(p => beats.push({ role: 'build', asset_id: p, reason: 'high-scoring still' }));
    const peak = vids.find(v => v.emotion > 0.5) || vids[0];
    if (peak) beats.push({ role: 'peak', asset_id: peak.id, reason: 'emotional peak' });
    const closeAsset = photos[photos.length - 1] || hookAsset;
    if (closeAsset) beats.push({ role: 'resolve', asset_id: closeAsset, reason: 'warm close' });
    return { project_type: project.project_type, hook_asset_id: hookAsset, close_asset_id: closeAsset, pacing: 'medium', beats };
  }

  // ── P11: Reel Studio — fill a template from a story to a target length ──────
  app.post('/api/video-ai/projects/:id/reel', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const lengthS = [15, 30, 60, 90].includes(Number(req.body.length_s)) ? Number(req.body.length_s) : 30;
      // story: use given or generate
      let story; let storyId = req.body.story_id;
      if (storyId) { const r = db.prepare('SELECT spec FROM ms_story_specs WHERE id = ? AND project_id = ?').get(storyId, project.id); story = r ? J(r.spec, null) : null; }
      if (!story) { story = generateStory(project); storyId = generateId(); db.prepare('INSERT INTO ms_story_specs (id, workspace_id, project_id, spec) VALUES (?,?,?,?)').run(storyId, req.workspaceId, project.id, JSON.stringify(story)); }
      // template: given or pick by niche
      let tpl;
      if (req.body.template_id) tpl = db.prepare('SELECT * FROM ms_template_library WHERE id = ?').get(req.body.template_id);
      if (!tpl) tpl = db.prepare("SELECT * FROM ms_template_library WHERE is_system = 1 AND niche = ? LIMIT 1").get(project.project_type) || db.prepare("SELECT * FROM ms_template_library WHERE is_system = 1 LIMIT 1").get();
      const def = tpl ? J(tpl.def, {}) : { slots: [] };
      const totalMs = lengthS * 1000;
      const beats = story.beats || [];
      // distribute target length across beats by template slot order (cycle slots if more beats)
      const per = Math.max(600, Math.floor(totalMs / Math.max(1, beats.length)));
      const timeline = beats.map((b, i) => {
        const s = (def.slots && def.slots[i % (def.slots.length || 1)]) || { motion: 'kenburns', transition_in: 'cut' };
        const dur = Math.min(s.max_ms || per, Math.max(s.min_ms || 500, per));
        return { asset_id: b.asset_id, role: b.role, in_ms: 0, out_ms: dur, duration_ms: dur, motion: s.motion, transition: s.transition_in, caption: null };
      });
      const plan = { length_s: lengthS, aspect: def.aspect || '9:16', music_markers: def.music_markers || [], timeline, mode: req.body.mode || 'auto' };

      // Phase 6: the Story Engine used to save its plan in a private shape
      // (ms_reel_plans) that only its own editor could read — an editor with no
      // render and no export, so the work dead-ended there. It now produces the
      // SAME artifact every other path produces: a real ms_timelines row, which
      // opens in the one timeline editor and can actually be exported.
      const aspect = def.aspect || '9:16';
      const doc = {
        version: 1, aspect, fps: 30,
        tracks: [{
          id: 'v1', type: 'video',
          clips: timeline.map((c, i) => ({
            id: 'c' + i,
            assetId: c.asset_id,
            start: timeline.slice(0, i).reduce((a, x) => a + (x.duration_ms || 0), 0),
            duration: c.duration_ms,
            in: c.in_ms || 0,
            out: c.out_ms || c.duration_ms,
            // 'cut'/'whip' are the planner's vocabulary; video-engine resolves
            // them to what the renderer can actually draw.
            transitionIn: i === 0 ? null : { type: c.transition || 'fade', duration: 400 },
            kenBurns: /kenburns|pan|zoom/i.test(c.motion || '')
              ? { fromScale: 1, toScale: 1.12, fromX: 0, toX: i % 2 ? 0.06 : -0.06, fromY: 0, toY: 0 }
              : undefined,
          })),
        }],
      };
      const san = videoEngine.sanitizeTimeline(doc);
      const id = generateId();
      db.prepare(`INSERT INTO ms_timelines (id, workspace_id, project_id, name, source, aspect_ratio, width, height, fps, duration_ms, document, status, created_by)
        VALUES (?,?,?,?, 'ai_reel', ?,?,?,?,?, ?, 'ready', ?)`)
        .run(id, req.workspaceId, project.id, tpl ? `${tpl.name}` : 'Story reel',
             san.aspect, san.width, san.height, san.fps, san.duration, JSON.stringify(san), req.userId);
      // reel_id is kept in the response under its old name so existing callers do
      // not break; it now identifies a TIMELINE.
      res.json({ ok: true, reel_id: id, timeline_id: id, story_id: storyId, template: tpl ? tpl.name : null, plan });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};
