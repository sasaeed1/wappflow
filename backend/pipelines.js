'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Pipelines (PROP-006). "Multiple pipelines" was sold on Studio and up but the
//  product had one board. A business that sells weddings and corporate work, or
//  rentals and sales, wants a board for each.
//
//  DESIGN, stated: the six lifecycle statuses (New → Contacted → Interested →
//  Negotiating → Closed - Won / Closed - Lost) stay the single source of truth on
//  leads.status, so analytics, reports, automations and the AI that read status
//  keep working untouched. A pipeline is a named board that a lead belongs to,
//  and each pipeline may RELABEL the stages ("Interested" → "Proposal sent").
//
//  Every workspace has a default pipeline; leads with no pipeline_id are in it,
//  so no existing row needs migrating. Deleting a pipeline moves its leads back
//  to the default (nothing is lost). Extra pipelines need the multi_pipeline plan
//  feature; relabelling the default needs only manage_settings.
// ════════════════════════════════════════════════════════════════════════════

const STAGES = ['New', 'Contacted', 'Interested', 'Negotiating', 'Closed - Won', 'Closed - Lost'];

module.exports = function mountPipelines(app, db, deps) {
  const { auth, requirePerm, generateId, logAudit = () => {}, hasFeature = () => true, broadcastToWorkspace = () => {} } = deps;

  db.exec(`CREATE TABLE IF NOT EXISTS pipelines (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL,
    stage_labels TEXT, sort_order INTEGER DEFAULT 0, is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_pipelines_ws ON pipelines(workspace_id)');
  try { db.exec('ALTER TABLE leads ADD COLUMN pipeline_id TEXT'); } catch {}
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_leads_pipeline ON leads(workspace_id, pipeline_id)'); } catch {}

  const cleanLabels = (raw) => {
    const out = {};
    if (raw && typeof raw === 'object') for (const s of STAGES) {
      const v = String(raw[s] ?? '').trim().slice(0, 40);
      if (v && v !== s) out[s] = v;
    }
    return out;
  };
  const shape = (p) => ({ id: p.id, name: p.name, is_default: !!p.is_default, sort_order: p.sort_order,
    stage_labels: (() => { try { return JSON.parse(p.stage_labels || '{}'); } catch { return {}; } })() });

  function ensureDefault(workspaceId) {
    let d = db.prepare('SELECT * FROM pipelines WHERE workspace_id = ? AND is_default = 1').get(workspaceId);
    if (!d) {
      const id = generateId();
      db.prepare("INSERT INTO pipelines (id, workspace_id, name, stage_labels, sort_order, is_default) VALUES (?, ?, 'Sales pipeline', '{}', 0, 1)").run(id, workspaceId);
      d = db.prepare('SELECT * FROM pipelines WHERE id = ?').get(id);
    }
    return d;
  }
  const list = (workspaceId) => { ensureDefault(workspaceId); return db.prepare('SELECT * FROM pipelines WHERE workspace_id = ? ORDER BY is_default DESC, sort_order, created_at').all(workspaceId).map(shape); };
  const owned = (workspaceId, id) => db.prepare('SELECT * FROM pipelines WHERE id = ? AND workspace_id = ?').get(id, workspaceId);

  /** Put a lead on a pipeline. null/'' or the default pipeline = the default board. Returns false if the pipeline isn't this workspace's. */
  function assign(workspaceId, leadId, pipelineId) {
    let value = null;
    if (pipelineId) {
      const p = owned(workspaceId, pipelineId);
      if (!p) return false;
      value = p.is_default ? null : p.id;
    }
    db.prepare('UPDATE leads SET pipeline_id = ? WHERE id = ? AND workspace_id = ?').run(value, leadId, workspaceId);
    return true;
  }

  app.get('/api/pipelines', auth, (req, res) => {
    try {
      const pipes = list(req.workspaceId);
      const counts = db.prepare(`SELECT COALESCE(pipeline_id, '') AS p, COUNT(*) AS c FROM leads
        WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) GROUP BY COALESCE(pipeline_id, '')`).all(req.workspaceId);
      const byId = Object.fromEntries(counts.map((r) => [r.p, r.c]));
      res.json({ stages: STAGES, pipelines: pipes.map((p) => ({ ...p, lead_count: byId[p.is_default ? '' : p.id] || 0 })), can_add: hasFeature(req.workspaceId, 'multi_pipeline') });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/pipelines', auth, requirePerm('manage_settings'), (req, res) => {
    if (!hasFeature(req.workspaceId, 'multi_pipeline')) return res.status(402).json({ error: 'More than one pipeline is available on Studio and above.', upgrade: true, feature: 'multi_pipeline' });
    const name = String(req.body?.name || '').trim().slice(0, 60);
    if (!name) return res.status(400).json({ error: 'Give the pipeline a name' });
    ensureDefault(req.workspaceId);
    if (db.prepare('SELECT COUNT(*) AS c FROM pipelines WHERE workspace_id = ?').get(req.workspaceId).c >= 20) return res.status(400).json({ error: 'You can have up to 20 pipelines' });
    const id = generateId();
    const sort = (db.prepare('SELECT MAX(sort_order) AS m FROM pipelines WHERE workspace_id = ?').get(req.workspaceId).m || 0) + 1;
    db.prepare('INSERT INTO pipelines (id, workspace_id, name, stage_labels, sort_order) VALUES (?,?,?,?,?)').run(id, req.workspaceId, name, JSON.stringify(cleanLabels(req.body?.stage_labels)), sort);
    logAudit(req.workspaceId, req.userId, 'pipeline_created', 'pipeline', id, { name });
    broadcastToWorkspace(req.workspaceId, 'pipelines_changed', {});
    res.status(201).json({ pipeline: shape(owned(req.workspaceId, id)) });
  });

  app.put('/api/pipelines/:id', auth, requirePerm('manage_settings'), (req, res) => {
    const p = owned(req.workspaceId, req.params.id);
    if (!p) return res.status(404).json({ error: 'Pipeline not found' });
    const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 60) : p.name;
    if (!name) return res.status(400).json({ error: 'Give the pipeline a name' });
    const labels = req.body?.stage_labels !== undefined ? JSON.stringify(cleanLabels(req.body.stage_labels)) : p.stage_labels;
    db.prepare('UPDATE pipelines SET name = ?, stage_labels = ? WHERE id = ?').run(name, labels, p.id);
    logAudit(req.workspaceId, req.userId, 'pipeline_updated', 'pipeline', p.id, { name });
    broadcastToWorkspace(req.workspaceId, 'pipelines_changed', {});
    res.json({ pipeline: shape(owned(req.workspaceId, p.id)) });
  });

  app.delete('/api/pipelines/:id', auth, requirePerm('manage_settings'), (req, res) => {
    const p = owned(req.workspaceId, req.params.id);
    if (!p) return res.status(404).json({ error: 'Pipeline not found' });
    if (p.is_default) return res.status(400).json({ error: 'The default pipeline can be renamed but not deleted' });
    const moved = db.transaction(() => {
      const r = db.prepare('UPDATE leads SET pipeline_id = NULL WHERE workspace_id = ? AND pipeline_id = ?').run(req.workspaceId, p.id);
      db.prepare('DELETE FROM pipelines WHERE id = ?').run(p.id);
      return r.changes;
    })();
    logAudit(req.workspaceId, req.userId, 'pipeline_deleted', 'pipeline', p.id, { name: p.name, leads_moved: moved });
    broadcastToWorkspace(req.workspaceId, 'pipelines_changed', {});
    res.json({ ok: true, leads_moved_to_default: moved });
  });

  // Move one or many leads to a pipeline.
  app.post('/api/pipelines/:id/leads', auth, (req, res) => {
    const ids = Array.isArray(req.body?.lead_ids) ? req.body.lead_ids.slice(0, 500) : [];
    if (!ids.length) return res.status(400).json({ error: 'Choose at least one lead' });
    let moved = 0;
    for (const leadId of ids) {
      const lead = deps.getScopedLead ? deps.getScopedLead(req, leadId) : db.prepare('SELECT id FROM leads WHERE id = ? AND workspace_id = ?').get(leadId, req.workspaceId);
      if (!lead) continue;
      if (!assign(req.workspaceId, leadId, req.params.id)) return res.status(404).json({ error: 'Pipeline not found' });
      moved++;
    }
    logAudit(req.workspaceId, req.userId, 'leads_moved_pipeline', 'pipeline', req.params.id, { count: moved });
    broadcastToWorkspace(req.workspaceId, 'lead_updated', {});
    res.json({ ok: true, moved });
  });

  return { assign, list, STAGES };
};
