'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · PRINT STORE — sell prints, albums & digitals from delivered work.
 *  Clients order from a public shop tied to their gallery; orders land in the CRM
 *  as a lead + an order record. Owns `ms_print_products` / `ms_print_orders`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');

module.exports = function mountPrintStore(app, db, deps = {}) {
  const {
    auth = (req, res, next) => next(),
    generateId = () => crypto.randomUUID(),
    broadcastToWorkspace = () => {},
    addContactHistory = () => {},
    sendClientMessage = async () => ({ skipped: true }),
    // Injected: an order bills through the same creators as everything else.
    createInvoiceForLead = null,
    createPaymentLink = null,
  } = deps;

  db.exec(`
    CREATE TABLE IF NOT EXISTS ms_print_products (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL,
      name TEXT, kind TEXT DEFAULT 'print', description TEXT,
      options TEXT DEFAULT '[]', active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ms_print_orders (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL,
      gallery_id TEXT, lead_id TEXT, items TEXT DEFAULT '[]',
      total REAL DEFAULT 0, currency_symbol TEXT DEFAULT '$',
      customer_name TEXT, customer_phone TEXT, customer_email TEXT, note TEXT,
      status TEXT DEFAULT 'new', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_print_orders_ws ON ms_print_orders(workspace_id);
  `);
  // Phase 7: an order used to record money it never went on to collect. These say
  // what it became, and stop a retry from billing the customer twice.
  for (const c of ['invoice_id TEXT', 'payment_id TEXT', 'pay_url TEXT']) { try { db.exec(`ALTER TABLE ms_print_orders ADD COLUMN ${c}`); } catch { /* exists */ } }

  const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
  const owner = (ws) => { const r = db.prepare("SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role = 'super_admin' LIMIT 1").get(ws); return r ? r.user_id : null; };
  const brandSym = (ws) => { const o = owner(ws); let name = 'WappFlow', sym = '$'; if (o) { try { const cs = db.prepare('SELECT company_name, currency_symbol FROM company_settings WHERE user_id = ?').get(o); if (cs) { name = cs.company_name || name; sym = cs.currency_symbol || sym; } } catch {} } return { name, sym }; };
  const shape = (p) => ({ ...p, options: J(p.options, []), active: !!p.active });

  // ── Admin: products ─────────────────────────────────────────────────────────
  app.get('/api/store/products', auth, (req, res) => {
    try { res.json({ products: db.prepare('SELECT * FROM ms_print_products WHERE workspace_id = ? ORDER BY sort_order, created_at').all(req.workspaceId).map(shape) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/store/products', auth, (req, res) => {
    try {
      const b = req.body || {}; const id = generateId();
      const order = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 n FROM ms_print_products WHERE workspace_id = ?').get(req.workspaceId).n;
      db.prepare('INSERT INTO ms_print_products (id, workspace_id, name, kind, description, options, active, sort_order) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, req.workspaceId, b.name || 'New product', b.kind || 'print', b.description || null, JSON.stringify(b.options || []), b.active === false ? 0 : 1, order);
      res.json(shape(db.prepare('SELECT * FROM ms_print_products WHERE id = ?').get(id)));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put('/api/store/products/:id', auth, (req, res) => {
    try {
      const p = db.prepare('SELECT * FROM ms_print_products WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!p) return res.status(404).json({ error: 'Not found' });
      const b = req.body || {}; const set = {};
      ['name', 'kind', 'description'].forEach(k => { if (b[k] !== undefined) set[k] = b[k]; });
      if (b.options !== undefined) set.options = JSON.stringify(b.options);
      if (b.active !== undefined) set.active = b.active ? 1 : 0;
      const keys = Object.keys(set);
      if (keys.length) db.prepare(`UPDATE ms_print_products SET ${keys.map(k => `${k}=@${k}`).join(', ')} WHERE id=@id`).run({ ...set, id: p.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/store/products/:id', auth, (req, res) => {
    try { db.prepare('DELETE FROM ms_print_products WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Admin: orders ───────────────────────────────────────────────────────────
  app.get('/api/store/orders', auth, (req, res) => {
    try { res.json({ orders: db.prepare('SELECT * FROM ms_print_orders WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200').all(req.workspaceId).map(o => ({ ...o, items: J(o.items, []) })) }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/store/orders/:id/status', auth, (req, res) => {
    try { db.prepare('UPDATE ms_print_orders SET status = ? WHERE id = ? AND workspace_id = ?').run(String(req.body.status || 'new'), req.params.id, req.workspaceId); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Public shop (tied to a gallery share token) ─────────────────────────────
  app.get('/api/store/public/:token', (req, res) => {
    try {
      const g = db.prepare('SELECT * FROM ms_galleries WHERE share_token = ?').get(req.params.token);
      if (!g) return res.status(404).json({ error: 'Not available' });
      const { name, sym } = brandSym(g.workspace_id);
      const products = db.prepare('SELECT * FROM ms_print_products WHERE workspace_id = ? AND active = 1 ORDER BY sort_order, created_at').all(g.workspace_id).map(shape);
      res.json({ brand: name, currency_symbol: sym, gallery_title: g.title, products });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/store/public/:token', async (req, res) => {
    try {
      const g = db.prepare('SELECT * FROM ms_galleries WHERE share_token = ?').get(req.params.token);
      if (!g) return res.status(404).json({ error: 'Not available' });
      const ws = g.workspace_id; const { sym } = brandSym(ws);
      const { items, name, phone, email, note } = req.body || {};
      if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Your cart is empty' });
      if (!name || !(phone || email)) return res.status(400).json({ error: 'Name and a phone or email are required' });
      // price server-side from the catalog
      let total = 0; const lines = [];
      for (const it of items) {
        const p = db.prepare('SELECT * FROM ms_print_products WHERE id = ? AND workspace_id = ?').get(it.product_id, ws);
        if (!p) continue;
        const opts = J(p.options, []); const opt = opts.find(o => o.label === it.option) || opts[0] || { label: '', price: 0 };
        const qty = Math.max(1, Number(it.qty) || 1); const price = Number(opt.price) || 0;
        total += price * qty; lines.push({ name: p.name, option: opt.label, qty, price });
      }
      if (!lines.length) return res.status(400).json({ error: 'Nothing valid in cart' });
      const ownerId = owner(ws);
      const proj = g.project_id ? db.prepare('SELECT lead_id FROM ms_projects WHERE id = ?').get(g.project_id) : null;
      let leadId = proj && proj.lead_id ? proj.lead_id : null;
      if (!leadId) {
        let lead = phone ? db.prepare('SELECT id FROM leads WHERE workspace_id = ? AND customer_phone = ?').get(ws, phone) : null;
        if (!lead && email) lead = db.prepare('SELECT id FROM leads WHERE workspace_id = ? AND email = ?').get(ws, email);
        if (lead) leadId = lead.id;
        else { leadId = generateId(); db.prepare("INSERT INTO leads (id, user_id, workspace_id, customer_name, customer_phone, email, status, first_message) VALUES (?,?,?,?,?,?,'New',?)").run(leadId, ownerId, ws, name, phone || null, email || null, 'Print order'); }
      }
      const oid = generateId();
      db.prepare('INSERT INTO ms_print_orders (id, workspace_id, gallery_id, lead_id, items, total, currency_symbol, customer_name, customer_phone, customer_email, note) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(oid, ws, g.id, leadId, JSON.stringify(lines), total, sym, name, phone || null, email || null, note || null);
      try { addContactHistory(leadId, ownerId, 'order', `Print order — ${sym}${total} (${lines.length} item${lines.length === 1 ? '' : 's'})`); } catch {}

      // The store priced the order, took the customer's details, and then told them
      // "we'll be in touch" - it never billed anybody. Raise the invoice and a pay
      // link now, through the SAME creators the rest of the app uses, so store money
      // appears on the invoices screen and in the payments ledger like any other.
      let payUrl = null;
      if (createInvoiceForLead && total > 0) {
        try {
          const asOwner = { workspaceId: ws, workspaceOwnerId: ownerId, userId: ownerId, canViewAllLeads: true };
          const invoice = createInvoiceForLead(asOwner, {
            lead_id: leadId, customer_name: name, customer_email: email || null, customer_phone: phone || null,
            items: lines.map((l) => ({ description: [l.name, l.option].filter(Boolean).join(' — '), qty: l.qty, rate: l.price, amount: l.price * l.qty })),
            subtotal: total, tax_rate: 0, tax_amount: 0, discount: 0, total,
            notes: note || null, status: 'sent',
          });
          db.prepare('UPDATE ms_print_orders SET invoice_id = ? WHERE id = ?').run(invoice.id, oid);
          if (createPaymentLink) {
            const link = await createPaymentLink({
              workspaceId: ws, userId: ownerId, kind: 'invoice', ref_id: invoice.id, lead_id: leadId,
              amount: total, currency: invoice.currency, currency_symbol: sym,
              description: `Print order — ${invoice.invoice_number}`,
            });
            payUrl = link.url;
            db.prepare('UPDATE ms_print_orders SET payment_id = ?, pay_url = ? WHERE id = ?').run(link.id, payUrl, oid);
          }
        } catch (e) { console.warn('print order → invoice/payment failed:', e.message); }
      }

      try {
        const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
        const text = payUrl
          ? `🛍️ Thanks for your order (${sym}${total})! Pay securely here: ${payUrl}`
          : `🛍️ Thanks for your order (${sym}${total})! We’ll be in touch to finalize it.`;
        if (lead && lead.customer_phone) await sendClientMessage({ lead, userId: ownerId, text });
      } catch {}
      broadcastToWorkspace(ws, 'print_order_created', { id: oid, lead_id: leadId });
      res.json({ ok: true, total, currency_symbol: sym, pay_url: payUrl });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};
