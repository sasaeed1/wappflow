#!/usr/bin/env node
'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  grant-master.js — put an account's workspace on the top tier.
//
//    node grant-master.js you@example.com            # show what would change
//    node grant-master.js you@example.com --apply    # do it
//
//  Uses the existing `enterprise` plan rather than inventing a bypass: every
//  feature on, every limit -1 (unlimited). Enforcement keeps working normally,
//  it simply has nothing left to refuse — which means this account exercises the
//  SAME code path as a real customer, instead of a special case that hides bugs.
//
//  Deliberately a script, not an API route: nothing reachable over HTTP should be
//  able to hand out unlimited entitlements.
// ════════════════════════════════════════════════════════════════════════════
const path = require('path');
const Database = require('better-sqlite3');

const email = process.argv[2];
const apply = process.argv.includes('--apply');
const TIER = 'enterprise';

if (!email) {
  console.error('Usage: node grant-master.js <email> [--apply]');
  process.exit(1);
}

const DATA_DIR = process.env.NODE_ENV === 'production' ? '/data' : __dirname;
const dbPath = path.join(DATA_DIR, 'wappflow.db');
const db = new Database(dbPath);

const user = db.prepare('SELECT id, email, workspace_id FROM users WHERE lower(email) = lower(?)').get(email);
if (!user) {
  console.error(`✗ No user with email "${email}" in ${dbPath}`);
  const some = db.prepare('SELECT email FROM users ORDER BY created_at LIMIT 5').all().map(r => r.email);
  if (some.length) console.error('  Accounts present:', some.join(', '));
  else console.error('  This database has no users yet — register in the app first.');
  process.exit(1);
}
if (!user.workspace_id) {
  console.error('✗ That user has no workspace.');
  process.exit(1);
}

const ws = db.prepare('SELECT id, name FROM workspaces WHERE id = ?').get(user.workspace_id) || {};
const before = db.prepare('SELECT plan FROM workspace_plan WHERE workspace_id = ?').get(user.workspace_id);

console.log(`account   : ${user.email}`);
console.log(`workspace : ${ws.name || '(unnamed)'} [${user.workspace_id}]`);
console.log(`plan now  : ${before?.plan || '(none — treated as the default entry plan)'}`);
console.log(`plan after: ${TIER}`);

if (!apply) {
  console.log('\nDry run. Re-run with --apply to make the change.');
  process.exit(0);
}

db.prepare(`
  INSERT INTO workspace_plan (workspace_id, plan, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT (workspace_id) DO UPDATE SET plan = excluded.plan, updated_at = CURRENT_TIMESTAMP
`).run(user.workspace_id, TIER);

// The resolver caches entitlements for 30s in the running process; clearing the
// row it reads is not enough, so the API needs a restart to pick this up
// immediately (or you wait out the TTL).
const after = db.prepare('SELECT plan FROM workspace_plan WHERE workspace_id = ?').get(user.workspace_id);
console.log(`\n✓ Applied. Stored plan is now: ${after.plan}`);
console.log('  Restart the API so the cached entitlements refresh:');
console.log('    pm2 restart wappflow-api --update-env');
