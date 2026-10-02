'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  COMMAND CENTER — MESSAGE EXPLORER (PROP-005 §E; spec §17)
//
//  Search customer conversations across workspaces, for support investigations.
//  Owner decision (2026-10-02): allowed, but tightly held —
//    • founder role only (not just a permission a role could be granted)
//    • a fresh step-up (password + authenticator code) for every 5-minute window
//    • every search and every opened thread is written to cc_audit, AND to the
//      customer's own audit_logs as "WappFlow support viewed conversations", so
//      access is visible from their side too
//  Read-only. Nothing here can send, edit or delete a message.
// ════════════════════════════════════════════════════════════════════════════

module.exports = function mountMessages(app, deps) {
  const { db, platformAuth, requireElevated, ccAudit, safeAll, logAudit = () => {} } = deps;

  const founderOnly = (req, res, next) => (req.admin?.cc_role === 'founder' ? next() : res.status(403).json({ error: 'Only founders can read customer conversations' }));
  const tellCustomer = (wsId, detail) => { try { logAudit(wsId, 'wappflow-support', 'platform_support_viewed_messages', 'workspace', wsId, detail); } catch {} };

  app.get('/api/cc/messages/search', platformAuth, founderOnly, requireElevated, (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const ws = String(req.query.workspace_id || '').trim();
      if (q.length < 3) return res.status(400).json({ error: 'Search for at least 3 characters' });
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
      const rows = safeAll(`SELECT m.id, m.lead_id, m.body, m.from_me, m.timestamp, m.platform,
          l.customer_name, l.workspace_id, w.name AS workspace_name
        FROM messages m JOIN leads l ON l.id = m.lead_id LEFT JOIN workspaces w ON w.id = l.workspace_id
        WHERE m.body LIKE ? ${ws ? 'AND l.workspace_id = ?' : ''}
        ORDER BY m.timestamp DESC LIMIT ?`, `%${q}%`, ...(ws ? [ws] : []), limit)
        .map((r) => ({ ...r, body: String(r.body || '').slice(0, 400) }));
      ccAudit(req, { action: 'messages_search', target_type: 'messages', workspace_id: ws || null, after: { q, results: rows.length } });
      const touched = [...new Set(rows.map((r) => r.workspace_id).filter(Boolean))];
      touched.forEach((w) => tellCustomer(w, { search: true, results: rows.filter((r) => r.workspace_id === w).length }));
      res.json({ results: rows, workspaces_touched: touched.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/cc/messages/thread/:leadId', platformAuth, founderOnly, requireElevated, (req, res) => {
    try {
      const lead = db.prepare(`SELECT l.id, l.customer_name, l.customer_phone, l.workspace_id, l.platform_source, w.name AS workspace_name
        FROM leads l LEFT JOIN workspaces w ON w.id = l.workspace_id WHERE l.id = ?`).get(req.params.leadId);
      if (!lead) return res.status(404).json({ error: 'Conversation not found' });
      const messages = safeAll(`SELECT id, body, from_me, timestamp, platform, media_type, media_url FROM messages
        WHERE lead_id = ? ORDER BY timestamp DESC LIMIT 300`, lead.id).reverse();
      ccAudit(req, { action: 'messages_thread_view', target_type: 'lead', target_id: lead.id, workspace_id: lead.workspace_id, after: { count: messages.length } });
      tellCustomer(lead.workspace_id, { lead_id: lead.id, messages: messages.length });
      res.json({ lead, messages });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return {};
};
