'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  COMMAND CENTER — MANUAL BILLING (PROP-005 §E, owner decision 2026-10-02)
//
//  How customers pay WappFlow, until a gateway is connected: the founder records
//  it. Two tables:
//    cc_subscriptions   one row per workspace — plan, price, interval, status, period
//    cc_billing_ledger  every money movement — charge · payment · credit · refund · adjustment
//
//  Balance owed = charges + refunds − payments − credits (± adjustments, signed).
//  Real MRR = active + past_due subscriptions, normalised to a month. Paused,
//  cancelled and comped subscriptions don't count.
//
//  A daily job renews due periods (adds the period's charge, advances the dates),
//  flags subscriptions unpaid for 7+ days as past_due and drops a Founder Inbox
//  item, and flips past_due back to active once the balance is cleared.
//  Stripe can later write the same ledger rows (method = 'stripe').
// ════════════════════════════════════════════════════════════════════════════

const STATUSES = ['active', 'trialing', 'past_due', 'paused', 'cancelled', 'comped'];
const KINDS = ['charge', 'payment', 'credit', 'refund', 'adjustment'];
const INTERVALS = ['month', 'year'];
const OVERDUE_DAYS = 7;

module.exports = function mountBilling(app, deps) {
  const { db, platformAuth, requirePerm, requireElevated, ccAudit, emit, rid, safeAll, entitlements, broadcastToWorkspace } = deps;

  db.exec(`
    CREATE TABLE IF NOT EXISTS cc_subscriptions (
      id TEXT PRIMARY KEY, workspace_id TEXT UNIQUE, plan TEXT, amount REAL DEFAULT 0, currency TEXT DEFAULT 'USD',
      interval TEXT DEFAULT 'month', status TEXT DEFAULT 'active', is_founding INTEGER DEFAULT 0,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, current_period_start TIMESTAMP, current_period_end TIMESTAMP,
      cancelled_at TIMESTAMP, notes TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cc_billing_ledger (
      id TEXT PRIMARY KEY, workspace_id TEXT, kind TEXT, amount REAL, currency TEXT DEFAULT 'USD',
      description TEXT, method TEXT, reference TEXT, period_start TIMESTAMP, period_end TIMESTAMP,
      admin_id TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_cc_ledger_ws ON cc_billing_ledger(workspace_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_cc_subs_status ON cc_subscriptions(status);
  `);

  const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const monthly = (s) => (s.interval === 'year' ? (s.amount || 0) / 12 : (s.amount || 0));
  const iso = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
  const addPeriod = (from, interval) => { const d = new Date(from); if (interval === 'year') d.setUTCFullYear(d.getUTCFullYear() + 1); else d.setUTCMonth(d.getUTCMonth() + 1); return d; };
  const parse = (v) => new Date(String(v).replace(' ', 'T') + (/[zZ]$/.test(String(v)) ? '' : 'Z'));

  function balanceOf(ws) {
    const r = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN kind IN ('charge','refund') THEN amount WHEN kind IN ('payment','credit') THEN -amount WHEN kind = 'adjustment' THEN amount ELSE 0 END),0) AS bal
      FROM cc_billing_ledger WHERE workspace_id = ?`).get(ws);
    return money(r?.bal);
  }
  function planPrice(plan) {
    try {
      const p = db.prepare("SELECT amount FROM plan_prices WHERE plan_key = ? AND COALESCE(is_founding,0) = 0 AND COALESCE(active,1) = 1 ORDER BY amount LIMIT 1").get(plan);
      if (p) return p.amount;
    } catch {}
    return entitlements.PLAN_MONTHLY_PRICE[plan] ?? 0;
  }
  function addEntry(ws, e, adminId) {
    const id = rid();
    db.prepare(`INSERT INTO cc_billing_ledger (id, workspace_id, kind, amount, currency, description, method, reference, period_start, period_end, admin_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, ws, e.kind, money(e.amount), e.currency || 'USD', e.description || null,
      e.method || null, e.reference || null, e.period_start || null, e.period_end || null, adminId || null);
    return id;
  }
  const subOf = (ws) => db.prepare('SELECT * FROM cc_subscriptions WHERE workspace_id = ?').get(ws);

  // ── Overview (feeds the Billing page + the Overview's real MRR) ─────────────
  function overview() {
    const subs = safeAll('SELECT * FROM cc_subscriptions');
    const counting = subs.filter((s) => s.status === 'active' || s.status === 'past_due');
    const mrr = money(counting.reduce((t, s) => t + monthly(s), 0));
    const byStatus = STATUSES.map((st) => ({ status: st, count: subs.filter((s) => s.status === st).length })).filter((x) => x.count);
    const outstanding = safeAll(`SELECT l.workspace_id, w.name,
        SUM(CASE WHEN l.kind IN ('charge','refund') THEN l.amount WHEN l.kind IN ('payment','credit') THEN -l.amount WHEN l.kind='adjustment' THEN l.amount ELSE 0 END) AS balance
      FROM cc_billing_ledger l LEFT JOIN workspaces w ON w.id = l.workspace_id GROUP BY l.workspace_id HAVING balance > 0.004 ORDER BY balance DESC`);
    const collected30 = money(db.prepare("SELECT COALESCE(SUM(amount),0) AS c FROM cc_billing_ledger WHERE kind = 'payment' AND created_at >= datetime('now','-30 days')").get().c
      - db.prepare("SELECT COALESCE(SUM(amount),0) AS c FROM cc_billing_ledger WHERE kind = 'refund' AND created_at >= datetime('now','-30 days')").get().c);
    const renewals = safeAll(`SELECT s.*, w.name FROM cc_subscriptions s LEFT JOIN workspaces w ON w.id = s.workspace_id
      WHERE s.status IN ('active','past_due','trialing') AND s.current_period_end IS NOT NULL
      AND datetime(s.current_period_end) <= datetime('now','+14 days') ORDER BY datetime(s.current_period_end)`);
    const unbilled = db.prepare(`SELECT COUNT(*) AS c FROM workspaces w WHERE NOT EXISTS (SELECT 1 FROM cc_subscriptions s WHERE s.workspace_id = w.id)`).get().c;
    return {
      currency: 'USD', mrr, arr: money(mrr * 12), paying: counting.length, by_status: byStatus,
      outstanding_total: money(outstanding.reduce((t, r) => t + r.balance, 0)), outstanding: outstanding.map((r) => ({ ...r, balance: money(r.balance) })),
      collected_30d: collected30, renewals, workspaces_without_subscription: unbilled,
    };
  }
  app.get('/api/cc/billing/overview', platformAuth, requirePerm('manage_billing'), (req, res) => {
    try { res.json(overview()); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/cc/billing/subscriptions', platformAuth, requirePerm('manage_billing'), (req, res) => {
    try {
      const st = STATUSES.includes(req.query.status) ? req.query.status : null;
      const rows = safeAll(`SELECT s.*, w.name AS workspace_name, u.email AS owner_email FROM cc_subscriptions s
        LEFT JOIN workspaces w ON w.id = s.workspace_id LEFT JOIN users u ON u.id = w.owner_id
        ${st ? 'WHERE s.status = ?' : ''} ORDER BY w.name`, ...(st ? [st] : [])).map((s) => ({ ...s, balance: balanceOf(s.workspace_id), mrr: money(monthly(s)) }));
      res.json({ subscriptions: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/cc/workspaces/:id/billing', platformAuth, requirePerm('manage_billing'), (req, res) => {
    try {
      const ws = req.params.id;
      const plan = db.prepare('SELECT plan FROM workspace_plan WHERE workspace_id = ?').get(ws)?.plan || entitlements.DEFAULT_PLAN;
      res.json({
        subscription: subOf(ws) || null,
        suggested: { plan, amount: planPrice(plan), currency: 'USD', interval: 'month' },
        ledger: safeAll(`SELECT l.*, a.email AS admin_email FROM cc_billing_ledger l LEFT JOIN cc_admins a ON a.id = l.admin_id
          WHERE l.workspace_id = ? ORDER BY l.created_at DESC LIMIT 200`, ws),
        balance: balanceOf(ws),
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Create or update the subscription. `charge_now` bills the first period immediately.
  app.put('/api/cc/workspaces/:id/subscription', platformAuth, requirePerm('manage_billing'), (req, res) => {
    try {
      const ws = req.params.id;
      if (!db.prepare('SELECT id FROM workspaces WHERE id = ?').get(ws)) return res.status(404).json({ error: 'Workspace not found' });
      const b = req.body || {};
      const before = subOf(ws) || null;
      const plan = String(b.plan || before?.plan || entitlements.DEFAULT_PLAN);
      if (!db.prepare('SELECT key FROM plans WHERE key = ?').get(plan)) return res.status(400).json({ error: 'Unknown plan' });
      const amount = b.amount != null ? money(b.amount) : (before?.amount ?? planPrice(plan));
      if (!(amount >= 0)) return res.status(400).json({ error: 'Price must be zero or more' });
      const interval = INTERVALS.includes(b.interval) ? b.interval : (before?.interval || 'month');
      const status = STATUSES.includes(b.status) ? b.status : (before?.status || 'active');
      const start = b.current_period_start ? new Date(b.current_period_start) : (before?.current_period_start ? parse(before.current_period_start) : new Date());
      const end = b.current_period_end ? new Date(b.current_period_end) : (before?.current_period_end ? parse(before.current_period_end) : addPeriod(start, interval));
      if (isNaN(start) || isNaN(end) || end <= start) return res.status(400).json({ error: 'The period end must be after its start' });
      db.transaction(() => {
        if (before) {
          db.prepare(`UPDATE cc_subscriptions SET plan=?, amount=?, interval=?, status=?, is_founding=?, current_period_start=?, current_period_end=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE workspace_id=?`)
            .run(plan, amount, interval, status, b.is_founding ? 1 : (before.is_founding || 0), iso(start), iso(end), b.notes ?? before.notes ?? null, ws);
        } else {
          db.prepare(`INSERT INTO cc_subscriptions (id, workspace_id, plan, amount, currency, interval, status, is_founding, current_period_start, current_period_end, notes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(rid(), ws, plan, amount, 'USD', interval, status, b.is_founding ? 1 : 0, iso(start), iso(end), b.notes || null);
        }
        if (b.charge_now && amount > 0 && status !== 'comped') {
          addEntry(ws, { kind: 'charge', amount, description: `${plan} · ${interval}ly subscription`, period_start: iso(start), period_end: iso(end) }, req.admin.id);
        }
        // Keep the plan the product enforces in step with what is billed, when asked.
        if (b.apply_plan) {
          db.prepare(`INSERT INTO workspace_plan (workspace_id, plan) VALUES (?, ?) ON CONFLICT(workspace_id) DO UPDATE SET plan = excluded.plan, updated_at = CURRENT_TIMESTAMP`).run(ws, plan);
          entitlements.invalidate(ws);
          try { broadcastToWorkspace(ws, 'plan_updated', {}); } catch {}
        }
      })();
      const after = subOf(ws);
      ccAudit(req, { action: before ? 'subscription_update' : 'subscription_create', target_type: 'workspace', target_id: ws, workspace_id: ws, before, after });
      emit({ workspace_id: ws, actor_id: req.admin.id, type: before ? 'subscription_updated' : 'subscription_created', entity_type: 'subscription', entity_id: after.id, payload: { plan, amount, interval, status } });
      res.json({ ok: true, subscription: after, balance: balanceOf(ws) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Record money: payment received, credit, charge, adjustment. Refunds need step-up.
  app.post('/api/cc/workspaces/:id/billing/entries', platformAuth, requirePerm('manage_billing'), (req, res, next) => {
    if (req.body?.kind === 'refund' && !req.elevated) return res.status(403).json({ error: 'Confirm it’s you to record a refund', need_step_up: true });
    next();
  }, (req, res) => {
    try {
      const ws = req.params.id;
      const b = req.body || {};
      if (!KINDS.includes(b.kind)) return res.status(400).json({ error: 'Unknown entry type' });
      const amount = money(b.amount);
      if (b.kind !== 'adjustment' && !(amount > 0)) return res.status(400).json({ error: 'Enter an amount above zero' });
      if (b.kind === 'adjustment' && !amount) return res.status(400).json({ error: 'Enter a non-zero adjustment' });
      const id = addEntry(ws, { ...b, amount }, req.admin.id);
      // Clearing the balance takes a past_due subscription back to active.
      const bal = balanceOf(ws);
      const sub = subOf(ws);
      if (sub && sub.status === 'past_due' && bal <= 0) {
        db.prepare("UPDATE cc_subscriptions SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?").run(ws);
        db.prepare("UPDATE cc_inbox SET status = 'resolved' WHERE kind = 'billing_overdue' AND workspace_id = ? AND status = 'open'").run(ws);
      }
      ccAudit(req, { action: `billing_${b.kind}`, target_type: 'workspace', target_id: ws, workspace_id: ws, after: { amount, method: b.method, reference: b.reference, description: b.description } });
      emit({ workspace_id: ws, actor_id: req.admin.id, type: `billing_${b.kind}`, entity_type: 'ledger', entity_id: id, payload: { amount } });
      res.json({ ok: true, id, balance: bal });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // pause · resume · cancel · comp · renew (bill the next period now)
  app.post('/api/cc/workspaces/:id/subscription/:action', platformAuth, requirePerm('manage_billing'), (req, res) => {
    try {
      const ws = req.params.id, action = req.params.action;
      const sub = subOf(ws);
      if (!sub) return res.status(404).json({ error: 'No subscription yet — create one first' });
      const next = { pause: 'paused', resume: 'active', cancel: 'cancelled', comp: 'comped' }[action];
      if (action === 'renew') {
        const start = sub.current_period_end ? parse(sub.current_period_end) : new Date();
        const end = addPeriod(start, sub.interval);
        db.transaction(() => {
          if (sub.amount > 0 && sub.status !== 'comped') addEntry(ws, { kind: 'charge', amount: sub.amount, description: `${sub.plan} · ${sub.interval}ly renewal`, period_start: iso(start), period_end: iso(end) }, req.admin.id);
          db.prepare('UPDATE cc_subscriptions SET current_period_start = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?').run(iso(start), iso(end), ws);
        })();
      } else if (next) {
        db.prepare(`UPDATE cc_subscriptions SET status = ?, cancelled_at = ${next === 'cancelled' ? 'CURRENT_TIMESTAMP' : 'cancelled_at'}, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?`).run(next, ws);
      } else return res.status(400).json({ error: 'Unknown action' });
      ccAudit(req, { action: `subscription_${action}`, target_type: 'workspace', target_id: ws, workspace_id: ws, before: sub, after: subOf(ws), reason: req.body?.reason || null });
      emit({ workspace_id: ws, actor_id: req.admin.id, type: `subscription_${action}`, entity_type: 'subscription', entity_id: sub.id });
      res.json({ ok: true, subscription: subOf(ws), balance: balanceOf(ws) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── Daily: renew due periods, mark overdue, raise inbox items ───────────────
  function runDaily() {
    let renewed = 0, overdue = 0;
    const now = new Date();
    for (const s of safeAll("SELECT * FROM cc_subscriptions WHERE status IN ('active','past_due','trialing') AND current_period_end IS NOT NULL")) {
      let end = parse(s.current_period_end);
      let guard = 0;
      while (end <= now && guard++ < 24) { // catch up after downtime, bounded
        const start = end, nextEnd = addPeriod(start, s.interval);
        if (s.status !== 'trialing' && s.amount > 0) addEntry(s.workspace_id, { kind: 'charge', amount: s.amount, description: `${s.plan} · ${s.interval}ly renewal`, period_start: iso(start), period_end: iso(nextEnd) }, null);
        db.prepare("UPDATE cc_subscriptions SET current_period_start = ?, current_period_end = ?, status = CASE WHEN status = 'trialing' THEN 'active' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .run(iso(start), iso(nextEnd), s.id);
        end = nextEnd; renewed++;
      }
    }
    // Overdue: a positive balance whose oldest unpaid charge is older than OVERDUE_DAYS.
    for (const s of safeAll("SELECT s.*, w.name FROM cc_subscriptions s LEFT JOIN workspaces w ON w.id = s.workspace_id WHERE s.status = 'active'")) {
      const bal = balanceOf(s.workspace_id);
      if (bal <= 0) continue;
      const oldest = db.prepare(`SELECT MIN(created_at) AS t FROM cc_billing_ledger WHERE workspace_id = ? AND kind = 'charge'
        AND created_at >= COALESCE((SELECT MAX(created_at) FROM cc_billing_ledger WHERE workspace_id = ? AND kind IN ('payment','credit')), '0000')`).get(s.workspace_id, s.workspace_id)?.t;
      if (!oldest || (now - parse(oldest)) / 86400000 < OVERDUE_DAYS) continue;
      db.prepare("UPDATE cc_subscriptions SET status = 'past_due', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(s.id);
      db.prepare(`INSERT INTO cc_inbox (id, kind, workspace_id, severity, title, body, link) VALUES (?,?,?,?,?,?,?)`)
        .run(rid(), 'billing_overdue', s.workspace_id, 'high', `${s.name || 'A customer'} is overdue — $${bal.toFixed(2)}`,
          `Unpaid for more than ${OVERDUE_DAYS} days. Record the payment, give a grace period, or contact them.`, `/control/customers/${s.workspace_id}?tab=billing`);
      overdue++;
    }
    return { renewed, overdue };
  }
  app.post('/api/cc/billing/run', platformAuth, requirePerm('manage_billing'), (req, res) => {
    try { const r = runDaily(); ccAudit(req, { action: 'billing_run', target_type: 'system', target_id: 'billing', after: r }); res.json({ ok: true, ...r }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  return { overview, runDaily, balanceOf };
};
