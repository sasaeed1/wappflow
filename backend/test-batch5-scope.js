'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Foundation Sprint · Batch 5 (Q#7 lead-visibility rule + Q#8 workspace re-key)
//  BOOT-FREE verification.
//  (1) Live SQL: the assigned-leads visibility rule; the invoices/email_workflows
//      workspace_id backfill (idempotent, auth-identical mapping); every dual-read
//      query SHAPE executed with its exact param count (catches binding mismatches).
//  (2) Static: canViewAllLeads fallback chain, one rule across list/trash/empty/
//      getScopedLead, zero bypassing inline fetches, writes carry workspace_id.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Database = require('better-sqlite3');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.log('  ✗', name, '—', e.message || e); fail++; }
}
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const pay = fs.readFileSync(path.join(__dirname, 'payments.js'), 'utf8');

// ── (1a) Live: lead-visibility rule (mirrors getScopedLead + the list filter) ──
const db = new Database(':memory:');
db.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, assigned_to TEXT, is_deleted INTEGER DEFAULT 0);
  INSERT INTO leads VALUES ('mine','ws1','member1',0),('other','ws1','member2',0),('unassigned','ws1',NULL,0),('foreign','ws2','member1',0);`);
function scoped(leadId, req) {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(leadId, req.workspaceId);
  if (!lead) return null;
  if (!req.canViewAllLeads && lead.assigned_to !== req.userId) return null;
  return lead;
}
const member = { workspaceId: 'ws1', userId: 'member1', canViewAllLeads: false };
const admin = { workspaceId: 'ws1', userId: 'admin1', canViewAllLeads: true };
check('member sees own assigned lead', () => assert(scoped('mine', member)));
check('member blocked from teammate\'s lead', () => assert.strictEqual(scoped('other', member), null));
check('member blocked from unassigned lead (matches list)', () => assert.strictEqual(scoped('unassigned', member), null));
check('member blocked cross-tenant even when assigned there', () => assert.strictEqual(scoped('foreign', member), null));
check('view_all_leads sees everything in-workspace', () => {
  assert(scoped('mine', admin) && scoped('other', admin) && scoped('unassigned', admin));
  assert.strictEqual(scoped('foreign', admin), null);
});
check('list + visibility filter agree with the scoped rule', () => {
  const listFor = (req) => {
    let q = 'SELECT id FROM leads WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)';
    const p = [req.workspaceId];
    if (!req.canViewAllLeads) { q += ' AND assigned_to = ?'; p.push(req.userId); }
    return db.prepare(q).all(...p).map(r => r.id);
  };
  assert.deepStrictEqual(listFor(member), ['mine']);
  for (const id of listFor(member)) assert(scoped(id, member), 'list shows a lead detail denies');
});

// ── (1b) Live: workspace re-key backfill + dual-read shapes ───────────────────
db.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, workspace_id TEXT);
  CREATE TABLE invoices (id TEXT PRIMARY KEY, user_id TEXT, workspace_id TEXT, lead_id TEXT, status TEXT, created_at TEXT DEFAULT '2026-01-01');
  CREATE TABLE email_workflows (id TEXT PRIMARY KEY, user_id TEXT, workspace_id TEXT, lead_id TEXT, status TEXT, sent_at TEXT, created_at TEXT DEFAULT '2026-01-01');
  INSERT INTO users VALUES ('owner1','ws1'),('owner2',NULL);
  INSERT INTO invoices (id,user_id,workspace_id,lead_id,status) VALUES
    ('i1','owner1',NULL,'L1','pending'), ('i2','owner2',NULL,NULL,'paid'), ('i3','owner1','ws1','L1','draft');
  INSERT INTO email_workflows (id,user_id,workspace_id,lead_id,status) VALUES ('w1','owner1',NULL,'L1','pending');`);
const BF_INV = `UPDATE invoices SET workspace_id = COALESCE((SELECT u.workspace_id FROM users u WHERE u.id = invoices.user_id), user_id) WHERE workspace_id IS NULL OR workspace_id = ''`;
const BF_EW = `UPDATE email_workflows SET workspace_id = COALESCE((SELECT u.workspace_id FROM users u WHERE u.id = email_workflows.user_id), user_id) WHERE workspace_id IS NULL OR workspace_id = ''`;
check('backfill maps via users.workspace_id + auth-identical fallback', () => {
  const r = db.prepare(BF_INV).run(); db.prepare(BF_EW).run();
  assert.strictEqual(r.changes, 2); // i1 + i2 (i3 already keyed)
  assert.strictEqual(db.prepare("SELECT workspace_id FROM invoices WHERE id='i1'").get().workspace_id, 'ws1');
  assert.strictEqual(db.prepare("SELECT workspace_id FROM invoices WHERE id='i2'").get().workspace_id, 'owner2'); // NULL ws → user id (auth rule)
  assert.strictEqual(db.prepare("SELECT workspace_id FROM email_workflows WHERE id='w1'").get().workspace_id, 'ws1');
});
check('backfill idempotent (second run: 0 changes)', () =>
  assert.strictEqual(db.prepare(BF_INV).run().changes, 0));

