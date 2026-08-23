'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 7 — the contact spine.
//
//  Winning a deal and becoming a client were two disconnected ideas, bridged
//  only by a manual "Move to Clients" click. Studios won deals and watched the
//  Clients list stay empty. And "lifetime revenue" summed actual_sale — a single
//  deal's value — so a repeat client's latest booking was reported as their
//  entire history with the studio.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const pg = require('./pagination');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SERVER = strip(read('server.js'));

check('winning a deal promotes the lead to a client', () => {
  const route = SERVER.slice(SERVER.indexOf("app.put('/api/leads/:id/status'"), SERVER.indexOf("app.put('/api/leads/:id/status'") + 2000);
  assert(/is_client = 1, client_since = COALESCE\(client_since, CURRENT_TIMESTAMP\)/.test(route),
    'Closed - Won does not make them a client');
  assert(/const wasClient/.test(route), 'it cannot tell a NEW client from a returning one');
});

check('a returning client is not announced as a new one', () => {
  const route = SERVER.slice(SERVER.indexOf("app.put('/api/leads/:id/status'"), SERVER.indexOf("app.put('/api/leads/:id/status'") + 2000);
  assert(/if \(status === 'Closed - Won' && !wasClient\)/.test(route), 'every won deal would announce a new client');
  assert(/COALESCE\(client_since/.test(route), 'client_since would reset on a repeat win');
});

check('bulk status behaves identically to the single route', () => {
  const bulk = SERVER.slice(SERVER.indexOf("app.post('/api/leads/bulk-status'"), SERVER.indexOf("app.post('/api/leads/bulk-status'") + 2000);
  assert(/is_client = 1, client_since = COALESCE\(client_since, CURRENT_TIMESTAMP\)/.test(bulk),
    'moving deals to Won in bulk does not promote them');
});

check('lifetime revenue comes from paid invoices, not one deal field', () => {
  assert(/AS lifetime_revenue/.test(SERVER), 'the leads query does not compute lifetime revenue');
  assert(/FROM invoices i[\s\S]{0,160}i\.status = 'paid'/.test(SERVER), 'it does not restrict to PAID invoices');
  const web = fs.readFileSync(path.join(__dirname, '..', 'wappflow-web', 'src', 'app', 'clients', 'page.js'), 'utf8');
  assert(/Number\(c\.lifetime_revenue\)/.test(web), 'the clients page still sums actual_sale');
});

// ── the revenue SQL, run for real ───────────────────────────────────────────
check('the revenue subquery sums only paid, non-deleted invoices for that contact', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, is_deleted INTEGER DEFAULT 0, is_client INTEGER DEFAULT 0);
    CREATE TABLE invoices (id TEXT PRIMARY KEY, lead_id TEXT, total REAL, status TEXT, is_deleted INTEGER DEFAULT 0);
    INSERT INTO leads VALUES ('L1','ws',0,1), ('L2','ws',0,1);
    INSERT INTO invoices VALUES
      ('i1','L1',100,'paid',0),
      ('i2','L1',250,'paid',0),
      ('i3','L1',999,'pending',0),   -- unpaid: not revenue
      ('i4','L1',500,'paid',1),      -- binned: not revenue
      ('i5','L2',70,'paid',0);
  `);
  const rows = db.prepare(`SELECT leads.id,
      (SELECT COALESCE(SUM(i.total), 0) FROM invoices i
        WHERE i.lead_id = leads.id AND i.status = 'paid'
          AND (i.is_deleted = 0 OR i.is_deleted IS NULL)) AS lifetime_revenue
      FROM leads WHERE workspace_id = ?`).all('ws');
  const byId = Object.fromEntries(rows.map(r => [r.id, r.lifetime_revenue]));
  assert.strictEqual(byId.L1, 350, 'expected 100+250, got ' + byId.L1);
  assert.strictEqual(byId.L2, 70);
  db.close();
});

check('pagination still counts the right table now that a subquery is in the SELECT', () => {
  // toCountSql took the FIRST FROM, which is now the subquery's. The count would
  // have been of invoices, not leads — silently, and only when ?limit was used.
  const q = "SELECT leads.*, (SELECT COALESCE(SUM(i.total),0) FROM invoices i WHERE i.lead_id = leads.id) AS lifetime_revenue FROM leads WHERE workspace_id = ? ORDER BY last_message_at DESC";
  const c = pg.toCountSql(q);
  assert(/^SELECT COUNT\(\*\) c FROM leads WHERE/.test(c), 'count built from the wrong FROM: ' + c.slice(0, 90));
  assert(!/ORDER BY/i.test(c), 'ORDER BY leaked into the count');
  assert.strictEqual(pg.toCountSql('SELECT * FROM leads WHERE x = ?').trim(), 'SELECT COUNT(*) c FROM leads WHERE x = ?');
});

const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
const webFile = (...q) => fs.readFileSync(path.join(WEB, ...q), 'utf8');

check('the contact page can start the next thing, not just invoice and email', () => {
  // Lead and client pages were dead ends. Every other module could be reached
  // only by leaving, creating a record, and hunting for the contact in a picker
  // - which is how the modules drifted into separate products sharing a login.
  const page = strip(webFile('app', 'leads', '[id]', 'page.js'));
  assert(/import ContactActions from/.test(page), 'the action hub is not imported');
  assert(/<ContactActions[^>]*lead=\{lead\}/.test(page), 'the action hub is not mounted with the contact');
});

check('everything the hub creates is stamped with the contact it was started from', () => {
  const hub = strip(webFile('components', 'ContactActions.js'));
  assert(/csAPI\.create\(\{ lead_id: lead\.id/.test(hub), 'a contract would be created unlinked');
  assert(/mediaAPI\.createProject\(\{ lead_id: lead\.id/.test(hub), 'a shoot would be created unlinked');
  assert(/clientPortalAPI\.link\(lead\.id\)/.test(hub), 'the portal link is not for this contact');
});

check('the copied portal link works when pasted somewhere else', () => {
  // The server builds it from FRONTEND_URL, which falls back to ''. A bare
  // /client/<token> is dead the moment it lands in WhatsApp.
  const hub = strip(webFile('components', 'ContactActions.js'));
  assert(/window\.location\.origin/.test(hub), 'a relative portal link would be copied verbatim');
  assert(/clipboard\.writeText/.test(hub), 'the link is shown but never copied - copying IS the action');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
