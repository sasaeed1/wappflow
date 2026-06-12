'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · MEDIA STUDIO  (additive module — vertical slice: Projects → Ingest → Library)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Mounted from server.js with ONE line:
 *
 *    require('./media-studio')(app, db, {
 *      auth, generateId, logAudit, broadcastToWorkspace, addContactHistory,
 *      multer, path, fs, uploadsDir,
 *    });
 *
 *  Guarantees:
 *   • Touches NO existing table and NO existing route — owns the `ms_*` namespace only.
 *   • Projects link to an existing CRM `leads` row via `lead_id` (no second CRM).
 *   • Control-first by construction: the AI/CV lane may write ONLY `ms_asset_scores`
 *     (advisory). Human cull decisions live in `ms_cull_decisions`. There is no code
 *     path for AI to cull, publish, or deliver. Those tables/routes don't accept it.
 *   • Storage = local disk today (served by the existing /uploads static route).
 *     Swap to object storage (Cloudflare R2) at the single SEAM marked `STORAGE SEAM`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const createMediaWorker = require('./media-worker');
const crypto = require('crypto');

module.exports = function mountMediaStudio(app, db, deps = {}) {
  const {
    auth = (req, res, next) => next(),
    generateId = () => require('crypto').randomUUID(),
    logAudit = () => {},
    broadcastToWorkspace = () => {},
    addContactHistory = () => {},
    multer = require('multer'),
    path = require('path'),
    fs = require('fs'),
    uploadsDir = path.join(__dirname, 'uploads'),
    // Delivery seam: inject the real sender at mount (whatsappService.sendMessage +
    // saveOutgoingMessage). Defaults to a no-op so the module works without messaging.
    sendClientMessage = async () => ({ skipped: true }),
    clientBaseUrl = process.env.FRONTEND_URL || '',
  } = deps;

  // ───────────────────────────────────────────────────────────────────────────
  // 1. SCHEMA  (idempotent — safe to run on every boot, mirrors server.js style)
  // ───────────────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS ms_projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      lead_id TEXT,                       -- FK leads(id): the client. No second CRM.
      title TEXT NOT NULL,
      project_type TEXT DEFAULT 'general',-- wedding|event|real_estate|commercial|portrait|product|general
      shoot_date TEXT,
      location TEXT,
      status TEXT DEFAULT 'planning',     -- planning|shooting|culling|delivery|delivered|archived
      cover_asset_id TEXT,
      settings TEXT DEFAULT '{}',         -- JSON
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ms_folders (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      parent_id TEXT,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ms_assets (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      folder_id TEXT,
      type TEXT DEFAULT 'photo',          -- photo|video|raw|file
      storage_key TEXT NOT NULL,          -- bucket-style key (relative path under /uploads today)
      filename TEXT,
      mime TEXT,
      size_bytes INTEGER DEFAULT 0,
      width INTEGER,
      height INTEGER,
      duration_ms INTEGER,
      capture_time TEXT,
      camera_meta TEXT DEFAULT '{}',      -- JSON EXIF (populated by worker later)
      checksum TEXT,
      phash TEXT,                         -- perceptual hash for dedup (worker later)
      variants TEXT DEFAULT '{}',         -- JSON { thumb, web, original }
      status TEXT DEFAULT 'ready',        -- ingesting|ready|failed
      uploaded_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- AI / CV ADVISORY scores. SEPARATE table so AI never mutates the asset row.
    CREATE TABLE IF NOT EXISTS ms_asset_scores (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      score_type TEXT NOT NULL,           -- sharpness|exposure|blur|aesthetic|face|eyes_open|duplicate_group|clip_quality
      value REAL,
      group_key TEXT,                     -- duplicate-group id when applicable
      model_version TEXT,
      source TEXT DEFAULT 'ai',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- HUMAN cull decisions. The AI/CV lane has NO write path here — by construction.
    CREATE TABLE IF NOT EXISTS ms_cull_decisions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      asset_id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,              -- a real human always owns the decision
      decision TEXT,                      -- keep|reject|maybe
      rating INTEGER DEFAULT 0,           -- 0..5
      color_label TEXT,
      flagged INTEGER DEFAULT 0,
      decided_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Async media work queue (mirrors the proven outbound_message_queue pattern).
    CREATE TABLE IF NOT EXISTS ms_jobs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      type TEXT NOT NULL,                 -- ingest|transcode|score|zip_export|watermark
      asset_id TEXT,
      project_id TEXT,
      status TEXT DEFAULT 'pending',      -- pending|running|done|failed
      progress INTEGER DEFAULT 0,
      payload TEXT DEFAULT '{}',
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      next_retry_at TIMESTAMP,
      finished_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_ms_assets_project ON ms_assets(project_id);
    CREATE INDEX IF NOT EXISTS idx_ms_projects_ws ON ms_projects(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_ms_scores_asset ON ms_asset_scores(asset_id);
  `);

  // Forward-compatible column additions live here (ignore "duplicate column").
  function safeAlter(sql) {
    try { db.exec(sql); } catch (e) {
      if (!String(e.message || '').includes('duplicate column')) throw e;
    }
  }
  safeAlter('ALTER TABLE ms_assets ADD COLUMN edits TEXT'); // non-destructive edit params (JSON)

  // ───────────────────────────────────────────────────────────────────────────
  // 2. STORAGE SEAM  (local disk today → swap this block for R2 presigned later)
  // ───────────────────────────────────────────────────────────────────────────
  const mediaDir = path.join(uploadsDir, 'media');
  try { fs.mkdirSync(mediaDir, { recursive: true }); } catch {}

  const RAW_EXTS = ['cr2', 'cr3', 'nef', 'arw', 'raf', 'rw2', 'dng', 'orf', 'srw', 'pef'];

  function detectType(mime = '', filename = '') {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (RAW_EXTS.includes(ext)) return 'raw';
    if (mime.startsWith('image/')) return 'photo';
    if (mime.startsWith('video/')) return 'video';
    return 'file';
  }

  // Public URL for a stored object. Today: served by the existing /uploads static route.
  // After R2: return a CDN URL or a short-lived signed URL instead.
  function publicUrl(storageKey) {
    return '/' + ['uploads', storageKey].join('/').replace(/\/+/g, '/');
  }

  const mediaUpload = multer({
    storage: multer.diskStorage({
      destination: mediaDir,
      filename: (req, file, cb) => {
        const safe = (file.originalname || 'file')
          .normalize('NFKD').replace(/[^\w.\-]/g, '_').slice(0, 100);
        cb(null, `${Date.now()}-${Math.random().toString(16).slice(2, 8)}-${safe}`);
      },
    }),
    limits: { fileSize: 200 * 1024 * 1024 }, // 200MB local cap; presigned R2 removes this ceiling
  });
  // ─────────────────────────── end STORAGE SEAM ──────────────────────────────

  // ───────────────────────────────────────────────────────────────────────────
  // 3. HELPERS
  // ───────────────────────────────────────────────────────────────────────────
  function getProject(workspaceId, id) {
    return db.prepare('SELECT * FROM ms_projects WHERE id = ? AND workspace_id = ?').get(id, workspaceId);
  }

  function canManage(req) {
    // Destructive ops (archive/delete) require a manager+ role or explicit settings rights.
    // Reuses existing role signals without modifying core DEFAULT_ROLE_PERMISSIONS.
    const role = req.userRole || 'super_admin';
    if (['super_admin', 'admin', 'manager'].includes(role)) return true;
    return !!(req.userPermissions && req.userPermissions.manage_settings);
  }

  function shapeAsset(a) {
    let variants = {};
    try { variants = JSON.parse(a.variants || '{}'); } catch {}
    return {
      ...a,
      variants,
      url: variants.original || publicUrl(a.storage_key),
      thumb_url: variants.thumb || variants.web || publicUrl(a.storage_key),
    };
  }

  // Mirror media events onto the CRM lead timeline (the integration seam). Defensive:
  // a missing/optional core table must never break a media route.
  function emitToLead(project, req, activityType, title, body) {
    if (!project || !project.lead_id) return;
    try {
      db.prepare(`
        INSERT INTO activity_timeline (id, lead_id, workspace_id, user_id, actor_name, activity_type, title, body)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), project.lead_id, project.workspace_id, req.userId || null,
             req.senderName || 'Team Member', activityType, title, body || null);
    } catch {}
    try { addContactHistory(project.lead_id, req.userId, 'media', title); } catch {}
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. ROUTES   (all under /api/media, all behind `auth`)
  // ───────────────────────────────────────────────────────────────────────────

  // Health / mount check + workspace counts
  app.get('/api/media/overview', auth, (req, res) => {
    try {
      const ws = req.workspaceId;
      const projects = db.prepare('SELECT COUNT(*) n FROM ms_projects WHERE workspace_id = ?').get(ws).n;
      const assets = db.prepare('SELECT COUNT(*) n FROM ms_assets WHERE workspace_id = ?').get(ws).n;
      const size = db.prepare('SELECT COALESCE(SUM(size_bytes),0) b FROM ms_assets WHERE workspace_id = ?').get(ws).b;
      res.json({ module: 'media-studio', ok: true, projects, assets, storage_bytes: size });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Projects ───────────────────────────────────────────────────────────────
  app.get('/api/media/projects', auth, (req, res) => {
    try {
      const params = [req.workspaceId];
      let where = 'p.workspace_id = ?';
      if (req.query.lead_id) { where += ' AND p.lead_id = ?'; params.push(req.query.lead_id); }
      if (req.query.status) { where += ' AND p.status = ?'; params.push(req.query.status); }
      const rows = db.prepare(`
        SELECT p.*, l.customer_name AS client_name,
          (SELECT COUNT(*) FROM ms_assets a WHERE a.project_id = p.id) AS asset_count
        FROM ms_projects p
        LEFT JOIN leads l ON l.id = p.lead_id
        WHERE ${where}
        ORDER BY p.created_at DESC
      `).all(...params);
      res.json({ projects: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/media/projects', auth, (req, res) => {
    try {
      const { title, project_type, lead_id, shoot_date, location, settings } = req.body;
      if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required' });

      // If a lead is linked, validate it belongs to this workspace (keeps the CRM link honest).
      if (lead_id) {
        const lead = db.prepare('SELECT id FROM leads WHERE id = ? AND workspace_id = ?').get(lead_id, req.workspaceId);
        if (!lead) return res.status(400).json({ error: 'lead_id not found in this workspace' });
      }

      const id = generateId();
      db.prepare(`
        INSERT INTO ms_projects (id, workspace_id, lead_id, title, project_type, shoot_date, location, settings, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, req.workspaceId, lead_id || null, String(title).trim(), project_type || 'general',
             shoot_date || null, location || null, settings ? JSON.stringify(settings) : '{}', req.userId);

      const project = getProject(req.workspaceId, id);
      emitToLead(project, req, 'media_project', `Shoot created: ${project.title}`, null);
      logAudit(req.workspaceId, req.userId, 'create', 'ms_project', id, { title: project.title });
      broadcastToWorkspace(req.workspaceId, 'ms_project_created', { project });
      res.status(201).json(project);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/media/projects/:id', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const folders = db.prepare('SELECT * FROM ms_folders WHERE project_id = ? ORDER BY sort_order, name').all(project.id);
      const counts = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(size_bytes),0) b FROM ms_assets WHERE project_id = ?').get(project.id);
      res.json({ ...project, folders, asset_count: counts.n, storage_bytes: counts.b });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/media/projects/:id', auth, (req, res) => {
    try {
      const allowed = ['title', 'project_type', 'shoot_date', 'location', 'status', 'cover_asset_id'];
      const fields = [], params = [];
      allowed.forEach(f => { if (req.body[f] !== undefined) { fields.push(`${f} = ?`); params.push(req.body[f]); } });
      if (req.body.settings !== undefined) { fields.push('settings = ?'); params.push(JSON.stringify(req.body.settings)); }
      if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
      fields.push("updated_at = CURRENT_TIMESTAMP");
      params.push(req.params.id, req.workspaceId);
      const r = db.prepare(`UPDATE ms_projects SET ${fields.join(', ')} WHERE id = ? AND workspace_id = ?`).run(...params);
      if (r.changes === 0) return res.status(404).json({ error: 'Project not found' });
      const project = getProject(req.workspaceId, req.params.id);
      broadcastToWorkspace(req.workspaceId, 'ms_project_updated', { project });
      res.json(project);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Non-destructive by default: archive (reversible). Hard delete is a later admin action.
  app.delete('/api/media/projects/:id', auth, (req, res) => {
    try {
      if (!canManage(req)) return res.status(403).json({ error: 'Not allowed' });
      const r = db.prepare("UPDATE ms_projects SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND workspace_id = ?")
        .run(req.params.id, req.workspaceId);
      if (r.changes === 0) return res.status(404).json({ error: 'Project not found' });
      logAudit(req.workspaceId, req.userId, 'archive', 'ms_project', req.params.id, {});
      res.json({ message: 'Project archived', id: req.params.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Folders ──────────────────────────────────────────────────────────────
  app.get('/api/media/projects/:id/folders', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const folders = db.prepare('SELECT * FROM ms_folders WHERE project_id = ? ORDER BY sort_order, name').all(project.id);
      res.json({ folders });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/media/projects/:id/folders', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const { name, parent_id, sort_order } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const id = generateId();
      db.prepare('INSERT INTO ms_folders (id, workspace_id, project_id, parent_id, name, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, req.workspaceId, project.id, parent_id || null, name, sort_order || 0);
      res.status(201).json(db.prepare('SELECT * FROM ms_folders WHERE id = ?').get(id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Ingest: presigned seam ─────────────────────────────────────────────────
  // Forward-compatible contract. Today returns the multipart target; after R2 this
  // returns { mode:'presigned', put_url, storage_key } and the browser PUTs to the bucket.
  app.post('/api/media/projects/:id/assets/sign', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json({
        mode: 'multipart',                                   // → 'presigned' once R2 lands
        upload_url: `/api/media/projects/${project.id}/assets`,
        field: 'files',
        max_files: 200,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Ingest: upload (local disk today) ──────────────────────────────────────
  app.post('/api/media/projects/:id/assets', auth, mediaUpload.array('files', 200), (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const files = req.files || [];
      if (files.length === 0) return res.status(400).json({ error: 'No files uploaded (field name: files)' });

      const folderId = req.body.folder_id || null;
      const insertAsset = db.prepare(`
        INSERT INTO ms_assets (id, workspace_id, project_id, folder_id, type, storage_key, filename, mime, size_bytes, variants, status, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?)
      `);
      const insertJob = db.prepare(`
        INSERT INTO ms_jobs (id, workspace_id, type, asset_id, project_id, status, payload)
        VALUES (?, ?, 'ingest', ?, ?, 'pending', ?)
      `);

      const created = [];
      const tx = db.transaction(() => {
        for (const f of files) {
          const assetId = generateId();
          const storageKey = `media/${path.basename(f.path)}`;   // relative to /uploads
          const variants = JSON.stringify({ original: publicUrl(storageKey) });
          insertAsset.run(assetId, req.workspaceId, project.id, folderId,
            detectType(f.mimetype, f.originalname), storageKey, f.originalname, f.mimetype, f.size, variants, req.userId);
          // Enqueue downstream work (variants/EXIF/CV scoring). No worker yet → stays 'pending'.
          insertJob.run(generateId(), req.workspaceId, assetId, project.id,
            JSON.stringify({ make: ['variants', 'exif', 'score'] }));
          created.push(shapeAsset(db.prepare('SELECT * FROM ms_assets WHERE id = ?').get(assetId)));
        }
      });
      tx();

      emitToLead(project, req, 'media_upload', `${created.length} file(s) added to ${project.title}`, null);
      logAudit(req.workspaceId, req.userId, 'upload', 'ms_project', project.id, { count: created.length });
      broadcastToWorkspace(req.workspaceId, 'ms_assets_added', { project_id: project.id, count: created.length });
      res.status(201).json({ uploaded: created.length, assets: created });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Library listing ────────────────────────────────────────────────────────
  app.get('/api/media/projects/:id/assets', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
      const offset = parseInt(req.query.offset, 10) || 0;
      const params = [project.id];
      let where = 'a.project_id = ?';
      if (req.query.folder_id) { where += ' AND a.folder_id = ?'; params.push(req.query.folder_id); }
      if (req.query.type) { where += ' AND a.type = ?'; params.push(req.query.type); }
      if (req.query.decision === 'undecided') { where += ' AND c.decision IS NULL'; }
      else if (req.query.decision) { where += ' AND c.decision = ?'; params.push(req.query.decision); }

      const total = db.prepare(`SELECT COUNT(*) n FROM ms_assets a LEFT JOIN ms_cull_decisions c ON c.asset_id = a.id WHERE ${where}`).get(...params).n;
      const rows = db.prepare(`
        SELECT a.*, c.decision AS cull_decision, c.rating AS cull_rating, c.color_label AS cull_color, c.flagged AS cull_flagged,
          (SELECT value FROM ms_asset_scores s WHERE s.asset_id = a.id AND s.score_type = 'sharpness' LIMIT 1) AS sharpness,
          (SELECT value FROM ms_asset_scores s WHERE s.asset_id = a.id AND s.score_type = 'quality' LIMIT 1) AS quality,
          (SELECT value FROM ms_asset_scores s WHERE s.asset_id = a.id AND s.score_type = 'exposure' LIMIT 1) AS exposure,
          (SELECT value FROM ms_asset_scores s WHERE s.asset_id = a.id AND s.score_type = 'high_clip' LIMIT 1) AS high_clip,
          (SELECT value FROM ms_asset_scores s WHERE s.asset_id = a.id AND s.score_type = 'shadow_clip' LIMIT 1) AS shadow_clip,
          (SELECT group_key FROM ms_asset_scores s WHERE s.asset_id = a.id AND s.score_type = 'duplicate_group' LIMIT 1) AS dup_group
        FROM ms_assets a
        LEFT JOIN ms_cull_decisions c ON c.asset_id = a.id
        WHERE ${where}
        ORDER BY a.capture_time IS NULL, a.capture_time, a.created_at
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset);

      res.json({ total, limit, offset, assets: rows.map(shapeAsset) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Single asset detail (asset + advisory scores + human cull decision) ──────
  app.get('/api/media/assets/:id', auth, (req, res) => {
    try {
      const a = db.prepare('SELECT * FROM ms_assets WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!a) return res.status(404).json({ error: 'Asset not found' });
      const scores = db.prepare('SELECT score_type, value, group_key, model_version, source FROM ms_asset_scores WHERE asset_id = ?').all(a.id);
      const cull = db.prepare('SELECT decision, rating, color_label, flagged, decided_at FROM ms_cull_decisions WHERE asset_id = ?').get(a.id) || null;
      res.json({ ...shapeAsset(a), scores, cull });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/media/assets/:id', auth, (req, res) => {
    try {
      if (!canManage(req)) return res.status(403).json({ error: 'Not allowed' });
      const a = db.prepare('SELECT * FROM ms_assets WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!a) return res.status(404).json({ error: 'Asset not found' });
      db.prepare('DELETE FROM ms_assets WHERE id = ?').run(a.id);
      db.prepare('DELETE FROM ms_asset_scores WHERE asset_id = ?').run(a.id);
      db.prepare('DELETE FROM ms_cull_decisions WHERE asset_id = ?').run(a.id);
      try { fs.unlinkSync(path.join(uploadsDir, a.storage_key)); } catch {}
      logAudit(req.workspaceId, req.userId, 'delete', 'ms_asset', a.id, { filename: a.filename });
      res.json({ message: 'Asset deleted', id: a.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  CULLING — the HUMAN decision layer (control-first)
  //  AI/CV can write ms_asset_scores (advisory). Only an authenticated human can
  //  write ms_cull_decisions, and only via these routes. There is no AI path here.
  // ═══════════════════════════════════════════════════════════════════════════
  const VALID_DECISIONS = ['keep', 'reject', 'maybe', null];

  function upsertCull(asset, userId, patch) {
    const existing = db.prepare('SELECT id FROM ms_cull_decisions WHERE asset_id = ?').get(asset.id);
    if (existing) {
      const fields = [], params = [];
      if (patch.decision !== undefined)  { fields.push('decision = ?');    params.push(patch.decision); }
      if (patch.rating !== undefined)    { fields.push('rating = ?');      params.push(patch.rating); }
      if (patch.color_label !== undefined){ fields.push('color_label = ?'); params.push(patch.color_label); }
      if (patch.flagged !== undefined)   { fields.push('flagged = ?');     params.push(patch.flagged ? 1 : 0); }
      fields.push('user_id = ?');     params.push(userId);
      fields.push('decided_at = CURRENT_TIMESTAMP');
      params.push(asset.id);
      db.prepare(`UPDATE ms_cull_decisions SET ${fields.join(', ')} WHERE asset_id = ?`).run(...params);
    } else {
      db.prepare(`INSERT INTO ms_cull_decisions (id, workspace_id, asset_id, project_id, user_id, decision, rating, color_label, flagged)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(generateId(), asset.workspace_id, asset.id, asset.project_id, userId,
             patch.decision ?? null, patch.rating ?? 0, patch.color_label ?? null, patch.flagged ? 1 : 0);
    }
  }

  app.put('/api/media/assets/:id/cull', auth, (req, res) => {
    try {
      const asset = db.prepare('SELECT id, project_id, workspace_id FROM ms_assets WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!asset) return res.status(404).json({ error: 'Asset not found' });
      const { decision, rating, color_label, flagged } = req.body;
      if (decision !== undefined && !VALID_DECISIONS.includes(decision)) return res.status(400).json({ error: 'invalid decision' });
      if (rating !== undefined && (rating < 0 || rating > 5)) return res.status(400).json({ error: 'rating must be 0..5' });
      upsertCull(asset, req.userId, { decision, rating, color_label, flagged });
      const cull = db.prepare('SELECT decision, rating, color_label, flagged, decided_at FROM ms_cull_decisions WHERE asset_id = ?').get(asset.id);
      res.json({ asset_id: asset.id, cull });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Bulk keep/reject across a selection (fast culling)
  app.post('/api/media/projects/:id/cull/bulk', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const ids = Array.isArray(req.body.asset_ids) ? req.body.asset_ids : [];
      const { decision } = req.body;
      if (!VALID_DECISIONS.includes(decision)) return res.status(400).json({ error: 'invalid decision' });
      const valid = db.prepare('SELECT id, project_id, workspace_id FROM ms_assets WHERE id = ? AND project_id = ?');
      let n = 0;
      const tx = db.transaction(() => {
        for (const aid of ids) { const a = valid.get(aid, project.id); if (a) { upsertCull(a, req.userId, { decision }); n++; } }
      });
      tx();
      res.json({ updated: n });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/media/projects/:id/cull/summary', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const rows = db.prepare(`
        SELECT COALESCE(c.decision, 'undecided') d, COUNT(*) n
        FROM ms_assets a LEFT JOIN ms_cull_decisions c ON c.asset_id = a.id
        WHERE a.project_id = ? GROUP BY COALESCE(c.decision, 'undecided')
      `).all(project.id);
      const out = { total: 0, keep: 0, reject: 0, maybe: 0, undecided: 0 };
      rows.forEach(r => { out[r.d] = r.n; out.total += r.n; });
      res.json(out);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Non-destructive edits (crop / rotate / tone) ─────────────────────────────
  // Params are stored as JSON; the worker re-renders thumb/web/full variants from
  // the untouched original. Delivery (galleries, ZIPs, PDFs) picks up the edited
  // renders automatically. Clearing edits restores the original variants.
  function inRange(v, lo, hi) { return typeof v === 'number' && isFinite(v) && v >= lo && v <= hi; }

  app.put('/api/media/assets/:id/edits', auth, (req, res) => {
    try {
      const a = db.prepare('SELECT * FROM ms_assets WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!a) return res.status(404).json({ error: 'Asset not found' });
      if (a.type !== 'photo') return res.status(400).json({ error: 'Only photos can be edited' });
      const e = req.body || {};
      const edits = {};
      for (const k of ['exposure', 'contrast', 'temperature', 'saturation']) {
        if (e[k] !== undefined && e[k] !== 0) {
          if (!inRange(e[k], -1, 1)) return res.status(400).json({ error: `${k} must be between -1 and 1` });
          edits[k] = Math.round(e[k] * 100) / 100;
        }
      }
      if (e.rotate !== undefined && e.rotate !== 0) {
        if (!inRange(e.rotate, -360, 360)) return res.status(400).json({ error: 'rotate must be between -360 and 360' });
        edits.rotate = Math.round(e.rotate * 10) / 10;
      }
      if (e.crop) {
        const c = e.crop;
        if (!inRange(c.x, 0, 0.95) || !inRange(c.y, 0, 0.95) || !inRange(c.w, 0.05, 1) || !inRange(c.h, 0.05, 1) || c.x + c.w > 1.001 || c.y + c.h > 1.001) {
          return res.status(400).json({ error: 'invalid crop' });
        }
        // ignore a full-frame crop (no-op)
        if (!(c.x < 0.005 && c.y < 0.005 && c.w > 0.995 && c.h > 0.995)) {
          edits.crop = { x: +c.x.toFixed(4), y: +c.y.toFixed(4), w: +c.w.toFixed(4), h: +c.h.toFixed(4) };
        }
      }
      let prev = {}; try { prev = JSON.parse(a.edits || '{}'); } catch {}
      edits.rev = (prev.rev || 0) + 1;
      db.prepare('UPDATE ms_assets SET edits = ? WHERE id = ?').run(JSON.stringify(edits), a.id);
      db.prepare("INSERT INTO ms_jobs (id, workspace_id, type, asset_id, project_id, status, payload) VALUES (?, ?, 'render_edits', ?, ?, 'pending', '{}')")
        .run(generateId(), a.workspace_id, a.id, a.project_id);
      logAudit(req.workspaceId, req.userId, 'edit', 'ms_asset', a.id, edits);
      res.status(202).json({ status: 'rendering', edits });
    } catch (e2) { res.status(500).json({ error: e2.message }); }
  });

  app.delete('/api/media/assets/:id/edits', auth, (req, res) => {
    try {
      const a = db.prepare('SELECT * FROM ms_assets WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!a) return res.status(404).json({ error: 'Asset not found' });
      db.prepare('UPDATE ms_assets SET edits = NULL WHERE id = ?').run(a.id);
      db.prepare("INSERT INTO ms_jobs (id, workspace_id, type, asset_id, project_id, status, payload) VALUES (?, ?, 'render_edits', ?, ?, 'pending', '{}')")
        .run(generateId(), a.workspace_id, a.id, a.project_id);
      logAudit(req.workspaceId, req.userId, 'edit_reset', 'ms_asset', a.id, {});
      res.status(202).json({ status: 'rendering' });
    } catch (e2) { res.status(500).json({ error: e2.message }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  GALLERIES + CLIENT PORTAL + DELIVERY
  // ═══════════════════════════════════════════════════════════════════════════
  db.exec(`
    CREATE TABLE IF NOT EXISTS ms_galleries (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      lead_id TEXT,
      title TEXT NOT NULL,
      visibility TEXT DEFAULT 'private',     -- public|private|password|client_portal
      password_hash TEXT,
      share_token TEXT UNIQUE,
      status TEXT DEFAULT 'draft',           -- draft|published|archived
      version INTEGER DEFAULT 1,
      settings TEXT DEFAULT '{}',            -- JSON: { watermark, download_policy, layout_theme }
      expires_at TIMESTAMP,
      published_at TIMESTAMP,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ms_gallery_assets (
      gallery_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_hidden INTEGER DEFAULT 0,
      PRIMARY KEY (gallery_id, asset_id)
    );
    CREATE TABLE IF NOT EXISTS ms_gallery_access (
      id TEXT PRIMARY KEY,
      gallery_id TEXT NOT NULL,
      lead_id TEXT,
      email TEXT,
      access_token TEXT,
      last_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ms_client_favorites (
      id TEXT PRIMARY KEY,
      gallery_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      contact_identifier TEXT DEFAULT 'guest',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (gallery_id, asset_id, contact_identifier)
    );
    CREATE TABLE IF NOT EXISTS ms_client_comments (
      id TEXT PRIMARY KEY,
      gallery_id TEXT NOT NULL,
      asset_id TEXT,
      contact_identifier TEXT DEFAULT 'guest',
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ms_exports (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      gallery_id TEXT NOT NULL,
      project_id TEXT,
      variant TEXT DEFAULT 'web',          -- web | original
      status TEXT DEFAULT 'pending',       -- pending | ready | failed
      storage_key TEXT,
      size_bytes INTEGER DEFAULT 0,
      file_count INTEGER DEFAULT 0,
      watermark INTEGER DEFAULT 0,
      created_by TEXT,
      error_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      finished_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ms_gallery_assets_g ON ms_gallery_assets(gallery_id);
    CREATE INDEX IF NOT EXISTS idx_ms_galleries_token ON ms_galleries(share_token);

    CREATE TABLE IF NOT EXISTS ms_proofing_sets (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      gallery_id TEXT NOT NULL,
      project_id TEXT,
      lead_id TEXT,
      title TEXT,
      quota INTEGER,
      instructions TEXT,
      status TEXT DEFAULT 'open',          -- open | submitted | revision | approved
      revision_round INTEGER DEFAULT 1,
      due_at TIMESTAMP,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      submitted_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ms_proofing_selections (
      id TEXT PRIMARY KEY,
      set_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      contact_identifier TEXT DEFAULT 'guest',
      round INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (set_id, asset_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ms_proofing_sets_g ON ms_proofing_sets(gallery_id);
    CREATE INDEX IF NOT EXISTS idx_ms_proofing_sel_set ON ms_proofing_selections(set_id);

    CREATE TABLE IF NOT EXISTS ms_albums (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      title TEXT,
      spec TEXT DEFAULT '{}',              -- JSON { w_mm, h_mm, margin_mm }
      status TEXT DEFAULT 'draft',
      cover_asset_id TEXT,
      pdf_status TEXT DEFAULT 'none',      -- none | pending | ready | failed
      pdf_storage_key TEXT,
      pdf_size INTEGER DEFAULT 0,
      pdf_pages INTEGER DEFAULT 0,
      pdf_built_at TIMESTAMP,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ms_album_pages (
      id TEXT PRIMARY KEY,
      album_id TEXT NOT NULL,
      page_no INTEGER DEFAULT 0,
      layout_template TEXT DEFAULT 'single',
      slots TEXT DEFAULT '[]',             -- JSON array of { asset_id }
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ms_album_pages_a ON ms_album_pages(album_id);

    CREATE TABLE IF NOT EXISTS ms_video_clips (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT,
      asset_id TEXT NOT NULL,
      label TEXT,
      in_ms INTEGER DEFAULT 0,
      out_ms INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ms_video_clips_asset ON ms_video_clips(asset_id);
  `);

  function getGallery(workspaceId, id) {
    return db.prepare('SELECT * FROM ms_galleries WHERE id = ? AND workspace_id = ?').get(id, workspaceId);
  }
  function pwHash(galleryId, pw) {
    return crypto.createHash('sha256').update(`${galleryId}::${pw}`).digest('hex');
  }
  function portalAllowed(gallery, providedPw) {
    if (gallery.visibility !== 'password') return true;
    if (!gallery.password_hash) return true;
    return !!providedPw && pwHash(gallery.id, providedPw) === gallery.password_hash;
  }
  // Public shape: web/thumb only; the full-res original is exposed solely when the
  // download policy allows it. (Pixel watermarking is a worker step added later.)
  function shapePublicAsset(row, favCounts, settings) {
    let variants = {};
    try { variants = JSON.parse(row.variants || '{}'); } catch {}
    const policy = settings.download_policy || 'web';
    const downloadUrl = policy === 'none' ? null
      : (policy === 'high-res' ? (variants.original || null) : (variants.web || variants.original || null));
    return {
      asset_id: row.id,
      filename: row.filename,
      type: row.type,
      thumb_url: variants.thumb || variants.web || publicUrl(row.storage_key),
      web_url: variants.web || publicUrl(row.storage_key),
      download_url: downloadUrl,
      sort_order: row.sort_order,
      favorites: favCounts[row.id] || 0,
    };
  }

  // ── Photographer routes (auth) ──────────────────────────────────────────────
  app.post('/api/media/projects/:id/galleries', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const { title, visibility, password, settings } = req.body;
      if (!title) return res.status(400).json({ error: 'title is required' });
      const id = generateId();
      const vis = ['public', 'private', 'password', 'client_portal'].includes(visibility) ? visibility : 'private';
      const hash = (vis === 'password' && password) ? pwHash(id, password) : null;
      db.prepare(`
        INSERT INTO ms_galleries (id, workspace_id, project_id, lead_id, title, visibility, password_hash, settings, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, req.workspaceId, project.id, project.lead_id || null, title, vis, hash,
             settings ? JSON.stringify(settings) : '{}', req.userId);
      res.status(201).json(getGallery(req.workspaceId, id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // One-click delivery prep: create a gallery pre-filled from cull decisions
  // (default = keepers), in capture order. Bridges culling → delivery.
  app.post('/api/media/projects/:id/galleries/from-cull', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const decision = req.body.decision || 'keep';
      if (!['keep', 'maybe', 'reject'].includes(decision)) return res.status(400).json({ error: 'invalid decision' });

      const picks = db.prepare(`
        SELECT a.id FROM ms_assets a JOIN ms_cull_decisions c ON c.asset_id = a.id
        WHERE a.project_id = ? AND c.decision = ?
        ORDER BY a.capture_time IS NULL, a.capture_time, a.created_at
      `).all(project.id, decision);
      if (picks.length === 0) return res.status(400).json({ error: `No ${decision} photos to add yet` });

      const id = generateId();
      const vis = ['public', 'private', 'password', 'client_portal'].includes(req.body.visibility) ? req.body.visibility : 'private';
      const hash = (vis === 'password' && req.body.password) ? pwHash(id, req.body.password) : null;
      const title = (req.body.title && req.body.title.trim()) || `Keepers — ${project.title}`;
      db.prepare(`INSERT INTO ms_galleries (id, workspace_id, project_id, lead_id, title, visibility, password_hash, settings, created_by)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, req.workspaceId, project.id, project.lead_id || null, title, vis, hash,
             req.body.settings ? JSON.stringify(req.body.settings) : '{}', req.userId);

      const ins = db.prepare('INSERT OR IGNORE INTO ms_gallery_assets (gallery_id, asset_id, sort_order) VALUES (?, ?, ?)');
      const tx = db.transaction(() => { picks.forEach((p, i) => ins.run(id, p.id, i)); });
      tx();

      logAudit(req.workspaceId, req.userId, 'create_from_cull', 'ms_gallery', id, { added: picks.length, decision });
      res.status(201).json({ ...getGallery(req.workspaceId, id), has_password: !!hash, password_hash: undefined, added: picks.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/media/projects/:id/galleries', auth, (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT g.*,
          (SELECT COUNT(*) FROM ms_gallery_assets ga WHERE ga.gallery_id = g.id) AS asset_count,
          (SELECT COUNT(*) FROM ms_client_favorites f WHERE f.gallery_id = g.id) AS favorite_count,
          (SELECT COUNT(*) FROM ms_client_comments c WHERE c.gallery_id = g.id) AS comment_count,
          ps.id AS proofing_id, ps.status AS proofing_status, ps.quota AS proofing_quota,
          (SELECT COUNT(*) FROM ms_proofing_selections x WHERE x.set_id = ps.id) AS proofing_selected
        FROM ms_galleries g
        LEFT JOIN ms_proofing_sets ps ON ps.id = (
          SELECT s2.id FROM ms_proofing_sets s2 WHERE s2.gallery_id = g.id ORDER BY s2.created_at DESC LIMIT 1
        )
        WHERE g.project_id = ? AND g.workspace_id = ? ORDER BY g.created_at DESC
      `).all(req.params.id, req.workspaceId);
      res.json({ galleries: rows.map(g => ({
        ...g, has_password: !!g.password_hash, password_hash: undefined,
        share_url: g.share_token ? `${clientBaseUrl}/g/${g.share_token}` : null,
      })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/media/galleries/:id', auth, (req, res) => {
    try {
      const g = getGallery(req.workspaceId, req.params.id);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      const assets = db.prepare(`
        SELECT a.*, ga.sort_order, ga.is_hidden,
          (SELECT COUNT(*) FROM ms_client_favorites f WHERE f.gallery_id = ? AND f.asset_id = a.id) AS favorites
        FROM ms_gallery_assets ga JOIN ms_assets a ON a.id = ga.asset_id
        WHERE ga.gallery_id = ? ORDER BY ga.sort_order
      `).all(g.id, g.id).map(shapeAsset);
      const comments = db.prepare('SELECT * FROM ms_client_comments WHERE gallery_id = ? ORDER BY created_at DESC').all(g.id);
      const share_url = g.share_token ? `${clientBaseUrl}/g/${g.share_token}` : null;
      res.json({ ...g, has_password: !!g.password_hash, password_hash: undefined, share_url, assets, comments });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/media/galleries/:id', auth, (req, res) => {
    try {
      const g = getGallery(req.workspaceId, req.params.id);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      const fields = [], params = [];
      ['title', 'visibility', 'status'].forEach(f => { if (req.body[f] !== undefined) { fields.push(`${f} = ?`); params.push(req.body[f]); } });
      if (req.body.settings !== undefined) { fields.push('settings = ?'); params.push(JSON.stringify(req.body.settings)); }
      if (req.body.password !== undefined) { fields.push('password_hash = ?'); params.push(req.body.password ? pwHash(g.id, req.body.password) : null); }
      if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
      params.push(g.id, req.workspaceId);
      db.prepare(`UPDATE ms_galleries SET ${fields.join(', ')} WHERE id = ? AND workspace_id = ?`).run(...params);
      res.json(getGallery(req.workspaceId, g.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Add assets (only assets that belong to the same project as the gallery)
  app.post('/api/media/galleries/:id/assets', auth, (req, res) => {
    try {
      const g = getGallery(req.workspaceId, req.params.id);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      const ids = Array.isArray(req.body.asset_ids) ? req.body.asset_ids : [];
      if (ids.length === 0) return res.status(400).json({ error: 'asset_ids[] required' });
      const start = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM ms_gallery_assets WHERE gallery_id = ?').get(g.id).m;
      const ins = db.prepare('INSERT OR IGNORE INTO ms_gallery_assets (gallery_id, asset_id, sort_order) VALUES (?, ?, ?)');
      const valid = db.prepare('SELECT id FROM ms_assets WHERE id = ? AND project_id = ?');
      let n = start + 1, added = 0;
      const tx = db.transaction(() => {
        for (const aid of ids) { if (valid.get(aid, g.project_id)) { ins.run(g.id, aid, n++); added++; } }
      });
      tx();
      res.json({ added, gallery_id: g.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Reorder (photographer control) — body.asset_ids in the desired order
  app.put('/api/media/galleries/:id/assets/order', auth, (req, res) => {
    try {
      const g = getGallery(req.workspaceId, req.params.id);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      const ids = Array.isArray(req.body.asset_ids) ? req.body.asset_ids : [];
      const upd = db.prepare('UPDATE ms_gallery_assets SET sort_order = ? WHERE gallery_id = ? AND asset_id = ?');
      const tx = db.transaction(() => { ids.forEach((aid, i) => upd.run(i, g.id, aid)); });
      tx();
      res.json({ ok: true, count: ids.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/media/galleries/:id/assets/:assetId', auth, (req, res) => {
    try {
      const g = getGallery(req.workspaceId, req.params.id);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      db.prepare('DELETE FROM ms_gallery_assets WHERE gallery_id = ? AND asset_id = ?').run(g.id, req.params.assetId);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // PUBLISH — the human action. Generates the share link and delivers to the client
  // over the existing WhatsApp rail. AI cannot reach this; only an authed user can.
  app.post('/api/media/galleries/:id/publish', auth, async (req, res) => {
    try {
      const g = getGallery(req.workspaceId, req.params.id);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      const count = db.prepare('SELECT COUNT(*) n FROM ms_gallery_assets WHERE gallery_id = ?').get(g.id).n;
      if (count === 0) return res.status(400).json({ error: 'Add photos before publishing' });

      const token = g.share_token || crypto.randomBytes(16).toString('hex');
      db.prepare(`
        UPDATE ms_galleries SET status = 'published', share_token = ?, version = version + 1,
          published_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(token, g.id);

      const link = `${clientBaseUrl}/g/${token}`;
      const project = getProject(req.workspaceId, g.project_id);
      const lead = project?.lead_id ? db.prepare('SELECT * FROM leads WHERE id = ?').get(project.lead_id) : null;

      // Deliver over the client's existing channel (control-first: a human pressed publish).
      let delivery = { whatsapp: 'skipped' };
      const notify = req.body.notify !== false;
      if (notify && lead && lead.customer_phone) {
        const text = `📸 Your gallery "${g.title}" is ready!\nView & download your photos here:\n${link}`;
        try { await sendClientMessage({ lead, userId: req.userId, text }); delivery.whatsapp = 'sent'; }
        catch (e) { delivery.whatsapp = 'failed'; delivery.error = e.message; }
      }

      emitToLead(project, req, 'gallery_published', `Gallery "${g.title}" published & shared`, link);
      logAudit(req.workspaceId, req.userId, 'publish', 'ms_gallery', g.id, { version: g.version + 1, delivery });
      broadcastToWorkspace(req.workspaceId, 'ms_gallery_published', { gallery_id: g.id });
      res.json({ ...getGallery(req.workspaceId, g.id), share_url: link, delivery, password_hash: undefined });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/media/galleries/:id/unpublish', auth, (req, res) => {
    try {
      const r = db.prepare("UPDATE ms_galleries SET status = 'draft' WHERE id = ? AND workspace_id = ?").run(req.params.id, req.workspaceId);
      if (r.changes === 0) return res.status(404).json({ error: 'Gallery not found' });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── ZIP export (worker-backed) ───────────────────────────────────────────────
  // Creates a pending export + enqueues a zip_export job. The worker bundles the
  // gallery: 'web' burns the watermark (when settings.watermark is set); 'original'
  // ships clean full-res. This is how previews stay protected and finals get gated.
  function startGalleryExport(gallery, variant, requestedBy) {
    let settings = {}; try { settings = JSON.parse(gallery.settings || '{}'); } catch {}
    const useVariant = variant === 'original' ? 'original' : 'web';
    let wmText = null;
    if (useVariant === 'web' && settings.watermark) {
      wmText = (typeof settings.watermark === 'string' && settings.watermark.trim())
        ? settings.watermark.trim() : (settings.watermark_text || 'PREVIEW');
    }
    const id = generateId();
    db.prepare(`INSERT INTO ms_exports (id, workspace_id, gallery_id, project_id, variant, watermark, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, gallery.workspace_id, gallery.id, gallery.project_id, useVariant, wmText ? 1 : 0, requestedBy || null);
    db.prepare(`INSERT INTO ms_jobs (id, workspace_id, type, project_id, status, payload)
                VALUES (?, ?, 'zip_export', ?, 'pending', ?)`)
      .run(generateId(), gallery.workspace_id, gallery.project_id, JSON.stringify({ export_id: id, watermark: wmText }));
    return id;
  }
  function shapeExport(exp) {
    return {
      id: exp.id, gallery_id: exp.gallery_id, variant: exp.variant, status: exp.status,
      file_count: exp.file_count, size_bytes: exp.size_bytes, watermark: !!exp.watermark,
      download_url: (exp.status === 'ready' && exp.storage_key) ? publicUrl(exp.storage_key) : null,
      error: exp.error_message || undefined,
    };
  }

  app.post('/api/media/galleries/:id/export', auth, (req, res) => {
    try {
      const g = getGallery(req.workspaceId, req.params.id);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      const count = db.prepare('SELECT COUNT(*) n FROM ms_gallery_assets WHERE gallery_id = ?').get(g.id).n;
      if (count === 0) return res.status(400).json({ error: 'Gallery has no photos to export' });
      const id = startGalleryExport(g, req.body.variant, req.userId);
      logAudit(req.workspaceId, req.userId, 'export', 'ms_gallery', g.id, { variant: req.body.variant || 'web' });
      res.status(202).json(shapeExport(db.prepare('SELECT * FROM ms_exports WHERE id = ?').get(id)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/media/exports/:id', auth, (req, res) => {
    try {
      const exp = db.prepare('SELECT * FROM ms_exports WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!exp) return res.status(404).json({ error: 'Export not found' });
      res.json(shapeExport(exp));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Proofing / selection (ShootProof-style: "pick your N", revision rounds) ──
  function getProofingSet(workspaceId, setId) {
    return db.prepare('SELECT * FROM ms_proofing_sets WHERE id = ? AND workspace_id = ?').get(setId, workspaceId);
  }
  async function notifyGalleryClient(gallery, userId, text) {
    try {
      const project = getProject(gallery.workspace_id, gallery.project_id);
      const lead = project?.lead_id ? db.prepare('SELECT * FROM leads WHERE id = ?').get(project.lead_id) : null;
      if (lead && lead.customer_phone) { await sendClientMessage({ lead, userId, text }); return 'sent'; }
    } catch { /* ignore */ }
    return 'skipped';
  }

  app.post('/api/media/galleries/:id/proofing', auth, (req, res) => {
    try {
      const g = getGallery(req.workspaceId, req.params.id);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      const { title, quota, instructions, due_at } = req.body;
      const id = generateId();
      db.prepare(`INSERT INTO ms_proofing_sets (id, workspace_id, gallery_id, project_id, lead_id, title, quota, instructions, due_at, created_by)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, req.workspaceId, g.id, g.project_id, g.lead_id || null,
             (title && title.trim()) || 'Select your favorites',
             (Number.isFinite(+quota) && +quota > 0) ? +quota : null, instructions || null, due_at || null, req.userId);
      res.status(201).json(getProofingSet(req.workspaceId, id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/media/galleries/:id/proofing', auth, (req, res) => {
    try {
      const g = getGallery(req.workspaceId, req.params.id);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      const sets = db.prepare(`
        SELECT s.*, (SELECT COUNT(*) FROM ms_proofing_selections x WHERE x.set_id = s.id) AS selected
        FROM ms_proofing_sets s WHERE s.gallery_id = ? ORDER BY s.created_at DESC
      `).all(g.id);
      res.json({ sets });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/media/proofing/:setId', auth, (req, res) => {
    try {
      const s = getProofingSet(req.workspaceId, req.params.setId);
      if (!s) return res.status(404).json({ error: 'Set not found' });
      const sel = db.prepare('SELECT asset_id FROM ms_proofing_selections WHERE set_id = ?').all(s.id).map(r => r.asset_id);
      res.json({ ...s, selected_count: sel.length, selected_asset_ids: sel });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/media/proofing/:setId/request-changes', auth, async (req, res) => {
    try {
      const s = getProofingSet(req.workspaceId, req.params.setId);
      if (!s) return res.status(404).json({ error: 'Set not found' });
      db.prepare("UPDATE ms_proofing_sets SET status = 'revision', revision_round = revision_round + 1 WHERE id = ?").run(s.id);
      const g = getGallery(req.workspaceId, s.gallery_id);
      const link = g?.share_token ? `${clientBaseUrl}/g/${g.share_token}` : '';
      const note = (req.body.note || '').toString().slice(0, 500);
      const delivery = g ? await notifyGalleryClient(g, req.userId, `✏️ A few tweaks needed on your selection for "${g.title}".${note ? ' ' + note : ''} ${link}`) : 'skipped';
      logAudit(req.workspaceId, req.userId, 'proofing_revision', 'ms_proofing_set', s.id, { round: s.revision_round + 1 });
      res.json({ ...getProofingSet(req.workspaceId, s.id), delivery });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/media/proofing/:setId/approve', auth, async (req, res) => {
    try {
      const s = getProofingSet(req.workspaceId, req.params.setId);
      if (!s) return res.status(404).json({ error: 'Set not found' });
      db.prepare("UPDATE ms_proofing_sets SET status = 'approved' WHERE id = ?").run(s.id);
      const g = getGallery(req.workspaceId, s.gallery_id);
      const delivery = g ? await notifyGalleryClient(g, req.userId, `✅ Your selection for "${g.title}" is approved — we're on it!`) : 'skipped';
      logAudit(req.workspaceId, req.userId, 'proofing_approve', 'ms_proofing_set', s.id, {});
      res.json({ ...getProofingSet(req.workspaceId, s.id), delivery });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Album builder (manual layout → print-ready PDF) ─────────────────────────
  const ALBUM_LAYOUTS = { single: 1, 'two-h': 2, 'two-v': 2, three: 3, grid4: 4 };
  function getAlbum(workspaceId, id) { return db.prepare('SELECT * FROM ms_albums WHERE id = ? AND workspace_id = ?').get(id, workspaceId); }
  function shapeAlbum(a) {
    let spec = {}; try { spec = JSON.parse(a.spec || '{}'); } catch {}
    return { ...a, spec, pdf_url: (a.pdf_status === 'ready' && a.pdf_storage_key) ? publicUrl(a.pdf_storage_key) : null };
  }

  app.post('/api/media/projects/:id/albums', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const id = generateId();
      const spec = req.body.spec || { w_mm: 300, h_mm: 300, margin_mm: 12 };
      db.prepare('INSERT INTO ms_albums (id, workspace_id, project_id, title, spec, created_by) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, req.workspaceId, project.id, (req.body.title || 'Album').trim(), JSON.stringify(spec), req.userId);
      res.status(201).json(shapeAlbum(getAlbum(req.workspaceId, id)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/media/projects/:id/albums', auth, (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT a.*, (SELECT COUNT(*) FROM ms_album_pages p WHERE p.album_id = a.id) AS page_count
        FROM ms_albums a WHERE a.project_id = ? AND a.workspace_id = ? ORDER BY a.created_at DESC
      `).all(req.params.id, req.workspaceId);
      res.json({ albums: rows.map(shapeAlbum) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/media/albums/:id', auth, (req, res) => {
    try {
      const a = getAlbum(req.workspaceId, req.params.id);
      if (!a) return res.status(404).json({ error: 'Album not found' });
      const pages = db.prepare('SELECT * FROM ms_album_pages WHERE album_id = ? ORDER BY page_no, created_at').all(a.id).map(p => {
        let slots = []; try { slots = JSON.parse(p.slots || '[]'); } catch {}
        const filled = slots.map(s => {
          if (!s || !s.asset_id) return { asset_id: null };
          const asset = db.prepare('SELECT id, filename, variants, storage_key FROM ms_assets WHERE id = ?').get(s.asset_id);
          let v = {}; try { v = JSON.parse(asset?.variants || '{}'); } catch {}
          return { asset_id: s.asset_id, thumb_url: v.thumb || v.web || (asset ? publicUrl(asset.storage_key) : null) };
        });
        return { id: p.id, page_no: p.page_no, layout_template: p.layout_template, slot_count: ALBUM_LAYOUTS[p.layout_template] || 1, slots: filled };
      });
      res.json({ ...shapeAlbum(a), pages });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/media/albums/:id', auth, (req, res) => {
    try {
      const a = getAlbum(req.workspaceId, req.params.id);
      if (!a) return res.status(404).json({ error: 'Album not found' });
      const fields = [], params = [];
      ['title', 'status', 'cover_asset_id'].forEach(f => { if (req.body[f] !== undefined) { fields.push(`${f} = ?`); params.push(req.body[f]); } });
      if (req.body.spec !== undefined) { fields.push('spec = ?'); params.push(JSON.stringify(req.body.spec)); }
      if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
      fields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(a.id, req.workspaceId);
      db.prepare(`UPDATE ms_albums SET ${fields.join(', ')} WHERE id = ? AND workspace_id = ?`).run(...params);
      res.json(shapeAlbum(getAlbum(req.workspaceId, a.id)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/media/albums/:id', auth, (req, res) => {
    try {
      const a = getAlbum(req.workspaceId, req.params.id);
      if (!a) return res.status(404).json({ error: 'Album not found' });
      db.prepare('DELETE FROM ms_album_pages WHERE album_id = ?').run(a.id);
      db.prepare('DELETE FROM ms_albums WHERE id = ?').run(a.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/media/albums/:id/pages', auth, (req, res) => {
    try {
      const a = getAlbum(req.workspaceId, req.params.id);
      if (!a) return res.status(404).json({ error: 'Album not found' });
      const tmpl = ALBUM_LAYOUTS[req.body.layout_template] ? req.body.layout_template : 'single';
      const maxNo = db.prepare('SELECT COALESCE(MAX(page_no), -1) m FROM ms_album_pages WHERE album_id = ?').get(a.id).m;
      const id = generateId();
      db.prepare('INSERT INTO ms_album_pages (id, album_id, page_no, layout_template, slots) VALUES (?, ?, ?, ?, ?)')
        .run(id, a.id, maxNo + 1, tmpl, JSON.stringify(Array.isArray(req.body.slots) ? req.body.slots : []));
      res.status(201).json(db.prepare('SELECT * FROM ms_album_pages WHERE id = ?').get(id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Specific route MUST be registered before the parametric /pages/:pageId below.
  app.put('/api/media/albums/:id/pages/order', auth, (req, res) => {
    try {
      const a = getAlbum(req.workspaceId, req.params.id);
      if (!a) return res.status(404).json({ error: 'Album not found' });
      const ids = Array.isArray(req.body.page_ids) ? req.body.page_ids : [];
      const upd = db.prepare('UPDATE ms_album_pages SET page_no = ? WHERE id = ? AND album_id = ?');
      const tx = db.transaction(() => ids.forEach((pid, i) => upd.run(i, pid, a.id)));
      tx();
      res.json({ ok: true, count: ids.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/media/albums/:id/pages/:pageId', auth, (req, res) => {
    try {
      const a = getAlbum(req.workspaceId, req.params.id);
      if (!a) return res.status(404).json({ error: 'Album not found' });
      const fields = [], params = [];
      if (req.body.layout_template && ALBUM_LAYOUTS[req.body.layout_template]) { fields.push('layout_template = ?'); params.push(req.body.layout_template); }
      if (req.body.slots !== undefined) { fields.push('slots = ?'); params.push(JSON.stringify(req.body.slots)); }
      if (req.body.page_no !== undefined) { fields.push('page_no = ?'); params.push(req.body.page_no); }
      if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
      params.push(req.params.pageId, a.id);
      const r = db.prepare(`UPDATE ms_album_pages SET ${fields.join(', ')} WHERE id = ? AND album_id = ?`).run(...params);
      if (r.changes === 0) return res.status(404).json({ error: 'Page not found' });
      res.json(db.prepare('SELECT * FROM ms_album_pages WHERE id = ?').get(req.params.pageId));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/media/albums/:id/pages/:pageId', auth, (req, res) => {
    try {
      const a = getAlbum(req.workspaceId, req.params.id);
      if (!a) return res.status(404).json({ error: 'Album not found' });
      db.prepare('DELETE FROM ms_album_pages WHERE id = ? AND album_id = ?').run(req.params.pageId, a.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Quick start: one keeper per page (control-first — a draft the user then arranges).
  app.post('/api/media/albums/:id/autofill', auth, (req, res) => {
    try {
      const a = getAlbum(req.workspaceId, req.params.id);
      if (!a) return res.status(404).json({ error: 'Album not found' });
      const decision = req.body.decision || 'keep';
      const picks = db.prepare(`
        SELECT al.id FROM ms_assets al JOIN ms_cull_decisions c ON c.asset_id = al.id
        WHERE al.project_id = ? AND c.decision = ?
        ORDER BY al.capture_time IS NULL, al.capture_time, al.created_at
      `).all(a.project_id, decision);
      if (picks.length === 0) return res.status(400).json({ error: `No ${decision} photos to place yet` });
      let n = db.prepare('SELECT COALESCE(MAX(page_no), -1) m FROM ms_album_pages WHERE album_id = ?').get(a.id).m + 1;
      const ins = db.prepare('INSERT INTO ms_album_pages (id, album_id, page_no, layout_template, slots) VALUES (?, ?, ?, ?, ?)');
      const tx = db.transaction(() => { picks.forEach(p => ins.run(generateId(), a.id, n++, 'single', JSON.stringify([{ asset_id: p.id }]))); });
      tx();
      res.json({ added: picks.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/media/albums/:id/export', auth, (req, res) => {
    try {
      const a = getAlbum(req.workspaceId, req.params.id);
      if (!a) return res.status(404).json({ error: 'Album not found' });
      const pages = db.prepare('SELECT COUNT(*) n FROM ms_album_pages WHERE album_id = ?').get(a.id).n;
      if (pages === 0) return res.status(400).json({ error: 'Add pages before exporting' });
      db.prepare("UPDATE ms_albums SET pdf_status = 'pending' WHERE id = ?").run(a.id);
      db.prepare("INSERT INTO ms_jobs (id, workspace_id, type, project_id, status, payload) VALUES (?, ?, 'pdf_export', ?, 'pending', ?)")
        .run(generateId(), req.workspaceId, a.project_id, JSON.stringify({ album_id: a.id }));
      logAudit(req.workspaceId, req.userId, 'album_export', 'ms_album', a.id, { pages });
      res.status(202).json({ status: 'pending' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Video: manual clip selection (NO auto-reel — the editor sets in/out) ─────
  app.get('/api/media/projects/:id/videos', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const rows = db.prepare(`
        SELECT a.*, (SELECT COUNT(*) FROM ms_video_clips c WHERE c.asset_id = a.id) AS clip_count
        FROM ms_assets a WHERE a.project_id = ? AND a.type = 'video' ORDER BY a.created_at
      `).all(project.id);
      res.json({ videos: rows.map(shapeAsset) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Client-read technical meta (duration/dimensions from the browser <video>).
  app.put('/api/media/assets/:id/meta', auth, (req, res) => {
    try {
      const a = db.prepare('SELECT id FROM ms_assets WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!a) return res.status(404).json({ error: 'Asset not found' });
      const fields = [], params = [];
      ['duration_ms', 'width', 'height'].forEach(f => { if (Number.isFinite(+req.body[f])) { fields.push(`${f} = ?`); params.push(Math.round(+req.body[f])); } });
      if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });
      params.push(a.id);
      db.prepare(`UPDATE ms_assets SET ${fields.join(', ')} WHERE id = ?`).run(...params);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/media/assets/:id/clips', auth, (req, res) => {
    try {
      const a = db.prepare('SELECT id FROM ms_assets WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!a) return res.status(404).json({ error: 'Asset not found' });
      res.json({ clips: db.prepare('SELECT * FROM ms_video_clips WHERE asset_id = ? ORDER BY sort_order, in_ms').all(a.id) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Specific route before the parametric /clips/:clipId routes below.
  app.put('/api/media/assets/:id/clips/order', auth, (req, res) => {
    try {
      const a = db.prepare('SELECT id FROM ms_assets WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!a) return res.status(404).json({ error: 'Asset not found' });
      const ids = Array.isArray(req.body.clip_ids) ? req.body.clip_ids : [];
      const upd = db.prepare('UPDATE ms_video_clips SET sort_order = ? WHERE id = ? AND asset_id = ?');
      const tx = db.transaction(() => ids.forEach((cid, i) => upd.run(i, cid, a.id)));
      tx();
      res.json({ ok: true, count: ids.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/media/assets/:id/clips', auth, (req, res) => {
    try {
      const a = db.prepare('SELECT * FROM ms_assets WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!a) return res.status(404).json({ error: 'Asset not found' });
      const inMs = Math.max(0, Math.round(+req.body.in_ms || 0));
      const outMs = Math.round(+req.body.out_ms || 0);
      if (outMs <= inMs) return res.status(400).json({ error: 'Clip end must be after its start' });
      const maxNo = db.prepare('SELECT COALESCE(MAX(sort_order), -1) m FROM ms_video_clips WHERE asset_id = ?').get(a.id).m;
      const id = generateId();
      db.prepare('INSERT INTO ms_video_clips (id, workspace_id, project_id, asset_id, label, in_ms, out_ms, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, a.workspace_id, a.project_id, a.id, (req.body.label || '').toString().slice(0, 200) || null, inMs, outMs, maxNo + 1, req.userId);
      res.status(201).json(db.prepare('SELECT * FROM ms_video_clips WHERE id = ?').get(id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/media/clips/:clipId', auth, (req, res) => {
    try {
      const c = db.prepare('SELECT * FROM ms_video_clips WHERE id = ? AND workspace_id = ?').get(req.params.clipId, req.workspaceId);
      if (!c) return res.status(404).json({ error: 'Clip not found' });
      const fields = [], params = [];
      if (req.body.label !== undefined) { fields.push('label = ?'); params.push((req.body.label || '').toString().slice(0, 200) || null); }
      if (req.body.in_ms !== undefined || req.body.out_ms !== undefined) {
        const inMs = req.body.in_ms !== undefined ? Math.max(0, Math.round(+req.body.in_ms)) : c.in_ms;
        const outMs = req.body.out_ms !== undefined ? Math.round(+req.body.out_ms) : c.out_ms;
        if (outMs <= inMs) return res.status(400).json({ error: 'Clip end must be after its start' });
        fields.push('in_ms = ?'); params.push(inMs);
        fields.push('out_ms = ?'); params.push(outMs);
      }
      if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });
      params.push(c.id);
      db.prepare(`UPDATE ms_video_clips SET ${fields.join(', ')} WHERE id = ?`).run(...params);
      res.json(db.prepare('SELECT * FROM ms_video_clips WHERE id = ?').get(c.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/media/clips/:clipId', auth, (req, res) => {
    try {
      db.prepare('DELETE FROM ms_video_clips WHERE id = ? AND workspace_id = ?').run(req.params.clipId, req.workspaceId);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Public client portal (NO auth — the share token IS the capability) ───────
  function loadPublishedGallery(token) {
    return db.prepare("SELECT * FROM ms_galleries WHERE share_token = ? AND status = 'published'").get(token);
  }

  app.get('/api/media/portal/:token', (req, res) => {
    try {
      const g = loadPublishedGallery(req.params.token);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      if (!portalAllowed(g, req.query.pw)) return res.status(401).json({ error: 'Password required', needs_password: true });

      let settings = {}; try { settings = JSON.parse(g.settings || '{}'); } catch {}
      const favCounts = {};
      db.prepare('SELECT asset_id, COUNT(*) c FROM ms_client_favorites WHERE gallery_id = ? GROUP BY asset_id').all(g.id)
        .forEach(r => { favCounts[r.asset_id] = r.c; });
      const rows = db.prepare(`
        SELECT a.*, ga.sort_order FROM ms_gallery_assets ga JOIN ms_assets a ON a.id = ga.asset_id
        WHERE ga.gallery_id = ? AND ga.is_hidden = 0 ORDER BY ga.sort_order
      `).all(g.id);
      try {
        db.prepare('INSERT INTO ms_gallery_access (id, gallery_id, access_token, last_viewed_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
          .run(generateId(), g.id, req.params.token);
      } catch {}
      // active proofing set (if any) + this gallery's current selections
      let proofing = null;
      const pset = db.prepare("SELECT * FROM ms_proofing_sets WHERE gallery_id = ? AND status IN ('open','revision','submitted') ORDER BY created_at DESC LIMIT 1").get(g.id);
      if (pset) {
        const sel = db.prepare('SELECT asset_id FROM ms_proofing_selections WHERE set_id = ?').all(pset.id).map(r => r.asset_id);
        proofing = { id: pset.id, title: pset.title, quota: pset.quota, instructions: pset.instructions, status: pset.status, selected_asset_ids: sel, selected_count: sel.length };
      }
      res.json({
        title: g.title, version: g.version,
        download_policy: settings.download_policy || 'web',
        watermark: !!settings.watermark,
        proofing,
        assets: rows.map(r => shapePublicAsset(r, favCounts, settings)),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/media/portal/:token/favorite', (req, res) => {
    try {
      const g = loadPublishedGallery(req.params.token);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      if (!portalAllowed(g, req.body.pw)) return res.status(401).json({ error: 'Password required' });
      const { asset_id, contact } = req.body;
      if (!asset_id) return res.status(400).json({ error: 'asset_id required' });
      const who = (contact || 'guest').toString().slice(0, 120);
      const existing = db.prepare('SELECT id FROM ms_client_favorites WHERE gallery_id = ? AND asset_id = ? AND contact_identifier = ?').get(g.id, asset_id, who);
      let favorited;
      if (existing) { db.prepare('DELETE FROM ms_client_favorites WHERE id = ?').run(existing.id); favorited = false; }
      else { db.prepare('INSERT INTO ms_client_favorites (id, gallery_id, asset_id, contact_identifier) VALUES (?, ?, ?, ?)').run(generateId(), g.id, asset_id, who); favorited = true; }
      const count = db.prepare('SELECT COUNT(*) n FROM ms_client_favorites WHERE gallery_id = ? AND asset_id = ?').get(g.id, asset_id).n;
      try { broadcastToWorkspace(g.workspace_id, 'ms_client_favorited', { gallery_id: g.id, asset_id, favorited }); } catch {}
      res.json({ favorited, favorites: count });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/media/portal/:token/comment', (req, res) => {
    try {
      const g = loadPublishedGallery(req.params.token);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      if (!portalAllowed(g, req.body.pw)) return res.status(401).json({ error: 'Password required' });
      const { asset_id, contact, body } = req.body;
      if (!body || !body.trim()) return res.status(400).json({ error: 'body required' });
      const id = generateId();
      db.prepare('INSERT INTO ms_client_comments (id, gallery_id, asset_id, contact_identifier, body) VALUES (?, ?, ?, ?, ?)')
        .run(id, g.id, asset_id || null, (contact || 'guest').toString().slice(0, 120), body.trim().slice(0, 2000));
      try { broadcastToWorkspace(g.workspace_id, 'ms_client_commented', { gallery_id: g.id, asset_id }); } catch {}
      res.status(201).json(db.prepare('SELECT * FROM ms_client_comments WHERE id = ?').get(id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Client "Download all" — respects the gallery's download policy.
  app.post('/api/media/portal/:token/export', (req, res) => {
    try {
      const g = loadPublishedGallery(req.params.token);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      if (!portalAllowed(g, req.body.pw)) return res.status(401).json({ error: 'Password required' });
      let settings = {}; try { settings = JSON.parse(g.settings || '{}'); } catch {}
      const policy = settings.download_policy || 'web';
      if (policy === 'none') return res.status(403).json({ error: 'Downloads are disabled for this gallery' });
      const count = db.prepare('SELECT COUNT(*) n FROM ms_gallery_assets WHERE gallery_id = ?').get(g.id).n;
      if (count === 0) return res.status(400).json({ error: 'Gallery has no photos' });
      const id = startGalleryExport(g, policy === 'high-res' ? 'original' : 'web', null);
      res.status(202).json({ export_id: id, status: 'pending' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/media/portal/:token/export/:exportId', (req, res) => {
    try {
      const g = loadPublishedGallery(req.params.token);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      const exp = db.prepare('SELECT * FROM ms_exports WHERE id = ? AND gallery_id = ?').get(req.params.exportId, g.id);
      if (!exp) return res.status(404).json({ error: 'Export not found' });
      res.json(shapeExport(exp));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Client toggles a selection within an active proofing set.
  app.post('/api/media/portal/:token/proofing/:setId/select', (req, res) => {
    try {
      const g = loadPublishedGallery(req.params.token);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      if (!portalAllowed(g, req.body.pw)) return res.status(401).json({ error: 'Password required' });
      const s = db.prepare('SELECT * FROM ms_proofing_sets WHERE id = ? AND gallery_id = ?').get(req.params.setId, g.id);
      if (!s) return res.status(404).json({ error: 'Selection not found' });
      if (!['open', 'revision'].includes(s.status)) return res.status(409).json({ error: 'This selection is closed' });
      const { asset_id, selected, contact } = req.body;
      if (!asset_id) return res.status(400).json({ error: 'asset_id required' });
      if (!db.prepare('SELECT 1 FROM ms_gallery_assets WHERE gallery_id = ? AND asset_id = ?').get(g.id, asset_id)) {
        return res.status(400).json({ error: 'asset not in this gallery' });
      }
      const exists = db.prepare('SELECT id FROM ms_proofing_selections WHERE set_id = ? AND asset_id = ?').get(s.id, asset_id);
      let isSelected;
      if (selected === false || (selected === undefined && exists)) {
        if (exists) db.prepare('DELETE FROM ms_proofing_selections WHERE id = ?').run(exists.id);
        isSelected = false;
      } else if (!exists) {
        db.prepare('INSERT INTO ms_proofing_selections (id, set_id, asset_id, contact_identifier, round) VALUES (?, ?, ?, ?, ?)')
          .run(generateId(), s.id, asset_id, (contact || 'guest').toString().slice(0, 120), s.revision_round);
        isSelected = true;
      } else { isSelected = true; }
      const count = db.prepare('SELECT COUNT(*) n FROM ms_proofing_selections WHERE set_id = ?').get(s.id).n;
      res.json({ selected: isSelected, selected_count: count, quota: s.quota });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Client submits the set → photographer is notified.
  app.post('/api/media/portal/:token/proofing/:setId/submit', (req, res) => {
    try {
      const g = loadPublishedGallery(req.params.token);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      if (!portalAllowed(g, req.body.pw)) return res.status(401).json({ error: 'Password required' });
      const s = db.prepare('SELECT * FROM ms_proofing_sets WHERE id = ? AND gallery_id = ?').get(req.params.setId, g.id);
      if (!s) return res.status(404).json({ error: 'Selection not found' });
      const count = db.prepare('SELECT COUNT(*) n FROM ms_proofing_selections WHERE set_id = ?').get(s.id).n;
      if (count === 0) return res.status(400).json({ error: 'Select at least one photo first' });
      db.prepare("UPDATE ms_proofing_sets SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP WHERE id = ?").run(s.id);
      try {
        const project = getProject(g.workspace_id, g.project_id);
        if (project) emitToLead(project, { userId: null, senderName: 'Client' }, 'proofing_submitted', `Client submitted ${count} selection(s) for "${g.title}"`, null);
        broadcastToWorkspace(g.workspace_id, 'ms_proofing_submitted', { gallery_id: g.id, set_id: s.id, count });
      } catch {}
      res.json({ status: 'submitted', selected_count: count });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Worker: drains ms_jobs → variants + EXIF + advisory CV scores ────────────
  // Pass startWorker:false in tests to drive worker.processOnce() deterministically.
  const worker = createMediaWorker(db, { uploadsDir, path, fs, generateId, broadcastToWorkspace });
  if (deps.startWorker !== false) worker.start();

  console.log('📸 Media Studio module mounted at /api/media');
  return { worker };
};
