'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · MEDIA INTELLIGENCE — the Analyzer abstraction (Track 0 keystone)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Goal: business logic NEVER computes or knows HOW scores were produced. It only
 *  ever reads `ms_asset_scores`. There are two write paths into that one store:
 *
 *    (1) SERVER analyzers   — run today in media-worker (CPU-native: jimp/exifr).
 *    (2) EXTERNAL analyzers — the future desktop app / local ONNX runtime (or an
 *        opt-in cloud worker) POSTs results to /api/media/assets/:id/scores.
 *
 *  Both funnel through recordScores() + the idempotency ledger, so swapping the
 *  EXECUTION (server CPU → local ONNX on desktop) changes nothing downstream.
 *  Local inference is the long-term target; this module is that seam.
 *
 *  Invariants (match the existing philosophy):
 *   • Advisory only — writes ms_asset_scores; NEVER ms_cull_decisions/galleries.
 *   • Analyze once — the ledger (asset_id, analyzer_id) records model_version;
 *     re-run only when the version bumps or the user forces it.
 *   • Explainable — every score may carry `reasons` (JSON) for the UI to cite.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Canonical score vocabulary. Adding a type here is all it takes to accept it.
const SCORE_TYPES = {
  // technical primitives (server CPU — Phase 1)
  sharpness: 'technical', blur: 'technical', exposure: 'technical', contrast: 'technical', noise: 'technical',
  // duplicate / similarity clustering (server phash — Phase 1)
  dup_cluster: 'dedup', similar_cluster: 'dedup',
  // perceptual / people / scene (local ONNX on desktop — Phase 2; cloud opt-in)
  composition: 'vision', aesthetic: 'vision', face_count: 'vision', eyes_open: 'vision', smile: 'vision',
  subject: 'vision', scene_class: 'vision',
  // video primitives (ffmpeg + ONNX/cloud)
  shake: 'video', motion: 'video', quality: 'video', speech: 'video', emotion: 'video',
  scene_cut: 'video', action: 'video',
  // composites — DERIVED from the above by a transparent, tunable formula (server)
  hero: 'composite', portfolio: 'composite', album: 'composite', storytelling: 'composite',
  hook: 'composite', story: 'composite', social: 'composite',
};

// Analyzer registry — metadata only. `where` declares the target execution tier so
// the desktop app can advertise which analyzers it fulfils. Bumping modelVersion
// invalidates the ledger and triggers a single re-analysis.
const ANALYZERS = {
  technical: { id: 'technical', where: 'server', modelVersion: 'tech-v1', scoreTypes: ['sharpness', 'blur', 'exposure', 'contrast', 'noise'] },
  dedup:     { id: 'dedup',     where: 'server', modelVersion: 'phash-v1', scoreTypes: ['dup_cluster', 'similar_cluster'] },
  vision:    { id: 'vision',    where: 'client', modelVersion: 'vision-v1', scoreTypes: ['composition', 'aesthetic', 'face_count', 'eyes_open', 'smile', 'subject', 'scene_class'] },
  video:     { id: 'video',     where: 'client', modelVersion: 'video-v0', scoreTypes: ['shake', 'motion', 'quality', 'speech', 'emotion', 'scene_cut', 'action'] },
  composite: { id: 'composite', where: 'server', modelVersion: 'comp-v1', scoreTypes: ['hero', 'portfolio', 'album', 'storytelling', 'hook', 'story', 'social'] },
};
const COMPOSITE_VERSION = ANALYZERS.composite.modelVersion;

