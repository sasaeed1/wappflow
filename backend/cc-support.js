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
  const { db, platformAuth, requirePerm, ccAudit, emit, rid, safeAll, safeCount, auth, notify = () => {}, sendPlatformMail } = deps;

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
        SELECT t.*, w.name AS workspace_name, ad.email AS admin_email, u.email AS requester_email, u.full_name AS requester_name,
          (SELECT COUNT(*) FROM cc_ticket_comments c WHERE c.ticket_id = t.id) AS comment_count,
          (SELECT c.author_type FROM cc_ticket_comments c WHERE c.ticket_id = t.id ORDER BY c.created_at DESC LIMIT 1) AS last_author
        FROM cc_tickets t
        LEFT JOIN workspaces w ON w.id = t.workspace_id
        LEFT JOIN cc_admins ad ON ad.id = t.admin_id
        LEFT JOIN users u ON u.id = t.requester_user_id
        ${whereSql}
        ORDER BY COALESCE(t.updated_at, t.created_at) DESC`, ...params);
      res.json({ tickets: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── POST /api/cc/tickets — create ───────────────────────────────────────────
  app.post('/api/cc/tickets', platformAuth, requirePerm('manage_support'), (req, res) => {
    try {
      const { workspace_id = null, kind, priority, subject, body, source, customer_visible = false } = req.body || {};
      if (!subject) return res.status(400).json({ error: 'subject required' });
      const k = KINDS.includes(kind) ? kind : 'question';
      const p = PRIORITIES.includes(priority) ? priority : 'medium';
      const id = rid();
      db.prepare(`INSERT INTO cc_tickets (id, workspace_id, admin_id, kind, priority, status, subject, body, source, customer_visible, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(
        id, workspace_id || null, req.admin.id, k, p, 'open',
        String(subject), String(body || ''), source || 'command-center', customer_visible && workspace_id ? 1 : 0);
      ccAudit(req, { action: 'ticket_create', target_type: 'ticket', target_id: id, workspace_id: workspace_id || null, after: { kind: k, priority: p, subject } });
      emit({ workspace_id: workspace_id || null, actor_id: req.admin.id, type: 'ticket_created', entity_type: 'ticket', entity_id: id, payload: { kind: k, priority: p, subject } });
      res.json({ ok: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/cc/tickets/:id — ticket + comments ─────────────────────────────
  app.get('/api/cc/tickets/:id', platformAuth, (req, res) => {
    try {
      const ticket = db.prepare(`
        SELECT t.*, w.name AS workspace_name, ad.email AS admin_email, u.email AS requester_email, u.full_name AS requester_name
        FROM cc_tickets t
        LEFT JOIN workspaces w ON w.id = t.workspace_id
        LEFT JOIN cc_admins ad ON ad.id = t.admin_id
        LEFT JOIN users u ON u.id = t.requester_user_id
        WHERE t.id = ?`).get(req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      const comments = safeAll(`
        SELECT c.*, ad.email AS admin_email, u.full_name AS customer_name, u.email AS customer_email
        FROM cc_ticket_comments c
        LEFT JOIN cc_admins ad ON ad.id = c.admin_id
        LEFT JOIN users u ON u.id = c.author_user_id
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
        db.prepare('UPDATE cc_tickets SET status = ?, priority = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(status, priority, req.params.id);
      } else {
        db.prepare('UPDATE cc_tickets SET status = ?, priority = ?, resolved_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(status, priority, req.params.id);
      }
      if (before.customer_visible && before.requester_user_id && resolving && before.status !== status) {
        tellCustomer(before, 'Your support request was resolved', `“${before.subject}” is marked resolved. Reply if anything is still wrong.`);
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
      const ticket = db.prepare('SELECT * FROM cc_tickets WHERE id = ?').get(req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      const body = String(req.body?.body || '').trim();
      if (!body) return res.status(400).json({ error: 'body required' });
      // Customer-visible tickets default to a PUBLIC reply; internal notes are explicit.
      const internal = req.body?.internal === true ? 1 : req.body?.internal === false ? 0 : (ticket.customer_visible ? 0 : 1);
      const id = rid();
      db.prepare("INSERT INTO cc_ticket_comments (id, ticket_id, admin_id, body, internal, author_type) VALUES (?,?,?,?,?,'admin')")
        .run(id, req.params.id, req.admin.id, body.slice(0, 10000), internal);
      db.prepare("UPDATE cc_tickets SET updated_at = CURRENT_TIMESTAMP, status = CASE WHEN status = 'open' AND ? = 0 THEN 'in_progress' ELSE status END WHERE id = ?").run(internal, ticket.id);
      if (!internal && ticket.customer_visible && ticket.requester_user_id) {
        tellCustomer(ticket, 'WappFlow support replied', body.slice(0, 160));
      }
      ccAudit(req, { action: 'ticket_comment', target_type: 'ticket', target_id: req.params.id, workspace_id: ticket.workspace_id || null, after: { internal: !!internal } });
      emit({ workspace_id: ticket.workspace_id || null, actor_id: req.admin.id, type: 'ticket_commented', entity_type: 'ticket', entity_id: req.params.id });
      res.json({ ok: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── notify the customer who raised a ticket: bell + email ───────────────────
  function tellCustomer(ticket, title, text) {
    try { notify(ticket.workspace_id, { type: 'support', title, body: text, url: `/help?ticket=${ticket.id}`, icon: '🛟', userId: ticket.requester_user_id }); } catch {}
    try {
      const u = db.prepare('SELECT email, full_name FROM users WHERE id = ?').get(ticket.requester_user_id);
      const base = String(process.env.FRONTEND_URL || '').replace(/\/+$/, '');
      if (u?.email && sendPlatformMail) {
        sendPlatformMail({
          to: u.email,
          subject: `${title}: ${ticket.subject}`,
          text: `${text}\n\nOpen your request: ${base}/help?ticket=${ticket.id}\n\n— WappFlow support`,
        }).catch(() => {});
      }
    } catch {}
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  CUSTOMER SIDE — the in-app help desk (PROP-005 §E). Workspace auth; every
  //  query is scoped to the caller's workspace. Customers never see internal notes.
  // ════════════════════════════════════════════════════════════════════════════
  if (auth) {
    const own = (req) => db.prepare('SELECT * FROM cc_tickets WHERE id = ? AND workspace_id = ? AND customer_visible = 1').get(req.params.id, req.workspaceId);
    const customerKinds = ['question', 'bug', 'feature', 'billing'];

    app.get('/api/support/tickets', auth, (req, res) => {
      try {
        res.json({ tickets: safeAll(`SELECT t.id, t.subject, t.kind, t.status, t.created_at, COALESCE(t.updated_at, t.created_at) AS updated_at,
            (SELECT c.author_type FROM cc_ticket_comments c WHERE c.ticket_id = t.id AND c.internal = 0 ORDER BY c.created_at DESC LIMIT 1) AS last_author
          FROM cc_tickets t WHERE t.workspace_id = ? AND t.customer_visible = 1 ORDER BY COALESCE(t.updated_at, t.created_at) DESC LIMIT 100`, req.workspaceId) });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/support/tickets', auth, (req, res) => {
      try {
        const subject = String(req.body?.subject || '').trim().slice(0, 160);
        const body = String(req.body?.body || '').trim().slice(0, 10000);
        if (!subject || !body) return res.status(400).json({ error: 'Add a subject and describe the problem' });
        const open = safeCount("SELECT COUNT(*) AS c FROM cc_tickets WHERE workspace_id = ? AND customer_visible = 1 AND status IN ('open','in_progress')", req.workspaceId);
        if (open >= 20) return res.status(429).json({ error: 'You have 20 open requests. Reply on an existing one, or wait for us to close some.' });
        const kind = customerKinds.includes(req.body?.kind) ? req.body.kind : 'question';
        const id = rid();
        db.prepare(`INSERT INTO cc_tickets (id, workspace_id, admin_id, kind, priority, status, subject, body, source, requester_user_id, customer_visible, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP)`).run(id, req.workspaceId, null, kind === 'billing' ? 'question' : kind, 'medium', 'open', subject, body, 'customer', req.userId);
        const ws = db.prepare('SELECT name FROM workspaces WHERE id = ?').get(req.workspaceId);
        try {
          db.prepare(`INSERT INTO cc_inbox (id, kind, workspace_id, severity, title, body, link) VALUES (?,?,?,?,?,?,?)`)
            .run(rid(), 'support_ticket', req.workspaceId, kind === 'bug' ? 'high' : 'medium', `New support request from ${ws?.name || 'a customer'}: ${subject}`, body.slice(0, 280), `/control/support?ticket=${id}`);
        } catch {}
        emit({ workspace_id: req.workspaceId, actor_type: 'user', actor_id: req.userId, type: 'ticket_created', entity_type: 'ticket', entity_id: id, payload: { kind, subject }, source: 'help-desk' });
        res.json({ ok: true, id });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/support/tickets/:id', auth, (req, res) => {
      try {
        const t = own(req);
        if (!t) return res.status(404).json({ error: 'Request not found' });
        const comments = safeAll(`SELECT c.id, c.body, c.author_type, c.created_at, u.full_name AS customer_name
          FROM cc_ticket_comments c LEFT JOIN users u ON u.id = c.author_user_id
          WHERE c.ticket_id = ? AND c.internal = 0 ORDER BY c.created_at`, t.id);
        res.json({ ticket: { id: t.id, subject: t.subject, body: t.body, kind: t.kind, status: t.status, created_at: t.created_at }, comments });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.post('/api/support/tickets/:id/reply', auth, (req, res) => {
      try {
        const t = own(req);
        if (!t) return res.status(404).json({ error: 'Request not found' });
        const body = String(req.body?.body || '').trim().slice(0, 10000);
        if (!body) return res.status(400).json({ error: 'Write a reply first' });
        db.prepare("INSERT INTO cc_ticket_comments (id, ticket_id, admin_id, body, internal, author_type, author_user_id) VALUES (?,?,NULL,?,0,'customer',?)").run(rid(), t.id, body, req.userId);
        // A reply on a resolved request reopens it.
        db.prepare("UPDATE cc_tickets SET updated_at = CURRENT_TIMESTAMP, status = CASE WHEN status IN ('resolved','closed') THEN 'open' ELSE status END, resolved_at = CASE WHEN status IN ('resolved','closed') THEN NULL ELSE resolved_at END WHERE id = ?").run(t.id);
        if (t.status === 'resolved' || t.status === 'closed') {
          try { db.prepare(`INSERT INTO cc_inbox (id, kind, workspace_id, severity, title, link) VALUES (?,?,?,?,?,?)`).run(rid(), 'support_ticket', t.workspace_id, 'medium', `Support request reopened: ${t.subject}`, `/control/support?ticket=${t.id}`); } catch {}
        }
        emit({ workspace_id: t.workspace_id, actor_type: 'user', actor_id: req.userId, type: 'ticket_replied', entity_type: 'ticket', entity_id: t.id, source: 'help-desk' });
        res.json({ ok: true });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
  }

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
