'use strict';

// ════════════════════════════════════════════════════════════════════════════
//  BRAINS & STYLE  (Final Vision · Phase 9 — learning layer)
//  Builds on the existing workspace_brain (Studio Brain). Adds:
//   • Creator Brain — per-user habits inferred from their OWN cull/rating behavior
//     (keep-rate, average rating, decisiveness).
//   • Style Engine — a "house style" profile inferred from the SCORES of the work
//     a studio actually KEEPS (preferred exposure / contrast / colourfulness /
//     composition), at workspace / creator scope.
//   • Recommendations — turns brain + style into actionable, advisory hints.
//
//  All inference is over real behavior already captured (ms_cull_decisions,
//  ms_asset_scores). Advisory-only; nothing is auto-applied (that, plus the UI and
//  the style_profiles entitlement un-gate, are tracked follow-ups).
// ════════════════════════════════════════════════════════════════════════════

module.exports = function mountBrains(app, db, deps = {}) {
  const { auth = (req, res, next) => next(), generateId = () => require('crypto').randomUUID() } = deps;

  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_brain (
      workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, key TEXT NOT NULL,
      value TEXT, confidence REAL DEFAULT 0, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, user_id, key)
    );
    CREATE TABLE IF NOT EXISTS style_profiles (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, scope TEXT NOT NULL, scope_id TEXT NOT NULL,
      profile TEXT, confidence REAL DEFAULT 0, sample_n INTEGER DEFAULT 0, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (workspace_id, scope, scope_id)
    );
  `);

  const J = (v, d) => { try { return JSON.parse(v); } catch { return d; } };
  const avg = (arr) => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;

  // ── Creator Brain: infer per-user habits from their own decisions ───────────
  function deriveCreatorBrain(workspaceId, userId) {
    const out = {};
    try {
      const dec = db.prepare("SELECT decision, COUNT(*) c FROM ms_cull_decisions WHERE workspace_id = ? AND user_id = ? GROUP BY decision").all(workspaceId, userId);
      const total = dec.reduce((s, d) => s + d.c, 0);
      const keep = (dec.find(d => d.decision === 'keep') || {}).c || 0;
      const maybe = (dec.find(d => d.decision === 'maybe') || {}).c || 0;
      if (total > 0) {
        const conf = Math.min(1, total / 300);
        out.cull_keep_rate = { value: Math.round((keep / total) * 100) / 100, confidence: conf };
        out.decisiveness = { value: Math.round((1 - maybe / total) * 100) / 100, confidence: conf }; // fewer "maybe" = more decisive
        out.decisions_count = { value: total, confidence: 1 };
      }
      const ratings = db.prepare("SELECT AVG(rating) a, COUNT(*) c FROM ms_cull_decisions WHERE workspace_id = ? AND user_id = ? AND rating > 0").get(workspaceId, userId);
      if (ratings && ratings.c > 0) out.avg_rating = { value: Math.round(ratings.a * 100) / 100, confidence: Math.min(1, ratings.c / 200) };
    } catch { /* best-effort */ }
    const ins = db.prepare(`INSERT INTO creator_brain (workspace_id, user_id, key, value, confidence, updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id, user_id, key) DO UPDATE SET value = excluded.value, confidence = excluded.confidence, updated_at = CURRENT_TIMESTAMP`);
    for (const [k, v] of Object.entries(out)) ins.run(workspaceId, userId, k, JSON.stringify(v.value), v.confidence);
    return out;
  }

  // ── Style Engine: house style from the scores of KEPT work ──────────────────
  function deriveStyle(workspaceId, scope = 'workspace', scopeId = null) {
    scopeId = scopeId || workspaceId;
    const userFilter = scope === 'creator' ? 'AND c.user_id = ?' : '';
    const params = scope === 'creator' ? [workspaceId, scopeId] : [workspaceId];
    let exposure = [], contrast = [], colour = [], comps = [];
    try {
      const aRows = db.prepare(`SELECT s.reasons FROM ms_asset_scores s
        JOIN ms_cull_decisions c ON c.asset_id = s.asset_id
        WHERE s.score_type = 'aesthetic' AND c.workspace_id = ? AND c.decision = 'keep' ${userFilter} LIMIT 5000`).all(...params);
      for (const r of aRows) { const j = J(r.reasons, {}); if (j.exposure != null) exposure.push(j.exposure); if (j.contrast != null) contrast.push(j.contrast); if (j.colourfulness != null) colour.push(j.colourfulness); }
      const cRows = db.prepare(`SELECT s.value FROM ms_asset_scores s
        JOIN ms_cull_decisions c ON c.asset_id = s.asset_id
        WHERE s.score_type = 'composition' AND c.workspace_id = ? AND c.decision = 'keep' ${userFilter} LIMIT 5000`).all(...params);
      comps = cRows.map(r => r.value).filter(v => v != null);
    } catch { /* best-effort */ }
    const n = exposure.length;
    const profile = {
      exposure: +avg(exposure).toFixed(3),
      contrast: +avg(contrast).toFixed(3),
      colourfulness: +avg(colour).toFixed(3),
      composition: +avg(comps).toFixed(3),
    };
    const confidence = Math.min(1, n / 200);
    try {
      db.prepare(`INSERT INTO style_profiles (id, workspace_id, scope, scope_id, profile, confidence, sample_n, updated_at)
        VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(workspace_id, scope, scope_id) DO UPDATE SET profile = excluded.profile, confidence = excluded.confidence, sample_n = excluded.sample_n, updated_at = CURRENT_TIMESTAMP`)
        .run(generateId(), workspaceId, scope, scopeId, JSON.stringify(profile), confidence, n);
    } catch {}
    return { scope, scope_id: scopeId, profile, confidence, sample_n: n };
  }

  // ── Routes ──────────────────────────────────────────────────────────────────
  app.get('/api/media/creator-brain', auth, (req, res) => {
    try {
      const rows = db.prepare('SELECT key, value, confidence, updated_at FROM creator_brain WHERE workspace_id = ? AND user_id = ?').all(req.workspaceId, req.userId);
      const brain = {}; rows.forEach(r => { brain[r.key] = { value: J(r.value, r.value), confidence: r.confidence }; });
      res.json({ brain });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/media/creator-brain/derive', auth, (req, res) => {
    try { res.json({ brain: deriveCreatorBrain(req.workspaceId, req.userId) }); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/media/style-profile', auth, (req, res) => {
    try {
      const scope = req.query.scope === 'creator' ? 'creator' : 'workspace';
      const scopeId = scope === 'creator' ? req.userId : req.workspaceId;
      const row = db.prepare('SELECT profile, confidence, sample_n, updated_at FROM style_profiles WHERE workspace_id = ? AND scope = ? AND scope_id = ?').get(req.workspaceId, scope, scopeId);
      res.json(row ? { scope, profile: J(row.profile, {}), confidence: row.confidence, sample_n: row.sample_n } : { scope, profile: null });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/media/style-profile/derive', auth, (req, res) => {
    try {
      const scope = req.body && req.body.scope === 'creator' ? 'creator' : 'workspace';
      res.json(deriveStyle(req.workspaceId, scope, scope === 'creator' ? req.userId : req.workspaceId));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Actionable, advisory recommendations from brain + style.
  app.get('/api/media/recommendations', auth, (req, res) => {
    try {
      const cb = deriveCreatorBrain(req.workspaceId, req.userId);
      const style = deriveStyle(req.workspaceId, 'workspace', req.workspaceId);
      const recs = [];
      if (cb.cull_keep_rate) recs.push({ kind: 'cull', text: `You keep about ${Math.round(cb.cull_keep_rate.value * 100)}% of shots — auto-flag the bottom ${Math.round((1 - cb.cull_keep_rate.value) * 100)}% by hero score for a faster first pass.`, confidence: cb.cull_keep_rate.confidence });
      // Surface style hints once there's a small sample; confidence rides along so
      // the UI can caveat early/tentative suggestions.
      if (style.sample_n >= 5) {
        if (style.profile.exposure) recs.push({ kind: 'style', text: `Your kept work averages exposure ${style.profile.exposure} — flag deliveries that drift far from it.`, confidence: style.confidence });
        if (style.profile.contrast) recs.push({ kind: 'style', text: `House contrast sits around ${style.profile.contrast}; suggest matching new edits.`, confidence: style.confidence });
      }
      res.json({ recommendations: recs, creator_brain: cb, style: style.profile, style_confidence: style.confidence });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('🧠 Brains & Style mounted (creator-brain, style-profile, recommendations)');
  return { deriveCreatorBrain, deriveStyle };
};
