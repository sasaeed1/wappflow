'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 4 Batch 1 verification — indexes + concurrency pragmas.
//  Asserts the query PLANNER actually uses the new indexes (EXPLAIN QUERY PLAN),
//  not merely that CREATE INDEX statements exist in the source.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };
const SERVER = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const MEDIA = fs.readFileSync(path.join(__dirname, 'media-studio.js'), 'utf8');
const CONTRACTS = fs.readFileSync(path.join(__dirname, 'contracts-studio.js'), 'utf8');

// Rebuild the relevant slice of the schema + the new indexes, then ask SQLite how it
// would run the real hot-path queries.
const db = new Database(':memory:');
db.exec(`
  CREATE TABLE messages (id TEXT PRIMARY KEY, lead_id TEXT, wa_message_id TEXT, timestamp TIMESTAMP);
  CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, is_deleted INTEGER DEFAULT 0);
  CREATE TABLE invoices (id TEXT PRIMARY KEY, workspace_id TEXT, lead_id TEXT, is_deleted INTEGER DEFAULT 0);
  CREATE TABLE bookings (id TEXT PRIMARY KEY, lead_id TEXT, is_deleted INTEGER DEFAULT 0);
  CREATE TABLE cs_documents (id TEXT PRIMARY KEY, workspace_id TEXT, lead_id TEXT, is_deleted INTEGER DEFAULT 0);
  CREATE TABLE ms_assets (id TEXT PRIMARY KEY, project_id TEXT, workspace_id TEXT, deleted_at TIMESTAMP);

  -- pre-existing index (server.js:822) — mirrored so the guard's plan is realistic
  CREATE INDEX idx_invoices_lead ON invoices(lead_id);

  CREATE INDEX idx_messages_wa_id ON messages(wa_message_id);
  CREATE INDEX idx_messages_lead_ts ON messages(lead_id, timestamp DESC);
  CREATE INDEX idx_leads_ws_deleted ON leads(workspace_id, is_deleted);
  CREATE INDEX idx_invoices_ws_deleted ON invoices(workspace_id, is_deleted);
  CREATE INDEX idx_bookings_lead ON bookings(lead_id);
  CREATE INDEX idx_cs_docs_ws_deleted ON cs_documents(workspace_id, is_deleted);
  CREATE INDEX idx_cs_docs_lead ON cs_documents(lead_id);
  CREATE INDEX idx_ms_assets_ws ON ms_assets(workspace_id);
  CREATE INDEX idx_ms_assets_deleted ON ms_assets(deleted_at);
`);
const plan = (sql, ...args) => db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...args).map((r) => r.detail).join(' | ');
const usesIndex = (sql, idx, ...args) => {
  const p = plan(sql, ...args);
  assert(/USING (COVERING )?INDEX/.test(p), `full scan — planner said: ${p}`);
  assert(p.includes(idx), `expected ${idx}, planner said: ${p}`);
};

check('inbound WhatsApp dedupe no longer full-scans the messages table', () => {
  // This runs on EVERY inbound message; it was the worst offender.
  usesIndex('SELECT id FROM messages WHERE wa_message_id = ?', 'idx_messages_wa_id', 'x');
});
check('per-lead message history uses the composite (lead_id, timestamp)', () => {
  usesIndex('SELECT * FROM messages WHERE lead_id = ? ORDER BY timestamp DESC', 'idx_messages_lead_ts', 'x');
});
check('lead + invoice bin scans are indexed', () => {
  usesIndex('SELECT * FROM leads WHERE workspace_id = ? AND is_deleted = 1', 'idx_leads_ws_deleted', 'w');
  usesIndex('SELECT * FROM invoices WHERE workspace_id = ? AND is_deleted = 1', 'idx_invoices_ws_deleted', 'w');
});
check('the lead-delete guard counts children without scanning', () => {
  // Runs three times per permanent-delete, and once per lead on empty-trash.
  usesIndex('SELECT COUNT(*) c FROM invoices WHERE lead_id = ?', 'idx_invoices', 'L');
  usesIndex('SELECT COUNT(*) c FROM bookings WHERE lead_id = ?', 'idx_bookings_lead', 'L');
  usesIndex('SELECT COUNT(*) c FROM cs_documents WHERE lead_id = ?', 'idx_cs_docs_lead', 'L');
});
check('media library + retention sweep are indexed', () => {
  usesIndex('SELECT * FROM ms_assets WHERE workspace_id = ?', 'idx_ms_assets_ws', 'w');
  usesIndex("SELECT * FROM ms_assets WHERE deleted_at < datetime('now','-90 days')", 'idx_ms_assets_deleted');
});

