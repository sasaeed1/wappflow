'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  BACKUP & RESTORE — proving the thing that only matters on the worst day.
//
//  Production had NO backups. The procedure in DEPLOYMENT.md was never installed,
//  so every client, contract, invoice and photograph existed in exactly one place
//  on one disk.
//
//  A backup nobody has restored is not a backup, it is a belief. So this does the
//  whole loop against a real database: write data, back it up, DESTROY the
//  original, restore from the copy, and check the data is actually there.
//
//  It also pins the trap that makes naive backups worthless here: SQLite is in
//  WAL mode, and on the live box the write-ahead log is currently LARGER than the
//  database. A plain file copy takes the .db and leaves the WAL behind, silently
//  losing every commit since the last checkpoint — and the copy still opens
//  cleanly, so the loss is invisible until somebody needs it.
//
//  Run: node test-backup-restore.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  OK  ', n); pass++; } catch (e) { console.log('  FAIL', n, '-', e.message || e); fail++; } };

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-backup-'));
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(DATA, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const DB = path.join(DATA, 'wappflow.db');

// ── A database that looks like the real one: WAL mode, real tables, real rows ──
function seed() {
  const db = new Database(DB);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, password TEXT);
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, customer_name TEXT);
    CREATE TABLE messages (id TEXT PRIMARY KEY, lead_id TEXT, body TEXT);
    CREATE TABLE invoices (id TEXT PRIMARY KEY, workspace_id TEXT, total REAL);
    CREATE TABLE payments (id TEXT PRIMARY KEY, workspace_id TEXT, amount REAL);
    CREATE TABLE cs_documents (id TEXT PRIMARY KEY, workspace_id TEXT, title TEXT);
    CREATE TABLE cs_signers (id TEXT PRIMARY KEY, document_id TEXT);
    CREATE TABLE ms_projects (id TEXT PRIMARY KEY, workspace_id TEXT, title TEXT);
    CREATE TABLE ms_assets (id TEXT PRIMARY KEY, workspace_id TEXT, filename TEXT);
    CREATE TABLE ms_galleries (id TEXT PRIMARY KEY, workspace_id TEXT, title TEXT);
    CREATE TABLE bookings (id TEXT PRIMARY KEY, workspace_id TEXT, service TEXT);
    CREATE TABLE activity_timeline (id TEXT PRIMARY KEY, lead_id TEXT, title TEXT);
    CREATE TABLE contact_history (id TEXT PRIMARY KEY, lead_id TEXT, description TEXT);
  `);
  db.prepare('INSERT INTO users VALUES (?,?,?)').run('u1', 'owner@studio.test', 'hash');
  db.prepare('INSERT INTO workspaces VALUES (?,?)').run('ws1', 'Rehmat Studios');
  const ins = db.prepare('INSERT INTO leads VALUES (?,?,?)');
  for (let i = 0; i < 500; i++) ins.run('l' + i, 'ws1', 'Client ' + i);
  db.prepare('INSERT INTO invoices VALUES (?,?,?)').run('i1', 'ws1', 200000);
  db.prepare('INSERT INTO cs_documents VALUES (?,?,?)').run('d1', 'ws1', 'Wedding Agreement');
  return db;
}

let db = seed();
fs.writeFileSync(path.join(UPLOADS, 'wedding-001.jpg'), Buffer.alloc(2048, 7));
fs.writeFileSync(path.join(UPLOADS, 'wedding-002.jpg'), Buffer.alloc(2048, 9));

// Commits that are still in the WAL, deliberately NOT checkpointed — exactly the
// state the live box is in right now.
const late = db.prepare('INSERT INTO leads VALUES (?,?,?)');
for (let i = 500; i < 700; i++) late.run('l' + i, 'ws1', 'Late Client ' + i);
db.prepare('INSERT INTO payments VALUES (?,?,?)').run('p1', 'ws1', 200000);

const walSize = fs.existsSync(DB + '-wal') ? fs.statSync(DB + '-wal').size : 0;

check('the fixture reproduces the live shape: a WAL holding uncheckpointed commits', () => {
  assert(walSize > 0, 'no WAL — this test would not be testing the real hazard');
  const n = db.prepare('SELECT COUNT(*) n FROM leads').get().n;
  assert.strictEqual(n, 700, 'the fixture did not write what it thought');
});

check('THE TRAP: a plain file copy silently loses the WAL', () => {
  // This is why "just cp the .db" is not a backup. The copy OPENS FINE, which is
  // what makes it dangerous: nobody discovers the loss until they need the data.
  const naive = path.join(ROOT, 'naive-copy.db');
  fs.copyFileSync(DB, naive);
  const c = new Database(naive, { readonly: true });
  const n = c.prepare('SELECT COUNT(*) n FROM leads').get().n;
  const pays = c.prepare('SELECT COUNT(*) n FROM payments').get().n;
  c.close();
  assert(n < 700 || pays < 1,
    `a plain copy captured everything, so this box is checkpointing eagerly — the hazard is real elsewhere (leads ${n}, payments ${pays})`);
  console.log(`         (the naive copy has ${n}/700 leads and ${pays}/1 payments — that is the data that would be lost)`);
});

// ── The real backup ─────────────────────────────────────────────────────────
check('the backup script runs and reports success', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, 'backup.js')], {
    env: { ...process.env, DATA_DIR: DATA, NODE_ENV: 'test' },
    encoding: 'utf8',
  });
  assert(/done/.test(out), 'the backup did not finish: ' + out);
  assert(/row counts match/.test(out), 'the backup did not verify itself: ' + out);
});

const backupsDir = path.join(DATA, 'backups');
const dbBackup = () => fs.readdirSync(backupsDir).filter((f) => f.endsWith('.db')).sort().pop();

check('it produced a database copy AND an uploads archive', () => {
  const files = fs.readdirSync(backupsDir);
  assert(files.some((f) => f.endsWith('.db')), 'no database backup: ' + files.join(', '));
  assert(files.some((f) => f.endsWith('-uploads.tar.gz')), 'the photographs were not backed up: ' + files.join(', '));
});

check('the backup contains the commits the naive copy lost', () => {
  // The whole point: the online backup API folds the WAL in.
  const b = new Database(path.join(backupsDir, dbBackup()), { readonly: true });
  const n = b.prepare('SELECT COUNT(*) n FROM leads').get().n;
  const pays = b.prepare('SELECT COUNT(*) n FROM payments').get().n;
  b.close();
  assert.strictEqual(n, 700, `the backup lost data: ${n}/700 leads`);
  assert.strictEqual(pays, 1, 'the backup lost the payment');
});

check('the backup passes its own verifier', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, 'backup.js'), '--verify-only', path.join(backupsDir, dbBackup())], { encoding: 'utf8' });
  assert(/verified/.test(out), 'verification did not pass: ' + out);
});

check('a CORRUPT backup is detected, not trusted', () => {
  // An unverified backup is a hope. Prove the verifier actually rejects.
  const bad = path.join(ROOT, 'corrupt.db');
  fs.copyFileSync(path.join(backupsDir, dbBackup()), bad);
  const fd = fs.openSync(bad, 'r+');
  fs.writeSync(fd, Buffer.alloc(4096, 0xff), 0, 4096, 8192);   // scribble over a page
  fs.closeSync(fd);
  let failed = false;
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'backup.js'), '--verify-only', bad], { encoding: 'utf8', stdio: 'pipe' });
  } catch { failed = true; }
  assert(failed, 'a corrupted database passed verification');
});

// ── THE RESTORE. This is the part nobody ever tests. ────────────────────────
check('DISASTER: the database and the photographs are destroyed', () => {
  db.close();
  for (const f of [DB, DB + '-wal', DB + '-shm']) { try { fs.unlinkSync(f); } catch {} }
  fs.rmSync(UPLOADS, { recursive: true, force: true });
  assert(!fs.existsSync(DB), 'the database is still there — the test is not testing a restore');
  assert(!fs.existsSync(UPLOADS), 'the uploads are still there');
});

check('restoring brings the business back, to the row', () => {
  // The documented procedure, executed: copy the backup into place, unpack uploads.
  fs.copyFileSync(path.join(backupsDir, dbBackup()), DB);
  // Same reason as the backup side: run from the data dir with a relative path.
  const tarRel = path.relative(DATA, path.join(backupsDir, dbBackup().replace(/\.db$/, '-uploads.tar.gz'))).split(path.sep).join('/');
  execFileSync('tar', ['-xzf', tarRel], { cwd: DATA });

  const r = new Database(DB, { readonly: true });
  assert.strictEqual(r.prepare('SELECT COUNT(*) n FROM leads').get().n, 700, 'clients are missing after the restore');
  assert.strictEqual(r.prepare('SELECT COUNT(*) n FROM payments').get().n, 1, 'money records are missing');
  assert.strictEqual(r.prepare('SELECT name FROM workspaces WHERE id = ?').get('ws1').name, 'Rehmat Studios', 'the workspace is wrong');
  assert.strictEqual(r.prepare('SELECT title FROM cs_documents WHERE id = ?').get('d1').title, 'Wedding Agreement', 'the contract is wrong');
  r.close();

  assert(fs.existsSync(path.join(UPLOADS, 'wedding-001.jpg')), 'the photographs did not come back');
  assert.strictEqual(fs.statSync(path.join(UPLOADS, 'wedding-002.jpg')).size, 2048, 'a photograph came back the wrong size');
});

check('the restored database is WRITEABLE, not just readable', () => {
  // A restore that yields a read-only or locked database has not restored service.
  const w = new Database(DB);
  w.prepare('INSERT INTO leads VALUES (?,?,?)').run('post-restore', 'ws1', 'New Client After Restore');
  assert.strictEqual(w.prepare('SELECT COUNT(*) n FROM leads').get().n, 701, 'cannot write after restoring');
  w.close();
});

check('retention keeps recent backups and prunes the rest', () => {
  // Otherwise the disk fills and backups start failing at exactly the wrong moment.
  const src = path.join(backupsDir, dbBackup());
  for (let i = 0; i < 25; i++) {
    const f = path.join(backupsDir, `wappflow-2020-01-${String(i + 1).padStart(2, '0')}T00-00-00.db`);
    fs.copyFileSync(src, f);
    const old = new Date(Date.now() - (i + 30) * 86400000);
    fs.utimesSync(f, old, old);
  }
  execFileSync(process.execPath, [path.join(__dirname, 'backup.js')], {
    env: { ...process.env, DATA_DIR: DATA, NODE_ENV: 'test' }, encoding: 'utf8',
  });
  const left = fs.readdirSync(backupsDir).filter((f) => f.endsWith('.db')).length;
  assert(left < 26, `retention did not prune: ${left} backups remain`);
  assert(left >= 1, 'retention pruned everything');
});

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {}

console.log(`\n${fail === 0 ? '✅ BACKUP AND RESTORE BOTH WORK' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
