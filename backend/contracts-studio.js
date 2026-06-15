'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · CONTRACTS STUDIO  — client-centric proposals, contracts & e-sign.
 *  A first-class module (see CONTRACTS-STUDIO-DESIGN.md). Block-based documents,
 *  interactive proposals, multi-party signing, deep CRM integration.
 *  Owns the `cs_*` tables only — touches no existing table/route.
 *  Phase 1: schema + document CRUD + templates + dashboard overview.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');

module.exports = function mountContractsStudio(app, db, deps = {}) {
  const {
    auth = (req, res, next) => next(),
    generateId = () => crypto.randomUUID(),
    logAudit = () => {},
    broadcastToWorkspace = () => {},
    addContactHistory = () => {},
    clientBaseUrl = process.env.FRONTEND_URL || '',
    // injected for later phases (send/sign): sendClientMessage, sendEmail, path, fs, uploadsDir
  } = deps;

  db.exec(`
    CREATE TABLE IF NOT EXISTS cs_documents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      lead_id TEXT,
      type TEXT DEFAULT 'contract',     -- contract|proposal|quote|nda|sow|retainer|agreement|hybrid
      title TEXT NOT NULL,
      status TEXT DEFAULT 'draft',       -- draft|pending_approval|sent|viewed|signed|completed|declined|expired
      blocks TEXT DEFAULT '[]',          -- JSON array of editor blocks
      theme TEXT DEFAULT 'monochrome',   -- monochrome|editorial|executive
      settings TEXT DEFAULT '{}',        -- JSON: accent, payment, signing mode, etc.
      totals TEXT DEFAULT '{}',          -- JSON: { currency, subtotal, total, selected: {...} }
      token TEXT UNIQUE,                 -- public viewer/sign capability
      version INTEGER DEFAULT 1,
      doc_hash TEXT,
      created_by TEXT,
      sent_at TIMESTAMP, viewed_at TIMESTAMP, completed_at TIMESTAMP, expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cs_signers (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      workspace_id TEXT,
      role TEXT DEFAULT 'client',        -- client|company|witness|cosigner
      name TEXT, email TEXT, phone TEXT,
      sign_order INTEGER DEFAULT 0,
      mode TEXT DEFAULT 'sequential',    -- sequential|parallel
      status TEXT DEFAULT 'pending',     -- pending|viewed|signed|declined
      token TEXT,
      typed_name TEXT, signature_data TEXT, consent INTEGER DEFAULT 0,
      ip TEXT, user_agent TEXT, signed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cs_events (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      workspace_id TEXT,
      type TEXT NOT NULL,                -- created|sent|viewed|block_viewed|signed|approved|declined|reminded|...
      actor TEXT, ip TEXT, user_agent TEXT,
      meta TEXT DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cs_approvals (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      workspace_id TEXT,
      approver_user_id TEXT, role TEXT,
      sign_order INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',     -- pending|approved|rejected
      note TEXT, decided_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cs_templates (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      type TEXT DEFAULT 'contract',
      industry TEXT,
      title TEXT NOT NULL,
      blocks TEXT DEFAULT '[]',
      created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cs_docs_ws ON cs_documents(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_cs_docs_token ON cs_documents(token);
    CREATE INDEX IF NOT EXISTS idx_cs_signers_doc ON cs_signers(document_id);
    CREATE INDEX IF NOT EXISTS idx_cs_events_doc ON cs_events(document_id);
  `);

  const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
  const shareUrl = (d) => (d.token ? `${clientBaseUrl}/d/${d.token}` : null);

  function recordEvent(doc, type, { actor, ip, ua, meta } = {}) {
    db.prepare(`INSERT INTO cs_events (id, document_id, workspace_id, type, actor, ip, user_agent, meta) VALUES (?,?,?,?,?,?,?,?)`)
      .run(generateId(), doc.id, doc.workspace_id, type, actor || null, ip || null, ua || null, JSON.stringify(meta || {}));
  }

  function shapeDoc(d, { withBlocks = false } = {}) {
    return {
      id: d.id, lead_id: d.lead_id, type: d.type, title: d.title, status: d.status,
      theme: d.theme, settings: J(d.settings, {}), totals: J(d.totals, {}),
      token: d.token, share_url: shareUrl(d), version: d.version,
      sent_at: d.sent_at, viewed_at: d.viewed_at, completed_at: d.completed_at, expires_at: d.expires_at,
      created_at: d.created_at, updated_at: d.updated_at,
      ...(withBlocks ? { blocks: J(d.blocks, []) } : {}),
    };
  }
  const getDoc = (ws, id) => db.prepare('SELECT * FROM cs_documents WHERE id = ? AND workspace_id = ?').get(id, ws);

  // ── Dashboard overview (the living workspace) ───────────────────────────────
  app.get('/api/cs/overview', auth, (req, res) => {
    try {
      const ws = req.workspaceId;
      const byStatus = {};
      db.prepare('SELECT status, COUNT(*) c FROM cs_documents WHERE workspace_id = ? GROUP BY status').all(ws).forEach(r => { byStatus[r.status] = r.c; });
      const total = db.prepare('SELECT COUNT(*) c FROM cs_documents WHERE workspace_id = ?').get(ws).c;
      const recent = db.prepare(`SELECT d.*, l.customer_name AS client_name FROM cs_documents d LEFT JOIN leads l ON l.id = d.lead_id WHERE d.workspace_id = ? ORDER BY d.updated_at DESC LIMIT 8`).all(ws)
        .map(d => ({ ...shapeDoc(d), client_name: d.client_name }));
      const activity = db.prepare(`SELECT e.type, e.created_at, e.actor, d.title FROM cs_events e JOIN cs_documents d ON d.id = e.document_id WHERE e.workspace_id = ? ORDER BY e.created_at DESC LIMIT 12`).all(ws);
      // revenue impact = sum of signed/completed document totals
      let revenue = 0;
      db.prepare("SELECT totals FROM cs_documents WHERE workspace_id = ? AND status IN ('signed','completed')").all(ws).forEach(r => { const t = J(r.totals, {}); revenue += Number(t.total || 0); });
      res.json({ total, byStatus, recent, activity, revenue });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Documents ───────────────────────────────────────────────────────────────
  app.get('/api/cs/documents', auth, (req, res) => {
    try {
      const params = [req.workspaceId]; let where = 'd.workspace_id = ?';
      if (req.query.status) { where += ' AND d.status = ?'; params.push(req.query.status); }
      if (req.query.type) { where += ' AND d.type = ?'; params.push(req.query.type); }
      if (req.query.lead_id) { where += ' AND d.lead_id = ?'; params.push(req.query.lead_id); }
      const rows = db.prepare(`SELECT d.*, l.customer_name AS client_name FROM cs_documents d LEFT JOIN leads l ON l.id = d.lead_id WHERE ${where} ORDER BY d.updated_at DESC`).all(...params);
      res.json({ documents: rows.map(d => ({ ...shapeDoc(d), client_name: d.client_name })) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/cs/documents', auth, (req, res) => {
    try {
      const b = req.body || {};
      if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'Title is required' });
      let blocks = Array.isArray(b.blocks) ? b.blocks : [];
      if (b.template_id) { const t = db.prepare('SELECT blocks, type FROM cs_templates WHERE id = ? AND workspace_id = ?').get(b.template_id, req.workspaceId); if (t) blocks = J(t.blocks, []); }
      const id = generateId();
      db.prepare(`INSERT INTO cs_documents (id, workspace_id, lead_id, type, title, blocks, theme, settings, created_by)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
        id, req.workspaceId, b.lead_id || null, b.type || 'contract', String(b.title).slice(0, 200),
        JSON.stringify(blocks), ['monochrome', 'editorial', 'executive'].includes(b.theme) ? b.theme : 'monochrome',
        JSON.stringify(b.settings || {}), req.userId);
      // seed a client signer from the linked lead
      if (b.lead_id) {
        const lead = db.prepare('SELECT customer_name, customer_phone, email FROM leads WHERE id = ? AND workspace_id = ?').get(b.lead_id, req.workspaceId);
        if (lead) db.prepare(`INSERT INTO cs_signers (id, document_id, workspace_id, role, name, email, phone, sign_order) VALUES (?,?,?,'client',?,?,?,0)`)
          .run(generateId(), id, req.workspaceId, lead.customer_name || null, lead.email || null, lead.customer_phone || null);
      }
      const d = db.prepare('SELECT * FROM cs_documents WHERE id = ?').get(id);
      recordEvent(d, 'created', { actor: req.userId });
      logAudit(req.workspaceId, req.userId, 'cs_create', 'cs_document', id, { title: d.title, type: d.type });
      res.json(shapeDoc(d, { withBlocks: true }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/cs/documents/:id', auth, (req, res) => {
    try {
      const d = getDoc(req.workspaceId, req.params.id);
      if (!d) return res.status(404).json({ error: 'Document not found' });
      const signers = db.prepare('SELECT id, role, name, email, phone, sign_order, status, signed_at FROM cs_signers WHERE document_id = ? ORDER BY sign_order').all(d.id);
      const events = db.prepare('SELECT type, actor, ip, created_at, meta FROM cs_events WHERE document_id = ? ORDER BY created_at').all(d.id).map(e => ({ ...e, meta: J(e.meta, {}) }));
      res.json({ ...shapeDoc(d, { withBlocks: true }), signers, events });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/cs/documents/:id', auth, (req, res) => {
    try {
      const d = getDoc(req.workspaceId, req.params.id);
      if (!d) return res.status(404).json({ error: 'Document not found' });
      const b = req.body || {}; const set = {};
      if (b.title !== undefined) set.title = String(b.title).slice(0, 200);
      if (b.type !== undefined) set.type = b.type;
      if (b.blocks !== undefined) set.blocks = JSON.stringify(b.blocks);
      if (b.theme !== undefined && ['monochrome', 'editorial', 'executive'].includes(b.theme)) set.theme = b.theme;
      if (b.settings !== undefined) set.settings = JSON.stringify(b.settings);
      if (b.totals !== undefined) set.totals = JSON.stringify(b.totals);
      if (b.expires_at !== undefined) set.expires_at = b.expires_at;
      const keys = Object.keys(set);
      if (keys.length) db.prepare(`UPDATE cs_documents SET ${keys.map(k => `${k}=@${k}`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run({ ...set, id: d.id });
      res.json(shapeDoc(db.prepare('SELECT * FROM cs_documents WHERE id = ?').get(d.id), { withBlocks: true }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/cs/documents/:id', auth, (req, res) => {
    try {
      const d = getDoc(req.workspaceId, req.params.id);
      if (!d) return res.status(404).json({ error: 'Document not found' });
      db.prepare('DELETE FROM cs_documents WHERE id = ?').run(d.id);
      db.prepare('DELETE FROM cs_signers WHERE document_id = ?').run(d.id);
      db.prepare('DELETE FROM cs_events WHERE document_id = ?').run(d.id);
      db.prepare('DELETE FROM cs_approvals WHERE document_id = ?').run(d.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Templates ───────────────────────────────────────────────────────────────
  app.get('/api/cs/templates', auth, (req, res) => {
    try { res.json({ templates: db.prepare('SELECT id, type, industry, title, created_at FROM cs_templates WHERE workspace_id = ? ORDER BY created_at DESC').all(req.workspaceId) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/api/cs/templates/:id', auth, (req, res) => {
    try { const t = db.prepare('SELECT * FROM cs_templates WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId); if (!t) return res.status(404).json({ error: 'Not found' }); res.json({ ...t, blocks: J(t.blocks, []) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/cs/templates', auth, (req, res) => {
    try {
      if (!req.body.title) return res.status(400).json({ error: 'Title required' });
      const id = generateId();
      db.prepare('INSERT INTO cs_templates (id, workspace_id, type, industry, title, blocks, created_by) VALUES (?,?,?,?,?,?,?)')
        .run(id, req.workspaceId, req.body.type || 'contract', req.body.industry || null, String(req.body.title).slice(0, 200), JSON.stringify(req.body.blocks || []), req.userId);
      res.json(db.prepare('SELECT id, type, industry, title, created_at FROM cs_templates WHERE id = ?').get(id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/cs/templates/:id', auth, (req, res) => {
    try { db.prepare('DELETE FROM cs_templates WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
};
