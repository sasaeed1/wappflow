'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · PAYMENTS — one money rail for invoices, contract deposits, print
 *  orders and booking deposits. Provider-agnostic seam:
 *    • If STRIPE_SECRET_KEY is set → creates a Stripe Checkout/Payment Link.
 *    • Otherwise → a manual payment record the studio marks paid (works today).
 *  On "paid", the linked entity is updated (invoice→paid, print order→paid, …).
 *  Owns `payments`. Reads/updates core tables it’s told about; never blocks the app.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');

module.exports = function mountPayments(app, db, deps = {}) {
  const {
    auth = (req, res, next) => next(),
    generateId = () => crypto.randomUUID(),
    broadcastToWorkspace = () => {},
    addContactHistory = () => {},
    clientBaseUrl = process.env.FRONTEND_URL || '',
  } = deps;

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
  const configured = !!STRIPE_KEY;

  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL,
      kind TEXT, ref_id TEXT,            -- invoice|contract_deposit|print_order|booking + the entity id
      lead_id TEXT, amount REAL, currency TEXT DEFAULT 'USD', currency_symbol TEXT DEFAULT '$',
      description TEXT, status TEXT DEFAULT 'pending',  -- pending|paid|failed|refunded
      provider TEXT DEFAULT 'manual', provider_ref TEXT, checkout_url TEXT,
      public_token TEXT UNIQUE, created_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, paid_at TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_payments_ws ON payments(workspace_id);
  `);

  // Stripe via REST (no SDK dependency). Returns a hosted checkout URL or null.
  async function createStripeCheckout(p, token) {
    if (!configured) return null;
    try {
      const params = new URLSearchParams();
      params.append('mode', 'payment');
      params.append('success_url', `${clientBaseUrl}/pay/${token}?status=success`);
      params.append('cancel_url', `${clientBaseUrl}/pay/${token}?status=cancelled`);
      params.append('client_reference_id', p.id);
      params.append('line_items[0][quantity]', '1');
      params.append('line_items[0][price_data][currency]', (p.currency || 'USD').toLowerCase());
      params.append('line_items[0][price_data][unit_amount]', String(Math.round((Number(p.amount) || 0) * 100)));
      params.append('line_items[0][price_data][product_data][name]', p.description || 'Payment');
      const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST', headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ? data.error.message : 'stripe error');
      return { url: data.url, ref: data.id };
    } catch (e) { console.error('stripe checkout:', e.message); return null; }
  }

  // Apply the consequence of a successful payment to the linked entity.
  function settle(p) {
    try {
      if (p.kind === 'invoice') db.prepare("UPDATE invoices SET status = 'paid' WHERE id = ?").run(p.ref_id);
      else if (p.kind === 'print_order') db.prepare("UPDATE ms_print_orders SET status = 'paid' WHERE id = ?").run(p.ref_id);
      if (p.lead_id) addContactHistory(p.lead_id, p.created_by, 'payment', `Payment received: ${p.currency_symbol || '$'}${p.amount} (${p.kind})`);
    } catch { /* settlement best-effort */ }
  }
  function markPaid(p, providerRef) {
    db.prepare("UPDATE payments SET status = 'paid', provider_ref = COALESCE(?, provider_ref), paid_at = CURRENT_TIMESTAMP WHERE id = ?").run(providerRef || null, p.id);
    settle(p);
    broadcastToWorkspace(p.workspace_id, 'payment_paid', { id: p.id, kind: p.kind, ref_id: p.ref_id });
  }

  // ── Create a payment link (authed) ──────────────────────────────────────────
  app.post('/api/payments/link', auth, async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.amount || !b.kind) return res.status(400).json({ error: 'amount + kind required' });
      const token = crypto.randomBytes(16).toString('hex'); const id = generateId();
      db.prepare(`INSERT INTO payments (id, workspace_id, kind, ref_id, lead_id, amount, currency, currency_symbol, description, provider, public_token, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, req.workspaceId, b.kind, b.ref_id || null, b.lead_id || null, Number(b.amount), b.currency || 'USD', b.currency_symbol || '$', b.description || null, configured ? 'stripe' : 'manual', token, req.userId);
      const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
      let url = `${clientBaseUrl}/pay/${token}`;
      if (configured) { const sc = await createStripeCheckout(p, token); if (sc) { db.prepare('UPDATE payments SET checkout_url = ?, provider_ref = ? WHERE id = ?').run(sc.url, sc.ref, id); url = sc.url; } }
      res.json({ ok: true, id, token, url, pay_page: `${clientBaseUrl}/pay/${token}`, provider: configured ? 'stripe' : 'manual' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/payments', auth, (req, res) => {
    try { res.json({ payments: db.prepare('SELECT * FROM payments WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200').all(req.workspaceId), provider: configured ? 'stripe' : 'manual' }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Studio marks a manual payment paid (also a fallback for any provider).
  app.post('/api/payments/:id/mark-paid', auth, (req, res) => {
    try {
      const p = db.prepare('SELECT * FROM payments WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
      if (!p) return res.status(404).json({ error: 'Not found' });
      markPaid(p); res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Public pay page data ────────────────────────────────────────────────────
  app.get('/api/payments/public/:token', (req, res) => {
    try {
      const p = db.prepare('SELECT amount, currency, currency_symbol, description, status, provider, checkout_url FROM payments WHERE public_token = ?').get(req.params.token);
      if (!p) return res.status(404).json({ error: 'Not found' });
      res.json(p);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Stripe webhook (best-effort: marks the referenced payment paid on completion).
  // NOTE: production should verify Stripe-Signature against STRIPE_WEBHOOK_SECRET
  // using the raw body; wire that when enabling Stripe.
  app.post('/api/payments/webhook', (req, res) => {
    try {
      const ev = req.body || {};
      if (ev.type === 'checkout.session.completed') {
        const sess = ev.data && ev.data.object;
        const pid = sess && sess.client_reference_id;
        const p = pid ? db.prepare('SELECT * FROM payments WHERE id = ?').get(pid) : null;
        if (p && p.status !== 'paid') markPaid(p, sess.id);
      }
      res.json({ received: true });
    } catch (e) { res.status(200).json({ received: true, note: e.message }); }
  });
};
