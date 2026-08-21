'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 4 Batch 2 — opt-in pagination. Exercised against a REAL SQLite so the
//  SQL, the counts and the hasMore arithmetic are proven, not assumed.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const pg = require('./pagination');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };
const SERVER = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const CONTRACTS = fs.readFileSync(path.join(__dirname, 'contracts-studio.js'), 'utf8');

const db = new Database(':memory:');
db.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, name TEXT, last_message_at TEXT)`);
const ins = db.prepare(`INSERT INTO leads (id, workspace_id, name, last_message_at) VALUES (?,?,?,?)`);
for (let i = 0; i < 137; i++) ins.run(`L${String(i).padStart(3, '0')}`, 'ws1', `Lead ${i}`, `2026-01-${String((i % 28) + 1).padStart(2, '0')}`);
ins.run('OTHER', 'ws2', 'Other tenant', '2026-01-01');

const SQL = `SELECT * FROM leads WHERE workspace_id = ? ORDER BY id ASC`;
const q = (search) => pg.pageParams({ query: search });

check('no ?limit → not paginated, so existing callers are untouched', () => {
  assert.strictEqual(q({}), null);
  assert.strictEqual(q({ limit: '' }), null);
});

check('limit is clamped so a client cannot ask for the whole table', () => {
  assert.strictEqual(q({ limit: '999999' }).limit, pg.MAX_LIMIT);
  assert.strictEqual(q({ limit: '50' }).limit, 50);
});

check('junk and hostile paging input degrade to sane values, never throw', () => {
  assert.strictEqual(q({ limit: 'abc' }).limit, 50);
  assert.strictEqual(q({ limit: '-5' }).limit, 50);
  assert.strictEqual(q({ limit: '10', offset: '-100' }).offset, 0);
  assert.strictEqual(q({ limit: '10', offset: 'xyz' }).offset, 0);
});

check('paging returns the right slice, a correct total, and honest hasMore', () => {
  const p1 = pg.paginate(db, { sql: SQL, countSql: pg.toCountSql(SQL), params: ['ws1'], page: { limit: 50, offset: 0 } });
  assert.strictEqual(p1.total, 137, 'total must count ALL matching rows, not the page');
  assert.strictEqual(p1.items.length, 50);
  assert.strictEqual(p1.items[0].id, 'L000');
  assert.strictEqual(p1.hasMore, true);

  const p3 = pg.paginate(db, { sql: SQL, countSql: pg.toCountSql(SQL), params: ['ws1'], page: { limit: 50, offset: 100 } });
  assert.strictEqual(p3.items.length, 37, 'last page should be the remainder');
  assert.strictEqual(p3.hasMore, false, 'hasMore must be false on the final page');
});

check('paging never leaks across workspaces', () => {
  const p = pg.paginate(db, { sql: SQL, countSql: pg.toCountSql(SQL), params: ['ws1'], page: { limit: 500, offset: 0 } });
  assert.strictEqual(p.total, 137, 'another tenant’s row was counted');
  assert(!p.items.some((r) => r.id === 'OTHER'), 'another tenant’s row was returned');
});

check('an offset past the end returns empty rather than erroring', () => {
  const p = pg.paginate(db, { sql: SQL, countSql: pg.toCountSql(SQL), params: ['ws1'], page: { limit: 50, offset: 5000 } });
  assert.strictEqual(p.items.length, 0);
  assert.strictEqual(p.hasMore, false);
});

check('toCountSql strips ORDER BY and preserves the WHERE clause', () => {
  const c = pg.toCountSql(SQL);
  assert(/^SELECT COUNT\(\*\) c FROM leads WHERE workspace_id = \?/.test(c), 'bad count sql: ' + c);
  assert(!/ORDER BY/i.test(c), 'ORDER BY leaked into the count');
  assert.strictEqual(db.prepare(c).get('ws1').c, 137);
});

check('core list endpoints accept paging but keep their previous shape by default', () => {
  // leads
  assert(/pagination\.pageParams\(req\)/.test(SERVER), 'leads endpoint does not read paging params');
  assert(/res\.json\(page$/m.test(SERVER) || /res\.json\(page\s/.test(SERVER), 'leads response not conditional on paging');
  assert(/\{ leads: enriched \}/.test(SERVER), 'the unpaginated leads shape changed — existing callers would break');
  // invoices
  assert(/return res\.json\(\{ invoices: db\.prepare\(sql\)\.all\(\.\.\.params\)\.map\(parseInvoice\) \}\)/.test(SERVER),
    'the unpaginated invoices shape changed');
  // contracts
  assert(/pagination\.pageParams\(req\)/.test(CONTRACTS), 'contracts endpoint does not read paging params');
  assert(/return res\.json\(\{ documents:/.test(CONTRACTS), 'the unpaginated contracts shape changed');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