const DUAL = "(workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))";
check('every dual-read shape binds + scopes correctly', () => {
  // legacy-null row simulation: strip workspace_id from i3's twin
  db.prepare("INSERT INTO invoices (id,user_id,workspace_id,lead_id,status) VALUES ('legacy','owner1',NULL,'L1','pending')").run();
  const shapes = [
    [`SELECT * FROM invoices WHERE lead_id = ? AND ${DUAL} ORDER BY created_at DESC`, ['L1', 'ws1', 'owner1'], 3],
    [`SELECT * FROM invoices WHERE ${DUAL} ORDER BY created_at DESC`, ['ws1', 'owner1'], 3],
    [`SELECT * FROM invoices WHERE id = ? AND ${DUAL}`, ['legacy', 'ws1', 'owner1'], 1],
    [`SELECT status FROM invoices WHERE id = ? AND ${DUAL}`, ['i3', 'ws1', 'owner1'], 1],
  ];
  for (const [sql, params, minRows] of shapes) {
    const rows = db.prepare(sql).all(...params);
    assert(rows.length >= minRows, `shape returned ${rows.length} < ${minRows}: ${sql.slice(0, 60)}`);
  }
  // cross-workspace caller sees nothing
  assert.strictEqual(db.prepare(`SELECT COUNT(*) c FROM invoices WHERE ${DUAL}`).get('wsX', 'ownerX').c, 0);
  // legacy NULL row reachable via owner fallback, and UPDATE/DELETE shapes bind
  db.prepare(`UPDATE invoices SET status = 'pending' WHERE id = ? AND ${DUAL}`).run('legacy', 'ws1', 'owner1');
  db.prepare(`UPDATE email_workflows SET status = ?, sent_at = CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE sent_at END WHERE id = ? AND ${DUAL}`)
    .run('sent', 'sent', 'w1', 'ws1', 'owner1');
  assert.strictEqual(db.prepare("SELECT status FROM email_workflows WHERE id='w1'").get().status, 'sent');
  db.prepare(`DELETE FROM invoices WHERE id = ? AND ${DUAL}`).run('legacy', 'ws1', 'owner1');
  assert(!db.prepare("SELECT 1 FROM invoices WHERE id='legacy'").get());
});

// ── (2) Static checks ─────────────────────────────────────────────────────────
check('auth computes canViewAllLeads (custom permission ?? role default)', () =>
  assert(/req\.canViewAllLeads = req\.userPermissions\.view_all_leads\s*\n?\s*\?\? \(DEFAULT_ROLE_PERMISSIONS\[req\.userRole\] \|\| DEFAULT_ROLE_PERMISSIONS\.user\)\.view_all_leads/.test(srv)));
check('one visibility rule: list + trash + empty-trash keyed on canViewAllLeads', () =>
  assert.strictEqual((srv.match(/if \(!req\.canViewAllLeads\) \{ q(uery)? \+= ' AND assigned_to = \?';/g) || []).length, 3));
check('getScopedLead enforces the assigned-leads clause', () =>
  assert(/if \(!req\.canViewAllLeads && lead\.assigned_to !== req\.userId\) return null;/.test(srv)));
check('no AUTHENTICATED route bypasses getScopedLead', () => {
  // Counting every inline lead read was the wrong proxy: the PUBLIC client
  // portal legitimately reads a lead by the PORTAL's workspace, because it has
  // no authenticated req and must not apply per-member visibility to a client
  // looking at their own portal. What matters is that nothing scopes a lead by
  // req.workspaceId outside the one helper.
  const inline = (srv.match(/FROM leads WHERE id = \? AND workspace_id = \?'\)\.get\([^)]*\)/g) || []);
  const byReq = inline.filter((s) => s.includes('req.workspaceId'));
  assert.strictEqual(byReq.length, 1, 'a route scopes a lead itself instead of using getScopedLead: ' + byReq.join(' | '));
});
check('getScopedLead now guards 35+ call sites', () =>
  assert((srv.match(/getScopedLead\(req/g) || []).length >= 35));
check('members can still toggle reminders they created', () =>
  assert(/!getScopedLead\(req, reminder\.lead_id\) && reminder\.user_id !== req\.userId/.test(srv)));
check('re-key migration wired (columns + indexes + backfill)', () => {
  assert(/ALTER TABLE invoices ADD COLUMN workspace_id TEXT/.test(srv));
  assert(/ALTER TABLE email_workflows ADD COLUMN workspace_id TEXT/.test(srv));
  assert(/idx_invoices_ws ON invoices\(workspace_id\)/.test(srv));
  assert(/idx_email_workflows_ws/.test(srv));
  assert(/workspace re-key backfill/.test(srv));
});
check('INSERTs now write workspace_id (invoices + email_workflows)', () => {
  assert(/INSERT INTO invoices \(id, user_id, workspace_id, lead_id/.test(srv));
  assert(/INSERT INTO email_workflows \(id, user_id, workspace_id, lead_id/.test(srv));
});
check('dual-read predicate deployed across the invoice/workflow surface (11+ sites)', () =>
  assert((srv.match(/workspace_id = \? OR \(workspace_id IS NULL AND user_id = \?\)|ew\.workspace_id = \? OR \(ew\.workspace_id IS NULL AND ew\.user_id = \?\)/g) || []).length >= 11));
check('payments.markPaidByInvoice uses dual-read', () =>
  assert(/WHERE id = \? AND \(workspace_id = \? OR \(workspace_id IS NULL AND user_id = \?\)\)'\)\.get\(invoiceId, workspaceId, workspaceOwnerId\)/.test(pay)));
check('no stale owner-only invoice scoping remains on routes', () => {
  // export snapshot keeps user_id intentionally; route queries must all be dual now
  const routeArea = srv.slice(srv.indexOf("app.get('/api/invoices'"), srv.indexOf('function renderInvoiceEmailHTML'));
  assert(!/WHERE id = \? AND user_id = \?/.test(routeArea), 'owner-only by-id query survives in invoice routes');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
