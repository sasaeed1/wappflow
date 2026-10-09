'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Email workflows — the sender (PROP-006).
//
//  Starting a workflow on a lead recorded a row with a send date, and nothing ever
//  sent it. "Multi-step drip sequences" were advertised on the upgrade card. This
//  is the missing half: a one-minute job that sends every due workflow email
//  through the WORKSPACE's own mail server (Settings → Email Sending), records it
//  on the lead like a hand-sent email, and marks the row sent or failed (with the
//  reason, shown on the lead).
//
//  A sequence is several templates started together; each template's "delay in
//  days" is counted from the previous step, so 0 / 2 / 5 sends today, in two days,
//  then five days after that.
//
//  Placeholders in subject/body: {{name}}, {{first_name}}, {{business}}.
// ════════════════════════════════════════════════════════════════════════════

module.exports = function mountEmailWorkflows(app, db, deps) {
  const { auth, generateId, getScopedLead, addContactHistory = () => {}, logAudit = () => {}, nodemailer, broadcastToWorkspace = () => {} } = deps;

  try { db.exec('ALTER TABLE email_workflows ADD COLUMN error TEXT'); } catch {}
  try { db.exec('ALTER TABLE email_workflows ADD COLUMN step INTEGER DEFAULT 0'); } catch {}

  const fill = (text, lead, business) => {
    const name = (lead.customer_name || '').trim();
    return String(text || '')
      .replace(/\{\{\s*name\s*\}\}/gi, name || 'there')
      .replace(/\{\{\s*first_name\s*\}\}/gi, name.split(/\s+/)[0] || 'there')
      .replace(/\{\{\s*business\s*\}\}/gi, business || '');
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function sendOne(wf) {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(wf.lead_id);
    const tpl = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(wf.template_id);
    const owner = db.prepare("SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role = 'super_admin' LIMIT 1").get(wf.workspace_id)?.user_id || wf.user_id;
    const fail = (why) => {
      db.prepare("UPDATE email_workflows SET status = 'failed', error = ? WHERE id = ?").run(why, wf.id);
      try { addContactHistory(wf.lead_id, owner, 'email', `Scheduled email not sent: ${why}`); } catch {}
      return { ok: false, why };
    };
    if (!lead || lead.is_deleted) return fail('The lead was deleted');
    if (!tpl) return fail('The template was deleted');
    if (!lead.email) return fail('The lead has no email address');
    const smtp = db.prepare('SELECT * FROM email_smtp_settings WHERE user_id = ?').get(owner);
    if (!smtp || !smtp.smtp_host) return fail('Email sending is not set up (Settings → Email Sending)');
    const business = db.prepare('SELECT company_name FROM company_settings WHERE user_id = ?').get(owner)?.company_name || '';
    const subject = fill(tpl.subject, lead, business);
    const body = fill(tpl.body, lead, business);
    try {
      const t = await require('./mail-security').smtpTransport(nodemailer, smtp);
      const from = smtp.from_email || smtp.smtp_user;
      await t.sendMail({ from: `"${smtp.from_name || business || 'WappFlow'}" <${from}>`, to: lead.email, subject, text: body, html: esc(body).replace(/\n/g, '<br>') });
      db.prepare("UPDATE email_workflows SET status = 'sent', sent_at = CURRENT_TIMESTAMP, error = NULL WHERE id = ?").run(wf.id);
      db.prepare('INSERT INTO lead_emails (id, lead_id, workspace_id, user_id, direction, from_email, to_email, subject, body, status) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(generateId(), lead.id, wf.workspace_id, owner, 'sent', from, lead.email, subject, body, 'sent');
      addContactHistory(lead.id, owner, 'email', `Scheduled email sent: ${subject}`);
      logAudit(wf.workspace_id, owner, 'email_workflow_sent', 'lead', lead.id, { template: tpl.name });
      broadcastToWorkspace(wf.workspace_id, 'lead_updated', { lead_id: lead.id });
      return { ok: true };
    } catch (e) {
      return fail(`The mail server refused it: ${String(e.message || e).slice(0, 160)}`);
    }
  }

  let running = false;
  async function runDue(limit = 50) {
    if (running) return { skipped: 'already running' };
    running = true;
    try {
      const due = db.prepare(`SELECT * FROM email_workflows WHERE status = 'pending'
        AND datetime(replace(substr(scheduled_at, 1, 19), 'T', ' ')) <= datetime('now') ORDER BY scheduled_at LIMIT ?`).all(limit);
      let sent = 0, failed = 0;
      for (const wf of due) {
        // Claim it first so a slow mail server can't cause a double send.
        const claimed = db.prepare("UPDATE email_workflows SET status = 'sending' WHERE id = ? AND status = 'pending'").run(wf.id).changes;
        if (!claimed) continue;
        const r = await sendOne(wf);
        r.ok ? sent++ : failed++;
      }
      return { due: due.length, sent, failed };
    } finally { running = false; }
  }
  // A crash mid-send leaves a row 'sending'; put those back after 15 minutes.
  function unstick() {
    try { db.prepare("UPDATE email_workflows SET status = 'pending' WHERE status = 'sending' AND datetime(replace(substr(scheduled_at,1,19),'T',' ')) < datetime('now', '-15 minutes')").run(); } catch {}
  }

  // Start a sequence: several templates, each delayed from the previous step.
  app.post('/api/leads/:leadId/email-sequence', auth, (req, res) => {
    try {
      const lead = getScopedLead(req, req.params.leadId);
      if (!lead) return res.status(404).json({ error: 'Lead not found' });
      const ids = Array.isArray(req.body?.template_ids) ? req.body.template_ids.slice(0, 10) : [];
      if (!ids.length) return res.status(400).json({ error: 'Pick at least one template' });
      if (!lead.email) return res.status(400).json({ error: 'Add an email address to this lead first' });
      let at = req.body?.start_at ? new Date(req.body.start_at) : new Date();
      if (isNaN(at)) at = new Date();
      const made = [];
      ids.forEach((tid, step) => {
        const t = db.prepare('SELECT * FROM email_templates WHERE id = ? AND user_id = ?').get(tid, req.workspaceOwnerId);
        if (!t) return;
        at = new Date(at.getTime() + (Number(t.delay_days) || 0) * 86400000);
        const id = generateId();
        db.prepare(`INSERT INTO email_workflows (id, user_id, workspace_id, lead_id, template_id, template_name, template_subject, status, scheduled_at, step)
          VALUES (?,?,?,?,?,?,?, 'pending', ?, ?)`).run(id, req.workspaceOwnerId, req.workspaceId, lead.id, t.id, t.name, t.subject, at.toISOString(), step);
        made.push({ id, template: t.name, scheduled_at: at.toISOString() });
      });
      if (!made.length) return res.status(404).json({ error: 'None of those templates exist' });
      addContactHistory(lead.id, req.userId, 'email', `Email sequence started: ${made.map((m) => m.template).join(' → ')}`);
      logAudit(req.workspaceId, req.userId, 'email_sequence_started', 'lead', lead.id, { steps: made.length });
      res.status(201).json({ steps: made });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Cancel the pending steps of a lead's sequence(s).
  app.post('/api/leads/:leadId/email-workflows/cancel', auth, (req, res) => {
    if (!getScopedLead(req, req.params.leadId)) return res.status(404).json({ error: 'Lead not found' });
    const r = db.prepare("UPDATE email_workflows SET status = 'cancelled' WHERE lead_id = ? AND workspace_id = ? AND status = 'pending'").run(req.params.leadId, req.workspaceId);
    res.json({ ok: true, cancelled: r.changes });
  });

  if (process.env.NODE_ENV !== 'test' || process.env.WF_RUN_JOBS) {
    setInterval(() => { unstick(); runDue().catch((e) => console.error('email workflows:', e.message)); }, 60 * 1000).unref?.();
  }
  return { runDue, sendOne };
};
