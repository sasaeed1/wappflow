// ════════════════════════════════════════════════════════════════════════════
//  TIME MACHINE (spec §26) — best-effort historical reconstruction.
//
//  We never stored point-in-time snapshots of a workspace; instead we reconstruct
//  state by replaying the two append-only spines we DO keep — platform_events and
//  cc_audit — backwards from the *current* row. This is explicitly best-effort: a
//  field can only be rolled back to a value we happened to capture in an audit
//  `before` snapshot. Coverage (and therefore fidelity) improves as more mutating
//  actions write rich before/after via ccAudit. The UI says so loudly.
//
//  Sub-module shape: module.exports = function(app, deps) { ...; return {}; }
// ════════════════════════════════════════════════════════════════════════════

module.exports = function (app, deps) {
  const { db, platformAuth, ccAudit, safeAll } = deps;

  // Robust JSON parse — audit/event payloads are stored as TEXT (or already null).
  const parse = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return null; }
  };

  // Which audit actions carry a rollback-able `before` snapshot, and the field they
  // touch on the reconstructed {status, plan} object. Keep additive — unknown
  // actions simply don't contribute to the rollback (they still show in the timeline).
  const ROLLBACK_FIELDS = {
    workspace_plan_change: { field: 'plan', from: (before) => before && before.plan },
    workspace_suspend:     { field: 'status', from: (before) => before && before.status },
    workspace_restore:     { field: 'status', from: (before) => before && before.status },
  };

  // ── GET /api/cc/timemachine?type=workspace&id=<wid>&as_of=<ISO optional> ──────
  app.get('/api/cc/timemachine', platformAuth, (req, res) => {
    try {
      const type = String(req.query.type || 'workspace');
      const id = String(req.query.id || '').trim();
      const asOfRaw = req.query.as_of ? String(req.query.as_of).trim() : '';
      if (type !== 'workspace') return res.status(400).json({ error: 'Only type=workspace is supported (for now).' });
      if (!id) return res.status(400).json({ error: 'id required' });

      // Normalise as_of to an epoch for comparison; keep the raw string for echo.
      const asOfMs = asOfRaw ? new Date(asOfRaw).getTime() : null;
      const hasAsOf = asOfRaw && Number.isFinite(asOfMs);

      // ── current ──────────────────────────────────────────────────────────────
      const w = db.prepare('SELECT name, status FROM workspaces WHERE id = ?').get(id);
      if (!w) return res.status(404).json({ error: 'Workspace not found' });
      const wp = db.prepare('SELECT plan FROM workspace_plan WHERE workspace_id = ?').get(id);
      const current = {
        name: w.name || null,
        status: w.status || 'active',
        plan: (wp && wp.plan) || 'free',
      };

      // ── timeline (merge platform_events + cc_audit) ───────────────────────────
      const events = safeAll('SELECT * FROM platform_events WHERE workspace_id = ? ORDER BY ts DESC LIMIT 1000', id);
      const audit = safeAll('SELECT * FROM cc_audit WHERE workspace_id = ? OR target_id = ? ORDER BY created_at DESC LIMIT 1000', id, id);

      const timeline = [];
      events.forEach((e) => {
        timeline.push({
          id: e.id,
          ts: e.ts,
          source: 'event',
          label: e.type,
          actor: e.actor_id || null,
          before: null,
          after: parse(e.payload),
        });
      });
      audit.forEach((a) => {
        timeline.push({
          id: a.id,
          ts: a.created_at,
          source: 'audit',
          label: a.action,
          actor: a.admin_id || null,
          before: parse(a.before),
          after: parse(a.after),
        });
      });

      // The ts columns are stored as UTC without a 'Z'; compare on epoch consistently.
      const tsMs = (t) => { const m = new Date(/Z|[+-]\d\d:?\d\d$/.test(String(t)) ? t : t + 'Z').getTime(); return Number.isFinite(m) ? m : 0; };

      // Filter to <= as_of (when provided) for the displayed timeline.
      let displayTimeline = timeline;
      if (hasAsOf) displayTimeline = timeline.filter((it) => tsMs(it.ts) <= asOfMs);
      // Sort DESC for display (newest first).
      displayTimeline.sort((a, b) => tsMs(b.ts) - tsMs(a.ts));

      // ── reconstructed (best-effort) ───────────────────────────────────────────
      // Start from current, then roll back any audit mutation that happened AFTER
      // as_of, newest -> oldest, applying its captured `before` value. Without an
      // as_of, nothing is rolled back so reconstructed == current.
      const reconstructed = { status: current.status, plan: current.plan };
      if (hasAsOf) {
        const rollbackRows = audit
          .filter((a) => tsMs(a.created_at) > asOfMs)
          .sort((a, b) => tsMs(b.created_at) - tsMs(a.created_at)); // newest -> oldest
        rollbackRows.forEach((a) => {
          const spec = ROLLBACK_FIELDS[a.action];
          if (!spec) return;
          const before = parse(a.before);
          const val = spec.from(before);
          if (val !== undefined && val !== null) reconstructed[spec.field] = val;
        });
      }

      ccAudit(req, {
        action: 'timemachine_reconstruct',
        target_type: 'workspace',
        target_id: id,
        workspace_id: id,
        after: { as_of: hasAsOf ? asOfRaw : null, timeline_items: displayTimeline.length, reconstructed },
      });

      res.json({
        current,
        reconstructed,
        timeline: displayTimeline,
        as_of: hasAsOf ? asOfRaw : null,
        best_effort: true,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return {};
};
