'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · STUDIO AI — generation engine (P2–P6, P13, P16-photo).
 *  Pure consumer of the Track-0 intelligence layer (ms_asset_scores). Produces:
 *    • Selections   (best_of / highlights / portfolio / album / delivery)  P2
 *    • Style profiles                                                       P3
 *    • Auto-edit suggestions (non-destructive params)                       P4
 *    • Gallery builder (selection → gallery)                                P5
 *    • Album drafts (story-aware, dup-safe spreads)                         P6
 *    • Portfolio recommendations                                           P13
 *  Advisory + non-destructive: writes its own tables + draft galleries/albums;
 *  the human approves. Never edits originals; never touches WhatsApp.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');

module.exports = function mountStudioAI(app, db, deps = {}) {
  const {
    auth = (req, res, next) => next(),
    generateId = () => crypto.randomUUID(),
    broadcastToWorkspace = () => {},
  } = deps;

  db.exec(`
    CREATE TABLE IF NOT EXISTS ms_selections (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
      kind TEXT, asset_ids TEXT DEFAULT '[]', rationale TEXT DEFAULT '{}',
      params TEXT DEFAULT '{}', created_by TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ms_style_profiles (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT,
      params TEXT DEFAULT '{}', is_default INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ms_albums (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
      title TEXT, page_count INTEGER, spec TEXT DEFAULT '{}', status TEXT DEFAULT 'draft',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ms_selections_project ON ms_selections(project_id);
  `);

  const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
  const getProject = (ws, id) => db.prepare('SELECT * FROM ms_projects WHERE id = ? AND workspace_id = ?').get(id, ws);

  // primitives + composites per asset for a project
  function scoresByAsset(projectId) {
    const rows = db.prepare(`SELECT s.asset_id, s.score_type, s.value, s.group_key, s.reasons
      FROM ms_asset_scores s JOIN ms_assets a ON a.id = s.asset_id WHERE a.project_id = ? AND a.deleted_at IS NULL`).all(projectId);
    const m = {};
    for (const r of rows) { (m[r.asset_id] = m[r.asset_id] || {})[r.score_type] = { value: r.value, group_key: r.group_key, reasons: r.reasons ? J(r.reasons, null) : null }; }
    return m;
  }
  const sv = (s, k) => (s[k] ? Number(s[k].value) : null);
  const dupKey = (s) => (s.dup_cluster && s.dup_cluster.group_key) || (s.duplicate_group && s.duplicate_group.group_key) || null;

  // base weights per selection kind, over composite scores (0..1)
  const KIND = {
    best_of:    { weights: { hero: 1 },                              count: 0.08, min: 8,  max: 40, label: 'Best Of' },
    highlights: { weights: { hero: 0.7, storytelling: 0.3 },         count: 0.15, min: 12, max: 60, label: 'Highlights' },
    portfolio:  { weights: { portfolio: 1 },                          count: 0.05, min: 6,  max: 30, label: 'Portfolio Picks' },
    album:      { weights: { album: 1 },                              count: 0.2,  min: 20, max: 80, label: 'Album Picks' },
    delivery:   { weights: { hero: 0.5, portfolio: 0.3 },             count: 1,    min: 0,  max: 100000, threshold: 0.32, label: 'Client Delivery' },
  };
  // niche nudges — re-weight by project type (additive on top of base)
  const NICHE = {
    wedding:     { storytelling: 0.25, hero: 0.1 },
    portrait:    { hero: 0.2 },
    commercial:  { portfolio: 0.25 },
    product:     { portfolio: 0.3 },
    real_estate: { portfolio: 0.2 },
    event:       { storytelling: 0.3 },
  };

  function scoreFor(s, kind, projectType) {
    const base = KIND[kind].weights;
    const niche = NICHE[projectType] || {};
    const w = { ...base };
    for (const k in niche) w[k] = (w[k] || 0) + niche[k];
    let total = 0, wsum = 0;
    for (const k in w) { const val = sv(s, k); if (val != null) { total += w[k] * val; wsum += w[k]; } }
    // fallback to technical sharpness if no composites yet
    if (wsum === 0) { const sh = sv(s, 'sharpness'); return sh != null ? Math.min(1, sh / 240) : 0.3; }
    return total / wsum;
  }
  function topReasons(s) {
    const out = [];
    if (s.hero && s.hero.reasons) out.push(...s.hero.reasons.slice(0, 4));
    else { for (const k of ['sharpness', 'exposure', 'composition', 'aesthetic', 'eyes_open', 'smile']) if (s[k]) out.push(`${k}:${Number(s[k].value).toFixed(2)}`); }
    return out.slice(0, 5);
  }

  // ── P2: generate a named selection ──────────────────────────────────────────
  function generateSelection(project, kind, opts = {}) {
    const cfg = KIND[kind]; if (!cfg) return null;
    const byAsset = scoresByAsset(project.id);
    const allAssets = db.prepare("SELECT id FROM ms_assets WHERE project_id = ? AND deleted_at IS NULL AND type = 'photo'").all(project.id).map(a => a.id);
    const scored = allAssets.map(id => { const s = byAsset[id] || {}; return { id, score: scoreFor(s, kind, project.project_type), dup: dupKey(s), reasons: topReasons(s) }; });
    // dedup-aware: within a duplicate cluster keep only the best
    const bestPerGroup = {};
    for (const a of scored) { if (!a.dup) continue; if (!bestPerGroup[a.dup] || a.score > bestPerGroup[a.dup].score) bestPerGroup[a.dup] = a; }
    const filtered = scored.filter(a => !a.dup || bestPerGroup[a.dup].id === a.id);
    filtered.sort((x, y) => y.score - x.score);
    let chosen;
    if (kind === 'delivery') chosen = filtered.filter(a => a.score >= (opts.threshold ?? cfg.threshold));
    else { const n = Math.max(cfg.min, Math.min(cfg.max, opts.count || Math.round(allAssets.length * cfg.count))); chosen = filtered.slice(0, n); }
    const rationale = {}; chosen.forEach(a => { rationale[a.id] = { score: Math.round(a.score * 100) / 100, reasons: a.reasons }; });
    const id = generateId();
    db.prepare('INSERT INTO ms_selections (id, workspace_id, project_id, kind, asset_ids, rationale, params, created_by) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, project.workspace_id, project.id, kind, JSON.stringify(chosen.map(a => a.id)), JSON.stringify(rationale), JSON.stringify(opts), opts.userId || null);
    return { id, kind, label: cfg.label, count: chosen.length, asset_ids: chosen.map(a => a.id), rationale };
  }

  app.post('/api/studio-ai/projects/:id/selections', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const kind = req.body.kind || 'best_of';
      if (!KIND[kind]) return res.status(400).json({ error: 'Unknown selection kind' });
      const result = generateSelection(project, kind, { ...req.body, userId: req.userId });
      broadcastToWorkspace(req.workspaceId, 'ms_selection', { project_id: project.id, kind });
      res.json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/studio-ai/projects/:id/selections', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const rows = db.prepare('SELECT id, kind, asset_ids, rationale, created_at FROM ms_selections WHERE project_id = ? ORDER BY created_at DESC').all(project.id)
        .map(r => ({ ...r, asset_ids: J(r.asset_ids, []), rationale: J(r.rationale, {}), label: (KIND[r.kind] || {}).label || r.kind }));
      res.json({ selections: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── P5: build a gallery from a selection ────────────────────────────────────
  app.post('/api/studio-ai/projects/:id/gallery-from-selection', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      let assetIds = [];
      if (req.body.selection_id) { const sel = db.prepare('SELECT asset_ids FROM ms_selections WHERE id = ? AND project_id = ?').get(req.body.selection_id, project.id); assetIds = sel ? J(sel.asset_ids, []) : []; }
      else if (req.body.kind) { const gen = generateSelection(project, req.body.kind, { userId: req.userId }); assetIds = gen ? gen.asset_ids : []; }
      if (!assetIds.length) return res.status(400).json({ error: 'No assets to add — analyze the project first.' });
      const gid = generateId();
      const title = req.body.title || `${project.title} — ${(KIND[req.body.kind] || {}).label || 'Highlights'}`;
      db.prepare('INSERT INTO ms_galleries (id, workspace_id, project_id, title, visibility) VALUES (?,?,?,?,?)').run(gid, project.workspace_id, project.id, title, 'private');
      const ins = db.prepare('INSERT OR IGNORE INTO ms_gallery_assets (gallery_id, asset_id, sort_order) VALUES (?,?,?)');
      db.transaction(() => { assetIds.forEach((aid, i) => ins.run(gid, aid, i)); })();
      broadcastToWorkspace(req.workspaceId, 'ms_gallery_created', { project_id: project.id });
      res.json({ ok: true, gallery_id: gid, count: assetIds.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── P6: album draft — story-ordered, dup-safe spreads ───────────────────────
  app.post('/api/studio-ai/projects/:id/album', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const pages = [20, 30, 40, 60].includes(Number(req.body.pages)) ? Number(req.body.pages) : 30;
      // source assets: an album selection (generate if absent), ordered by capture time
      const gen = generateSelection(project, 'album', { userId: req.userId, max: pages * 4 });
      const ids = gen.asset_ids;
      const order = db.prepare(`SELECT id FROM ms_assets WHERE id IN (${ids.map(() => '?').join(',') || "''"}) ORDER BY capture_time IS NULL, capture_time, created_at`).all(...ids).map(r => r.id);
      const seq = order.length ? order : ids;
      // distribute across spreads (≈ ceil to pages/2 spreads), 1–4 images per spread
      const spreadCount = Math.max(1, Math.round(pages / 2));
      const perSpread = Math.max(1, Math.ceil(seq.length / spreadCount));
      const spreads = [];
      for (let i = 0; i < seq.length; i += perSpread) {
        const imgs = seq.slice(i, i + perSpread);
        spreads.push({ layout: `grid-${imgs.length}`, asset_ids: imgs });
      }
      const albumId = generateId();
      const spec = { pages, spreads, source_selection: gen.id };
      db.prepare('INSERT INTO ms_albums (id, workspace_id, project_id, title, page_count, spec) VALUES (?,?,?,?,?,?)')
        .run(albumId, project.workspace_id, project.id, req.body.title || `${project.title} Album`, pages, JSON.stringify(spec));
      res.json({ ok: true, album_id: albumId, pages, spreads: spreads.length, images: seq.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/studio-ai/projects/:id/albums', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json({ albums: db.prepare('SELECT id, title, page_count, spec, status, created_at FROM ms_albums WHERE project_id = ? ORDER BY created_at DESC').all(project.id).map(a => ({ ...a, spec: J(a.spec, {}) })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── P13: portfolio recommendations (top portfolio-scored across the workspace) ─
  app.get('/api/studio-ai/portfolio-picks', auth, (req, res) => {
    try {
      const rows = db.prepare(`SELECT s.asset_id, s.value, a.project_id FROM ms_asset_scores s
        JOIN ms_assets a ON a.id = s.asset_id WHERE s.workspace_id = ? AND s.score_type = 'portfolio' AND a.deleted_at IS NULL
        ORDER BY s.value DESC LIMIT 60`).all(req.workspaceId);
      res.json({ picks: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── P3: style profiles ──────────────────────────────────────────────────────
  app.get('/api/studio-ai/styles', auth, (req, res) => {
    try { res.json({ styles: db.prepare('SELECT id, name, params, is_default FROM ms_style_profiles WHERE workspace_id = ? ORDER BY created_at').all(req.workspaceId).map(s => ({ ...s, params: J(s.params, {}), is_default: !!s.is_default })) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/studio-ai/styles', auth, (req, res) => {
    try {
      const id = generateId();
      db.prepare('INSERT INTO ms_style_profiles (id, workspace_id, name, params, is_default) VALUES (?,?,?,?,?)')
        .run(id, req.workspaceId, req.body.name || 'New style', JSON.stringify(req.body.params || { exposure: 0, contrast: 0, warmth: 0, saturation: 0, shadows: 0, highlights: 0 }), req.body.is_default ? 1 : 0);
      res.json({ ok: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put('/api/studio-ai/styles/:id', auth, (req, res) => {
    try {
      const s = db.prepare('SELECT id FROM ms_style_profiles WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!s) return res.status(404).json({ error: 'Not found' });
      if (req.body.is_default) db.prepare('UPDATE ms_style_profiles SET is_default = 0 WHERE workspace_id = ?').run(req.workspaceId);
      const set = {}; if (req.body.name !== undefined) set.name = req.body.name; if (req.body.params !== undefined) set.params = JSON.stringify(req.body.params); if (req.body.is_default !== undefined) set.is_default = req.body.is_default ? 1 : 0;
      const keys = Object.keys(set); if (keys.length) db.prepare(`UPDATE ms_style_profiles SET ${keys.map(k => `${k}=@${k}`).join(', ')} WHERE id=@id`).run({ ...set, id: s.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/studio-ai/styles/:id', auth, (req, res) => {
    try { db.prepare('DELETE FROM ms_style_profiles WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── P4: auto-edit suggestion (non-destructive params; applied via the existing
  // edit pipeline). Derives gentle corrections from technical scores + a style. ──
  app.post('/api/studio-ai/assets/:id/auto-edit', auth, (req, res) => {
    try {
      const a = db.prepare('SELECT id, workspace_id FROM ms_assets WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!a) return res.status(404).json({ error: 'Asset not found' });
      const s = {}; db.prepare('SELECT score_type, value FROM ms_asset_scores WHERE asset_id = ?').all(a.id).forEach(r => { s[r.score_type] = r.value; });
      const style = req.body.style_id ? db.prepare('SELECT params FROM ms_style_profiles WHERE id = ? AND workspace_id = ?').get(req.body.style_id, req.workspaceId) : null;
      const sp = style ? J(style.params, {}) : {};
      // gentle, explainable corrections (−1..1 normalized params the renderer maps to ops)
      const expo = s.exposure != null ? Math.max(-0.5, Math.min(0.5, -s.exposure)) : 0; // pull toward neutral
      const suggestion = {
        exposure: Math.round((expo + (sp.exposure || 0)) * 100) / 100,
        contrast: Math.round(((s.contrast != null && s.contrast < 0.3 ? 0.15 : 0) + (sp.contrast || 0)) * 100) / 100,
        warmth: sp.warmth || 0, saturation: sp.saturation || 0,
        shadows: (s.exposure != null && s.exposure < -0.2 ? 0.2 : 0) + (sp.shadows || 0),
        highlights: (s.exposure != null && s.exposure > 0.2 ? -0.2 : 0) + (sp.highlights || 0),
        denoise: s.noise != null && s.noise > 0.5 ? 0.4 : 0,
        straighten: 0,
      };
      const reasons = [];
      if (expo) reasons.push(`exposure ${expo > 0 ? 'lifted' : 'pulled'} to neutral`);
      if (suggestion.denoise) reasons.push('noise reduction (high noise)');
      if (style) reasons.push('style profile applied');
      res.json({ ok: true, suggestion, reasons, note: 'Non-destructive — apply via the asset edit endpoint; original is never modified.' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};
