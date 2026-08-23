'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Foundation Sprint · Batch 3 (mark-as-paid + ms-albums-schema) — BOOT-FREE.
//  (1) Live SQL: the invoice-payments backfill (workspace mapping via
//      users.workspace_id with auth-identical fallback, idempotency, tagging)
//      and the partial UNIQUE index that enforces one paid row per invoice.
//  (2) Live SQL: derived page_count (single source of truth) for albums.
//  (3) Static: single ms_albums DDL owner, studio-ai column writes removed,
//      index-before-backfill ordering, PUT delegation, UI repoint.
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

// ── (1) Money: backfill + index ───────────────────────────────────────────────
const db = new Database(':memory:');
db.exec(`
  CREATE TABLE users (id TEXT PRIMARY KEY, workspace_id TEXT);
  CREATE TABLE invoices (id TEXT PRIMARY KEY, user_id TEXT, lead_id TEXT, total REAL,
    currency TEXT, currency_symbol TEXT, status TEXT, created_at TEXT);
  CREATE TABLE payments (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, kind TEXT, ref_id TEXT,
    lead_id TEXT, amount REAL, currency TEXT DEFAULT 'USD', currency_symbol TEXT DEFAULT '$',
    description TEXT, status TEXT DEFAULT 'pending', provider TEXT DEFAULT 'manual', provider_ref TEXT,
    checkout_url TEXT, public_token TEXT UNIQUE, created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, paid_at TIMESTAMP);
  CREATE UNIQUE INDEX uq_payments_invoice_paid ON payments(workspace_id, kind, ref_id) WHERE status='paid' AND kind='invoice';
`);
db.exec(`
  INSERT INTO users VALUES ('u1','ws1'), ('u2',NULL);
  INSERT INTO invoices VALUES
    ('inv1','u1','lead1',5000,'PKR','Rs','paid','2026-01-10 10:00:00'),
    ('inv2','u1',NULL,100,'PKR','Rs','pending','2026-02-01 10:00:00'),
    ('inv3','u2',NULL,900,'PKR','Rs','paid','2026-03-05 10:00:00'),
    ('inv4','u1',NULL,700,'PKR','Rs','paid','2026-04-01 10:00:00');
  -- inv4 already has a real paid ledger row → backfill must skip it
  INSERT INTO payments (id, workspace_id, kind, ref_id, amount, status, provider)
    VALUES ('pre1','ws1','invoice','inv4',700,'paid','manual');
`);
const BACKFILL = `
  INSERT OR IGNORE INTO payments (id, workspace_id, kind, ref_id, lead_id, amount, currency, currency_symbol,
                                  description, status, provider, provider_ref, created_by, created_at, paid_at)
  SELECT lower(hex(randomblob(16))), COALESCE(u.workspace_id, i.user_id), 'invoice', i.id, i.lead_id, i.total,
         COALESCE(i.currency, 'USD'), COALESCE(i.currency_symbol, '$'),
         'Backfilled: invoice marked paid (pre-ledger)', 'paid', 'manual', 'backfill', i.user_id, i.created_at, i.created_at
  FROM invoices i LEFT JOIN users u ON u.id = i.user_id
  WHERE i.status = 'paid'
    AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.kind='invoice' AND p.ref_id=i.id AND p.status='paid')`;

const r1 = db.prepare(BACKFILL).run();
check('backfill inserts exactly the un-ledgered paid invoices (2 of 4)', () => assert.strictEqual(r1.changes, 2));
check('workspace mapped via users.workspace_id (inv1 → ws1)', () =>
  assert.strictEqual(db.prepare("SELECT workspace_id FROM payments WHERE ref_id='inv1' AND provider_ref='backfill'").get().workspace_id, 'ws1'));
check('auth-identical fallback: NULL workspace_id → user id (inv3 → u2)', () =>
  assert.strictEqual(db.prepare("SELECT workspace_id FROM payments WHERE ref_id='inv3'").get().workspace_id, 'u2'));
