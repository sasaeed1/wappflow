#!/usr/bin/env node
'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  backup — take a consistent, VERIFIED copy of everything that cannot be rebuilt.
//
//  Production had no backups at all. DEPLOYMENT.md documented a cron job at
//  /etc/cron.daily/wappflow-backup; it was never installed, /var/backups held
//  nothing but a system file, and the entire business — every client, contract,
//  invoice and photograph — existed in exactly one place on one disk.
//
//  WHY NOT `cp wappflow.db`:
//  SQLite runs in WAL mode here, and on the live box the WAL is currently 4MB
//  against a 1.7MB database. A file copy takes the database WITHOUT the write-ahead
//  log, so it silently loses every commit since the last checkpoint — and the copy
//  still opens cleanly, so nobody notices until they restore it. This uses
//  better-sqlite3's backup API, which is the same online-backup mechanism the
//  sqlite3 CLI's `.backup` uses: consistent, safe while the server is writing, and
//  requiring no external binary (sqlite3 is not installed on this box).
//
//  WHY IT VERIFIES:
//  An unverified backup is a hope. Every run re-opens what it just wrote, runs
//  PRAGMA integrity_check, and compares row counts against the source. A backup
//  that fails verification is deleted rather than left to be trusted later.
//
//  Usage:
//    node backup.js                 # take one, verify, prune old ones
//    node backup.js --verify-only <file>
//    node backup.js --list
// ════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/data' : __dirname);
const DB_PATH = path.join(DATA_DIR, 'wappflow.db');
const UPLOADS = path.join(DATA_DIR, 'uploads');
const DEST = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');

const KEEP_DAILY = Number(process.env.BACKUP_KEEP_DAILY) || 14;
const KEEP_WEEKLY = Number(process.env.BACKUP_KEEP_WEEKLY) || 8;

// Tables whose row counts are compared source-vs-copy. Chosen because losing any
// of them is unrecoverable: they are the business, not derived state.
const CRITICAL = ['users', 'workspaces', 'leads', 'messages', 'invoices', 'payments',
                  'cs_documents', 'cs_signers', 'ms_projects', 'ms_assets', 'ms_galleries',
                  'bookings', 'activity_timeline', 'contact_history'];

const log = (...a) => console.log(...a);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function counts(dbPath) {
  const db = new Database(dbPath, { readonly: true });
  const out = {};
  for (const t of CRITICAL) {
    try { out[t] = db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n; } catch { out[t] = null; }
  }
  db.close();
  return out;
}

/** Open a backup and prove it is usable. Returns a list of problems (empty = good). */
function verify(backupPath, expected) {
  const problems = [];
  let db;
  try {
    db = new Database(backupPath, { readonly: true });
  } catch (e) {
    return [`cannot open the backup at all: ${e.message}`];
  }
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get();
    const verdict = integrity && (integrity.integrity_check || Object.values(integrity)[0]);
    if (String(verdict).toLowerCase() !== 'ok') problems.push(`integrity_check said: ${verdict}`);
  } catch (e) {
    problems.push(`integrity_check failed: ${e.message}`);
  }
  if (expected) {
    for (const [t, n] of Object.entries(expected)) {
      if (n === null) continue;
      let got = null;
      try { got = db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n; } catch { got = null; }
      // The source may gain rows WHILE the backup runs, so the copy having fewer
      // is normal; having MORE, or missing the table, is not.
      if (got === null) problems.push(`table ${t} is missing from the backup`);
      else if (got > n) problems.push(`${t}: backup has ${got} rows, source had ${n}`);
    }
  }
  db.close();
  return problems;
}

