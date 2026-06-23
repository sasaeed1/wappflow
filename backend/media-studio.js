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
const videoEngine = require('./video-engine');
const videoLuts = require('./video-luts');
const videoTemplates = require('./video-templates');
const videoAiDrafts = require('./video-ai-drafts');
const crypto = require('crypto');

module.exports = function mountMediaStudio(app, db, deps = {}) {
  const {
    auth = (req, res, next) => next(),
    generateId = () => require('crypto').randomUUID(),
    logAudit = () => {},
    broadcastToWorkspace = () => {},
    addContactHistory = () => {},
    notify = () => {},
    multer = require('multer'),
    path = require('path'),
    fs = require('fs'),
    uploadsDir = path.join(__dirname, 'uploads'),
    // Delivery seam: inject the real sender at mount (whatsappService.sendMessage +
    // saveOutgoingMessage). Defaults to a no-op so the module works without messaging.
    sendClientMessage = async () => ({ skipped: true }),
    clientBaseUrl = process.env.FRONTEND_URL || '',
    ai = null, // text-AI provider chain (ai-engine.js) — powers Studio Copilot
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
  safeAlter('ALTER TABLE ms_jobs ADD COLUMN lease_until TIMESTAMP'); // worker lease → stale-job reaper (multi-worker scale)
  safeAlter('ALTER TABLE ms_assets ADD COLUMN edits TEXT'); // non-destructive edit params (JSON)
  safeAlter('ALTER TABLE ms_assets ADD COLUMN deleted_at TIMESTAMP'); // soft-delete → Trash (30-day restore)
  // Video metadata (filled by the worker's ffprobe pass) + proxy/poster for the editor.
  for (const col of ['v_duration_ms INTEGER', 'v_width INTEGER', 'v_height INTEGER', 'v_fps REAL',
    'v_codec TEXT', 'v_has_audio INTEGER', 'proxy_url TEXT', 'poster_url TEXT']) {
    safeAlter(`ALTER TABLE ms_assets ADD COLUMN ${col}`);
  }

  // ── Media Intelligence (Track 0) — the swappable Analyzer abstraction.
  // Business logic only ever reads ms_asset_scores; whether a score came from the
  // server worker (now) or a desktop ONNX runtime (later) is invisible here.
  const intel = require('./analyzers')(db, { generateId });
  intel.ensureSchema();
  // Client-named favourite collections (gallery CX 2.0)
  db.exec(`CREATE TABLE IF NOT EXISTS ms_fav_collections (
    id TEXT PRIMARY KEY, gallery_id TEXT NOT NULL, workspace_id TEXT, name TEXT,
    contact_identifier TEXT, asset_ids TEXT DEFAULT '[]', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // PORTFOLIO — a per-user public showcase. Curated (the creator controls every
  // item), auto-fed from PUBLISHED galleries/reels (never raw), with a vanity
  // share link. Owns ms_portfolios + ms_portfolio_items only.
  db.exec(`
    CREATE TABLE IF NOT EXISTS ms_portfolios (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      user_id TEXT,                       -- owner (one portfolio per user)
      handle TEXT UNIQUE,                 -- vanity slug → /folio/:handle
      token TEXT UNIQUE,                  -- opaque fallback resolver
      title TEXT,
      tagline TEXT,
      bio TEXT,
      theme TEXT DEFAULT 'atelier',
      cover_url TEXT,
      avatar_url TEXT,
      is_public INTEGER DEFAULT 0,
      auto_include INTEGER DEFAULT 1,     -- pull published-gallery work in automatically
      settings TEXT DEFAULT '{}',         -- JSON: accent, contact{}, social{}, layout opts
      view_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ms_portfolio_items (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      portfolio_id TEXT NOT NULL,
      asset_id TEXT,                      -- ref into ms_assets (library item), nullable
      storage_key TEXT,                   -- for portfolio-only direct uploads
      variants TEXT DEFAULT '{}',
      kind TEXT DEFAULT 'photo',          -- photo|video
      source TEXT DEFAULT 'manual',       -- manual|gallery|upload|reel
      gallery_id TEXT,                    -- provenance
      title TEXT,
      caption TEXT,
      featured INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ms_portfolio_ws ON ms_portfolios(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_ms_portfolio_handle ON ms_portfolios(handle);
    CREATE INDEX IF NOT EXISTS idx_ms_pf_items ON ms_portfolio_items(portfolio_id);
  `);

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
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext)) return 'audio';
    return 'file';
  }

  // Storage abstraction (local disk or Cloudflare R2 via STORAGE_PROVIDER) — the ONE
  // place that knows which provider is active. Business logic below only calls
  // publicUrl() / storage.* and never touches /uploads or a provider directly.
  const storage = require('./storage')({ uploadsDir, path, fs });

  // THE single public-URL implementation — provider-agnostic (local → /uploads,
  // R2 → public/CDN base or the /api/storage presign-redirect). Never build a media
  // URL by hand anywhere else.
  function publicUrl(storageKey) { return storage.getPublicUrl(storageKey); }

  // Per-asset storage tracking (Phase 10): provider + size + uploaded_at, so future
  // migrations / backups / desktop-sync / storage analytics are trivial. Guarded
  // additive ALTERs — existing rows default to 'local', nothing breaks.
  for (const [col, def] of [['storage_provider', "TEXT DEFAULT 'local'"], ['storage_size', 'INTEGER'], ['uploaded_at', 'TIMESTAMP']]) {
    try { db.prepare(`SELECT ${col} FROM ms_assets LIMIT 1`).get(); }
    catch { try { db.exec(`ALTER TABLE ms_assets ADD COLUMN ${col} ${def}`); } catch {} }
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

  // ── Watermark helpers (jimp; non-destructive — writes a separate variant) ────
  const keyToPath = (u) => path.join(uploadsDir, String(u || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\/?uploads\//, ''));
  const pickWmFont = (Jimp, cfg) => Jimp[`FONT_SANS_128_${(cfg.color || 'white') === 'black' ? 'BLACK' : 'WHITE'}`];
  async function buildMark(Jimp, W, H, cfg, logoImg, font) {
    let mark;
    if (cfg.type === 'logo' && logoImg) {
      mark = logoImg.clone();
      mark.resize(Math.max(40, Math.round(W * ((Number(cfg.size) || 28) / 100))), Jimp.AUTO);
    } else if (font) {
      const text = (cfg.text || 'PROOF').slice(0, 60);
      const tw = Jimp.measureText(font, text) || 10;
      const th = Jimp.measureTextHeight(font, text, tw) || 10;
      mark = new Jimp(tw, th, 0x00000000);
      mark.print(font, 0, 0, text);
      mark.resize(Math.max(40, Math.round(W * ((Number(cfg.size) || 35) / 100))), Jimp.AUTO);
    } else { return null; }
    mark.opacity(Math.max(0.05, Math.min(1, Number(cfg.opacity) || 0.5)));
    return mark;
  }
  async function applyWatermark(Jimp, img, cfg, logoImg, font) {
    const W = img.bitmap.width, H = img.bitmap.height;
    const mark = await buildMark(Jimp, W, H, cfg, logoImg, font);
    if (!mark) return;
    const margin = Math.round(Math.min(W, H) * 0.04);
    const mw = mark.bitmap.width, mh = mark.bitmap.height;
    const pos = cfg.position || 'bottom-right';
    if (pos === 'tiled') {
      const stepX = mw + Math.round(W * 0.10), stepY = mh + Math.round(H * 0.12);
      for (let y = -mh; y < H; y += stepY) for (let x = -mw; x < W; x += stepX) img.composite(mark, x, y);
      return;
    }
    let x = margin, y = margin;
    if (pos.includes('right')) x = W - mw - margin;
    if (pos.includes('bottom')) y = H - mh - margin;
    if (pos === 'center') { x = Math.round((W - mw) / 2); y = Math.round((H - mh) / 2); }
    img.composite(mark, x, y);
  }

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
      watermarked: !!variants.watermarked,
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
          (SELECT COUNT(*) FROM ms_assets a WHERE a.project_id = p.id AND a.deleted_at IS NULL) AS asset_count,
          (SELECT a.variants FROM ms_assets a WHERE a.project_id = p.id AND a.type = 'photo' AND a.deleted_at IS NULL
             ORDER BY a.capture_time IS NULL, a.capture_time, a.created_at LIMIT 1) AS _cover_variants,
          (SELECT a.storage_key FROM ms_assets a WHERE a.project_id = p.id AND a.type = 'photo' AND a.deleted_at IS NULL
             ORDER BY a.capture_time IS NULL, a.capture_time, a.created_at LIMIT 1) AS _cover_key
        FROM ms_projects p
        LEFT JOIN leads l ON l.id = p.lead_id
        WHERE ${where}
        ORDER BY p.created_at DESC
      `).all(...params);
      // derive a cover thumbnail from the first photo so home cards/hero aren't blank
      const projects = rows.map(({ _cover_variants, _cover_key, ...p }) => {
        let cover_url = null;
        if (_cover_variants) { try { const v = JSON.parse(_cover_variants); cover_url = v.thumb || v.web || null; } catch {} }
        if (!cover_url && _cover_key) cover_url = publicUrl(_cover_key);
        return { ...p, cover_url };
      });
      res.json({ projects });
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

  // ── Direct-to-R2 signed upload (desktop/web upload bytes straight to the bucket,
  //    never through the API — the server is never the bottleneck). ──────────────
  //  1) sign → { provider, key, upload_url }; client PUTs the file to upload_url.
  //     (On local provider, upload_url is null → use the multipart /assets route.)
  app.post('/api/media/projects/:id/uploads/sign', auth, async (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const fn = String(req.body.filename || 'file').normalize('NFKD').replace(/[^\w.\-]/g, '_').slice(0, 100);
      const key = `media/projects/${project.id}/${Date.now()}-${Math.random().toString(16).slice(2, 8)}-${fn}`;
      const upload_url = await storage.generateSignedUploadUrl(key, req.body.content_type);
      res.json({ provider: storage.provider, key, upload_url, expires_in: 900 });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  //  2) complete → after the client PUT lands, register the asset + enqueue ingest.
  app.post('/api/media/projects/:id/uploads/complete', auth, async (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const { key, filename, content_type, size, folder_id } = req.body || {};
      if (!key) return res.status(400).json({ error: 'key required' });
      if (!(await storage.fileExists(key))) return res.status(409).json({ error: 'file not in storage yet — PUT it to the signed URL first' });
      const assetId = generateId();
      const variants = JSON.stringify({ original: publicUrl(key) });
      db.prepare(`INSERT INTO ms_assets (id, workspace_id, project_id, folder_id, type, storage_key, filename, mime, size_bytes, storage_provider, storage_size, uploaded_at, variants, status, uploaded_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,'ready',?)`)
        .run(assetId, req.workspaceId, project.id, folder_id || null, detectType(content_type || '', filename || key), key, filename || key.split('/').pop(), content_type || null, size || null, storage.provider, size || null, variants, req.userId);
      db.prepare(`INSERT INTO ms_jobs (id, workspace_id, type, asset_id, project_id, status, payload) VALUES (?,?,'ingest',?,?,'pending',?)`)
        .run(generateId(), req.workspaceId, assetId, project.id, JSON.stringify({ make: ['variants', 'exif', 'score'] }));
      res.json({ asset: shapeAsset(db.prepare('SELECT * FROM ms_assets WHERE id = ?').get(assetId)) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Ingest: upload (local disk today) ──────────────────────────────────────
  app.post('/api/media/projects/:id/assets', auth, mediaUpload.array('files', 200), async (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const files = req.files || [];
      if (files.length === 0) return res.status(400).json({ error: 'No files uploaded (field name: files)' });

      const folderId = req.body.folder_id || null;

      // When STORAGE_PROVIDER=r2, push each original to R2 (async — before the sync insert
      // tx) and free the local temp. An R2 failure falls back to keeping the file local —
      // so a hiccup never loses an upload. Default (local) provider: nothing changes.
      const prepared = [];
      for (const f of files) {
        const storageKey = `media/${path.basename(f.path)}`; // relative key
        let provider = 'local';
        if (storage.isRemote) {
          try { await storage.uploadFile(storageKey, fs.readFileSync(f.path), f.mimetype); provider = 'r2'; try { fs.unlinkSync(f.path); } catch {} }
          catch { provider = 'local'; }
        }
        prepared.push({ f, storageKey, provider });
      }

      const insertAsset = db.prepare(`
        INSERT INTO ms_assets (id, workspace_id, project_id, folder_id, type, storage_key, filename, mime, size_bytes, storage_provider, storage_size, uploaded_at, variants, status, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 'ready', ?)
      `);
      const insertJob = db.prepare(`
        INSERT INTO ms_jobs (id, workspace_id, type, asset_id, project_id, status, payload)
        VALUES (?, ?, 'ingest', ?, ?, 'pending', ?)
      `);

      const created = [];
      const tx = db.transaction(() => {
        for (const { f, storageKey, provider } of prepared) {
          const assetId = generateId();
          const variants = JSON.stringify({ original: publicUrl(storageKey) });
          insertAsset.run(assetId, req.workspaceId, project.id, folderId,
            detectType(f.mimetype, f.originalname), storageKey, f.originalname, f.mimetype, f.size, provider, f.size, variants, req.userId);
          // Enqueue downstream work (variants/EXIF/CV scoring) — worker is provider-aware.
          insertJob.run(generateId(), req.workspaceId, assetId, project.id,
            JSON.stringify({ make: ['variants', 'exif', 'score'] }));
          created.push(shapeAsset(db.prepare('SELECT * FROM ms_assets WHERE id = ?').get(assetId)));
        }
      });
      tx();

      // New media may improve a reel → flag existing AI drafts as refreshable (never auto-rebuilt).
      try { db.prepare("UPDATE ms_timelines SET ai_stale = 1 WHERE project_id = ? AND source = 'ai_draft'").run(project.id); } catch {}

      emitToLead(project, req, 'media_upload', `${created.length} file(s) added to ${project.title}`, null);
      logAudit(req.workspaceId, req.userId, 'upload', 'ms_project', project.id, { count: created.length });
      broadcastToWorkspace(req.workspaceId, 'ms_assets_added', { project_id: project.id, count: created.length });
      res.status(201).json({ uploaded: created.length, assets: created });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Watermark (apply / bulk apply — non-destructive, originals preserved) ────
  app.post('/api/media/projects/:id/watermark/logo', auth, mediaUpload.single('file'), (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (!req.file) return res.status(400).json({ error: 'No file' });
      res.json({ ok: true, url: publicUrl(`media/${path.basename(req.file.path)}`) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/media/projects/:id/watermark/apply', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      let Jimp; try { Jimp = require('jimp'); } catch { return res.status(503).json({ error: 'Image processing unavailable' }); }
      const cfg = req.body.config || {};
      const ids = Array.isArray(req.body.assetIds) ? req.body.assetIds.slice(0, 2000) : [];
      // persist the watermark config onto the project
      let ps = {}; try { ps = JSON.parse(project.settings || '{}'); } catch {}
      ps.watermark = { ...cfg, enabled: true };
      db.prepare('UPDATE ms_projects SET settings = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(ps), project.id);
      res.json({ ok: true, queued: ids.length });

      // process in the background so large batches never time out the request
      (async () => {
        let logoImg = null, font = null;
        try { if (cfg.type === 'logo' && cfg.logo_url) logoImg = await Jimp.read(keyToPath(cfg.logo_url)); } catch {}
        try { if (cfg.type !== 'logo') font = await Jimp.loadFont(pickWmFont(Jimp, cfg)); } catch {}
        let done = 0;
        for (const aid of ids) {
          try {
            const a = db.prepare('SELECT * FROM ms_assets WHERE id = ? AND project_id = ? AND workspace_id = ?').get(aid, project.id, req.workspaceId);
            if (!a || a.type !== 'photo') continue;
            const src = keyToPath(a.storage_key);
            if (!fs.existsSync(src)) continue;
            const img = await Jimp.read(src);
            if (img.bitmap.width > 2400) img.resize(2400, Jimp.AUTO);
            await applyWatermark(Jimp, img, cfg, logoImg, font);
            const outKey = `media/wm-${a.id}.jpg`;
            img.quality(82); await img.writeAsync(keyToPath(outKey));
            let v = {}; try { v = JSON.parse(a.variants || '{}'); } catch {}
            v.watermarked = publicUrl(outKey);
            db.prepare('UPDATE ms_assets SET variants = ? WHERE id = ?').run(JSON.stringify(v), a.id);
            done++;
          } catch { /* skip this asset */ }
        }
        try { broadcastToWorkspace(req.workspaceId, 'ms_watermark_done', { project_id: project.id, count: done }); } catch {}
      })();
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/media/projects/:id/watermark/remove', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const ids = Array.isArray(req.body.assetIds) ? req.body.assetIds : [];
      let removed = 0;
      for (const aid of ids) {
        const a = db.prepare('SELECT * FROM ms_assets WHERE id = ? AND project_id = ?').get(aid, project.id);
        if (!a) continue;
        let v = {}; try { v = JSON.parse(a.variants || '{}'); } catch {}
        if (v.watermarked) { try { fs.unlinkSync(keyToPath(v.watermarked)); } catch {} delete v.watermarked; db.prepare('UPDATE ms_assets SET variants = ? WHERE id = ?').run(JSON.stringify(v), a.id); removed++; }
      }
      broadcastToWorkspace(req.workspaceId, 'ms_watermark_done', { project_id: project.id, count: removed });
      res.json({ ok: true, removed });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Auto-organize: cluster photos into folders by capture-time gaps ──────────
  app.post('/api/media/projects/:id/auto-folders', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const gapMin = Math.max(10, Number(req.body.gap_minutes) || 90);
      const parseT = (s) => { if (!s) return null; let v = String(s).trim(); const m = v.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}:\d{2}:\d{2})/); if (m) v = `${m[1]}-${m[2]}-${m[3]}T${m[4]}`; const t = Date.parse(v); return isNaN(t) ? null : t; };
      const assets = db.prepare("SELECT id, capture_time, created_at FROM ms_assets WHERE project_id = ? AND deleted_at IS NULL AND type = 'photo' ORDER BY capture_time IS NULL, capture_time, created_at").all(project.id);
      if (!assets.length) return res.json({ ok: true, folders: 0, message: 'No photos to organize.' });
      const clusters = []; let cur = []; let prev = null;
      for (const a of assets) {
        const t = parseT(a.capture_time);
        if (cur.length && prev != null && t != null && (t - prev) > gapMin * 60000) { clusters.push(cur); cur = []; }
        cur.push(a); if (t != null) prev = t;
      }
      if (cur.length) clusters.push(cur);
      if (clusters.length < 2) return res.json({ ok: true, folders: 0, message: 'These photos look like one session — nothing to split (needs capture times from EXIF).' });
      let order = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 n FROM ms_folders WHERE project_id = ?').get(project.id).n;
      const mkFolder = db.prepare('INSERT INTO ms_folders (id, workspace_id, project_id, name, sort_order) VALUES (?,?,?,?,?)');
      const setFolder = db.prepare('UPDATE ms_assets SET folder_id = ? WHERE id = ?');
      db.transaction(() => {
        clusters.forEach((cl, i) => {
          const firstT = cl.map(x => parseT(x.capture_time)).find(Boolean);
          const label = firstT ? new Date(firstT).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : `Session ${i + 1}`;
          const fid = generateId();
          mkFolder.run(fid, req.workspaceId, project.id, `${label} · ${cl.length}`, order++);
          cl.forEach(a => setFolder.run(fid, a.id));
        });
      })();
      logAudit(req.workspaceId, req.userId, 'auto_folders', 'ms_project', project.id, { folders: clusters.length });
      broadcastToWorkspace(req.workspaceId, 'ms_assets_added', { project_id: project.id });
      res.json({ ok: true, folders: clusters.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Build a gallery from a gallery's client-favourited photos ────────────────
  app.post('/api/media/galleries/:id/album-from-favorites', auth, (req, res) => {
    try {
      const g = db.prepare('SELECT * FROM ms_galleries WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      const favs = db.prepare('SELECT DISTINCT asset_id FROM ms_client_favorites WHERE gallery_id = ?').all(g.id).map(r => r.asset_id);
      if (!favs.length) return res.status(400).json({ error: 'No client favourites yet.' });
      const ngid = generateId();
      db.prepare('INSERT INTO ms_galleries (id, workspace_id, project_id, title, visibility) VALUES (?,?,?,?,?)')
        .run(ngid, req.workspaceId, g.project_id, `${g.title || 'Gallery'} — Favourites`, g.visibility || 'private');
      const ins = db.prepare('INSERT OR IGNORE INTO ms_gallery_assets (gallery_id, asset_id, sort_order) VALUES (?,?,?)');
      db.transaction(() => { favs.forEach((aid, i) => ins.run(ngid, aid, i)); })();
      broadcastToWorkspace(req.workspaceId, 'ms_gallery_created', { project_id: g.project_id });
      res.json({ ok: true, gallery_id: ngid, count: favs.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Media Intelligence: scores in (server/desktop/cloud) + scores out + brain ──
  // External ingestion — the desktop ONNX runtime / cloud worker uploads scores.
  app.post('/api/media/assets/:id/scores', auth, (req, res) => {
    try {
      const a = db.prepare('SELECT id, workspace_id FROM ms_assets WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!a) return res.status(404).json({ error: 'Asset not found' });
      const { analyzer_id, model_version, scores, source } = req.body || {};
      if (!analyzer_id || !Array.isArray(scores)) return res.status(400).json({ error: 'analyzer_id + scores[] required' });
      const n = intel.recordScores(a.workspace_id, a.id, analyzer_id, model_version, scores, source || 'desktop');
      intel.computeComposites(a.workspace_id, a.id);
      broadcastToWorkspace(req.workspaceId, 'ms_scored', { asset_id: a.id });
      res.json({ ok: true, stored: n });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // Batch ingestion — a whole shoot's results from the desktop app.
  app.post('/api/media/projects/:id/scores', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      let stored = 0;
      for (const it of (Array.isArray(req.body.items) ? req.body.items : [])) {
        const a = db.prepare('SELECT id FROM ms_assets WHERE id = ? AND project_id = ?').get(it.asset_id, project.id);
        if (!a) continue;
        stored += intel.recordScores(req.workspaceId, a.id, it.analyzer_id, it.model_version, it.scores || [], it.source || 'desktop');
        intel.computeComposites(req.workspaceId, a.id);
      }
      broadcastToWorkspace(req.workspaceId, 'ms_scored', { project_id: project.id });
      res.json({ ok: true, stored });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // Recompute composites (cheap, server-side) from whatever primitives exist.
  app.post('/api/media/projects/:id/analyze', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const assets = db.prepare('SELECT id FROM ms_assets WHERE project_id = ? AND deleted_at IS NULL').all(project.id);
      let done = 0; for (const a of assets) { if (intel.computeComposites(req.workspaceId, a.id)) done++; }
      res.json({ ok: true, scored: done, total: assets.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // Scores out — per-asset map for the cull UI ("filter by AI score") + desktop sync.
  app.get('/api/media/projects/:id/intelligence', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const rows = db.prepare(`SELECT s.asset_id, s.score_type, s.value, s.group_key, s.reasons
        FROM ms_asset_scores s JOIN ms_assets a ON a.id = s.asset_id WHERE a.project_id = ?`).all(project.id);
      const byAsset = {};
      for (const r of rows) { (byAsset[r.asset_id] = byAsset[r.asset_id] || {})[r.score_type] = { value: r.value, group_key: r.group_key, reasons: r.reasons ? JSON.parse(r.reasons) : null }; }
      const pending = {};
      db.prepare('SELECT id FROM ms_assets WHERE project_id = ? AND deleted_at IS NULL').all(project.id).forEach(a => {
        const todo = Object.keys(intel.ANALYZERS).filter(k => intel.ANALYZERS[k].where === 'client' && intel.needsAnalysis(a.id, k));
        if (todo.length) pending[a.id] = todo;
      });
      res.json({ scores: byAsset, pending, analyzers: intel.ANALYZERS });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // Workspace Brain — the studio's learned preferences (explicit + inferred).
  app.get('/api/media/brain', auth, (req, res) => { try { res.json({ brain: intel.brainGet(req.workspaceId) }); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.put('/api/media/brain', auth, (req, res) => { try { const { key, value, confidence } = req.body || {}; if (!key) return res.status(400).json({ error: 'key required' }); intel.brainSet(req.workspaceId, key, value, { confidence: confidence == null ? 1 : confidence }); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.post('/api/media/brain/derive', auth, (req, res) => { try { res.json({ brain: intel.deriveBrain(req.workspaceId) }); } catch (e) { res.status(500).json({ error: e.message }); } });

  // ── Worker observability — job queue health for this workspace ───────────────
  app.get('/api/media/jobs', auth, (req, res) => {
    try {
      const ws = req.workspaceId;
      const byStatus = {};
      db.prepare('SELECT status, COUNT(*) c FROM ms_jobs WHERE workspace_id = ? GROUP BY status').all(ws).forEach(r => { byStatus[r.status] = r.c; });
      const byType = db.prepare("SELECT type, status, COUNT(*) c FROM ms_jobs WHERE workspace_id = ? GROUP BY type, status").all(ws);
      const throughputHr = db.prepare("SELECT COUNT(*) c FROM ms_jobs WHERE workspace_id = ? AND status = 'done' AND finished_at >= datetime('now','-1 hour')").get(ws).c;
      const oldestPending = db.prepare("SELECT created_at FROM ms_jobs WHERE workspace_id = ? AND status = 'pending' ORDER BY created_at LIMIT 1").get(ws);
      const failures = db.prepare("SELECT id, type, asset_id, error_message, retry_count, created_at FROM ms_jobs WHERE workspace_id = ? AND status = 'failed' ORDER BY created_at DESC LIMIT 20").all(ws);
      res.json({ byStatus, byType, throughputHr, oldestPendingAt: oldestPending ? oldestPending.created_at : null, failures });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/media/jobs/retry-failed', auth, (req, res) => {
    try {
      const r = db.prepare("UPDATE ms_jobs SET status = 'pending', retry_count = 0, error_message = NULL, next_retry_at = NULL WHERE workspace_id = ? AND status = 'failed'").run(req.workspaceId);
      res.json({ ok: true, requeued: r.changes });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Library listing ────────────────────────────────────────────────────────
  app.get('/api/media/projects/:id/assets', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const limit = Math.min(parseInt(req.query.limit, 10) || 100, 10000); // high cap for full-shoot culling
      const offset = parseInt(req.query.offset, 10) || 0;
      const params = [project.id];
      let where = 'a.project_id = ? AND a.deleted_at IS NULL';
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

  // Hard-delete one asset's row, scores, decisions and file. Used by purge +
  // the permanent-delete endpoint.
  function purgeAsset(a) {
    db.prepare('DELETE FROM ms_assets WHERE id = ?').run(a.id);
    db.prepare('DELETE FROM ms_asset_scores WHERE asset_id = ?').run(a.id);
    db.prepare('DELETE FROM ms_cull_decisions WHERE asset_id = ?').run(a.id);
    db.prepare('DELETE FROM ms_portfolio_items WHERE asset_id = ?').run(a.id);
    // Delete the original + its variants from wherever they live. Try local (covers
    // old local assets) AND R2 (covers r2 assets when R2 is the active provider) — one
    // hits, the other no-ops. Variant keys are deterministic from the asset id.
    for (const k of [a.storage_key, `media/variants/${a.id}-thumb.jpg`, `media/variants/${a.id}-web.jpg`]) {
      try { fs.unlinkSync(path.join(uploadsDir, k)); } catch {}
      if (storage.isRemote) Promise.resolve(storage.deleteFile(k)).catch(() => {});
    }
  }
  // Drop anything in Trash past the 30-day window. Cheap; safe to call often.
  function purgeExpiredTrash(workspaceId) {
    try {
      const stale = db.prepare("SELECT * FROM ms_assets WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')" + (workspaceId ? ' AND workspace_id = ?' : '')).all(...(workspaceId ? [workspaceId] : []));
      for (const a of stale) purgeAsset(a);
      return stale.length;
    } catch { return 0; }
  }
  purgeExpiredTrash(); // sweep once on boot

  // DELETE = soft-delete → Trash (restorable for 30 days).
  app.delete('/api/media/assets/:id', auth, (req, res) => {
    try {
      if (!canManage(req)) return res.status(403).json({ error: 'Not allowed' });
      const a = db.prepare('SELECT * FROM ms_assets WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!a) return res.status(404).json({ error: 'Asset not found' });
      db.prepare('UPDATE ms_assets SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(a.id);
      logAudit(req.workspaceId, req.userId, 'trash', 'ms_asset', a.id, { filename: a.filename });
      res.json({ message: 'Moved to Trash', id: a.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Trash listing (workspace-wide), newest-deleted first, with days remaining.
  app.get('/api/media/trash', auth, (req, res) => {
    try {
      purgeExpiredTrash(req.workspaceId);
      const rows = db.prepare(`
        SELECT a.*, p.title AS project_title FROM ms_assets a
        LEFT JOIN ms_projects p ON p.id = a.project_id
        WHERE a.workspace_id = ? AND a.deleted_at IS NOT NULL
        ORDER BY a.deleted_at DESC LIMIT 1000
      `).all(req.workspaceId);
      res.json({ assets: rows.map(r => ({ ...shapeAsset(r), project_id: r.project_id, project_title: r.project_title, deleted_at: r.deleted_at })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/media/assets/:id/restore', auth, (req, res) => {
    try {
      const a = db.prepare('SELECT * FROM ms_assets WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!a) return res.status(404).json({ error: 'Asset not found' });
      db.prepare('UPDATE ms_assets SET deleted_at = NULL WHERE id = ?').run(a.id);
      logAudit(req.workspaceId, req.userId, 'restore', 'ms_asset', a.id, {});
      res.json({ message: 'Restored', id: a.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/media/assets/:id/permanent', auth, (req, res) => {
    try {
      if (!canManage(req)) return res.status(403).json({ error: 'Not allowed' });
      const a = db.prepare('SELECT * FROM ms_assets WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!a) return res.status(404).json({ error: 'Asset not found' });
      purgeAsset(a);
      logAudit(req.workspaceId, req.userId, 'delete', 'ms_asset', a.id, { filename: a.filename });
      res.json({ message: 'Permanently deleted', id: a.id });
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
    // Learning System (Track 0): capture every human signal so future AI can learn.
    const action = patch.decision !== undefined ? (patch.decision || 'undecide') : (patch.rating !== undefined ? 'rate' : patch.flagged !== undefined ? 'flag' : 'label');
    intel.logFeedback(asset.workspace_id, userId, 'asset', asset.id, action, patch);
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

  // Shared validator for the full edit param set (single + batch + presets).
  function sanitizeEdits(e) {
    const edits = {};
    for (const k of ['exposure', 'contrast', 'temperature', 'tint', 'saturation']) {
      if (e[k] !== undefined && e[k] !== 0) {
        if (!inRange(e[k], -1, 1)) return { error: `${k} must be between -1 and 1` };
        edits[k] = Math.round(e[k] * 100) / 100;
      }
    }
    for (const k of ['fade', 'vignette', 'grain']) {
      if (e[k] !== undefined && e[k] !== 0) {
        if (!inRange(e[k], 0, 1)) return { error: `${k} must be between 0 and 1` };
        edits[k] = Math.round(e[k] * 100) / 100;
      }
    }
    if (e.bw) edits.bw = 1;
    if (e.rotate !== undefined && e.rotate !== 0) {
      if (!inRange(e.rotate, -360, 360)) return { error: 'rotate must be between -360 and 360' };
      edits.rotate = Math.round(e.rotate * 10) / 10;
    }
    if (e.crop) {
      const c = e.crop;
      if (!inRange(c.x, 0, 0.95) || !inRange(c.y, 0, 0.95) || !inRange(c.w, 0.05, 1) || !inRange(c.h, 0.05, 1) || c.x + c.w > 1.001 || c.y + c.h > 1.001) {
        return { error: 'invalid crop' };
      }
      if (!(c.x < 0.005 && c.y < 0.005 && c.w > 0.995 && c.h > 0.995)) {
        edits.crop = { x: +c.x.toFixed(4), y: +c.y.toFixed(4), w: +c.w.toFixed(4), h: +c.h.toFixed(4) };
      }
    }
    return { edits };
  }

  function stampAndQueueEdits(asset, edits) {
    let prev = {}; try { prev = JSON.parse(asset.edits || '{}'); } catch {}
    const next = { ...edits, rev: (prev.rev || 0) + 1 };
    db.prepare('UPDATE ms_assets SET edits = ? WHERE id = ?').run(JSON.stringify(next), asset.id);
    db.prepare("INSERT INTO ms_jobs (id, workspace_id, type, asset_id, project_id, status, payload) VALUES (?, ?, 'render_edits', ?, ?, 'pending', '{}')")
      .run(generateId(), asset.workspace_id, asset.id, asset.project_id);
    return next;
  }

  app.put('/api/media/assets/:id/edits', auth, (req, res) => {
    try {
      const a = db.prepare('SELECT * FROM ms_assets WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!a) return res.status(404).json({ error: 'Asset not found' });
      if (a.type !== 'photo') return res.status(400).json({ error: 'Only photos can be edited' });
      const { edits, error } = sanitizeEdits(req.body || {});
      if (error) return res.status(400).json({ error });
      const next = stampAndQueueEdits(a, edits);
      logAudit(req.workspaceId, req.userId, 'edit', 'ms_asset', a.id, next);
      res.status(202).json({ status: 'rendering', edits: next });
    } catch (e2) { res.status(500).json({ error: e2.message }); }
  });

  // Batch: same edit params across many photos (e.g. paste-to-keepers, preset-to-keepers).
  app.post('/api/media/projects/:id/edits/batch', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const ids = Array.isArray(req.body.asset_ids) ? req.body.asset_ids.slice(0, 500) : [];
      if (ids.length === 0) return res.status(400).json({ error: 'asset_ids[] required' });
      const { edits, error } = sanitizeEdits(req.body.edits || {});
      if (error) return res.status(400).json({ error });
      const sel = db.prepare("SELECT * FROM ms_assets WHERE id = ? AND project_id = ? AND type = 'photo'");
      let n = 0;
      const tx = db.transaction(() => { for (const aid of ids) { const a = sel.get(aid, project.id); if (a) { stampAndQueueEdits(a, edits); n++; } } });
      tx();
      logAudit(req.workspaceId, req.userId, 'edit_batch', 'ms_project', project.id, { count: n, edits });
      res.status(202).json({ status: 'rendering', updated: n });
    } catch (e2) { res.status(500).json({ error: e2.message }); }
  });

  // ── Studio Copilot (control-first AI assistant) ──────────────────────────────
  // Answers questions and analyzes the shoot from real DB context, and may return
  // SUGGESTED actions — which the UI renders as buttons the photographer clicks.
  // The copilot itself can change nothing.
  const COPILOT_ACTIONS = new Set(['navigate', 'create_gallery_from_keepers', 'preset_keepers']);

  app.post('/api/media/copilot', auth, async (req, res) => {
    try {
      if (!ai || typeof ai.callLLM !== 'function') return res.status(503).json({ error: 'AI is not configured on this server (set an AI provider key).' });
      const message = (req.body.message || '').toString().slice(0, 2000).trim();
      if (!message) return res.status(400).json({ error: 'message required' });

      // build grounded context
      let ctx = '';
      const projectId = req.body.project_id;
      const presetList = Array.isArray(req.body.presets) ? req.body.presets.slice(0, 40).map(p => String(p).slice(0, 40)) : [];
      if (projectId) {
        const p = getProject(req.workspaceId, projectId);
        if (!p) return res.status(404).json({ error: 'Project not found' });
        const cull = db.prepare(`SELECT COALESCE(c.decision,'undecided') d, COUNT(*) n FROM ms_assets a LEFT JOIN ms_cull_decisions c ON c.asset_id=a.id WHERE a.project_id=? GROUP BY d`).all(p.id);
        const stats = db.prepare(`SELECT COUNT(*) total,
            SUM(CASE WHEN s.value >= 120 THEN 1 ELSE 0 END) sharp,
            ROUND(AVG(q.value),2) avg_quality
          FROM ms_assets a
          LEFT JOIN ms_asset_scores s ON s.asset_id=a.id AND s.score_type='sharpness'
          LEFT JOIN ms_asset_scores q ON q.asset_id=a.id AND q.score_type='quality'
          WHERE a.project_id=?`).get(p.id);
        const dups = db.prepare(`SELECT COUNT(DISTINCT group_key) n FROM ms_asset_scores s JOIN ms_assets a ON a.id=s.asset_id WHERE a.project_id=? AND s.score_type='duplicate_group'`).get(p.id).n;
        const best = db.prepare(`SELECT a.filename, q.value FROM ms_assets a JOIN ms_asset_scores q ON q.asset_id=a.id AND q.score_type='quality' WHERE a.project_id=? ORDER BY q.value DESC LIMIT 5`).all(p.id);
        const worst = db.prepare(`SELECT a.filename, q.value FROM ms_assets a JOIN ms_asset_scores q ON q.asset_id=a.id AND q.score_type='quality' WHERE a.project_id=? ORDER BY q.value ASC LIMIT 5`).all(p.id);
        const gals = db.prepare(`SELECT g.title, g.status, (SELECT COUNT(*) FROM ms_gallery_assets x WHERE x.gallery_id=g.id) n,
            (SELECT COUNT(*) FROM ms_client_favorites f WHERE f.gallery_id=g.id) favs,
            (SELECT COUNT(*) FROM ms_client_comments c WHERE c.gallery_id=g.id) comments FROM ms_galleries g WHERE g.project_id=?`).all(p.id);
        const proofing = db.prepare(`SELECT s.title, s.status, s.quota, s.revision_round, (SELECT COUNT(*) FROM ms_proofing_selections x WHERE x.set_id=s.id) selected FROM ms_proofing_sets s WHERE s.project_id=?`).all(p.id);
        const comments = db.prepare(`SELECT c.body FROM ms_client_comments c JOIN ms_galleries g ON g.id=c.gallery_id WHERE g.project_id=? ORDER BY c.created_at DESC LIMIT 5`).all(p.id);
        const edited = db.prepare(`SELECT COUNT(*) n FROM ms_assets WHERE project_id=? AND edits IS NOT NULL`).get(p.id).n;
        ctx = `PROJECT "${p.title}" (type ${p.project_type}, status ${p.status}, client ${p.lead_id ? 'linked' : 'none'})
Photos: ${JSON.stringify(stats)}  Edited: ${edited}
Cull: ${JSON.stringify(cull)}  Duplicate groups: ${dups}
Best by AI quality: ${best.map(b => `${b.filename}(${b.value})`).join(', ') || '—'}
Weakest: ${worst.map(b => `${b.filename}(${b.value})`).join(', ') || '—'}
Galleries: ${JSON.stringify(gals)}
Proofing: ${JSON.stringify(proofing)}
Recent client comments: ${comments.map(c => JSON.stringify(c.body.slice(0, 80))).join(' ') || '—'}`;
      } else {
        const rows = db.prepare(`SELECT p.title, p.status, (SELECT COUNT(*) FROM ms_assets a WHERE a.project_id=p.id) n FROM ms_projects p WHERE p.workspace_id=? ORDER BY p.created_at DESC LIMIT 12`).all(req.workspaceId);
        ctx = `WORKSPACE shoots: ${JSON.stringify(rows)}`;
      }

      const history = Array.isArray(req.body.history)
        ? req.body.history.slice(-6).map(h => `${h.role === 'user' ? 'Photographer' : 'Copilot'}: ${String(h.content).slice(0, 300)}`).join('\n')
        : '';

      const system = `You are Studio Copilot — the in-app assistant of Media Studio, a photographer's culling/gallery/delivery workspace. You are sharp, concise and practical. You analyze the REAL data provided and answer the photographer's question. You can also SUGGEST actions, but you never perform them — the photographer clicks to apply (control-first).
Respond with ONLY valid JSON: {"reply": "<concise markdown-free answer, max ~120 words>", "actions": [ ...max 3... ]}.
Allowed actions:
 {"type":"navigate","label":"...","to":"cull"|"albums"|"video"|"project"}
 {"type":"create_gallery_from_keepers","label":"..."}
 {"type":"preset_keepers","label":"...","preset":"<one of: ${presetList.join(', ') || 'none available'}>"}
Only suggest actions that make sense for the question. If none make sense, return "actions": [].`;

      const prompt = `${ctx}\n\n${history ? 'Conversation so far:\n' + history + '\n\n' : ''}Photographer: ${message}`;
      const raw = await ai.callLLM(prompt, { system, maxTokens: 500, temperature: 0.4 });
      let parsed = null;
      try { parsed = ai.extractJSON ? ai.extractJSON(raw, 'object') : JSON.parse(raw); } catch {}
      if (!parsed || typeof parsed.reply !== 'string') parsed = { reply: String(raw || '').slice(0, 800), actions: [] };
      const actions = (Array.isArray(parsed.actions) ? parsed.actions : []).filter(a => a && COPILOT_ACTIONS.has(a.type)).slice(0, 3)
        .filter(a => a.type !== 'preset_keepers' || presetList.includes(a.preset))
        .filter(a => a.type !== 'navigate' || ['cull', 'albums', 'video', 'project'].includes(a.to));
      res.json({ reply: parsed.reply.slice(0, 1200), actions });
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

    -- ── VIDEO STUDIO (timeline editor) ──────────────────────────────────────
    -- A timeline is ONE JSON EDL document. Non-destructive, versioned by save.
    CREATE TABLE IF NOT EXISTS ms_timelines (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      name TEXT DEFAULT 'Untitled reel',
      source TEXT DEFAULT 'manual',          -- manual | template | ai_draft
      template_id TEXT,
      aspect_ratio TEXT DEFAULT '9:16',
      width INTEGER DEFAULT 1080,
      height INTEGER DEFAULT 1920,
      fps INTEGER DEFAULT 30,
      duration_ms INTEGER DEFAULT 0,
      document TEXT DEFAULT '{}',             -- the EDL (tracks/clips/keyframes)
      status TEXT DEFAULT 'draft',            -- draft | ready
      ai_style TEXT,                          -- for ai_draft rows
      ai_signature TEXT,                      -- hash of source media set
      ai_stale INTEGER DEFAULT 0,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ms_timelines_project ON ms_timelines(project_id);

    CREATE TABLE IF NOT EXISTS ms_video_exports (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      timeline_id TEXT NOT NULL,
      project_id TEXT,
      preset TEXT DEFAULT 'ig_reel',
      width INTEGER, height INTEGER, fps INTEGER, quality INTEGER DEFAULT 1080,
      status TEXT DEFAULT 'pending',          -- pending | rendering | done | failed
      progress INTEGER DEFAULT 0,
      storage_key TEXT,
      size_bytes INTEGER,
      error_message TEXT,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      finished_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ms_video_exports_timeline ON ms_video_exports(timeline_id);

    -- Built-in (workspace_id NULL) + custom music / LUTs (used from Phase 2 on).
    CREATE TABLE IF NOT EXISTS ms_audio_tracks (
      id TEXT PRIMARY KEY, workspace_id TEXT, category TEXT, title TEXT, artist TEXT,
      storage_key TEXT, duration_ms INTEGER, license TEXT, created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ms_luts (
      id TEXT PRIMARY KEY, workspace_id TEXT, name TEXT, category TEXT,
      cube_path TEXT, thumbnail_url TEXT, created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ms_video_templates (
      id TEXT PRIMARY KEY, workspace_id TEXT, category TEXT, name TEXT,
      thumbnail_url TEXT, aspect_ratios TEXT DEFAULT '[]', document TEXT DEFAULT '{}',
      created_by TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
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
    // A watermarked variant (when present) replaces web/thumb so the client only ever
    // sees protected images; high-res downloads still get the clean original.
    const downloadUrl = policy === 'none' ? null
      : (policy === 'high-res' ? (variants.original || null) : (variants.watermarked || variants.web || variants.original || null));
    return {
      asset_id: row.id,
      filename: row.filename,
      type: row.type,
      thumb_url: variants.watermarked || variants.thumb || variants.web || publicUrl(row.storage_key),
      web_url: variants.watermarked || variants.web || publicUrl(row.storage_key),
      download_url: downloadUrl,
      sort_order: row.sort_order,
      folder_id: row.folder_id || null,
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
      autoIncludeGalleryIntoPortfolio(req.workspaceId, req.userId, g); // feed the creator's portfolio (if opted in)
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
      download_url: (exp.status === 'ready' && exp.storage_key) ? `/api/media/exports/${exp.id}/file` : null,
      error: exp.error_message || undefined,
    };
  }

  // Download an export by its unguessable id (same access model as the old static
  // /uploads path — the id is the capability). Dual-read: serves the local file if
  // present, else 302-redirects to a short-lived presigned R2 URL. So old exports
  // (on disk) and new ones (in R2) both download transparently.
  app.get('/api/media/exports/:id/file', async (req, res) => {
    try {
      const exp = db.prepare("SELECT * FROM ms_exports WHERE id = ? AND status = 'ready'").get(req.params.id);
      if (!exp || !exp.storage_key) return res.status(404).json({ error: 'Export not found' });
      const local = path.join(uploadsDir, exp.storage_key);
      if (fs.existsSync(local)) return res.download(local, `${exp.id}.zip`);
      if (storage.isRemote) { const url = await storage.presignGet(exp.storage_key); if (url) return res.redirect(302, url); }
      return res.status(404).json({ error: 'Export file not available' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

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

  // ───────────────────────────────────────────────────────────────────────────
  // VIDEO STUDIO — timelines (the EDL) + MP4 export
  //   The timeline document is the single source of truth. Editing = saving JSON.
  //   Export enqueues a worker job that compiles the EDL to ffmpeg → MP4.
  //   Control-first: nothing renders, publishes, or delivers without an explicit
  //   user action (save / export / send).
  // ───────────────────────────────────────────────────────────────────────────
  function getTimeline(workspaceId, id) {
    return db.prepare('SELECT * FROM ms_timelines WHERE id = ? AND workspace_id = ?').get(id, workspaceId);
  }
  function timelineOut(row) {
    let document = {}; try { document = JSON.parse(row.document || '{}'); } catch {}
    return { ...row, document };
  }

  // Formats/presets the editor offers (drives aspect switcher + export dialog).
  app.get('/api/media/video/presets', auth, (req, res) => {
    res.json({
      aspects: Object.keys(videoEngine.ASPECTS),
      qualities: Object.keys(videoEngine.QUALITIES).map(Number),
      presets: Object.entries(videoEngine.EXPORT_PRESETS).map(([id, p]) => ({ id, ...p })),
      transitions: videoEngine.TRANSITIONS,
      effects: videoEngine.EFFECTS,
      textTypes: videoEngine.TEXT_TYPES,
      textAnimations: videoEngine.TEXT_ANIM,
      fontFamilies: [{ id: 'sans', label: 'Sans' }, { id: 'serif', label: 'Serif' }, { id: 'mono', label: 'Mono' }],
      fonts: videoEngine.detectFonts(),
      luts: allLuts(req.workspaceId),
      ffmpeg: videoEngine.detectFfmpeg(),
    });
  });

  function customLuts(workspaceId) {
    try { return db.prepare("SELECT id, name FROM ms_luts WHERE workspace_id = ?").all(workspaceId).map(r => ({ id: r.id, name: r.name, category: 'Custom', css: 'none', custom: true })); }
    catch { return []; }
  }
  function allLuts(workspaceId) { return [...videoLuts.list(), ...customLuts(workspaceId)]; }

  app.get('/api/media/video/luts', auth, (req, res) => res.json({ luts: allLuts(req.workspaceId) }));

  // Custom .cube LUT upload (rounds out the look library with the user's own packs).
  const lutDir = path.join(uploadsDir, 'media', 'luts', 'custom');
  try { fs.mkdirSync(lutDir, { recursive: true }); } catch {}
  const lutUpload = multer({
    storage: multer.diskStorage({ destination: lutDir, filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(16).slice(2, 8)}.cube`) }),
    limits: { fileSize: 8 * 1024 * 1024 },
  });
  app.post('/api/media/video/luts', auth, lutUpload.single('file'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No .cube file uploaded (field name: file)' });
      // sanity-check it's actually a cube LUT
      let head = ''; try { head = fs.readFileSync(req.file.path, 'utf8').slice(0, 600); } catch {}
      if (!/LUT_3D_SIZE/i.test(head)) { try { fs.unlinkSync(req.file.path); } catch {} return res.status(400).json({ error: 'That file is not a valid .cube LUT.' }); }
      const name = String(req.body.name || req.file.originalname || 'Custom LUT').replace(/\.cube$/i, '').slice(0, 60);
      const id = 'lut_' + generateId().slice(0, 10);
      const rel = `media/luts/custom/${path.basename(req.file.path)}`;
      db.prepare('INSERT INTO ms_luts (id, workspace_id, name, category, cube_path, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.workspaceId, name, 'Custom', rel, req.userId);
      logAudit(req.workspaceId, req.userId, 'upload_lut', 'ms_lut', id, { name });
      res.status(201).json({ id, name, category: 'Custom', css: 'none', custom: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/media/video/luts/:lutId', auth, (req, res) => {
    try {
      const row = db.prepare('SELECT * FROM ms_luts WHERE id = ? AND workspace_id = ?').get(req.params.lutId, req.workspaceId);
      if (!row) return res.status(404).json({ error: 'LUT not found' });
      if (row.cube_path) { try { fs.unlinkSync(path.join(uploadsDir, row.cube_path)); } catch {} }
      db.prepare('DELETE FROM ms_luts WHERE id = ?').run(row.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Reel templates: list (enriched with the look's CSS hint for card styling).
  app.get('/api/media/video/templates', auth, (req, res) => {
    const lutCss = Object.fromEntries(videoLuts.list().map(l => [l.id, l.css]));
    res.json({ templates: videoTemplates.list().map(t => ({ ...t, css: lutCss[t.lut] || 'none' })) });
  });

  // Apply a template → builds a real timeline filled with the project's media
  // (explicit asset_ids, else auto-pick keepers-first). Fully editable after.
  app.post('/api/media/projects/:id/templates/:templateId/apply', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const tpl = videoTemplates.get(req.params.templateId);
      if (!tpl) return res.status(404).json({ error: 'Template not found' });

      let media;
      const ids = Array.isArray(req.body.asset_ids) ? req.body.asset_ids.slice(0, 60) : null;
      if (ids && ids.length) {
        const sel = db.prepare("SELECT id, type FROM ms_assets WHERE id = ? AND project_id = ? AND type IN ('photo','video')");
        media = ids.map(aid => sel.get(aid, project.id)).filter(Boolean);
      } else {
        // auto-pick: keepers first, then capture order
        media = db.prepare(`
          SELECT a.id, a.type FROM ms_assets a LEFT JOIN ms_cull_decisions c ON c.asset_id = a.id
          WHERE a.project_id = ? AND a.type IN ('photo','video')
          ORDER BY (c.decision = 'keep') DESC, a.capture_time IS NULL, a.capture_time, a.created_at
          LIMIT 40`).all(project.id);
      }
      if (!media.length) return res.status(400).json({ error: 'Add photos or clips to this shoot first.' });

      const aspect = videoEngine.ASPECTS[req.body.aspect] ? req.body.aspect : tpl.aspect;
      const durationSec = videoTemplates.DURATIONS.includes(req.body.duration_sec) ? req.body.duration_sec : videoTemplates.DEFAULT_DURATION;
      const doc = videoEngine.sanitizeTimeline(videoTemplates.buildTimeline(tpl, media, { aspect, durationSec, title: project.title }));
      const id = generateId();
      db.prepare(`INSERT INTO ms_timelines (id, workspace_id, project_id, name, source, template_id, aspect_ratio, width, height, fps, duration_ms, document, created_by)
        VALUES (?, ?, ?, ?, 'template', ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, req.workspaceId, project.id, (req.body.name || tpl.name).slice(0, 120), tpl.id, doc.aspect, doc.width, doc.height, doc.fps, doc.duration, JSON.stringify(doc), req.userId);
      logAudit(req.workspaceId, req.userId, 'apply_template', 'ms_timeline', id, { template: tpl.id, slots: doc.tracks[0].clips.length });
      res.status(201).json(timelineOut(getTimeline(req.workspaceId, id)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── AI Reel Drafts (control-first, score-driven) ────────────────────────────
  // Reads the project's media with its advisory CV scores + cull decisions.
  function scoredProjectMedia(projectId) {
    return db.prepare(`
      SELECT a.id, a.type, a.capture_time, a.created_at,
        (SELECT value FROM ms_asset_scores s WHERE s.asset_id = a.id AND s.score_type = 'quality' LIMIT 1) AS quality,
        (SELECT value FROM ms_asset_scores s WHERE s.asset_id = a.id AND s.score_type = 'sharpness' LIMIT 1) AS sharpness,
        (SELECT group_key FROM ms_asset_scores s WHERE s.asset_id = a.id AND s.score_type = 'duplicate_group' LIMIT 1) AS dup_group,
        (SELECT value FROM ms_asset_scores s WHERE s.asset_id = a.id AND s.score_type = 'faces' LIMIT 1) AS faces,
        (SELECT value FROM ms_asset_scores s WHERE s.asset_id = a.id AND s.score_type = 'smile' LIMIT 1) AS smile,
        c.decision, c.rating
      FROM ms_assets a LEFT JOIN ms_cull_decisions c ON c.asset_id = a.id
      WHERE a.project_id = ? AND a.type IN ('photo','video')
    `).all(projectId);
  }

  app.get('/api/media/projects/:id/ai-drafts/styles', auth, (req, res) => {
    const project = getProject(req.workspaceId, req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const lutCss = Object.fromEntries(videoLuts.list().map(l => [l.id, l.css]));
    res.json({
      recommended: videoAiDrafts.recommendStyles(project.project_type),
      styles: videoAiDrafts.styleList().map(s => ({ ...s, css: lutCss[s.lut] || 'none' })),
    });
  });

  app.post('/api/media/projects/:id/ai-drafts', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const style = videoAiDrafts.getStyle(req.body.style) || videoAiDrafts.getStyle(videoAiDrafts.recommendStyles(project.project_type)[0]);
      const ranked = videoAiDrafts.rankMedia(scoredProjectMedia(project.id), { faceWeight: videoAiDrafts.styleFaceWeight(style.id) });
      if (ranked.length < 2) return res.status(400).json({ error: 'Not enough usable media yet — upload more, or cull a few keepers first.' });

      const media = videoAiDrafts.selectForStyle(ranked, style);
      const aspect = videoEngine.ASPECTS[req.body.aspect] ? req.body.aspect : style.aspect;
      const durationSec = videoTemplates.DURATIONS.includes(req.body.duration_sec) ? req.body.duration_sec : videoTemplates.DEFAULT_DURATION;
      const doc = videoEngine.sanitizeTimeline(videoAiDrafts.buildDraft(style, media, { aspect, durationSec, title: project.title }));
      const id = generateId();
      db.prepare(`INSERT INTO ms_timelines (id, workspace_id, project_id, name, source, aspect_ratio, width, height, fps, duration_ms, document, ai_style, ai_signature, ai_stale, created_by)
        VALUES (?, ?, ?, ?, 'ai_draft', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
        .run(id, req.workspaceId, project.id, `${style.name} (AI)`, doc.aspect, doc.width, doc.height, doc.fps, doc.duration, JSON.stringify(doc), style.id, videoAiDrafts.signatureOf(media), req.userId);
      logAudit(req.workspaceId, req.userId, 'ai_draft', 'ms_timeline', id, { style: style.id, shots: media.length });
      res.status(201).json(timelineOut(getTimeline(req.workspaceId, id)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Rebuild an AI draft from the current media (same style); clears the stale flag.
  app.post('/api/media/timelines/:id/refresh', auth, (req, res) => {
    try {
      const t = getTimeline(req.workspaceId, req.params.id);
      if (!t) return res.status(404).json({ error: 'Timeline not found' });
      if (t.source !== 'ai_draft') return res.status(400).json({ error: 'Only AI drafts can be refreshed' });
      const style = videoAiDrafts.getStyle(t.ai_style) || videoAiDrafts.DRAFT_STYLES[0];
      const ranked = videoAiDrafts.rankMedia(scoredProjectMedia(t.project_id), { faceWeight: videoAiDrafts.styleFaceWeight(style.id) });
      if (ranked.length < 2) return res.status(400).json({ error: 'Not enough usable media to refresh.' });
      const media = videoAiDrafts.selectForStyle(ranked, style);
      const doc = videoEngine.sanitizeTimeline(videoAiDrafts.buildDraft(style, media, { aspect: t.aspect_ratio, durationSec: Math.round((t.duration_ms || 60000) / 1000) || 60, title: getProject(req.workspaceId, t.project_id)?.title }));
      db.prepare(`UPDATE ms_timelines SET document = ?, duration_ms = ?, width = ?, height = ?, ai_signature = ?, ai_stale = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(JSON.stringify(doc), doc.duration, doc.width, doc.height, videoAiDrafts.signatureOf(media), t.id);
      res.json(timelineOut(getTimeline(req.workspaceId, t.id)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Audio assets in a shoot (for the Video Studio music picker).
  app.get('/api/media/projects/:id/audio', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const rows = db.prepare("SELECT id, filename, v_duration_ms, storage_key FROM ms_assets WHERE project_id = ? AND type = 'audio' ORDER BY created_at DESC").all(project.id);
      res.json({ audio: rows.map(r => ({ id: r.id, filename: r.filename, duration_ms: r.v_duration_ms || 0, url: publicUrl(r.storage_key) })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/media/projects/:id/timelines', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const rows = db.prepare('SELECT id, name, source, aspect_ratio, width, height, fps, duration_ms, status, ai_style, ai_stale, updated_at FROM ms_timelines WHERE project_id = ? ORDER BY updated_at DESC').all(project.id);
      res.json({ timelines: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/media/projects/:id/timelines', auth, (req, res) => {
    try {
      const project = getProject(req.workspaceId, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const doc = videoEngine.sanitizeTimeline(req.body.document || { aspect: req.body.aspect_ratio || '9:16' });
      const id = generateId();
      db.prepare(`INSERT INTO ms_timelines (id, workspace_id, project_id, name, source, aspect_ratio, width, height, fps, duration_ms, document, created_by)
        VALUES (?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, req.workspaceId, project.id, (req.body.name || 'Untitled reel').slice(0, 120), doc.aspect, doc.width, doc.height, doc.fps, doc.duration, JSON.stringify(doc), req.userId);
      logAudit(req.workspaceId, req.userId, 'create', 'ms_timeline', id, { name: req.body.name });
      res.status(201).json(timelineOut(getTimeline(req.workspaceId, id)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/media/timelines/:id', auth, (req, res) => {
    const t = getTimeline(req.workspaceId, req.params.id);
    if (!t) return res.status(404).json({ error: 'Timeline not found' });
    res.json(timelineOut(t));
  });

  app.put('/api/media/timelines/:id', auth, (req, res) => {
    try {
      const t = getTimeline(req.workspaceId, req.params.id);
      if (!t) return res.status(404).json({ error: 'Timeline not found' });
      const doc = videoEngine.sanitizeTimeline(req.body.document || {});
      const name = req.body.name != null ? String(req.body.name).slice(0, 120) : t.name;
      db.prepare(`UPDATE ms_timelines SET name = ?, aspect_ratio = ?, width = ?, height = ?, fps = ?, duration_ms = ?, document = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(name, doc.aspect, doc.width, doc.height, doc.fps, doc.duration, JSON.stringify(doc), t.id);
      res.json(timelineOut(getTimeline(req.workspaceId, t.id)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/media/timelines/:id', auth, (req, res) => {
    try {
      const t = getTimeline(req.workspaceId, req.params.id);
      if (!t) return res.status(404).json({ error: 'Timeline not found' });
      db.prepare('DELETE FROM ms_video_exports WHERE timeline_id = ?').run(t.id);
      db.prepare('DELETE FROM ms_timelines WHERE id = ?').run(t.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Kick off an MP4 render (background job). Returns the export row to poll.
  app.post('/api/media/timelines/:id/export', auth, (req, res) => {
    try {
      const t = getTimeline(req.workspaceId, req.params.id);
      if (!t) return res.status(404).json({ error: 'Timeline not found' });
      const presetId = videoEngine.EXPORT_PRESETS[req.body.preset] ? req.body.preset : 'ig_reel';
      const preset = videoEngine.EXPORT_PRESETS[presetId];
      const quality = videoEngine.QUALITIES[req.body.quality] ? Number(req.body.quality) : 1080;
      // custom preset keeps the timeline's own aspect; named presets force theirs
      const aspect = preset.aspect || t.aspect_ratio;
      const { width, height } = videoEngine.dimsFor(aspect, quality);
      const fps = t.fps || 30;
      const id = generateId();
      db.prepare(`INSERT INTO ms_video_exports (id, workspace_id, timeline_id, project_id, preset, width, height, fps, quality, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, req.workspaceId, t.id, t.project_id, presetId, width, height, fps, quality, req.userId);
      db.prepare(`INSERT INTO ms_jobs (id, workspace_id, type, project_id, status, payload) VALUES (?, ?, 'video_export', ?, 'pending', ?)`)
        .run(generateId(), req.workspaceId, t.project_id, JSON.stringify({ export_id: id }));
      logAudit(req.workspaceId, req.userId, 'export', 'ms_timeline', t.id, { preset: presetId, quality });
      res.status(202).json(db.prepare('SELECT * FROM ms_video_exports WHERE id = ?').get(id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/media/timelines/:id/exports', auth, (req, res) => {
    const t = getTimeline(req.workspaceId, req.params.id);
    if (!t) return res.status(404).json({ error: 'Timeline not found' });
    const rows = db.prepare('SELECT * FROM ms_video_exports WHERE timeline_id = ? ORDER BY created_at DESC LIMIT 20').all(t.id);
    res.json({ exports: rows.map(r => ({ ...r, url: r.storage_key ? publicUrl(r.storage_key) : null })) });
  });

  app.get('/api/media/video/exports/:exportId', auth, (req, res) => {
    const r = db.prepare('SELECT * FROM ms_video_exports WHERE id = ? AND workspace_id = ?').get(req.params.exportId, req.workspaceId);
    if (!r) return res.status(404).json({ error: 'Export not found' });
    res.json({ ...r, url: r.storage_key ? publicUrl(r.storage_key) : null });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  PORTFOLIO — the creator's public showcase (curated, auto-fed, shareable)
  // ═══════════════════════════════════════════════════════════════════════════
  // 10 distinct identities, rendered entirely on the public page (see web).
  const PORTFOLIO_THEMES = ['atelier', 'noir', 'editorial', 'gallery', 'film', 'brut', 'luxe', 'vivid', 'mono', 'frame'];
  const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  const portfolioShareUrl = (pf) => `${clientBaseUrl}/folio/${pf.handle || pf.token}`;

  function getOrCreatePortfolio(req) {
    let pf = db.prepare('SELECT * FROM ms_portfolios WHERE workspace_id = ? AND user_id = ?').get(req.workspaceId, req.userId);
    if (pf) return pf;
    const u = db.prepare('SELECT full_name, email FROM users WHERE id = ?').get(req.userId) || {};
    const base = slugify(u.full_name || (u.email || '').split('@')[0] || 'studio') || 'studio';
    const token = crypto.randomBytes(8).toString('hex');
    let handle = base, n = 0;
    while (db.prepare('SELECT 1 FROM ms_portfolios WHERE handle = ?').get(handle)) {
      handle = `${base}-${Math.random().toString(36).slice(2, 5)}`;
      if (++n > 5) { handle = `${base}-${token.slice(0, 5)}`; break; }
    }
    const id = generateId();
    db.prepare(`INSERT INTO ms_portfolios (id, workspace_id, user_id, handle, token, title, tagline, theme)
      VALUES (?,?,?,?,?,?,?,'atelier')`).run(id, req.workspaceId, req.userId, handle, token, u.full_name || 'My Studio', 'Photography & Film');
    return db.prepare('SELECT * FROM ms_portfolios WHERE id = ?').get(id);
  }

  function shapePortfolioItem(it) {
    let v = {};
    try { v = JSON.parse((it.asset_id ? it.a_variants : it.variants) || '{}'); } catch {}
    const key = it.asset_id ? it.a_key : it.storage_key;
    const kind = it.kind || (it.a_type === 'video' ? 'video' : 'photo');
    return {
      id: it.id, kind, source: it.source, title: it.title, caption: it.caption,
      featured: !!it.featured, sort_order: it.sort_order, asset_id: it.asset_id || null,
      url: v.web || v.original || (key ? publicUrl(key) : null),
      full_url: v.original || v.web || (key ? publicUrl(key) : null),
      poster_url: it.asset_id ? (it.a_poster || null) : (v.poster || null),
      video_url: kind === 'video' ? (it.asset_id ? (it.a_proxy || (key ? publicUrl(key) : null)) : (key ? publicUrl(key) : null)) : null,
    };
  }
  function getPortfolioItems(portfolioId) {
    return db.prepare(`
      SELECT pi.*, a.variants AS a_variants, a.storage_key AS a_key, a.poster_url AS a_poster, a.proxy_url AS a_proxy, a.type AS a_type
      FROM ms_portfolio_items pi LEFT JOIN ms_assets a ON a.id = pi.asset_id
      WHERE pi.portfolio_id = ? ORDER BY pi.sort_order, pi.created_at
    `).all(portfolioId).map(shapePortfolioItem);
  }
  function shapePortfolio(pf, { withItems = false } = {}) {
    let settings = {}; try { settings = JSON.parse(pf.settings || '{}'); } catch {}
    const out = {
      id: pf.id, handle: pf.handle, token: pf.token, title: pf.title, tagline: pf.tagline, bio: pf.bio,
      theme: pf.theme, cover_url: pf.cover_url, avatar_url: pf.avatar_url,
      is_public: !!pf.is_public, auto_include: !!pf.auto_include, settings,
      share_url: portfolioShareUrl(pf), view_count: pf.view_count || 0, themes: PORTFOLIO_THEMES,
    };
    if (withItems) out.items = getPortfolioItems(pf.id);
    return out;
  }
  function shapePublicPortfolio(pf) {
    let settings = {}; try { settings = JSON.parse(pf.settings || '{}'); } catch {}
    return {
      title: pf.title, tagline: pf.tagline, bio: pf.bio, theme: pf.theme,
      cover_url: pf.cover_url, avatar_url: pf.avatar_url, settings, items: getPortfolioItems(pf.id),
    };
  }
  // called from gallery publish — opt-in auto-feed of published work (never raw)
  function autoIncludeGalleryIntoPortfolio(workspaceId, userId, gallery) {
    try {
      const pf = db.prepare('SELECT * FROM ms_portfolios WHERE workspace_id = ? AND user_id = ?').get(workspaceId, userId);
      if (!pf || !pf.auto_include) return;
      const have = new Set(db.prepare('SELECT asset_id FROM ms_portfolio_items WHERE portfolio_id = ? AND asset_id IS NOT NULL').all(pf.id).map(r => r.asset_id));
      const assets = db.prepare(`SELECT a.id, a.type FROM ms_gallery_assets ga JOIN ms_assets a ON a.id = ga.asset_id WHERE ga.gallery_id = ? AND ga.is_hidden = 0 ORDER BY ga.sort_order`).all(gallery.id);
      let base = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM ms_portfolio_items WHERE portfolio_id = ?').get(pf.id).m;
      const ins = db.prepare(`INSERT INTO ms_portfolio_items (id, workspace_id, portfolio_id, asset_id, kind, source, gallery_id, sort_order) VALUES (?,?,?,?,?,'gallery',?,?)`);
      db.transaction(() => { for (const a of assets) { if (have.has(a.id)) continue; ins.run(generateId(), workspaceId, pf.id, a.id, a.type === 'video' ? 'video' : 'photo', gallery.id, ++base); } })();
    } catch {}
  }

  app.get('/api/media/portfolio', auth, (req, res) => {
    try { res.json(shapePortfolio(getOrCreatePortfolio(req), { withItems: true })); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/media/portfolio/handle-available', auth, (req, res) => {
    try {
      const h = slugify(req.query.handle);
      if (!h || h.length < 3) return res.json({ available: false, handle: h, reason: 'too_short' });
      const pf = getOrCreatePortfolio(req);
      res.json({ available: !db.prepare('SELECT id FROM ms_portfolios WHERE handle = ? AND id != ?').get(h, pf.id), handle: h });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/media/portfolio', auth, (req, res) => {
    try {
      const pf = getOrCreatePortfolio(req);
      const b = req.body || {}; const set = {};
      if (b.title !== undefined) set.title = String(b.title || '').slice(0, 80);
      if (b.tagline !== undefined) set.tagline = String(b.tagline || '').slice(0, 160);
      if (b.bio !== undefined) set.bio = String(b.bio || '').slice(0, 1500);
      if (b.theme !== undefined && PORTFOLIO_THEMES.includes(b.theme)) set.theme = b.theme;
      if (b.cover_url !== undefined) set.cover_url = b.cover_url || null;
      if (b.avatar_url !== undefined) set.avatar_url = b.avatar_url || null;
      if (b.is_public !== undefined) set.is_public = b.is_public ? 1 : 0;
      if (b.auto_include !== undefined) set.auto_include = b.auto_include ? 1 : 0;
      if (b.settings !== undefined && b.settings && typeof b.settings === 'object') set.settings = JSON.stringify(b.settings);
      if (b.handle !== undefined) {
        const h = slugify(b.handle);
        if (!h || h.length < 3) return res.status(400).json({ error: 'Handle needs 3+ letters, numbers or hyphens.' });
        if (db.prepare('SELECT id FROM ms_portfolios WHERE handle = ? AND id != ?').get(h, pf.id)) return res.status(409).json({ error: 'That handle is taken.' });
        set.handle = h;
      }
      const keys = Object.keys(set);
      if (keys.length) db.prepare(`UPDATE ms_portfolios SET ${keys.map(k => `${k} = @${k}`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run({ ...set, id: pf.id });
      logAudit(req.workspaceId, req.userId, 'portfolio_update', 'ms_portfolio', pf.id, { keys });
      res.json(shapePortfolio(db.prepare('SELECT * FROM ms_portfolios WHERE id = ?').get(pf.id), { withItems: true }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/media/portfolio/candidates', auth, (req, res) => {
    try {
      const pf = getOrCreatePortfolio(req);
      const have = new Set(db.prepare('SELECT asset_id FROM ms_portfolio_items WHERE portfolio_id = ? AND asset_id IS NOT NULL').all(pf.id).map(r => r.asset_id));
      const rows = db.prepare(`
        SELECT a.id, a.type, a.variants, a.storage_key, a.poster_url, g.id AS gallery_id, g.title AS gallery_title, g.published_at
        FROM ms_gallery_assets ga
        JOIN ms_galleries g ON g.id = ga.gallery_id AND g.status = 'published'
        JOIN ms_assets a ON a.id = ga.asset_id
        WHERE g.workspace_id = ? AND ga.is_hidden = 0
        ORDER BY g.published_at DESC, ga.sort_order
      `).all(req.workspaceId);
      const seen = new Set(); const candidates = [];
      for (const r of rows) {
        if (seen.has(r.id)) continue; seen.add(r.id);
        let v = {}; try { v = JSON.parse(r.variants || '{}'); } catch {}
        candidates.push({
          asset_id: r.id, kind: r.type === 'video' ? 'video' : 'photo',
          gallery_id: r.gallery_id, gallery_title: r.gallery_title, in_portfolio: have.has(r.id),
          thumb_url: v.thumb || v.web || r.poster_url || publicUrl(r.storage_key),
        });
      }
      res.json({ candidates });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/media/portfolio/items', auth, (req, res) => {
    try {
      const pf = getOrCreatePortfolio(req);
      let assetIds = Array.isArray(req.body.asset_ids) ? req.body.asset_ids : [];
      if (req.body.gallery_id) {
        assetIds = assetIds.concat(db.prepare(`SELECT a.id FROM ms_gallery_assets ga JOIN ms_assets a ON a.id = ga.asset_id JOIN ms_galleries g ON g.id = ga.gallery_id WHERE ga.gallery_id = ? AND g.workspace_id = ? AND ga.is_hidden = 0 ORDER BY ga.sort_order`).all(req.body.gallery_id, req.workspaceId).map(r => r.id));
      }
      const have = new Set(db.prepare('SELECT asset_id FROM ms_portfolio_items WHERE portfolio_id = ? AND asset_id IS NOT NULL').all(pf.id).map(r => r.asset_id));
      let base = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM ms_portfolio_items WHERE portfolio_id = ?').get(pf.id).m;
      const sel = db.prepare('SELECT id, type FROM ms_assets WHERE id = ? AND workspace_id = ?');
      const ins = db.prepare(`INSERT INTO ms_portfolio_items (id, workspace_id, portfolio_id, asset_id, kind, source, sort_order) VALUES (?,?,?,?,?,'manual',?)`);
      let n = 0;
      db.transaction(() => {
        for (const aid of assetIds) {
          if (have.has(aid)) continue;
          const a = sel.get(aid, req.workspaceId); if (!a) continue;
          ins.run(generateId(), req.workspaceId, pf.id, aid, a.type === 'video' ? 'video' : 'photo', ++base);
          have.add(aid); n++;
        }
      })();
      res.json({ added: n, items: getPortfolioItems(pf.id) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/media/portfolio/upload', auth, mediaUpload.array('files', 30), (req, res) => {
    try {
      const pf = getOrCreatePortfolio(req);
      let base = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM ms_portfolio_items WHERE portfolio_id = ?').get(pf.id).m;
      const ins = db.prepare(`INSERT INTO ms_portfolio_items (id, workspace_id, portfolio_id, storage_key, variants, kind, source, sort_order) VALUES (?,?,?,?,?,?,'upload',?)`);
      const files = req.files || [];
      db.transaction(() => {
        for (const f of files) {
          const key = `media/${path.basename(f.path)}`;
          const kind = detectType(f.mimetype, f.originalname) === 'video' ? 'video' : 'photo';
          ins.run(generateId(), req.workspaceId, pf.id, key, JSON.stringify({ original: publicUrl(key), web: publicUrl(key) }), kind, ++base);
        }
      })();
      res.json({ added: files.length, items: getPortfolioItems(pf.id) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/media/portfolio/items/order', auth, (req, res) => {
    try {
      const pf = getOrCreatePortfolio(req);
      const order = Array.isArray(req.body.order) ? req.body.order : [];
      const upd = db.prepare('UPDATE ms_portfolio_items SET sort_order = ? WHERE id = ? AND portfolio_id = ?');
      db.transaction(() => { order.forEach((iid, i) => upd.run(i, iid, pf.id)); })();
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/media/portfolio/items/:itemId', auth, (req, res) => {
    try {
      const pf = getOrCreatePortfolio(req);
      const it = db.prepare('SELECT * FROM ms_portfolio_items WHERE id = ? AND portfolio_id = ?').get(req.params.itemId, pf.id);
      if (!it) return res.status(404).json({ error: 'Item not found' });
      const set = {};
      if (req.body.caption !== undefined) set.caption = String(req.body.caption || '').slice(0, 300);
      if (req.body.title !== undefined) set.title = String(req.body.title || '').slice(0, 120);
      if (req.body.featured !== undefined) set.featured = req.body.featured ? 1 : 0;
      const keys = Object.keys(set);
      if (keys.length) db.prepare(`UPDATE ms_portfolio_items SET ${keys.map(k => `${k}=@${k}`).join(', ')} WHERE id=@id`).run({ ...set, id: it.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/media/portfolio/items/:itemId', auth, (req, res) => {
    try {
      const pf = getOrCreatePortfolio(req);
      const it = db.prepare('SELECT * FROM ms_portfolio_items WHERE id = ? AND portfolio_id = ?').get(req.params.itemId, pf.id);
      if (!it) return res.status(404).json({ error: 'Item not found' });
      if (it.source === 'upload' && it.storage_key) { try { fs.unlinkSync(path.join(uploadsDir, it.storage_key)); } catch {} }
      db.prepare('DELETE FROM ms_portfolio_items WHERE id = ?').run(it.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // one-click share to a CRM client over the existing WhatsApp rail
  app.post('/api/media/portfolio/share', auth, async (req, res) => {
    try {
      const pf = getOrCreatePortfolio(req);
      if (!pf.is_public) return res.status(400).json({ error: 'Make the portfolio public before sharing.' });
      const link = portfolioShareUrl(pf);
      let delivery = { whatsapp: 'skipped' };
      if (req.body.lead_id) {
        const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(req.body.lead_id, req.workspaceId);
        if (lead && lead.customer_phone) {
          try { await sendClientMessage({ lead, userId: req.userId, text: `✨ Have a look at my portfolio:\n${link}` }); delivery.whatsapp = 'sent'; }
          catch (e) { delivery.whatsapp = 'failed'; delivery.error = e.message; }
        } else delivery.whatsapp = 'no_phone';
      }
      res.json({ share_url: link, delivery });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // PUBLIC portfolio page data (NO auth — the handle/token is the capability)
  app.get('/api/media/public/portfolio/:handle', (req, res) => {
    try {
      const h = req.params.handle;
      const pf = db.prepare('SELECT * FROM ms_portfolios WHERE (handle = ? OR token = ?) AND is_public = 1').get(h, h);
      if (!pf) return res.status(404).json({ error: 'Portfolio not found' });
      try { db.prepare('UPDATE ms_portfolios SET view_count = view_count + 1 WHERE id = ?').run(pf.id); } catch {}
      res.json(shapePublicPortfolio(pf));
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
      let storeEnabled = false; try { storeEnabled = db.prepare("SELECT COUNT(*) c FROM ms_print_products WHERE workspace_id = ? AND active = 1").get(g.workspace_id).c > 0; } catch {}
      // Story sections — render the gallery as named chapters when the photographer organised photos into folders
      let sections = [];
      try {
        const present = new Set(rows.map(r => r.folder_id).filter(Boolean));
        if (present.size > 0) {
          const folders = db.prepare('SELECT id, name FROM ms_folders WHERE project_id = ? ORDER BY sort_order, name').all(g.project_id).filter(f => present.has(f.id));
          if (folders.length > 1 || (folders.length === 1 && rows.some(r => !r.folder_id))) {
            sections = folders.map(f => ({ id: f.id, name: f.name }));
            if (rows.some(r => !r.folder_id)) sections.push({ id: null, name: 'More photos' });
          }
        }
      } catch {}
      res.json({
        title: g.title, version: g.version,
        download_policy: settings.download_policy || 'web',
        watermark: !!settings.watermark,
        proofing, store_enabled: storeEnabled, sections,
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

  // Save the client's favourites as a named collection (gallery CX 2.0)
  app.post('/api/media/portal/:token/collection', (req, res) => {
    try {
      const g = loadPublishedGallery(req.params.token);
      if (!g) return res.status(404).json({ error: 'Gallery not found' });
      if (!portalAllowed(g, req.body.pw)) return res.status(401).json({ error: 'Password required' });
      const who = (req.body.contact || 'guest').toString().slice(0, 120);
      const name = String(req.body.name || 'My selection').slice(0, 120);
      let assetIds = Array.isArray(req.body.asset_ids) && req.body.asset_ids.length ? req.body.asset_ids
        : db.prepare('SELECT asset_id FROM ms_client_favorites WHERE gallery_id = ? AND contact_identifier = ?').all(g.id, who).map(r => r.asset_id);
      if (!assetIds.length) return res.status(400).json({ error: 'Favourite some photos first.' });
      const id = generateId();
      db.prepare('INSERT INTO ms_fav_collections (id, gallery_id, workspace_id, name, contact_identifier, asset_ids) VALUES (?,?,?,?,?,?)')
        .run(id, g.id, g.workspace_id, name, who, JSON.stringify(assetIds));
      try { broadcastToWorkspace(g.workspace_id, 'ms_collection', { gallery_id: g.id, name, count: assetIds.length }); } catch {}
      let leadId = null; try { const proj = db.prepare('SELECT lead_id FROM ms_projects WHERE id = ?').get(g.project_id); if (proj && proj.lead_id) { leadId = proj.lead_id; addContactHistory(proj.lead_id, null, 'media', `Client saved a collection "${name}" (${assetIds.length} photos)`); } } catch {}
      try { notify(g.workspace_id, { type: 'gallery', title: 'Client saved a collection', body: `"${name}" — ${assetIds.length} photo${assetIds.length > 1 ? 's' : ''} in ${g.title}`, url: leadId ? `/leads/${leadId}` : '/studio', icon: '⭐' }); } catch {}
      res.json({ ok: true, id, count: assetIds.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/media/galleries/:id/collections', auth, (req, res) => {
    try {
      const g = db.prepare('SELECT id FROM ms_galleries WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!g) return res.status(404).json({ error: 'Not found' });
      res.json({ collections: db.prepare('SELECT id, name, contact_identifier, asset_ids, created_at FROM ms_fav_collections WHERE gallery_id = ? ORDER BY created_at DESC').all(g.id).map(c => ({ ...c, asset_ids: (() => { try { return JSON.parse(c.asset_ids); } catch { return []; } })() })) });
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
      try { let leadId = null; const proj = db.prepare('SELECT lead_id FROM ms_projects WHERE id = ?').get(g.project_id); if (proj && proj.lead_id) leadId = proj.lead_id; notify(g.workspace_id, { type: 'gallery', title: 'New gallery comment', body: `${(contact || 'A client')} commented on ${g.title}`, url: leadId ? `/leads/${leadId}` : '/studio', icon: '💬' }); } catch {}
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
