'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · STUDIO EXPERIENCE — P12 / P14 / P16.
 *    • P16 Marketplace foundations — generic `ms_pack` catalog (gallery themes,
 *      album/reel templates, LUTs, style packs). Architecture only, no store UI.
 *    • P12 Project milestones / delivery progress (powers Client Portal 2.0).
 *    • P14 Print recommendations driven by project intelligence.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');

module.exports = function mountStudioExperience(app, db, deps = {}) {
  const { auth = (req, res, next) => next(), generateId = () => crypto.randomUUID(), broadcastToWorkspace = () => {} } = deps;
  const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
  const getProject = (ws, id) => db.prepare('SELECT * FROM ms_projects WHERE id = ? AND workspace_id = ?').get(id, ws);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ms_pack (
      id TEXT PRIMARY KEY, workspace_id TEXT,   -- NULL/'system' for built-ins
      kind TEXT, name TEXT, description TEXT, def TEXT DEFAULT '{}',
      author TEXT, price REAL DEFAULT 0, is_public INTEGER DEFAULT 0, is_system INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ms_milestones (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, lead_id TEXT,
      title TEXT, status TEXT DEFAULT 'pending',  -- pending|in_progress|done
      due_date TEXT, sort_order INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ms_milestones_project ON ms_milestones(project_id);
  `);

  // ── P16: marketplace packs ──────────────────────────────────────────────────
  const PACK_KINDS = ['gallery_theme', 'album_template', 'reel_template', 'lut', 'style_pack'];
  app.get('/api/packs', auth, (req, res) => {
    try {
      const kind = req.query.kind && PACK_KINDS.includes(req.query.kind) ? req.query.kind : null;
      const rows = kind
        ? db.prepare("SELECT * FROM ms_pack WHERE (is_system = 1 OR workspace_id = ?) AND kind = ? ORDER BY is_system DESC, created_at").all(req.workspaceId, kind)
        : db.prepare("SELECT * FROM ms_pack WHERE is_system = 1 OR workspace_id = ? ORDER BY is_system DESC, created_at").all(req.workspaceId);
      res.json({ packs: rows.map(p => ({ ...p, def: J(p.def, {}), is_system: !!p.is_system, is_public: !!p.is_public })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/packs', auth, (req, res) => {
    try {
      const b = req.body || {};
      if (!PACK_KINDS.includes(b.kind)) return res.status(400).json({ error: 'invalid pack kind' });
      const id = generateId();
      db.prepare('INSERT INTO ms_pack (id, workspace_id, kind, name, description, def, author, price, is_public) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(id, req.workspaceId, b.kind, b.name || 'Pack', b.description || null, JSON.stringify(b.def || {}), b.author || null, Number(b.price) || 0, b.is_public ? 1 : 0);
      res.json({ ok: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put('/api/packs/:id', auth, (req, res) => {
    try {
      const p = db.prepare('SELECT id FROM ms_pack WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!p) return res.status(404).json({ error: 'Not found' });
      const b = req.body || {}; const set = {};
      ['name', 'description', 'author'].forEach(k => { if (b[k] !== undefined) set[k] = b[k]; });
      if (b.def !== undefined) set.def = JSON.stringify(b.def);
      if (b.price !== undefined) set.price = Number(b.price) || 0;
      if (b.is_public !== undefined) set.is_public = b.is_public ? 1 : 0;
      const keys = Object.keys(set); if (keys.length) db.prepare(`UPDATE ms_pack SET ${keys.map(k => `${k}=@${k}`).join(', ')} WHERE id=@id`).run({ ...set, id: p.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/packs/:id', auth, (req, res) => {
    try { db.prepare('DELETE FROM ms_pack WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── P12: milestones / delivery progress ─────────────────────────────────────
  app.get('/api/media/projects/:id/milestones', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json({ milestones: db.prepare('SELECT * FROM ms_milestones WHERE project_id = ? ORDER BY sort_order, created_at').all(project.id) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/media/projects/:id/milestones', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const id = generateId();
      const order = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 n FROM ms_milestones WHERE project_id = ?').get(project.id).n;
      db.prepare('INSERT INTO ms_milestones (id, workspace_id, project_id, lead_id, title, status, due_date, sort_order) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, req.workspaceId, project.id, project.lead_id || null, req.body.title || 'Milestone', req.body.status || 'pending', req.body.due_date || null, order);
      broadcastToWorkspace(req.workspaceId, 'ms_milestone', { project_id: project.id });
      res.json({ ok: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put('/api/media/milestones/:id', auth, (req, res) => {
    try {
      const m = db.prepare('SELECT id FROM ms_milestones WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!m) return res.status(404).json({ error: 'Not found' });
      const b = req.body || {}; const set = {};
      ['title', 'status', 'due_date'].forEach(k => { if (b[k] !== undefined) set[k] = b[k]; });
      if (b.sort_order !== undefined) set.sort_order = b.sort_order;
      const keys = Object.keys(set); if (keys.length) db.prepare(`UPDATE ms_milestones SET ${keys.map(k => `${k}=@${k}`).join(', ')} WHERE id=@id`).run({ ...set, id: m.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/media/milestones/:id', auth, (req, res) => {
    try { db.prepare('DELETE FROM ms_milestones WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── P14: print recommendations from project intelligence ────────────────────
  app.get('/api/media/projects/:id/print-recommendations', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const heroes = db.prepare("SELECT COUNT(*) c FROM ms_asset_scores s JOIN ms_assets a ON a.id=s.asset_id WHERE a.project_id=? AND s.score_type='hero' AND s.value>=0.7").get(project.id).c;
      const albumWorthy = db.prepare("SELECT COUNT(*) c FROM ms_asset_scores s JOIN ms_assets a ON a.id=s.asset_id WHERE a.project_id=? AND s.score_type='album' AND s.value>=0.5").get(project.id).c;
      const portfolioGrade = db.prepare("SELECT COUNT(*) c FROM ms_asset_scores s JOIN ms_assets a ON a.id=s.asset_id WHERE a.project_id=? AND s.score_type='portfolio' AND s.value>=0.7").get(project.id).c;
      const products = db.prepare('SELECT id, name, kind, options FROM ms_print_products WHERE workspace_id = ? AND active = 1').all(req.workspaceId).map(p => ({ ...p, options: J(p.options, []) }));
      const recs = [];
      if (heroes >= 1) recs.push({ reason: `${heroes} standout hero shots — perfect for wall art`, suggest_kind: 'frame', products: products.filter(p => /frame|wall|canvas/i.test(p.kind + p.name)) });
      if (albumWorthy >= 20) recs.push({ reason: `${albumWorthy} album-grade images — an album tells the full story`, suggest_kind: 'album', products: products.filter(p => /album|book/i.test(p.kind + p.name)) });
      if (portfolioGrade >= 1) recs.push({ reason: `${portfolioGrade} portfolio-grade frames — fine-art prints`, suggest_kind: 'print', products: products.filter(p => /print/i.test(p.kind + p.name)) });
      res.json({ recommendations: recs, signals: { heroes, albumWorthy, portfolioGrade } });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};