check('pending invoice not backfilled', () =>
  assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM payments WHERE ref_id='inv2'").get().c, 0));
check('already-ledgered invoice skipped (inv4 keeps 1 row)', () =>
  assert.strictEqual(db.prepare("SELECT COUNT(*) c FROM payments WHERE ref_id='inv4'").get().c, 1));
check('backfill rows tagged provider_ref=backfill + paid_at=created_at', () => {
  const p = db.prepare("SELECT provider_ref, paid_at FROM payments WHERE ref_id='inv1'").get();
  assert.strictEqual(p.provider_ref, 'backfill');
  assert.strictEqual(p.paid_at, '2026-01-10 10:00:00');
});
const r2 = db.prepare(BACKFILL).run();
check('backfill is idempotent (second run inserts 0)', () => assert.strictEqual(r2.changes, 0));
check('fan-out impossible: exactly one ledger row per paid invoice', () => {
  const dupes = db.prepare("SELECT ref_id, COUNT(*) c FROM payments WHERE kind='invoice' AND status='paid' GROUP BY ref_id HAVING c > 1").all();
  assert.strictEqual(dupes.length, 0);
});
check('partial UNIQUE index blocks a second paid row (mark-paid race)', () => {
  db.prepare("INSERT INTO payments (id, workspace_id, kind, ref_id, amount, status) VALUES ('race1','ws1','invoice','inv1',5000,'pending')").run();
  let uniq = false;
  try { db.prepare("UPDATE payments SET status='paid' WHERE id='race1'").run(); }
  catch (e) { uniq = String(e.message).includes('UNIQUE'); }
  assert(uniq, 'second paid row was allowed');
});
check('index still allows paid rows for non-invoice kinds', () => {
  db.prepare("INSERT INTO payments (id, workspace_id, kind, ref_id, amount, status) VALUES ('po1','ws1','print_order','inv1',50,'paid')").run();
});

// ── (2) Albums: derived page_count is the single truth ──────────────────────
db.exec(`
  CREATE TABLE ms_albums (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
    title TEXT, spec TEXT DEFAULT '{}', status TEXT DEFAULT 'draft', cover_asset_id TEXT,
    pdf_status TEXT DEFAULT 'none', pdf_storage_key TEXT, pdf_size INTEGER DEFAULT 0,
    pdf_pages INTEGER DEFAULT 0, pdf_built_at TIMESTAMP, created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE ms_album_pages (id TEXT PRIMARY KEY, album_id TEXT NOT NULL, page_no INTEGER DEFAULT 0,
    layout_template TEXT DEFAULT 'single', slots TEXT DEFAULT '[]', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
  INSERT INTO ms_albums (id, workspace_id, project_id, title, spec) VALUES
    ('alb1','ws1','proj1','Built', '{}'),
    ('alb2','ws1','proj1','AI draft', '{"pages":30,"spreads":[]}');
  INSERT INTO ms_album_pages (id, album_id) VALUES ('pg1','alb1'), ('pg2','alb1'), ('pg3','alb1');
`);
check('derived page_count: built album reports its real pages (3)', () =>
  assert.strictEqual(db.prepare(`SELECT (SELECT COUNT(*) FROM ms_album_pages p WHERE p.album_id = ms_albums.id) AS page_count FROM ms_albums WHERE id='alb1'`).get().page_count, 3));
check('derived page_count: spec-only AI draft reports 0 built pages', () =>
  assert.strictEqual(db.prepare(`SELECT (SELECT COUNT(*) FROM ms_album_pages p WHERE p.album_id = ms_albums.id) AS page_count FROM ms_albums WHERE id='alb2'`).get().page_count, 0));
check('studio-ai INSERT shape works against the canonical table (no page_count column)', () => {
  db.prepare('INSERT INTO ms_albums (id, workspace_id, project_id, title, spec) VALUES (?,?,?,?,?)')
    .run('alb3', 'ws1', 'proj1', 'New AI Album', '{"pages":20}');
});

// ── (3) Static source checks ──────────────────────────────────────────────────
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const srv = read('server.js'), pay = read('payments.js'), sai = read('studio-ai.js'), msd = read('media-studio.js');
const webApi = fs.readFileSync(path.join(__dirname, '..', 'wappflow-web', 'src', 'lib', 'api.js'), 'utf8');
const invPage = fs.readFileSync(path.join(__dirname, '..', 'wappflow-web', 'src', 'app', 'invoices', 'page.js'), 'utf8');

check('exactly ONE ms_albums DDL owner across the backend', () => {
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && !f.startsWith('test-'));
  const owners = files.filter(f => /CREATE TABLE IF NOT EXISTS ms_albums/.test(read(f)));
  assert.deepStrictEqual(owners, ['media-studio.js'], 'owners: ' + owners.join(','));
});
check('studio-ai never writes page_count (INSERT + UPDATE clean)', () => {
  assert(!/INSERT INTO ms_albums[^)]*page_count/.test(sai), 'INSERT still writes page_count');
  assert(!/set\.page_count/.test(sai), 'PUT still sets page_count');
});
check('page_count is derived live wherever albums are read', () => {
  // Originally this required studio-ai to derive page_count in two places. Phase 6
  // removed studio-ai's album read/list routes entirely (they served a second editor
  // whose page model nothing downstream could read), so the invariant now belongs to
  // media-studio, the sole reader. What must never come back is a stored page_count
  // column that can disagree with the actual pages.
  assert((msd.match(/SELECT COUNT\(\*\) FROM ms_album_pages/g) || []).length >= 1,
    'album reads no longer derive page_count from the page rows');
  assert(!/page_count (INTEGER|TEXT)/.test(msd + sai), 'page_count came back as a stored column');
  assert(!/app\.(get|put)\('\/api\/studio-ai\/albums/.test(sai), 'studio-ai album read/write routes returned');
});
check('studio-ai boot assertion guards DDL ownership', () =>
  assert(/ms_albums must be created by media-studio/.test(sai)));
check('media-studio healing ALTERs for canonical columns present', () =>
  assert(/ALTER TABLE ms_albums ADD COLUMN \$\{col\}/.test(msd) && /cover_asset_id TEXT/.test(msd)));
check('media-studio list query still derives live page_count (untouched)', () =>
  assert(/\(SELECT COUNT\(\*\) FROM ms_album_pages p WHERE p\.album_id = a\.id\) AS page_count/.test(msd)));

check('payments: partial UNIQUE index created BEFORE the backfill', () => {
  const idx = pay.indexOf('uq_payments_invoice_paid');
  const bf = pay.indexOf('Backfilled: invoice marked paid');
  assert(idx > -1 && bf > -1 && idx < bf, 'ordering wrong or missing');
});
check('payments: backfill marker-gated via payments_meta', () =>
  assert(/backfill_invoice_payments/.test(pay) && /payments_meta/.test(pay)));
check('payments: markPaidByInvoice pre-checks existing paid row + explicit workspace_id', () => {
  const h = pay.slice(pay.indexOf('function markPaidByInvoice'));
  assert(/status = 'paid'"\)\.get\(workspaceId, invoiceId\)/.test(h.slice(0, 800)), 'no idempotency pre-check');
  assert(/INSERT INTO payments \(id, workspace_id, kind/.test(h), 'workspace_id not explicit');
});
check('payments: UNIQUE race returns already instead of 500', () =>
  assert(/includes\('UNIQUE'\)/.test(pay.slice(pay.indexOf('function markPaidByInvoice')))));
check('payments: settle failure surfaced as warning + audited', () =>
  assert(/warning/.test(pay) && /logAudit\(workspaceId, userId, 'invoice_mark_paid'/.test(pay)));
check('payments: new invoice mark-paid route registered + module returns helper', () => {
  assert(/app\.post\('\/api\/payments\/invoice\/:invoiceId\/mark-paid', auth/.test(pay));
  // Assert the module HANDS OVER the helper, not the exact shape of the object -
  // this asserted a one-key literal and broke the moment a second export joined it.
  assert(/return \{[^}]*markPaidByInvoice[^}]*\}/.test(pay), 'markPaidByInvoice is no longer exported');
});
check('server: PUT /api/invoices/:id delegates paid (no direct paid write)', () => {
  const put = srv.slice(srv.indexOf("app.put('/api/invoices/:id'"), srv.indexOf("app.delete('/api/invoices/:id'"));
  assert(/wantsPaid/.test(put) && /writeStatus/.test(put), 'delegation logic missing');
  assert(/paymentsApi\.markPaidByInvoice/.test(put), 'no delegate call');
});
check('server: paymentsApi captured at mount with its required deps', () => {
  const mount = srv.slice(srv.indexOf("paymentsApi = require('./payments')"));
  assert(mount.startsWith("paymentsApi = require('./payments')"), 'payments mount not found');
  const deps = mount.slice(0, mount.indexOf('});'));
  // Assert the deps are PRESENT, not that they sit next to each other: the original
  // check required `logAudit, clientBaseUrl` to be adjacent, so adding `notify`
  // between them (Phase 5) failed a test about something else entirely.
  for (const d of ['logAudit', 'clientBaseUrl', 'notify']) {
    assert(new RegExp(`\\b${d}\\b`).test(deps), `payments mounted without ${d}`);
  }
});
check('web: paymentsAPI.markInvoicePaid exists and invoices page uses it', () => {
  assert(/markInvoicePaid: \(invoiceId, note\)/.test(webApi));
  assert(/paymentsAPI\.markInvoicePaid\(id\)/.test(invPage));
  assert(!/invoicesAPI\.update\(id, \{ status: 'paid' \}\)/.test(invPage), 'old bypass call still present');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