check('concurrency pragmas are set — WAL alone let a locked DB fail instantly', () => {
  assert(/db\.pragma\('busy_timeout = \d+'\)/.test(SERVER), 'no busy_timeout: a busy write surfaces as SQLITE_BUSY to the user');
  assert(/db\.pragma\('synchronous = NORMAL'\)/.test(SERVER), 'no synchronous pragma (the standard WAL companion)');
  assert(/db\.pragma\('journal_mode = WAL'\)/.test(SERVER), 'WAL lost');
});
check('the pragmas actually apply on a real connection', () => {
  const d2 = new Database(':memory:');
  d2.pragma('busy_timeout = 5000');
  d2.pragma('synchronous = NORMAL');
  assert.strictEqual(d2.pragma('busy_timeout', { simple: true }), 5000);
  assert.strictEqual(d2.pragma('synchronous', { simple: true }), 1); // 1 = NORMAL
});
check('every new index is declared in source, next to the module that owns it', () => {
  // idx_bookings_lead moved from server.js's central list into booking.js: the
  // central list runs BEFORE the module mounts, so on a fresh install the table
  // did not exist yet and the index was silently skipped. Module owns the table
  // → module owns its indexes.
  const BOOKING = fs.readFileSync(path.join(__dirname, 'booking.js'), 'utf8');
  for (const i of ['idx_messages_wa_id', 'idx_messages_lead_ts', 'idx_leads_ws_deleted', 'idx_invoices_ws_deleted'])
    assert(SERVER.includes(i), 'server.js missing ' + i);
  assert(!SERVER.includes('idx_bookings_lead'), 'idx_bookings_lead back in server.js — fresh installs skip it there');
  for (const i of ['idx_bookings_lead', 'idx_bookings_ws_deleted']) assert(BOOKING.includes(i), 'booking.js missing ' + i);
  for (const i of ['idx_ms_assets_ws', 'idx_ms_assets_deleted']) assert(MEDIA.includes(i), 'media-studio.js missing ' + i);
  for (const i of ['idx_cs_docs_ws_deleted', 'idx_cs_docs_lead']) assert(CONTRACTS.includes(i), 'contracts-studio.js missing ' + i);
});
check('the shell badge can stop pulling the entire leads table', () => {
  // It fetched every lead in the workspace every 60s, on every page, to count today's.
  assert(/app\.get\('\/api\/notifications\/summary'/.test(SERVER), 'no counts-only endpoint');
  const body = SERVER.slice(SERVER.indexOf("app.get('/api/notifications/summary'"));
  assert(/SELECT COUNT\(\*\) c FROM leads/.test(body), 'summary does not COUNT — it must not select rows');
  assert(!/SELECT \* FROM leads/.test(body.slice(0, 1200)), 'summary still selects whole lead rows');
  assert(/canViewAllLeads/.test(body), 'summary ignores lead-visibility scoping');
});
check('all index creation stays IF NOT EXISTS — safe on every boot', () => {
  const all = (SERVER + MEDIA + CONTRACTS).match(/CREATE INDEX[^;'`\n]*/g) || [];
  const bad = all.filter((s) => !/IF NOT EXISTS/.test(s));
  assert(bad.length === 0, 'non-idempotent index creation: ' + bad.join(' | '));
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
