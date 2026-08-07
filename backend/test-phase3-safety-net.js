'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 3 Batch 1 verification — BOOT-FREE.
//  server.js cannot start locally (the WhatsApp session loader needs a real
//  browser + session dir), so this exercises the soft-delete module against a
//  REAL in-memory SQLite and asserts the wiring in server.js by inspection.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const sd = require('./soft-delete');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SERVER = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const MEDIA = fs.readFileSync(path.join(__dirname, 'media-studio.js'), 'utf8');

// ── a real DB, shaped like the live one ─────────────────────────────────────
const db = new Database(':memory:');
const safeAlter = (sql) => { try { db.exec(sql); } catch (e) { if (!/duplicate column/.test(e.message)) throw e; } };
db.exec(`
  CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, is_deleted INTEGER DEFAULT 0, deleted_at TIMESTAMP);
  CREATE TABLE invoices (id TEXT PRIMARY KEY, workspace_id TEXT, user_id TEXT, lead_id TEXT);
  CREATE TABLE cs_documents (id TEXT PRIMARY KEY, workspace_id TEXT, lead_id TEXT);
  CREATE TABLE bookings (id TEXT PRIMARY KEY, workspace_id TEXT, lead_id TEXT);
  CREATE TABLE workspace_members (id TEXT PRIMARY KEY, workspace_id TEXT);
`);
sd.installSchema(db, safeAlter);

check('installSchema is additive and idempotent (safe on every boot)', () => {
  sd.installSchema(db, safeAlter); // twice must not throw
  const cols = db.prepare(`PRAGMA table_info(invoices)`).all().map((c) => c.name);
  for (const c of ['is_deleted', 'deleted_at', 'deleted_by']) assert(cols.includes(c), 'invoices missing ' + c);
  const bcols = db.prepare(`PRAGMA table_info(bookings)`).all().map((c) => c.name);
  assert(bcols.includes('is_deleted'), 'bookings missing is_deleted');
});

check('softDelete hides a row and restore brings it back', () => {
  db.prepare(`INSERT INTO bookings (id, workspace_id) VALUES ('b1','ws1')`).run();
  assert.strictEqual(sd.softDelete(db, { table: 'bookings', id: 'b1', workspaceId: 'ws1', userId: 'u1' }), 1);
  const row = db.prepare(`SELECT * FROM bookings WHERE id='b1'`).get();
  assert.strictEqual(row.is_deleted, 1);
  assert(row.deleted_at, 'deleted_at not stamped');
  assert.strictEqual(row.deleted_by, 'u1', 'deleted_by not recorded');
  assert.strictEqual(sd.restore(db, { table: 'bookings', id: 'b1', workspaceId: 'ws1' }), 1);
  const back = db.prepare(`SELECT * FROM bookings WHERE id='b1'`).get();
  assert.strictEqual(back.is_deleted, 0);
  assert.strictEqual(back.deleted_at, null);
});

check('soft-delete is workspace-scoped — cannot bin another tenant’s row', () => {
  db.prepare(`INSERT INTO bookings (id, workspace_id) VALUES ('b2','ws1')`).run();
  assert.strictEqual(sd.softDelete(db, { table: 'bookings', id: 'b2', workspaceId: 'ws-other', userId: 'u1' }), 0);
  assert.strictEqual(db.prepare(`SELECT is_deleted FROM bookings WHERE id='b2'`).get().is_deleted, 0);
});

check('ONE retention window: 90 days, and the sweep honours it', () => {
  assert.strictEqual(sd.RETENTION_DAYS, 90);
  db.prepare(`INSERT INTO bookings (id, workspace_id, is_deleted, deleted_at) VALUES ('old','ws1',1,datetime('now','-91 days'))`).run();
  db.prepare(`INSERT INTO bookings (id, workspace_id, is_deleted, deleted_at) VALUES ('fresh','ws1',1,datetime('now','-2 days'))`).run();
  sd.purgeExpired(db);
  assert(!db.prepare(`SELECT 1 FROM bookings WHERE id='old'`).get(), 'expired row survived the sweep');
  assert(db.prepare(`SELECT 1 FROM bookings WHERE id='fresh'`).get(), 'in-window row was purged');
});

