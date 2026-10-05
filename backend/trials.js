'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Trials (PROP-006). workspace_plan.trial_ends_at existed but nothing set it and
//  nothing acted on it. Owner decision (2026-10-05): every new workspace gets a
//  14-day Studio trial, then drops to Creator automatically with a notice. The
//  founder can extend or end a trial from Command Center.
//
//  Only a workspace that is STILL on its trial is downgraded: any deliberate plan
//  change (Command Center, billing, bulk action) clears trial_ends_at, so a paying
//  customer is never knocked back to Creator by an old trial date.
// ════════════════════════════════════════════════════════════════════════════

const TRIAL_PLAN = process.env.TRIAL_PLAN || 'studio';
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS) || 14;
const AFTER_PLAN = 'creator';

module.exports = function mountTrials(app, db, deps) {
  const { platformAuth, requirePerm, ccAudit = () => {}, entitlements, notify = () => {}, generateId } = deps;

  function startTrial(workspaceId, days = TRIAL_DAYS) {
    if (!workspaceId || days <= 0) return;
    const ends = new Date(Date.now() + days * 86400000).toISOString();
    db.prepare(`INSERT INTO workspace_plan (workspace_id, plan, trial_ends_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id) DO UPDATE SET plan = excluded.plan, trial_ends_at = excluded.trial_ends_at, updated_at = CURRENT_TIMESTAMP`)
      .run(workspaceId, TRIAL_PLAN, ends);
    try { entitlements.invalidate(workspaceId); } catch {}
    return ends;
  }

  function sweep() {
    const due = db.prepare(`SELECT wp.workspace_id, wp.plan, w.name FROM workspace_plan wp JOIN workspaces w ON w.id = wp.workspace_id
      WHERE wp.trial_ends_at IS NOT NULL AND datetime(replace(substr(wp.trial_ends_at,1,19),'T',' ')) <= datetime('now')`).all();
    for (const t of due) {
      db.prepare('UPDATE workspace_plan SET plan = ?, trial_ends_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?').run(AFTER_PLAN, t.workspace_id);
      try { entitlements.invalidate(t.workspace_id); } catch {}
      try {
        notify(t.workspace_id, { type: 'plan', title: 'Your Studio trial has ended', body: 'You’re now on Creator. Your data is all here; upgrade any time to get Studio features back.', url: '/settings?tab=plan', icon: '⏳' });
      } catch {}
      try {
        db.prepare('INSERT INTO cc_inbox (id, kind, workspace_id, severity, title, body, link) VALUES (?,?,?,?,?,?,?)')
          .run(generateId(), 'trial_ended', t.workspace_id, 'medium', `Trial ended: ${t.name || 'a workspace'}`, 'Dropped to Creator. A good moment to reach out.', `/control/customers/${t.workspace_id}`);
      } catch {}
    }
    return { ended: due.length };
  }

  // Command Center: extend (days > 0) or end now (days = 0) a workspace's trial.
  app.post('/api/cc/workspaces/:id/trial', platformAuth, requirePerm('manage_plans'), (req, res) => {
    const wid = req.params.id;
    if (!db.prepare('SELECT id FROM workspaces WHERE id = ?').get(wid)) return res.status(404).json({ error: 'Workspace not found' });
    const days = Math.max(0, Math.min(90, parseInt(req.body?.days, 10) || 0));
    const before = db.prepare('SELECT plan, trial_ends_at FROM workspace_plan WHERE workspace_id = ?').get(wid) || null;
    let after;
    if (days === 0) {
      db.prepare('UPDATE workspace_plan SET trial_ends_at = datetime(\'now\', \'-1 second\') WHERE workspace_id = ? AND trial_ends_at IS NOT NULL').run(wid);
      sweep();
      after = db.prepare('SELECT plan, trial_ends_at FROM workspace_plan WHERE workspace_id = ?').get(wid);
    } else {
      // Extend from whichever is later: now, or the current end.
      const base = before?.trial_ends_at && new Date(before.trial_ends_at) > new Date() ? new Date(before.trial_ends_at) : new Date();
      const ends = new Date(base.getTime() + days * 86400000).toISOString();
      db.prepare(`INSERT INTO workspace_plan (workspace_id, plan, trial_ends_at) VALUES (?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET plan = CASE WHEN workspace_plan.trial_ends_at IS NULL THEN ? ELSE workspace_plan.plan END, trial_ends_at = excluded.trial_ends_at, updated_at = CURRENT_TIMESTAMP`)
        .run(wid, TRIAL_PLAN, ends, TRIAL_PLAN);
      try { entitlements.invalidate(wid); } catch {}
      after = db.prepare('SELECT plan, trial_ends_at FROM workspace_plan WHERE workspace_id = ?').get(wid);
    }
    ccAudit(req, { action: days ? 'workspace_trial_extended' : 'workspace_trial_ended', target_type: 'workspace', target_id: wid, workspace_id: wid, before, after });
    res.json({ ok: true, ...after });
  });

  if (process.env.NODE_ENV !== 'test' || process.env.WF_RUN_JOBS) {
    setTimeout(() => { try { sweep(); } catch (e) { console.error('trial sweep:', e.message); } }, 30 * 1000).unref?.();
    setInterval(() => { try { sweep(); } catch (e) { console.error('trial sweep:', e.message); } }, 60 * 60 * 1000).unref?.();
  }
  return { startTrial, sweep, TRIAL_PLAN, TRIAL_DAYS };
};
