// Email workflows actually send (PROP-006). In-memory database + a stub mail server.
//   node test-email-workflows.js
const Database = require('better-sqlite3');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };

(async () => {
  process.env.NODE_ENV = 'test';
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE leads (id TEXT, workspace_id TEXT, customer_name TEXT, email TEXT, is_deleted INTEGER DEFAULT 0);
    CREATE TABLE email_templates (id TEXT, user_id TEXT, name TEXT, subject TEXT, body TEXT, delay_days INTEGER DEFAULT 0);
    CREATE TABLE email_workflows (id TEXT, user_id TEXT, workspace_id TEXT, lead_id TEXT, template_id TEXT, template_name TEXT, template_subject TEXT, status TEXT, scheduled_at TEXT, sent_at TEXT);
    CREATE TABLE workspace_members (workspace_id TEXT, user_id TEXT, role TEXT);
    CREATE TABLE email_smtp_settings (user_id TEXT, smtp_host TEXT, smtp_port INTEGER, smtp_secure INTEGER, smtp_user TEXT, smtp_pass TEXT, from_name TEXT, from_email TEXT);
    CREATE TABLE company_settings (user_id TEXT, company_name TEXT);
    CREATE TABLE lead_emails (id TEXT, lead_id TEXT, workspace_id TEXT, user_id TEXT, direction TEXT, from_email TEXT, to_email TEXT, subject TEXT, body TEXT, status TEXT);
    INSERT INTO workspace_members VALUES ('ws1', 'owner1', 'super_admin');
    INSERT INTO company_settings VALUES ('owner1', 'Lumen Studio');
    INSERT INTO leads VALUES ('l1', 'ws1', 'Amira Saleh', 'amira@example.com', 0), ('l2', 'ws1', 'No Email', NULL, 0);
    INSERT INTO email_templates VALUES ('t1', 'owner1', 'Welcome', 'Hi {{first_name}}', 'Thanks {{name}}, from {{business}}.', 0),
                                       ('t2', 'owner1', 'Follow-up', 'Still interested?', 'Checking in.', 2);
  `);
  const sent = [];
  const nodemailer = { createTransport: () => ({ sendMail: async (m) => { if (m.to === 'refuse@example.com') throw new Error('550 mailbox unavailable'); sent.push(m); return {}; } }) };
  const routes = {};
  const app = { post: (p, ...h) => { routes['POST ' + p] = h[h.length - 1]; }, get() {}, put() {}, delete() {} };
  const history = [];
  const wf = require('./email-workflows')(app, db, {
    auth: (q, r, n) => n(), generateId: () => Math.random().toString(36).slice(2),
    getScopedLead: (req, id) => db.prepare('SELECT * FROM leads WHERE id = ?').get(id),
    addContactHistory: (...a) => history.push(a), nodemailer,
  });
  const call = (key, req) => new Promise((resolve) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); } };
    routes[key]({ workspaceId: 'ws1', workspaceOwnerId: 'owner1', userId: 'owner1', body: {}, params: {}, ...req }, res);
  });

  console.log('\n[1] Without a mail server it fails with a reason, never silently');
  db.prepare("INSERT INTO email_workflows (id, user_id, workspace_id, lead_id, template_id, status, scheduled_at) VALUES ('w0','owner1','ws1','l1','t1','pending', datetime('now','-1 minute'))").run();
  await wf.runDue();
  let row = db.prepare("SELECT status, error FROM email_workflows WHERE id = 'w0'").get();
  ok(row.status === 'failed' && /Email Sending/.test(row.error), 'marked failed: "Email sending is not set up"');

  db.prepare("INSERT INTO email_smtp_settings VALUES ('owner1', 'smtp.example.com', 587, 0, 'u', 'p', 'Lumen', 'hello@lumen.test')").run();

  console.log('\n[2] A sequence sends each step when it is due');
  let r = await call('POST /api/leads/:leadId/email-sequence', { params: { leadId: 'l1' }, body: { template_ids: ['t1', 't2'] } });
  ok(r.status === 201 && r.body.steps.length === 2, 'two-step sequence scheduled');
  const gapDays = (new Date(r.body.steps[1].scheduled_at) - new Date(r.body.steps[0].scheduled_at)) / 86400000;
  ok(Math.round(gapDays) === 2, 'step two is scheduled two days after step one');
  let out = await wf.runDue();
  ok(out.sent === 1 && sent.length === 1, 'only the due step is sent now');
  ok(sent[0].subject === 'Hi Amira' && /Thanks Amira Saleh, from Lumen Studio\./.test(sent[0].text) && sent[0].to === 'amira@example.com', 'placeholders are filled and it goes to the lead');
  ok(db.prepare("SELECT COUNT(*) AS c FROM lead_emails WHERE lead_id = 'l1' AND direction = 'sent'").get().c === 1, 'it appears in the lead’s emails like a hand-sent one');
  out = await wf.runDue();
  ok(out.sent === 0 && sent.length === 1, 'running again never sends twice');
  db.prepare("UPDATE email_workflows SET scheduled_at = datetime('now','-1 minute') WHERE template_id = 't2' AND status = 'pending'").run();
  await wf.runDue();
  ok(sent.length === 2 && sent[1].subject === 'Still interested?', 'step two goes out when its day comes');

  console.log('\n[3] Problems are recorded on the lead');
  r = await call('POST /api/leads/:leadId/email-sequence', { params: { leadId: 'l2' }, body: { template_ids: ['t1'] } });
  ok(r.status === 400, 'a lead without an email cannot start a sequence');
  db.prepare("UPDATE leads SET email = 'refuse@example.com' WHERE id = 'l1'").run();
  db.prepare("INSERT INTO email_workflows (id, user_id, workspace_id, lead_id, template_id, status, scheduled_at) VALUES ('w9','owner1','ws1','l1','t1','pending', datetime('now','-1 minute'))").run();
  await wf.runDue();
  row = db.prepare("SELECT status, error FROM email_workflows WHERE id = 'w9'").get();
  ok(row.status === 'failed' && /550/.test(row.error), 'a refusal from the mail server is stored with its reason');
  r = await call('POST /api/leads/:leadId/email-workflows/cancel', { params: { leadId: 'l1' } });
  ok(r.status === 200, 'pending steps can be cancelled');

  console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