module.exports = function createIntelligence(db, deps = {}) {
  const generateId = deps.generateId || (() => require('crypto').randomUUID());
  const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
  const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

  function ensureSchema() {
    db.exec(`
      -- "analyze once" ledger: one row per (asset, analyzer); stores the version run.
      CREATE TABLE IF NOT EXISTS ms_asset_analysis (
        asset_id TEXT NOT NULL,
        analyzer_id TEXT NOT NULL,
        model_version TEXT,
        source TEXT DEFAULT 'server',     -- server|desktop|cloud
        status TEXT DEFAULT 'done',       -- done|failed
        analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (asset_id, analyzer_id)
      );
      -- Learning System: every human signal, captured now so future AI can learn.
      CREATE TABLE IF NOT EXISTS ms_feedback (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        user_id TEXT,
        entity TEXT,                       -- asset|gallery|album|reel|selection|edit
        entity_id TEXT,
        action TEXT,                       -- keep|reject|maybe|rate|favorite|edit|reorder|remove|publish
        before TEXT, after TEXT,           -- JSON snapshots where useful
        meta TEXT DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_ms_feedback_ws ON ms_feedback(workspace_id);
      -- Workspace Brain: the studio's learned preferences (explicit + inferred).
      CREATE TABLE IF NOT EXISTS workspace_brain (
        workspace_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,                        -- JSON
        confidence REAL DEFAULT 1,
        source TEXT DEFAULT 'explicit',    -- explicit|inferred
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (workspace_id, key)
      );
    `);
    // explainability column on the existing advisory store (idempotent)
    try { db.exec('ALTER TABLE ms_asset_scores ADD COLUMN reasons TEXT'); } catch { /* exists */ }
  }

  // ── core write path (used by server worker AND external ingestion) ──────────
  const ownedTypes = (analyzerId) => (ANALYZERS[analyzerId] ? ANALYZERS[analyzerId].scoreTypes : []);

  function recordScores(workspaceId, assetId, analyzerId, modelVersion, scores, source = 'server') {
    const types = ownedTypes(analyzerId);
    const valid = (Array.isArray(scores) ? scores : []).filter(s => s && SCORE_TYPES[s.score_type]);
    const tx = db.transaction(() => {
      // replace only this analyzer's score types for this asset (others untouched)
      if (types.length) {
        const del = db.prepare(`DELETE FROM ms_asset_scores WHERE asset_id = ? AND score_type IN (${types.map(() => '?').join(',')})`);
        del.run(assetId, ...types);
      }
      const ins = db.prepare('INSERT INTO ms_asset_scores (id, workspace_id, asset_id, score_type, value, group_key, model_version, source, reasons) VALUES (?,?,?,?,?,?,?,?,?)');
      for (const s of valid) ins.run(generateId(), workspaceId, assetId, s.score_type, s.value == null ? null : Number(s.value), s.group_key || null, modelVersion || (ANALYZERS[analyzerId] && ANALYZERS[analyzerId].modelVersion) || null, source, s.reasons ? JSON.stringify(s.reasons) : null);
      db.prepare(`INSERT INTO ms_asset_analysis (asset_id, analyzer_id, model_version, source, status, analyzed_at) VALUES (?,?,?,?, 'done', CURRENT_TIMESTAMP)
        ON CONFLICT(asset_id, analyzer_id) DO UPDATE SET model_version = excluded.model_version, source = excluded.source, status = 'done', analyzed_at = CURRENT_TIMESTAMP`)
        .run(assetId, analyzerId, modelVersion || (ANALYZERS[analyzerId] && ANALYZERS[analyzerId].modelVersion) || null, source);
    });
    tx();
    return valid.length;
  }

  function markAnalyzed(assetId, analyzerId, modelVersion, source = 'server') {
    db.prepare(`INSERT INTO ms_asset_analysis (asset_id, analyzer_id, model_version, source, status, analyzed_at) VALUES (?,?,?,?, 'done', CURRENT_TIMESTAMP)
      ON CONFLICT(asset_id, analyzer_id) DO UPDATE SET model_version = excluded.model_version, source = excluded.source, status = 'done', analyzed_at = CURRENT_TIMESTAMP`)
      .run(assetId, analyzerId, modelVersion || null, source);
  }

  // analyze-once gate: has this analyzer already run at >= the current version?
  function needsAnalysis(assetId, analyzerId) {
    const want = ANALYZERS[analyzerId] && ANALYZERS[analyzerId].modelVersion;
    const row = db.prepare('SELECT model_version, status FROM ms_asset_analysis WHERE asset_id = ? AND analyzer_id = ?').get(assetId, analyzerId);
    return !row || row.status !== 'done' || row.model_version !== want;
  }

  // primitives currently known for an asset → { score_type: {value, group_key} }
  function primitivesOf(assetId) {
    const map = {};
    db.prepare('SELECT score_type, value, group_key FROM ms_asset_scores WHERE asset_id = ?').all(assetId)
      .forEach(r => { map[r.score_type] = { value: r.value, group_key: r.group_key }; });
    return map;
  }

  // ── composites — DERIVED, transparent, tunable (the "v1" formula) ───────────
  // Uses whatever primitives exist; quality improves automatically once the
  // desktop ONNX analyzer contributes face/aesthetic/scene scores.
  function computeComposites(workspaceId, assetId) {
    const p = primitivesOf(assetId);
    if (Object.keys(p).length === 0) return 0;
    const v = (k) => (p[k] ? p[k].value : null);
    // normalize the raw technical primitives to 0..1 (worker uses var-of-Laplacian;
    // ~120 is the "sharp" threshold it already applies elsewhere).
    const sharp = v('sharpness') != null ? clamp01(v('sharpness') / 240) : null;
    const expo = v('exposure') != null ? clamp01(1 - Math.abs(v('exposure')) ) : null; // expects -1..1 deviation
    const contrast = v('contrast') != null ? clamp01(v('contrast')) : null;
    const noise = v('noise') != null ? clamp01(v('noise')) : null;
    const aesthetic = v('aesthetic') != null ? clamp01(v('aesthetic')) : null;
    const composition = v('composition') != null ? clamp01(v('composition')) : null;
    const faces = v('face_count') != null ? v('face_count') : v('faces'); // accept worker's legacy 'faces'
    const eyes = v('eyes_open') != null ? clamp01(v('eyes_open')) : null;
    const smile = v('smile') != null ? clamp01(v('smile')) : null;
    const isDup = !!((p.dup_cluster && p.dup_cluster.group_key) || (p.duplicate_group && p.duplicate_group.group_key));

    const avg = (arr) => { const x = arr.filter(n => n != null); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0.5; };
    const reasons = (obj) => Object.entries(obj).filter(([, val]) => val != null).map(([k, val]) => `${k}:${typeof val === 'number' ? val.toFixed(2) : val}`);

    // hero — a single standout frame: technically excellent + (if known) people-perfect
    const heroBase = avg([sharp, expo, contrast, aesthetic, composition]);
    const peopleBonus = (eyes != null || smile != null) ? avg([eyes, smile]) * 0.25 : 0;
    let hero = clamp01(heroBase * (1 - 0.15) + peopleBonus + (faces > 0 ? 0.05 : 0));
    if (isDup) hero *= 0.85; // near-duplicates shouldn't all be heroes

    // portfolio — aesthetic/craft leaning
    const portfolio = clamp01(avg([aesthetic, composition, sharp, contrast]) * (noise != null ? (1 - 0.2 * noise) : 1));
    // album — hero-like but variety-aware (penalize dup so spreads don't repeat)
    const album = clamp01(hero * (isDup ? 0.7 : 1));
    // storytelling — needs scene/subject; until then approximate from people + composition
    const storytelling = clamp01(avg([composition, (faces > 0 ? 0.7 : 0.4), aesthetic]));

    const out = [
      { score_type: 'hero', value: hero, reasons: reasons({ sharp, expo, contrast, aesthetic, composition, eyes, smile, faces, dup: isDup }) },
      { score_type: 'portfolio', value: portfolio, reasons: reasons({ aesthetic, composition, sharp, noise }) },
      { score_type: 'album', value: album, reasons: reasons({ hero, dup: isDup }) },
      { score_type: 'storytelling', value: storytelling, reasons: reasons({ composition, faces, aesthetic }) },
    ];
    return recordScores(workspaceId, assetId, 'composite', COMPOSITE_VERSION, out, 'server');
  }

  // ── Learning System + Workspace Brain ───────────────────────────────────────
  function logFeedback(workspaceId, userId, entity, entityId, action, meta) {
    try { db.prepare('INSERT INTO ms_feedback (id, workspace_id, user_id, entity, entity_id, action, meta) VALUES (?,?,?,?,?,?,?)').run(generateId(), workspaceId, userId || null, entity, entityId || null, action, JSON.stringify(meta || {})); } catch { /* never block the UX */ }
  }
  function brainGet(workspaceId) {
    const out = {};
    db.prepare('SELECT key, value, confidence, source FROM workspace_brain WHERE workspace_id = ?').all(workspaceId)
      .forEach(r => { out[r.key] = { value: J(r.value, r.value), confidence: r.confidence, source: r.source }; });
    return out;
  }
  function brainSet(workspaceId, key, value, { confidence = 1, source = 'explicit' } = {}) {
    db.prepare(`INSERT INTO workspace_brain (workspace_id, key, value, confidence, source, updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value, confidence = excluded.confidence, source = excluded.source, updated_at = CURRENT_TIMESTAMP`)
      .run(workspaceId, key, JSON.stringify(value), confidence, source);
  }
  // infer studio habits from real behavior (cull aggressiveness, ratings, delivery size)
  function deriveBrain(workspaceId) {
    try {
      const dec = db.prepare("SELECT decision, COUNT(*) c FROM ms_cull_decisions WHERE workspace_id = ? GROUP BY decision").all(workspaceId);
      const total = dec.reduce((s, d) => s + d.c, 0);
      const keep = (dec.find(d => d.decision === 'keep') || {}).c || 0;
      if (total >= 20) brainSet(workspaceId, 'cull_keep_rate', Math.round((keep / total) * 100) / 100, { confidence: Math.min(1, total / 500), source: 'inferred' });
      const avgDeliver = db.prepare("SELECT AVG(n) a FROM (SELECT COUNT(*) n FROM ms_gallery_assets ga JOIN ms_galleries g ON g.id = ga.gallery_id WHERE g.workspace_id = ? GROUP BY ga.gallery_id)").get(workspaceId);
      if (avgDeliver && avgDeliver.a) brainSet(workspaceId, 'avg_delivery_count', Math.round(avgDeliver.a), { confidence: 0.6, source: 'inferred' });
    } catch { /* derivation is best-effort */ }
    return brainGet(workspaceId);
  }

  return {
    SCORE_TYPES, ANALYZERS,
    ensureSchema, recordScores, markAnalyzed, needsAnalysis, primitivesOf, computeComposites,
    logFeedback, brainGet, brainSet, deriveBrain,
  };
};
