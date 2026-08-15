'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 4 Batch 3 — server-side saved views + one-call bulk status.
//  Module semantics run against a REAL SQLite; route wiring is source-asserted.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const sv = require('./saved-views');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };
const SERVER = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const stripped = SERVER.replace(/^\s*\/\/.*$/gm, '');

const db = new Database(':memory:');
sv.installSchema(db);
const A = { workspaceId: 'ws1', userId: 'u1' };
const B = { workspaceId: 'ws1', userId: 'u2' };   // same workspace, DIFFERENT user
const C = { workspaceId: 'ws2', userId: 'u1' };   // same user id, DIFFERENT workspace

check('save + list round-trips filters as an object, scoped to (workspace, user, entity)', () => {
  sv.saveView(db, { ...A, entity: 'leads', name: 'Hot', filters: { status: ['Interested'], tag: 'vip' } });
  sv.saveView(db, { ...A, entity: 'contracts', name: 'Hot', filters: { state: 'sent' } });
  const views = sv.listViews(db, { ...A, entity: 'leads' });
  assert.strictEqual(views.length, 1, 'entity scoping leaked');
  assert.deepStrictEqual(views[0].filters, { status: ['Interested'], tag: 'vip' });
});

check('views are PERSONAL: a teammate and another tenant see nothing', () => {
  assert.strictEqual(sv.listViews(db, { ...B, entity: 'leads' }).length, 0, 'teammate can see another user’s views');
  assert.strictEqual(sv.listViews(db, { ...C, entity: 'leads' }).length, 0, 'views leaked across workspaces');
});

check('saving under an existing name replaces it — exact localStorage semantics', () => {
  sv.saveView(db, { ...A, entity: 'leads', name: 'Hot', filters: { status: ['Negotiating'] } });
  const views = sv.listViews(db, { ...A, entity: 'leads' });
  assert.strictEqual(views.length, 1, 'upsert created a duplicate');
  assert.deepStrictEqual(views[0].filters, { status: ['Negotiating'] });
});

check('delete is owner-scoped: a guessed id from another user deletes nothing', () => {
  const [v] = sv.listViews(db, { ...A, entity: 'leads' });
  assert.strictEqual(sv.deleteView(db, { ...B, id: v.id }), 0, 'another user deleted the view');
  assert.strictEqual(sv.deleteView(db, { ...C, id: v.id }), 0, 'another workspace deleted the view');
  assert.strictEqual(sv.deleteView(db, { ...A, id: v.id }), 1, 'the owner could not delete');
});

check('hostile input is rejected with 400s, never stored', () => {
  const rejects = (args) => {
    try { sv.saveView(db, { ...A, ...args }); return false; } catch (e) { return e.status === 400; }
  };
  assert(rejects({ entity: 'users', name: 'x', filters: {} }), 'unknown entity accepted');
  assert(rejects({ entity: 'leads', name: '   ', filters: {} }), 'blank name accepted');
  assert(rejects({ entity: 'leads', name: 'x'.repeat(61), filters: {} }), 'oversized name accepted');
  assert(rejects({ entity: 'leads', name: 'x', filters: 'DROP TABLE' }), 'non-object filters accepted');
  assert(rejects({ entity: 'leads', name: 'x', filters: { pad: 'y'.repeat(5000) } }), 'oversized filters accepted');
});

check('routes exist and /api/views is declared with auth', () => {
  assert(/app\.get\('\/api\/views', auth,/.test(SERVER), 'GET /api/views missing or unauthenticated');
  assert(/app\.post\('\/api\/views', auth,/.test(SERVER), 'POST /api/views missing or unauthenticated');
  assert(/app\.delete\('\/api\/views\/:id', auth,/.test(SERVER), 'DELETE /api/views/:id missing or unauthenticated');
  assert(/savedViews\.installSchema\(db\)/.test(SERVER), 'schema never installed on boot');
});

check('bulk-status: one endpoint, whitelisted status, workspace-scoped, transactional', () => {
  assert(/app\.post\('\/api\/leads\/bulk-status', auth,/.test(SERVER), 'endpoint missing or unauthenticated');
  assert(/BULK_STATUSES\.has\(status\)/.test(stripped), 'status is not validated against the whitelist');
  assert(/UPDATE leads SET status = \?\$\{stamps\} WHERE workspace_id = \? AND id IN \(\$\{ph\}\)\$\{visible\}/.test(stripped),
    'update is not workspace- and visibility-scoped');
  assert(/const move = db\.transaction\(/.test(stripped), 'stamps + history are not one transaction');
});

check('bulk-status honors per-member lead visibility, like the list and empty-trash do', () => {
  // A member without view_all_leads must not be able to move leads that are not
  // assigned to them, even with guessed ids (SSE broadcasts make ids obtainable).
  assert(/const visible = req\.canViewAllLeads \? '' : ' AND assigned_to = \?';/.test(stripped),
    'no visibility clause — restricted members could modify leads they cannot see');
  assert(/const visArgs = req\.canViewAllLeads \? \[\] : \[req\.userId\];/.test(stripped), 'visibility clause not bound');
});

check('bulk-status is chunked under SQLite’s bound-variable cap', () => {
  // ~32k bound variables is a hard SQLite limit; an uncapped IN(...) meant a
  // select-all on a big workspace 500'd with no possible client recovery.
  assert(/for \(let i = 0; i < lead_ids\.length; i \+= 500\)/.test(stripped), 'no chunking — big selections would 500');
  assert(/lead_ids\.slice\(i, i \+ 500\)/.test(stripped), 'chunk slice missing');
});

check('bulk-status preserves the single-endpoint side effects: history, audit, SSE', () => {
  // Slice bounds must be literals that SURVIVE comment stripping (a banner
  // comment as the end bound once silently widened this window to end-of-file).
  const start = stripped.indexOf("'/api/leads/bulk-status'");
  const end = stripped.indexOf("app.get('/api/views'");
  assert(start !== -1 && end > start, 'route slice bounds broke — fix the test, not the assertions');
  const route = stripped.slice(start, end);
  assert(/addContactHistory\(id, req\.userId, 'status_change'/.test(route), 'no contact_history per lead');
  assert(/logAudit\(req\.workspaceId, req\.userId, 'bulk_status'/.test(route), 'bulk action skips the audit again');
  assert(/broadcastToWorkspace\(req\.workspaceId, 'lead_updated'/.test(route), 'no SSE — open dashboards go stale');
  assert(/closed_at = CURRENT_TIMESTAMP/.test(route) && /last_contacted_at = CURRENT_TIMESTAMP/.test(route),
    'stage timestamps dropped — analytics would silently diverge from the single-record path');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