check('INVOICES ARE NEVER AUTO-PURGED — the financial-record guarantee', () => {
  assert.strictEqual(sd.ENTITIES.invoices.retentionDays, null, 'invoices must have no retention window');
  db.prepare(`INSERT INTO invoices (id, workspace_id, is_deleted, deleted_at) VALUES ('inv-old','ws1',1,datetime('now','-5000 days'))`).run();
  sd.purgeExpired(db);
  assert(db.prepare(`SELECT 1 FROM invoices WHERE id='inv-old'`).get(), 'a binned invoice was destroyed by the sweep');
});

check('the lead guard blocks deletion and names what is attached', () => {
  db.prepare(`INSERT INTO leads (id, workspace_id) VALUES ('L1','ws1')`).run();
  db.prepare(`INSERT INTO invoices (id, workspace_id, lead_id) VALUES ('i1','ws1','L1')`).run();
  db.prepare(`INSERT INTO cs_documents (id, workspace_id, lead_id) VALUES ('c1','ws1','L1')`).run();
  const g = sd.attachmentsForLead(db, 'L1', 'ws1');
  assert.strictEqual(g.blocked, true, 'guard did not block');
  assert(/1 invoice/.test(g.message) && /1 contract/.test(g.message), 'message does not name attachments: ' + g.message);
});

check('already-binned children do NOT block — the bin must stay emptyable', () => {
  db.prepare(`INSERT INTO leads (id, workspace_id) VALUES ('L2','ws1')`).run();
  db.prepare(`INSERT INTO invoices (id, workspace_id, lead_id, is_deleted) VALUES ('i2','ws1','L2',1)`).run();
  const g = sd.attachmentsForLead(db, 'L2', 'ws1');
  assert.strictEqual(g.blocked, false, 'a row already in the bin blocked the delete');
});

check('a clean lead is deletable', () => {
  db.prepare(`INSERT INTO leads (id, workspace_id) VALUES ('L3','ws1')`).run();
  assert.strictEqual(sd.attachmentsForLead(db, 'L3', 'ws1').blocked, false);
});

