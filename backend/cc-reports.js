// ════════════════════════════════════════════════════════════════════════════
//  COMMAND CENTER — REPORT ENGINE (spec §24).
//  A report definition JSON = { dataset:'customers'|'health'|'audit'|'ai_usage', filters:{} }.
//  Saved reports live in cc_reports. A report can be run on demand (CSV/email) or on a
//  schedule (none|daily|weekly|monthly) which a daily cron drives via the exported runDue().
//
//  Mirrors command-center.js GET /api/cc/export dataset queries (capped 10000) so the CSV
//  a report produces matches the on-demand export exactly.
// ════════════════════════════════════════════════════════════════════════════

module.exports = function(app, deps) {
  const { db, platformAuth, requirePerm, ccAudit, emit, rid, safeAll, safeCount, broadcastToWorkspace, sendEmail, entitlements } = deps;

  // ── RFC-4180 CSV serializer (local) ────────────────────────────────────────
  // Quote any value containing comma / double-quote / CR / LF; escape inner quotes
  // by doubling them. Header row is the union of keys from the first row.
  function toCSV(rows) {
    if (!rows || !rows.length) return '';
    const cols = Object.keys(rows[0]);
    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
  }

  // ── datasetRows — reproduces the GET /api/cc/export queries (capped 10000). ──
  // filters mirror the export endpoint's query params (customers: q/plan/status).
  function datasetRows(dataset, filters = {}) {
    const f = filters || {};
    if (dataset === 'customers') {
      const where = [], params = [];
      if (f.q) { where.push('(w.name LIKE ? OR u.email LIKE ? OR u.business_name LIKE ?)'); params.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`); }
      if (f.plan) { where.push("COALESCE(wp.plan,'free') = ?"); params.push(f.plan); }
      if (f.status) { where.push("COALESCE(w.status,'active') = ?"); params.push(f.status); }
      const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
      return safeAll(`SELECT w.id, w.name, u.email AS owner_email, u.business_name AS owner_name,
        COALESCE(wp.plan,'free') AS plan, COALESCE(w.status,'active') AS status,
        (SELECT COUNT(*) FROM workspace_members m WHERE m.workspace_id = w.id) AS users,
        (SELECT COUNT(*) FROM leads l WHERE l.workspace_id = w.id AND (l.is_deleted = 0 OR l.is_deleted IS NULL)) AS leads,
        (SELECT COALESCE(SUM(a.size_bytes),0) FROM ms_assets a WHERE a.workspace_id = w.id) AS storage_bytes,
        (SELECT MAX(l.last_contacted_at) FROM leads l WHERE l.workspace_id = w.id) AS last_active
        FROM workspaces w LEFT JOIN users u ON u.id = w.owner_id LEFT JOIN workspace_plan wp ON wp.workspace_id = w.id
        ${whereSql} ORDER BY w.name LIMIT 10000`, ...params);
    } else if (dataset === 'health') {
      return safeAll(`SELECT w.id, w.name, COALESCE(wp.plan,'free') AS plan, COALESCE(w.status,'active') AS status,
        s.health, s.churn, s.expansion, s.activity, s.risk_factors
        FROM workspaces w LEFT JOIN workspace_plan wp ON wp.workspace_id = w.id LEFT JOIN workspace_scores s ON s.workspace_id = w.id
        ORDER BY (s.churn IS NULL), s.churn DESC LIMIT 10000`)
        .map((r) => ({ ...r, risk_factors: (() => { try { return JSON.parse(r.risk_factors || '[]').join('; '); } catch { return ''; } })() }));
    } else if (dataset === 'audit') {
      return safeAll('SELECT a.created_at, ad.email AS admin_email, a.action, a.target_type, a.target_id, a.workspace_id, a.reason, a.ip FROM cc_audit a LEFT JOIN cc_admins ad ON ad.id = a.admin_id ORDER BY a.created_at DESC LIMIT 10000');
    } else if (dataset === 'ai_usage') {
      return safeAll('SELECT ts, workspace_id, feature, provider, model, prompt_tokens, completion_tokens, latency_ms, est_cost, success FROM ai_usage ORDER BY ts DESC LIMIT 10000');
    }
    return [];
  }

  // ── Run a report row: load rows, stamp last_run_at, audit, optionally email. ─
  // `req` may be null (cron path) — ccAudit tolerates a null admin/headers.
  function runReport(report, req) {
    let def = {};
    try { def = report.definition ? JSON.parse(report.definition) : {}; } catch { def = {}; }
    let recipients = [];
    try { recipients = report.recipients ? JSON.parse(report.recipients) : []; } catch { recipients = []; }
    if (!Array.isArray(recipients)) recipients = recipients ? [recipients] : [];

    const rows = datasetRows(def.dataset, def.filters || {});
    try { db.prepare('UPDATE cc_reports SET last_run_at = CURRENT_TIMESTAMP WHERE id = ?').run(report.id); } catch {}

    let emailed = false;
    if (recipients.length && typeof sendEmail === 'function') {
      try {
        // SMTP seam: sendEmail wants a workspace owner for the from-identity. Use any
        // super_admin member as the platform sender.
        const sa = db.prepare("SELECT user_id FROM workspace_members WHERE role = 'super_admin' LIMIT 1").get();
        sendEmail({
          workspaceOwnerId: sa?.user_id || null,
          to: recipients.join(','),
          subject: report.name,
          text: toCSV(rows).slice(0, 100000),
        });
        emailed = true;
      } catch (e) { /* skip on SMTP failure — the run itself still succeeded */ }
    }

    try {
      ccAudit(req || {}, { action: 'report_run', target_type: 'report', target_id: report.id, after: { count: rows.length, emailed } });
    } catch {}
    try { emit({ actor_id: req?.admin?.id || null, type: 'report_run', entity_type: 'report', entity_id: report.id, payload: { count: rows.length, emailed } }); } catch {}

    return { count: rows.length, emailed };
  }

  // ── GET /api/cc/reports — list saved reports (parsed JSON). ──────────────────
  app.get('/api/cc/reports', platformAuth, (req, res) => {
    try {
      const rows = safeAll('SELECT * FROM cc_reports ORDER BY created_at DESC').map((r) => ({
        ...r,
        definition: (() => { try { return r.definition ? JSON.parse(r.definition) : {}; } catch { return {}; } })(),
        recipients: (() => { try { return r.recipients ? JSON.parse(r.recipients) : []; } catch { return []; } })(),
      }));
      res.json({ reports: rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── POST /api/cc/reports — create a saved report. ───────────────────────────
  app.post('/api/cc/reports', platformAuth, requirePerm('manage_support'), (req, res) => {
    try {
      const { name, definition, schedule = 'none', recipients = [] } = req.body || {};
      if (!name) return res.status(400).json({ error: 'name required' });
      const validDatasets = ['customers', 'health', 'audit', 'ai_usage'];
      const def = (definition && typeof definition === 'object') ? definition : {};
      if (!validDatasets.includes(def.dataset)) return res.status(400).json({ error: 'definition.dataset must be one of: ' + validDatasets.join(', ') });
      const validSchedules = ['none', 'daily', 'weekly', 'monthly'];
      const sched = validSchedules.includes(schedule) ? schedule : 'none';
      const recip = Array.isArray(recipients) ? recipients.filter(Boolean) : (recipients ? [recipients] : []);
      const id = rid();
      db.prepare('INSERT INTO cc_reports (id, name, definition, schedule, recipients, created_by) VALUES (?,?,?,?,?,?)')
        .run(id, String(name), JSON.stringify(def), sched, JSON.stringify(recip), req.admin.id);
      ccAudit(req, { action: 'report_create', target_type: 'report', target_id: id, after: { name, dataset: def.dataset, schedule: sched, recipients: recip } });
      emit({ actor_id: req.admin.id, type: 'report_created', entity_type: 'report', entity_id: id });
      res.json({ ok: true, id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── DELETE /api/cc/reports/:id — remove a saved report. ─────────────────────
  app.delete('/api/cc/reports/:id', platformAuth, requirePerm('manage_support'), (req, res) => {
    try {
      const before = db.prepare('SELECT * FROM cc_reports WHERE id = ?').get(req.params.id);
      if (!before) return res.status(404).json({ error: 'Not found' });
      db.prepare('DELETE FROM cc_reports WHERE id = ?').run(req.params.id);
      ccAudit(req, { action: 'report_delete', target_type: 'report', target_id: req.params.id, before: { name: before.name } });
      emit({ actor_id: req.admin.id, type: 'report_deleted', entity_type: 'report', entity_id: req.params.id });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── POST /api/cc/reports/:id/run — run a report now. ────────────────────────
  app.post('/api/cc/reports/:id/run', platformAuth, (req, res) => {
    try {
      const report = db.prepare('SELECT * FROM cc_reports WHERE id = ?').get(req.params.id);
      if (!report) return res.status(404).json({ error: 'Not found' });
      const out = runReport(report, req);
      res.json(out);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── runDue() — find scheduled reports that are due and run+email each. ───────
  // Called by a daily cron the orchestrator wires. Thresholds give a little slack so a
  // once-a-day cron never skips a daily report due to drift (daily ~20h, weekly ~6.5d,
  // monthly ~27d). last_run_at NULL = never run = always due.
  function runDue() {
    const now = Date.now();
    const thresholds = { daily: 20 * 3600e3, weekly: 6.5 * 86400e3, monthly: 27 * 86400e3 };
    const reports = safeAll("SELECT * FROM cc_reports WHERE schedule IS NOT NULL AND schedule != 'none'");
    let ran = 0;
    for (const report of reports) {
      const window = thresholds[report.schedule];
      if (!window) continue; // unknown schedule value
      let due = true;
      if (report.last_run_at) {
        // last_run_at is stored UTC (CURRENT_TIMESTAMP "YYYY-MM-DD HH:MM:SS"); append Z.
        const last = new Date(String(report.last_run_at).replace(' ', 'T') + 'Z').getTime();
        if (Number.isFinite(last)) due = (now - last) >= window;
      }
      if (!due) continue;
      try { runReport(report, null); ran++; } catch (e) { console.error('runDue report', report.id, e.message); }
    }
    return ran;
  }

  return { runDue };
};
