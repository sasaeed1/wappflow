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

// Verify a Stripe-Signature header (`t=<ts>,v1=<sig>[,v1=...]`) over the RAW body.
// Manual HMAC-SHA256 — this module deliberately has no Stripe SDK. Pure function,
// exported below for the test harness.
function verifyStripeSignature(rawBuf, sigHeader, secret, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret || !sigHeader || !Buffer.isBuffer(rawBuf)) return false;
  const parts = { v1: [] };
  for (const kv of String(sigHeader).split(',')) {
    const i = kv.indexOf('=');
    if (i < 1) continue;
    const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
    if (k === 't') parts.t = v;
    else if (k === 'v1') parts.v1.push(v);
  }
  const ts = Number(parts.t);
  if (!ts || !parts.v1.length) return false;
  if (Math.abs(nowSec - ts) > toleranceSec) return false; // replay window (Stripe default 5 min)
  // signed_payload = `${t}.${raw body bytes}` — feed the Buffer directly to stay byte-exact.
  const expected = crypto.createHmac('sha256', secret).update(parts.t + '.').update(rawBuf).digest();
  return parts.v1.some((v) => {
    try { const got = Buffer.from(v, 'hex'); return got.length === expected.length && crypto.timingSafeEqual(got, expected); }
    catch { return false; }
  });
}

