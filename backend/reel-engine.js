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

module.exports = function mountReelEngine(app, db, deps = {}) {
  const { auth = (req, res, next) => next() } = deps;

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

  console.log('🎬 Reel/Story planning engine mounted (POST /api/media/projects/:id/reel-plan)');
  return { buildPlan };
};