// ── server.js wiring (inspection — it cannot be booted here) ────────────────
check('lead permanent-delete GUARDS instead of destroying invoices', () => {
  const s = strip(SERVER);
  assert(/attachmentsForLead\(db, req\.params\.id/.test(s), 'guard not wired into the endpoint');
  assert(/status\(409\)/.test(s), 'guard does not return a conflict');
  assert(!/DELETE FROM invoices WHERE lead_id = \?/.test(s), 'the invoice-destroying cascade survives');
});
check('invoice DELETE is now a soft-delete, with restore + bin routes', () => {
  const s = strip(SERVER);
  assert(!/db\.prepare\('DELETE FROM invoices WHERE id = \?/.test(s), 'hard delete survives');
  assert(/UPDATE invoices SET is_deleted = 1/.test(s), 'not soft-deleting');
  assert(/app\.post\('\/api\/invoices\/:id\/restore'/.test(s), 'no restore route');
  assert(/app\.get\('\/api\/invoices\/bin'/.test(s), 'no bin route');
});
check('the /bin route is declared BEFORE /:id or Express would swallow it', () => {
  const s = strip(SERVER);
  const bin = s.indexOf("app.get('/api/invoices/bin'");
  const byId = s.indexOf("app.get('/api/invoices/:id'");
  assert(bin !== -1 && byId !== -1, 'routes missing');
  assert(bin < byId, `/bin (${bin}) must come before /:id (${byId}) — otherwise id="bin"`);
});
check('every invoice LIST read filters the bin (soft-delete is useless otherwise)', () => {
  const s = strip(SERVER);
  assert((s.match(/invoices\.is_deleted = 0 OR invoices\.is_deleted IS NULL/g) || []).length >= 3,
    'list/aggregate reads still return binned invoices');
});
check('EMPTY TRASH is guarded too — bulk was the bigger invoice-destroyer', () => {
  const s = strip(SERVER);
  // the old loop swept 'invoices' along with notes/reminders/messages
  assert(!/for \(const table of \['notes', 'reminders', 'messages', 'contact_history', 'invoices'\]/.test(s),
    'empty-trash still bulk-deletes invoices');
  assert(/attachmentsForLead\(db, id, req\.workspaceId\)/.test(s), 'empty-trash does not run the guard per lead');
  assert(/skipped/.test(s), 'empty-trash does not report what it refused to delete');
});
check('no invoice hard-delete remains anywhere in the backend', () => {
  const s = strip(SERVER);
  assert(!/db\.prepare\(`?'?DELETE FROM invoices/.test(s), 'an invoice hard-delete survives');
});
check('the nightly job sweeps every bin through the shared registry', () => {
  const s = strip(SERVER);
  assert(/softDeleteLib\.purgeExpired\(db\)/.test(s), 'cron still runs a bespoke per-table delete');
  assert(!/DELETE FROM leads WHERE is_deleted = 1 AND deleted_at < datetime\('now', '-90 days'\)\s*`\)\.run\(\);/.test(s),
    'the old leads-only cleanup survives in cron');
});
check('Studio’s bin no longer promises a different window than the rest', () => {
  const m = strip(MEDIA);
  assert(/RETENTION_DAYS/.test(m), 'studio purge does not use the shared window');
  assert(!/'-30 days'/.test(m), 'a hardcoded 30-day purge survives');
});

// ── Batch 2 ─────────────────────────────────────────────────────────────────
const CONTRACTS = fs.readFileSync(path.join(__dirname, 'contracts-studio.js'), 'utf8');

check('SECURITY: workspace_members stays a HARD delete — it is an auth table', () => {
  // The auth middleware resolves role + permissions from workspace_members on every
  // request. Soft-deleting a member without filtering all ~10 reads would leave a
  // removed person authenticating with their old permissions.
  assert(!/workspace_members:\s*\{/.test(strip(fs.readFileSync(path.join(__dirname, 'soft-delete.js'), 'utf8'))),
    'workspace_members must NOT be in the soft-delete registry');
  assert(/DELETE FROM workspace_members WHERE id = \?/.test(strip(SERVER)),
    'member removal must stay immediate');
  assert(/'member_removed'/.test(SERVER), 'member removal must still be audited');
});

check('contracts join the bin, with signers/events/approvals preserved for restore', () => {
  const c = strip(CONTRACTS);
  assert(!/DELETE FROM cs_documents WHERE id = \?/.test(c), 'contract hard-delete survives');
  assert(/UPDATE cs_documents SET is_deleted = 1/.test(c), 'not soft-deleting');
  // the children must NOT be destroyed, or a restore returns a hollow document
  assert(!/DELETE FROM cs_signers WHERE document_id/.test(c), 'signers still destroyed — restore would be incomplete');
  assert(!/DELETE FROM cs_approvals WHERE document_id/.test(c), 'approvals still destroyed');
  assert(/app\.post\('\/api\/cs\/documents\/:id\/restore'/.test(c), 'no contract restore route');
});

check('contract reads exclude the bin, and ?bin=1 makes binned docs reachable', () => {
  const c = strip(CONTRACTS);
  assert((c.match(/is_deleted = 0 OR/g) || []).length >= 5, 'contract list/aggregate reads not filtered');
  assert(/req\.query\.bin === '1'/.test(c), 'no way to list the bin — binned docs would be unreachable');
});

check('bulk lead actions now write the audit their single-record siblings do', () => {
  const s = strip(SERVER);
  assert(/'bulk_trash'/.test(s), 'bulk-trash still leaves no audit trace');
  assert(/'bulk_assign'/.test(s), 'bulk-assign still leaves no audit trace');
  assert(/deleted_by = \?.*WHERE workspace_id = \? AND id IN/s.test(s) || /deleted_by = \?/.test(s),
    'bulk-trash does not record who binned the rows');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
