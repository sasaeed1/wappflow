'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Universal search (Phase 5) — one query across the whole workspace.
//
//  Until now the only thing resembling global search for a tenant was the AI
//  Command Center: free text sent to an LLM intent classifier that could return
//  leads, reminders or stats. Non-deterministic, and blind to clients, contracts,
//  invoices, bookings and shoots (audit crm-clients-8 / contracts-12 / platform-13).
//  Everything else in the product was per-page client-side filtering over a full
//  unpaginated fetch.
//
//  The admin control plane already had the right SHAPE (GET /api/cc/search), so
//  this borrows it and adds the two things a tenant endpoint must have and that
//  one does not: workspace scoping on every query, and LIKE-wildcard escaping so
//  a search for "50%" is a search, not a match-everything pattern.
// ════════════════════════════════════════════════════════════════════════════

const PER_TYPE = 6;   // enough to recognise the thing you meant; the palette shows groups
const MIN_Q = 2;

module.exports = function mountSearch(app, db, deps = {}) {
  const { auth = (req, res, next) => next() } = deps;

  // A LIKE pattern that treats % and _ as literal characters.
  const pattern = (q) => '%' + String(q).replace(/[%_\\]/g, '\\$&') + '%';

  // Every query is best-effort: a workspace whose schema predates a module must
  // still get results from the modules it does have.
  const safeAll = (sql, ...args) => { try { return db.prepare(sql).all(...args); } catch { return []; } };

  app.get('/api/search', auth, (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (q.length < MIN_Q) return res.json({ results: [], query: q });
      const like = pattern(q);
      const ws = req.workspaceId;
      const results = [];
      const push = (type, rows, map) => { for (const r of rows) results.push({ type, ...map(r) }); };

      // Leads honour per-member visibility, exactly as the leads list does — search
      // must not become a way to see records you are not allowed to open.
      const leadScope = req.canViewAllLeads ? '' : ' AND assigned_to = ?';
      const leadArgs = req.canViewAllLeads ? [ws, like, like, like] : [ws, like, like, like, req.userId];

      push('lead', safeAll(
        `SELECT id, customer_name, customer_phone, status FROM leads
         WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) AND (is_client = 0 OR is_client IS NULL)
           AND (customer_name LIKE ? ESCAPE '\\' OR customer_phone LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')
         ${leadScope} ORDER BY last_message_at DESC LIMIT ${PER_TYPE}`, ...leadArgs),
        (r) => ({ id: r.id, label: r.customer_name || r.customer_phone, sub: r.status || 'Lead', url: `/leads/${r.id}` }));

      // Clients are leads with is_client = 1, and their detail page IS the lead page.
      push('client', safeAll(
        `SELECT id, customer_name, customer_phone FROM leads
         WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) AND is_client = 1
           AND (customer_name LIKE ? ESCAPE '\\' OR customer_phone LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')
         ${leadScope} ORDER BY last_message_at DESC LIMIT ${PER_TYPE}`, ...leadArgs),
        (r) => ({ id: r.id, label: r.customer_name || r.customer_phone, sub: 'Client', url: `/leads/${r.id}` }));

      push('contract', safeAll(
        `SELECT id, title, status, type FROM cs_documents
         WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) AND title LIKE ? ESCAPE '\\'
         ORDER BY updated_at DESC LIMIT ${PER_TYPE}`, ws, like),
        (r) => ({ id: r.id, label: r.title, sub: `${r.type || 'contract'} · ${r.status || 'draft'}`, url: `/contracts/${r.id}` }));

      push('invoice', safeAll(
        `SELECT id, invoice_number, customer_name, status, total, currency_symbol FROM invoices
         WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
           AND (invoice_number LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\')
         ORDER BY created_at DESC LIMIT ${PER_TYPE}`, ws, like, like),
        (r) => ({ id: r.id, label: `${r.invoice_number}${r.customer_name ? ` — ${r.customer_name}` : ''}`,
                  sub: `${r.currency_symbol || '$'}${r.total ?? 0} · ${r.status || 'draft'}`, url: '/invoices' }));

      push('booking', safeAll(
        `SELECT id, name, service, start_at, status FROM bookings
         WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)
           AND (name LIKE ? ESCAPE '\\' OR service LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')
         ORDER BY start_at DESC LIMIT ${PER_TYPE}`, ws, like, like, like),
        (r) => ({ id: r.id, label: `${r.service || 'Booking'}${r.name ? ` — ${r.name}` : ''}`, sub: r.start_at || '', url: '/bookings' }));

      push('project', safeAll(
        `SELECT id, title, status, project_type FROM ms_projects
         WHERE workspace_id = ? AND title LIKE ? ESCAPE '\\'
         ORDER BY created_at DESC LIMIT ${PER_TYPE}`, ws, like),
        (r) => ({ id: r.id, label: r.title, sub: `${r.project_type || 'shoot'} · ${r.status || ''}`.trim(), url: `/studio/${r.id}` }));

      // Team messages, restricted to channels this user can actually see — the same
      // rule the chat search uses, not a looser one because it is a different route.
      push('message', safeAll(
        `SELECT m.id, m.channel_id, m.body, m.sender_name FROM chat_messages m
         JOIN chat_channels c ON c.id = m.channel_id
         LEFT JOIN chat_members mem ON mem.channel_id = c.id AND mem.user_id = ?
         WHERE c.workspace_id = ? AND (c.is_private = 0 OR mem.user_id IS NOT NULL)
           AND m.body LIKE ? ESCAPE '\\'
         ORDER BY m.created_at DESC LIMIT ${PER_TYPE}`, req.userId, ws, like),
        (r) => ({ id: r.id, label: (r.body || '').slice(0, 80), sub: `${r.sender_name || 'Message'}`,
                  url: `/chat?channel=${encodeURIComponent(r.channel_id)}` }));

      push('member', safeAll(
        `SELECT user_id, full_name, invite_email, role FROM workspace_members
         WHERE workspace_id = ? AND (full_name LIKE ? ESCAPE '\\' OR invite_email LIKE ? ESCAPE '\\')
         LIMIT ${PER_TYPE}`, ws, like, like),
        (r) => ({ id: r.user_id, label: r.full_name || r.invite_email, sub: r.role || 'member', url: '/team' }));

      res.json({ results, query: q });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('🔎 Universal search mounted at /api/search');
};
