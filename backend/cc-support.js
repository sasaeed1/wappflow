// ════════════════════════════════════════════════════════════════════════════
//  SUPPORT OPERATIONS (spec §12) — Command Center sub-module.
//
//  Internal ticketing over the existing cc_tickets / cc_ticket_comments tables
//  (created by command-center.ensureSchema). Platform-scoped: every route uses
//  platformAuth; mutations also require the 'manage_support' permission.
//
//  Mounted by the orchestrator:
//    require('./cc-support')(app, { db, platformAuth, requirePerm, ccAudit, emit, rid, safeAll, safeCount, broadcastToWorkspace, sendEmail, entitlements });
// ════════════════════════════════════════════════════════════════════════════

module.exports = function (app, deps) {
  const { db, platformAuth, requirePerm, ccAudit, emit, rid, safeAll, safeCount } = deps;

  const KINDS = ['bug', 'feature', 'escalation', 'question'];
  const PRIORITIES = ['low', 'medium', 'high'];
  const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

  // ── GET /api/cc/tickets — list (filterable) ─────────────────────────────────
  app.get('/api/cc/tickets', platformAuth, (req, res) => {
    try {
      const { status = '', kind = '' } = req.query;
      const where = [], params = [];
      if (status) { where.push('t.status = ?'); params.push(status); }
      if (kind) { where.push('t.kind = ?'); params.push(kind); }
      const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const rows = safeAll(`
        SELECT t.*, w.name AS workspace_name, ad.email AS admin_email
        FROM cc_tickets t
        LEFT JOIN workspaces w ON w.id = t.workspace_id
        LEFT JOIN cc_admins ad ON ad.id = t.admin_id
        ${whereSql}
        ORDER BY t.created_at DESC`, ...params);
      res.json({ tickets: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── POST /api/cc/tickets — create ───────────────────────────────────────────
  app.post('/api/cc/tickets', platformAuth, requirePerm('manage_support'), (req, res) => {
    try {
      const { workspace_id = null, kind, priority, subject, body, source } = req.body || {};
      if (!subject) return res.status(400).json({ error: 'subject required' });
      const k = KINDS.includes(kind) ? kind : 'question';
      const p = PRIORITIES.includes(priority) ? priority : 'medium';
      const id = rid();
      db.prepare(`INSERT INTO cc_tickets (id, workspace_id, admin_id, kind, priority, status, subject, body, source)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
        id, workspace_id || null, req.admin.id, k, p, 'open',
        String(subject), String(body || ''), source || 'command-center');
      ccAudit(req, { action: 'ticket_create', target_type: 'ticket', target_id: id, workspace_id: workspace_id || null, after: { kind: k, priority: p, subject } });
      emit({ workspace_id: workspace_id || null, actor_id: req.admin.id, type: 'ticket_created', entity_type: 'ticket', entity_id: id, payload: { kind: k, priority: p, subject } });
      res.json({ ok: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/cc/tickets/:id — ticket + comments ─────────────────────────────
  app.get('/api/cc/tickets/:id', platformAuth, (req, res) => {
    try {
      const ticket = db.prepare(`
        SELECT t.*, w.name AS workspace_name, ad.email AS admin_email
        FROM cc_tickets t
        LEFT JOIN workspaces w ON w.id = t.workspace_id
        LEFT JOIN cc_admins ad ON ad.id = t.admin_id
        WHERE t.id = ?`).get(req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      const comments = safeAll(`
        SELECT c.*, ad.email AS admin_email
        FROM cc_ticket_comments c
        LEFT JOIN cc_admins ad ON ad.id = c.admin_id
        WHERE c.ticket_id = ?
        ORDER BY c.created_at ASC`, req.params.id);
      res.json({ ticket, comments });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── PUT /api/cc/tickets/:id — update status / priority ──────────────────────
  app.put('/api/cc/tickets/:id', platformAuth, requirePerm('manage_support'), (req, res) => {
    try {
      const before = db.prepare('SELECT * FROM cc_tickets WHERE id = ?').get(req.params.id);
      if (!before) return res.status(404).json({ error: 'Ticket not found' });
      const status = STATUSES.includes(req.body?.status) ? req.body.status : before.status;
      const priority = PRIORITIES.includes(req.body?.priority) ? req.body.priority : before.priority;
      const resolving = (status === 'resolved' || status === 'closed');
      if (resolving) {
        db.prepare('UPDATE cc_tickets SET status = ?, priority = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(status, priority, req.params.id);
      } else {
        db.prepare('UPDATE cc_tickets SET status = ?, priority = ? WHERE id = ?')
          .run(status, priority, req.params.id);
      }
      ccAudit(req, { action: 'ticket_update', target_type: 'ticket', target_id: req.params.id, workspace_id: before.workspace_id || null,
        before: { status: before.status, priority: before.priority }, after: { status, priority } });
      emit({ workspace_id: before.workspace_id || null, actor_id: req.admin.id, type: 'ticket_updated', entity_type: 'ticket', entity_id: req.params.id, payload: { status, priority } });
      res.json({ ok: true, status, priority });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── POST /api/cc/tickets/:id/comment — add a comment ────────────────────────
  app.post('/api/cc/tickets/:id/comment', platformAuth, requirePerm('manage_support'), (req, res) => {
    try {
      const ticket = db.prepare('SELECT id, workspace_id FROM cc_tickets WHERE id = ?').get(req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      const body = String(req.body?.body || '').trim();
      if (!body) return res.status(400).json({ error: 'body required' });
      const internal = req.body?.internal === false ? 0 : 1;
      const id = rid();
      db.prepare('INSERT INTO cc_ticket_comments (id, ticket_id, admin_id, body, internal) VALUES (?,?,?,?,?)')
        .run(id, req.params.id, req.admin.id, body, internal);
      ccAudit(req, { action: 'ticket_comment', target_type: 'ticket', target_id: req.params.id, workspace_id: ticket.workspace_id || null, after: { internal: !!internal } });
      emit({ workspace_id: ticket.workspace_id || null, actor_id: req.admin.id, type: 'ticket_commented', entity_type: 'ticket', entity_id: req.params.id });
      res.json({ ok: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/cc/support/stats — counts by status + avg resolution time ──────
  app.get('/api/cc/support/stats', platformAuth, (req, res) => {
    try {
      const byStatus = safeAll('SELECT status, COUNT(*) AS c FROM cc_tickets GROUP BY status');
      const avgRow = (() => {
        try {
          return db.prepare(`SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24) AS h
            FROM cc_tickets WHERE resolved_at IS NOT NULL`).get();
        } catch { return null; }
      })();
      const avg_resolution_hours = avgRow && avgRow.h != null ? Math.round(avgRow.h * 10) / 10 : null;
      res.json({ byStatus, avg_resolution_hours });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return {};
};
