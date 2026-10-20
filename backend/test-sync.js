// Phase 6 sync delta endpoint test — no server.js boot. Run: node test-sync.js
const Database = require('better-sqlite3');
const express = require('express');
const sync = require('./sync');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, customer_name TEXT, is_deleted INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT, assigned_to TEXT);
  CREATE TABLE ms_projects (id TEXT PRIMARY KEY, workspace_id TEXT, title TEXT, created_at TEXT, lead_id TEXT);
  CREATE TABLE ms_assets (id TEXT PRIMARY KEY, workspace_id TEXT, project_id TEXT, created_at TEXT);
  CREATE TABLE ms_cull_decisions (id TEXT PRIMARY KEY, workspace_id TEXT, asset_id TEXT, decision TEXT, created_at TEXT, updated_at TEXT);
  CREATE TABLE workspace_plan (workspace_id TEXT PRIMARY KEY, plan TEXT);
`);
// old rows (before cursor) + new rows (after cursor)
db.prepare("INSERT INTO leads VALUES ('l-old','ws1','Old',0,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','u2')").run();
db.prepare("INSERT INTO leads VALUES ('l-new','ws1','New',0,'2026-06-20T00:00:00Z','2026-06-22T10:00:00Z','u1')").run();
db.prepare("INSERT INTO ms_projects VALUES ('p-new','ws1','Shoot','2026-06-22T09:00:00Z','l-new')").run();
db.prepare("INSERT INTO ms_projects VALUES ('p-old','ws1','Old shoot','2026-06-22T09:00:00Z','l-old')").run();
db.prepare("INSERT INTO ms_assets VALUES ('a1','ws1','p-new','2026-06-22T09:00:00Z')").run();
db.prepare("INSERT INTO ms_cull_decisions VALUES ('c-new','ws1','a1','keep','2026-06-22T09:00:00Z','2026-06-22T09:30:00Z')").run();
db.prepare("INSERT INTO workspace_plan VALUES ('ws1','studio_plus')").run();
// a row in ANOTHER workspace must never leak
db.prepare("INSERT INTO leads VALUES ('l-other','ws2','Other',0,'2026-06-22T10:00:00Z','2026-06-22T10:00:00Z',NULL)").run();

const app = express();
// x-member: a member limited to their own leads (view_all_leads off).
app.use((req, res, next) => { req.workspaceId = 'ws1'; req.userId = 'u1'; req.canViewAllLeads = !req.headers['x-member']; next(); });
sync(app, db, { auth: (req, res, next) => next() });

let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.error('  ✗', m); } else console.log('  ✓', m); };

(async () => {
  const srv = app.listen(0); await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const get = async (q, headers = {}) => (await fetch(base + '/api/workspace/sync' + q, { headers })).json();

  console.log('\n[1] Full sync (since epoch)');
  const full = await get('?since=1970-01-01T00:00:00Z');
  ok(full.changes.leads.length === 2, 'both ws1 leads returned');
  ok(!full.changes.leads.some(l => l.workspace_id === 'ws2'), 'other workspace never leaks');
  ok(full.changes.projects.length === 2 && full.changes.cull.length === 1, 'projects + cull synced');
  ok(full.plan && full.plan.plan === 'studio_plus', 'plan included');
  ok(typeof full.now === 'string' && full.schema_version === 1, 'returns now cursor + schema_version');

  console.log('\n[2] Incremental sync (since a mid cursor)');
  const inc = await get('?since=2026-06-01T00:00:00Z');
  ok(inc.changes.leads.length === 1 && inc.changes.leads[0].id === 'l-new', 'only rows after cursor (updated_at) returned');
  ok(inc.counts.leads === 1, 'counts reflect delta');

  console.log('\n[2b] A member limited to their own leads syncs only what hangs off them');
  const mine = await get('?since=1970-01-01T00:00:00Z', { 'x-member': '1' });
  ok(mine.changes.leads.length === 1 && mine.changes.leads[0].id === 'l-new', 'only the lead assigned to them');
  ok(mine.changes.projects.length === 1 && mine.changes.projects[0].id === 'p-new', "only their lead's project");
  ok(mine.changes.cull.length === 1, "their project's cull decisions still sync");

  console.log('\n[3] Up-to-date sync (since now → empty)');
  const none = await get('?since=2030-01-01T00:00:00Z');
  ok(none.changes.leads.length === 0 && none.more === false, 'no changes after a future cursor');

  console.log(`\n${fails === 0 ? '✅ ALL SYNC CHECKS PASSED' : '❌ ' + fails + ' FAILED'}\n`);
  // No db.close() here: closing better-sqlite3 inside the server-close callback trips a libuv teardown assertion on Windows, which made these suites exit non-zero AFTER printing PASS. The process is ending; the handle goes with it.
  // Let the loop drain instead of forcing process.exit(): tearing the process
  // down with the http server's handle still closing trips a libuv assertion on
  // Windows, which made this suite abort with a bogus exit code AFTER passing.
  process.exitCode = fails ? 1 : 0;
  try { srv.close(); } catch {}
  try { db.close(); } catch {}
})();