function prune() {
  if (!fs.existsSync(DEST)) return;
  const files = fs.readdirSync(DEST).filter((f) => f.startsWith('wappflow-') && f.endsWith('.db'))
    .map((f) => ({ f, t: fs.statSync(path.join(DEST, f)).mtime.getTime() }))
    .sort((a, b) => b.t - a.t);

  const keep = new Set();
  files.slice(0, KEEP_DAILY).forEach((x) => keep.add(x.f));
  // Then one per ISO week, oldest-surviving-wins, up to KEEP_WEEKLY weeks.
  const weeks = new Map();
  for (const x of files) {
    const d = new Date(x.t);
    const wk = `${d.getUTCFullYear()}-W${Math.floor((d.getUTCDate() + 6) / 7)}-${d.getUTCMonth()}`;
    if (!weeks.has(wk)) weeks.set(wk, x.f);
  }
  [...weeks.values()].slice(0, KEEP_WEEKLY).forEach((f) => keep.add(f));

  let removed = 0, blocked = 0;
  for (const { f } of files) {
    if (keep.has(f)) continue;
    try {
      fs.unlinkSync(path.join(DEST, f));
      const tar = path.join(DEST, f.replace(/\.db$/, '-uploads.tar.gz'));
      if (fs.existsSync(tar)) fs.unlinkSync(tar);
      removed++;
    } catch { blocked++; }
  }
  if (removed) log(`  pruned ${removed} old backup(s)`);
  // A prune that silently cannot delete fills the disk, and a full disk makes the
  // NEXT backup fail — at which point there is no backup and no warning either.
  // (This is exactly what happens if some runs are root-owned and others are not.)
  if (blocked) console.error(`  ! could not delete ${blocked} old backup(s) — check ownership of ${DEST}`);
}

function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--list') {
    if (!fs.existsSync(DEST)) return log('no backups yet');
    for (const f of fs.readdirSync(DEST).sort().reverse()) {
      const s = fs.statSync(path.join(DEST, f));
      log(`  ${f}  ${(s.size / 1048576).toFixed(1)}MB  ${s.mtime.toISOString()}`);
    }
    return;
  }

  if (args[0] === '--verify-only') {
    const target = args[1];
    if (!target || !fs.existsSync(target)) { console.error('give a backup file to verify'); process.exitCode = 1; return; }
    const problems = verify(target, null);
    // Opening it to check it creates -wal/-shm beside it; tidy up so a verify does
    // not leave litter in the backup directory.
    for (const sfx of ['-wal', '-shm']) { try { fs.unlinkSync(target + sfx); } catch {} }
    if (problems.length) { console.error('✗ NOT USABLE:\n  ' + problems.join('\n  ')); process.exitCode = 1; }
    else log('✓ verified: opens cleanly and passes integrity_check');
    return;
  }

  if (!fs.existsSync(DB_PATH)) { console.error(`no database at ${DB_PATH}`); process.exitCode = 1; return; }
  fs.mkdirSync(DEST, { recursive: true });

  const when = stamp();
  const target = path.join(DEST, `wappflow-${when}.db`);
  log(`backup → ${target}`);

  const before = counts(DB_PATH);
  const src = new Database(DB_PATH, { readonly: true });

  // The online backup API. Safe while the server is mid-write, and it folds the
  // WAL in — which a file copy does not.
  src.backup(target)
    .then(() => {
      src.close();
      const problems = verify(target, before);
      if (problems.length) {
        console.error('✗ BACKUP FAILED VERIFICATION — deleting it rather than pretending it is safe:');
        for (const p of problems) console.error('   ' + p);
        try { fs.unlinkSync(target); } catch {}
        process.exitCode = 1;
        return;
      }
      // Opening the copy to verify it creates -wal/-shm siblings. Leave them and
      // the backup directory fills with files a restore must know to ignore.
      for (const sfx of ['-wal', '-shm']) { try { fs.unlinkSync(target + sfx); } catch {} }
      const size = fs.statSync(target).size;
      log(`  ✓ database ${(size / 1048576).toFixed(2)}MB — opens, passes integrity_check, row counts match`);

      // Uploads: the photographs. Losing the database loses the business; losing
      // these loses the client's wedding, which is worse.
      if (fs.existsSync(UPLOADS)) {
        const tar = path.join(DEST, `wappflow-${when}-uploads.tar.gz`);
        try {
          // Run FROM the data dir with relative paths. GNU tar reads a leading
          // "C:" as a remote host and tries to ssh to it, so an absolute Windows
          // path fails outright — and this script has to be runnable wherever a
          // developer verifies it, not only on the Linux box.
          const rel = path.relative(DATA_DIR, tar).split(path.sep).join('/');
          execFileSync('tar', ['-czf', rel, 'uploads'], { cwd: DATA_DIR, stdio: 'pipe' });
          log(`  ✓ uploads  ${(fs.statSync(tar).size / 1048576).toFixed(1)}MB`);
        } catch (e) {
          console.error(`  ! uploads archive failed: ${e.message}`);
          process.exitCode = 1;
        }
      }

      prune();
      log('done');
    })
    .catch((e) => {
      try { src.close(); } catch {}
      console.error('✗ backup failed:', e.message);
      process.exitCode = 1;
    });
}

main();