module.exports = function mountPayments(app, db, deps = {}) {
  const {
    auth = (req, res, next) => next(),
    generateId = () => crypto.randomUUID(),
    broadcastToWorkspace = () => {},
    addContactHistory = () => {},
    logAudit = () => {},
    notify = () => {},
    clientBaseUrl = process.env.FRONTEND_URL || '',
  } = deps;

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
  const configured = !!STRIPE_KEY;
  if (configured && !STRIPE_WEBHOOK_SECRET) {
    console.warn('⚠️  Stripe is live (STRIPE_SECRET_KEY set) but STRIPE_WEBHOOK_SECRET is missing — webhooks will be REJECTED until it is set. Payments still settle via manual mark-paid.');
  }

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
    CREATE TABLE IF NOT EXISTS payments_meta (
      key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ── Ledger-truth guards (Foundation Sprint / PROP-001 mark-as-paid) ─────────
  // 1) One PAID ledger row per invoice, hard-enforced. Created BEFORE the backfill so
  //    even the backfill INSERTs are constrained (defense in depth). try/catch: a legacy
  //    duplicate must not abort boot — log loudly for manual cleanup instead.
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_invoice_paid ON payments(workspace_id, kind, ref_id) WHERE status='paid' AND kind='invoice'");
  } catch (e) {
    console.error('⚠️  uq_payments_invoice_paid index creation failed (duplicate paid rows exist? clean up manually):', e.message);
  }

  // 2) One-time backfill: every already-paid invoice gets a synthetic ledger row so the
  //    payments table becomes the complete historical record of cash received. Marker-gated
  //    (runs once) AND NOT-EXISTS-guarded (idempotent regardless). Workspace resolved via
  //    users.workspace_id — the same scalar mapping the auth middleware uses (no join fan-out
  //    possible), falling back to the user's own id exactly like auth does.
  //    Rows are tagged provider_ref='backfill' so finance can exclude them from cash-flow
  //    TIMING analysis (paid_at is best-effort = invoice created_at).
  try {
    const done = db.prepare("SELECT value FROM payments_meta WHERE key='backfill_invoice_payments'").get();
    if (!done) {
      const r = db.prepare(`
        INSERT OR IGNORE INTO payments (id, workspace_id, kind, ref_id, lead_id, amount, currency, currency_symbol,
                                        description, status, provider, provider_ref, created_by, created_at, paid_at)
        SELECT lower(hex(randomblob(16))), COALESCE(u.workspace_id, i.user_id), 'invoice', i.id, i.lead_id, i.total,
               COALESCE(i.currency, 'USD'), COALESCE(i.currency_symbol, '$'),
               'Backfilled: invoice marked paid (pre-ledger)', 'paid', 'manual', 'backfill', i.user_id, i.created_at, i.created_at
        FROM invoices i LEFT JOIN users u ON u.id = i.user_id
        WHERE i.status = 'paid'
          AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.kind='invoice' AND p.ref_id=i.id AND p.status='paid')
      `).run();
      db.prepare("INSERT OR REPLACE INTO payments_meta (key, value) VALUES ('backfill_invoice_payments', ?)").run(String(r.changes));
      if (r.changes) console.log(`💰 payments: backfilled ${r.changes} paid invoice(s) into the ledger (provider_ref='backfill')`);
    }
  } catch (e) { console.error('payments backfill failed (non-fatal):', e.message); }

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
    // Money arriving is the single event a studio owner most wants in the feed,
    // and it was the loudest silence in it: this module was mounted without the
    // notify seam at all, so manual mark-as-paid, Stripe settlement and print
    // orders alike wrote nothing anyone could see later.
    try {
      const who = p.customer_name || p.payer_name || '';
      notify(p.workspace_id, {
        type: 'payment',
        title: `Payment received — ${p.currency_symbol || '$'}${p.amount}`,
        body: who ? `${who} paid for ${p.kind === 'print_order' ? 'a print order' : 'an invoice'}` : `Paid: ${p.kind}`,
        url: p.kind === 'invoice' ? '/invoices' : '/studio/store',
        icon: '💰',
      });
    } catch { /* never block settlement */ }
  }

  // THE one way an invoice becomes paid manually: writes a ledger row (who/when/how), then
  // reuses markPaid→settle to flip the invoice. Idempotent per invoice — pre-check plus the
  // uq_payments_invoice_paid partial UNIQUE index. Shared by the new route AND the legacy
  // PUT /api/invoices/:id delegate in server.js, so no path can bypass the ledger.
  function markPaidByInvoice(invoiceId, { workspaceId, workspaceOwnerId, userId, note } = {}) {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND (workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))').get(invoiceId, workspaceId, workspaceOwnerId);
    if (!invoice) return { error: 'not_found' };
    const existing = db.prepare("SELECT id FROM payments WHERE workspace_id = ? AND kind = 'invoice' AND ref_id = ? AND status = 'paid'").get(workspaceId, invoiceId);
    if (existing) return { ok: true, payment_id: existing.id, already: true };
    const id = generateId();
    db.prepare(`INSERT INTO payments (id, workspace_id, kind, ref_id, lead_id, amount, currency, currency_symbol, description, status, provider, created_by)
                VALUES (?, ?, 'invoice', ?, ?, ?, ?, ?, ?, 'pending', 'manual', ?)`)
      .run(id, workspaceId, invoiceId, invoice.lead_id || null, Number(invoice.total) || 0,
           invoice.currency || 'USD', invoice.currency_symbol || '$',
           note ? `Marked paid manually — ${String(note).slice(0, 300)}` : 'Marked paid manually', userId || null);
    const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    try {
      markPaid(p);
    } catch (e) {
      // Concurrent duplicate hit the partial UNIQUE index → someone else settled it first.
      if (String(e.message).includes('UNIQUE')) {
        db.prepare('DELETE FROM payments WHERE id = ? AND status = ?').run(id, 'pending');
        const winner = db.prepare("SELECT id FROM payments WHERE workspace_id = ? AND kind = 'invoice' AND ref_id = ? AND status = 'paid'").get(workspaceId, invoiceId);
        return { ok: true, payment_id: winner ? winner.id : id, already: true };
      }
      throw e;
    }
    // settle() is best-effort (empty catch) — surface a failed invoice flip instead of masking it.
    const after = db.prepare('SELECT status FROM invoices WHERE id = ?').get(invoiceId);
    const warning = after && after.status !== 'paid' ? 'ledger row written but invoice status did not update — investigate' : undefined;
    try { logAudit(workspaceId, userId, 'invoice_mark_paid', 'invoice', invoiceId, { payment_id: id, note: note || null, warning: warning || null }); } catch {}
    if (warning) console.error(`payments: settle() failed to flip invoice ${invoiceId} to paid (ledger row ${id} exists)`);
    return { ok: true, payment_id: id, warning };
  }

  // ── Mark an INVOICE paid through the ledger (authed) ─────────────────────────
  app.post('/api/payments/invoice/:invoiceId/mark-paid', auth, (req, res) => {
    try {
      const out = markPaidByInvoice(req.params.invoiceId, {
        workspaceId: req.workspaceId, workspaceOwnerId: req.workspaceOwnerId,
        userId: req.userId, note: (req.body || {}).note,
      });
      if (out.error === 'not_found') return res.status(404).json({ error: 'Invoice not found' });
      res.json(out);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Create a payment link (authed) ──────────────────────────────────────────
  // Minting a pay link is not the private business of one authenticated route:
  // a print order placed on a PUBLIC gallery has to raise one too, and it must be
  // the same object - same ledger row, same Stripe path, same public token - or
  // store money would be invisible to the payments screen.
  async function createPaymentLink({ workspaceId, userId, kind, ref_id, lead_id, amount, currency, currency_symbol, description }) {
    const token = crypto.randomBytes(16).toString('hex'); const id = generateId();
    db.prepare(`INSERT INTO payments (id, workspace_id, kind, ref_id, lead_id, amount, currency, currency_symbol, description, provider, public_token, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, workspaceId, kind, ref_id || null, lead_id || null, Number(amount), currency || 'USD', currency_symbol || '$', description || null, configured ? 'stripe' : 'manual', token, userId || null);
    const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    let url = `${clientBaseUrl}/pay/${token}`;
    if (configured) { const sc = await createStripeCheckout(p, token); if (sc) { db.prepare('UPDATE payments SET checkout_url = ?, provider_ref = ? WHERE id = ?').run(sc.url, sc.ref, id); url = sc.url; } }
    return { id, token, url, pay_page: `${clientBaseUrl}/pay/${token}`, provider: configured ? 'stripe' : 'manual' };
  }

  app.post('/api/payments/link', auth, async (req, res) => {
    try {
      const b = req.body || {};
      if (!b.amount || !b.kind) return res.status(400).json({ error: 'amount + kind required' });
      const link = await createPaymentLink({ ...b, workspaceId: req.workspaceId, userId: req.userId });
      res.json({ ok: true, ...link });
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

  // Stripe webhook — signature-verified + idempotent.
  //   · 400 for signature/parse/config failures (Stripe surfaces misconfiguration);
  //   · 200 for accepted, duplicate, and post-verification settlement errors (stops retries).
  // server.js registers a path-scoped express.raw for this route BEFORE the global JSON
  // parser, so req.body is the raw Buffer needed for HMAC verification.
  app.post('/api/payments/webhook', (req, res) => {
    // No secret ⇒ manual-only / pre-launch deployment: Stripe never calls this, so any
    // POST here is a forgery attempt. Settlement still works via the authed mark-paid.
    if (!STRIPE_WEBHOOK_SECRET) return res.status(400).json({ error: 'webhook not configured' });
    if (!Buffer.isBuffer(req.body)) {
      console.error('stripe webhook: req.body is not a raw Buffer — check body-parser order in server.js');
      return res.status(400).json({ error: 'invalid signature' });
    }
    if (!verifyStripeSignature(req.body, req.header('Stripe-Signature'), STRIPE_WEBHOOK_SECRET)) {
      console.warn('stripe webhook: signature verification failed');
      return res.status(400).json({ error: 'invalid signature' });
    }
    let ev;
    try { ev = JSON.parse(req.body.toString('utf8')) || {}; }
    catch { return res.status(400).json({ error: 'invalid payload' }); }

    try {
      if (ev.type === 'checkout.session.completed') {
        // Idempotency: exactly-once per Stripe event id via webhook_events UNIQUE(platform,event_id).
        // Recorded ONLY for handled event types so a future handler for other types isn't
        // pre-marked as processed. id is a generated PK, distinct from the Stripe event id.
        try {
          db.prepare('INSERT INTO webhook_events (id, platform, event_id) VALUES (?, ?, ?)')
            .run(generateId(), 'stripe', String(ev.id || ''));
        } catch (e) {
          if (String(e.message).includes('UNIQUE')) return res.json({ received: true, duplicate: true });
          throw e;
        }
        const sess = ev.data && ev.data.object;
        const pid = sess && sess.client_reference_id;
        const p = pid ? db.prepare('SELECT * FROM payments WHERE id = ?').get(pid) : null;
        if (p && p.status !== 'paid') markPaid(p, sess.id);
      }
      res.json({ received: true });
    } catch (e) { res.status(200).json({ received: true, note: e.message }); }
  });

  // Exposed so server.js's legacy PUT /api/invoices/:id can delegate status='paid'
  // through the same idempotency-guarded ledger path (never a direct status write).
  return { markPaidByInvoice, createPaymentLink };
};

// Exposed for the test harness (pure function; no closure state).
module.exports.verifyStripeSignature = verifyStripeSignature;
